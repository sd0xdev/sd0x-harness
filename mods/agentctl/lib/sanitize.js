// Redaction applied before every store write and every reply (requirements NFR-9, tech spec § 3.4).
// Data minimization comes first: callers persist only allowlisted fields; this module removes what
// can still hide inside them — a token in an argument, a credential in a URL, a secret assignment.

export const CAPS = { requested: 500, reason: 300, handoff: 16 * 1024 }

const SECRET_KEY = /(token|secret|pass(word|wd)?|api[_-]?key|key|auth|cookie|credential|session)/i

function redactUrl(url) {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*@)?([^?#]*)(\?[^#]*)?(#.*)?$/i, (m, scheme, userinfo, rest, query, frag) =>
    `${scheme}${userinfo ? '<redacted>@' : ''}${rest}${query ? '?<redacted>' : ''}${frag ? '#<redacted>' : ''}`)
}

export function sanitize(text, cap = CAPS.requested) {
  if (text === undefined || text === null) return ''
  let s = redact(String(text), 0)
  if (s.length > cap) s = s.slice(0, Math.max(0, cap - 1)) + '…'
  return s
}

// Quoted segments are redacted from the inside first (`sh -c "tool --token x"`), so a later pattern
// that consumes a whole quoted value can never carry a secret past the redaction.
function redact(input, depth) {
  let s = input
  if (depth < 3) {
    s = s.replace(/"([^"]*)"|'([^']*)'/g, (m, dq, sq) => (dq !== undefined ? `"${redact(dq, depth + 1)}"` : `'${redact(sq, depth + 1)}'`))
  }
  // URLs: userinfo, query and fragment can each carry a credential.
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`<>]+/gi, (u) => redactUrl(u))
  // scp-like git remotes with a user part: token@host:path
  s = s.replace(/(^|[\s'"=])([^\s@'"/:]+)@([a-z0-9.-]+):(?!\/\/)/gi, (m, pre, user, host) => `${pre}<redacted>@${host}:`)
  // Authorization headers and bearer tokens.
  s = s.replace(/\b(authorization\s*:\s*)(bearer|basic|token)?\s*[^\s'"]+/gi, (m, h, kind) => `${h}${kind ? kind + ' ' : ''}<redacted>`)
  s = s.replace(/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer <redacted>')
  // KEY=value assignments whose key names a secret (env prefixes, inline exports, config flags).
  s = s.replace(/\b([A-Za-z_][A-Za-z0-9_.-]*)=("[^"]*"|'[^']*'|[^\s'"]+)/g, (m, k) => (SECRET_KEY.test(k) ? `${k}=<redacted>` : m))
  // Flags whose name says secret, in both `--flag=value` and `--flag value` forms. The same predicate
  // as assignments, so `--key`, `--private-key`, `--api-key`, `--token`, `--password` all match.
  s = s.replace(/(^|\s)(--?[A-Za-z][A-Za-z0-9-]*)(=|\s+)("[^"]*"|'[^']*'|[^\s'"-][^\s'"]*)/g,
    (m, pre, flag, sep, val) => (SECRET_KEY.test(flag.replace(/^-+/, '')) ? `${pre}${flag}${sep}<redacted>` : m))
  return s
}

// A path outside the worktree is shown relative to the home directory, never in full.
export function displayPath(path, { worktree, home } = {}) {
  const p = String(path ?? '')
  if (worktree && (p === worktree || p.startsWith(worktree + '/'))) return p.slice(worktree.length + 1) || '.'
  if (home && (p === home || p.startsWith(home + '/'))) return '~' + p.slice(home.length)
  return p
}
