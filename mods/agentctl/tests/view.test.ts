import { expect, test } from 'claude-code/testing'
import { bandText } from '../lib/view.js'
import { initialState } from '../lib/reducer.js'

test('regression: the band marks a gate reading past its freshness as stale, with its age', () => {
  const base = { task: null, state: initialState(0), health: 'ok' }
  const gate = { value: 'code ✅ · doc ✅ · precommit ✅', source: 'review-state.js check', at: 0, staleAfterMs: 30000 }
  expect(bandText({ ...base, now: 10000, gate })).toMatch(/code ✅ · doc ✅ · precommit ✅ \(10s\)/)
  expect(bandText({ ...base, now: 31000, gate })).toMatch(/\(31s, stale\)/)
  expect(bandText({ ...base, now: 0, gate: { failed: 'x', at: 0 } })).toMatch(/gates unavailable/)
  expect(bandText({ ...base, now: 0, gate: null })).toMatch(/gates missing/)
})
