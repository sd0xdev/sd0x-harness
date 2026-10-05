// agentctl — Agent Control Plane for one Claude Code session.
// A control and a display, not an isolation boundary: production read-only belongs to credentials
// and the target's own permissions, and named dangerous invocations to the user's permission rules.
// This module wires hooks to the pure modules in ../lib; every decision lives there.

import { MAX_HASHED_PATHS, TIMEOUT_MS, commands as FP, digest, fold, parseStatus } from '../lib/fingerprint.js'
import { handoff } from '../lib/handoff.js'
import { decideNotices, parseTaskNotification } from '../lib/notices.js'
import { HARD_FORBIDDEN, classify, taskRecord, validateTask } from '../lib/policy.js'
import { acceptedRecord, digestMatches, previewLines, proposalDigest, proposalPath, readProposal } from '../lib/proposal.js'
import { initialState, reduce } from '../lib/reducer.js'
import { CAPS, sanitize } from '../lib/sanitize.js'
import { applyRetention, createWriter, keys, latestCheckpoint, taskScope } from '../lib/store.js'
import { combine, surfaceVerified } from '../lib/verdict.js'
import { bandText, contextReading, eventsText, gateReading, policyText, statusText, usageReading } from '../lib/view.js'

const DECISIONS_CAP = 50
const BUILT_IN_RULES = new Set(HARD_FORBIDDEN.map((h) => h.rule))
// Evidence freshness must show a later edit within 30 s (requirements Signal 3).
const TICK_MS = 30 * 1000
const GATE_STALE_MS = 30 * 1000

// Per-session runtime context, rebuilt from the store after a hot reload. Built once per session
// through one shared promise: session.start and the first ui.render arrive concurrently in an
// interactive terminal, and two separate builds left the band reading a context nobody updated
// (found live on 2.1.289). A hot reload drops the timers and in-memory readings without a new
// session.start, so the readings and the tick start with the build.
let ctx = null
let building = null

function context($) {
  if (ctx) return Promise.resolve(ctx)
  if (!building) building = buildContext($).finally(() => { building = null })
  return building
}

async function buildContext($) {
  const sessionId = await $.session.id()
  const cwd = await $.session.cwd()
  const writer = createWriter(storeOf($))
  const saved = await $.store.get(keys.session(sessionId))
  const now = await $.clock.now()
  const c = {
    sessionId,
    cwd,
    writer,
    surface: saved?.surface ?? null,
    interactive: saved?.interactive ?? false,
    // The permission mode as of the last classic hook input that carried it (each prompt and each
    // tool end); unknown until then, and unknown never enables needs-user.
    permissionMode: null,
    startedAt: saved?.startedAt ?? now,
    state: saved?.state ?? initialState(now),
    decisions: saved?.decisions ?? [],
    evidence: saved?.evidence ?? {},
    notices: saved?.notices ?? {},
    gate: null,
    usage: null,
    usageAt: 0,
    fingerprint: null,
    checkpoint: null,
    // The validated proposal waiting for `/agentctl accept`, frozen until accepted or discarded, and
    // the digest of the file text it came from (an unchanged file is not read twice).
    pending: saved?.pending ?? null,
    proposalSeen: saved?.proposalSeen ?? null,
  }
  await readGate($, c)
  await readUsage($, c)
  $.clock.every(TICK_MS, async () => {
    // A tick that outlives its session (a /clear started another) does nothing.
    if (ctx !== c) return
    const t = await boundTask($, c)
    await refreshTree($, c)
    await readGate($, c)
    await observe($, c, { type: 'tick', at: await $.clock.now() }, t?.id)
  })
  ctx = c
  return c
}

function storeOf($) {
  return { get: (k) => $.store.get(k), set: (k, v) => $.store.set(k, v), delete: (k) => $.store.delete(k), keys: () => $.store.keys() }
}

export function worktreeKey(cwd) {
  return encodeURIComponent(String(cwd ?? ''))
}

