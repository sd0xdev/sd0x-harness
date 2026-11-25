'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const SCRIPT = resolve(__dirname, '../../scripts/review-scope.js');
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// A PATH entry that logs every git command line before running it.
function tracing() {
  const trace = join(tmp('rs-trace-'), 't');
  const bin = tmp('rs-bin-');
  const gitPath = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$@" >> '${trace}'\nexec '${gitPath}' "$@"\n`, { mode: 0o755 });
  return { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, calls: () => readFileSync(trace, 'utf8').trim().split('\n') };
}

// A clone on feat/x whose destination holds one base commit.
function repo() {
  const bare = tmp('rs-bare-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const dir = tmp('rs-work-');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', bare);
  write(dir, 'base.js', 'const base = 1;\n');
  commit(dir, 'base');
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  git(dir, 'switch', '-q', '-c', 'feat/x');
  git(dir, 'push', '-q', '-u', 'origin', 'feat/x');
  return { dir, bare };
}
function write(dir, p, text) {
  mkdirSync(join(dir, p, '..'), { recursive: true });
  writeFileSync(join(dir, p), text);
}
function commit(dir, msg, ...paths) {
  git(dir, 'add', '-A', ...(paths.length ? ['--', ...paths] : []));
  git(dir, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
}
const run = (dir, ...args) => spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
const ask = (dir, ...a) => run(dir, 'asked', ...a).stdout.split('\n')[0].replace('[REVIEW_REQUEST] ', '');
const push = (dir, reqs, ...extra) => JSON.parse(run(dir, 'push', ...reqs.flatMap((r) => ['--asked', r]), '--format=json', ...extra).stdout);
const said = (dir, reqs, ...extra) => run(dir, 'push', ...reqs.flatMap((r) => ['--asked', r]), ...extra).stdout;
const readings = (r) => r.commits.map((c) => c.reading);

test('UC-1 one commit of exactly the requested edits → asked about, and the push plan says nothing', () => {
  const { dir } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  const req = ask(dir);
  commit(dir, 'a');
  assert.deepEqual(readings(push(dir, [req])), ['asked-about']);
  assert.equal(said(dir, [req]), '');
  assert.match(said(dir, [req], '--all'), /Asked about \(requested scope; not a claim of what was read\): [0-9a-f]{7}/);
});

test('the same request committed in two parts → both asked about', () => {
  const { dir } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  write(dir, 'b.js', 'const b = 1;\n');
  const req = ask(dir);
  commit(dir, 'a', 'a.js');
  commit(dir, 'b', 'b.js');
  assert.deepEqual(readings(push(dir, [req])), ['asked-about', 'asked-about']);
});

test('a byte changed after the request → unknown, never asked about', () => {
  const { dir } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  const req = ask(dir);
  write(dir, 'a.js', 'const a = 2;\n');
  commit(dir, 'a');
  assert.deepEqual(readings(push(dir, [req])), ['unknown']);
  assert.equal(said(dir, [req]), '', 'unknown alone is not volunteered');
  assert.match(said(dir, [req], '--all'), /Not known: [0-9a-f]{7} — no commit holds the content/);
});

test('UC-2 an older commit ahead of the request → named as outside, never as unreviewed', () => {
  const { dir } = repo();
  write(dir, 'old.js', 'const old = 1;\n');
  const old = commit(dir, 'old');
  write(dir, 'new.js', 'const fresh = 1;\n');
  const first = run(dir, 'asked').stdout;
  assert.match(first, new RegExp(`Outside this request: ${old.slice(0, 7)} — ahead of origin/feat/x as known locally; earlier review not known here`));
  const req = ask(dir);
  commit(dir, 'new');
  assert.deepEqual(readings(push(dir, [req])), ['outside', 'asked-about']);
  const line = said(dir, [req]);
  assert.match(line, new RegExp(`^Review scope: ${old.slice(0, 7)} is outside the 1 review request named here; whether reviewed earlier is not known\\n$`));
  assert.doesNotMatch(line + said(dir, [req], '--all'), /unreviewed|not reviewed|covered/i);
});

test('UC-3 three commits, three requests → all asked about; with only the last, the first two are outside it', () => {
  const { dir } = repo();
  const reqs = ['a', 'b', 'c'].map((n) => {
    write(dir, `${n}.js`, `const ${n} = 1;\n`);
    const r = ask(dir);
    commit(dir, n);
    return r;
  });
  assert.deepEqual(readings(push(dir, reqs)), ['asked-about', 'asked-about', 'asked-about']);
  assert.equal(said(dir, reqs), '');
  assert.deepEqual(readings(push(dir, reqs.slice(2))), ['outside', 'outside', 'asked-about']);
});

test('UC-4 no request at hand → every commit unknown and nothing volunteered', () => {
  const { dir } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  commit(dir, 'a');
  assert.deepEqual(readings(push(dir, [])), ['unknown']);
  assert.equal(said(dir, []), '');
  assert.match(said(dir, [], '--all'), /no review is identified[\s\S]*a separate question: review-state\.js offer/);
});

test('a request whose digest is unknown → proves nothing positive, still names what it excludes', () => {
  const { dir } = repo();
  write(dir, 'old.js', 'const o = 1;\n');
  const head = commit(dir, 'old');
  write(dir, 'new.js', 'const n = 1;\n');
  commit(dir, 'new');
  assert.deepEqual(readings(push(dir, [`${head}:unknown`])), ['outside', 'unknown']);
});

test('UC-6 a branch request from a base → the commits in its net change are asked about', () => {
  const { dir } = repo();
  const base = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'a.js', 'const a = 1;\n');
  commit(dir, 'a');
  write(dir, 'b.js', 'const b = 1;\n');
  commit(dir, 'b');
  const req = ask(dir, '--base', base);
  assert.equal(req.split(':').length, 4);
  assert.deepEqual(readings(push(dir, [req])), ['asked-about', 'asked-about']);
});

