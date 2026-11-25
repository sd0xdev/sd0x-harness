'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'skills/skill-health-check/scripts/skill-discovery.js');
const PHRASES = require(join(ROOT, 'skills/skill-health-check/references/discovery-phrases.json')).phrases;
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'skill-disc-')); dirs.push(d); return d; };

function skill(root, name, { desc = 'Does a thing', dmi = false } = {}) {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, 'SKILL.md'), `---\nname: ${name}\ndescription: "${desc}"\n${dmi ? 'disable-model-invocation: true\n' : ''}---\n# ${name}\n`);
}
// An ordinary install: the plugin lives outside the project and outside the home skills folder.
function install() {
  const plugin = tmp(); const project = tmp(); const home = tmp();
  skill(join(plugin, 'skills'), 'alpha');
  skill(join(plugin, 'skills'), 'beta');
  skill(join(plugin, 'skills'), 'gamma', { dmi: true });
  return { plugin, project, home };
}
const run = (args, env = {}) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: '', ...env } });
const at = (i) => ['--plugin-root', i.plugin, '--project', i.project, '--home', i.home];
const observe = (i, ...extra) => JSON.parse(run(['observe', ...at(i), '--format', 'json', ...extra]).stdout);
const NUM = (l, d) => ['--install', 'ordinary', '--listed', String(l), '--described', String(d), '--method', 'doctor'];

test('an ordinary install with no numbers → layers measured or unknown, selection never tested, nothing concluded', () => {
  const i = install();
  const f = observe(i, '--install', 'ordinary');
  assert.deepEqual([f.installed, f.modelMay, f.explicitOnly, f.checkout], [3, 2, ['gamma'], false]);
  assert.deepEqual([f.listed, f.described, f.verdict], [null, null, 'Listing not observed: nothing is concluded.']);
  const md = run(['observe', ...at(i)]).stdout;
  assert.match(md, /\| Listed to the model \| unknown \| not given \|/);
  assert.match(md, /\| Selected for a phrase \| not tested \| a count never shows this \|/);
  assert.match(md, /`\/sd0x-dev-flow:<name>` runs this plugin's copy/);
});

test('a source checkout with a linked folder → said to be one, duplicates named as links, no verdict', () => {
  const root = tmp();
  skill(join(root, 'skills'), 'alpha');
  mkdirSync(join(root, '.claude'));
  symlinkSync('../skills', join(root, '.claude', 'skills'));
  const f = observe({ plugin: root, project: root, home: tmp() }, ...NUM(1, 0));
  assert.deepEqual([f.checkout, f.project.link], [true, ['alpha']]);
  assert.match(f.verdict, /source checkout, not an ordinary install: no verdict/);
});

test('an install whose origin nobody stated → numbers kept, no ordinary-install verdict', () => {
  const i = install();
  const numbers = NUM(2, 2).slice(2);
  for (const extra of [[], ['--install', 'unknown']]) {
    const f = observe(i, ...numbers, ...extra);
    assert.deepEqual([f.install, f.listed], ['unknown', 2]);
    assert.match(f.verdict, /How this plugin was installed is not known: no verdict about an ordinary install/);
  }
  assert.match(observe(i, ...numbers, '--install', 'checkout').verdict, /source checkout, not an ordinary install/);
});

test('a checkout by its path → stays one, whatever is claimed', () => {
  const root = tmp();
  skill(join(root, 'skills'), 'alpha');
  assert.equal(observe({ plugin: root, project: root, home: tmp() }, ...NUM(1, 1)).install, 'checkout');
});

test('a run from a subdirectory, or with the host project root → the same project, never an ordinary install', () => {
  const root = tmp();
  skill(join(root, 'skills'), 'alpha');
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.claude'));
  symlinkSync('../skills', join(root, '.claude', 'skills'));
  const obs = (opts, env) => JSON.parse(spawnSync('node', [SCRIPT, 'observe', '--plugin-root', root, '--home', tmp(), '--format', 'json', ...NUM(1, 1)], { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: '', CLAUDE_PROJECT_DIR: '', ...env }, ...opts }).stdout);
  for (const f of [obs({ cwd: join(root, 'skills', 'alpha') }), obs({ cwd: tmp() }, { CLAUDE_PROJECT_DIR: root })]) {
    assert.deepEqual([f.checkout, f.project.link], [true, ['alpha']]);
  }
});

