'use strict';
// Task autonomy (git-autonomy R8): the pure predicates in scripts/lib/task-autonomy.js and their
// I/O wiring in scripts/review-state.js — policy resolution, the task record, the task branch, the
// auto-commit check and the goal-publish check. Every repository here is a synthetic fixture with an
// isolated HOME and a local bare remote; nothing reaches a real remote.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');
const TA = require('../../scripts/lib/task-autonomy.js');

const SCRIPT = resolve(__dirname, '../../scripts/review-state.js');
const tempDirs = [];
after(() => { for (const d of tempDirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); tempDirs.push(d); return d; };
const git = (repo, ...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...a], { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');

// A repo with a bare `origin` holding `main`, checked out on main.
function makeRepo() {
  const remote = tmp('ta-remote-');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const repo = tmp('ta-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'a.js'), 'const a = 1;\n');
  writeFileSync(join(repo, 'readme.md'), '# doc\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-q', 'origin', 'main');
  return { repo, remote, home: tmp('ta-home-') };
}
const run = (repo, home, args) => spawnSync('node', [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' } });
const json = (r) => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
const adopt = (f) => assert.equal(run(f.repo, f.home, ['policy-decide', 'adopted']).status, 0);
const passAll = (f) => { for (const p of ['code_review', 'doc_review', 'precommit']) assert.equal(run(f.repo, f.home, ['note', p, 'pass']).status, 0); };

// --- pure ---------------------------------------------------------------------------------------

test('resolvePolicy → legacy without the user\'s own decision; new defaults only on adoption', () => {
  assert.deepEqual([TA.resolvePolicy().auto_commit, TA.resolvePolicy().goal_publish, TA.resolvePolicy().adoption], ['off', 'off', 'pending']);
  const a = TA.resolvePolicy({ decision: 'adopted' });
  assert.deepEqual([a.auto_commit, a.goal_publish, a.source], ['on', 'draft', 'adopted']);
  const d = TA.resolvePolicy({ decision: 'declined' });
  assert.deepEqual([d.auto_commit, d.goal_publish, d.adoption], ['off', 'off', 'declined']);
});

test('resolvePolicy → an explicit off beats adoption; an unreadable override narrows; free settings validate', () => {
  const o = TA.resolvePolicy({ decision: 'adopted', override: { auto_commit: { state: 'value', value: 'off' }, goal_publish: { state: 'value', value: 'off' } } });
  assert.deepEqual([o.auto_commit, o.goal_publish, o.adoption], ['off', 'off', 'adopted']);
  const both = TA.resolvePolicy({ override: { auto_commit: { state: 'value', value: 'off' }, goal_publish: { state: 'value', value: 'off' } } });
  assert.equal(both.adoption, 'override', 'two explicit offs settle the question for a user who never answered');
  // A tracked override can only narrow: a teammate's `on` / `draft` is not this user's consent.
  for (const decision of [null, 'declined']) {
    const g = TA.resolvePolicy({ decision, override: { auto_commit: { state: 'value', value: 'on' }, goal_publish: { state: 'value', value: 'draft' } } });
    assert.deepEqual([g.auto_commit, g.goal_publish, g.sources.auto_commit, g.adoption], ['off', 'off', 'override-needs-adoption', decision || 'pending'], String(decision));
  }
  const ok = TA.resolvePolicy({ decision: 'adopted', override: { auto_commit: { state: 'value', value: 'on' } } });
  assert.deepEqual([ok.auto_commit, ok.sources.auto_commit], ['on', 'override']);
  const u = TA.resolvePolicy({ decision: 'adopted', override: { auto_commit: { state: 'unknown' } } });
  assert.equal(u.auto_commit, 'off');
  assert.equal(u.sources.auto_commit, 'override-unreadable');
  const bad = TA.resolvePolicy({ decision: 'adopted', override: { goal_publish: { state: 'value', value: 'ready' }, auto_commit: { state: 'value', value: 'Off' } } });
  assert.deepEqual([bad.goal_publish, bad.auto_commit, bad.sources.goal_publish], ['off', 'off', 'override-invalid'], 'an unrecognised value narrows, never falls back to a grant');
  assert.equal(TA.resolvePolicy({ override: { base_branch: { state: 'value', value: 'develop' } } }).base_branch, 'develop');
  assert.equal(TA.resolvePolicy({ override: { base_branch: { state: 'value', value: '--all' } } }).base_branch, 'main');
  assert.equal(TA.resolvePolicy({ override: { jira_project: { state: 'value', value: 'OK' } } }).jira_project, 'OK');
  assert.equal(TA.resolvePolicy({ override: { jira_project: { state: 'value', value: 'ok-1' } } }).jira_project, null);
});

test('validBranch → rejects option-shaped, traversal, lock and trailing-dot names', () => {
  for (const b of ['codex/task-autonomy', 'feat/OK-12-x', 'main']) assert.ok(TA.validBranch(b), b);
  for (const b of ['-x', '--all', 'a..b', 'a//b', 'x.lock', 'a/', 'a.', 'a@{1}', '', 'a b']) assert.ok(!TA.validBranch(b), b);
});

test('parseStatus → ordinary, staged, untracked, renamed and unmerged entries', () => {
  const s = [
    '1 .M N... 100644 100644 100644 h1 h1 a.js',
    '1 M. N... 100644 100644 100644 h1 h2 b.js',
    '? new file.md',
    '2 R. N... 100644 100644 100644 h1 h1 R100 c.js', 'old.js',
    'u UU N... 100644 100644 100644 100644 h1 h2 h3 d.js',
  ].join('\0');
  const e = TA.parseStatus(s);
  assert.deepEqual(e.map((x) => [x.path, x.kind, x.staged]), [
    ['a.js', 'changed', false], ['b.js', 'changed', true], ['new file.md', 'untracked', false], ['c.js', 'renamed', true], ['d.js', 'unmerged', true],
  ]);
  assert.equal(e[3].orig, 'old.js');
});

const baseTask = (over = {}) => ({ status: 'active', branch: 'feat/x', baseline: { clean: true }, head_chain: ['H'], owned: ['a.js'], ...over });
const okFacts = (over = {}) => ({
  task: baseTask(), policy: { auto_commit: 'on', goal_publish: 'draft' }, branch: 'feat/x', protectedStatus: 1, head: 'H',
  entries: [{ path: 'a.js', kind: 'changed', staged: false }], gatesPassed: true, digest: 'sha256:x', ...over,
});

test('commitCheck → ok only when every condition holds; each failure names itself', () => {
  assert.deepEqual(TA.commitCheck(okFacts()).reasons, []);
  const cases = {
    'no-task': { task: null }, 'policy-off': { policy: { auto_commit: 'off' } }, detached: { branch: null },
    protected: { protectedStatus: 0 }, 'protected-unknown': { protectedStatus: 2 }, 'branch-mismatch': { branch: 'feat/y' },
    'baseline-dirty': { task: baseTask({ baseline: { clean: false } }) }, 'head-moved': { head: 'Z' },
    'nothing-to-do': { entries: [] }, staged: { entries: [{ path: 'a.js', kind: 'changed', staged: true }] },
    unowned: { entries: [{ path: 'a.js', kind: 'changed', staged: false }, { path: 'other-agent.js', kind: 'untracked', staged: false }] },
    'gates-open': { gatesPassed: false }, undigestable: { digest: null },
  };
  for (const [reason, over] of Object.entries(cases)) assert.ok(TA.commitCheck(okFacts(over)).reasons.includes(reason), reason);
  const sens = TA.commitCheck(okFacts({ task: baseTask({ owned: ['a.js', '.env.local'] }), entries: [{ path: 'a.js', kind: 'changed', staged: false }, { path: '.env.local', kind: 'untracked', staged: false }] }));
  assert.deepEqual(sens.sensitive, ['.env.local']);
  for (const p of ['.envrc', '.env-prod', 'config/.env_local', 'dist/bundle.js', 'node_modules/x/index.js', '.cache/x', 'a/b.pem', 'id_rsa.pub']) assert.ok(TA.isSensitive(p), p);
  for (const p of ['src/env.js', 'docs/distribution.md', 'cache.js']) assert.ok(!TA.isSensitive(p), p);
  assert.ok(sens.reasons.includes('sensitive'), 'an excluded file would make the commit a subset of the verified tree');
  const ren = TA.commitCheck(okFacts({ task: baseTask({ owned: ['c.js'] }), entries: [{ path: 'c.js', kind: 'renamed', staged: false, orig: 'old.js' }] }));
  assert.deepEqual(ren.unowned, ['c.js'], 'both sides of a rename must be the task\'s');
});

test('publishCheck → ok only for a clean, verified, non-protected task branch with something ahead', () => {
  const f = (over) => TA.publishCheck({ ...okFacts({ entries: [], task: baseTask({ commits: ['C1'] }) }), ahead: 1, aheadOids: ['C1'], aheadGates: true, ...over });
  assert.deepEqual(f({}).reasons, []);
  assert.ok(f({ ahead: 2, aheadOids: ['C1', 'WIP'] }).reasons.includes('foreign-commits'), 'a commit the task never made never rides along');
  assert.ok(f({ aheadOids: [] }).reasons.includes('foreign-commits'), 'an unread OID list fails closed');
  const cases = {
    'policy-off': { policy: { goal_publish: 'off' } }, protected: { protectedStatus: 0 }, 'protected-unknown': { protectedStatus: 2 },
    dirty: { entries: [{ path: 'a.js' }] }, 'ahead-unknown': { ahead: null }, 'nothing-to-publish': { ahead: 0 },
    'gates-open': { aheadGates: false }, 'unverified-commit': { task: baseTask({ unverified: true, commits: ['C1'] }) }, 'head-moved': { head: 'Z' },
    detached: { branch: null }, 'no-task': { task: null },
  };
  for (const [reason, over] of Object.entries(cases)) assert.ok(f(over).reasons.includes(reason), reason);
});

// --- CLI ----------------------------------------------------------------------------------------

test('policy CLI → legacy by default; adoption recorded once; a fresh manifest and an override decide', () => {
  const f = makeRepo();
  assert.equal(json(run(f.repo, f.home, ['policy', '--format=json'])).adoption, 'pending');
  adopt(f);
  const a = json(run(f.repo, f.home, ['policy', '--format=json']));
  assert.deepEqual([a.auto_commit, a.goal_publish, a.source], ['on', 'draft', 'adopted']);
  mkdirSync(join(f.repo, 'rules'));
  writeFileSync(join(f.repo, 'rules', 'git-workflow-project.md'), '## Auto Commit\n\noff\n\n## Base Branch\n\ndevelop\n');
  const o = json(run(f.repo, f.home, ['policy', '--format=json']));
  assert.deepEqual([o.auto_commit, o.goal_publish, o.base_branch], ['off', 'draft', 'develop'], 'an explicit off survives adoption');
  const g = makeRepo();
  mkdirSync(join(g.repo, '.sd0x'));
  writeFileSync(join(g.repo, '.sd0x', 'install-state.json'), JSON.stringify({ schema_version: 1, policy: TA.POLICY_ID }));
  assert.equal(json(run(g.repo, g.home, ['policy', '--format=json'])).adoption, 'pending', 'a tracked file never adopts for this user');
  assert.notEqual(run(g.repo, g.home, ['policy-decide', 'maybe']).status, 0);
});

test('task start → baseline recorded; a second start refuses without --supersede; end archives', () => {
  const f = makeRepo();
  const t = json(run(f.repo, f.home, ['task', 'start', '--intent', 'add x'])).task;
  assert.equal(t.status, 'active');
  assert.equal(t.baseline.clean, true);
  assert.equal(t.branch, 'main');
  const again = json(run(f.repo, f.home, ['task', 'start', '--intent', 'other']));
  assert.deepEqual([again.ok, again.reason, again.task.id], [false, 'active-task', t.id], 'a continuation keeps its identity');
  const next = json(run(f.repo, f.home, ['task', 'start', '--intent', 'other', '--supersede'])).task;
  assert.notEqual(next.id, t.id, 'a new task gets a new identity');
  const stateRoot = join(f.home, '.cache', 'sd0x-dev-flow', 'state');
  const hist = readFileSync(join(stateRoot, readdirSync(stateRoot)[0], 'task-history.jsonl'), 'utf8');
  assert.match(hist, /"status":"superseded"/);
  assert.equal(run(f.repo, f.home, ['task', 'end', 'completed']).status, 0);
  assert.equal(json(run(f.repo, f.home, ['task', 'show'])).task.status, 'completed');
  assert.notEqual(run(f.repo, f.home, ['task', 'end', 'completed']).status, 0, 'nothing active to end');
  assert.notEqual(run(f.repo, f.home, ['task', 'end', 'done']).status, 0);
});

test('task start on a dirty tree → baseline not clean, so the task never auto-commits', () => {
  const f = makeRepo();
  adopt(f);
  writeFileSync(join(f.repo, 'pre-existing.js'), 'x\n');
  const t = json(run(f.repo, f.home, ['task', 'start', '--intent', 'x'])).task;
  assert.equal(t.baseline.clean, false);
  assert.deepEqual(t.baseline.entries.map((e) => e.path), ['pre-existing.js']);
});

test('task branch → from freshly fetched origin/main, --no-track, base OID recorded', () => {
  const f = makeRepo();
  json(run(f.repo, f.home, ['task', 'start', '--intent', 'x']));
  const b = json(run(f.repo, f.home, ['task', 'branch', 'feat/x']));
  assert.equal(b.ok, true);
  assert.equal(git(f.repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'feat/x');
  assert.equal(b.base.oid, git(f.repo, 'rev-parse', 'refs/remotes/origin/main').trim());
  assert.equal(b.base.name, 'main');
  assert.equal(spawnSync('git', ['-C', f.repo, 'rev-parse', '--abbrev-ref', '@{u}']).status === 0, false, 'no upstream until the first push');
  assert.equal(json(run(f.repo, f.home, ['task', 'branch', 'feat/x'])).reused, true, 'already on the task branch → reused');
});

test('task branch → refuses dirty, existing, unfetchable and missing bases; never a stale ref', () => {
  const f = makeRepo();
  json(run(f.repo, f.home, ['task', 'start', '--intent', 'x']));
  writeFileSync(join(f.repo, 'dirty.js'), 'x\n');
  assert.equal(json(run(f.repo, f.home, ['task', 'branch', 'feat/x'])).reason, 'dirty');
  rmSync(join(f.repo, 'dirty.js'));
  git(f.repo, 'branch', 'feat/exists');
  assert.equal(json(run(f.repo, f.home, ['task', 'branch', 'feat/exists'])).reason, 'exists');
  assert.equal(json(run(f.repo, f.home, ['task', 'branch', 'feat/y', '--base', 'nope'])).reason, 'fetch-failed');
  git(f.repo, 'remote', 'set-url', 'origin', join(f.repo, 'no-such-remote'));
  assert.equal(json(run(f.repo, f.home, ['task', 'branch', 'feat/z'])).reason, 'fetch-failed', 'a failed fetch never falls back to the old origin/main');
  assert.notEqual(run(f.repo, f.home, ['task', 'branch', '--all']).status, 0);
});

function readyTask(f) {
  adopt(f);
  json(run(f.repo, f.home, ['task', 'start', '--intent', 'x']));
  json(run(f.repo, f.home, ['task', 'branch', 'feat/x']));
  writeFileSync(join(f.repo, 'a.js'), 'const a = 2;\n');
  json(run(f.repo, f.home, ['task', 'own', 'a.js']));
}

test('commit-check → ok for an owned, reviewed change; then committed verifies content and cleanliness', () => {
  const f = makeRepo();
  readyTask(f);
  assert.deepEqual(json(run(f.repo, f.home, ['task', 'commit-check'])).reasons, ['gates-open']);
  passAll(f);
  const c = json(run(f.repo, f.home, ['task', 'commit-check']));
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.deepEqual(c.candidate, ['a.js']);
  git(f.repo, 'add', '--', 'a.js');
  git(f.repo, 'commit', '-q', '-m', 'feat: x');
  const done = json(run(f.repo, f.home, ['task', 'committed']));
  assert.deepEqual([done.ok, done.problems], [true, []]);
  assert.equal(done.commits.length, 1);
  assert.equal(json(run(f.repo, f.home, ['task', 'commit-check'])).reasons.includes('nothing-to-do'), true, 'the same content is never committed twice');
});

test('commit-check → an undeclared file (another agent, a stray artefact) stops the auto commit', () => {
  const f = makeRepo();
  readyTask(f);
  writeFileSync(join(f.repo, 'external.js'), 'written by someone else\n');
  passAll(f);
  const c = json(run(f.repo, f.home, ['task', 'commit-check']));
  assert.equal(c.ok, false);
  assert.deepEqual(c.unowned, ['external.js']);
});

test('commit-check → a write after the gate pass reopens the gate; a pre-staged path is not the task\'s', () => {
  const f = makeRepo();
  readyTask(f);
  passAll(f);
  writeFileSync(join(f.repo, 'a.js'), 'const a = 3;\n');
  assert.ok(json(run(f.repo, f.home, ['task', 'commit-check'])).reasons.includes('gates-open'));
  passAll(f);
  git(f.repo, 'add', '--', 'a.js');
  assert.ok(json(run(f.repo, f.home, ['task', 'commit-check'])).reasons.includes('staged'));
});

test('committed → content changed between check and commit marks the task unverified, and publish refuses it', () => {
  const f = makeRepo();
  readyTask(f);
  passAll(f);
  assert.equal(json(run(f.repo, f.home, ['task', 'commit-check'])).ok, true);
  writeFileSync(join(f.repo, 'a.js'), 'const a = 999;\n'); // a write in the window
  git(f.repo, 'add', '--', 'a.js');
  git(f.repo, 'commit', '-q', '-m', 'feat: x');
  const done = json(run(f.repo, f.home, ['task', 'committed']));
  assert.equal(done.ok, false);
  assert.deepEqual(done.problems, ['tree-mismatch']);
  passAll(f);
  assert.ok(json(run(f.repo, f.home, ['goal-publish', '--format=json'])).reasons.includes('unverified-commit'));
});

test('committed → a file left out (not clean) is reported, never silently accepted', () => {
  const f = makeRepo();
  readyTask(f);
  writeFileSync(join(f.repo, 'b.js'), 'b\n');
  json(run(f.repo, f.home, ['task', 'own', 'b.js']));
  passAll(f);
  assert.equal(json(run(f.repo, f.home, ['task', 'commit-check'])).ok, true);
  git(f.repo, 'add', '--', 'a.js');
  git(f.repo, 'commit', '-q', '-m', 'feat: part');
  assert.ok(json(run(f.repo, f.home, ['task', 'committed'])).problems.includes('not-clean'));
});

// R8 acceptance R2: the verified tree is the one the gates passed at, read in one pass. A rewrite
// while the check runs, and any add, delete or mode change after it, cannot ride on that pass.
test('committed → a rewrite while commit-check runs cannot be recorded as verified', () => {
  const f = makeRepo();
  readyTask(f);
  writeFileSync(join(f.repo, 'a.js'), 'const a = 22;\n'); // a size change: status needs no hash
  // A clean filter armed by a file outside the repo: the first hash after arming hands git the
  // content it read, then rewrites the file — a write landing inside the check itself.
  const arm = join(f.home, 'arm');
  const filter = join(f.home, 'mut.sh');
  writeFileSync(filter, `cat\nif [ -f '${arm}' ]; then rm -f '${arm}'; printf 'const a = 666;\\n' > '${join(f.repo, 'a.js')}'; fi\n`);
  git(f.repo, 'config', 'filter.mut.clean', `sh '${filter}'`);
  git(f.repo, 'config', 'filter.mut.smudge', 'cat');
  writeFileSync(join(f.repo, '.git', 'info', 'attributes'), 'a.js filter=mut\n');
  passAll(f);
  writeFileSync(arm, '');
  const c = json(run(f.repo, f.home, ['task', 'commit-check']));
  assert.equal(readFileSync(join(f.repo, 'a.js'), 'utf8'), 'const a = 666;\n', 'the injection must have fired during the check');
  assert.equal(c.ok, true, 'the gates passed at the content the check hashed — the window is real');
  git(f.repo, 'add', '-A');
  git(f.repo, 'commit', '-q', '-m', 'feat: x');
  const done = json(run(f.repo, f.home, ['task', 'committed']));
  assert.equal(done.ok, false, 'content the gates never saw was recorded as verified');
  assert.deepEqual(done.problems, ['tree-mismatch']);
  passAll(f);
  assert.ok(json(run(f.repo, f.home, ['goal-publish', '--format=json'])).reasons.includes('unverified-commit'));
});

for (const [label, mutate] of [
  ['an added path', (repo) => writeFileSync(join(repo, 'added.js'), 'x\n')],
  ['a deleted clean path', (repo) => rmSync(join(repo, 'readme.md'))],
  ['a mode change', (repo) => execFileSync('chmod', ['+x', join(repo, 'a.js')])],
]) {
  test(`committed → ${label} after the check, committed with the rest, is not the verified tree`, () => {
    const f = makeRepo();
    readyTask(f);
    passAll(f);
    assert.equal(json(run(f.repo, f.home, ['task', 'commit-check'])).ok, true);
    mutate(f.repo);
    git(f.repo, 'add', '-A');
    git(f.repo, 'commit', '-q', '-m', 'feat: x');
    const done = json(run(f.repo, f.home, ['task', 'committed']));
    assert.deepEqual([done.ok, done.problems], [false, ['tree-mismatch']]);
    assert.equal(json(run(f.repo, f.home, ['task', 'show'])).task.unverified, true);
  });
}

test('committed → grouped commits verify only their final tree, which must equal the checked one', () => {
  const f = makeRepo();
  readyTask(f);
  writeFileSync(join(f.repo, 'b.js'), 'b\n');
  json(run(f.repo, f.home, ['task', 'own', 'b.js']));
  passAll(f);
  assert.equal(json(run(f.repo, f.home, ['task', 'commit-check'])).ok, true);
  git(f.repo, 'add', '--', 'a.js');
  git(f.repo, 'commit', '-q', '-m', 'feat: a');
  git(f.repo, 'add', '--', 'b.js');
  git(f.repo, 'commit', '-q', '-m', 'feat: b');
  const done = json(run(f.repo, f.home, ['task', 'committed']));
  assert.deepEqual([done.ok, done.problems, done.commits.length], [true, [], 2]);
});

test('goal-publish → ok after a verified commit on the task branch; nothing ahead and protected refuse', () => {
  const f = makeRepo();
  readyTask(f);
  passAll(f);
  json(run(f.repo, f.home, ['task', 'commit-check']));
  git(f.repo, 'add', '--', 'a.js');
  git(f.repo, 'commit', '-q', '-m', 'feat: x');
  json(run(f.repo, f.home, ['task', 'committed']));
  const p = json(run(f.repo, f.home, ['goal-publish', '--format=json']));
  assert.deepEqual([p.ok, p.reasons, p.ahead], [true, [], 1]);
  git(f.repo, 'push', '-q', 'origin', 'feat/x');
  assert.ok(json(run(f.repo, f.home, ['goal-publish', '--format=json'])).reasons.includes('nothing-to-publish'));
  const g = makeRepo();
  adopt(g);
  json(run(g.repo, g.home, ['task', 'start', '--intent', 'x']));
  assert.ok(json(run(g.repo, g.home, ['goal-publish', '--format=json'])).reasons.includes('protected'), 'main is never a goal-publish target');
});

test('task jira and record → validate their inputs and keep facts only', () => {
  const f = makeRepo();
  json(run(f.repo, f.home, ['task', 'start', '--intent', 'x']));
  assert.equal(json(run(f.repo, f.home, ['task', 'jira', 'unknown', '--token', 'abc'])).jira.state, 'unknown');
  assert.notEqual(run(f.repo, f.home, ['task', 'jira', 'created', '--key', 'bad key']).status, 0);
  assert.equal(json(run(f.repo, f.home, ['task', 'jira', 'created', '--key', 'OK-12'])).jira.token, 'abc', 'a later state keeps the readback token');
  assert.notEqual(run(f.repo, f.home, ['task', 'jira', 'approved']).status, 0);
  assert.equal(json(run(f.repo, f.home, ['task', 'record', '--pr', '7', '--ci', 'pending'])).publish.pr, '7');
  assert.notEqual(run(f.repo, f.home, ['task', 'record', '--ci', 'green']).status, 0, 'only the defined CI states');
  assert.notEqual(run(f.repo, f.home, ['task', 'record', '--approved', 'yes']).status, 0, 'no field can record an approval');
  assert.notEqual(run(f.repo, f.home, ['task', 'own', '../x']).status, 0);
});

test('policy-decide → one answer for the repository: a linked worktree reads it and is not asked again', () => {
  const f = makeRepo();
  const wt = join(tmp('ta-wt-'), 'w');
  git(f.repo, 'worktree', 'add', '-q', '-b', 'other', wt);
  assert.equal(json(run(wt, f.home, ['policy', '--format=json'])).adoption, 'pending');
  adopt(f);
  assert.deepEqual([json(run(wt, f.home, ['policy', '--format=json'])).adoption, json(run(wt, f.home, ['policy', '--format=json'])).auto_commit], ['adopted', 'on']);
  json(run(wt, f.home, ['task', 'start', '--intent', 'x']));
  assert.equal(json(run(f.repo, f.home, ['task', 'show'])).task, null, 'the task record stays per worktree');
});

test('goal-publish → a reused branch carrying an earlier unreviewed local commit refuses (foreign-commits)', () => {
  const f = makeRepo();
  adopt(f);
  git(f.repo, 'switch', '-q', '-c', 'feat/y');
  git(f.repo, 'push', '-q', 'origin', 'feat/y');
  writeFileSync(join(f.repo, 'wip.js'), 'wip\n');
  git(f.repo, 'add', '--', 'wip.js');
  git(f.repo, 'commit', '-q', '-m', 'wip, never reviewed');
  json(run(f.repo, f.home, ['task', 'start', '--intent', 'x']));
  assert.equal(json(run(f.repo, f.home, ['task', 'branch', 'feat/y'])).reused, true);
  writeFileSync(join(f.repo, 'a.js'), 'const a = 2;\n');
  json(run(f.repo, f.home, ['task', 'own', 'a.js']));
  passAll(f);
  assert.equal(json(run(f.repo, f.home, ['task', 'commit-check'])).ok, true);
  git(f.repo, 'add', '--', 'a.js');
  git(f.repo, 'commit', '-q', '-m', 'feat: x');
  assert.equal(json(run(f.repo, f.home, ['task', 'committed'])).ok, true);
  const p = json(run(f.repo, f.home, ['goal-publish', '--format=json']));
  assert.equal(p.ahead, 2);
  assert.ok(p.reasons.includes('foreign-commits'), JSON.stringify(p));
});

test('policy-decide --if-pending → an installer never overrides a recorded answer, declined included', () => {
  const f = makeRepo();
  assert.equal(run(f.repo, f.home, ['policy-decide', 'declined']).status, 0);
  const r = run(f.repo, f.home, ['policy-decide', '--if-pending', 'adopted']);
  assert.match(r.stdout, /\[POLICY_KEPT\] declined/);
  assert.equal(json(run(f.repo, f.home, ['policy', '--format=json'])).auto_commit, 'off');
  const g = makeRepo();
  assert.match(run(g.repo, g.home, ['policy-decide', '--if-pending', 'adopted']).stdout, /\[POLICY_DECIDED\] adopted/, 'nothing recorded yet → recorded');
  assert.notEqual(run(g.repo, g.home, ['policy-decide', '--if-pending']).status, 0);
});

test('task branch → `## Base Branch` decides the base when no --base is given', () => {
  const f = makeRepo();
  git(f.repo, 'switch', '-q', '-c', 'develop');
  writeFileSync(join(f.repo, 'dev.js'), 'd\n');
  git(f.repo, 'add', '--', 'dev.js');
  git(f.repo, 'commit', '-q', '-m', 'develop only');
  git(f.repo, 'push', '-q', 'origin', 'develop');
  git(f.repo, 'switch', '-q', 'main');
  mkdirSync(join(f.repo, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(f.repo, '.claude', 'rules', 'git-workflow-project.md'), '## Base Branch\n\ndevelop\n');
  git(f.repo, 'add', '-A');
  git(f.repo, 'commit', '-q', '-m', 'project override'); // a clean tree: the branch is never cut from a dirty one
  json(run(f.repo, f.home, ['task', 'start', '--intent', 'x']));
  const b = json(run(f.repo, f.home, ['task', 'branch', 'feat/d']));
  assert.equal(b.base.name, 'develop');
  assert.equal(b.base.oid, git(f.repo, 'rev-parse', 'refs/remotes/origin/develop').trim());
});
