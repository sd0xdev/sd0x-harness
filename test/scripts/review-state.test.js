'use strict';
// review-state.js — the single-slot per-plane state store behind the reminder
// hooks. Truth table, content-addressing and repo-key contracts:
// docs/features/hook-lightweighting/2-tech-spec.md §3.2, §6.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  symlinkSync,
  existsSync,
  readdirSync,
} = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');

const SCRIPT = resolve(__dirname, '../../scripts/review-state.js');

const tempDirs = [];
after(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

function git(repo, ...args) {
  execFileSync(
    'git',
    ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function makeRepo() {
  const repo = tmp('rs-repo-');
  git(repo, 'init', '-q');
  writeFileSync(join(repo, 'a.js'), 'const a = 1;\n');
  writeFileSync(join(repo, 'readme.md'), '# doc\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

function run(repo, home, args) {
  return spawnSync('node', [SCRIPT, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' },
  });
}

function checkJson(repo, home) {
  const r = run(repo, home, ['check', '--format=json']);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function note(repo, home, plane, verdict) {
  const r = run(repo, home, ['note', plane, verdict]);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

// The state dir under a private HOME holds exactly the repo keys the test made.
function stateKeys(home) {
  const base = join(home, '.cache', 'sd0x-dev-flow', 'state');
  return existsSync(base) ? readdirSync(base).sort() : [];
}

test('note pass writes the slot, prints it, and resets rounds', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  const out = note(repo, home, 'code_review', 'pass');
  assert.match(out, /^\[REVIEW_STATE\] code_review \{/);
  const keys = stateKeys(home);
  assert.equal(keys.length, 1);
  const slot = JSON.parse(
    readFileSync(join(home, '.cache', 'sd0x-dev-flow', 'state', keys[0], 'code_review.json'), 'utf8'),
  );
  assert.equal(slot.verdict, 'pass');
  assert.equal(slot.rounds, 0);
  assert.match(slot.digest, /^sha256:[0-9a-f]{64}$/);
});

test('note refuses an unknown plane and an invalid verdict loudly, writing nothing', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  const badPlane = run(repo, home, ['note', 'bogus', 'pass']);
  assert.equal(badPlane.status, 1);
  assert.match(badPlane.stderr, /unknown plane/);
  const badVerdict = run(repo, home, ['note', 'code_review', 'maybe']);
  assert.equal(badVerdict.status, 1);
  assert.match(badVerdict.stderr, /invalid verdict/);
  assert.deepEqual(stateKeys(home), []);
});

test('fail increments rounds, pass resets to zero', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  note(repo, home, 'precommit', 'fail');
  note(repo, home, 'precommit', 'fail');
  assert.equal(checkJson(repo, home).precommit.rounds, 2);
  note(repo, home, 'precommit', 'pass');
  assert.equal(checkJson(repo, home).precommit.rounds, 0);
});

test('truth table: clean/unnoted → passed:false owed:false (owed diverges from passed)', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  const planes = checkJson(repo, home);
  for (const name of ['code_review', 'doc_review', 'precommit']) {
    assert.deepEqual(
      { noted: planes[name].noted, dirty: planes[name].dirty, passed: planes[name].passed, owed: planes[name].owed },
      { noted: false, dirty: false, passed: false, owed: false },
      name,
    );
  }
});

test('truth table: clean/noted-pass → passed:true owed:false', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  note(repo, home, 'code_review', 'pass');
  const p = checkJson(repo, home).code_review;
  assert.deepEqual(
    { noted: p.noted, digest_match: p.digest_match, passed: p.passed, owed: p.owed },
    { noted: true, digest_match: true, passed: true, owed: false },
  );
});

test('truth table: dirty/unnoted, dirty/current-pass, dirty/current-fail, dirty/stale', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  // dirty/unnoted → {false, true}
  let p = checkJson(repo, home).code_review;
  assert.deepEqual({ passed: p.passed, owed: p.owed }, { passed: false, owed: true });
  // dirty/current-digest-pass → {true, false}
  note(repo, home, 'code_review', 'pass');
  p = checkJson(repo, home).code_review;
  assert.deepEqual({ passed: p.passed, owed: p.owed }, { passed: true, owed: false });
  // dirty/current-digest-fail → {false, true}
  note(repo, home, 'code_review', 'fail');
  p = checkJson(repo, home).code_review;
  assert.deepEqual({ passed: p.passed, owed: p.owed, verdict: p.verdict }, { passed: false, owed: true, verdict: 'fail' });
  // dirty/stale-digest → {false, true}
  note(repo, home, 'code_review', 'pass');
  writeFileSync(join(repo, 'a.js'), 'const a = 3;\n');
  p = checkJson(repo, home).code_review;
  assert.deepEqual(
    { digest_match: p.digest_match, passed: p.passed, owed: p.owed },
    { digest_match: false, passed: false, owed: true },
  );
});

test('truth table: code_review-pass + precommit-unnoted on one dirty code tree', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  note(repo, home, 'code_review', 'pass');
  const planes = checkJson(repo, home);
  assert.deepEqual(
    { passed: planes.code_review.passed, owed: planes.code_review.owed },
    { passed: true, owed: false },
  );
  assert.deepEqual(
    { passed: planes.precommit.passed, owed: planes.precommit.owed },
    { passed: false, owed: true },
  );
});

test('precommit binds the code digest — doc-only edit leaves it silent, code edit reopens it', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  note(repo, home, 'precommit', 'pass');
  writeFileSync(join(repo, 'readme.md'), '# doc v2\n');
  let planes = checkJson(repo, home);
  assert.equal(planes.precommit.owed, false, 'doc-only edit must not reopen precommit');
  assert.equal(planes.doc_review.owed, true);
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  planes = checkJson(repo, home);
  assert.equal(planes.precommit.owed, true, 'code edit reopens precommit');
});