test('same-named copies → identical and different ones counted apart; other skills are never named', () => {
  const i = install();
  skill(join(i.project, '.claude/skills'), 'alpha');
  skill(join(i.home, '.claude/skills'), 'beta', { desc: 'An older text' });
  skill(join(i.home, '.claude/skills'), 'somebody-elses-skill');
  const f = observe(i);
  assert.deepEqual([f.project.same, f.user.different], [['alpha'], ['beta']]);
  assert.doesNotMatch(run(['observe', ...at(i)]).stdout + JSON.stringify(f), /somebody-elses-skill/);
});

test('a folder that cannot be read → reported as not checked, never as absent', { skip: process.getuid && process.getuid() === 0 && 'root reads everything' }, () => {
  const i = install();
  skill(join(i.project, '.claude/skills'), 'alpha');
  chmodSync(join(i.project, '.claude/skills'), 0o000);
  try {
    assert.equal(observe(i).project.notChecked, 3);
  } finally {
    chmodSync(join(i.project, '.claude/skills'), 0o700);
  }
});

for (const [name, args, want] of [
  ['every entry described', NUM(2, 2), /Every listed entry is described: the truncation line stops here\. Selection stays unknown/],
  ['counts only', NUM(2, 1), /not which: the impact .* is unknown\. The observation may end here/],
  ['named, all explicit', [...NUM(2, 1), '--name-only', 'alpha', '--reached', 'alpha=explicit'], /reached only explicitly or by a gate: nothing to fix/],
  ['named, one reached by describing', [...NUM(2, 0), '--name-only', 'alpha,beta', '--reached', 'alpha=explicit,beta=described'], /needs your consent/],
  ['named, use unknown', [...NUM(2, 0), '--name-only', 'alpha,beta', '--reached', 'alpha=explicit'], /impact stays unknown/],
  ['named skills that do not match the numbers', [...NUM(2, 1), '--name-only', 'alpha,beta'], /numbers disagree .*: nothing is concluded/],
  ['more described than listed', NUM(1, 2), /numbers disagree/],
]) {
  test(`the step-1 verdict with ${name} → ${want.source.slice(0, 40)}`, () => {
    assert.match(observe(install(), ...args).verdict, want);
  });
}

