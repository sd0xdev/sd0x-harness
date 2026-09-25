'use strict';
// instruction-budget R3: scripts/instruction-budget.js reproduces Claude Code 2.1.281's launch
// accounting (docs/features/instruction-budget/2-tech-spec.md § 3.3), and a ceiling keeps the
// plugin's always-loaded share from growing back.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { measure, isPathScoped } = require('../../scripts/instruction-budget');

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'scripts', 'instruction-budget.js');
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'ib-'));
  dirs.push(base);
  const repo = join(base, 'repo');
  const home = join(base, 'home');
  mkdirSync(join(repo, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(home, '.claude'), { recursive: true });
  return { repo, home };
}
const opts = (f, extra = {}) => ({ root: f.repo, home: f.home, perFile: 150000, limit: 150000, pluginRoot: null, ...extra });
const body = (n, ch = 'x') => ch.repeat(n);

test('isPathScoped → a non-`**` list is scoped; empty, absent or all-`**` is not (2.1.281)', () => {
  assert.equal(isPathScoped('---\npaths:\n  - "docs/**"\n---\n# a'), true);
  assert.equal(isPathScoped('---\npaths:\n  - "**"\n  - "docs/**"\n---\n# a'), true, 'a mixed list is still scoped');
  assert.equal(isPathScoped('---\npaths: "**"\n---\n# a'), false);
  assert.equal(isPathScoped('---\npaths: ["**", "**/**"]\n---\n# a'), false, '`**/**` normalises to `**`');
  assert.equal(isPathScoped('---\ntitle: x\n---\n# a'), false);
  assert.equal(isPathScoped('# no frontmatter'), false);
});

test('measure → path-scoped rules excluded, `paths: "**"` included, an @ import followed once', () => {
  const f = fixture();
  writeFileSync(join(f.repo, '.claude', 'rules', 'scoped.md'), `---\npaths:\n  - "docs/**"\n---\n${body(500)}`);
  writeFileSync(join(f.repo, '.claude', 'rules', 'star.md'), `---\npaths: "**"\n---\n${body(300)}`);
  writeFileSync(join(f.repo, '.claude', 'rules', 'plain.md'), body(200));
  writeFileSync(join(f.repo, '.claude', 'CLAUDE.md'), `# p\nSee @rules/plain.md and @rules/extra.md\n`);
  writeFileSync(join(f.repo, '.claude', 'rules', 'extra.md'), body(100));
  const r = measure(opts(f));
  assert.deepEqual(r.path_scoped, ['.claude/rules/scoped.md']);
  const claude = readFileSync(join(f.repo, '.claude', 'CLAUDE.md'), 'utf8').length;
  const star = readFileSync(join(f.repo, '.claude', 'rules', 'star.md'), 'utf8').length;
  assert.equal(r.total, claude + star + 200 + 100, 'each file once, the scoped one never');
});

test('measure → an @-imported path-scoped rule is loaded anyway (as 2.1.281 does)', () => {
  const f = fixture();
  writeFileSync(join(f.repo, '.claude', 'rules', 'scoped.md'), `---\npaths:\n  - "docs/**"\n---\n${body(400)}`);
  writeFileSync(join(f.repo, 'CLAUDE.md'), '@.claude/rules/scoped.md\n');
  const r = measure(opts(f));
  assert.ok(r.total >= 400, 'the import pulls it in');
});