const scopeOf = (c, taskId) => taskScope(worktreeKey(c.cwd), taskId)

async function boundTask($, c) {
  const taskId = await $.store.get(keys.binding(worktreeKey(c.cwd)))
  if (!taskId) return null
  const t = await $.store.get(keys.task(scopeOf(c, taskId)))
  if (t) return t
  // A record written before task records were namespaced: used only when it names this worktree.
  const legacy = await $.store.get(keys.task(taskId))
  if (legacy && legacy.worktree === c.cwd) return { ...legacy, legacyRecord: true }
  // A binding whose record is gone is not "no task": refuse everything but reads in this worktree.
  return { id: String(taskId), goal: '', worktree: c.cwd, allow: [], editRoots: [], forbid: [], executors: [], needsUser: [], tools: [], acceptance: [], recordMissing: true }
}

function persist(c, taskId) {
  c.writer.set(keys.session(c.sessionId), {
    taskId: taskId ? scopeOf(c, taskId) : null,
    surface: c.surface,
    interactive: c.interactive,
    startedAt: c.startedAt,
    state: c.state,
    decisions: c.decisions,
    evidence: c.evidence,
    notices: c.notices,
    pending: c.pending,
    proposalSeen: c.proposalSeen,
    health: c.writer.health.value,
  })
}

function recordDecision(c, entry) {
  c.decisions = [...c.decisions, entry].slice(-DECISIONS_CAP)
}

function callOf(e) {
  // tool.call carries the tool's own fields beside `tool`; tool.check carries them under `input`.
  if (e && e.input && typeof e.input === 'object') return { tool: e.tool, ...e.input }
  return e
}

function outcomeOf(r) {
  if (!r) return 'unknown'
  if (r.deny) return 'refused'
  if (r.isError) return 'error'
  if (r.result && typeof r.result === 'object' && r.result.backgroundTaskId) return 'backgrounded'
  return 'ok'
}

// ── Readings ────────────────────────────────────────────────────────────────────────────────────
async function runGit($, cwd, argv, stdin) {
  try {
    return await $.process.run(argv, { cwd, timeoutMs: TIMEOUT_MS, ...(stdin === undefined ? {} : { stdin }) })
  } catch (err) {
    return { error: sanitize(err && err.message ? err.message : err, 120) }
  }
}

async function readFingerprint($, cwd) {
  const results = {}
  results.head = await runGit($, cwd, FP.head)
  results.index = await runGit($, cwd, FP.index)
  results.flags = await runGit($, cwd, FP.flags)
  results.status = await runGit($, cwd, FP.status)
  const changed = results.status && !results.status.error && results.status.exitCode === 0 ? parseStatus(results.status.stdout).changed : []
  if (changed.length) results.hash = await runGit($, cwd, FP.hash, changed.slice(0, MAX_HASHED_PATHS).join('\n') + '\n')
  // Nothing answered: there is no reading at all, so the evidence is unavailable, not partial.
  if (Object.values(results).every((r) => r && r.error)) return null
  // When the reading was taken: every view of it says how old it is.
  return { ...fold(results, changed), at: await $.clock.now() }
}

// The current tree, re-read only while there is evidence whose freshness depends on it.
async function refreshTree($, c) {
  if (Object.keys(c.evidence).length === 0) return
  c.fingerprint = await readFingerprint($, c.cwd)
  $.ui.invalidate('ui.render')
}

// A reading that fails is an `unavailable` field, never a failed hook.
async function readGate($, c) {
  const at = await $.clock.now()
  let script = null
  try {
    if (await $.fs.exists('.claude/scripts/review-state.js')) script = '.claude/scripts/review-state.js'
    else if (await $.fs.exists('scripts/review-state.js')) script = 'scripts/review-state.js'
  } catch (err) {
    c.gate = { failed: sanitize('cannot look for review-state.js: ' + (err && err.message ? err.message : err), 80), at }
    return
  }
  if (!script) { c.gate = { failed: 'no review-state.js here', at }; return }
  try {
    // `check` only — this mod never writes a verdict (FR-19).
    const r = await $.process.run(['node', script, 'check', '--format=json'], { cwd: c.cwd, timeoutMs: TIMEOUT_MS })
    c.gate = { ...gateReading(r, at), staleAfterMs: GATE_STALE_MS }
  } catch (err) {
    c.gate = { failed: sanitize('check failed: ' + (err && err.message ? err.message : err), 80), at }
  }
}

