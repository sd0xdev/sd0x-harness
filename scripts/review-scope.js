#!/usr/bin/env node
'use strict';

// What a code review was asked about, and which commits a push would publish outside it.
// Read-only and on demand: it writes nothing, gates nothing and changes no eligibility.
//   node scripts/review-scope.js asked [--base <oid>] [--format=md|json]
//   node scripts/review-scope.js push [--asked <head>:<digest|unknown>[:<base>]]... [--all] [--format=md|json]
// Design: docs/features/review-coverage-visibility/2-tech-spec.md.

const { execFileSync } = require('child_process');
const path = require('path');
const { computeTreeState, digestOfRev, planeOf } = require('./lib/tree-digest');
const { classify, pushLines, askedLines } = require('./lib/review-scope');

const OID = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const REQUEST = /^([0-9a-f]{40,64}):(sha256:[0-9a-f]{64}|unknown)(?::([0-9a-f]{40,64}))?$/;
const RANGE_CAP = 200;

function die(msg) {
  process.stderr.write(`review-scope: ${msg}\n`);
  process.exit(2);
}

// The repository comes from the working directory alone, as in tree-digest.
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return { ...env, GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
}

function git(root, argv, opts = {}) {
  try {
    return execFileSync('git', ['-C', root, '-c', 'advice.graftFileDeprecated=false', ...argv], { env: cleanEnv(), encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
  } catch {
    return null;
  }
}

const trimmed = (s) => (s === null ? null : s.trim() || null);

// Commits `from..to` oldest first with their code-plane paths. Per commit, not the net change: a push
// publishes every one of them.
// `cap` bounds the work, not only the answer: past it nothing is read per commit.
function commitsOf(root, from, to, cap = Infinity) {
  if (Number.isFinite(cap)) {
    const n = trimmed(git(root, ['rev-list', '--count', `--max-count=${cap + 1}`, `${from}..${to}`]));
    if (n === null) return null;
    if (Number(n) > cap) return 'too-many';
  }
  const revs = git(root, ['rev-list', '--reverse', '--topo-order', '--parents', `${from}..${to}`]);
  if (revs === null) return null;
  const out = [];
  for (const line of revs.split('\n').filter(Boolean)) {
    const [oid, ...parents] = line.split(' ');
    const raw = git(root, ['diff-tree', '-r', '-z', '--raw', '--no-abbrev', '--no-renames', '--no-commit-id', ...(parents.length ? [parents[0], oid] : ['--root', oid])], { encoding: 'latin1' });
    if (raw === null) return null;
    out.push({ oid, parents, merge: parents.length > 1, changes: changesOf(raw).filter((c) => planeOf(c.path) === 'code') });
  }
  return out;
}

// `:<mode> <mode> <oid> <oid> <status>` NUL `<path>` NUL; a missing side has mode 000000.
function changesOf(raw) {
  const parts = raw.split('\0');
  const side = (mode, oid) => (mode === '000000' ? null : `${mode} ${oid}`);
  const out = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [m1, m2, o1, o2] = parts[i].slice(1).split(' ');
    out.push({ path: parts[i + 1], before: side(m1, o1), after: side(m2, o2) });
  }
  return out;
}

// Whole trees as latin1, so a path keeps its bytes; an unreadable tree throws rather than reading empty.
function gitReader(root, from, head) {
  const memo = new Map();
  const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };
  const list = (...argv) => {
    const out = git(root, ['rev-list', '--parents', ...argv]);
    return out === null ? null : out.split('\n').filter(Boolean).map((l) => l.split(' ')).map(([oid, ...parents]) => ({ oid, parents }));
  };
  return {
    reachable: (base) => once(`r ${base}`, () => {
      const rows = list(base, `^${from}`);
      if (rows === null) throw new Error('unreadable history');
      return new Set(rows.map((r) => r.oid));
    }),
    rows: (base) => once(`l ${base}`, () => list(`${base}..${head}`)),
    tree: (rev) => {
      const tree = once(`t ${rev}`, () => {
        const out = git(root, ['ls-tree', '-r', '-z', '--full-tree', rev], { encoding: 'latin1' });
        if (out === null) return null;
        return new Map(out.split('\0').filter(Boolean).map((r) => {
          const [mode, , oid] = r.slice(0, r.indexOf('\t')).split(' ');
          return [r.slice(r.indexOf('\t') + 1), `${mode} ${oid}`];
        }));
      });
      if (tree === null) throw new Error('unreadable tree');
      return tree;
    },
    codeDigest: (rev) => once(`d ${rev}`, () => (digestOfRev(root, rev) || { code: null }).code),
  };
}

