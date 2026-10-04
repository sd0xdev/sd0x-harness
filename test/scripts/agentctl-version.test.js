'use strict';
// The agentctl mod's release lock (.github/scripts/agentctl-version.js) and the workflows that use it:
// a change to the mod needs a version bump, because Claude Code caches an installed plugin by version.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const lock = require('../../.github/scripts/agentctl-version');

const root = resolve(__dirname, '../..');
const MOD = join(root, 'mods', 'agentctl');
const read = (p) => readFileSync(join(root, p), 'utf8');

// A scratch copy of the mod, so each case can change files without touching the repository.
function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'agentctl-lock-'));
  cpSync(MOD, dir, { recursive: true, filter: (src) => !src.includes(join('.claude-plugin', 'types')) });
  return dir;
}
// Versions relative to the one committed, so a release never breaks these cases.
const CUR = JSON.parse(readFileSync(join(MOD, 'release.json'), 'utf8')).version;
const bump = (v, i = 2) => v.split('.').map((x, j) => (j === i ? Number(x) + 1 : j > i ? 0 : Number(x))).join('.');
const esc = (v) => v.replace(/\./g, '\\.');
function setVersion(dir, v) {
  const p = join(dir, '.claude-plugin', 'plugin.json');
  writeFileSync(p, JSON.stringify({ ...JSON.parse(readFileSync(p, 'utf8')), version: v }, null, 2) + '\n');
}

test('the repository\'s lock matches the mod as committed', () => {
  const r = lock.check(MOD);
  assert.equal(r.ok, true, r.message);
});

