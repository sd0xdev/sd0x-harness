// Store access (tech spec § 3.2). `$.store` is one JSON file shared by every session on the machine
// and get-then-set is not atomic, so: every key a hook writes carries the session id, and this
// session's writes go through one promise chain. `task/*` and `binding/*` are written only by a
// composer command.

export const RETENTION = { maxAgeMs: 7 * 24 * 60 * 60 * 1000, perTask: 5 }

// Task ids are chosen at the prompt and are not unique across worktrees, so every task-keyed record
// is namespaced by the worktree that set it: two worktrees using one id write different keys.
// `worktreeKey` is URI-encoded and a task id matches [A-Za-z0-9._-], so neither carries `:` or `/`.
export function taskScope(worktreeKey, taskId) {
  return `${worktreeKey}:${taskId}`
}

export const keys = {
  task: (taskId) => `task/${taskId}`,
  binding: (worktreeKey) => `binding/${worktreeKey}`,
  session: (sessionId) => `session/${sessionId}`,
  checkpoint: (taskId, sessionId) => `checkpoint/${taskId}/${sessionId}`,
}

// One serialized writer per session. A failed write never throws into the hook that asked for it;
// it is reported through `health`, which the band and `/agentctl` show.
export function createWriter(store) {
  let chain = Promise.resolve()
  const health = { value: 'ok', lastError: null }
  function enqueue(op) {
    const run = chain.then(op).then(
      () => { if (health.value === 'store-error') health.value = 'ok' ; return true },
      (err) => { health.value = 'store-error'; health.lastError = String(err && err.message ? err.message : err).slice(0, 200); return false },
    )
    chain = run
    return run
  }
  return {
    health,
    set: (key, value) => enqueue(() => store.set(key, value)),
    delete: (key) => enqueue(() => store.delete(key)),
    idle: () => chain,
  }
}

// Retention at session start: session records older than maxAge, and all but the newest `perTask`
// sessions and checkpoints of each task, are deleted. Pure planning, so it is testable.
export function planRetention(entries, now, { maxAgeMs, perTask } = RETENTION) {
  const del = new Set()
  const sessions = entries.filter((e) => e.key.startsWith('session/'))
  const checkpoints = entries.filter((e) => e.key.startsWith('checkpoint/'))
  for (const e of sessions) if (now - (e.value?.startedAt ?? 0) > maxAgeMs) del.add(e.key)
  const byTask = (list, at) => {
    // A Map keyed by the task id itself: sessions without a task share the `null` group, which no
    // valid task id can collide with (found live: grouping them by their own id left them uncapped).
    // A checkpoint's task is the second segment of its key.
    const groups = new Map()
    for (const e of list) {
      const t = e.key.startsWith('checkpoint/') ? e.key.split('/')[1] : (e.value?.taskId ?? null)
      if (!groups.has(t)) groups.set(t, [])
      groups.get(t).push(e)
    }
    for (const g of groups.values()) {
      g.sort((a, b) => at(b) - at(a))
      for (const e of g.slice(perTask)) del.add(e.key)
    }
  }
  byTask(sessions.filter((e) => !del.has(e.key)), (e) => e.value?.startedAt ?? 0)
  byTask(checkpoints, (e) => e.value?.savedAt ?? 0)
  return [...del]
}

export async function applyRetention(store, writer, now) {
  const all = await store.keys()
  const entries = []
  for (const key of all) {
    if (key.startsWith('session/') || key.startsWith('checkpoint/')) entries.push({ key, value: await store.get(key) })
  }
  const doomed = planRetention(entries, now)
  for (const key of doomed) writer.delete(key)
  await writer.idle()
  return doomed
}

// The newest checkpoint among a task's sessions — what resume shows.
export async function latestCheckpoint(store, taskId) {
  let best = null
  for (const key of await store.keys()) {
    if (!key.startsWith(`checkpoint/${taskId}/`)) continue
    const v = await store.get(key)
    if (v && (!best || (v.savedAt ?? 0) > (best.savedAt ?? 0))) best = v
  }
  return best
}
