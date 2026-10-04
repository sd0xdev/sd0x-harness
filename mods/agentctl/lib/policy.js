// Task-scoped classifier (requirements FR-7, FR-8, FR-25; tech spec § 3.4). Pure: no `$`, no I/O.
// Outcomes: pass (to the host's own permission path), deny (by rule), needs-user, unknown.
// Order matters and deny wins: forbidden classes are matched before any adapter or executor.

import { checkAdapter } from './adapters.js'
import { sanitize as redactLike } from './sanitize.js'

// Built-in hard classes, always forbidden whatever the task says. Each is a word sequence matched as
// an in-order subsequence of the command's non-option words, so flags and option values placed
// between them (`kubectl --context prod rollout restart`, `git -C . push`) do not hide the match.
// Matching more than the class intends refuses more, which is the safe direction.
export const HARD_FORBIDDEN = [
  { rule: 'production-write', words: ['kubectl', 'apply'] },
  { rule: 'production-write', words: ['kubectl', 'delete'] },
  { rule: 'production-write', words: ['kubectl', 'patch'] },
  { rule: 'production-write', words: ['kubectl', 'rollout'] },
  { rule: 'production-write', words: ['kubectl', 'scale'] },
  { rule: 'production-write', words: ['kubectl', 'edit'] },
  { rule: 'production-write', words: ['kubectl', 'replace'] },
  { rule: 'production-write', words: ['helm', 'install'] },
  { rule: 'production-write', words: ['helm', 'upgrade'] },
  { rule: 'production-write', words: ['helm', 'uninstall'] },
  { rule: 'production-write', words: ['helm', 'rollback'] },
  { rule: 'production-write', words: ['gcloud', 'deploy'] },
  { rule: 'production-write', words: ['gcloud', 'delete'] },
  { rule: 'production-write', words: ['gcloud', 'update'] },
  { rule: 'remote-git-write', words: ['git', 'push'] },
  { rule: 'remote-git-write', words: ['gh', 'pr', 'merge'] },
]

const EDIT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit'])
// Host-internal tools that change nothing outside the session: asking the user, the todo list,
// reading a background task's status. Refusing them would only break supervision itself.
// ToolSearch only loads tool schemas; every tool it loads is still classified when it is called.
export const INTERNAL_TOOLS = new Set(['AskUserQuestion', 'TodoWrite', 'GetTask', 'ToolSearch'])

// ── Tokenizer ───────────────────────────────────────────────────────────────────────────────────
// Splits a command into pipeline segments of argv words. Anything beyond plain words, single and
// double quotes and `|` between segments makes the command unclassifiable: substitution, expansion
// inside double quotes, redirection, `;`, `&&`, `||`, `&`, newlines, backslash escapes, globs that
// a shell would expand are all refused rather than interpreted.
export function tokenize(command) {
  const s = String(command ?? '')
  const segments = []
  let argv = []
  let word = null
  let i = 0
  const push = () => { if (word !== null) { argv.push(word); word = null } }
  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t') { push(); i++; continue }
    if (c === '|') {
      if (s[i + 1] === '|') return { ok: false, why: 'operator ||' }
      push()
      if (argv.length === 0) return { ok: false, why: 'empty pipeline segment' }
      segments.push(argv); argv = []; i++; continue
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1)
      if (end < 0) return { ok: false, why: 'unbalanced quote' }
      word = (word ?? '') + s.slice(i + 1, end); i = end + 1; continue
    }
    if (c === '"') {
      const end = s.indexOf('"', i + 1)
      if (end < 0) return { ok: false, why: 'unbalanced quote' }
      const inner = s.slice(i + 1, end)
      if (/[$`\\!]/.test(inner)) return { ok: false, why: 'expansion inside double quotes' }
      word = (word ?? '') + inner; i = end + 1; continue
    }
    // `~` expands only at the start of a word (`~/x`), so `HEAD~1` is a plain word.
    if (c === '~' && word === null) return { ok: false, why: 'shell syntax "~"' }
    if (/[;&<>()`$\\\n\r{}*?[\]!#]/.test(c)) return { ok: false, why: `shell syntax ${JSON.stringify(c)}` }
    word = (word ?? '') + c; i++
  }
  push()
  if (argv.length === 0) return segments.length ? { ok: false, why: 'empty pipeline segment' } : { ok: false, why: 'empty command' }
  segments.push(argv)
  return { ok: true, segments }
}

// Leading NAME=value words are inline environment assignments, separated from the argv.
export function splitEnv(argv) {
  const env = {}
  let i = 0
  while (i < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i])) {
    const eq = argv[i].indexOf('=')
    env[argv[i].slice(0, eq)] = argv[i].slice(eq + 1)
    i++
  }
  return { env, argv: argv.slice(i) }
}

