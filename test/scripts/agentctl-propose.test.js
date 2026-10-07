'use strict';
// The helper bundled in the agentctl mod (mods/agentctl/bin/propose.mjs, tech spec § 3.7): Claude
// runs it to deliver a drafted scope. It validates with the mod's own reader, writes only the
// worktree's proposal file, and binds nothing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, statSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { join, resolve } = require('node:path');

const HELPER = resolve(__dirname, '../../mods/agentctl/bin/propose.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'agentctl-propose-'));
const run = (args, input, home) => spawnSync('node', [HELPER, ...args], { input, encoding: 'utf8', env: { ...process.env, HOME: home } });

test('--help lists the fields and says the proposal binds nothing', () => {
  const r = run(['--worktree', '/w/repo', '--help'], '', tmp());
  assert.equal(r.status, 0);
  assert.match(r.stdout, /goal\s+string — what the task is/);
  assert.match(r.stdout, /editRoots/);
  assert.match(r.stdout, /The proposal binds nothing: the person accepts it with \/agentctl accept <digest>/);
});

test('a valid draft is written privately to the worktree\'s proposal file and nothing else', () => {
  const home = tmp();
  try {
    const r = run(['--worktree', '/w/repo', '--stdin'], JSON.stringify({ goal: '測試登入', allow: ['edit'], editRoots: ['src/login'], executors: [{ argv: ['npm', 'test'], check: true }], base: null }), home);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.path, join(home, '.claude', 'agentctl', 'proposals', encodeURIComponent('/w/repo') + '.json'));
    assert.equal(statSync(out.path).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(out.path, 'utf8')).goal, '測試登入');
    assert.deepEqual(readdirSync(join(home, '.claude', 'agentctl', 'proposals')), [encodeURIComponent('/w/repo') + '.json']);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('what the mod would refuse is refused here, and nothing is written', () => {
  const home = tmp();
  try {
    for (const [draft, why] of [
      [{ goal: 'ship', executors: [{ argv: ['git', 'push'] }] }, /overlaps forbidden class \(remote-git-write\)/],
      [{ goal: 'x', allow: ['edit'], editRoots: ['../other'] }, /outside the worktree/],
      [{ goal: 'x', worktree: '/elsewhere' }, /names another worktree/],
      ['not json', /not JSON/],
    ]) {
      const r = run(['--worktree', '/w/repo', '--stdin'], typeof draft === 'string' ? draft : JSON.stringify(draft), home);
      assert.equal(r.status, 1);
      assert.match(JSON.parse(r.stdout).errors.join(' '), why);
    }
    assert.equal(existsSync(join(home, '.claude', 'agentctl')), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('an oversized draft and a missing worktree or --stdin are refused', () => {
  const home = tmp();
  try {
    const big = run(['--worktree', '/w/repo', '--stdin'], JSON.stringify({ goal: '界'.repeat(6000) }), home);
    assert.equal(big.status, 1);
    assert.match(big.stdout, /over 16384 bytes/);
    assert.equal(run(['--stdin'], '{}', home).status, 2);
    assert.equal(run(['--worktree', 'relative', '--stdin'], '{}', home).status, 2);
    assert.equal(run(['--worktree', '/w/repo'], '{}', home).status, 2);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('a hand-written heredoc carrying shell syntax in the goal is passed literally', () => {
  const home = tmp();
  try {
    const json = JSON.stringify({ goal: "it's $(id) `x` $HOME", base: null });
    const cmd = `node '${HELPER}' --worktree '/w/repo' --stdin <<'AGENTCTL_DRAFT_1f2e'\n${json}\nAGENTCTL_DRAFT_1f2e\n`;
    const r = spawnSync('/bin/sh', ['-c', cmd], { encoding: 'utf8', env: { ...process.env, HOME: home } });
    assert.equal(JSON.parse(r.stdout).ok, true, r.stdout + r.stderr);
    assert.equal(JSON.parse(readFileSync(JSON.parse(r.stdout).path, 'utf8')).goal, "it's $(id) `x` $HOME");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('review finding: the invocation draftingRequest generates runs through a shell with quotes and spaces in both paths', async () => {
  const { cpSync } = require('node:fs');
  const { draftingRequest } = await import('../../mods/agentctl/lib/firstrun.js');
  const home = tmp();
  try {
    const root = join(home, "plugin's copy");
    cpSync(resolve(__dirname, '../../mods/agentctl'), root, { recursive: true, filter: (src) => !src.includes(join('.claude-plugin', 'types')) });
    const worktree = "/w/repo's tests";
    const goal = 'test login $(id) `x` $HOME';
    const request = draftingRequest({ goal, worktree, base: 'T1', root: join(root, '.claude-plugin'), lang: 'en' });
    const invocation = request.match(/Write it with (node .+? --stdin) \(/)[1];
    const json = JSON.stringify({ goal, base: 'T1' });
    const r = spawnSync('/bin/sh', ['-c', `${invocation} <<'AGENTCTL_JSON'\n${json}\nAGENTCTL_JSON\n`], { encoding: 'utf8', env: { ...process.env, HOME: home } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.path, join(home, '.claude', 'agentctl', 'proposals', encodeURIComponent(worktree) + '.json'));
    assert.deepEqual(JSON.parse(readFileSync(out.path, 'utf8')), { goal, base: 'T1' });
    const help = request.match(/First run (node .+? --help) for the fields/)[1];
    assert.match(spawnSync('/bin/sh', ['-c', help], { encoding: 'utf8' }).stdout, /goal\s+string/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('review finding: a failed write leaves the existing proposal untouched and says so', () => {
  const { mkdirSync, writeFileSync } = require('node:fs');
  const home = tmp();
  try {
    const dir = join(home, '.claude', 'agentctl', 'proposals');
    const file = join(dir, encodeURIComponent('/w/repo') + '.json');
    mkdirSync(dir, { recursive: true });
    const old = JSON.stringify({ goal: 'existing scope', base: null });
    writeFileSync(file, old);
    // Occupy the temporary path with a directory, so the write fails the same way on every OS.
    const bootstrap = `
      const fs = require('node:fs');
      fs.mkdirSync(process.argv[1] + '.' + process.pid + '.tmp');
      const helper = process.argv[2];
      process.argv = [process.execPath, helper, '--worktree', '/w/repo', '--stdin'];
      import(require('node:url').pathToFileURL(helper).href);
    `;
    const r = spawnSync('node', ['-e', bootstrap, file, HELPER], { input: JSON.stringify({ goal: 'replacement scope', base: null }), encoding: 'utf8', env: { ...process.env, HOME: home } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(JSON.parse(r.stdout).errors.join(' '), /proposal could not be written/);
    assert.equal(readFileSync(file, 'utf8'), old);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('review finding: the byte cap is exact, and empty, null, array or a non-string base are refused', () => {
  const home = tmp();
  try {
    const sized = (n) => { const base = JSON.stringify({ goal: '' }); return JSON.stringify({ goal: 'x'.repeat(n - base.length) }); };
    assert.equal(Buffer.byteLength(sized(16384)), 16384);
    assert.equal(run(['--worktree', '/w/repo', '--stdin'], sized(16384), home).status, 0);
    assert.equal(run(['--worktree', '/w/repo', '--stdin'], sized(16385), home).status, 1);
    for (const bad of ['', 'null', '[]', JSON.stringify({ goal: 'x', base: 7 })]) {
      const r = run(['--worktree', '/w/repo', '--stdin'], bad, home);
      assert.equal(r.status, 1, `${bad} → ${r.stdout}`);
      assert.equal(JSON.parse(r.stdout).ok, false);
    }
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('review finding: two worktrees keep separate proposals, and a second draft replaces the first', () => {
  const home = tmp();
  try {
    const a = JSON.parse(run(['--worktree', '/w/a', '--stdin'], JSON.stringify({ goal: 'one' }), home).stdout);
    const b = JSON.parse(run(['--worktree', '/w/b', '--stdin'], JSON.stringify({ goal: 'two' }), home).stdout);
    assert.notEqual(a.path, b.path);
    run(['--worktree', '/w/a', '--stdin'], JSON.stringify({ goal: 'three' }), home);
    assert.equal(JSON.parse(readFileSync(a.path, 'utf8')).goal, 'three');
    assert.equal(JSON.parse(readFileSync(b.path, 'utf8')).goal, 'two');
    assert.equal(statSync(a.path).mode & 0o777, 0o600);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
