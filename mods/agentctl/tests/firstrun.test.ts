import { expect, test } from 'claude-code/testing'
import { checkArgv, copy, draftingRequest, helpText, helperPath, languageOf, nextForTask, parseCommand, shellQuote, suggestionWhileWaiting } from '../lib/firstrun.js'

test('parseCommand: empty input is status; verbs are case-insensitive; arguments are checked per verb', () => {
  for (const x of [null, undefined, '', '   ']) expect(parseCommand(x)).toEqual({ kind: 'status', words: [] })
  expect(parseCommand('ACCEPT ab12cd34')).toEqual({ kind: 'verb', verb: 'accept', rest: ['ab12cd34'] })
  expect(parseCommand('status --details')).toEqual({ kind: 'verb', verb: 'status', rest: ['--details'] })
  expect(parseCommand('status --verbose').kind).toBe('extra')
  expect(parseCommand('help advanced').kind).toBe('verb')
  expect(parseCommand('help me').kind).toBe('extra')
  for (const v of ['proposal', 'discard', 'policy', 'handoff', 'last', 'stop']) expect([v, parseCommand(`${v} x`).kind]).toEqual([v, 'extra'])
  expect(parseCommand('accept a b').kind).toBe('extra')
  expect(parseCommand('task set {"goal":"x"}')).toEqual({ kind: 'verb', verb: 'task', rest: ['set', '{"goal":"x"}'] })
})

test('parseCommand: only command-shaped lines are near-misses; everything else is a goal, kept verbatim', () => {
  expect(parseCommand('accepet ab12cd34')).toEqual({ kind: 'typo', verb: 'accept', words: ['accepet', 'ab12cd34'] })
  expect(parseCommand('stauts')).toMatchObject({ kind: 'typo', verb: 'status' })
  expect(parseCommand('test the login flow')).toEqual({ kind: 'goal', text: 'test the login flow' })
  expect(parseCommand('  測試一下這個新功能  ')).toEqual({ kind: 'goal', text: '測試一下這個新功能' })
  expect(parseCommand('refactor')).toEqual({ kind: 'goal', text: 'refactor' })
  expect(parseCommand('fix $(id) `x`')).toEqual({ kind: 'goal', text: 'fix $(id) `x`' })
})

test('languageOf is a Han-script heuristic, not locale detection', () => {
  expect(languageOf('測試一下')).toBe('zh')
  expect(languageOf('add a 測試')).toBe('zh')
  expect(languageOf('add a test')).toBe('en')
  expect(languageOf(undefined)).toBe('en')
})

test('shellQuote and helperPath: single quotes survive, a .claude-plugin root is tolerated', () => {
  expect(shellQuote("/a b/it's")).toBe(`'/a b/it'\\''s'`)
  expect(helperPath('/p/agentctl')).toBe('/p/agentctl/bin/propose.mjs')
  expect(helperPath('/p/agentctl/')).toBe('/p/agentctl/bin/propose.mjs')
  expect(helperPath('/p/agentctl/.claude-plugin')).toBe('/p/agentctl/bin/propose.mjs')
})

test('draftingRequest: goal verbatim, base, quoted paths and the rules, in both languages', () => {
  const en = draftingRequest({ goal: 'fix "it"', worktree: "/w/it's", base: 'T9', root: '/p', lang: 'en' })
  expect(en).toMatch(/^Draft an agentctl task scope for: "fix "it""/)
  expect(en).toMatch(/node '\/p\/bin\/propose\.mjs' --worktree '\/w\/it'\\''s' --help/)
  expect(en).toMatch(/base "T9"/)
  expect(en).toMatch(/ask me and wait for my answer — write no proposal before it/)
  expect(en).toMatch(/Write the proposal only, then wait for me to accept\./)
  const zh = draftingRequest({ goal: '測試', worktree: '/w', base: null, root: '/p', lang: 'zh' })
  expect(zh).toMatch(/「測試」/)
  expect(zh).toMatch(/base 為 null/)
  expect(zh).toMatch(/問我並等我回答——回答前不要寫 proposal/)
})

test('helpText: three verbs first, the rest on request', () => {
  expect(helpText('en', false).split('\n').filter((l) => l.startsWith('  /agentctl')).length).toBe(3)
  expect(helpText('zh', true)).toMatch(/task show \| set <json> \| clear/)
})

test('the drafting request keeps its fixed overhead small in both languages (≤ 150 tokens, measured by proxy)', () => {
  // Proxy: about 4 ASCII characters or 1 Han character per token. The goal and paths are never cut.
  const est = (t) => Math.ceil(t.replace(/\p{Script=Han}/gu, '').length / 4) + (t.match(/\p{Script=Han}/gu) ?? []).length
  for (const lang of ['en', 'zh']) {
    const fixed = draftingRequest({ goal: '', worktree: '', base: null, root: '', lang })
    expect([lang, est(fixed) <= 150]).toEqual([lang, true])
  }
  const long = 'g'.repeat(5000)
  expect(draftingRequest({ goal: long, worktree: '/w', base: null, root: '/p', lang: 'en' })).toContain(long)
})

test('live finding: while a proposal waits, only the host\'s own suggestion becomes the accept line', () => {
  expect(suggestionWhileWaiting('suggestion', 'ee2d9ce908511d3aa6c20e43')).toBe('/agentctl accept ee2d9ce9')
  expect(suggestionWhileWaiting('plugin', 'ee2d9ce908511d3aa6c20e43')).toBeNull()
  expect(suggestionWhileWaiting('suggestion', null)).toBeNull()
  expect(suggestionWhileWaiting(undefined, 'ee2d9ce9')).toBeNull()
})

test('nextForTask: no check, all current, none run, some stale — in both languages', () => {
  for (const lang of ['en', 'zh']) {
    const t = copy(lang)
    expect(nextForTask(t, { declared: 0, ran: 0, pending: [] })).toBe(t.next.task)
    expect(nextForTask(t, { declared: 2, ran: 2, pending: [] })).toBe(t.next.checksCurrent)
    expect(nextForTask(t, { declared: 2, ran: 0, pending: ['npm test', 'npm run lint'] })).toBe(t.next.taskThenChecks(['npm test', 'npm run lint']))
    expect(nextForTask(t, { declared: 2, ran: 1, pending: ['npm run lint'] })).toBe(t.next.rerun(['npm run lint']))
  }
  expect(copy('zh').next.rerun(['npm test'])).toMatch(/逐字執行：npm test/)
})

test('checkArgv: only checks, quoted to read back as declared; a missing task or executor list is empty', () => {
  expect(checkArgv({ executors: [{ argv: ['npm', 'test'], check: true }, { argv: ['make'] }, { argv: ['node', '--test', 'a b'], check: true }] })).toEqual(['npm test', "node --test 'a b'"])
  // A word no quoting can carry is shown as its words, never as a line that would not match.
  expect(checkArgv({ executors: [{ argv: ['sh', "it's $x"], check: true }] })).toEqual(['["sh","it\'s $x"] (as these words)'])
  for (const x of [null, undefined, {}, { executors: [] }]) expect(checkArgv(x)).toEqual([])
})
