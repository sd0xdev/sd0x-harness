import { expect, mock, test } from 'claude-code/testing'
import { combine } from '../lib/verdict.js'

const TASK = {
  id: 'T1', goal: 'investigate', worktree: '/w/repo', allow: [], forbid: [],
  executors: [{ argv: ['npm', 'test'], check: true }], needsUser: [['npm', 'publish']],
}
const KEY = 'binding/' + encodeURIComponent('/w/repo')

// A store the test can read back: the mod's writes land in `mem`.
export function memStore(on, mem) {
  on('store.get', ($, e) => ({ value: mem[e.key] === undefined ? undefined : JSON.parse(JSON.stringify(mem[e.key])) }))
  on('store.set', ($, e) => { mem[e.key] = JSON.parse(JSON.stringify(e.value)); return { value: undefined } })
  on('store.delete', ($, e) => { delete mem[e.key]; return { value: undefined } })
  on('store.keys', () => ({ value: Object.keys(mem) }))
}

// The test's own tool.call / tool.check hooks are the bottom of the chain: they stand in for core,
// so `core.calls` says whether a tool would have run.
async function setup($, on, { verdict = 'allow', task = TASK, surface = 'terminal' } = {}) {
  mock.clock(on)
  const mem = task ? { [KEY]: task.id, ['task/' + task.id]: task } : {}
  memStore(on, mem)
  on('session.id', () => ({ value: 'S1' }))
  on('session.cwd', () => ({ value: '/w/repo' }))
  const core = { calls: 0, mem }
  on('tool.call', ($, e) => { core.calls++; return { result: `ran: ${e.command ?? e.tool}` } })
  on('tool.check', () => ({ decision: verdict }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ surface, isInteractive: true, cwd: '/w/repo' })
  return core
}

test('Signal 5: a forbidden call is refused with the rule named before core runs', async ($, on) => {
  const core = await setup($, on)
  const r = await $.tool.call({ tool: 'Bash', command: 'kubectl rollout restart deploy/api' })
  expect(core.calls).toBe(0)
  expect(JSON.stringify(r)).toMatch(/production-write/)
  expect(JSON.stringify(r)).not.toMatch(/Allow/i)
})

test('Signal 5: an observational read reaches core unchanged', async ($, on) => {
  const core = await setup($, on)
  const r = await $.tool.call({ tool: 'Bash', command: 'git log --oneline -n 5' })
  expect(core.calls).toBe(1)
  expect(JSON.stringify(r)).toMatch(/ran: git log --oneline -n 5/)
})

test('an unclassifiable call goes to the host, and the host\'s own deny still holds', async ($, on) => {
  const core = await setup($, on, { verdict: 'deny' })
  await $.tool.call({ tool: 'Bash', command: 'python3 -c "print(1)"' })
  expect(core.calls).toBe(1)
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'python3 -c "print(1)"' } })).decision).toBe('deny')
})

test('a script that pushes inside is delegated, never classified or approved by the mod', async ($, on) => {
  const core = await setup($, on, { verdict: 'ask' })
  await $.tool.call({ tool: 'Bash', command: '/bin/bash -p /tmp/push.sh' })
  expect(core.calls).toBe(1)
  // Pass-through keeps the host's verdict: an ask stays an ask, never an allow.
  expect((await $.tool.check({ tool: 'Bash', input: { command: '/bin/bash -p /tmp/push.sh' } })).decision).toBe('ask')
})

test('a direct push is refused even with no task bound', async ($, on) => {
  const core = await setup($, on, { task: null })
  const r = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(core.calls).toBe(0)
  expect(JSON.stringify(r)).toMatch(/remote-git-write/)
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'gh pr merge 1' } })).decision).toBe('deny')
})

test('with no task bound the mod only observes', async ($, on) => {
  const core = await setup($, on, { task: null })
  await $.tool.call({ tool: 'Bash', command: 'python3 x.py' })
  expect(core.calls).toBe(1)
})

test('Signal 6: a classifier failure before delegation is refused through .catch', async ($, on) => {
  // A task whose forbid list is not an array makes the classifier throw.
  const core = await setup($, on, { task: { ...TASK, forbid: 42 } })
  const r = await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(core.calls).toBe(0)
  expect(JSON.stringify(r)).toMatch(/policy check failed before the call ran/)
})

