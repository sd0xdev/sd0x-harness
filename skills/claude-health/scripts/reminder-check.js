#!/usr/bin/env node
'use strict';

// On-demand check of the reminder hooks: runs the loaded plugin's own hooks on synthetic cases in a
// throwaway project with its own HOME, and reports needed / emitted / routed / received / seen / acted on apart.
// Reads no transcript, no project file and no review state. Design: docs/features/hook-reminder-value/2-tech-spec.md.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = {
  prompt: { file: 'hooks/user-prompt-review-guard.sh', event: 'UserPromptSubmit', review: true },
  stop: { file: 'hooks/stop-guard.sh', event: 'Stop', review: true },
  skill: { file: 'hooks/post-skill-auto-loop.sh', event: 'PostToolUse', review: true },
  compact: { file: 'hooks/post-compact-auto-loop.sh', event: 'SessionStart', review: true },
  namespace: { file: 'scripts/namespace-hint.sh', event: 'SessionStart', review: false },
};
// Where the host documents that plain output goes to the model. A route, not receipt: no run here observes
// what a model received.
const DOCS = 'https://code.claude.com/docs/en/hooks';
const ROUTED = { UserPromptSubmit: 'documented', SessionStart: 'documented', Stop: 'not documented', PostToolUse: 'not documented' };
const PLANES = ['code_review', 'doc_review', 'precommit'];

function die(msg) {
  process.stderr.write(`reminder-check: ${msg}\n`);
  process.exit(2);
}

function parse(argv) {
  const o = { seen: {}, format: 'md' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--format=')) o.format = a.slice(9);
    else if (['--plugin-root', '--seen', '--formatter'].includes(a)) {
      const v = argv[++i];
      if (v === undefined) die(`${a} needs a value`);
      if (a === '--plugin-root') o.root = v;
      else if (a === '--formatter') o.formatter = v;
      else {
        const [hook, said] = v.split('=');
        if (!HOOKS[hook] || !['yes', 'no', 'unknown'].includes(said)) die(`--seen takes <${Object.keys(HOOKS).join('|')}>=<yes|no|unknown>`);
        o.seen[hook] = said;
      }
    } else die(`unknown argument "${a}"`);
  }
  if (!['md', 'json'].includes(o.format)) die('--format is md or json');
  o.root = path.resolve(o.root || process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../../..'));
  if (!fs.existsSync(path.join(o.root, 'hooks/hooks.json'))) die('no plugin hooks under the plugin root');
  return o;
}

// A minimal environment: nothing of the user's session reaches the hooks.
function envFor(box, extra = {}) {
  return { PATH: process.env.PATH, LANG: process.env.LANG || 'C.UTF-8', HOME: box.home, TMPDIR: box.dir, CLAUDE_PROJECT_DIR: box.project, CLAUDE_PLUGIN_ROOT: box.root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...extra };
}

function makeBox(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-check-'));
  const box = { dir, root, home: path.join(dir, 'home'), project: path.join(dir, 'project') };
  fs.mkdirSync(box.home);
  fs.mkdirSync(box.project);
  const r = spawnSync('git', ['init', '-q', box.project], { env: envFor(box), encoding: 'utf8' });
  if (r.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); die('git init failed in the throwaway project'); }
  return box;
}

const edit = (box, name, text) => fs.writeFileSync(path.join(box.project, name), text);

function fire(box, hook, extra) {
  const started = Date.now();
  const r = spawnSync('/bin/bash', [path.join(box.root, HOOKS[hook].file)], {
    cwd: box.project, env: envFor(box, extra), input: JSON.stringify({ session_id: 'reminder-check', tool_input: {} }), encoding: 'utf8', timeout: 60000,
  });
  return { out: r.stdout || '', code: r.status, ms: Date.now() - started };
}

function state(box, ...args) {
  return spawnSync(process.execPath, [path.join(box.root, 'scripts/review-state.js'), ...args], { cwd: box.project, env: envFor(box), encoding: 'utf8' });
}
const passAll = (box) => PLANES.forEach((p) => state(box, 'note', p, 'pass'));

const owed = (out) => /📋/.test(out);
// A code edit owes both gates; a line for one does not stand for the other.
const owesCode = (out) => ['code_review', 'precommit'].every((p) => new RegExp(`📋 ${p}`).test(out));