async function readUsage($, c) {
  try {
    c.usage = await $.session.usage()
    c.usageAt = await $.clock.now()
  } catch {
    c.usage = null
  }
}

async function model($, c) {
  const task = await boundTask($, c)
  const now = await $.clock.now()
  return {
    now,
    task,
    state: c.state,
    health: c.writer.health.value,
    gate: c.gate,
    context: c.usage ? contextReading(c.usage, c.usageAt) : null,
    fiveHour: c.usage ? usageReading(c.usage, 'five_hour', c.usageAt) : null,
    // Evidence belongs to the task (and policy version) it was observed under; another task's checks
    // are never shown as this one's.
    evidence: evidenceFor(c.evidence, task),
    fingerprint: c.fingerprint,
    pending: c.pending,
    decisions: c.decisions,
    sessionId: c.sessionId,
    checkpoint: c.checkpoint,
  }
}

// Partial if either reading is partial: a value equality says nothing about what was not read.
function worstCoverage(...readings) {
  const cs = readings.filter(Boolean).map((r) => r.coverage)
  return cs.includes('partial') ? 'partial' : cs[0]
}

function evidenceFor(evidence, task) {
  const out = {}
  for (const [k, ev] of Object.entries(evidence ?? {})) {
    if ((ev.taskId ?? null) === (task?.id ?? null) && (ev.policyVersion ?? null) === (task?.policyVersion ?? null)) out[k] = ev
  }
  return out
}

async function observe($, c, observation, taskId) {
  c.state = reduce(c.state, observation)
  const now = await $.clock.now()
  const { toSend, sent } = decideNotices(c.state.interventions, c.notices, now)
  c.notices = sent
  for (const n of toSend) $.ui.toast(`agentctl: ${n.reason.replace('-', ' ')} — /agentctl for details`)
  persist(c, taskId)
  $.ui.invalidate('ui.render')
}

// The hand-over starts no process, calls no model and no network (NFR-5): it uses the last tree
// reading taken by a check, which the hand-over labels with its own HEAD and coverage.
// `saved` is the store's own answer: the write is awaited, so a stop never cancels before the
// checkpoint exists and never claims a write that failed.
async function saveHandoff($, c) {
  const m = await model($, c)
  const text = handoff(m)
  if (!m.task) return { text, saved: false, reason: 'no-task' }
  const ok = await c.writer.set(keys.checkpoint(scopeOf(c, m.task.id), c.sessionId), { savedAt: m.now, taskId: m.task.id, markdown: text })
  return { text, saved: ok, reason: ok ? null : 'store-error' }
}

async function closeBackground($, c, id, status, isError) {
  const task = await boundTask($, c)
  await observe($, c, { type: 'background.terminal', id, status, at: await $.clock.now() }, task?.id)
  for (const ev of Object.values(c.evidence)) {
    if (ev.backgroundId && ev.backgroundId === id && ev.outcome === 'backgrounded') {
      ev.outcome = status === 'completed' ? (isError ? 'error' : 'ok') : status === 'failed' ? 'error' : 'cancelled'
      ev.after = await readFingerprint($, c.cwd)
      ev.coverage = worstCoverage(ev.before, ev.after)
      ev.note = 'after-reading taken when the terminal result was observed, not at completion'
    }
  }
  persist(c, task?.id)
}