test('names that are not this plugin\'s → counted as ignored, not echoed', () => {
  const f = run(['observe', ...at(install()), ...NUM(2, 1), '--name-only', 'alpha,private-thing']).stdout;
  assert.match(f, /1 given name\(s\) are not this plugin's and were ignored/);
  assert.doesNotMatch(f, /private-thing/);
});

test('malformed input → a usage error and no report', () => {
  const i = install();
  for (const args of [['observe', ...at(i), '--listed', '3'], ['observe', ...at(i), '--listed', 'many', '--method', 'doctor'], ['observe', ...at(i), '--method', 'guess'], ['observe', ...at(i), '--reached', 'alpha=often'], ['observe', ...at(i), '--reached', 'explicit'], ['observe', ...at(i), '--install', 'maybe'], ['observe', '--plugin-root', tmp()], ['worksheet', '--lang', 'fr'], ['score'], ['x']]) {
    const r = run(args);
    assert.deepEqual([r.status, r.stdout], [2, ''], args.slice(-2).join(' '));
  }
});

test('observing → writes nothing in the plugin, the project or the home', () => {
  const i = install();
  run(['observe', ...at(i)], { HOME: i.home });
  assert.deepEqual([readdirSync(i.project), readdirSync(i.home), readdirSync(i.plugin)], [[], [], ['skills']]);
});

test('the phrase set → real skills, at least as many no-skill phrases as targets, both languages, no answer in the wording', () => {
  const names = new Set(readdirSync(join(ROOT, 'skills')));
  const targets = PHRASES.filter((p) => p.kind === 'target');
  for (const p of PHRASES) for (const n of p.accept) assert.ok(names.has(n), `${p.id}: ${n}`);
  for (const p of targets) for (const n of p.accept) assert.ok(!p.phrase.toLowerCase().includes(n), `${p.id} names ${n}`);
  assert.ok(PHRASES.filter((p) => p.kind === 'none' && p.accept.length === 0).length >= targets.length);
  assert.ok(PHRASES.some((p) => p.kind === 'explicit') && ['en', 'zh'].every((l) => targets.some((p) => p.lang === l)));
  assert.equal(new Set(PHRASES.map((p) => p.id)).size, PHRASES.length);
});

test('the worksheet → same order for a seed, another for another, and never the answers', () => {
  const a = run(['worksheet', '--seed', '7']).stdout;
  assert.equal(a, run(['worksheet', '--seed', '7']).stdout);
  assert.notEqual(a, run(['worksheet', '--seed', '8']).stdout);
  for (const p of PHRASES) assert.ok(a.includes(p.id));
  assert.doesNotMatch(a, /accept|dep-audit|codex-review-fast/);
  assert.match(a, /costs model calls: do it only if you chose to/);
});

test('the worksheet in one language → its targets, its no-skill phrases and the explicit controls', () => {
  for (const lang of ['en', 'zh']) {
    const ids = run(['worksheet', '--lang', lang]).stdout.split('\n').map((l) => l.split('\t')[0]);
    const got = PHRASES.filter((p) => ids.includes(p.id));
    assert.deepEqual([...new Set(got.map((p) => p.kind))].sort(), ['explicit', 'none', 'target'], lang);
    assert.ok(got.every((p) => p.lang === lang || p.kind === 'explicit'), lang);
    assert.ok(got.filter((p) => p.kind === 'none').length >= got.filter((p) => p.kind === 'target').length, lang);
  }
});

test('scoring → missed, wrong and unwanted apart, per condition, equivalents alike, gaps counted', () => {
  const file = join(tmp(), 'a.json');
  writeFileSync(file, JSON.stringify({ answers: [
    { id: 't01', condition: 'described', chosen: 'sd0x-dev-flow:codex-review-fast' },
    { id: 't03', condition: 'described', chosen: 'codex-security' },
    { id: 't04', condition: 'described', chosen: null },
    { id: 't05', condition: 'described', chosen: 'tech-spec' },
    { id: 'n01', condition: 'described', chosen: null },
    { id: 'n02', condition: 'described', chosen: 'simplify' },
    { id: 'x01', condition: 'described', chosen: '/sd0x-dev-flow:doc-review' },
    { id: 't01', condition: 'name-only', chosen: null },
  ] }));
  const s = JSON.parse(run(['score', '--answers', file, '--format', 'json']).stdout);
  assert.deepEqual(s.described.targets, { hit: 2, missed: 1, wrong: 1 });
  assert.deepEqual([s.described.none, s.described.explicit], [{ quiet: 1, unwanted: 1 }, { ran: 1, failed: 0 }]);
  assert.deepEqual([s['name-only'].targets.missed, s.described.unanswered], [1, PHRASES.length - 7]);
  assert.match(run(['score', '--answers', file]).stdout, /These counts stay apart/);
});

test('scoring input that cannot be used → a usage error and nothing counted', () => {
  const bad = join(tmp(), 'bad.json');
  writeFileSync(bad, '{');
  const none = join(tmp(), 'none.json');
  writeFileSync(none, '{}');
  for (const f of [join(tmp(), 'missing.json'), bad, none]) {
    const r = run(['score', '--answers', f]);
    assert.deepEqual([r.status, r.stdout], [2, '']);
  }
});

test('scoring in two languages with a failed explicit call → counted apart', () => {
  const file = join(tmp(), 'a.json');
  writeFileSync(file, JSON.stringify({ answers: [
    { id: 't07', condition: 'described', chosen: 'doc-refactor' }, { id: 't04', condition: 'described', chosen: null }, { id: 'x02', condition: 'described', chosen: 'doc-review' },
  ] }));
  const c = JSON.parse(run(['score', '--answers', file, '--format', 'json']).stdout).described;
  assert.deepEqual([c.byLanguage, c.explicit], [{ zh: { hit: 1 }, en: { missed: 1 }, any: { failed: 1 } }, { ran: 0, failed: 1 }]);
});

for (const [name, answers] of [
  ['an unknown id', [{ id: 'zz', condition: 'described', chosen: null }]],
  ['no condition', [{ id: 't01', chosen: null }]],
  ['the same answer twice', [{ id: 't01', condition: 'described', chosen: null }, { id: 't01', condition: 'described', chosen: 'dep-audit' }]],
  ['a missing choice', [{ id: 't01', condition: 'described' }]],
]) {
  test(`scoring with ${name} → refused, not counted`, () => {
    const file = join(tmp(), 'a.json');
    writeFileSync(file, JSON.stringify({ answers }));
    assert.deepEqual([run(['score', '--answers', file]).status, run(['score', '--answers', file]).stdout], [2, '']);
  });
}
