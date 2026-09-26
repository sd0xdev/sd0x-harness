'use strict';
// canary-stage.js — the temporary out-of-tree staging log for the rules-residency canary
// (docs/features/rules-residency/2-tech-spec.md § 6, tasks 8a–8c). Every test drives the real CLI
// in a throwaway repository with a throwaway HOME.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawn, spawnSync, execFileSync } = require('node:child_process');

const SCRIPT = resolve(__dirname, '../../scripts/dev/canary-stage.js');
const REVIEW_STATE = resolve(__dirname, '../../scripts/review-state.js');

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
function tmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function makeRepo() {
  const repo = tmp('cs-repo-');
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
  git('init', '-q');
  writeFileSync(join(repo, 'CLAUDE.md'), '# Project rules\n\nKeep the change small.\n');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init');
  return repo;
}

function run(script, repo, home, args) {
  return spawnSync('node', [script, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' } });
}

const BASE = ['record', '--change-id', 'req-2026-09-25-override', '--review-rounds', '2', '--scope-expansions', '0', '--deviations', '1'];

function stagingFile(home) {
  const root = join(home, '.cache', 'sd0x-dev-flow', 'state');
  const [key] = readdirSync(root);
  return join(root, key, 'canary-staging.jsonl');
}

test('record with every required field → one schema-complete line, measured resident chars, count 1/20', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  const r = run(SCRIPT, repo, home, [...BASE, '--contract', 'rules/override-contract.md']);
  assert.equal(r.status, 0, r.stderr);
  const [line, ...rest] = readFileSync(stagingFile(home), 'utf8').trim().split('\n');
  assert.equal(rest.length, 0);
  const rec = JSON.parse(line);
  assert.deepEqual(
    [rec.change_id, rec.review_rounds, rec.scope_expansions, rec.deviations, rec.contracts_activated, rec.resident_tokens, rec.hard_incidents],
    ['req-2026-09-25-override', 2, 0, 1, ['rules/override-contract.md'], null, []],
  );
  assert.equal(rec.resident_chars, readFileSync(join(repo, 'CLAUDE.md'), 'utf8').length, 'the project CLAUDE.md is the whole resident set here');
  assert.match(run(SCRIPT, repo, home, ['count']).stdout, /^\[CANARY_COUNT\] 1\/20 /);
});

test('record → the log lives outside the repository, so the tree stays clean', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  assert.equal(run(SCRIPT, repo, home, BASE).status, 0);
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo }).toString();
  assert.equal(status, '');
});

test('record and review-state note → both land in the same per-repository state directory', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  assert.equal(run(SCRIPT, repo, home, BASE).status, 0);
  assert.equal(run(REVIEW_STATE, repo, home, ['note', 'doc_review', 'pass']).status, 0);
  const dir = join(stagingFile(home), '..');
  assert.ok(existsSync(join(dir, 'doc_review.json')), 'review-state wrote beside the staging log');
});

test('record of an already-staged change id → refused, the log keeps one line', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  assert.equal(run(SCRIPT, repo, home, BASE).status, 0);
  const again = run(SCRIPT, repo, home, BASE);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already staged/);
  assert.equal(readFileSync(stagingFile(home), 'utf8').trim().split('\n').length, 1);
  assert.ok(!existsSync(`${stagingFile(home)}.lock`), 'a refused record releases the lock');
  assert.equal(run(SCRIPT, repo, home, withId('after-refusal')).status, 0, 'and the next record proceeds');
});

test('record missing a required field or given a non-integer → usage error 2, nothing written', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  const missing = run(SCRIPT, repo, home, ['record', '--change-id', 'x', '--review-rounds', '1', '--scope-expansions', '0']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--deviations is required/);
  const bad = run(SCRIPT, repo, home, ['record', '--change-id', 'x', '--review-rounds', 'two', '--scope-expansions', '0', '--deviations', '0']);
  assert.equal(bad.status, 2);
  const blank = run(SCRIPT, repo, home, ['record', '--change-id', '  ', '--review-rounds', '1', '--scope-expansions', '0', '--deviations', '0']);
  assert.equal(blank.status, 2);
  assert.ok(!existsSync(join(home, '.cache')), 'no state directory was created');
});

test('record or count over a log line this script did not write → refused, the log is not appended to', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  assert.equal(run(SCRIPT, repo, home, BASE).status, 0);
  const file = stagingFile(home);
  writeFileSync(file, `${readFileSync(file, 'utf8')}not json\n`);
  const before = readFileSync(file, 'utf8');
  const r = run(SCRIPT, repo, home, ['record', '--change-id', 'next', '--review-rounds', '1', '--scope-expansions', '0', '--deviations', '0']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a staging record/);
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal(run(SCRIPT, repo, home, ['count']).status, 1);
});