test('content-addressing: commit keeps the slot matching; revert past the slot re-reminds', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  note(repo, home, 'code_review', 'pass');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'reviewed tree');
  let p = checkJson(repo, home).code_review;
  assert.deepEqual(
    { digest_match: p.digest_match, owed: p.owed },
    { digest_match: true, owed: false },
    'committing the noted tree must not reopen the gate',
  );
  // Revert to the pre-note content: the single slot only knows tree B, so tree A re-reminds.
  writeFileSync(join(repo, 'a.js'), 'const a = 1;\n');
  p = checkJson(repo, home).code_review;
  assert.equal(p.owed, true, 'the single-slot price: a revert past the slot re-reminds');
});

test('the three renderings agree on one fixture, and rounds surface in md', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  note(repo, home, 'code_review', 'pass');
  note(repo, home, 'precommit', 'fail');
  const md = run(repo, home, ['check', '--format=md']);
  const fact = run(repo, home, ['check', '--format=fact']);
  const json = checkJson(repo, home);
  assert.equal(md.status, 0);
  assert.doesNotMatch(md.stdout, /code_review/, 'a passed plane earns no md line');
  assert.match(md.stdout, /precommit.*已 1 輪未過/, 'rounds > 0 surface in the md reminder');
  assert.match(fact.stdout, /reviews=code_review:pass,doc_review:none,precommit:fail\(r1\)/);
  assert.equal(json.code_review.owed, false);
  assert.equal(json.precommit.owed, true);
});

test('md is silent ⇔ fact/json report no owed plane (silence-ambiguity pinned)', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  const md = run(repo, home, ['check', '--format=md']);
  const fact = run(repo, home, ['check', '--format=fact']);
  assert.equal(md.stdout, '', 'clean tree: md silent');
  assert.match(fact.stdout, /^\[AUTO_LOOP_STATE\] change=none /, 'fact still answers');
  const json = checkJson(repo, home);
  assert.equal(Object.values(json).some(p => p.owed), false);
});

test('per-plane files: notes to two planes both survive', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  note(repo, home, 'code_review', 'pass');
  note(repo, home, 'doc_review', 'fail');
  const planes = checkJson(repo, home);
  assert.equal(planes.code_review.noted, true);
  assert.equal(planes.doc_review.noted, true);
  assert.equal(planes.doc_review.verdict, 'fail');
});