// What the review slot holds, read through its own command. It never enters the scope reading.
function recordedReview(root) {
  try {
    const c = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'review-state.js'), 'check', '--format=json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).code_review;
    if (!c.noted) return 'none';
    // No match is either another content or one that could not be compared; the slot does not say which.
    return c.digest_match ? `${c.verdict} for the code in the work tree now` : `${c.verdict}, not shown to match the code in the work tree now`;
  } catch {
    return 'could not be read';
  }
}

// The commits the push destination does not hold, read from the destination itself. The same rules
// as the Goal publish check in review-state.js: one push URL, no second rewrite, a live tip that is an
// ancestor of HEAD. Anything else is unknown, and an unknown range names nothing.
function destinationRange(root, head) {
  const branch = trimmed(git(root, ['symbolic-ref', '--short', '-q', 'HEAD']));
  if (!branch) return { why: 'no branch is checked out' };
  const urls = (git(root, ['remote', 'get-url', '--push', '--all', 'origin']) || '').split('\n').filter(Boolean);
  if (urls.length !== 1) return { why: 'the push destination is not a single URL' };
  const again = trimmed(git(root, ['ls-remote', '--get-url', '--', urls[0]]));
  if (again !== urls[0]) return { why: 'the push URL is rewritten a second time' };
  const adv = git(root, ['ls-remote', '--upload-pack=git-upload-pack', '--', urls[0], `refs/heads/${branch}`, 'HEAD'], { timeout: 20000 });
  if (adv === null) return { why: 'the push destination did not answer' };
  const rows = adv.split('\n');
  const row = rows.find((l) => l.endsWith(`\trefs/heads/${branch}`));
  // A branch the destination lacks is counted from its default branch, and said to be.
  const deflt = row ? null : rows.find((l) => l.endsWith('\tHEAD'));
  if (!row && !deflt) return { why: 'the destination has neither this branch nor a default one' };
  const tip = (row || deflt).split('\t')[0];
  if (!OID.test(tip) || git(root, ['cat-file', '-e', `${tip}^{commit}`]) === null) return { why: 'the destination tip is not known locally' };
  if (row && git(root, ['merge-base', '--is-ancestor', tip, head]) === null) return { why: 'the destination tip is not an ancestor of HEAD' };
  return { from: tip, newBranch: !row };
}

