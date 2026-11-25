import { expect, test } from 'claude-code/testing'
import { age, backgroundItems, compactLines, detailLines, describeItem, isOpen, statusKind } from '../lib/background.js'
import { handoff } from '../lib/handoff.js'
import { parseTaskStatus } from '../lib/notices.js'
import { IDLE_STALL_MS, evaluateStall, initialState, reduce } from '../lib/reducer.js'
import { statusText } from '../lib/view.js'

const CTX = 1
const run = (obs, s = initialState(0)) => obs.reduce((acc, o) => reduce(acc, { ctx: CTX, ...o }), s)
const bash = (id, bg, cmd, at) => [{ type: 'tool.start', id, tool: 'Bash', requested: cmd, at }, { type: 'tool.end', id, outcome: 'backgrounded', backgroundId: bg, at: at + 1 }]
const list = (at, ...ids) => ({ type: 'background.inflight', ids, at })
const end = (id, status, at) => ({ type: 'background.terminal', id, status, at })
const readings = (s, ctx = CTX) => Object.fromEntries(backgroundItems(s, ctx).map((i) => [i.id, i.reading]))
const status = (s, now, details = false) => statusText({ now, task: null, state: s, health: 'ok', contextAt: CTX }, { details })

test('UC-1 a job in the latest supplied list → listed, named by its command, with time and source', () => {
  const s = run([...bash('u1', 'b1', 'npm test', 1000), list(5000, 'b1')])
  expect(readings(s)).toEqual({ b1: 'listed' })
  const t = status(s, 25000)
  expect(t).toMatch(/Background named by the host, newest 20s ago: 1 — npm test \(b1\)/)
  expect(status(s, 25000, true)).toMatch(/npm test \(b1\): listed by the host 20s ago \(Stop event\); started 23s|npm test \(b1\): listed by the host 20s ago \(Stop event\); started 24s/)
})

test('UC-2 an observed end → not among the open items', () => {
  const s = run([...bash('u1', 'b1', 'npm test', 1), list(5, 'b1'), end('b1', 'completed', 9)])
  expect(backgroundItems(s, CTX)).toEqual([])
  expect(status(s, 10)).not.toMatch(/Background/)
})

test('UC-3 started, no list since → completion unobserved, never in flight', () => {
  const s = run(bash('u1', 'b1', 'npm test', 1000))
  expect(readings(s)).toEqual({ b1: 'started' })
  const t = status(s, 61000)
  expect(t).toMatch(/1 with completion unobserved, oldest evidence 60s ago — npm test \(b1\)/)
  expect(t).not.toMatch(/in flight|running/)
})

test('UC-1 beside UC-4 → two lines, the absence dated by the list that proves it', () => {
  const s = run([...bash('u2', 'b2', 'npm run build', 0), list(3_600_000, 'b2'), ...bash('u1', 'b1', 'npm test', 10_700_000), list(10_800_000, 'b1')])
  expect(readings(s)).toEqual({ b2: 'left-list', b1: 'listed' })
  const t = status(s, 10_820_000)
  expect(t.split('\n').filter((l) => l.startsWith('Background'))).toEqual([
    'Background named by the host, newest 20s ago: 1 — npm test (b1)',
    'Background: 1 with completion unobserved, oldest evidence 2h ago — npm run build (b2)',
  ])
  expect(status(s, 10_820_000, true)).toMatch(/npm run build \(b2\): started 3h ago, last listed 2h ago, not in the host list of 20s ago; completion unobserved/)
})

test('an empty list that was supplied → also proves the absence', () => {
  const s = run([...bash('u2', 'b2', 'x', 0), list(10, 'b2'), list(20)])
  expect(readings(s)).toEqual({ b2: 'left-list' })
})