test('decoder boundary: missing → noted:false; garbage → noted:false; digest:null slot → noted:true, never digest_match', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  note(repo, home, 'code_review', 'pass');
  const dir = join(home, '.cache', 'sd0x-dev-flow', 'state', stateKeys(home)[0]);
  // Unparseable JSON → noted:false.
  writeFileSync(join(dir, 'code_review.json'), '{torn write');
  assert.equal(checkJson(repo, home).code_review.noted, false);
  // Schema-invalid (verdict not pass|fail) → noted:false.
  writeFileSync(join(dir, 'code_review.json'), JSON.stringify({ digest: 'x', verdict: 'ok', rounds: 0 }));
  assert.equal(checkJson(repo, home).code_review.noted, false);
  // Valid slot with digest:null → noted:true but never digest_match (fail-open to a reminder).
  writeFileSync(join(dir, 'code_review.json'), JSON.stringify({ digest: null, verdict: 'pass', rounds: 0, time: 'x' }));
  const p = checkJson(repo, home).code_review;
  assert.deepEqual({ noted: p.noted, digest_match: p.digest_match, passed: p.passed }, { noted: true, digest_match: false, passed: false });
});

test('undigestable tree (merge conflict) notes digest:null — a reminder, never a silent pass', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  const base = execFileSync('git', ['-C', repo, 'rev-parse', '--abbrev-ref', 'HEAD']).toString().trim();
  git(repo, 'checkout', '-q', '-b', 'other');
  writeFileSync(join(repo, 'a.js'), 'const a = 22;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'other');
  git(repo, 'checkout', '-q', base);
  writeFileSync(join(repo, 'a.js'), 'const a = 33;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  assert.throws(() => git(repo, 'merge', 'other'));
  note(repo, home, 'code_review', 'pass');
  const p = checkJson(repo, home).code_review;
  assert.deepEqual(
    { noted: p.noted, digest_match: p.digest_match, owed: p.owed },
    { noted: true, digest_match: false, owed: true },
  );
});

test('repo-key: symlinked spellings converge on one store', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  const linkParent = tmp('rs-link-');
  symlinkSync(repo, join(linkParent, 'linked'));
  note(repo, home, 'code_review', 'pass');
  note(join(linkParent, 'linked'), home, 'doc_review', 'pass');
  assert.equal(stateKeys(home).length, 1, 'one checkout, two spellings, one store');
});

