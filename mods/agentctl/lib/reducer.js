// Pure state reducer (requirements FR-4, tech spec § 3.4 State). Four separate dimensions, never one
// enum, because several facts hold at once: a permission request beside a background job, a tool
// running while a rate limit is near. Every fact carries the time it was observed.

import { isOpen, openCount, statusKind } from './background.js'

export const IDLE_STALL_MS = 10 * 60 * 1000
const OPS_CAP = 200

export function initialState(at = 0) {
  return {
    phase: { value: 'unknown', since: at },
    runtime: { value: 'idle', since: at, turnId: null, tool: null },
    interventions: {},
    result: { value: 'in-progress', since: at },
    ops: {},
    background: {},
    lastEventAt: at,
  }
}

const PHASE_BY_KIND = { edit: 'editing', check: 'testing', read: 'reviewing', plan: 'planning' }

function setIntervention(s, reason, at, detail, severity = 'warn') {
  const prev = s.interventions[reason]
  const rank = { info: 0, warn: 1, critical: 2 }
  const next = prev
    ? { ...prev, detail, severity: rank[severity] > rank[prev.severity] ? severity : prev.severity }
    : { since: at, detail, severity }
  return { ...s, interventions: { ...s.interventions, [reason]: next } }
}

function clearIntervention(s, reason) {
  if (!s.interventions[reason]) return s
  const { [reason]: _gone, ...rest } = s.interventions
  return { ...s, interventions: rest }
}

function capOps(ops) {
  const ids = Object.keys(ops)
  if (ids.length <= OPS_CAP) return ops
  // Drop the oldest resolved operations first; unresolved ones are kept as long as possible.
  const resolved = ids.filter((id) => ops[id].endedAt !== undefined).sort((a, b) => ops[a].startedAt - ops[b].startedAt)
  const unresolved = ids.filter((id) => ops[id].endedAt === undefined).sort((a, b) => ops[a].startedAt - ops[b].startedAt)
  const order = [...resolved, ...unresolved]
  const drop = new Set(order.slice(0, ids.length - OPS_CAP))
  return Object.fromEntries(ids.filter((id) => !drop.has(id)).map((id) => [id, ops[id]]))
}

function anyToolRunning(s) {
  return Object.values(s.ops).some((o) => o.endedAt === undefined && o.outcome !== 'refused')
}

// The newest host evidence about an id replaces the older kind of sighting.
const fresh = ({ word: _w, wordAt: _t, queriedAt: _q, queriedVia: _v, ...rest }) => rest

// Ids with evidence newer than the latest supplied list, which therefore says nothing about them.
const sawSince = (s, id) => (s.bgList?.later && !s.bgList.later.includes(id) ? { ...s, bgList: { ...s.bgList, later: [...s.bgList.later, id] } } : s)

const opOutcome = (status) => ({ completed: 'ok', failed: 'error', cancelled: 'cancelled', killed: 'cancelled' }[status] ?? status)

// Which load of the session an event was seen in; absent in state saved by an earlier version.
const ctxOf = (o) => (o.ctx === undefined ? {} : { ctx: o.ctx })

// Links a tool's background id to its record. An end already observed for that id stands: the order
// in which the host delivers a start and an end is not promised.
function linkStart(s, o) {
  const prev = s.background[o.backgroundId]
  // Named again by the host since that end: the link is kept, and neither it nor the operation closes.
  if (prev && statusKind(prev.status) === 'end' && isOpen(prev)) {
    return { ...s, background: { ...s.background, [o.backgroundId]: { ...prev, opId: o.id, ...ctxOf(o) } } }
  }
  if (prev && statusKind(prev.status) === 'end') {
    const op = { ...s.ops[o.id], endedAt: Math.max(prev.endedAt, o.at), outcome: opOutcome(prev.status) }
    return { ...s, ops: { ...s.ops, [o.id]: op }, background: { ...s.background, [o.backgroundId]: { ...prev, opId: o.id } } }
  }
  const status = prev?.asOf !== undefined ? 'in-flight' : 'started'
  return sawSince({ ...s, background: { ...s.background, [o.backgroundId]: { ...prev, status, since: prev?.since ?? o.at, opId: o.id, ...ctxOf(o) } } }, o.backgroundId)
}

