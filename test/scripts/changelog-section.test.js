'use strict';
// rules-residency task 9: the 5.0.0 CHANGELOG.md entry carries the migration guide (FR-13), and it
// reaches both release channels — the npm package (`package.json` `files`) and the GitHub release
// body, to which .github/workflows/release.yml appends the version's section through
// .github/scripts/changelog-section.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { section } = require('../../.github/scripts/changelog-section');

const root = resolve(__dirname, '../..');
const SCRIPT = join(root, '.github', 'scripts', 'changelog-section.js');
const read = (p) => readFileSync(join(root, p), 'utf8');

const FIXTURE = [
  '# Changelog', '', 'Preamble.', '',
  '## 5.0.0 — rules load on demand', '', 'Guide for five.', '',
  '## 5.0.0-rc.1', '', 'Release candidate.', '',
  '## Historical: 3.0.0 (2026-04-05) — commands/ removed', '', 'Guide for three.', '',
].join('\n');

test('section() for a version with a heading → that heading through the line before the next `## `', () => {
  assert.equal(section(FIXTURE, '5.0.0'), '## 5.0.0 — rules load on demand\n\nGuide for five.\n');
  assert.equal(section(FIXTURE, 'v5.0.0'), section(FIXTURE, '5.0.0'), 'the tag form drops its leading v');
  assert.equal(section(FIXTURE, 'v3.0.0'), '## Historical: 3.0.0 (2026-04-05) — commands/ removed\n\nGuide for three.\n',
    'a historical heading is found by its version, and the last section runs to the end of the file');
});

test('section() when the version has no section, or only a longer version starts with it → empty', () => {
  assert.equal(section(FIXTURE, '4.7.0'), '');
  assert.equal(section(FIXTURE, '5.0'), '', '5.0 is not a prefix match for 5.0.0');
  assert.equal(section(FIXTURE, '5.0.0-rc'), '', 'a version ends at a non-version character');
  assert.equal(section('## 5.0.01\n\nx\n', '5.0.0'), '');
  assert.equal(section('## 5.0.0+meta\n\nx\n', '5.0.0'), '', 'build metadata makes it another version');
  assert.equal(section(FIXTURE, '5.0.0-rc.1'), '## 5.0.0-rc.1\n\nRelease candidate.\n');
  assert.equal(section('## 1+1\n\nx\n', '1.1'), '', 'regex characters in the version are literal');
});