function words(argv) {
  return argv.filter((a) => !a.startsWith('-'))
}

function isSubsequence(needle, hay) {
  let j = 0
  for (const w of hay) if (w === needle[j] && ++j === needle.length) return true
  return needle.length === 0
}

function toWords(cls) {
  return Array.isArray(cls) ? cls : String(cls).trim().split(/\s+/).filter(Boolean)
}

export function forbiddenClasses(task) {
  const custom = (task?.forbid ?? []).map((c) => ({ rule: `task-forbid: ${toWords(c).join(' ')}`, words: toWords(c) }))
  return [...HARD_FORBIDDEN, ...custom]
}

function matchForbidden(argvFull, classes) {
  // Match on every word, including those after an env prefix or a wrapper (`sudo`, `env`), so a
  // wrapper never hides a forbidden class.
  const w = words(argvFull)
  for (const c of classes) if (isSubsequence(c.words, w)) return c
  return null
}

function startsWith(argv, prefix) {
  if (!Array.isArray(prefix) || prefix.length === 0 || prefix.length > argv.length) return false
  return prefix.every((p, k) => argv[k] === p)
}

// ── Paths ───────────────────────────────────────────────────────────────────────────────────────
export function normalizePath(p, base) {
  const raw = String(p ?? '')
  if (!raw) return null
  const abs = raw.startsWith('/') ? raw : `${base ?? ''}/${raw}`
  const out = []
  for (const seg of abs.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') { if (out.length === 0) return null; out.pop(); continue }
    out.push(seg)
  }
  return '/' + out.join('/')
}

function inside(path, root) {
  return path === root || path.startsWith(root + '/')
}

// ── Classification ──────────────────────────────────────────────────────────────────────────────
// call: { tool, command?, file_path?, notebook_path? }  task: the bound task, or null.
export function classify(task, call) {
  if (!task) return { outcome: 'pass', rule: 'no task bound — observe only' }
  const tool = call?.tool
  // A binding whose record is missing: only the Read tool inside the worktree, whose path is checked,
  // passes. Bash is refused outright — an observational command's paths are not verified here.
  if (task.recordMissing) {
    return tool === 'Read' ? classifyTool(task, call) : { outcome: 'deny', rule: 'task record missing: only reads inside the worktree' }
  }
  if (tool === 'Bash') return classifyBash(task, call.command)
  return classifyTool(task, call)
}

function classifyBash(task, command) {
  const t = tokenize(command)
  if (!t.ok) return { outcome: 'unknown', rule: `unclassifiable: ${t.why}` }
  const classes = forbiddenClasses(task)
  for (const seg of t.segments) {
    const hit = matchForbidden(seg, classes)
    if (hit) return { outcome: 'deny', rule: hit.rule }
  }
  if (t.segments.length === 1) {
    const { env, argv } = splitEnv(t.segments[0])
    if (Object.keys(env).length === 0) {
      for (const n of task.needsUser ?? []) if (startsWith(argv, n)) return { outcome: 'needs-user', rule: `needs-user: ${n.join(' ')}` }
    }
  }
  let allAdapters = true
  for (const seg of t.segments) {
    const { env, argv } = splitEnv(seg)
    if (!checkAdapter(argv, env).ok) { allAdapters = false; break }
  }
  if (allAdapters) return { outcome: 'pass', rule: 'observational adapter' }
  if (t.segments.length === 1) {
    const { env, argv } = splitEnv(t.segments[0])
    if (Object.keys(env).length === 0) {
      for (const e of task.executors ?? []) if (startsWith(argv, e.argv)) return { outcome: 'pass', rule: `authorized executor: ${e.argv.join(' ')}`, executor: e }
    }
  }
  const first = splitEnv(t.segments[0]).argv
  const why = checkAdapter(first, splitEnv(t.segments[0]).env).why
  return { outcome: 'unknown', rule: `unclassified: ${why}` }
}

function classifyTool(task, call) {
  const tool = call?.tool
  const worktree = normalizePath(task.worktree, '/')
  if (tool === 'Read') {
    const p = normalizePath(call.file_path, worktree)
    return p && worktree && inside(p, worktree) ? { outcome: 'pass', rule: 'read inside the worktree' } : { outcome: 'deny', rule: 'read outside the worktree' }
  }
  if (EDIT_TOOLS.has(tool)) {
    if (!(task.allow ?? []).includes('edit')) return { outcome: 'deny', rule: 'edits not allowed by this task' }
    const p = normalizePath(call.file_path ?? call.notebook_path, worktree)
    const roots = (task.editRoots ?? ['.']).map((r) => normalizePath(r, worktree)).filter(Boolean)
    return p && roots.some((r) => inside(p, r)) ? { outcome: 'pass', rule: 'edit inside an allowed root' } : { outcome: 'deny', rule: 'edit outside the allowed roots' }
  }
  if (INTERNAL_TOOLS.has(tool)) return { outcome: 'pass', rule: `host-internal tool: ${tool}` }
  if ((task.tools ?? []).includes(tool)) return { outcome: 'pass', rule: `tool named by the task: ${tool}` }
  return { outcome: 'unknown', rule: `tool not classified: ${tool}` }
}

