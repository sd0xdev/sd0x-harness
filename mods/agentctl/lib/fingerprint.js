// Git-derived hybrid fingerprint (tech spec § 3.4 Evidence, feasibility § 6). Pure: it builds the
// argv lists the hooks module runs through `$.process.run`, and folds their output.
//
// What it covers: HEAD, the index entries, Git's own list of changed and untracked paths, and the raw
// (`--no-filters`) bytes of those changed and untracked paths. Clean tracked paths rely on Git's
// cleanliness check and on its normalization; that is stated in `coverage`, never hidden.

export const TIMEOUT_MS = 5000
export const MAX_HASHED_PATHS = 500

const GIT = ['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false']

export const commands = {
  head: [...GIT, 'rev-parse', '--verify', '-q', 'HEAD'],
  index: [...GIT, 'ls-files', '-s', '-z'],
  flags: [...GIT, 'ls-files', '-v', '-z'],
  status: [...GIT, 'status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=none'],
  hash: [...GIT, 'hash-object', '--no-filters', '--stdin-paths'],
}

// FNV-1a over UTF-16 code units, 2×32 bits with different offsets. Equality only — a tamper-proof
// digest is not the claim (requirements § 2 Non-Goals: not a security boundary).
export function digest(text) {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c ^ (i & 0xff), 0x5bd1e995) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

// porcelain=v2 -z: records are NUL-terminated; a rename/copy record ('2 …') is followed by one more
// NUL-terminated field, its original path.
export function parseStatus(out) {
  const recs = String(out ?? '').split('\0')
  const changed = []
  const reasons = new Set()
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]
    if (!r) continue
    const kind = r[0]
    if (kind === '#') continue
    if (kind === '?') { changed.push(r.slice(2)); continue }
    if (kind === '!') continue
    if (kind === 'u') { reasons.add('unmerged conflict'); changed.push(r.split(' ').slice(10).join(' ')); continue }
    if (kind === '1' || kind === '2') {
      const f = r.split(' ')
      if (f[2] && f[2][0] === 'S') reasons.add('submodule')
      const path = f.slice(kind === '1' ? 8 : 9).join(' ')
      changed.push(path)
      if (kind === '2') i++ // skip the original path field
      continue
    }
    reasons.add('unparsed status record')
  }
  return { changed, reasons: [...reasons] }
}

// `ls-files -v`: a lowercase tag means assume-unchanged, `S` means skip-worktree. Either lets a
// content change hide from status, so the reading is partial.
export function parseFlags(out) {
  const reasons = new Set()
  for (const r of String(out ?? '').split('\0')) {
    if (!r) continue
    const tag = r[0]
    if (tag === 'S') reasons.add('skip-worktree entries')
    else if (tag >= 'a' && tag <= 'z') reasons.add('assume-unchanged entries')
  }
  return [...reasons]
}

// results: { head, index, flags, status, hash } — each { exitCode, stdout } or { error }.
// changed: the paths hashed, in order (from parseStatus).
export function fold(results, changed = []) {
  const reasons = []
  const part = (name) => {
    const r = results[name]
    if (!r) { reasons.push(`${name}: not read`); return '' }
    if (r.error) { reasons.push(`${name}: ${r.error}`); return '' }
    if (name !== 'head' && r.exitCode !== 0) { reasons.push(`${name}: exit ${r.exitCode}`); return '' }
    return r.stdout ?? ''
  }
  // `rev-parse --verify -q HEAD` exits 1 with no output on an unborn branch — the one failure that is
  // a reading. A missing read, a thrown read or any other exit is a failed observation, never "unborn".
  const h = results.head
  let head
  if (!h) { head = 'unknown'; reasons.push('head: not read') }
  else if (h.error) { head = 'unknown'; reasons.push(`head: ${h.error}`) }
  else if (h.exitCode === 0) head = String(h.stdout ?? '').trim()
  else if (h.exitCode === 1 && !String(h.stdout ?? '').trim() && !String(h.stderr ?? '').trim()) head = 'unborn'
  else { head = 'unknown'; reasons.push(`head: exit ${h.exitCode}`) }
  const index = part('index')
  const statusOut = part('status')
  const flagsOut = part('flags')
  const hashOut = changed.length ? part('hash') : ''
  const status = parseStatus(statusOut)
  reasons.push(...status.reasons, ...parseFlags(flagsOut))
  if (changed.length > MAX_HASHED_PATHS) reasons.push(`more than ${MAX_HASHED_PATHS} changed paths`)
  if (changed.length && hashOut.trim().split('\n').filter(Boolean).length !== Math.min(changed.length, MAX_HASHED_PATHS)) {
    reasons.push('hash-object did not answer for every path')
  }
  const value = digest([head, index, statusOut, hashOut].join('\u0001'))
  return {
    value,
    head,
    changedCount: changed.length,
    coverage: reasons.length ? 'partial' : 'git-hybrid',
    reasons: [...new Set(reasons)],
  }
}

export const COVERAGE_NOTE =
  'HEAD, index entries, Git-reported changes, raw bytes of changed and untracked files; clean files rely on Git\'s cleanliness check; ignored files, submodule contents and the environment are not covered'