// The locally known range, for the report only: it names its reference, and a push reading never uses it.
function localRange(root) {
  const up = trimmed(git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']));
  const upOid = up && trimmed(git(root, ['rev-parse', '--verify', '@{u}^{commit}']));
  if (upOid) return { from: upOid, label: up };
  const def = trimmed(git(root, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']));
  const mb = def && trimmed(git(root, ['merge-base', 'HEAD', def]));
  return mb ? { from: mb, label: `the merge base with ${def}` } : null;
}

function parse(argv) {
  const o = { asked: [], all: false, format: 'md' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') o.all = true;
    else if (a === '--asked' || a === '--base') {
      const v = argv[++i];
      if (v === undefined) die(`${a} needs a value`);
      if (a === '--base') o.base = v; else o.asked.push(v);
    } else if (a.startsWith('--format=')) o.format = a.slice('--format='.length);
    else die(`unknown argument "${a}"`);
  }
  if (!['md', 'json'].includes(o.format)) die(`unknown format "${o.format}" — valid: md, json`);
  return o;
}

function asked(root, o) {
  const head = trimmed(git(root, ['rev-parse', '--verify', 'HEAD^{commit}']));
  if (!head) die('HEAD names no commit');
  let base = null;
  if (o.base !== undefined) {
    if (!OID.test(o.base)) die('--base needs a full object id');
    base = trimmed(git(root, ['rev-parse', '--verify', `${o.base}^{commit}`]));
    if (!base || git(root, ['merge-base', '--is-ancestor', base, head]) === null) die('--base is not an ancestor of HEAD');
  }
  const tree = computeTreeState(root).planes.code;
  const paths = new Set(tree.dirty);
  if (base) for (const p of (git(root, ['diff-tree', '-r', '-z', '--name-only', '--no-renames', base, head], { encoding: 'latin1' }) || '').split('\0')) if (p && planeOf(p) === 'code') paths.add(p);
  const local = localRange(root);
  const ahead = local ? commitsOf(root, local.from, head, RANGE_CAP) : null;
  const edge = base || head;
  const inEdge = new Set(((local && git(root, ['rev-list', edge, `^${local.from}`])) || '').split('\n'));
  const outside = (Array.isArray(ahead) ? ahead : []).filter((c) => (c.merge || c.changes.length) && inEdge.has(c.oid)).map((c) => c.oid);
  const out = {
    head, base, code: tree.partial || tree.digest === null ? 'unknown' : tree.digest,
    // A tree that could not be read whole has no count; zero would be a claim.
    files: tree.partial ? null : paths.size,
    outside, rangeFrom: local ? local.label : null,
  };
  if (o.format === 'json') return process.stdout.write(`${JSON.stringify(out)}\n`);
  process.stdout.write(`[REVIEW_REQUEST] ${head}:${out.code}${base ? `:${base}` : ''}\n${askedLines(out).join('\n')}\n`);
}

function classifyRange(root, from, head, range, requests) {
  try {
    return classify(range, requests, gitReader(root, from, head));
  } catch {
    return range.map((c) => ({ oid: c.oid, reading: 'unknown', why: 'the history could not be read' }));
  }
}

function push(root, o) {
  const head = trimmed(git(root, ['rev-parse', '--verify', 'HEAD^{commit}']));
  if (!head) die('HEAD names no commit');
  const requests = o.asked.map((v) => {
    const m = REQUEST.exec(v);
    if (!m) die(`--asked "${v.slice(0, 80)}" is not <head>:<digest>[:<base>]`);
    return { head: m[1], digest: m[2] === 'unknown' ? null : m[2], base: m[3] || m[1] };
  });
  for (const r of requests) for (const oid of [r.head, r.base]) if (git(root, ['cat-file', '-e', `${oid}^{commit}`]) === null) die(`--asked names a commit that is not here: ${oid.slice(0, 12)}`);
  // Without a request nothing can be named, so the quiet reading asks nobody.
  if (!requests.length && !o.all && o.format === 'md') return;
  // Replacement refs change what a commit reads as, and the digests honor them: no reading then.
  const replaced = git(root, ['for-each-ref', '--count=1', 'refs/replace/']);
  const dest = replaced === null || replaced.trim() ? { why: 'replacement refs are present' } : destinationRange(root, head);
  let result = { range: 'unknown', why: dest.why, requests: requests.length, commits: [] };
  if (dest.from) {
    const range = commitsOf(root, dest.from, head, RANGE_CAP);
    if (range === null) result.why = 'the range could not be read';
    else if (range === 'too-many') result.why = `more than ${RANGE_CAP} commits`;
    // Counted from the default branch, the range is not what the push adds to the destination.
    else result = { range: dest.newBranch ? 'default-branch' : 'known', from: dest.from, newBranch: dest.newBranch, head, requests: requests.length, commits: classifyRange(root, dest.from, head, range, requests) };
  }
  if (o.all) result.recorded = recordedReview(root);
  if (o.format === 'json') return process.stdout.write(`${JSON.stringify(result)}\n`);
  const lines = pushLines(result, { all: o.all });
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
}

const [cmd, ...rest] = process.argv.slice(2);
const root = trimmed(git(process.cwd(), ['rev-parse', '--show-toplevel']));
if (!root) die('not in a git repository');
if (cmd === 'asked') asked(root, parse(rest));
else if (cmd === 'push') push(root, parse(rest));
else die('usage: review-scope.js asked [--base <oid>] | push [--asked <head>:<digest>[:<base>]]... [--all]  (--format=md|json)');