test('a branch request from a later base → the commit before that base is outside', () => {
  const { dir } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  const base = commit(dir, 'a');
  write(dir, 'b.js', 'const b = 1;\n');
  commit(dir, 'b');
  assert.deepEqual(readings(push(dir, [ask(dir, '--base', base)])), ['outside', 'asked-about']);
});

test('UC-8 a commit and its revert under a net-diff request → both outside it, and both named', () => {
  const { dir } = repo();
  const base = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'base.js', 'const base = 2;\n');
  commit(dir, 'change');
  write(dir, 'base.js', 'const base = 1;\n');
  commit(dir, 'revert');
  write(dir, 'c.js', 'const c = 1;\n');
  commit(dir, 'c');
  assert.deepEqual(readings(push(dir, [ask(dir, '--base', base)])), ['outside', 'outside', 'asked-about']);
});

test('a path that passes through a step the request never contained → both commits unknown', () => {
  const { dir } = repo();
  const base = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'a.js', 'const a = 1;\n');
  commit(dir, 'v1');
  write(dir, 'a.js', 'const a = 2;\n');
  commit(dir, 'v2');
  assert.deepEqual(readings(push(dir, [ask(dir, '--base', base)])), ['unknown', 'unknown']);
});

test('a line old → temporary → final under a request for old → final → the second step is not asked about', () => {
  const { dir } = repo();
  const base = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'base.js', 'const base = "temporary";\n');
  commit(dir, 'temporary');
  write(dir, 'base.js', 'const base = "final";\n');
  commit(dir, 'final');
  assert.deepEqual(readings(push(dir, [ask(dir, '--base', base)])), ['unknown', 'unknown']);
});

test('a range of 30 commits → git work grows with the range, not with its square', () => {
  const { dir } = repo();
  const base = git(dir, 'rev-parse', 'HEAD');
  for (let i = 0; i < 30; i++) { write(dir, `f${i}.js`, `const f = ${i};\n`); commit(dir, `f${i}`); }
  const req = ask(dir, '--base', base);
  const t = tracing();
  const r = JSON.parse(spawnSync('node', [SCRIPT, 'push', '--asked', req, '--format=json'], { cwd: dir, encoding: 'utf8', env: t.env }).stdout);
  assert.deepEqual([...new Set(readings(r))], ['asked-about']);
  assert.ok(t.calls().length < 30 * 3 + 30, `${t.calls().length} git commands`);
});

test('a removed file → read from the change itself', () => {
  const { dir } = repo();
  git(dir, 'rm', '-q', 'base.js');
  const req = ask(dir);
  commit(dir, 'rm');
  assert.deepEqual(readings(push(dir, [req])), ['asked-about']);
});

test('a merge commit → unknown; a docs-only commit → not a code question', () => {
  const { dir } = repo();
  git(dir, 'switch', '-q', '-c', 'side');
  write(dir, 's.js', 'const s = 1;\n');
  commit(dir, 'side');
  git(dir, 'switch', '-q', 'feat/x');
  write(dir, 'n.md', '# n\n');
  commit(dir, 'docs');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge', 'side');
  const req = `${git(dir, 'rev-parse', 'HEAD~1')}:unknown`;
  const r = push(dir, [req]);
  assert.ok(readings(r).includes('docs-only'));
  assert.equal(r.commits[r.commits.length - 1].reading, 'unknown');
});