// ── Task validation (at `/agentctl task set`) ──────────────────────────────────────────────────────
export function validateTask(task) {
  const errors = []
  if (!task || typeof task !== 'object') return { ok: false, errors: ['task must be an object'] }
  // A task id becomes a store key and is shown everywhere: a bounded identifier, never free text.
  if (task.id !== undefined && (typeof task.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(task.id) || redactLike(task.id) !== task.id)) {
    errors.push('id must be 1-64 letters, digits, dot, underscore or hyphen, and carry no credential')
  }
  if (!task.goal || typeof task.goal !== 'string') errors.push('goal is required')
  if (!task.worktree || typeof task.worktree !== 'string' || !task.worktree.startsWith('/')) errors.push('worktree must be an absolute path')
  for (const k of ['executors', 'needsUser', 'forbid', 'allow', 'editRoots', 'tools']) {
    if (task[k] !== undefined && !Array.isArray(task[k])) errors.push(`${k} must be an array`)
  }
  if (errors.length) return { ok: false, errors }
  for (const e of task.executors ?? []) if (!Array.isArray(e.argv) || e.argv.length === 0 || !e.argv.every((x) => typeof x === 'string')) errors.push('each executor needs a non-empty argv array')
  for (const n of task.needsUser ?? []) if (!Array.isArray(n) || n.length === 0) errors.push('each needsUser entry must be a non-empty argv array')
  // A credential in a policy value would be stored and shown verbatim; such a task is refused.
  const secretLike = (argv) => argv.join(' ') !== redactLike(argv.join(' '))
  for (const e of task.executors ?? []) if (Array.isArray(e.argv) && secretLike(e.argv)) errors.push('an executor carries a credential-like value; keep secrets out of the task')
  for (const n of task.needsUser ?? []) if (Array.isArray(n) && secretLike(n)) errors.push('a needsUser entry carries a credential-like value; keep secrets out of the task')
  for (const f of task.forbid ?? []) if (secretLike(toWords(f))) errors.push('a forbid entry carries a credential-like value')
  for (const k of ['allow', 'editRoots', 'tools']) for (const x of task[k] ?? []) if (secretLike([String(x)])) errors.push(`a ${k} entry carries a credential-like value`)
  if (typeof task.worktree === 'string' && secretLike([task.worktree])) errors.push('the worktree carries a credential-like value')
  const classes = forbiddenClasses(task)
  const overlap = (argv, label) => { const hit = matchForbidden(argv, classes); if (hit) errors.push(`${label} ${argv.join(' ')} overlaps forbidden class (${hit.rule})`) }
  for (const e of task.executors ?? []) if (Array.isArray(e.argv)) overlap(e.argv, 'executor')
  for (const n of task.needsUser ?? []) if (Array.isArray(n)) overlap(n, 'needsUser')
  return { ok: errors.length === 0, errors }
}

// The record that is stored for a task: an allowlist of fields. Descriptive text (goal, acceptance)
// is redacted; policy values must be stored exactly as they are matched, so a credential-like policy
// value is refused by validateTask instead of being silently altered (NFR-9, FR-25).
export function taskRecord(input, { id, now, cwd }) {
  const strArr = (xs) => (Array.isArray(xs) ? xs.map((x) => String(x)) : undefined)
  return {
    id: String(input.id ?? id),
    goal: redactLike(input.goal ?? '', 500),
    worktree: String(input.worktree ?? cwd),
    allow: strArr(input.allow) ?? [],
    editRoots: strArr(input.editRoots) ?? ['.'],
    forbid: Array.isArray(input.forbid) ? input.forbid.map((f) => (Array.isArray(f) ? f.map(String) : String(f))) : [],
    executors: Array.isArray(input.executors) ? input.executors.map((e) => ({ argv: strArr(e?.argv) ?? [], check: e?.check === true })) : [],
    needsUser: Array.isArray(input.needsUser) ? input.needsUser.map((n) => strArr(n) ?? []) : [],
    tools: strArr(input.tools) ?? [],
    acceptance: (strArr(input.acceptance) ?? []).map((a) => redactLike(a, 300)),
    policyVersion: (Number(input.policyVersion) || 0) + 1,
    confirmedAt: now,
    result: 'in-progress',
  }
}