// ── Commands ────────────────────────────────────────────────────────────────────────────────────
async function taskCommand($, c, e, rest) {
  const [sub, ...more] = rest
  if (!sub || sub === 'show') {
    const t = await boundTask($, c)
    return t ? policyText(t) : 'No task bound to this worktree. Set one with /agentctl task set <json>.'
  }
  if (sub !== 'set' && sub !== 'clear') return 'Usage: /agentctl task show | set <json> | clear'
  // Scope changes come only from the person at the prompt (FR-25).
  if (e.origin?.kind !== 'composer') return 'agentctl refused: the task can be set or cleared only from your own prompt.'
  const now = await $.clock.now()
  if (sub === 'clear') {
    // Report what persisted (INV-006): a failed delete leaves the old policy in force.
    if (!(await c.writer.delete(keys.binding(worktreeKey(c.cwd))))) {
      return 'agentctl: the task could not be cleared (store error); the previous task still applies.'
    }
    return 'Task cleared for this worktree; only the built-in classes are refused now.'
  }
  let input
  try { input = JSON.parse(more.join(' ')) } catch { return 'agentctl: the task must be JSON.' }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'agentctl: the task must be a JSON object.'
  // The worktree is this session's; a task naming another one is refused, never re-pointed.
  if (input.worktree !== undefined && input.worktree !== c.cwd) return 'agentctl: task rejected —\n- the task names another worktree'
  const raw = { ...input, worktree: c.cwd }
  const v = validateTask(raw)
  if (!v.ok) return `agentctl: task rejected —\n- ${v.errors.map((x) => sanitize(x, 200)).join('\n- ')}`
  // The policy version only rises: re-setting an id that already has a record continues from it, so
  // evidence and proposals tied to the earlier policy never read as this one's.
  const id = raw.id ?? `T${now}`
  const bound = await boundTask($, c)
  const prior = bound && bound.id === id && !bound.recordMissing ? bound : await $.store.get(keys.task(scopeOf(c, id)))
  // Only allowlisted fields are stored; descriptive text is redacted (NFR-9).
  return bindTask($, c, taskRecord({ ...raw, policyVersion: prior ? (prior.policyVersion ?? 1) : 0 }, { id, now, cwd: c.cwd }))
}

// The record first, the binding only once the record is saved. Re-setting the bound id is complete
// once its record is saved — that record IS the policy in force — so no binding write can fail after it.
async function bindTask($, c, task) {
  const bindingKey = keys.binding(worktreeKey(c.cwd))
  const current = await $.store.get(bindingKey)
  if (!(await c.writer.set(keys.task(scopeOf(c, task.id)), task))) {
    return 'agentctl: the task could not be saved (store error); the previous task, if any, still applies.'
  }
  if (current !== task.id && !(await c.writer.set(bindingKey, task.id))) {
    return 'agentctl: the task was saved but could not be bound (store error); the previous task, if any, still applies.'
  }
  persist(c, task.id)
  $.ui.invalidate('ui.render')
  return `Task ${task.id} bound to this worktree.\n${policyText(task)}`
}

// ── Proposals ───────────────────────────────────────────────────────────────────────────────────
// Read at session start and at each main turn's end. A failure to read is no proposal, never an
// error: the file is optional and the mod works without it.
async function checkProposal($, c) {
  let text
  try {
    const home = await $.env.get('HOME')
    if (!home) return
    const path = proposalPath(home, worktreeKey(c.cwd))
    if (!(await $.fs.exists(path))) return
    text = await $.fs.read(path)
  } catch {
    return
  }
  if (typeof text !== 'string') return
  const seen = digest(text)
  if (seen === c.proposalSeen) return
  c.proposalSeen = seen
  // Found live: the file stays after accept, and a new session read it again as a stale draft.
  const handled = await $.store.get(keys.proposal(worktreeKey(c.cwd)))
  if (handled && handled.text === seen) return
  const bound = await boundTask($, c)
  // A malformed submission is a rejection, never a failed hook.
  let r
  try { r = readProposal(text, { cwd: c.cwd, boundId: bound?.id ?? null }) } catch { r = { ok: false, errors: ['the proposal could not be validated'] } }
  if (!r.ok) {
    // No `agentctl:` prefix: the host already names the mod on every transcript line (found live).
    $.ui.log(`proposal not shown — ${r.errors.join('; ')}`)
    persist(c, bound?.id)
    return
  }
  c.pending = { effective: r.effective, digest: await proposalDigest(r.effective), baseRev: revisionOf(bound), textDigest: seen, at: await $.clock.now() }
  for (const line of previewLines(c.pending)) $.ui.log(line)
  persist(c, bound?.id)
  $.ui.invalidate('ui.render')
}