test('UC-7 an unreachable destination, two push URLs or a tip not held here → range unknown, nothing named', () => {
  const { dir, bare } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  const head = commit(dir, 'a');
  const other = tmp('rs-other-');
  git(other, 'init', '-q', '--bare');
  git(dir, 'remote', 'set-url', '--add', '--push', 'origin', bare);
  git(dir, 'remote', 'set-url', '--add', '--push', 'origin', other);
  assert.equal(push(dir, [`${head}:unknown`]).why, 'the push destination is not a single URL');
  git(dir, 'config', '--unset-all', 'remote.origin.pushurl');
  git(dir, 'remote', 'set-url', 'origin', join(bare, 'missing'));
  const gone = push(dir, [`${head}:unknown`]);
  assert.deepEqual([gone.range, gone.why, gone.commits], ['unknown', 'the push destination did not answer', []]);
  assert.equal(said(dir, [`${head}:unknown`]), '');
});

test('a destination tip not held here → range unknown, nothing named', () => {
  const { dir, bare } = repo();
  const other = tmp('rs-second-');
  git(other, 'clone', '-q', '-b', 'feat/x', bare, '.');
  write(other, 'theirs.js', 'const theirs = 1;\n');
  commit(other, 'theirs');
  git(other, 'push', '-q', 'origin', 'feat/x');
  write(dir, 'a.js', 'const a = 1;\n');
  const a = commit(dir, 'a');
  const r = push(dir, [`${a}:unknown`]);
  assert.deepEqual([r.range, r.why, r.commits], ['unknown', 'the destination tip is not known locally', []]);
  assert.equal(said(dir, [`${a}:unknown`]), '');
});

test('a tree that cannot be read whole → no file count and no digest, never zero files', () => {
  const { dir } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  writeFileSync(join(dir, '.git/index'), 'not an index');
  const out = run(dir, 'asked').stdout;
  assert.match(out, /:unknown\n/);
  assert.match(out, /\(file count not known\)/);
  assert.doesNotMatch(out, /0 files/);
});

test('a quiet push with no request → asks nobody, even where the destination cannot answer', () => {
  const { dir, bare } = repo();
  git(dir, 'remote', 'set-url', 'origin', join(bare, 'missing'));
  const t = tracing();
  const r = spawnSync('node', [SCRIPT, 'push'], { cwd: dir, encoding: 'utf8', env: t.env });
  assert.deepEqual([r.status, r.stdout], [0, '']);
  assert.doesNotMatch(t.calls().join('\n'), /ls-remote|diff-tree/);
});

test('a range past the cap → unknown without reading a single commit', () => {
  const { dir } = repo();
  const tree = git(dir, 'rev-parse', 'HEAD^{tree}');
  let tip = git(dir, 'rev-parse', 'HEAD');
  for (let i = 0; i < 201; i++) tip = git(dir, 'commit-tree', tree, '-p', tip, '-m', 'x');
  git(dir, 'reset', '-q', '--hard', tip);
  const t = tracing();
  const r = JSON.parse(spawnSync('node', [SCRIPT, 'push', '--asked', `${tip}:unknown`, '--format=json'], { cwd: dir, encoding: 'utf8', env: t.env }).stdout);
  assert.deepEqual([r.range, r.why], ['unknown', 'more than 200 commits']);
  assert.doesNotMatch(t.calls().join('\n'), /diff-tree|ls-tree/);
});

test('an upstream that is not where the push goes → the range is the destination\'s, not the upstream\'s', () => {
  const { dir } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  const a = commit(dir, 'a');
  git(dir, 'push', '-q', 'origin', 'feat/x:main');
  git(dir, 'fetch', '-q', 'origin');
  git(dir, 'branch', '-q', '--set-upstream-to=origin/main', 'feat/x');
  const req = `${a}:unknown`;
  assert.deepEqual(push(dir, [req]).commits.map((c) => [c.oid, c.reading]), [[a, 'outside']], 'origin/feat/x still lacks it');
});

test('a branch the destination lacks → counted from its default branch, and said so', () => {
  const { dir } = repo();
  git(dir, 'switch', '-q', '-c', 'feat/new');
  write(dir, 'a.js', 'const a = 1;\n');
  const a = commit(dir, 'a');
  const r = push(dir, [`${a}:unknown`]);
  assert.deepEqual([r.range, r.newBranch, readings(r)], ['default-branch', true, ['outside']]);
  assert.match(said(dir, [`${a}:unknown`]), /counted from its default branch, so what the push adds there is not known/);
});

test('a missing branch whose commit is on another destination branch → labelled even when every reading is positive', () => {
  const { dir } = repo();
  git(dir, 'switch', '-q', '-c', 'feat/new');
  write(dir, 'a.js', 'const a = 1;\n');
  const req = ask(dir);
  commit(dir, 'a');
  git(dir, 'push', '-q', 'origin', 'feat/new:feat/elsewhere');
  const r = push(dir, [req]);
  assert.deepEqual([r.range, readings(r)], ['default-branch', ['asked-about']]);
  assert.match(said(dir, [req], '--all'), /Range: the destination lacks this branch; counted from its default branch, so what the push adds there is not known/);
});