test('repo-key: two same-named checkouts do not collide; a worktree stays isolated', () => {
  const parentA = tmp('rs-a-');
  const parentB = tmp('rs-b-');
  for (const parent of [parentA, parentB]) {
    const repo = join(parent, 'proj');
    mkdirSync(repo);
    git(repo, 'init', '-q');
    writeFileSync(join(repo, 'a.js'), 'x\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'init');
  }
  const home = tmp('rs-home-');
  note(join(parentA, 'proj'), home, 'code_review', 'pass');
  note(join(parentB, 'proj'), home, 'code_review', 'fail');
  assert.equal(stateKeys(home).length, 2, 'same basename, different checkouts, different stores');
  const wt = join(tmp('rs-wt-'), 'wt');
  execFileSync('git', ['-C', join(parentA, 'proj'), 'worktree', 'add', '-q', wt]);
  note(wt, home, 'code_review', 'pass');
  assert.equal(stateKeys(home).length, 3, 'a worktree neither shares nor clobbers its origin state');
});

// --- intent_hint: exact-name doc mapping on the state-backed fact line ---

test('intent_hint: changed feature doc + exact intent-<key>.md → hint; stray name → none', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  const feat = join(repo, 'docs', 'features', 'x');
  mkdirSync(feat, { recursive: true });
  writeFileSync(join(feat, 'intent-x.md'), '# Intent — x\n');
  writeFileSync(join(feat, '2-tech-spec.md'), '# spec\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'feature docs');

  // Clean tree: no changed paths map, so no hint even though the intent file exists.
  let fact = run(repo, home, ['check', '--format=fact']);
  assert.doesNotMatch(fact.stdout, /intent_hint=/, 'no change → no hint');

  // A changed doc under the feature dir maps to the exact intent file.
  writeFileSync(join(feat, '2-tech-spec.md'), '# spec v2\n');
  fact = run(repo, home, ['check', '--format=fact']);
  assert.match(fact.stdout, /intent_hint=docs\/features\/x\/intent-x\.md/, 'mapped change → hint');
  assert.match(fact.stdout, / source=state\n$/, 'hint rides the state-backed line only');

  // Exact-name contract: a stray intent-<other>.md never hints (spec § 3.5).
  const featY = join(repo, 'docs', 'features', 'y');
  mkdirSync(featY, { recursive: true });
  writeFileSync(join(featY, 'intent-z.md'), '# stray\n');
  writeFileSync(join(featY, '2-tech-spec.md'), '# spec\n');
  fact = run(repo, home, ['check', '--format=fact']);
  assert.doesNotMatch(fact.stdout, /intent-z\.md/, 'stray name must not hint');
  assert.match(fact.stdout, /intent_hint=docs\/features\/x\/intent-x\.md/, 'x still hints');

  // A change outside docs/features/ maps nothing.
  writeFileSync(join(repo, 'a.js'), 'const a = 9;\n');
  fact = run(repo, home, ['check', '--format=fact']);
  assert.match(fact.stdout, /intent_hint=docs\/features\/x\/intent-x\.md/, 'unrelated code change does not add hints');

  // A DIRECTORY named intent-<key>.md is not a readable artifact — no hint (Dirent contract).
  const featW = join(repo, 'docs', 'features', 'w');
  mkdirSync(join(featW, 'intent-w.md'), { recursive: true });
  writeFileSync(join(featW, '2-tech-spec.md'), '# spec\n');
  fact = run(repo, home, ['check', '--format=fact']);
  assert.doesNotMatch(fact.stdout, /intent-w\.md/, 'a directory at the exact name must not hint');

  // A SYMLINK at the exact name is not the artifact either (Dirent types are lstat-like), and
  // a case-alias must not satisfy the byte-exact name comparison on any filesystem.
  const featV = join(repo, 'docs', 'features', 'v');
  mkdirSync(featV, { recursive: true });
  writeFileSync(join(featV, '2-tech-spec.md'), '# spec\n');
  writeFileSync(join(featV, 'real.md'), '# target\n');
  symlinkSync(join(featV, 'real.md'), join(featV, 'intent-v.md'));
  fact = run(repo, home, ['check', '--format=fact']);
  assert.doesNotMatch(fact.stdout, /intent-v\.md/, 'a symlink at the exact name must not hint');
  const featU = join(repo, 'docs', 'features', 'u');
  mkdirSync(featU, { recursive: true });
  writeFileSync(join(featU, '2-tech-spec.md'), '# spec\n');
  writeFileSync(join(featU, 'Intent-u.md'), '# wrong case\n');
  fact = run(repo, home, ['check', '--format=fact']);
  assert.doesNotMatch(fact.stdout, /intent-u\.md/, 'a case-alias must not hint, even on a case-insensitive filesystem');

  // A directory that is not a legal feature slug never reaches the fact line: the one-line
  // field grammar is the output contract, and a name carrying a space (or worse) would be
  // interpolated verbatim. Filesystem-valid, slug-invalid: `x bad`.
  const featBad = join(repo, 'docs', 'features', 'x bad');
  mkdirSync(featBad, { recursive: true });
  writeFileSync(join(featBad, '2-tech-spec.md'), '# spec\n');
  writeFileSync(join(featBad, 'intent-x bad.md'), '# not a slug\n');
  fact = run(repo, home, ['check', '--format=fact']);
  assert.doesNotMatch(fact.stdout, /x bad/, 'a non-slug directory must not reach the fact line');
  assert.equal(fact.stdout.trim().split('\n').length, 1, 'the fact output stays exactly one line');
});

// --- offer / offer-shown (git-autonomy R4, tech spec § 3.3) -----------------------------------

function offerJson(repo, home) {
  const r = run(repo, home, ['offer', '--format=json']);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function passAll(repo, home) {
  for (const p of ['code_review', 'precommit', 'doc_review']) note(repo, home, p, 'pass');
}

/** A repo on `feat/offer` with an upstream on a bare remote, so ahead-of-upstream is measurable. */
function makeRemoteRepo() {
  const repo = makeRepo();
  const bare = tmp('rs-bare-');
  execFileSync('git', ['init', '-q', '--bare', bare]);
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'switch', '-q', '-c', 'feat/offer');
  git(repo, 'push', '-q', '-u', 'origin', 'feat/offer');
  return repo;
}

function writeOverride(repo, body) {
  mkdirSync(join(repo, 'rules'), { recursive: true });
  writeFileSync(join(repo, 'rules', 'git-workflow-project.md'), body);
}

test('offer when every required gate passed on a feature branch → commit+push, once per digest', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  passAll(repo, home);
  const first = offerJson(repo, home);
  assert.equal(first.offer, true, JSON.stringify(first));
  assert.equal(first.kind, 'commit+push');
  assert.equal(first.branch, 'feat/offer');
  assert.match(first.digest, /^sha256:[0-9a-f]{64}$/);
  const shown = run(repo, home, ['offer-shown', first.digest]);
  assert.equal(shown.status, 0, shown.stderr);
  const again = offerJson(repo, home);
  assert.deepEqual([again.offer, again.reason], [false, 'already-offered'], 'a shown menu silences the offer at that digest');
  // A new gate pass at a new digest re-arms it.
  writeFileSync(join(repo, 'a.js'), 'const a = 3;\n');
  passAll(repo, home);
  const rearmed = offerJson(repo, home);
  assert.equal(rearmed.offer, true);
  assert.notEqual(rearmed.digest, first.digest);
});

