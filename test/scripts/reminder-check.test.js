'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, chmodSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'skills/claude-health/scripts/reminder-check.js');
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rem-test-')); dirs.push(d); return d; };
const run = (args = [], env = {}, cwd = ROOT) => spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: '', ...env } });

// A copy of what the hooks need, with one hook replaced.
function mutated(file, text) {
  const root = tmp();
  for (const d of ['hooks', 'scripts', 'rules', '.claude-plugin']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
  cpSync(join(ROOT, 'package.json'), join(root, 'package.json'));
  writeFileSync(join(root, file), text);
  chmodSync(join(root, file), 0o755);
  return root;
}

let real;
before(() => { real = run(['--format=json', '--plugin-root', ROOT]); });
const byId = (r, id) => JSON.parse(r.stdout).cases.find((c) => c.id === id);

test('the shipped hooks → no needed reminder missing, exit 0', () => {
  assert.equal(real.status, 0, real.stderr);
  const { cases } = JSON.parse(real.stdout);
  assert.ok(cases.length >= 11);
  assert.deepEqual(cases.filter((c) => c.result !== 'as expected' || c.nonZero).map((c) => c.id), []);
});

test('the needed cases → really emitted: edit, reopened, compaction, five turns, unreadable', () => {
  for (const id of ['edited', 'reopened', 'five-turns', 'compaction', 'unreadable']) {
    const c = byId(real, id);
    assert.equal(c.needed, true, id);
    assert.ok(Object.values(c.emitted).some(Boolean), id);
  }
});

test('the quiet cases → nothing owed after a pass, when nothing changed, or once the menu is marked shown; bypass silences four only', () => {
  assert.equal(byId(real, 'nothing').emitted.stop, false);
  assert.equal(byId(real, 'menu-shown').result, 'as expected');
  assert.deepEqual(byId(real, 'bypass').emitted, { prompt: false, stop: false, skill: false, compact: false, namespace: true });
});

test('a repeat → reported with what it restores, and never a failure', () => {
  const c = byId(real, 'repeated');
  assert.deepEqual(c.repeats, { prompt: true, stop: true });
  assert.match(c.restores, /compaction/);
  assert.equal(c.result, 'as expected');
});

test('a Stop hook that goes quiet → the miss is named first and the run exits 1', () => {
  const root = mutated('hooks/stop-guard.sh', '#!/bin/bash\ncat >/dev/null\nexit 0\n');
  const r = run(['--plugin-root', root]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\*\*Missing needed reminder\(s\): .*edited.*reopened/);
  assert.match(r.stdout, /\| Case \| Needed \| Emitted \| Result \|\n\|---\|---\|---\|---\|\n\| [^\n]*\| MISSING \|/);
});

for (const [hook, file, hit] of [['Stop', 'hooks/stop-guard.sh', ['edited', 'reopened', 'five-turns']], ['compaction', 'hooks/post-compact-auto-loop.sh', ['five-turns', 'compaction']]]) {
  for (const gate of ['code_review', 'precommit']) {
    test(`a ${hook} hook that drops only ${gate} → a miss: one owed gate does not stand for the other`, () => {
      const root = mutated(file, `#!/bin/bash\n/bin/bash "$(dirname "$0")/kept.sh" | grep -v '📋 ${gate}'\nexit 0\n`);
      cpSync(join(ROOT, file), join(root, 'hooks/kept.sh'));
      const r = run(['--format=json', '--plugin-root', root]);
      assert.equal(r.status, 1);
      assert.deepEqual(JSON.parse(r.stdout).cases.filter((c) => c.result === 'MISSING').map((c) => c.id), hit);
    });
  }
}

test('a prompt hook that calls an unreadable tree clean → a miss, not a pass', () => {
  const root = mutated('hooks/user-prompt-review-guard.sh', '#!/bin/bash\ncat >/dev/null\necho "[AUTO_LOOP_STATE] change=none reviews=code_review:pass,doc_review:pass,precommit:pass source=state"\nexit 0\n');
  assert.equal(byId(run(['--format=json', '--plugin-root', root]), 'unreadable').result, 'MISSING');
});

test('hooks that go silent on an unreadable tree → a miss: silence does not say unknown', () => {
  const root = mutated('hooks/user-prompt-review-guard.sh', readFileSync(join(ROOT, 'hooks/user-prompt-review-guard.sh'), 'utf8').replace(/^cat >\/dev\/null.*$/m, '$&\ngit status >/dev/null 2>&1 || exit 0'));
  writeFileSync(join(root, 'hooks/stop-guard.sh'), readFileSync(join(ROOT, 'hooks/stop-guard.sh'), 'utf8').replace(/^_SELF_NAME=.*$/m, '$&\ngit status >/dev/null 2>&1 || exit 0'));
  const r = run(['--format=json', '--plugin-root', root]);
  assert.deepEqual([byId(r, 'unreadable').result, byId(r, 'edited').result], ['MISSING', 'as expected']);
});

test('a hook that exits non-zero → shown, since reminders never block', () => {
  const root = mutated('hooks/post-skill-auto-loop.sh', '#!/bin/bash\ncat >/dev/null\necho line\nexit 2\n');
  const r = run(['--format=json', '--plugin-root', root]);
  assert.equal(byId(r, 'skill').nonZero, true);
});

test('a hook that only repeats itself more → still exit 0', () => {
  const root = mutated('hooks/post-skill-auto-loop.sh', '#!/bin/bash\ncat >/dev/null\nif [ -n "$HOOK_BYPASS" ]; then exit 0; fi\nfor i in 1 2 3 4 5; do echo "same line"; done\nexit 0\n');
  assert.equal(run(['--plugin-root', root]).status, 0);
});

test('route, receipt, seen and acted on → documented, unknown, as answered, unknown; none is inferred', () => {
  const md = run(['--plugin-root', ROOT, '--seen', 'stop=no']).stdout;
  assert.match(md, /\| prompt \(UserPromptSubmit\) \| documented by the host \| unknown \| unknown \|/);
  assert.match(md, /\| stop \(Stop\) \| not documented by the host \| unknown \| no \| unknown — an action after a reminder may have another cause \|/);
  assert.match(md, /It shows what is printed, not what anyone noticed or did/);
  assert.match(md, /https:\/\/code\.claude\.com\/docs\/en\/hooks says for the event's plain output; a run here observes no receipt/);
  assert.deepEqual([JSON.parse(real.stdout).received, JSON.parse(real.stdout).routed.Stop, JSON.parse(real.stdout).routed.stop], ['unknown', undefined, 'not documented']);
  assert.doesNotMatch(md, /waste|useless|unused/i);
});

test('the formatter → its own section, not measured unless asked, and measured apart when asked', () => {
  assert.deepEqual(JSON.parse(real.stdout).formatter, { measured: false, why: 'no prettier was given' });
  const bin = join(tmp(), 'prettier');
  const log = join(tmp(), 'log');
  writeFileSync(bin, `#!/bin/bash\necho "$@" >> '${log}'\nexit 0\n`);
  chmodSync(bin, 0o755);
  const f = JSON.parse(run(['--format=json', '--plugin-root', ROOT, '--formatter', bin]).stdout);
  assert.ok(f.formatter.measured && Number.isFinite(f.formatter.medianMs.with) && Number.isFinite(f.formatter.medianMs.without));
  assert.ok(f.cases.every((c) => !JSON.stringify(c).includes('medianMs')));
  const calls = readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(calls.length, 5, 'formatting runs in one arm only');
  assert.ok(calls.every((l) => /^--write .*sample\.js$/.test(l)));
});

test('a run → leaves the project, the real HOME and the temp directory as they were', () => {
  const home = tmp(); const project = tmp(); const temp = tmp();
  mkdirSync(join(project, 'sub'));
  const r = run(['--plugin-root', ROOT], { HOME: home, TMPDIR: temp, CLAUDE_PROJECT_DIR: project }, project);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([readdirSync(home), readdirSync(project), readdirSync(temp)], [[], ['sub'], []]);
});

test('the source → no transcript access, no git add or commit, no guard run', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(src, /transcript_path|\.jsonl|projects\/|pre-edit-guard|pre-bash-codex/);
  assert.doesNotMatch(src, /'(add|commit|push)'/);
});

test('malformed input → a usage error and no report', () => {
  for (const args of [['--seen', 'stop=maybe'], ['--seen', 'nohook=yes'], ['--format=xml'], ['--bogus'], ['--plugin-root', tmp()], ['--plugin-root', ROOT, '--formatter', '/no/such/file']]) {
    const r = run(args);
    assert.deepEqual([r.status, r.stdout], [2, ''], args.join(' '));
  }
});

test('/claude-health → reminders only on request, the user answers what was seen, and repetition is no reason to remove', () => {
  const skill = readFileSync(join(ROOT, 'skills/claude-health/SKILL.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(skill, /\| `--scope reminders` \| Only run the Reminder Check \(R1\), on request — never part of `--scope all` \|/);
  assert.match(skill, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/claude-health\/scripts\/reminder-check\.js"/);
  assert.match(skill, /Never fill it in yourself\. \*Acted on\* stays unknown/);
  assert.match(skill, /do not propose removing one on repetition alone/);
});