test('UC-5 a later event without a list → last listed, later membership unknown', () => {
  const s = run([...bash('u2', 'b2', 'x', 0), list(10, 'b2'), { type: 'background.list-missing', at: 20 }])
  expect(readings(s)).toEqual({ b2: 'list-unknown' })
  expect(describeItem(backgroundItems(s, CTX)[0], age(30))).toMatch(/whether it was listed since is unknown; completion unobserved/)
})

test('UC-6 the same end twice → the same state', () => {
  const once = run([...bash('u1', 'b1', 'x', 1), end('b1', 'failed', 9)])
  const twice = reduce(once, { ...end('b1', 'failed', 12), ctx: CTX })
  expect(twice.background).toEqual(once.background)
})

test('UC-7 two different ends → conflicting, both shown with times', () => {
  const s = run([...bash('u1', 'b1', 'x', 1000), end('b1', 'completed', 9000), end('b1', 'failed', 12000)])
  expect(readings(s)).toEqual({ b1: 'conflict' })
  expect(status(s, 20000)).toMatch(/1 with conflicting ends/)
  expect(status(s, 20000, true)).toMatch(/conflicting ends: completed 11s ago, failed 8s ago/)
})

test('UC-8 an end seen before its start → the end stands and closes the operation', () => {
  const s = run([{ type: 'tool.start', id: 'u1', tool: 'Bash', requested: 'x', at: 1 }, end('b1', 'failed', 2), { type: 'tool.end', id: 'u1', outcome: 'backgrounded', backgroundId: 'b1', at: 3 }])
  expect(s.background.b1.status).toBe('failed')
  expect(s.ops.u1.outcome).toBe('error')
  expect(backgroundItems(s, CTX)).toEqual([])
})

test('UC-9 a word not known here → shown sanitized, not an end; the next list supersedes it', () => {
  const s = run([...bash('u1', 'b1', 'x', 1000), { type: 'background.unknown-word', id: 'b1', word: 'token=abc paused', at: 5000 }])
  expect(readings(s)).toEqual({ b1: 'unknown-word' })
  const t = status(s, 6000, true)
  expect(t).toMatch(/host status word not known here: "token=<redacted> paused" 1s ago; not an end/)
  expect(readings(run([list(7000, 'b1')], s))).toEqual({ b1: 'listed' })
})

test('UC-10 a record from an earlier load, or saved by 0.3.1 → says so until seen again', () => {
  const old = { ...initialState(0), background: { b1: { status: 'in-flight', since: 1, asOf: 5 } } }
  expect(readings(old, 99)).toEqual({ b1: 'before-reload' })
  const seen = reduce(old, { ...list(120, 'b1'), ctx: 99 })
  expect(readings(seen, 99)).toEqual({ b1: 'listed' })
})

test('UC-11 no items → compact says nothing; details never says nothing is running', () => {
  const s = initialState(0)
  expect(status(s, 10)).not.toMatch(/Background/)
  const t = status(s, 10, true)
  expect(t).toMatch(/Background: nothing observed; untracked work cannot be confirmed either way/)
  expect(t).not.toMatch(/nothing is running/)
})

test('UC-12 quiet with an open item → the stall hint stays quiet and the reason is shown; without it the hint speaks', () => {
  const s = run(bash('u1', 'b1', 'x', 1))
  const now = IDLE_STALL_MS + 10
  expect(evaluateStall(s, now).interventions['suspected-stall']).toBeUndefined()
  expect(status(s, now)).toMatch(/stall not evaluated while work is open/)
  expect(status(s, 5)).not.toMatch(/stall not evaluated/)
  const closed = run([end('b1', 'completed', 3)], s)
  expect(evaluateStall(closed, now).interventions['suspected-stall']).toBeDefined()
})

test('UC-13 an observed failure beside an open item → both visible, apart', () => {
  const s = run(bash('u1', 'b1', 'npm run dev', 1))
  const evidence = { k: { requested: 'npm test', outcome: 'error', at: 1000, before: { value: 'a', coverage: 'c' }, after: { value: 'a', coverage: 'c' }, coverage: 'c' } }
  const t = statusText({ now: 2000, task: null, state: s, health: 'ok', contextAt: CTX, evidence, fingerprint: { value: 'a', coverage: 'c' } })
  expect(t).toMatch(/npm test: error/)
  expect(t).toMatch(/1 with completion unobserved/)
})