test('offer when a required plane is open → gates-open, and a doc-only change needs only doc_review', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  note(repo, home, 'code_review', 'pass');
  assert.equal(offerJson(repo, home).reason, 'gates-open', 'precommit not passed');
  git(repo, 'checkout', '-q', '--', 'a.js');
  writeFileSync(join(repo, 'readme.md'), '# doc changed\n');
  note(repo, home, 'doc_review', 'pass');
  const docOnly = offerJson(repo, home);
  assert.equal(docOnly.offer, true, 'doc-only work needs doc_review alone');
});

test('offer on a protected branch → commit-only menu with push_dropped, push-only work → protected', () => {
  const repo = makeRepo(); // default branch of `git init` in the fixture
  git(repo, 'branch', '-M', 'main');
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  passAll(repo, home);
  const r = offerJson(repo, home);
  assert.equal(r.offer, true);
  assert.equal(r.kind, 'commit', 'no push option on a protected branch');
  assert.equal(r.push_dropped, 'protected');
});

test('offer with nothing uncommitted and nothing ahead → nothing-to-do; ahead only → push', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  assert.equal(offerJson(repo, home).reason, 'nothing-to-do');
  writeFileSync(join(repo, 'a.js'), 'const a = 5;\n');
  passAll(repo, home);
  git(repo, 'commit', '-q', '-am', 'ahead');
  const r = offerJson(repo, home);
  assert.deepEqual([r.offer, r.kind], [true, 'push'], JSON.stringify(r));
});

test('offer when push-only work sits on a protected branch → protected, never a push kind', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  git(repo, 'switch', '-q', '-c', 'main');
  git(repo, 'push', '-q', '-u', 'origin', 'main');
  writeFileSync(join(repo, 'a.js'), 'const a = 6;\n');
  passAll(repo, home);
  git(repo, 'commit', '-q', '-am', 'ahead on main');
  const r = offerJson(repo, home);
  assert.deepEqual([r.offer, r.kind, r.reason], [false, 'none', 'protected']);
});

test('offer when the project override cannot be parsed → protected-unknown, never a push kind', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  writeOverride(repo, '# x\n\n## Protected Branches\n\n- !main\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'override');
  writeFileSync(join(repo, 'a.js'), 'const a = 7;\n');
  passAll(repo, home);
  git(repo, 'commit', '-q', '-am', 'ahead');
  const r = offerJson(repo, home);
  assert.deepEqual([r.offer, r.reason], [false, 'protected-unknown']);
  // …and uncommitted work there becomes a commit-only menu, flagged the same way.
  writeFileSync(join(repo, 'a.js'), 'const a = 8;\n');
  passAll(repo, home);
  const c = offerJson(repo, home);
  assert.deepEqual([c.offer, c.kind, c.push_dropped], [true, 'commit', 'protected-unknown']);
});

test('offer under Offer Mode off → disabled; commit-only → commit menu; commented values are ignored', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  writeOverride(repo, '# x\n\n## Offer Mode\n\n<!-- off -->\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'override');
  writeFileSync(join(repo, 'a.js'), 'const a = 9;\n');
  passAll(repo, home);
  assert.equal(offerJson(repo, home).offer, true, 'a commented value is not a setting');
  writeOverride(repo, '# x\n\n## Offer Mode\n\noff\n');
  passAll(repo, home);
  assert.deepEqual([offerJson(repo, home).offer, offerJson(repo, home).reason], [false, 'disabled']);
  writeOverride(repo, '# x\n\n## Offer Mode\n\ncommit-only\n');
  passAll(repo, home);
  const c = offerJson(repo, home);
  assert.deepEqual([c.offer, c.kind, c.push_dropped], [true, 'commit', 'commit-only']);
});