// Each case builds its own state. `needed` says whether a reminder is owed there; `holds` is the
// expectation over the outputs. A miss is a needed reminder that did not hold; a false one is the reverse.
const CASES = [
  { id: 'edited', title: 'Code edited, nothing recorded', needed: true, hooks: ['prompt', 'stop'],
    setup: (b) => edit(b, 'a.js', 'const a = 1;\n'),
    holds: (o) => /change=code/.test(o.prompt) && /code_review:none/.test(o.prompt) && /precommit:none/.test(o.prompt) && owesCode(o.stop) },
  { id: 'repeated', title: 'The same, next turn, nothing new', needed: false, hooks: ['prompt', 'stop'], repeat: true,
    setup: (b) => edit(b, 'a.js', 'const a = 1;\n'),
    restores: 'the state after a compaction, and for a reader who missed it' },
  { id: 'passed', title: 'Every gate passed at this content', needed: false, hooks: ['prompt', 'stop'],
    setup: (b) => { edit(b, 'a.js', 'const a = 1;\n'); passAll(b); },
    holds: (o) => !owed(o.stop) && /code_review:pass/.test(o.prompt) },
  { id: 'reopened', title: 'Edited again after the pass', needed: true, hooks: ['prompt', 'stop'],
    setup: (b) => { edit(b, 'a.js', 'const a = 1;\n'); passAll(b); edit(b, 'a.js', 'const a = 2;\n'); },
    holds: (o) => /code_review:stale/.test(o.prompt) && /precommit:stale/.test(o.prompt) && owesCode(o.stop) },
  { id: 'five-turns', title: 'A gate owed across five unrelated turns, then a compaction', needed: true, hooks: ['stop', 'compact'], times: 5,
    setup: (b) => edit(b, 'a.js', 'const a = 1;\n'),
    holds: (o) => owesCode(o.stop) && owesCode(o.compact) },
  { id: 'compaction', title: 'Compaction with a gate open', needed: true, hooks: ['compact', 'namespace'],
    setup: (b) => edit(b, 'a.js', 'const a = 1;\n'),
    holds: (o) => /a\.js/.test(o.compact) && owesCode(o.compact) && /Plugin root:/.test(o.namespace) },
  { id: 'nothing', title: 'Nothing changed', needed: false, hooks: ['prompt', 'stop'],
    setup: () => {},
    holds: (o) => !owed(o.stop) && /change=none/.test(o.prompt) },
  { id: 'unreadable', title: 'The state cannot be read', needed: true, hooks: ['prompt', 'stop'],
    setup: (b) => { edit(b, 'a.js', 'const a = 1;\n'); fs.writeFileSync(path.join(b.project, '.git/index'), 'not an index'); },
    // Silence is not "unknown": at least one reminder has to say the state could not be read.
    holds: (o) => !/change=none/.test(o.prompt) && !/🟢/.test(o.stop) && (/change=unknown|unverified=/.test(o.prompt) || /讀取不完整/.test(o.stop)) },
  { id: 'menu-shown', title: 'The commit menu marked as shown, content unchanged', needed: false, hooks: ['stop'],
    setup: (b) => {
      edit(b, 'a.js', 'const a = 1;\n');
      passAll(b);
      b.before = fire(b, 'stop').out;
      const { digest } = JSON.parse(state(b, 'offer', '--format=json').stdout);
      state(b, 'offer-shown', digest);
    },
    holds: (o, b) => /🟢/.test(b.before) && !/🟢/.test(o.stop) },
  { id: 'skill', title: 'After a Skill', needed: false, hooks: ['skill'], repeat: true,
    setup: () => {}, restores: 'nothing: the line is fixed and knows no state' },
  { id: 'bypass', title: 'HOOK_BYPASS set by the user', needed: false, hooks: Object.keys(HOOKS), env: { HOOK_BYPASS: '1' },
    setup: (b) => edit(b, 'a.js', 'const a = 1;\n'),
    holds: (o) => ['prompt', 'stop', 'skill', 'compact'].every((h) => o[h] === '') && /Plugin root:/.test(o.namespace) },
];

function runCase(c, root) {
  const box = makeBox(root);
  try {
    c.setup(box);
    const runs = {};
    for (const h of c.hooks) {
      const times = c.repeat ? 2 : h === 'stop' && c.times ? c.times : 1;
      runs[h] = Array.from({ length: times }, () => fire(box, h, c.env));
    }
    const out = Object.fromEntries(Object.entries(runs).map(([h, rs]) => [h, rs[rs.length - 1].out]));
    const exits = Object.values(runs).flat().map((r) => r.code);
    const held = c.holds ? c.holds(out, box) : true;
    const same = Object.fromEntries(Object.entries(runs).filter(([, rs]) => rs.length > 1).map(([h, rs]) => [h, rs.every((r) => r.out === rs[0].out)]));
    return {
      id: c.id, title: c.title, needed: c.needed,
      emitted: Object.fromEntries(Object.entries(out).map(([h, t]) => [h, t !== ''])),
      result: held ? 'as expected' : c.needed ? 'MISSING' : 'unexpected',
      repeats: Object.keys(same).length ? same : undefined, restores: c.restores,
      nonZero: exits.some((e) => e !== 0),
    };
  } finally {
    fs.rmSync(box.dir, { recursive: true, force: true });
  }
}