export function reduce(state, o) {
  // A tick is the clock, not activity: it must not move the last-activity time it measures against.
  let s = o.type === 'tick' ? { ...state } : { ...state, lastEventAt: Math.max(state.lastEventAt, o.at ?? state.lastEventAt) }
  switch (o.type) {
    case 'turn.start':
      s = { ...s, runtime: { value: 'model-active', since: o.at, turnId: o.turnId, tool: null } }
      // A refusal is attention for the turn it happened in; the next turn means it was seen. Its
      // record stays in the operations and in /agentctl events.
      return clearIntervention(clearIntervention(clearIntervention(s, 'input'), 'suspected-stall'), 'policy-denied')
    case 'turn.complete':
      s = { ...s, runtime: { value: 'idle', since: o.at, turnId: null, tool: null } }
      return o.awaitsInput ? setIntervention(s, 'input', o.at, o.detail ?? 'turn ended with a question', 'info') : s
    case 'tool.start': {
      const op = { requested: o.requested, tool: o.tool, startedAt: o.at, outcome: 'running' }
      s = { ...s, ops: capOps({ ...s.ops, [o.id]: op }), runtime: { ...s.runtime, value: 'tool-running', since: o.at, tool: o.tool } }
      if (o.kind && PHASE_BY_KIND[o.kind] && s.phase.value !== PHASE_BY_KIND[o.kind]) s = { ...s, phase: { value: PHASE_BY_KIND[o.kind], since: o.at } }
      return clearIntervention(s, 'suspected-stall')
    }
    case 'tool.end': {
      const prev = s.ops[o.id] ?? { requested: o.requested ?? '', tool: o.tool, startedAt: o.at }
      const op = { ...prev, endedAt: o.outcome === 'backgrounded' ? undefined : o.at, outcome: o.outcome }
      if (o.backgroundId) op.backgroundId = o.backgroundId
      s = { ...s, ops: { ...s.ops, [o.id]: op } }
      if (o.backgroundId) s = linkStart(s, o)
      if (!anyToolRunning(s) && s.runtime.value === 'tool-running') s = { ...s, runtime: { ...s.runtime, value: s.runtime.turnId ? 'model-active' : 'idle', since: o.at, tool: null } }
      return s
    }
    case 'refused': {
      const prev = s.ops[o.id] ?? { requested: o.requested ?? '', tool: o.tool, startedAt: o.at }
      s = { ...s, ops: capOps({ ...s.ops, [o.id]: { ...prev, endedAt: o.at, outcome: 'refused', rule: o.rule } }) }
      return setIntervention(s, 'policy-denied', o.at, `${o.rule}`, 'warn')
    }
    case 'permission.request':
      return setIntervention(s, 'permission', o.at, o.tool, 'warn')
    case 'permission.settled':
      return clearIntervention(s, 'permission')
    case 'background.inflight': {
      // A Stop list is in-flight work only: it updates "in flight as of T", it never closes a record.
      const bg = { ...s.background }
      for (const id of o.ids) {
        const prev = bg[id]
        const again = prev && statusKind(prev.status) === 'end' ? { seenAgainAt: o.at } : {}
        bg[id] = { ...fresh(prev ?? { since: o.at }), status: prev?.status === 'started' || !prev ? 'in-flight' : prev.status, asOf: o.at, ...again, ...ctxOf(o) }
      }
      // A supplied list counts even when it is empty; a missing one is recorded apart and changes no
      // record. Membership is kept as ids, never read from equal times.
      return { ...s, background: bg, bgList: { suppliedAt: o.at, ids: [...o.ids], later: [] } }
    }
    case 'background.list-missing':
      return { ...s, bgList: { ...s.bgList, missingAt: o.at } }
    case 'background.working':
    case 'background.unknown-word': {
      // Host evidence about a record already held: a sighting, or a word this version does not know.
      const prev = s.background[o.id]
      if (!prev) return s
      const isEnd = statusKind(prev.status) === 'end'
      const add = o.type === 'background.working'
        ? { queriedAt: o.at, queriedVia: o.via, ...(isEnd ? { seenAgainAt: o.at } : {}) }
        : isEnd && !isOpen(prev) ? {} : { word: o.word, wordAt: o.at }
      return sawSince({ ...s, background: { ...s.background, [o.id]: { ...fresh(prev), ...add, ...ctxOf(o) } } }, o.id)
    }
    case 'background.terminal': {
      const rec = s.background[o.id] ?? { since: o.at }
      // The same end again changes nothing; a different end for the same sighting is kept beside it.
      if (statusKind(rec.status) === 'end' && !isOpen(rec)) {
        if (rec.status === o.status || rec.conflict) return s
        return { ...s, background: { ...s.background, [o.id]: { ...rec, conflict: { status: o.status, at: o.at } } } }
      }
      const { conflict: _c, seenAgainAt: _a, ...kept } = fresh(rec)
      const bg = { ...s.background, [o.id]: { ...kept, status: o.status, endedAt: o.at, ...ctxOf(o) } }
      s = { ...s, background: bg }
      // Close the operation that started this job with the observed terminal outcome.
      if (rec.opId && s.ops[rec.opId]) {
        s = { ...s, ops: { ...s.ops, [rec.opId]: { ...s.ops[rec.opId], endedAt: o.at, outcome: opOutcome(o.status) } } }
      }
      if (!anyToolRunning(s) && s.runtime.value === 'tool-running') s = { ...s, runtime: { ...s.runtime, value: s.runtime.turnId ? 'model-active' : 'idle', since: o.at, tool: null } }
      return s
    }
    case 'rate-limit':
      return o.percentUsed >= 100
        ? setIntervention(s, 'rate-limit', o.at, { kind: o.kind, resetsAt: o.resetsAt ?? null }, 'critical')
        : clearIntervention(s, 'rate-limit')
    case 'result':
      return { ...s, result: { value: o.value, since: o.at } }
    case 'tick':
      return evaluateStall(s, o.at, o.idleMs ?? IDLE_STALL_MS)
    case 'session.end':
      return { ...s, runtime: { value: 'ended', since: o.at, turnId: null, tool: null } }
    default:
      return s
  }
}

// Suspected stall needs all three: idle past the threshold, no tool running, nothing in flight in
// the background. It is always unconfirmed — silence alone is never "stuck".
export function evaluateStall(s, now, idleMs = IDLE_STALL_MS) {
  const idle = now - s.lastEventAt
  if (idle >= idleMs && !anyToolRunning(s) && openCount(s) === 0 && s.runtime.value !== 'ended') {
    return setIntervention(s, 'suspected-stall', now, { idleMs: idle, basis: 'no turn or tool event', confirmed: false }, 'info')
  }
  return clearIntervention(s, 'suspected-stall')
}