test('offer on a detached HEAD → detached; offer-shown refuses a malformed digest', () => {
  const repo = makeRepo();
  const home = tmp('rs-home-');
  git(repo, 'checkout', '-q', '--detach');
  assert.equal(offerJson(repo, home).reason, 'detached');
  const bad = run(repo, home, ['offer-shown', 'not-a-digest']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /invalid digest/);
});

test('offer --format=md when offer is false → prints nothing; when true → one line naming the menu', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  assert.equal(run(repo, home, ['offer', '--format=md']).stdout, '');
  writeFileSync(join(repo, 'a.js'), 'const a = 10;\n');
  passAll(repo, home);
  const md = run(repo, home, ['offer', '--format=md']).stdout;
  assert.equal(md.trim().split('\n').length, 1);
  assert.match(md, /commit \/ commit and push/);
});

test('offer after a switch to a protected branch at the same digest → kind narrows, so a prior selection is void', () => {
  // The rule: on selection the model re-runs `offer` and proceeds only at the same digest, branch
  // and kind. This pins the data half — the recomputed answer differs where it must.
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 11;\n');
  passAll(repo, home);
  const onFeature = offerJson(repo, home);
  git(repo, 'switch', '-q', '-c', 'release/2026.09');
  const onRelease = offerJson(repo, home);
  assert.equal(onRelease.digest, onFeature.digest, 'same tree, same digest');
  assert.notEqual(onRelease.branch, onFeature.branch);
  assert.deepEqual([onFeature.kind, onRelease.kind], ['commit+push', 'commit'], 'the push option is gone');
});

test('offer when what a push would publish cannot be established → commit-only, flagged ahead-unknown', () => {
  // No upstream and no origin/HEAD: the ahead range is unknown, so an unreviewed commit could ride
  // along with a push. A dirty tree still earns a commit menu, never a push option.
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'feat/no-upstream');
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 12;\n');
  passAll(repo, home);
  const r = offerJson(repo, home);
  assert.deepEqual([r.offer, r.kind, r.push_dropped], [true, 'commit', 'ahead-unknown']);
});

test('offer when ahead commits change a doc and revert it → the doc gate is still required', () => {
  // The net diff is empty; the published history is not. Per-commit paths keep the doc plane owed.
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'readme.md'), '# changed\n');
  git(repo, 'commit', '-q', '-am', 'doc change');
  writeFileSync(join(repo, 'readme.md'), '# doc\n');
  git(repo, 'commit', '-q', '-am', 'doc revert');
  const before = offerJson(repo, home);
  assert.deepEqual([before.offer, before.reason], [false, 'gates-open'], 'ahead commits exist, doc gate not passed');
  note(repo, home, 'doc_review', 'pass');
  note(repo, home, 'code_review', 'pass');
  note(repo, home, 'precommit', 'pass');
  const after = offerJson(repo, home);
  assert.deepEqual([after.offer, after.kind], [true, 'push'], 'a push-only menu once the gates pass');
});

test('offer when an ahead commit renames a doc into code → both classes are required', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  git(repo, 'mv', 'readme.md', 'readme.js');
  git(repo, 'commit', '-q', '-m', 'rename doc to code');
  note(repo, home, 'code_review', 'pass');
  note(repo, home, 'precommit', 'pass');
  assert.equal(offerJson(repo, home).reason, 'gates-open', 'the doc side of the rename still needs doc_review');
  note(repo, home, 'doc_review', 'pass');
  assert.equal(offerJson(repo, home).kind, 'push');
});