// Its own section: time added to an edit is not a reminder question.
function formatter(root, prettier) {
  if (!prettier) return { measured: false, why: 'no prettier was given' };
  let bin;
  try { bin = fs.realpathSync(prettier); fs.accessSync(bin, fs.constants.X_OK); } catch { die('--formatter needs an executable file'); }
  const box = makeBox(root);
  try {
    fs.mkdirSync(path.join(box.project, 'node_modules/.bin'), { recursive: true });
    const run = (withIt) => {
      const link = path.join(box.project, 'node_modules/.bin/prettier');
      fs.rmSync(link, { force: true });
      if (withIt) fs.symlinkSync(bin, link);
      const ms = [];
      for (let i = 0; i < 5; i++) {
        const file = path.join(box.project, 'sample.js');
        fs.writeFileSync(file, Array.from({ length: 200 }, (_, n) => `const value${n}   =  { a:${n} }`).join('\n'));
        const t = Date.now();
        spawnSync('/bin/bash', [path.join(root, 'hooks/post-edit-format.sh')], { cwd: box.project, env: envFor(box, withIt ? {} : { HOOK_NO_FORMAT: '1' }), input: JSON.stringify({ tool_input: { file_path: file } }), encoding: 'utf8', timeout: 60000 });
        ms.push(Date.now() - t);
      }
      return ms.sort((a, b) => a - b)[2];
    };
    return { measured: true, medianMs: { without: run(false), with: run(true) }, sample: 'one 200-line file, five edits' };
  } finally {
    fs.rmSync(box.dir, { recursive: true, force: true });
  }
}

function report(o, cases, fmt) {
  const mark = (b) => (b ? 'yes' : 'no');
  const missing = cases.filter((c) => c.result === 'MISSING');
  const odd = cases.filter((c) => c.result === 'unexpected' || c.nonZero);
  const lines = ['## Reminder Check', '', '> Synthetic cases, real hooks, throwaway project. It shows what is printed, not what anyone noticed or did.', ''];
  lines.push(missing.length ? `**Missing needed reminder(s): ${missing.map((c) => c.id).join(', ')}**` : 'No needed reminder is missing in these cases.');
  if (odd.length) lines.push(`Other differences: ${odd.map((c) => `${c.id}${c.nonZero ? ' (a hook did not exit 0)' : ''}`).join(', ')}`);
  lines.push('', '| Case | Needed | Emitted | Result |', '|---|---|---|---|');
  for (const c of [...missing, ...cases.filter((x) => !missing.includes(x))]) {
    lines.push(`| ${c.title} | ${mark(c.needed)} | ${Object.entries(c.emitted).map(([h, e]) => `${h}: ${mark(e)}`).join(', ')} | ${c.result} |`);
  }
  lines.push('', '| Reminder | Route to the model | Received by the model | Seen by you | Acted on |', '|---|---|---|---|---|');
  for (const [h, d] of Object.entries(HOOKS)) lines.push(`| ${h} (${d.event}) | ${ROUTED[d.event]} by the host | unknown | ${o.seen[h] || 'unknown'} | unknown — an action after a reminder may have another cause |`);
  lines.push('', `The route is what ${DOCS} says for the event's plain output; a run here observes no receipt.`);
  lines.push('', 'Repetition (not a defect by itself):');
  for (const c of cases.filter((x) => x.repeats)) lines.push(`- ${c.title}: ${Object.entries(c.repeats).map(([h, s]) => `${h} ${s ? 'unchanged' : 'changed'}`).join(', ')}${c.restores ? ` — it restores ${c.restores}` : ''}`);
  lines.push('', 'On demand instead: `review-state.js check`, `/remind`, `/next-step`. A repeat is never a reason to drop a reminder on its own.');
  lines.push('', '### Formatter (separate cost)', '', fmt.measured ? `Median of five edits: ${fmt.medianMs.without} ms with formatting off, ${fmt.medianMs.with} ms with prettier (${fmt.sample}, this machine).` : `Not measured: ${fmt.why}.`, '');
  return lines.join('\n');
}

const o = parse(process.argv.slice(2));
const cases = CASES.map((c) => runCase(c, o.root));
const fmt = formatter(o.root, o.formatter);
if (o.format === 'json') process.stdout.write(`${JSON.stringify({ cases, routed: { source: DOCS, ...Object.fromEntries(Object.entries(HOOKS).map(([h, d]) => [h, ROUTED[d.event]])) }, received: 'unknown', seen: Object.fromEntries(Object.keys(HOOKS).map((h) => [h, o.seen[h] || 'unknown'])), actedOn: 'unknown', formatter: fmt }, null, 2)}\n`);
else process.stdout.write(report(o, cases, fmt));
process.exit(cases.some((c) => c.result === 'MISSING') ? 1 : 0);
