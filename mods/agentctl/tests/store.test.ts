import { expect, test } from 'claude-code/testing'
import { RETENTION, applyRetention, createWriter, keys, latestCheckpoint, planRetention } from '../lib/store.js'

function memStore({ failSet = false } = {}) {
  const m = new Map()
  return {
    m,
    get: async (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : undefined),
    set: async (k, v) => { if (failSet) throw new Error('store over 4 MiB'); await Promise.resolve(); m.set(k, v) },
    delete: async (k) => { m.delete(k) },
    keys: async () => [...m.keys()],
  }
}

test('keys carry the session id wherever a hook writes', () => {
  expect(keys.session('s1')).toBe('session/s1')
  expect(keys.checkpoint('T', 's1')).toBe('checkpoint/T/s1')
  expect(keys.task('T')).toBe('task/T')
  expect(keys.binding('w')).toBe('binding/w')
})

test('two sessions writing concurrently never overwrite each other', async () => {
  const store = memStore()
  const a = createWriter(store)
  const b = createWriter(store)
  for (let i = 0; i < 20; i++) {
    a.set(keys.session('A'), { n: i })
    b.set(keys.session('B'), { n: i * 10 })
  }
  await Promise.all([a.idle(), b.idle()])
  expect(store.m.get('session/A')).toEqual({ n: 19 })
  expect(store.m.get('session/B')).toEqual({ n: 190 })
})

test('one session writes in order through its chain', async () => {
  const store = memStore()
  const w = createWriter(store)
  const seen = []
  const orig = store.set
  store.set = async (k, v) => { seen.push(v.n); return orig(k, v) }
  for (let i = 0; i < 5; i++) w.set('session/A', { n: i })
  await w.idle()
  expect(seen).toEqual([0, 1, 2, 3, 4])
})

test('a failed write surfaces as store-error health and does not throw; a later success clears it', async () => {
  const store = memStore({ failSet: true })
  const w = createWriter(store)
  const ok = await w.set('session/A', { x: 1 })
  expect(ok).toBe(false)
  expect(w.health.value).toBe('store-error')
  expect(w.health.lastError).toMatch(/4 MiB/)
  store.set = async (k, v) => { store.m.set(k, v) }
  expect(await w.set('session/A', { x: 2 })).toBe(true)
  expect(w.health.value).toBe('ok')
})

test('retention deletes sessions past 7 days and all but the 5 newest per task', () => {
  const now = RETENTION.maxAgeMs * 10
  const entries = [{ key: 'session/old', value: { taskId: 'T', startedAt: now - RETENTION.maxAgeMs - 1 } }]
  for (let i = 0; i < 7; i++) entries.push({ key: `session/s${i}`, value: { taskId: 'T', startedAt: now - i } })
  for (let i = 0; i < 6; i++) entries.push({ key: `checkpoint/T/s${i}`, value: { savedAt: now - i } })
  entries.push({ key: 'session/other', value: { taskId: 'U', startedAt: now - 100 } })
  const doomed = planRetention(entries, now).sort()
  expect(doomed).toEqual(['checkpoint/T/s5', 'session/old', 'session/s5', 'session/s6'].sort())
})

test('applyRetention removes the planned keys and leaves task and binding records alone', async () => {
  const store = memStore()
  const now = RETENTION.maxAgeMs * 3
  store.m.set('task/T', { id: 'T' })
  store.m.set('binding/w', 'T')
  store.m.set('session/old', { taskId: 'T', startedAt: 0 })
  store.m.set('session/new', { taskId: 'T', startedAt: now })
  const w = createWriter(store)
  const doomed = await applyRetention(store, w, now)
  expect(doomed).toEqual(['session/old'])
  expect([...store.m.keys()].sort()).toEqual(['binding/w', 'session/new', 'task/T'])
})

test('latestCheckpoint returns the newest across the task sessions, or null', async () => {
  const store = memStore()
  expect(await latestCheckpoint(store, 'T')).toBe(null)
  store.m.set('checkpoint/T/a', { savedAt: 5, md: 'a' })
  store.m.set('checkpoint/T/b', { savedAt: 9, md: 'b' })
  store.m.set('checkpoint/U/c', { savedAt: 99, md: 'c' })
  expect((await latestCheckpoint(store, 'T')).md).toBe('b')
})

test('regression (found live): sessions with no task are capped at 5 as one group', () => {
  const now = 1000
  const entries = []
  for (let i = 0; i < 7; i++) entries.push({ key: `session/n${i}`, value: { taskId: null, startedAt: now - i } })
  expect(planRetention(entries, now).sort()).toEqual(['session/n5', 'session/n6'])
})

test('regression: the unbound group never collides with a task literally named no-task or null', () => {
  const now = 1000
  const entries = []
  for (let i = 0; i < 5; i++) entries.push({ key: `session/u${i}`, value: { taskId: null, startedAt: now - i } })
  for (let i = 0; i < 5; i++) entries.push({ key: `session/t${i}`, value: { taskId: 'no-task', startedAt: now - 10 - i } })
  for (let i = 0; i < 5; i++) entries.push({ key: `session/n${i}`, value: { taskId: 'null', startedAt: now - 20 - i } })
  expect(planRetention(entries, now)).toEqual([])
})