// The bound task's exact revision: a same-id `task set` after the preview makes the proposal stale.
function revisionOf(task) {
  return task ? `${task.id}@${task.policyVersion ?? 1}@${task.confirmedAt ?? 0}` : null
}

// The waiting proposal is done with: forget it here and remember its file text for later sessions.
async function settleProposal($, c, p) {
  c.pending = null
  if (p?.textDigest) await c.writer.set(keys.proposal(worktreeKey(c.cwd)), { text: p.textDigest, at: await $.clock.now() })
}

async function acceptCommand($, c, e, given) {
  // Scope comes only from the person at the prompt (FR-25).
  if (e.origin?.kind !== 'composer') return 'agentctl refused: a proposal can be accepted only from your own prompt.'
  const p = c.pending
  if (!p) return 'agentctl: no proposal is waiting. Ask Claude to draft one (/agentctl-setup --task), then accept it here.'
  if (!digestMatches(given, p.digest)) return `agentctl refused: ${sanitize(given, 30)} does not match the waiting proposal ${p.digest.slice(0, 8)}. Check /agentctl proposal.`
  const bound = await boundTask($, c)
  if ((bound?.id ?? null) !== p.effective.base || revisionOf(bound) !== p.baseRev) {
    await settleProposal($, c, p)
    persist(c, bound?.id)
    return 'agentctl refused: the bound task changed since this proposal was drafted (stale); it was discarded. Ask for a new draft.'
  }
  const now = await $.clock.now()
  const text = await bindTask($, c, acceptedRecord(p.effective, { now, baseTask: bound }))
  if (text.startsWith('Task ')) { await settleProposal($, c, p); persist(c, `T${now}`) }
  return text
}

