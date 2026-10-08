import { expect, test } from 'claude-code/testing'
import { bandText, checkKey, checkProgress, evidenceCurrent } from '../lib/view.js'
import { initialState } from '../lib/reducer.js'

test('regression: the band marks a gate reading past its freshness as stale, with its age', () => {
  const base = { task: null, state: initialState(0), health: 'ok' }
  const gate = { value: 'code ✅ · doc ✅ · precommit ✅', source: 'review-state.js check', at: 0, staleAfterMs: 30000 }
  expect(bandText({ ...base, now: 10000, gate })).toMatch(/code ✅ · doc ✅ · precommit ✅ \(10s\)/)
  expect(bandText({ ...base, now: 31000, gate })).toMatch(/\(31s, stale\)/)
  expect(bandText({ ...base, now: 0, gate: { failed: 'x', at: 0 } })).toMatch(/gates unavailable/)
  expect(bandText({ ...base, now: 0, gate: null })).toMatch(/gates missing/)
})

test('evidenceCurrent and checkProgress: current only on an unchanged, complete, matching, error-free run', () => {
  const fp = { value: 'v1', coverage: 'full' }
  const ok = { outcome: 'ok', before: { value: 'v1', coverage: 'full' }, after: { value: 'v1', coverage: 'full' }, coverage: 'full' }
  expect(evidenceCurrent(ok, fp)).toBe(true)
  expect(evidenceCurrent(ok, null)).toBe(false)
  expect(evidenceCurrent(undefined, fp)).toBe(false)
  expect(evidenceCurrent({ ...ok, outcome: 'error' }, fp)).toBe(false)
  expect(evidenceCurrent({ ...ok, after: null }, fp)).toBe(false)
  expect(evidenceCurrent({ ...ok, before: { value: 'v0', coverage: 'full' } }, fp)).toBe(false)
  expect(evidenceCurrent(ok, { value: 'v2', coverage: 'full' })).toBe(false)
  expect(evidenceCurrent(ok, { value: 'v1', coverage: 'partial' })).toBe(false)
  const task = { executors: [{ argv: ['npm', 'test'], check: true }, { argv: ['npm', 'run', 'lint'], check: true }, { argv: ['make'] }] }
  expect(checkProgress(task, {}, fp)).toEqual({ declared: 2, ran: 0, pending: ['npm test', 'npm run lint'] })
  expect(checkProgress(task, { [checkKey(['npm', 'test'])]: ok }, fp)).toEqual({ declared: 2, ran: 1, pending: ['npm run lint'] })
  expect(checkProgress(task, { [checkKey(['npm', 'test'])]: ok, [checkKey(['npm', 'run', 'lint'])]: ok }, fp)).toEqual({ declared: 2, ran: 2, pending: [] })
  expect(checkProgress(null, {}, fp)).toEqual({ declared: 0, ran: 0, pending: [] })
  expect(checkKey(['a', 'b'])).not.toBe(checkKey(['a b']))
})
