import { expect, test } from 'claude-code/testing'
import { IDLE_STALL_MS, evaluateStall, initialState, reduce } from '../lib/reducer.js'

const run = (obs, s = initialState(0)) => obs.reduce(reduce, s)

test('turn start / complete moves runtime and records an input wait only when the turn asks', () => {
  let s = run([{ type: 'turn.start', turnId: 't1', at: 10 }])
  expect(s.runtime).toEqual({ value: 'model-active', since: 10, turnId: 't1', tool: null })
  s = reduce(s, { type: 'turn.complete', turnId: 't1', at: 20 })
  expect(s.runtime.value).toBe('idle')
  expect(s.interventions.input).toBeUndefined()
  s = reduce(s, { type: 'turn.complete', turnId: 't2', at: 30, awaitsInput: true, detail: 'which db?' })
  expect(s.interventions.input).toEqual({ since: 30, detail: 'which db?', severity: 'info' })
  s = reduce(s, { type: 'turn.start', turnId: 't3', at: 40 })
  expect(s.interventions.input).toBeUndefined()
})

test('tool start and end track the operation, the runtime and the work phase', () => {
  let s = run([{ type: 'turn.start', turnId: 't', at: 1 }, { type: 'tool.start', id: 'u1', tool: 'Bash', requested: 'npm test', kind: 'check', at: 2 }])
  expect(s.runtime).toEqual({ value: 'tool-running', since: 2, turnId: 't', tool: 'Bash' })
  expect(s.phase).toEqual({ value: 'testing', since: 2 })
  s = reduce(s, { type: 'tool.end', id: 'u1', outcome: 'ok', at: 5 })
  expect(s.ops.u1).toEqual({ requested: 'npm test', tool: 'Bash', startedAt: 2, endedAt: 5, outcome: 'ok' })
  expect(s.runtime.value).toBe('model-active')
})

test('a backgrounded result stays unresolved and starts a background record, not a pass', () => {
  let s = run([{ type: 'tool.start', id: 'u1', tool: 'Bash', requested: 'npm test', at: 2 }, { type: 'tool.end', id: 'u1', outcome: 'backgrounded', backgroundId: 'bg1', at: 3 }])
  expect(s.ops.u1.endedAt).toBeUndefined()
  expect(s.ops.u1.outcome).toBe('backgrounded')
  expect(s.background.bg1.status).toBe('started')
  // An in-flight list updates "as of", never closes the record.
  s = reduce(s, { type: 'background.inflight', ids: ['bg1'], at: 9 })
  expect(s.background.bg1.status).toBe('in-flight')
  expect(s.background.bg1.asOf).toBe(9)
  s = reduce(s, { type: 'background.terminal', id: 'bg1', status: 'failed', at: 12 })
  expect(s.background.bg1).toEqual({ status: 'failed', since: 3, opId: 'u1', asOf: 9, endedAt: 12 })
})

test('a permission request coexists with a background job, and clears when settled', () => {
  let s = run([
    { type: 'tool.start', id: 'u1', tool: 'Bash', requested: 'npm test', at: 1 },
    { type: 'tool.end', id: 'u1', outcome: 'backgrounded', backgroundId: 'bg1', at: 2 },
    { type: 'permission.request', tool: 'Write', at: 3 },
  ])
  expect(s.interventions.permission.detail).toBe('Write')
  expect(s.background.bg1.status).toBe('started')
  s = reduce(s, { type: 'permission.settled', at: 4 })
  expect(s.interventions.permission).toBeUndefined()
  expect(s.background.bg1.status).toBe('started')
})

test('a refusal records the rule and a policy-denied intervention', () => {
  const s = run([{ type: 'refused', id: 'u9', tool: 'Bash', requested: 'kubectl rollout restart x', rule: 'production-readonly', at: 7 }])
  expect(s.ops.u9.outcome).toBe('refused')
  expect(s.ops.u9.rule).toBe('production-readonly')
  expect(s.interventions['policy-denied'].detail).toBe('production-readonly')
})

test('rate limit at 100% raises a critical intervention with its reset time; below it clears', () => {
  let s = run([{ type: 'rate-limit', kind: 'five_hour', percentUsed: 100, resetsAt: 999, at: 5 }])
  expect(s.interventions['rate-limit']).toEqual({ since: 5, detail: { kind: 'five_hour', resetsAt: 999 }, severity: 'critical' })
  s = reduce(s, { type: 'rate-limit', kind: 'five_hour', percentUsed: 40, at: 6 })
  expect(s.interventions['rate-limit']).toBeUndefined()
})