test('offer when an ahead merge commit adds a doc during resolution → doc_review is required', () => {
  const repo = makeRemoteRepo();
  const home = tmp('rs-home-');
  git(repo, 'switch', '-q', '-c', 'topic');
  writeFileSync(join(repo, 'a.js'), 'const a = 20;\n');
  git(repo, 'commit', '-q', '-am', 'topic code');
  git(repo, 'switch', '-q', 'feat/offer');
  git(repo, 'merge', '-q', '--no-ff', '--no-commit', 'topic');
  writeFileSync(join(repo, 'notes.md'), '# added while merging\n');
  git(repo, 'add', 'notes.md');
  git(repo, 'commit', '-q', '-m', 'merge topic');
  note(repo, home, 'code_review', 'pass');
  note(repo, home, 'precommit', 'pass');
  assert.equal(offerJson(repo, home).reason, 'gates-open', 'the doc added in the merge commit needs doc_review');
  note(repo, home, 'doc_review', 'pass');
  assert.equal(offerJson(repo, home).kind, 'push');
});

// --- flow-detect / flow-answer (git-autonomy R6) ------------------------------------------------

function flowJson(repo, home) {
  const r = run(repo, home, ['flow-detect', '--format=json']);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('flow-detect when a script merges into a release branch → ask, naming the merge-script signal', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'feat/x');
  mkdirSync(join(repo, 'scripts'));
  writeFileSync(join(repo, 'scripts', 'release.sh'), '#!/bin/sh\ngit checkout release/2026\ngit merge develop\n');
  const r = flowJson(repo, tmp('rs-home-'));
  assert.equal(r.ask, true);
  assert.deepEqual(r.signals.map((s) => s.signal), ['merge-script']);
});

test('flow-detect when a script dispatches a pipeline with no merge → pipeline-trigger', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'feat/x');
  mkdirSync(join(repo, 'scripts'));
  writeFileSync(join(repo, 'scripts', 'deploy.sh'), '#!/bin/sh\ngh workflow run deploy.yml -f env=staging\n');
  assert.deepEqual(flowJson(repo, tmp('rs-home-')).signals.map((s) => s.signal), ['pipeline-trigger']);
});

test('flow-detect when the branch name falls outside the default convention → branch-name', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'JIRA-123-login');
  const r = flowJson(repo, tmp('rs-home-'));
  assert.deepEqual([r.ask, r.signals.map((s) => s.signal)], [true, ['branch-name']]);
  // Ordinary data passes: a conventional feature branch and a protected branch raise nothing.
  git(repo, 'switch', '-q', '-c', 'feat/login');
  assert.equal(flowJson(repo, tmp('rs-home-')).reason, 'no-signal');
});

test('flow-detect with an override present → never asks; never persists; once per session', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'JIRA-9');
  const home = tmp('rs-home-');
  const md = (session) => run(repo, home, ['flow-detect', '--format=md', '--session', session]).stdout;
  assert.match(md('s-1'), /^🧭 /, 'the first check in a session prints the line');
  assert.equal(md('s-1'), '', 'the same session is not reminded twice');
  assert.match(md('s-2'), /^🧭 /, 'a new session is reminded again');
  assert.equal(run(repo, home, ['flow-answer', 'never']).status, 0);
  assert.equal(flowJson(repo, home).reason, 'dismissed');
  assert.equal(md('s-3'), '', 'never for this repo holds across sessions');
  const other = tmp('rs-home-');
  mkdirSync(join(repo, 'rules'));
  writeFileSync(join(repo, 'rules', 'git-workflow-project.md'), '# x\n');
  assert.equal(flowJson(repo, other).reason, 'override-present');
  assert.equal(run(repo, home, ['flow-answer', 'asked']).status, 1, 'only never is recorded');
  assert.equal(run(repo, home, ['flow-detect', '--format=md', '--session', 'bad id']).status, 1, 'a malformed session id is refused');
});

test('flow-detect when a protected name is mentioned away from the merge → no merge-script signal', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'feat/x');
  mkdirSync(join(repo, 'scripts'));
  writeFileSync(join(repo, 'scripts', 'integrate.sh'),
    '#!/bin/sh\ngit switch feat/integration\n\n\n\ngit merge topic\n# main is released elsewhere\n');
  assert.equal(flowJson(repo, tmp('rs-home-')).reason, 'no-signal');
});