test('the CLI → prints the section, nothing for a version without one, and refuses bad input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'changelog-'));
  try {
    const file = join(dir, 'CHANGELOG.md');
    writeFileSync(file, FIXTURE);
    const run = (...args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
    assert.deepEqual([run('v5.0.0', file).status, run('v5.0.0', file).stdout], [0, section(FIXTURE, '5.0.0')]);
    assert.deepEqual([run('v4.7.0', file).status, run('v4.7.0', file).stdout], [0, '']);
    assert.equal(run().status, 2, 'no version is a usage error');
    const missing = run('v5.0.0', join(dir, 'nope.md'));
    assert.deepEqual([missing.status, missing.stdout], [1, ''], 'an unreadable changelog fails the step rather than dropping the guide');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Every block that left residency between 4.7.0 and 5.0, one table row each: every 4.x source the
// row must name, and every 5.0 destination. The first source identifies the row.
const MOVES = [
  [['`rules/fix-all-issues.md`'],
    ['`rules/auto-loop.md` § Fix Obligation', '`skills/codex-code-review/references/scope-contract.md` § Fix Obligation']],
  [['`rules/framework.md`'], ['Removed']],
  [['`rules/auto-loop.md`', 'fallback trigger', '`reason=` rules', 'thread rotation', 'stall and cap diagnosis'],
    ['`skills/codex-code-review/references/review-common.md` § Degradation Matrix', '§ Review Loop',
      '`skills/codex-code-review/references/loop-diagnostics.md`']],
  [['`rules/git-workflow.md` § Push safety', '§ Proactive Offer / Goal mode', '`rules/discretion.md` § Efficacy Boundary'],
    ['`skills/push-ci/references/authorization-contract.md`']],
  [['`rules/testing.md`', 'evidence model', 'exception gates', 'Adequacy Gate sentinels', 'execution'],
    ['`skills/test-review/references/testing-contract.md`']],
  [['`rules/docs-numbering.md` split procedure and exemptions', '`rules/docs-writing.md` comment-block counting and checker'],
    ['`skills/doc-review/references/documentation-contract.md`']],
  [['Override resolution tables', '`auto-loop.md` § Override Contract', '`testing.md` and `git-workflow.md` § Project Customization'],
    ['`rules/override-contract.md`']],
];

/** The 4.x → 5.0 table of a guide as [4.x, 5.0, read when] rows. */
function movedRows(guide) {
  const at = guide.indexOf('| 4.x location | 5.0 location | Read when |');
  if (at === -1) return [];
  const rows = [];
  for (const line of guide.slice(at).split('\n').slice(2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.split(' | ').map((c) => c.replace(/^\| ?| ?\|$/g, '').trim()));
  }
  return rows;
}

/** What FR-13 requires of the 5.0.0 guide that it does not carry. */
function guideGaps(guide) {
  const gaps = [];
  const flat = guide.replace(/\s+/g, ' ');
  if (!/Recommended models: Claude Opus 5\.5 or later/.test(flat)) gaps.push('model line');
  const rows = movedRows(guide);
  for (const [sources, destinations] of MOVES) {
    const row = rows.find((r) => r[0].includes(sources[0]));
    const missing = row ? [...sources.filter((s) => !row[0].includes(s)), ...destinations.filter((d) => !row[1].includes(d))] : ['the row'];
    if (missing.length || !row[2]) gaps.push(`table row ${sources[0]}${missing.length ? `: ${missing.join(', ')}` : ''}`);
  }
  if (!/Run `\/install-rules --all`/.test(flat)) gaps.push('upgrade: /install-rules --all');
  if (!/Copy § Contract Triggers from the plugin's `CLAUDE\.template\.md` into `\.claude\/CLAUDE\.md`/.test(flat)) gaps.push('upgrade: Contract Triggers');
  if (!/No `\*-project\.md` edit is required/.test(flat)) gaps.push('no project-file edit');
  if (!/A trigger's Read fails there and the governed action stops/.test(flat)) gaps.push('installs without the plugin');
  if (!/The 3\.x line is deprecated and suitable only for models before Claude Opus 4\.8/.test(flat)) gaps.push('3.x deprecation');
  return gaps;
}

test('CHANGELOG.md 5.0.0 → the migration guide FR-13 requires, row by row', () => {
  const guide = section(read('CHANGELOG.md'), '5.0.0');
  assert.ok(guide, 'CHANGELOG.md has a 5.0.0 section');
  assert.deepEqual(guideGaps(guide), []);
  assert.equal(movedRows(guide).length, MOVES.length, 'one row per moved block, no more');
});

test('the guide check when a row loses a cell, a block or an upgrade step → names it (negative control)', () => {
  const guide = section(read('CHANGELOG.md'), '5.0.0');
  const noWhen = guide.replace(/(\| `rules\/framework\.md` \|[^|]*\|)[^|\n]*\|/, '$1  |');
  assert.deepEqual(guideGaps(noWhen), ['table row `rules/framework.md`']);
  // Every named source and destination counts, not only the first of each row.
  assert.deepEqual(guideGaps(guide.replace('; `skills/codex-code-review/references/loop-diagnostics.md`', '')),
    ['table row `rules/auto-loop.md`: `skills/codex-code-review/references/loop-diagnostics.md`']);
  assert.deepEqual(guideGaps(guide.replace('exception gates, ', '')), ['table row `rules/testing.md`: exception gates']);
  assert.deepEqual(guideGaps(guide.replace('; `rules/discretion.md` § Efficacy Boundary', '')),
    ['table row `rules/git-workflow.md` § Push safety: `rules/discretion.md` § Efficacy Boundary']);
  assert.deepEqual(guideGaps(guide.replace('Run `/install-rules --all`.', 'Run the installer.')), ['upgrade: /install-rules --all']);
});

test('CHANGELOG.md 3.0.0 → keeps its deprecation mark, found by its version', () => {
  assert.match(section(read('CHANGELOG.md'), 'v3.0.0'),
    /> \*\*Deprecated\*\* — the 3\.x line is suitable only for models before Claude Opus 4\.8\./);
});

test('release.yml → appends the version\'s section between generating the notes and creating the release', () => {
  const wf = read('.github/workflows/release.yml');
  const at = (name) => wf.indexOf(`- name: ${name}`);
  assert.ok(at('Generate release notes') !== -1 && at('Generate release notes') < at('Append the migration guide')
    && at('Append the migration guide') < at('Create tag and release'), 'the append step sits between the two');
  const step = wf.slice(at('Append the migration guide'), at('Create tag and release'));
  assert.match(step, /node \.github\/scripts\/changelog-section\.js "\$\{\{ steps\.version\.outputs\.version \}\}"/);
  assert.match(step, />> release-notes\.md/);
  // Same guard as the notes and release steps: nothing runs for a version that is already tagged.
  const guard = "if: steps.check.outputs.exists == 'false'";
  for (const name of ['Generate release notes', 'Append the migration guide', 'Create tag and release']) {
    const body = wf.slice(at(name), wf.indexOf('- name:', at(name) + 1) === -1 ? undefined : wf.indexOf('- name:', at(name) + 1));
    assert.ok(body.includes(guard), `${name} carries the existing-tag guard`);
  }
  assert.match(wf, /body_path: release-notes\.md/, 'the release body is the file the step appends to');
});

/** Runs release.yml's append step, as written, in a scratch copy of the repository layout. */
function runAppendStep(version, notes) {
  const wf = read('.github/workflows/release.yml');
  const step = wf.slice(wf.indexOf('- name: Append the migration guide'), wf.indexOf('- name: Create tag and release'));
  const script = step.slice(step.indexOf('run: |') + 'run: |'.length).split('\n')
    .map((l) => l.replace(/^ {10}/, '')).join('\n')
    .replaceAll('${{ steps.version.outputs.version }}', version);
  const bodyPath = (/body_path: (\S+)/.exec(wf) || [])[1];
  const dir = mkdtempSync(join(tmpdir(), 'release-'));
  try {
    mkdirSync(join(dir, '.github', 'scripts'), { recursive: true });
    copyFileSync(SCRIPT, join(dir, '.github', 'scripts', 'changelog-section.js'));
    copyFileSync(join(root, 'CHANGELOG.md'), join(dir, 'CHANGELOG.md'));
    writeFileSync(join(dir, bodyPath), notes);
    const run = spawnSync('bash', ['-e', '-c', script], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return readFileSync(join(dir, bodyPath), 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('release.yml\'s append step when run → the release body gets the version\'s guide after the generated notes', () => {
  const notes = '## What\'s Changed in v5.0.0\n\n- feat: x\n';
  const body = runAppendStep('v5.0.0', notes);
  assert.ok(body.startsWith(notes), 'the generated notes come first, untouched');
  assert.equal(body.slice(notes.length), `\n${section(read('CHANGELOG.md'), '5.0.0')}`, 'then a blank line and exactly the 5.0.0 section');
  assert.equal(runAppendStep('v4.7.1', notes), notes, 'a version without a section leaves the notes as they were');
});

test('the npm package → ships CHANGELOG.md and not the release-only script', () => {
  assert.ok(JSON.parse(read('package.json')).files.includes('CHANGELOG.md'));
  const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
  assert.ifError(pack.error);
  assert.equal(pack.status, 0, pack.stderr);
  const files = JSON.parse(pack.stdout)[0].files.map((f) => f.path);
  assert.ok(files.includes('CHANGELOG.md'), 'npm pack --dry-run lists CHANGELOG.md');
  assert.ok(!files.some((f) => f.startsWith('.github/')), 'the release-only script stays out of the package');
});