test('suspected stall needs idle time, no running tool and no background work — and is unconfirmed', () => {
  const base = run([{ type: 'turn.complete', turnId: 't', at: 0 }])
  expect(reduce(base, { type: 'tick', at: IDLE_STALL_MS - 1 }).interventions['suspected-stall']).toBeUndefined()
  const stalled = reduce(base, { type: 'tick', at: IDLE_STALL_MS })
  expect(stalled.interventions['suspected-stall'].detail.confirmed).toBe(false)
  expect(stalled.lastEventAt).toBe(0)
  // A tool still running blocks the suspicion, however long it is silent.
  const running = run([{ type: 'tool.start', id: 'u', tool: 'Bash', requested: 'long test', at: 0 }])
  expect(evaluateStall(running, IDLE_STALL_MS * 5).interventions['suspected-stall']).toBeUndefined()
  // So does background work in flight.
  const bg = run([{ type: 'tool.end', id: 'u', outcome: 'backgrounded', backgroundId: 'b', at: 0 }])
  expect(evaluateStall(bg, IDLE_STALL_MS * 5).interventions['suspected-stall']).toBeUndefined()
  // Any activity clears it.
  expect(reduce(stalled, { type: 'turn.start', turnId: 'n', at: IDLE_STALL_MS + 1 }).interventions['suspected-stall']).toBeUndefined()
})

test('severity only rises while a reason persists', () => {
  let s = run([{ type: 'permission.request', tool: 'A', at: 1 }])
  s = reduce(s, { type: 'rate-limit', kind: 'five_hour', percentUsed: 100, at: 2 })
  s = reduce(s, { type: 'refused', id: 'x', rule: 'r1', at: 3 })
  s = reduce(s, { type: 'refused', id: 'y', rule: 'r2', at: 4 })
  expect(s.interventions['policy-denied']).toEqual({ since: 3, detail: 'r2', severity: 'warn' })
})

test('operations are capped at 200, dropping the oldest resolved first and keeping unresolved', () => {
  let s = initialState(0)
  s = reduce(s, { type: 'tool.start', id: 'open', tool: 'Bash', requested: 'x', at: 0 })
  for (let i = 1; i <= 205; i++) {
    s = reduce(s, { type: 'tool.start', id: `u${i}`, tool: 'Read', requested: 'f', at: i })
    s = reduce(s, { type: 'tool.end', id: `u${i}`, outcome: 'ok', at: i })
  }
  expect(Object.keys(s.ops).length).toBe(200)
  expect(s.ops.open).toBeDefined()
  expect(s.ops.u1).toBeUndefined()
  expect(s.ops.u205).toBeDefined()
})

test('result and session end are recorded with their time; unknown observations change nothing', () => {
  let s = run([{ type: 'result', value: 'ready-for-review', at: 3 }, { type: 'session.end', at: 4 }])
  expect(s.result).toEqual({ value: 'ready-for-review', since: 3 })
  expect(s.runtime.value).toBe('ended')
  expect(reduce(s, { type: 'nonsense', at: 5 }).runtime.value).toBe('ended')
  expect(evaluateStall(s, IDLE_STALL_MS * 10).interventions['suspected-stall']).toBeUndefined()
})

test('regression: a terminal background result closes its operation and frees the runtime', () => {
  let s = run([
    { type: 'tool.start', id: 'u', tool: 'Bash', requested: 'npm test', at: 1 },
    { type: 'tool.end', id: 'u', outcome: 'backgrounded', backgroundId: 'b', at: 2 },
  ])
  expect(s.runtime.value).toBe('tool-running')
  s = reduce(s, { type: 'background.terminal', id: 'b', status: 'failed', at: 9 })
  expect(s.ops.u).toEqual({ requested: 'npm test', tool: 'Bash', startedAt: 1, endedAt: 9, outcome: 'error', backgroundId: 'b' })
  expect(s.runtime.value).toBe('idle')
  expect(evaluateStall(s, 9 + IDLE_STALL_MS).interventions['suspected-stall']).toBeDefined()
})

test('a terminal result for an unknown job records the job and leaves other operations running', () => {
  let s = run([{ type: 'tool.start', id: 'other', tool: 'Bash', requested: 'long', at: 1 }])
  s = reduce(s, { type: 'background.terminal', id: 'ghost', status: 'completed', at: 3 })
  expect(s.background.ghost.status).toBe('completed')
  expect(s.runtime.value).toBe('tool-running')
})
