'use strict';

// Pure classification behind scripts/review-scope.js (review-coverage-visibility spec § 3.3): what the
// requests named in this conversation were asked about, for the commits a push would publish.

// A request is { base, head, digest }: `base` is what its net change is measured from (its own head
// for a review of uncommitted work), `digest` the code-plane digest of the tree it was made on.
// `git` answers what this needs, so tests and the CLI share one rule; each is asked at most once per
// request or per commit, never per pair:
//   reachable(base)  the set of range commits that `base` contains
//   rows(base)       [{ oid, parents }] of base..tip, or null
//   tree(rev)        Map path → '<mode> <oid>'; throws when it cannot be read
//   codeDigest(rev)  the code-plane digest of a commit, or null

// The single-parent line from `base` (exclusive) up to `target`, as a set, or null.
function lineTo(target, base, parentsOf) {
  const line = new Set();
  for (let at = target; at !== base; at = parentsOf.get(at)[0]) {
    const parents = parentsOf.get(at);
    if (!parents || parents.length !== 1) return null;
    line.add(at);
  }
  return line;
}

// What one request says about every range commit, as a function of the commit and its place.
function readerOf(request, range, git) {
  const { base, digest } = request;
  const below = git.reachable(base);
  const rows = digest ? git.rows(base) : null;
  const parentsOf = new Map((rows || []).map((r) => [r.oid, r.parents]));
  // The commits that hold exactly the content the request was made on.
  const holders = !digest ? [] : range.map((c, at) => ({ oid: c.oid, at })).filter((h) => git.codeDigest(h.oid) === digest);
  const lines = new Map();
  const line = (oid) => { if (!lines.has(oid)) lines.set(oid, lineTo(oid, base, parentsOf)); return lines.get(oid); };
  return (commit, at) => {
    if (below.has(commit.oid)) return { reading: 'outside' };
    if (commit.merge) return { reading: 'unknown', why: 'a merge commit' };
    if (!digest) return { reading: 'unknown', why: 'the request has no content digest' };
    const later = holders.filter((h) => h.at >= at);
    if (!later.length) return { reading: 'unknown', why: 'no commit holds the content the request was made on' };
    const target = later.find((h) => line(h.oid) && line(h.oid).has(commit.oid));
    if (!target) return { reading: 'unknown', why: 'the history between is not a single line' };
    const was = git.tree(base);
    const now = git.tree(target.oid);
    const entry = (tree, p) => tree.get(p) || null;
    const inNet = commit.changes.filter((c) => entry(now, c.path) !== entry(was, c.path));
    if (inNet.length === 0) return { reading: 'outside' };
    // Both ends must be the request's own: a step in between was never in the change it asked about.
    const exact = commit.changes.every((c) => c.before === entry(was, c.path) && c.after === entry(now, c.path));
    return exact ? { reading: 'asked-about' } : { reading: 'unknown', why: 'part of it is not in the requested change as committed' };
  };
}

function safely(read) {
  return (commit, at) => {
    try { return read(commit, at); } catch { return { reading: 'unknown', why: 'a tree could not be read' }; }
  };
}

// range: the published commits, oldest first, each { oid, merge, changes: [{ path, before, after }] }.
function classify(range, requests, git) {
  const readers = requests.map((r) => safely(readerOf(r, range, git)));
  return range.map((commit, at) => {
    if (!commit.merge && commit.changes.length === 0) return { oid: commit.oid, reading: 'docs-only' };
    if (requests.length === 0) return { oid: commit.oid, reading: 'unknown', why: 'no review is identified' };
    const each = readers.map((read, i) => ({ ...read(commit, at), i }));
    const asked = each.filter((e) => e.reading === 'asked-about').map((e) => e.i);
    if (asked.length) return { oid: commit.oid, reading: 'asked-about', requests: asked };
    if (each.every((e) => e.reading === 'outside')) return { oid: commit.oid, reading: 'outside' };
    return { oid: commit.oid, reading: 'unknown', why: each.find((e) => e.reading === 'unknown').why };
  });
}

const short = (oid) => oid.slice(0, 7);
const names = (oids, cap = 8) => `${oids.slice(0, cap).map(short).join(', ')}${oids.length > cap ? `, +${oids.length - cap} more` : ''}`;

const NEW_BRANCH = 'the destination lacks this branch; counted from its default branch, so what the push adds there is not known';

// The push plan's line. Quiet by default: nothing is said unless a commit can be named as outside.
function pushLines(result, { all = false } = {}) {
  const lines = [];
  const of = (r) => result.commits.filter((c) => c.reading === r).map((c) => c.oid);
  const recorded = all && result.recorded ? [`Recorded code review: ${result.recorded}; a record does not say what the review was asked about`] : [];
  if (result.range === 'unknown') return all ? [`Review scope: not known — ${result.why}`, ...recorded] : [];
  const outside = of('outside');
  const asked = of('asked-about');
  const n = result.requests;
  if (outside.length) lines.push(`Review scope: ${names(outside)} ${outside.length === 1 ? 'is' : 'are'} outside the ${n} review request${n === 1 ? '' : 's'} named here; whether reviewed earlier is not known${result.newBranch ? ` (${NEW_BRANCH})` : ''}`);
  if (all) {
    if (asked.length) lines.push(`Asked about (requested scope; not a claim of what was read): ${names(asked)}`);
    const unknown = result.commits.filter((c) => c.reading === 'unknown');
    for (const c of unknown.slice(0, 20)) lines.push(`Not known: ${short(c.oid)} — ${c.why}`);
    if (unknown.length > 20) lines.push(`Not known: +${unknown.length - 20} more`);
    const docs = of('docs-only');
    if (docs.length) lines.push(`No code-plane path: ${names(docs)}`);
    if (result.newBranch) lines.push(result.commits.length ? `Range: ${NEW_BRANCH}` : 'Range: the push creates this branch on the destination, with no commit beyond its default branch');
    else if (!result.commits.length) lines.push('Nothing to publish');
    lines.push(...recorded);
    lines.push('Whether the push may be offered is a separate question: review-state.js offer');
  }
  return lines;
}

// The review report's sentence.
function askedLines(a) {
  const files = a.files === null ? 'file count not known' : `${a.files} file${a.files === 1 ? '' : 's'}`;
  const what = a.base === a.head || !a.base
    ? `the uncommitted code changes against ${short(a.head)} (${files})`
    : `the net code change from ${short(a.base)}, uncommitted work included (${files})`;
  const out = [`Asked about: ${what}. What the reviewer read is not recorded.`];
  if (a.outside.length) {
    out.push(`Outside this request: ${names(a.outside)} — ahead of ${a.rangeFrom} as known locally; earlier review not known here.`);
  }
  return out;
}

module.exports = { classify, pushLines, askedLines };