test('flow-detect merge target → the branch checked out last, not the merge source, at any distance', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'feat/x');
  mkdirSync(join(repo, 'scripts'));
  const home = tmp('rs-home-');
  // The merge SOURCE is protected, the target is not → no signal.
  writeFileSync(join(repo, 'scripts', 'a.sh'), '#!/bin/sh\ngit switch feat/x\ngit merge develop\n');
  assert.equal(flowJson(repo, home).reason, 'no-signal');
  // The target is checked out several commands before the merge → signal.
  writeFileSync(join(repo, 'scripts', 'a.sh'), '#!/bin/sh\ngit checkout -q release/2026\nnpm ci\nnpm test\nnpm run build\ngit merge topic\n');
  assert.deepEqual(flowJson(repo, home).signals.map((x) => x.signal), ['merge-script']);
});

test('flow-detect in two concurrent sessions → each is reminded once, neither twice', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'JIRA-5');
  const home = tmp('rs-home-');
  const md = (id) => run(repo, home, ['flow-detect', '--format=md', '--session', id]).stdout;
  assert.match(md('A'), /^🧭 /);
  assert.match(md('B'), /^🧭 /);
  assert.equal(md('A'), '', 'session A is not reminded again after B was');
  assert.equal(md('B'), '');
});

test('flow-detect merge target from a CI checkout ref → merge-script signal', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'feat/x');
  mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(repo, '.github', 'workflows', 'release.yml'), [
    'jobs:', '  release:', '    steps:', '      - uses: actions/checkout@v4', '        with:',
    '          ref: release/2026', '      - run: git merge develop', ''].join('\n'));
  assert.deepEqual(flowJson(repo, tmp('rs-home-')).signals.map((x) => x.signal), ['merge-script']);
  // …and a checkout of a non-protected ref is no signal.
  writeFileSync(join(repo, '.github', 'workflows', 'release.yml'), [
    'jobs:', '  it:', '    steps:', '      - uses: actions/checkout@v4', '        with:',
    '          ref: feat/integration', '      - run: git merge develop', ''].join('\n'));
  assert.equal(flowJson(repo, tmp('rs-home-')).reason, 'no-signal');
});

test('flow-detect racing Stop hooks for one session → exactly one prints (exclusive marker)', async () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'JIRA-6');
  const home = tmp('rs-home-');
  const { spawn } = require('node:child_process');
  const once = () => new Promise((res) => {
    const c = spawn('node', [SCRIPT, 'flow-detect', '--format=md', '--session', 'race'], { cwd: repo, env: { ...process.env, HOME: home } });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', () => res(out));
  });
  const outs = await Promise.all(Array.from({ length: 6 }, once));
  assert.equal(outs.filter((o) => o.startsWith('🧭')).length, 1, 'one reminder, however many hooks raced');
  assert.equal(run(repo, home, ['flow-answer', 'never']).status, 0);
  assert.equal(flowJson(repo, home).reason, 'dismissed', 'never survives beside the session markers');
});

test('flow-detect when git global options precede merge → still a merge; quoted text is never a merge', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'feat/x');
  mkdirSync(join(repo, 'scripts'));
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'scripts', 'r.sh'), '#!/bin/sh\ngit switch release/2026\ngit -c merge.ff=false merge develop\n');
  assert.deepEqual(flowJson(repo, home).signals.map((x) => x.signal), ['merge-script']);
  writeFileSync(join(repo, 'scripts', 'r.sh'), '#!/bin/sh\ngit switch release/2026\necho "git merge develop"\n');
  assert.equal(flowJson(repo, home).reason, 'no-signal', 'an echoed command is data');
  writeFileSync(join(repo, 'scripts', 'r.sh'), '#!/bin/sh\ngit checkout -b release/2026.10 origin/develop && git merge topic\n');
  assert.deepEqual(flowJson(repo, home).signals.map((x) => x.signal), ['merge-script'], '-b names the target');
});

test('flow-detect when checkout targets are quoted → read as the branch, and a later non-protected switch clears it', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', '-c', 'feat/x');
  mkdirSync(join(repo, 'scripts'));
  const home = tmp('rs-home-');
  writeFileSync(join(repo, 'scripts', 'r.sh'), '#!/bin/sh\ngit switch "release/2026"\ngit merge develop\n');
  assert.deepEqual(flowJson(repo, home).signals.map((x) => x.signal), ['merge-script']);
  writeFileSync(join(repo, 'scripts', 'r.sh'), "#!/bin/sh\ngit checkout main; git switch 'feat/x'; git merge topic\n");
  assert.equal(flowJson(repo, home).reason, 'no-signal', 'the quoted feat/x is the current target');
});