test('measure → a file over the per-file limit is reported and left out of the sum; the limit is derived', () => {
  const f = fixture();
  writeFileSync(join(f.repo, 'CLAUDE.md'), body(50));
  writeFileSync(join(f.repo, '.claude', 'rules', 'big.md'), body(45000));
  const r = measure(opts(f, { perFile: 40000, limit: 120000 }));
  assert.deepEqual(r.over_per_file.map((x) => x.path), ['.claude/rules/big.md']);
  assert.equal(r.total, 50);
  const cli = spawnSync('node', [SCRIPT, '--root', f.repo, '--home', f.home, '--per-file', '40000', '--format=json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(cli.stdout).limit, 120000, 'total limit = max(120000, per-file)');
  const cli2 = spawnSync('node', [SCRIPT, '--root', f.repo, '--home', f.home, '--per-file', '150000', '--format=json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(cli2.stdout).limit, 150000);
});

test('measure → a lessons or archive file in .claude/rules/ is flagged with the move', () => {
  const f = fixture();
  writeFileSync(join(f.repo, '.claude', 'rules', 'lessons.md'), body(10));
  writeFileSync(join(f.repo, '.claude', 'rules', 'lessons-archive.md'), body(10));
  writeFileSync(join(f.repo, '.claude', 'rules', 'git-workflow.md'), body(10));
  const r = measure(opts(f));
  assert.deepEqual(r.lessons_in_rules.map((x) => x.path).sort(), ['.claude/rules/lessons-archive.md', '.claude/rules/lessons.md']);
  assert.match(r.lessons_in_rules[0].fix, /sd0x-dev-flow-lessons\.md/);
});

test('the CLI → md output names the total and the lessons finding; a bad argument exits 2', () => {
  const f = fixture();
  writeFileSync(join(f.repo, '.claude', 'rules', 'lessons.md'), body(10));
  const r = spawnSync('node', [SCRIPT, '--root', f.repo, '--home', f.home], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Instruction budget: /);
  assert.match(r.stdout, /lessons\.md: a lessons\/archive\/log file in rules\//);
  assert.equal(spawnSync('node', [SCRIPT, '--bogus'], { encoding: 'utf8' }).status, 2);
});

// ── Ceiling (FR-8) ──────────────────────────────────────────────────────────────────────────
const CEILING = 90000;
function freshInstall(extraChars = 0) {
  const f = fixture();
  copyFileSync(join(ROOT, 'CLAUDE.template.md'), join(f.repo, '.claude', 'CLAUDE.md'));
  for (const n of readdirSync(join(ROOT, 'rules')).filter((x) => x.endsWith('.md'))) {
    copyFileSync(join(ROOT, 'rules', n), join(f.repo, '.claude', 'rules', n));
  }
  if (extraChars) {
    const p = join(f.repo, '.claude', 'rules', 'auto-loop.md');
    writeFileSync(p, readFileSync(p, 'utf8') + body(extraChars, 'y'));
  }
  return measure(opts(f, { pluginRoot: ROOT }));
}

test(`a fresh install → the plugin's always-loaded total stays at or under ${CEILING} characters`, () => {
  const r = freshInstall();
  assert.ok(r.total <= CEILING, `fresh-install always-loaded total is ${r.total}, over the ${CEILING} ceiling — move content on demand before adding`);
  // Derived from disk: a rule is path-scoped when its frontmatter opens with `paths:`.
  const scoped = readdirSync(join(ROOT, 'rules'))
    .filter((n) => n.endsWith('.md') && readFileSync(join(ROOT, 'rules', n), 'utf8').startsWith('---\npaths:'));
  assert.ok(scoped.length >= 5, `path-scoped rule set collapsed unexpectedly: ${scoped.length}`);
  assert.equal(r.path_scoped.length, scoped.length, 'every path-scoped rule is left out of the always-loaded total');
});

test('the ceiling when a resident rule grows past it → fails (negative control, gap measured)', () => {
  const base = freshInstall().total;
  const grown = freshInstall(CEILING - base + 1).total;
  assert.ok(grown > CEILING, `growth of ${CEILING - base + 1} characters must cross the ceiling`);
});

test('measure → an import first reached by a long chain is still counted by its short route', () => {
  const f = fixture();
  const d = join(f.repo, 'imp');
  mkdirSync(d);
  // CLAUDE.md → a1 → a2 → a3 → a4 → a5 → shared (depth 6, beyond the limit) and CLAUDE.md → shared (depth 1)
  writeFileSync(join(f.repo, 'CLAUDE.md'), '@imp/a1.md\n@imp/shared.md\n');
  for (let i = 1; i <= 5; i++) writeFileSync(join(d, `a${i}.md`), i < 5 ? `@a${i + 1}.md\n` : '@shared.md\n');
  writeFileSync(join(d, 'shared.md'), '@leaf.md\n');
  writeFileSync(join(d, 'leaf.md'), body(40));
  const r = measure(opts(f));
  assert.ok(r.total >= 40, 'the leaf, two imports from CLAUDE.md, is counted');
});

test(`a fresh install → the plugin's share by provenance equals the whole fresh total`, () => {
  const r = freshInstall();
  assert.equal(r.plugin_share, r.total, 'every counted file of a fresh install is the plugin\'s');
  const f = fixture();
  writeFileSync(join(f.repo, '.claude', 'rules', 'auto-loop.md'), 'a project file that only shares a name');
  assert.equal(measure(opts(f, { pluginRoot: ROOT })).plugin_share, 0, 'a same-named file with other content and no manifest entry is not the plugin\'s');
});