async function stopCommand($, c) {
  const h = await saveHandoff($, c)
  const turnId = c.state.runtime.turnId
  // Say what happened: a checkpoint exists only when a task is bound.
  const lines = [h.saved ? 'Hand-over saved before stopping.'
    : h.reason === 'no-task' ? 'No task bound: the hand-over was not saved (see /agentctl handoff).'
      : 'The hand-over could not be saved (store error); /agentctl handoff still prints it.']
  if (!turnId) lines.push('No running turn was observed; nothing was cancelled.')
  else {
    try {
      await $.turn.abort({ turnId })
      lines.push(`Cancellation requested for turn ${turnId}; it reads as ended only once its end is observed.`)
    } catch (err) {
      lines.push(`Cancellation request failed; turn outcome unconfirmed (${sanitize(err && err.message ? err.message : err, 120)}).`)
    }
  }
  const open = Object.entries(c.state.ops).filter(([, o]) => o.endedAt === undefined && o.outcome !== 'refused')
  lines.push(open.length ? 'Tracked operations, as last observed:' : 'No tracked operation was running.')
  for (const [id, o] of open) lines.push(`- ${sanitize(o.requested, 120)} (${o.tool}) — ${o.outcome}, ${id}`)
  lines.push('Untracked processes cannot be confirmed; this is never "all stopped".')
  return lines.join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    // A new session (start, /clear, resume) gets a fresh context under its own id; the readings and
    // the tick restart with it.
    // Reuse a context already built (or being built, e.g. by the first band render) for this same
    // session; replace it only when the session changed (/clear, resume) — never discard state that
    // concurrent hooks are writing into.
    const sid = await $.session.id()
    if (building) await building.catch(() => {})
    if (ctx && ctx.sessionId !== sid) ctx = null
    const c = await context($)
    c.surface = e.surface ?? null
    c.interactive = Boolean(e.isInteractive)
    const task = await boundTask($, c)
    persist(c, task?.id)
    // Retention after this session's own record is written, so it counts among the newest.
    await c.writer.idle()
    await applyRetention(storeOf($), c.writer, await $.clock.now())
    // Resume: show the last hand-over first; nothing is replayed, and the mod holds no approvals.
    // A checkpoint written before records were namespaced belongs to the legacy record it was saved
    // for, so it is read only when that verified legacy record is the task — never for a new scoped
    // task that merely reuses the id.
    if (task) c.checkpoint = await latestCheckpoint(storeOf($), scopeOf(c, task.id))
      ?? (task.legacyRecord ? await latestCheckpoint(storeOf($), task.id) : null)
    if (c.checkpoint) {
      // Shown before any work: a transcript notice (not sent to the model; `-p` receives it as
      // ui_log) and the band. Nothing is replayed, and the mod holds no approvals to carry over.
      $.ui.log(`last hand-over for task ${task.id}, saved ${new Date(c.checkpoint.savedAt).toISOString()} — /agentctl last shows it again`)
      // The whole checkpoint (already bounded by the hand-over cap), never a silent preview.
      for (const line of String(c.checkpoint.markdown).split('\n')) $.ui.log(line)
    }
    await checkProposal($, c)
    // `immediate`: /agentctl stop must run while the turn it cancels is still in flight.
    await $.command.register({ name: 'agentctl', description: 'Agent Control Plane: status, proposal, accept, task, policy, events, handoff, stop', argumentHint: '[proposal|accept|discard|task|policy|events|handoff|last|stop]', immediate: true })
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // Only the main loop's turns move the held turn: subagent turns carry an agentId (host types,
  // turn.complete) and their completion must not clear the main turn a stop would cancel.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const c = await context($)
    await observe($, c, { type: 'turn.start', turnId: e.turnId, at: await $.clock.now() }, (await boundTask($, c))?.id)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const c = await context($)
    if (e.agentId !== undefined || (c.state.runtime.turnId && e.turnId !== c.state.runtime.turnId)) return next(e)
    await observe($, c, { type: 'turn.complete', turnId: e.turnId, at: await $.clock.now() }, (await boundTask($, c))?.id)
    await readGate($, c)
    await refreshTree($, c)
    await checkProposal($, c)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const c = await context($)
    await readUsage($, c)
    const w = (c.usage?.rateLimits ?? []).find((r) => r.kind === 'five_hour')
    if (w) await observe($, c, { type: 'rate-limit', kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt, at: c.usageAt }, (await boundTask($, c))?.id)
    return next(e)
  })

  // The permission mode rides on classic hook inputs; read it at every prompt and tool end.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const c = await context($)
    c.permissionMode = e.permission_mode ?? null
    return next(e)
  })

  on('classic.PostToolUse', async ($, e, next) => {
    const c = await context($)
    if (e.permission_mode !== undefined) c.permissionMode = e.permission_mode
    return next(e)
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    const c = await context($)
    if (e.permission_mode !== undefined) c.permissionMode = e.permission_mode
    await observe($, c, { type: 'permission.request', tool: e.tool_name, at: await $.clock.now() }, (await boundTask($, c))?.id)
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    const c = await context($)
    const ids = (e.background_tasks ?? []).map((b) => b.id)
    await observe($, c, { type: 'background.inflight', ids, at: await $.clock.now() }, (await boundTask($, c))?.id)
    return next(e)
  })

  // Policy: classification completes before delegation; a refusal never reaches core.
  on('tool.call', async ($, e, next) => {
    const c = await context($)
    const task = await boundTask($, c)
    const v = classify(task, callOf(e))
    if (v.outcome === 'deny') {
      const at = await $.clock.now()
      const requested = sanitize(e.command ?? e.file_path ?? e.tool, CAPS.requested)
      const rule = sanitize(v.rule, CAPS.reason)
      recordDecision(c, { at, tool: e.tool, requested, outcome: v.outcome, rule })
      await observe($, c, { type: 'refused', id: e.tool_use_id ?? `refused-${at}`, tool: e.tool, requested, rule, at }, task?.id)
      // A built-in class is not the task's to lift; saying "the task's scope" sent Claude off to
      // propose widening a task that cannot widen it (found live).
      const builtIn = BUILT_IN_RULES.has(v.rule)
      return { deny: builtIn
        ? `agentctl refused (${rule}): a built-in class no task can lift. Run it yourself, or through your project's own push or deploy workflow.`
        : `agentctl refused (${rule}). The task's scope is shown by /agentctl policy.` }
    }
    // Delegated: the host's permission flow (or auto mode) decides; the mod only records that it did
    // not classify the call, so the events list can show it.
    if (v.delegated && task) {
      recordDecision(c, { at: await $.clock.now(), tool: e.tool, requested: sanitize(e.command ?? e.file_path ?? e.tool, CAPS.requested), outcome: 'delegated', rule: sanitize(v.rule, CAPS.reason) })
    }
    // Every allowed call is observed; Bash is observed (with its evidence) by the hook beneath.
    if (e.tool === 'Bash') return next(e)
    const id = e.tool_use_id ?? `${e.tool}-${await $.clock.now()}`
    const requested = sanitize(e.file_path ?? e.notebook_path ?? e.tool, CAPS.requested)
    await observe($, c, { type: 'tool.start', id, tool: e.tool, requested, kind: ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(e.tool) ? 'edit' : undefined, at: await $.clock.now() }, task?.id)
    const r = await next(e)
    const endAt = await $.clock.now()
    await observe($, c, { type: 'tool.end', id, outcome: outcomeOf(r), at: endAt }, task?.id)
    await observe($, c, { type: 'permission.settled', at: endAt }, task?.id)
    return r
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'agentctl refused: the policy check failed before the call ran' }))

  // Evidence, beneath the policy hook: brackets Bash calls; its failures are evidence failures,
  // never refusals (feasibility § 6).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const c = await context($)
    const task = await boundTask($, c)
    const v = classify(task, callOf(e))
    const id = e.tool_use_id ?? `bash-${await $.clock.now()}`
    const requested = sanitize(e.command, CAPS.requested)
    const isCheck = Boolean(v.executor && v.executor.check)
    const startAt = await $.clock.now()
    let before = null
    if (isCheck) before = await readFingerprint($, c.cwd)
    await observe($, c, { type: 'tool.start', id, tool: 'Bash', requested, kind: isCheck ? 'check' : undefined, at: startAt }, task?.id)
    const r = await next(e)
    const outcome = outcomeOf(r)
    const endAt = await $.clock.now()
    const backgroundId = outcome === 'backgrounded' ? r.result.backgroundTaskId : undefined
    await observe($, c, { type: 'tool.end', id, outcome, backgroundId, at: endAt }, task?.id)
    await observe($, c, { type: 'permission.settled', at: endAt }, task?.id)
    if (isCheck) {
      const after = outcome === 'backgrounded' ? null : await readFingerprint($, c.cwd)
      c.fingerprint = after ?? c.fingerprint
      // An opaque key: executor arguments never become a stored identifier in plaintext.
      const key = 'check-' + digest(v.executor.argv.join('\u0000'))
      c.evidence = { ...c.evidence, [key]: { checkKey: key, taskId: task?.id ?? null, policyVersion: task?.policyVersion ?? null, requested, outcome, before, after, coverage: worstCoverage(before, after), at: endAt, backgroundId } }
      persist(c, task?.id)
    }
    return r
  }).catch(($, e, next) => next(e))

  // A background job's notification is the host's own terminal report: observe it, pass it on.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'task-notification') {
      const n = parseTaskNotification(e.text)
      if (n) await closeBackground($, await context($), n.id, n.status, undefined)
    }
    return next(e)
  })

  // A background job closes only on an observed terminal result.
  on('tool.call', { tool: 'GetTask' }, async ($, e, next) => {
    const r = await next(e)
    const c = await context($)
    const st = r && r.result && typeof r.result === 'object' ? r.result.status : undefined
    if (st && st !== 'working') await closeBackground($, c, r.result.taskId ?? e.taskId, st, r.result.result?.isError)
    return r
  }).catch(($, e, next) => next(e))

  // Verdict: never weaken a downstream deny, never create an allow.
  on('tool.check', async ($, e, next) => {
    const c = await context($)
    const task = await boundTask($, c)
    const v = classify(task, callOf(e))
    // Rule text can quote the command; it is sanitized before it becomes a reason anyone reads.
    const safe = { ...v, rule: sanitize(v.rule, CAPS.reason) }
    if (v.outcome === 'deny') return combine(safe, null, false)
    const down = await next(e)
    const out = combine(safe, down, surfaceVerified(c))
    if (v.outcome === 'needs-user') {
      const at = await $.clock.now()
      recordDecision(c, { at, tool: e.tool, requested: sanitize(e.input?.command ?? e.tool, CAPS.requested), outcome: out.decision === 'ask' ? 'asked' : 'needs-user-refused', rule: safe.rule })
      persist(c, task?.id)
    }
    return out
  }).catch(() => ({ decision: 'deny', reason: 'agentctl refused: the verdict check failed' }))

  // Text replies for every surface, answered without a model call.
  on('command.run', { command: 'agentctl' }, async ($, e) => {
    const c = await context($)
    const args = String(e.args ?? '').trim().split(/\s+/).filter(Boolean)
    const [sub, ...rest] = args
    // Bare status stays short (its text reaches Claude): the hand-over is one pointer line, and the
    // whole of it only on `/agentctl last`.
    if (!sub) {
      const m = await model($, c)
      const extra = [
        ...(c.pending ? [`Proposal ${c.pending.digest.slice(0, 8)} waiting — /agentctl proposal, then /agentctl accept`] : []),
        ...(c.checkpoint ? [`Last hand-over saved ${new Date(c.checkpoint.savedAt).toISOString()} — /agentctl last`] : []),
      ]
      return { text: [statusText(m), ...extra].join('\n') }
    }
    if (sub === 'last') return { text: c.checkpoint ? `Last hand-over (${new Date(c.checkpoint.savedAt).toISOString()}):\n${c.checkpoint.markdown}` : 'No hand-over saved for the bound task.' }
    if (sub === 'proposal') return { text: c.pending ? previewLines(c.pending).join('\n') : 'No proposal is waiting.' }
    if (sub === 'accept') return { text: await acceptCommand($, c, e, rest[0]) }
    if (sub === 'discard') {
      const had = Boolean(c.pending)
      await settleProposal($, c, c.pending)
      persist(c, (await boundTask($, c))?.id)
      $.ui.invalidate('ui.render')
      return { text: had ? 'Proposal discarded; the bound task is unchanged.' : 'No proposal was waiting.' }
    }
    if (sub === 'task') return { text: await taskCommand($, c, e, rest) }
    if (sub === 'policy') return { text: policyText(await boundTask($, c)) }
    if (sub === 'events') return { text: eventsText(c.decisions, Math.min(50, Math.max(1, Number(rest[0]) || 10)), await $.clock.now()) }
    if (sub === 'handoff') return { text: (await saveHandoff($, c)).text }
    if (sub === 'stop') return { text: await stopCommand($, c) }
    return { text: 'Usage: /agentctl [proposal] [accept [digest]] [discard] [task show|set <json>|clear] [policy] [events [n]] [handoff] [last] [stop]' }
  })

  // The band above the prompt. Other mods' band output is kept beside ours.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    const c = await context($)
    const ours = Text({ dimColor: true, children: [bandText(await model($, c))] })
    return theirs ? Box({ flexDirection: 'column', children: [theirs, ours] }) : ours
  })
}