test('listed again after an end → open, and the end is kept; a later end is not a conflict', () => {
  const s = run([list(5, 'agent1'), end('agent1', 'completed', 9), list(20, 'agent1')])
  expect(readings(s)).toEqual({ agent1: 'seen-again' })
  expect(describeItem(backgroundItems(s, CTX)[0], age(30))).toMatch(/ended completed 0s ago|ended completed/)
  const done = run([end('agent1', 'failed', 40)], s)
  expect(done.background.agent1.conflict).toBeUndefined()
  expect(isOpen(done.background.agent1)).toBe(false)
})

test('a start linked after the host named an ended id again → stays open, and its operation is not closed', () => {
  const s = run([end('b1', 'completed', 3), list(5, 'b1'), ...bash('u1', 'b1', 'npm test', 6)])
  expect(isOpen(s.background.b1)).toBe(true)
  expect(s.ops.u1.outcome).toBe('backgrounded')
  const done = run([end('b1', 'failed', 9)], s)
  expect(done.ops.u1.outcome).toBe('error')
})

test('reopened, then absent from a newer list → absent, with the end and the sighting kept as history', () => {
  const s = run([end('x', 'completed', 3), list(5, 'x'), list(7)])
  expect(readings(s)).toEqual({ x: 'left-list' })
  expect(describeItem(backgroundItems(s, CTX)[0], (at) => `@${at}`)).toMatch(/ended completed @3, named again by the host @5, last listed @5, not in the host list of @7; completion unobserved/)
  expect(compactLines(s, 10, CTX, false).join('\n')).not.toMatch(/named by the host, newest/)
})

test('reopened, then an unknown word → the word is the reading; before the reopening an ended record keeps no word', () => {
  const word = { type: 'background.unknown-word', id: 'x', word: 'paused', at: 8 }
  const s = run([end('x', 'completed', 3), list(5, 'x'), word])
  expect(readings(s)).toEqual({ x: 'unknown-word' })
  expect(describeItem(backgroundItems(s, CTX)[0], (at) => `@${at}`)).toMatch(/ended completed @3, named again by the host @5; host status word not known here: "paused" @8; not an end/)
  expect(run([end('x', 'completed', 3), word]).background.x.word).toBeUndefined()
})

test('reopened, then the list field missing → still the last sighting', () => {
  expect(readings(run([end('x', 'completed', 3), list(5, 'x'), { type: 'background.list-missing', at: 7 }]))).toEqual({ x: 'seen-again' })
})

test('conflicting ends → the age is that of the ends, not of an older listing', () => {
  const day = 86400 * 1000
  const s = run([list(0, 'b1'), end('b1', 'completed', day - 2000), end('b1', 'failed', day - 1000)])
  expect(compactLines(s, day, CTX, false)[0]).toMatch(/1 with conflicting ends, oldest evidence 1s ago/)
})

test('state saved by 0.3.1 with equal list times → each was listed then, and the latest list stays unknown', () => {
  const s = { ...run([]), background: { a: { status: 'in-flight', since: 1, asOf: 5 }, b: { status: 'in-flight', since: 1, asOf: 5 }, c: { status: 'in-flight', since: 1, asOf: 3 } } }
  expect(Object.fromEntries(backgroundItems(s, CTX).map((i) => [i.id, i.was]))).toEqual({ a: 'list-unknown', b: 'list-unknown', c: 'left-list' })
  expect(new Set(Object.values(readings(s)))).toEqual(new Set(['before-reload']))
})