test('a missing branch at the default tip → creating it is said, never "nothing to publish"', () => {
  const { dir } = repo();
  git(dir, 'switch', '-q', '-c', 'feat/new');
  const out = said(dir, [], '--all');
  assert.match(out, /the push creates this branch on the destination, with no commit beyond its default branch/);
  assert.doesNotMatch(out, /Nothing to publish/);
});

test('UC-4 and UC-5 asked on demand → what is recorded and what is not known, whatever the slot holds', () => {
  const { dir } = repo();
  const env = { ...process.env, HOME: tmp('rs-home-'), CLAUDE_PROJECT_DIR: '' };
  const state = (...a) => spawnSync('node', [resolve(__dirname, '../../scripts/review-state.js'), ...a], { cwd: dir, env, encoding: 'utf8' });
  const all = () => spawnSync('node', [SCRIPT, 'push', '--all'], { cwd: dir, env, encoding: 'utf8' }).stdout;
  write(dir, 'a.js', 'const a = 1;\n');
  assert.match(all(), /Recorded code review: none;/);
  assert.equal(state('note', 'code_review', 'pass').status, 0);
  commit(dir, 'a');
  assert.match(all(), /no review is identified[\s\S]*Recorded code review: pass for the code in the work tree now; a record does not say what the review was asked about/);
  write(dir, 'a.js', 'const a = 2;\n');
  commit(dir, 'a2');
  assert.match(all(), /Recorded code review: pass, not shown to match the code in the work tree now/);
  assert.equal(spawnSync('node', [SCRIPT, 'push'], { cwd: dir, env, encoding: 'utf8' }).stdout, '', 'not volunteered');
  assert.equal(state('note', 'code_review', 'pass').status, 0);
  writeFileSync(join(dir, '.git/index'), 'not an index');
  const unread = all();
  assert.match(unread, /Recorded code review: pass, not shown to match/, 'a comparison that could not be made');
  assert.doesNotMatch(unread, /different code/);
});

test('a replacement ref → no reading at all', () => {
  const { dir } = repo();
  write(dir, 'a.js', 'const a = 1;\n');
  const a = commit(dir, 'a');
  git(dir, 'replace', a, git(dir, 'rev-parse', 'HEAD~1'));
  assert.equal(push(dir, []).why, 'replacement refs are present');
});

test('a path that is not UTF-8 → read by its bytes, not as missing', { skip: process.platform === 'darwin' && 'APFS refuses such names' }, () => {
  const { dir } = repo();
  writeFileSync(Buffer.concat([Buffer.from(join(dir, 'x')), Buffer.from([0xff]), Buffer.from('.js')]), 'const x = 1;\n');
  const req = ask(dir);
  commit(dir, 'x');
  assert.deepEqual(readings(push(dir, [req])), ['asked-about']);
});

test('malformed input → a usage error that names no range', () => {
  const { dir } = repo();
  for (const args of [['push', '--asked', 'nope'], ['push', '--asked'], ['asked', '--base', 'main'], ['push', '--frobnicate'], ['bogus'], ['push', '--asked', `${'a'.repeat(40)}:unknown`]]) {
    const r = run(dir, ...args);
    assert.deepEqual([r.status, r.stdout], [2, ''], args.join(' '));
  }
  assert.equal(run(tmp('rs-none-'), 'push').status, 2);
});

test('both commands → leave the repository, the index and the review slots as they were', () => {
  const { dir } = repo();
  const home = tmp('rs-home-');
  write(dir, 'a.js', 'const a = 1;\n');
  const before = [git(dir, 'status', '--porcelain'), git(dir, 'rev-parse', 'HEAD'), readFileSync(join(dir, '.git/index')).toString('hex')];
  for (const args of [['asked'], ['push', '--all']]) spawnSync('node', [SCRIPT, ...args], { cwd: dir, env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.deepEqual([git(dir, 'status', '--porcelain'), git(dir, 'rev-parse', 'HEAD'), readFileSync(join(dir, '.git/index')).toString('hex')], before);
  assert.equal(execFileSync('ls', ['-A', home], { encoding: 'utf8' }), '');
});

test('an ambient GIT_DIR → ignored: the working directory decides the repository', () => {
  const { dir } = repo();
  const other = repo();
  const r = spawnSync('node', [SCRIPT, 'asked'], { cwd: dir, env: { ...process.env, GIT_DIR: join(other.dir, '.git') }, encoding: 'utf8' });
  assert.ok(r.stdout.includes(git(dir, 'rev-parse', 'HEAD')));
});