test('Signal 10: a downstream deny stays deny for a needs-user call', async ($, on) => {
  await setup($, on, { verdict: 'deny' })
  const r = await $.tool.check({ tool: 'Bash', input: { command: 'npm publish' } })
  expect(r.decision).toBe('deny')
})

test('Signal 10: needs-user with no permission mode observed yet is refused, not asked', async ($, on) => {
  await setup($, on, { verdict: 'allow' })
  const r = await $.tool.check({ tool: 'Bash', input: { command: 'npm publish' } })
  expect(r.decision).toBe('deny')
  expect(r.reason).toMatch(/no verified approval dialog/)
})

test('Signal 10: pass-through keeps the downstream verdict — allow stays allow, ask stays ask', async ($, on) => {
  await setup($, on, { verdict: 'ask' })
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'git status' } })).decision).toBe('ask')
})

test('pass-through preserves a downstream allow and never upgrades ask', async ($, on) => {
  await setup($, on, { verdict: 'allow' })
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'git status' } })).decision).toBe('allow')
})

test('a hard deny holds at tool.check even when downstream allows', async ($, on) => {
  await setup($, on, { verdict: 'allow' })
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'git push origin main' } })).decision).toBe('deny')
})

test('a refusal is recorded in the session record with a sanitized command', async ($, on) => {
  const core = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'GH_TOKEN=abc kubectl delete pod x' })
  await new Promise((r) => setTimeout(r, 0))
  const rec = core.mem['session/S1']
  expect(rec.decisions.at(-1).outcome).toBe('deny')
  expect(rec.decisions.at(-1).requested).toBe('GH_TOKEN=<redacted> kubectl delete pod x')
  expect(rec.state.interventions['policy-denied'].detail).toBe('production-write')
})

test('combine never creates an allow and never upgrades a verdict', () => {
  const outcomes = ['pass', 'deny', 'unknown', 'needs-user']
  const downs = ['allow', 'ask', 'deny']
  const rank = { deny: 0, ask: 1, allow: 2 }
  for (const o of outcomes) for (const d of downs) for (const v of [true, false]) {
    const r = combine({ outcome: o, rule: 'r' }, { decision: d }, v)
    expect(rank[r.decision] <= rank[d]).toBe(true)
    if (r.decision === 'allow') expect(o === 'pass' && d === 'allow').toBe(true)
  }
  expect(combine({ outcome: 'pass', rule: 'r' }, undefined, false).decision).toBe('deny')
  expect(combine({ outcome: 'weird', rule: 'r' }, { decision: 'allow' }, true).decision).toBe('deny')
})

test('regression: a refusal reason at tool.check never carries a secret from the command', async ($, on) => {
  await setup($, on, { verdict: 'allow' })
  const r = await $.tool.check({ tool: 'Bash', input: { command: 'git --token=demo-secret push' } })
  expect(r.decision).toBe('deny')
  expect(r.reason).not.toMatch(/demo-secret/)
})

test('regression: a refused command with a key flag is stored redacted', async ($, on) => {
  const core = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'cat --private-key demo-secret x' })
  await new Promise((r) => setTimeout(r, 0))
  expect(JSON.stringify(core.mem['session/S1'])).not.toMatch(/demo-secret/)
})

test('regression: retention runs at session start and keeps the current session', async ($, on) => {
  mock.clock(on, { now: 30 * 24 * 60 * 60 * 1000 })
  const mem = { [KEY]: 'T1', 'task/T1': TASK, 'session/expired': { taskId: '%2Fw%2Frepo:T1', startedAt: 0 } }
  for (let i = 0; i < 6; i++) mem['session/old' + i] = { taskId: '%2Fw%2Frepo:T1', startedAt: 30 * 24 * 60 * 60 * 1000 - 1000 - i }
  memStore(on, mem)
  on('session.id', () => ({ value: 'S1' }))
  on('session.cwd', () => ({ value: '/w/repo' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  expect(mem['session/expired']).toBeUndefined()
  expect(mem['session/S1']).toBeDefined()
  const kept = Object.keys(mem).filter((k) => k.startsWith('session/'))
  expect(kept.length).toBe(5)
  expect(mem['task/T1']).toBeDefined()
})

test('regression: a refused quoted command never stores a nested secret', async ($, on) => {
  const core = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'sh -c "tool --token demo-secret"' })
  await new Promise((r) => setTimeout(r, 0))
  expect(JSON.stringify(core.mem['session/S1'])).not.toMatch(/demo-secret/)
})