test('no sequence of age, absence or an unknown word → closes a record', () => {
  let s = run([...bash('u1', 'b1', 'x', 1), list(5, 'b1'), list(6), { type: 'background.list-missing', at: 7 }, { type: 'background.unknown-word', id: 'b1', word: 'gone', at: 8 }])
  s = reduce(s, { type: 'tick', at: 10 ** 12 })
  expect(isOpen(s.background.b1)).toBe(true)
  expect(compactLines(s, 10 ** 12, CTX, false).length).toBe(1)
})

test('a host report about an id never held → creates no open item', () => {
  const s = run([{ type: 'background.unknown-word', id: 'ghost', word: 'paused', at: 1 }, { type: 'background.working', id: 'ghost', at: 2 }])
  expect(s.background).toEqual({})
})

test('a list and an empty list in the same millisecond → the later one decides, not the equal time', () => {
  expect(readings(run([list(5, 'a'), list(5)]))).toEqual({ a: 'left-list' })
  expect(readings(run([list(5), list(5, 'a')]))).toEqual({ a: 'listed' })
})

test('a start after a list → that list says nothing about it', () => {
  expect(readings(run([list(5), ...bash('u1', 'b1', 'x', 4)]))).toEqual({ b1: 'started' })
})

test('a query or a word from an earlier load → keeps its source and time, and says it is from before', () => {
  const q = run([...bash('u1', 'b1', 'x', 1), { type: 'background.working', id: 'b1', via: 'task query', at: 5 }])
  const w = run([...bash('u1', 'b1', 'x', 1), { type: 'background.unknown-word', id: 'b1', word: 'paused', at: 5 }])
  for (const [s, want] of [[q, /reported working by the host @5 \(task query\); started @2; from before this session was loaded, not seen since/], [w, /"paused" @5; not an end; from before this session was loaded/]]) {
    const item = backgroundItems(s, 99)[0]
    expect(item.reading).toBe('before-reload')
    expect(describeItem(item, (at) => `@${at}`)).toMatch(want)
  }
  const again = reduce(q, { type: 'background.working', id: 'b1', via: 'task query', at: 120, ctx: 99 })
  expect(backgroundItems(again, 99)[0].reading).toBe('working')
})

test('a task query that says working → named by the host with that source', () => {
  const s = run([...bash('u1', 'b1', 'x', 1000), { type: 'background.working', id: 'b1', via: 'task query', at: 5000 }])
  expect(readings(s)).toEqual({ b1: 'working' })
  expect(status(s, 6000, true)).toMatch(/reported working by the host 1s ago \(task query\)/)
})

test('many items → still at most two compact lines, with the rest counted', () => {
  const s = run([...['a', 'b', 'c', 'd', 'e'].flatMap((x, i) => bash('u' + x, x, 'cmd ' + x, i)), list(100, 'a', 'b')])
  const lines = compactLines(s, 200, CTX, false)
  expect(lines.length).toBe(2)
  expect(lines[1]).toMatch(/: 3 with completion unobserved|3 with completion unobserved/)
  expect(detailLines(s, 200, CTX).length).toBe(6)
})

test('a command or id carrying a secret → sanitized in both displays', () => {
  const s = run(bash('u1', 'b1', 'deploy --token hunter2secret', 1))
  for (const t of [status(s, 10), status(s, 10, true), handoff({ task: null, state: s, evidence: {}, now: 10, sessionId: 'S', contextAt: CTX })]) {
    expect(t).not.toMatch(/hunter2secret/)
  }
})

test('the word table is one for both paths, and a notification keeps any word', () => {
  expect(['completed', 'failed', 'killed', 'cancelled', 'working', 'input_required', ''].map(statusKind)).toEqual(['end', 'end', 'end', 'end', 'working', 'unknown', 'unknown'])
  expect(parseTaskStatus('<task-id>b1</task-id><status>stopped</status>')).toEqual({ id: 'b1', status: 'stopped' })
  expect(parseTaskStatus('<task-id>b1</task-id>')).toBe(null)
})