test('a code change without a version bump fails and says to bump', () => {
  const d = copy();
  try {
    writeFileSync(join(d, 'lib', 'verdict.js'), readFileSync(join(d, 'lib', 'verdict.js'), 'utf8') + '\n// changed\n');
    const r = lock.check(d);
    assert.equal(r.ok, false);
    assert.match(r.message, /changed but its version is still/);
    assert.equal(lock.update(d).ok, false, 'update refuses until the version goes up');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a README-only or test-only change needs no release', () => {
  const d = copy();
  try {
    writeFileSync(join(d, 'README.md'), readFileSync(join(d, 'README.md'), 'utf8') + '\nA typo fix.\n');
    writeFileSync(join(d, 'tests', 'extra.test.ts'), '// a new test\n');
    assert.equal(lock.check(d).ok, true);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a bump without update fails, and update then records it', () => {
  const d = copy();
  try {
    writeFileSync(join(d, 'lib', 'view.js'), readFileSync(join(d, 'lib', 'view.js'), 'utf8') + '\n// changed\n');
    setVersion(d, bump(CUR));
    assert.match(lock.check(d).message, new RegExp(`is at ${esc(bump(CUR))} but release\\.json records ${esc(CUR)}`));
    assert.equal(lock.update(d).written, true);
    assert.equal(lock.check(d).ok, true);
    assert.equal(JSON.parse(readFileSync(join(d, 'release.json'), 'utf8')).version, bump(CUR));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('update refuses a version that is not newer, and a missing lock says how to create it', () => {
  const d = copy();
  try {
    setVersion(d, '0.0.1');
    assert.match(lock.update(d).message, new RegExp(`not newer than the recorded ${esc(CUR)}`));
    rmSync(join(d, 'release.json'));
    assert.match(lock.check(d).message, /release\.json is missing/);
    assert.equal(existsSync(join(d, 'release.json')), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('newer compares dotted versions numerically', () => {
  assert.equal(lock.newer('0.1.10', '0.1.9'), true);
  assert.equal(lock.newer('1.0.0', '0.9.9'), true);
  assert.equal(lock.newer('0.1.0', '0.1.0'), false);
  assert.equal(lock.newer('0.1.0', '0.2.0'), false);
});

test('CI runs the lock and the mod\'s own validate and tests on a pinned Claude Code', () => {
  const ci = read('.github/workflows/ci.yml');
  const job = ci.slice(ci.indexOf('  agentctl:'));
  assert.match(job, /CLAUDE_CODE_VERSION: \d+\.\d+\.\d+/);
  assert.match(job, /npm install -g "@anthropic-ai\/claude-code@\$\{CLAUDE_CODE_VERSION\}"/);
  assert.match(job, /working-directory: mods\/agentctl\n\s+run: claude plugin validate \./);
  assert.match(job, /working-directory: mods\/agentctl\n\s+run: claude plugin test \./);
});

test('the mod releases under agentctl-v tags, and the plugin release reads only its own v tags', () => {
  const rel = read('.github/workflows/release-agentctl.yml');
  assert.match(rel, /paths: \[mods\/agentctl\/\.claude-plugin\/plugin\.json\]/);
  assert.match(rel, /echo "tag=agentctl-v\$\{VERSION\}"/);
  assert.match(rel, /--match 'agentctl-v\*'/);
  assert.match(rel, /make_latest: false/);
  assert.ok(rel.indexOf('agentctl-version.js check') > 0 && rel.indexOf('agentctl-version.js check') < rel.indexOf('Create tag and release'), 'the lock is checked before releasing');
  assert.match(read('.github/workflows/release.yml'), /git describe --tags --match 'v\*' --abbrev=0/);
});

test('/bump-version agentctl bumps only the mod, from its own version, and records the lock', () => {
  const s = read('skills/bump-version/SKILL.md');
  assert.match(s, /## Step 0: Choose the Target/);
  assert.match(s, /\| `\/bump-version agentctl \[patch\\\|minor\\\|major\\\|<version>\]` \| the agentctl mod only \| \*\*Step 3b only\*\*/);
  assert.match(s, /This step runs \*\*instead\s+of\*\* Steps 1–3, never after them/);
  assert.match(s, /from \*\*its own\*\* current version — never to the plugin's version/);
  assert.match(s, /node \.github\/scripts\/agentctl-version\.js update/);
});

test('regression: a hand-rewritten digest with an unchanged version fails against the base lock', () => {
  const d = copy();
  try {
    const base = { ...JSON.parse(readFileSync(join(d, 'release.json'), 'utf8')), ref: 'origin/main' };
    writeFileSync(join(d, 'lib', 'policy.js'), readFileSync(join(d, 'lib', 'policy.js'), 'utf8') + '\n// changed\n');
    writeFileSync(join(d, 'release.json'), JSON.stringify({ version: base.version, digest: lock.digest(d) }) + '\n');
    assert.equal(lock.check(d).ok, true, 'the lock alone only proves itself');
    const r = lock.check(d, { base });
    assert.equal(r.ok, false);
    assert.match(r.message, new RegExp(`changed since origin/main but its version ${esc(CUR)} is not newer than ${esc(CUR)}`));
    setVersion(d, bump(CUR));
    lock.update(d);
    assert.equal(lock.check(d, { base }).ok, true, 'a real bump against the same base passes');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('lockAt: an unresolvable ref is an error, never a pass', () => {
  assert.match(lock.lockAt(root, 'refs/heads/no-such-branch-xyz').error, /cannot resolve/);
  assert.equal(lock.lockAt(root, 'HEAD').error, undefined);
});

test('CI and the release compare the lock with a base', () => {
  const ci = read('.github/workflows/ci.yml');
  const job = ci.slice(ci.indexOf('  agentctl:'));
  assert.match(job, /fetch-depth: 0/);
  assert.match(job, /pull_request\) BASE="origin\/\$BASE_REF"/);
  assert.match(job, /push\) BASE="\$BEFORE"/);
  assert.match(job, /check --base "\$BASE"/);
  assert.match(job, /BASE_REF: \$\{\{ github\.base_ref \}\}/, 'event data reaches the shell through env, not inline');
  assert.match(read('.github/workflows/release-agentctl.yml'), /check --base "\$LAST_TAG"/);
});