test('an unknown subcommand, or count with arguments → usage error 2', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  assert.equal(run(SCRIPT, repo, home, ['reset']).status, 2);
  assert.equal(run(SCRIPT, repo, home, ['count', '--all']).status, 2);
});

const withId = (id) => ['record', '--change-id', id, ...BASE.slice(3)];

test('count on no log → 0/20; two distinct changes → both appended in order and counted 2/20', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  const empty = run(SCRIPT, repo, home, ['count']);
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /^\[CANARY_COUNT\] 0\/20 /);
  assert.equal(run(SCRIPT, repo, home, withId('first-change')).status, 0);
  assert.equal(run(SCRIPT, repo, home, withId('second-change')).status, 0);
  const ids = readFileSync(stagingFile(home), 'utf8').trim().split('\n').map((l) => JSON.parse(l).change_id);
  assert.deepEqual(ids, ['first-change', 'second-change']);
  assert.match(run(SCRIPT, repo, home, ['count']).stdout, /^\[CANARY_COUNT\] 2\/20 /);
});

test('record with repeated optional flags and a measured token count → every value kept, date is ISO', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  const r = run(SCRIPT, repo, home, [...BASE, '--resident-tokens', '42',
    '--contract', 'rules/a.md', '--contract', 'rules/b.md',
    '--hard-incident', 'anchor violation', '--hard-incident', 'destructive git']);
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(readFileSync(stagingFile(home), 'utf8'));
  assert.deepEqual([rec.resident_tokens, rec.contracts_activated, rec.hard_incidents],
    [42, ['rules/a.md', 'rules/b.md'], ['anchor violation', 'destructive git']]);
  assert.equal(new Date(rec.date).toISOString(), rec.date);
});

test('a count too large to represent, a negative or a decimal → usage error 2, nothing written', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  for (const v of ['9'.repeat(309), '9007199254740993', '-1', '1.5']) {
    const r = run(SCRIPT, repo, home, ['record', '--change-id', 'x', '--review-rounds', v, '--scope-expansions', '0', '--deviations', '0']);
    assert.equal(r.status, 2, `value ${v.slice(0, 20)} must be refused`);
  }
  assert.ok(!existsSync(join(home, '.cache')));
});

test('a log line that is valid JSON but not a complete record, a blank line, or a repeated id → refused, nothing appended', () => {
  const cases = {
    'forged partial record': (first) => `${first}{"change_id":"forged"}\n`,
    'blank line between records': (first) => `${first}\n${first.replace('req-2026-09-25-override', 'later')}`,
    'the same change id twice': (first) => `${first}${first}`,
    'record carrying a field this tool never writes': (first) => `${first}${first.replace('req-2026-09-25-override', 'later').replace('"hard_incidents":[]', '"hard_incidents":[],"extra":1')}`,
    'last record without its newline': (first) => first.replace(/\n$/, ''),
  };
  for (const [what, corrupt] of Object.entries(cases)) {
    const repo = makeRepo();
    const home = tmp('cs-home-');
    assert.equal(run(SCRIPT, repo, home, BASE).status, 0);
    const file = stagingFile(home);
    writeFileSync(file, corrupt(readFileSync(file, 'utf8')));
    const before = readFileSync(file, 'utf8');
    assert.equal(run(SCRIPT, repo, home, ['count']).status, 1, `count over a ${what}`);
    assert.equal(run(SCRIPT, repo, home, withId('next-change')).status, 1, `record over a ${what}`);
    assert.equal(readFileSync(file, 'utf8'), before, `the log was appended over a ${what}`);
  }
});

test('two concurrent records for one change → exactly one is appended', async () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  const launch = () => new Promise((res) => {
    const p = spawn('node', [SCRIPT, ...BASE], { cwd: repo, env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' } });
    p.on('close', res);
  });
  const codes = await Promise.all([launch(), launch(), launch()]);
  assert.deepEqual(codes.sort(), [0, 1, 1]);
  assert.equal(readFileSync(stagingFile(home), 'utf8').trim().split('\n').length, 1);
});

test('a lock left by another record → refused after the timeout with the lock named, nothing appended', () => {
  const repo = makeRepo();
  const home = tmp('cs-home-');
  assert.equal(run(SCRIPT, repo, home, BASE).status, 0);
  const file = stagingFile(home);
  writeFileSync(`${file}.lock`, '');
  const r = spawnSync('node', [SCRIPT, ...withId('blocked-change')], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', CANARY_LOCK_TIMEOUT_MS: '200' },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\.lock is held/);
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 1);
});
