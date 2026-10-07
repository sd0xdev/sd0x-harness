import { expect, mock, test } from 'claude-code/testing'
import { decideNotices } from '../lib/notices.js'
import { handoff } from '../lib/handoff.js'
import { CAPS } from '../lib/sanitize.js'

const TASK = {
  id: 'T1', goal: 'investigate the quiz service', worktree: '/w/repo', allow: [], forbid: [],
  executors: [{ argv: ['npm', 'test'], check: true }], needsUser: [], acceptance: ['tests pass'],
}
const KEY = 'binding/' + encodeURIComponent('/w/repo')

function memStore(on, mem, world = {}) {
  on('store.get', ($, e) => ({ value: mem[e.key] === undefined ? undefined : JSON.parse(JSON.stringify(mem[e.key])) }))
  on('store.set', async ($, e) => {
    if (world.storeDelay && e.key.startsWith('checkpoint/')) await new Promise((r) => setTimeout(r, world.storeDelay))
    if (world.storeFail && e.key.startsWith('checkpoint/')) throw new Error('store over 4 MiB')
    if (world.failSetPrefix && e.key.startsWith(world.failSetPrefix)) throw new Error('store over 4 MiB')
    mem[e.key] = JSON.parse(JSON.stringify(e.value)); (world.order ??= []).push('set:' + e.key.split('/')[0]); return { value: undefined }
  })
  on('store.delete', ($, e) => { if (world.failDelete) throw new Error('store unavailable'); delete mem[e.key]; return { value: undefined } })
  on('store.keys', () => ({ value: Object.keys(mem) }))
}

// A world the mod reads: git answers from `world.git`, the gate script from `world.gate`.
async function setup($, on, opts = {}) {
  const world = {
    git: { head: 'abc123\n', index: '100644 h1 0\ta.js\0', flags: 'H a.js\0', status: '', hash: '' },
    gate: opts.gate ?? { exitCode: 0, stdout: JSON.stringify({ code_review: { passed: true }, doc_review: { passed: true }, precommit: { passed: true } }), stderr: '' },
    gateExists: opts.gateExists ?? true,
    usage: opts.usage ?? { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 47, resetsAt: '18:30', source: 'api' }] },
    runs: [], toasts: [], core: 0, registered: [], logs: [], coreResult: opts.coreResult ?? (() => ({ result: { stdout: 'ok', stderr: '', interrupted: false } })),
    failFingerprint: false, abort: opts.abort, sessionId: 'S1', invalidateThrows: false, hold: null,
  }
  let clock
  if (opts.clock === 'custom') {
    // A clock that can fail only after core ran: the one failure the hooks await after next(e).
    let t = 0
    on('clock.now', () => { if (world.clockThrowsAfterCore && world.afterCore) throw new Error('injected clock failure after delegation'); return { value: (t += 1) } })
    on('clock.every', () => ({ value: undefined }))
  } else clock = mock.clock(on)
  const mem = opts.task === null ? {} : { [KEY]: (opts.task ?? TASK).id, ['task/' + (opts.task ?? TASK).id]: opts.task ?? TASK }
  memStore(on, mem, world)
  world.sessionId = 'S1'
  on('session.id', () => ({ value: world.sessionId }))
  on('session.cwd', () => ({ value: '/w/repo' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: world.usage }))
  world.registered = []
  on('command.register', ($, e) => { world.registered.push(e); return { value: undefined } })
  world.logs = []
  on('ui.log', ($, e) => { world.logs.push(e.text); return { value: undefined } })
  world.files = {}
  // The person's prompt box (first run, 0.3.0): what is typed, what was filled, suggested or sent.
  world.box = ''; world.fillOk = true; world.filled = []; world.suggested = []; world.submitted = 0
  on('prompt.read', () => { if (world.readThrows) throw new Error('no box'); if (world.noBox) return { value: undefined }; return { value: { text: world.box, cursor: world.box.length } } })
  on('prompt.fill', ($, e) => { if (world.fillThrows) throw new Error('fill failed'); world.filled.push(e.text); if (world.typedMeanwhile) { world.box += world.typedMeanwhile; world.typedMeanwhile = '' } if (world.fillOk) world.box = e.mode === 'append' ? world.box + e.text : e.text; return { isFilled: world.fillOk } })
  on('prompt.suggest', ($, e) => { if (world.suggestThrows) throw new Error('suggest failed'); world.suggested.push(e.text); return { isShown: !world.suggestHidden } })
  on('env.get', () => ({ value: '/h' }))
  on('fs.exists', ($, e) => ({ value: e.path in world.files || (world.gateExists && e.path.endsWith('scripts/review-state.js') && !e.path.includes('.claude')) }))
  on('fs.read', ($, e) => { if (!(e.path in world.files)) throw new Error('ENOENT'); return { value: world.files[e.path] } })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  // Counts any prompt sent: the mod itself must never send one (FR-19).
  on('prompt.submit', ($, e) => { world.submitted++; return { text: e.text } })
  on('classic.UserPromptSubmit', () => ({}))
  on('process.run', ($, e) => {
    const argv = e.argv
    world.runs.push(argv)
    if (argv[0] === 'node') return { value: world.gate }
    if (world.failFingerprint) throw new Error('git unavailable')
    const sub = argv.slice(6)
    if (sub[0] === 'rev-parse') return { value: { exitCode: 0, stdout: world.git.head, stderr: '' } }
    if (sub[0] === 'ls-files' && sub[1] === '-s') return { value: { exitCode: 0, stdout: world.git.index, stderr: '' } }
    if (sub[0] === 'ls-files' && sub[1] === '-v') return { value: { exitCode: 0, stdout: world.git.flags, stderr: '' } }
    if (sub[0] === 'status') return { value: { exitCode: 0, stdout: world.git.status, stderr: '' } }
    if (sub[0] === 'hash-object') return { value: { exitCode: 0, stdout: world.git.hash, stderr: '' } }
    return { value: { exitCode: 2, stdout: '', stderr: 'unexpected' } }
  })
  on('ui.toast', ($, e) => { world.toasts.push(e); return { value: undefined } })
  on('ui.invalidate', () => { if (world.invalidateThrows) throw new Error('injected after-delegation failure'); return { value: undefined } })
  on('turn.abort', () => { (world.order ??= []).push('abort'); if (world.abort === 'reject') throw new Error('turn id does not match'); return { value: undefined } })
  world.forbiddenCalls = 0
  on('model.complete', () => { world.forbiddenCalls++; throw new Error('a model call is never allowed') })
  on('http.fetch', () => { world.forbiddenCalls++; throw new Error('a network call is never allowed') })
  on('tool.call', async ($, e) => { world.core++; if (world.hold) await world.hold; const r = world.coreResult(e); world.afterCore = true; return r })
  on('tool.check', () => ({ decision: world.checkVerdict ?? 'allow' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['other band'] }))
  if (opts.start !== false) await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  return { world, mem, clock }
}

const status = async ($) => (await $.command.run({ command: 'agentctl', args: 'status --details' })).text
const settle = () => new Promise((r) => setTimeout(r, 0))

test('Signal 2: gate reader missing, non-JSON or failing reads unavailable; nothing else changes', async ($, on) => {
  await setup($, on, { gateExists: false })
  expect(await status($)).toMatch(/Review gates: unavailable \(no review-state.js here\)/)
})

test('Signal 2: a gate reader returning non-JSON or exiting non-zero reads unavailable', async ($, on) => {
  const { world } = await setup($, on, { gate: { exitCode: 0, stdout: 'not json', stderr: '' } })
  const nj = await status($)
  expect(nj).toMatch(/Review gates: unavailable \(not JSON\)/)
  expect(nj).toMatch(/Context: 42% — session usage/)
  world.gate = { exitCode: 1, stdout: '', stderr: 'boom' }
  await $.turn.complete({ turnId: 't', answer: '', interrupted: false })
  expect(await status($)).toMatch(/Review gates: unavailable \(check exited 1\)/)
})

test('the gate reader only ever runs check, never note (FR-19, Signal 9)', async ($, on) => {
  const { world } = await setup($, on)
  await $.turn.complete({ turnId: 't', answer: '', interrupted: false })
  const nodeRuns = world.runs.filter((a) => a[0] === 'node')
  expect(nodeRuns.length).toBeGreaterThan(0)
  for (const a of nodeRuns) { expect(a.slice(2)).toEqual(['check', '--format=json']); expect(a).not.toContain('note') }
})

test('usage: windows are read by kind; a missing window is missing, never 0%', async ($, on) => {
  await setup($, on, { usage: { startedAt: 0, context: { window: 1 }, rateLimits: [] } })
  const t = await status($)
  expect(t).toMatch(/5h window: missing/)
  expect(t).toMatch(/Context: missing/)
  expect(t).not.toMatch(/0%/)
})

test('usage: a present window shows its percentage, reset time and source', async ($, on) => {
  await setup($, on)
  expect(await status($)).toMatch(/5h window: 47% \(resets 18:30\) — session usage \(api\)/)
})

test('the band shows our line and keeps another band', async ($, on) => {
  await setup($, on)
  const ui = await $.ui.mount({ plugin: 'agentctl', component: 'AbovePrompt', surface: 'terminal', viewport: { columns: 140, rows: 30 }, props: {} })
  expect(await ui.find({ type: 'Text', text: /agentctl · investigate the quiz service/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
})

test('Signal 3: a passing check then an edit shows the check stale within 30 s; gate state is reported apart', async ($, on) => {
  const { world, clock } = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'u1' })
  await settle()
  let t = await status($)
  expect(t).toMatch(/Execution evidence \(not a review verdict\):\n  npm test: no error reported · current/)
  expect(t).toMatch(/Review gates: code ✅/)
  // An edit after the check moves the tree; within 30 s the panel shows the earlier pass as stale.
  world.git.status = '1 .M N... 100644 100644 100644 h1 h1 a.js\0'
  world.git.hash = 'newbytes\n'
  await clock.advance(30 * 1000)
  t = await status($)
  expect(t).toMatch(/npm test: no error reported · stale \(tree changed since\)/)
  const hand = (await $.command.run({ command: 'agentctl', args: 'handoff' })).text
  expect(hand).toMatch(/## 5\. Not verified\n- npm test — stale — the tree changed since/)
  expect(hand).toMatch(/## 4\. Verified[^#]*Nothing\./)
})

test('Signal 4: a backgrounded check reads started until a terminal result is observed', async ($, on) => {
  await setup($, on, { coreResult: (e) => (e.tool === 'GetTask' ? { result: { taskId: 'bg1', statusMessage: '', status: 'failed', error: { code: 1, message: 'x' } } } : { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } }) })
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'u1' })
  await settle()
  expect(await status($)).toMatch(/npm test: backgrounded · started, completion unobserved/)
  await $.tool.call({ tool: 'GetTask', taskId: 'bg1', tool_use_id: 'u2' })
  await settle()
  const t = await status($)
  expect(t).toMatch(/npm test: error/)
  expect(t).not.toMatch(/Background in flight/)
})

test('a fingerprint read that fails records evidence unavailable and never refuses the call', async ($, on) => {
  const { world } = await setup($, on)
  world.failFingerprint = true
  const before = world.core
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'u1' })
  await settle()
  expect(world.core).toBe(before + 1)
  expect(await status($)).toMatch(/npm test: no error reported · evidence unavailable/)
})

test('a non-check Bash call is recorded as an operation without evidence', async ($, on) => {
  const { world } = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'git status', tool_use_id: 'u1' })
  await settle()
  expect(world.runs.filter((a) => a[0] === 'git').length).toBe(0)
  expect(await status($)).toMatch(/Execution evidence: no declared check has run/)
})

test('Signal 1: task set from the prompt binds it; reopening shows the last hand-over first', async ($, on) => {
  const { mem, world } = await setup($, on, { task: null })
  const set = await $.command.run({ command: 'agentctl', args: 'task set {"goal":"refactor quiz","allow":["edit"],"editRoots":["src"]}', origin: { kind: 'composer' } })
  expect(set.text).toMatch(/bound to this worktree/)
  await $.command.run({ command: 'agentctl', args: 'handoff' })
  await settle()
  const ckpt = Object.keys(mem).find((k) => k.startsWith('checkpoint/'))
  expect(ckpt).toBeDefined()
  // A new session (a different id) on the same worktree: everything comes back from the store.
  world.sessionId = 'S2'
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  const t = await status($)
  expect(t).toMatch(/Task: refactor quiz/)
  expect(t).toMatch(/Last hand-over/)
  // The policy holds again on the new session.
  const r = await $.tool.call({ tool: 'Bash', command: 'kubectl delete pod x' })
  expect(JSON.stringify(r)).toMatch(/production-write/)
})

test('a task set or clear from anything but the prompt is refused', async ($, on) => {
  await setup($, on)
  const r = await $.command.run({ command: 'agentctl', args: 'task set {"goal":"x"}', origin: { kind: 'unclassified' } })
  expect(r.text).toMatch(/only from your own prompt/)
  const r2 = await $.command.run({ command: 'agentctl', args: 'task clear' })
  expect(r2.text).toMatch(/only from your own prompt/)
})

test('a task overlapping a forbidden class is rejected at set', async ($, on) => {
  await setup($, on, { task: null })
  const r = await $.command.run({ command: 'agentctl', args: 'task set {"goal":"x","executors":[{"argv":["git","push"]}]}', origin: { kind: 'composer' } })
  expect(r.text).toMatch(/task rejected/)
})

test('Signal 8: the hand-over answers eight questions with no model, network or process call', async ($, on) => {
  const { world } = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'kubectl delete pod x' })
  await settle()
  const runsBefore = world.runs.length
  const h = (await $.command.run({ command: 'agentctl', args: 'handoff' })).text
  expect(world.runs.length).toBe(runsBefore)
  for (let i = 1; i <= 8; i++) expect(h).toMatch(new RegExp(`## ${i}\\.`))
  expect(h).toMatch(/no model was called/)
  expect(h).toMatch(/## 8\. Still not allowed\n- kubectl delete pod x — production-write/)
  expect(h).toMatch(/only its own judgement/)
  // INV-005: the hook-skip and other-mod limits are disclosed in the hand-over too
  expect(h).toMatch(/host skips this mod's hook/)
  expect(h).toMatch(/another mod can change a verdict/)
})

test('Signal 7: stop saves the hand-over, cancels the held turn and never claims all stopped', async ($, on) => {
  await setup($, on)
  await $.turn.start({ turnId: 'T9', prompt: 'x' })
  const t = (await $.command.run({ command: 'agentctl', args: 'stop' })).text
  expect(t).toMatch(/Hand-over saved before stopping/)
  expect(t).toMatch(/Cancellation requested for turn T9/)
  expect(t).toMatch(/never "all stopped"/)
})

test('a rejected cancellation reads unconfirmed, not ended', async ($, on) => {
  await setup($, on, { abort: 'reject' })
  await $.turn.start({ turnId: 'T9', prompt: 'x' })
  const t = (await $.command.run({ command: 'agentctl', args: 'stop' })).text
  expect(t).toMatch(/Cancellation request failed; turn outcome unconfirmed/)
  expect(t).not.toMatch(/turn ended/i)
})

test('Signal 11: one notice per blocking reason; a cleared and re-raised reason notifies again', async ($, on) => {
  const { world, clock } = await setup($, on)
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'kubectl delete pod x' })
  expect(world.toasts.length).toBe(1)
  // Clearing: the reducer clears policy-denied only by its own rules, so use the pure function.
  const first = decideNotices({ input: { since: 0, severity: 'info' } }, {}, 0)
  expect(first.toSend.length).toBe(1)
  const cleared = decideNotices({}, first.sent, 1000)
  const again = decideNotices({ input: { since: 0, severity: 'info' } }, cleared.sent, 11 * 60 * 1000)
  expect(again.toSend.length).toBe(1)
  const tooSoon = decideNotices({ input: { since: 0, severity: 'info' } }, cleared.sent, 2000)
  expect(tooSoon.toSend.length).toBe(0)
  const rose = decideNotices({ input: { since: 0, severity: 'critical' } }, first.sent, 11 * 60 * 1000)
  expect(rose.toSend.length).toBe(1)
  void clock
})

test('events and policy commands answer from records', async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'python3 x.py' })
  expect((await $.command.run({ command: 'agentctl', args: 'events 5' })).text).toMatch(/delegated · Bash · python3 x.py · delegated to the host/)
  const p = (await $.command.run({ command: 'agentctl', args: 'policy' })).text
  expect(p).toMatch(/Authorized executors: npm test \(check\)/)
  expect(p).toMatch(/not an isolation boundary/)
})

test('regression: /agentctl is registered immediate, so stop runs during a turn', async ($, on) => {
  const { world } = await setup($, on)
  expect(world.registered.some((r) => r.name === 'agentctl' && r.immediate === true)).toBe(true)
})

test('regression: a credential in an executor is rejected; stored policy values are shown redacted; evidence keys are opaque', async ($, on) => {
  const leaky = { ...TASK, executors: [{ argv: ['npm', 'test', '--token', 'demo-secret'], check: true }] }
  const { mem } = await setup($, on, { task: leaky })
  const set = await $.command.run({ command: 'agentctl', args: 'task set {"goal":"x","executors":[{"argv":["npm","test","--token","demo-secret"]}]}', origin: { kind: 'composer' } })
  expect(set.text).toMatch(/credential-like value/)
  const p = (await $.command.run({ command: 'agentctl', args: 'policy' })).text
  expect(p).not.toMatch(/demo-secret/)
  await $.tool.call({ tool: 'Bash', command: 'npm test --token demo-secret', tool_use_id: 'u1' })
  await settle()
  const rec = JSON.stringify(mem['session/S1'])
  expect(rec).not.toMatch(/demo-secret/)
  expect(Object.keys(mem['session/S1'].evidence)[0]).toMatch(/^check-[0-9a-f]{16}$/)
})

test('regression: a subagent turn completing does not clear the held main turn', async ($, on) => {
  await setup($, on)
  await $.turn.start({ turnId: 'MAIN', prompt: 'x' })
  await $.turn.complete({ turnId: 'CHILD', agentId: 'a1', answer: '', interrupted: false })
  const t = (await $.command.run({ command: 'agentctl', args: 'stop' })).text
  expect(t).toMatch(/Cancellation requested for turn MAIN/)
})

test('regression: reopening logs the last hand-over to the transcript before any work', async ($, on) => {
  const { world } = await setup($, on)
  await $.command.run({ command: 'agentctl', args: 'handoff' })
  await settle()
  world.logs.length = 0
  const coreBefore = world.core
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  expect(world.core).toBe(coreBefore)
  expect(world.logs[0]).toMatch(/^last hand-over for task T1/)
  expect(world.logs.join('\n')).toMatch(/## 1\. Goal/)
  const ui = await $.ui.mount({ plugin: 'agentctl', component: 'AbovePrompt', surface: 'terminal', viewport: { columns: 200, rows: 30 }, props: {} })
  expect(await ui.find({ type: 'Text', text: /last hand-over/ })).toBeDefined()
})

test('regression: allowed edits are recorded and counted in the hand-over', async ($, on) => {
  await setup($, on, { task: { ...TASK, allow: ['edit'], editRoots: ['src'] } })
  await $.tool.call({ tool: 'Edit', file_path: '/w/repo/src/a.ts', old_string: 'a', new_string: 'b', tool_use_id: 'e1' })
  await settle()
  const h = (await $.command.run({ command: 'agentctl', args: 'handoff' })).text
  expect(h).toMatch(/Edits observed this session: 1/)
})

test('regression: descriptive task fields are stored redacted and unknown fields are dropped', async ($, on) => {
  const { mem } = await setup($, on, { task: null })
  const r = await $.command.run({ command: 'agentctl', args: 'task set {"goal":"investigate API_TOKEN=SYNTHETIC_TOKEN","acceptance":["curl https://user:SYNTHETIC_TOKEN@example.invalid"],"extra":"SYNTHETIC_TOKEN"}', origin: { kind: 'composer' } })
  expect(r.text).toMatch(/bound to this worktree/)
  await settle()
  const stored = JSON.stringify(Object.entries(mem).filter(([k]) => k.startsWith('task/')))
  expect(stored).not.toMatch(/SYNTHETIC_TOKEN/)
  expect(stored).not.toMatch(/extra/)
})

test('regression: reopening logs the whole checkpoint; bare status only points at it, /agentctl last prints it', async ($, on) => {
  const { world, mem } = await setup($, on)
  const long = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n')
  mem['checkpoint/T1/old'] = { savedAt: 1, taskId: 'T1', markdown: long }
  world.logs.length = 0
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  expect(world.logs[0]).toMatch(/\/agentctl last shows it again/)
  expect(world.logs).toContain('line 59')
  const bare = await status($)
  expect(bare).not.toMatch(/line 59/)
  expect(bare).toMatch(/Last hand-over saved .* — \/agentctl last/)
  expect((await $.command.run({ command: 'agentctl', args: 'last' })).text).toMatch(/line 59/)
})

test('regression: a credential-bearing task id is refused and nothing is stored', async ($, on) => {
  const { mem } = await setup($, on, { task: null })
  const r = await $.command.run({ command: 'agentctl', args: 'task set {"id":"API_TOKEN=SYNTHETIC_TOKEN","goal":"investigate"}', origin: { kind: 'composer' } })
  expect(r.text).toMatch(/task rejected/)
  expect(r.text).not.toMatch(/SYNTHETIC_TOKEN/)
  await settle()
  expect(JSON.stringify(Object.keys(mem))).not.toMatch(/SYNTHETIC_TOKEN/)
})

test('live finding: a task notification closes the backgrounded check (no GetTask needed)', async ($, on) => {
  await setup($, on, { coreResult: () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg7' } }) })
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'u1' })
  await settle()
  expect(await status($)).toMatch(/npm test: backgrounded · started, completion unobserved/)
  await $.prompt.submit({ text: '<task-notification>\n<task-id>bg7</task-id>\n<status>failed</status>\n<summary>exit code 1</summary>\n</task-notification>', origin: { kind: 'task-notification' }, wait: false })
  await settle()
  const t = await status($)
  expect(t).toMatch(/npm test: error/)
  expect(t).not.toMatch(/Background in flight/)
})

test('a prompt that merely looks like a notification but is typed by the user closes nothing', async ($, on) => {
  await setup($, on, { coreResult: () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg8' } }) })
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'u1' })
  await settle()
  await $.prompt.submit({ text: '<task-id>bg8</task-id><status>completed</status>', origin: { kind: 'composer' }, wait: false })
  await settle()
  expect(await status($)).toMatch(/started, completion unobserved/)
})

test('live finding: ToolSearch passes while a task is bound (it only loads schemas)', async ($, on) => {
  const { world } = await setup($, on)
  const before = world.core
  await $.tool.call({ tool: 'ToolSearch', query: 'select:GetTask', max_results: 1 })
  expect(world.core).toBe(before + 1)
})

test('live finding: without any session.start (a hot reload) the first use reads the gate and starts the tick', async ($, on) => {
  const { world, clock } = await setup($, on, { start: false })
  expect(await status($)).toMatch(/Review gates: code ✅/)
  const gateReads = () => world.runs.filter((a) => a[0] === 'node').length
  const first = gateReads()
  expect(first).toBe(1)
  await clock.advance(31 * 1000)
  expect(gateReads()).toBe(first + 1)
})

test('regression: a render-first build is reused by session.start for the same session; turn state survives', async ($, on) => {
  const { world } = await setup($, on, { start: false })
  await Promise.all([
    $.ui.mount({ plugin: 'agentctl', component: 'AbovePrompt', surface: 'terminal', viewport: { columns: 140, rows: 30 }, props: {} }),
    $.turn.start({ turnId: 'T1', prompt: 'x' }),
  ])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  expect(world.runs.filter((a) => a[0] === 'node').length).toBe(1)
  const t = (await $.command.run({ command: 'agentctl', args: 'stop' })).text
  expect(t).toMatch(/Cancellation requested for turn T1/)
})

test('live finding: session.start and the first band render arriving together build one context', async ($, on) => {
  await setup($, on)
  await Promise.all([
    $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' }),
    $.ui.mount({ plugin: 'agentctl', component: 'AbovePrompt', surface: 'terminal', viewport: { columns: 140, rows: 30 }, props: {} }),
  ])
  const ui = await $.ui.mount({ plugin: 'agentctl', component: 'AbovePrompt', surface: 'terminal', viewport: { columns: 140, rows: 30 }, props: {} })
  expect(await ui.find({ type: 'Text', text: /gates missing/ })).toBeUndefined()
  expect(await status($)).toMatch(/Review gates: code ✅/)
})

test('the hand-over is capped at CAPS.handoff', async ($, on) => {
  await setup($, on)
  for (let i = 0; i < 60; i++) await $.tool.call({ tool: 'Bash', command: `python3 x${i}.py ${'a'.repeat(400)}` })
  const h = (await $.command.run({ command: 'agentctl', args: 'handoff' })).text
  expect(h.length).toBeLessThanOrEqual(16 * 1024)
})

test('T5: a failing gate reader leaves the other fields unchanged', async ($, on) => {
  await setup($, on, { gate: { exitCode: 1, stdout: '', stderr: 'x' } })
  const t = await status($)
  expect(t).toMatch(/Review gates: unavailable \(check exited 1\)/)
  expect(t).toMatch(/Context: 42% — session usage/)
  expect(t).toMatch(/5h window: 47% \(resets 18:30\)/)
  expect(t).toMatch(/Task: investigate the quiz service/)
})

test('T5: a non-interactive session with no surface answers /agentctl from records only', async ($, on) => {
  const { world } = await setup($, on, { start: false })
  await $.session.start({ surface: null, isInteractive: false, cwd: '/w/repo' })
  const t = await status($)
  expect(t).toMatch(/Task: investigate the quiz service/)
  expect(world.runs.filter((a) => a[0] !== 'node').length).toBe(0)
  expect(world.forbiddenCalls).toBe(0)
})

test('T3: an awaited failure after delegation replays the settled result (policy hook, non-Bash)', async ($, on) => {
  const { world } = await setup($, on, { clock: 'custom' })
  world.clockThrowsAfterCore = true
  world.afterCore = false
  const before = world.core
  const r = await $.tool.call({ tool: 'Read', file_path: '/w/repo/a.txt', tool_use_id: 'r1' })
  expect(world.core).toBe(before + 1)
  expect(JSON.stringify(r)).toMatch(/"stdout":"ok"/)
  expect(JSON.stringify(r)).not.toMatch(/agentctl refused/)
})

test('T3: an awaited failure after delegation in the evidence hook replays the result (Bash)', async ($, on) => {
  const { world } = await setup($, on, { clock: 'custom', coreResult: (e) => ({ result: `ran: ${e.command}` }) })
  world.clockThrowsAfterCore = true
  world.afterCore = false
  const before = world.core
  const r = await $.tool.call({ tool: 'Bash', command: 'git status', tool_use_id: 'b1' })
  expect(world.core).toBe(before + 1)
  expect(JSON.stringify(r)).toMatch(/ran: git status/)
})

test('T3: a tool.check hook that fails refuses through its own catch', async ($, on) => {
  await setup($, on, { task: { ...TASK, forbid: 42 }, start: true })
  const r = await $.tool.check({ tool: 'Bash', input: { command: 'git status' } })
  expect(r.decision).toBe('deny')
})

test('T6: the hand-over lists still-running operations and background jobs in section 6', async ($, on) => {
  const { world } = await setup($, on, { coreResult: () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg9' } }) })
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'u1' })
  await settle()
  const h = (await $.command.run({ command: 'agentctl', args: 'handoff' })).text
  expect(h).toMatch(/## 6\. Still running or unknown\n[^#]*npm test \(Bash, backgrounded\)[^#]*background bg9 — started/)
  void world
})

test('T7: stop during a running tool lists that operation, and a rejected abort still saved the hand-over', async ($, on) => {
  const { world, mem } = await setup($, on, { abort: 'reject' })
  let release
  world.hold = new Promise((r) => { release = r })
  await $.turn.start({ turnId: 'T9', prompt: 'x' })
  const running = $.tool.call({ tool: 'Bash', command: 'git log --oneline -n 1', tool_use_id: 'u7' })
  await settle()
  const t = (await $.command.run({ command: 'agentctl', args: 'stop' })).text
  expect(t).toMatch(/- git log --oneline -n 1 \(Bash\) — running, u7/)
  expect(t).toMatch(/Cancellation request failed; turn outcome unconfirmed/)
  await settle()
  expect(Object.keys(mem).some((k) => k.startsWith('checkpoint/%2Fw%2Frepo:T1/'))).toBe(true)
  release()
  await running
})

test('T7: with no task bound, stop says the hand-over was not saved', async ($, on) => {
  await setup($, on, { task: null })
  const t = (await $.command.run({ command: 'agentctl', args: 'stop' })).text
  expect(t).toMatch(/No task bound: the hand-over was not saved/)
  expect(t).not.toMatch(/Hand-over saved/)
})

test('regression: stop waits for the checkpoint write before cancelling the turn', async ($, on) => {
  const { world } = await setup($, on)
  world.storeDelay = 30
  world.order = []
  await $.turn.start({ turnId: 'T9', prompt: 'x' })
  world.order = []
  const t = (await $.command.run({ command: 'agentctl', args: 'stop' })).text
  expect(t).toMatch(/Hand-over saved before stopping/)
  const ci = world.order.indexOf('set:checkpoint')
  expect(ci).toBeGreaterThanOrEqual(0)
  expect(ci).toBeLessThan(world.order.indexOf('abort'))
})

test('regression: a failed checkpoint write is never reported as saved', async ($, on) => {
  const { world } = await setup($, on)
  world.storeFail = true
  await $.turn.start({ turnId: 'T9', prompt: 'x' })
  const t = (await $.command.run({ command: 'agentctl', args: 'stop' })).text
  expect(t).toMatch(/could not be saved \(store error\)/)
  expect(t).not.toMatch(/Hand-over saved/)
})

// Each gate-reader failure changes the Gates line only (Signal 2).
function expectOtherFieldsIntact(t) {
  expect(t).toMatch(/Task: investigate the quiz service \(T1\)/)
  expect(t).toMatch(/Context: 42% — session usage/)
  expect(t).toMatch(/5h window: 47% \(resets 18:30\) — session usage \(api\)/)
}

test('Signal 2: every gate-reader failure leaves Task, Context and the 5 h window intact', async ($, on) => {
  const { world } = await setup($, on, { gateExists: false })
  let t = await status($)
  expect(t).toMatch(/Review gates: unavailable \(no review-state.js here\)/)
  expectOtherFieldsIntact(t)
  world.gateExists = true
  world.gate = { exitCode: 0, stdout: 'not json', stderr: '' }
  await $.turn.complete({ turnId: 't', answer: '', interrupted: false })
  t = await status($)
  expect(t).toMatch(/Review gates: unavailable \(not JSON\)/)
  expectOtherFieldsIntact(t)
  world.gate = { exitCode: 1, stdout: '', stderr: 'boom' }
  await $.turn.complete({ turnId: 't', answer: '', interrupted: false })
  t = await status($)
  expect(t).toMatch(/Review gates: unavailable \(check exited 1\)/)
  expectOtherFieldsIntact(t)
})

const NEEDS = { ...TASK, needsUser: [['npm', 'publish']] }

async function checkUnderMode($, on, mode, { surface = 'terminal', interactive = true, verdict = 'allow' } = {}) {
  const { world } = await setup($, on, { task: NEEDS, start: false })
  world.checkVerdict = verdict
  await $.session.start({ surface, isInteractive: interactive, cwd: '/w/repo' })
  if (mode !== undefined) await $.classic.UserPromptSubmit({ prompt: 'go', permission_mode: mode })
  return (await $.tool.check({ tool: 'Bash', input: { command: 'npm publish' } })).decision
}

test('T8/V3: needs-user asks on the interactive terminal in the verified modes', async ($, on) => {
  expect(await checkUnderMode($, on, 'default')).toBe('ask')
})
test('T8/V3: needs-user asks under acceptEdits', async ($, on) => {
  expect(await checkUnderMode($, on, 'acceptEdits')).toBe('ask')
})
test('T8/V3: needs-user asks under auto', async ($, on) => {
  expect(await checkUnderMode($, on, 'auto')).toBe('ask')
})
test('T8/V3: needs-user is refused under bypassPermissions (unverified)', async ($, on) => {
  expect(await checkUnderMode($, on, 'bypassPermissions')).toBe('deny')
})
test('T8/V3: needs-user is refused under plan (unverified)', async ($, on) => {
  expect(await checkUnderMode($, on, 'plan')).toBe('deny')
})
test('T8/V3: needs-user is refused under dontAsk (recorded refusing the ask)', async ($, on) => {
  expect(await checkUnderMode($, on, 'dontAsk')).toBe('deny')
})
test('T8/V3: needs-user is refused while the mode is unknown', async ($, on) => {
  expect(await checkUnderMode($, on, undefined)).toBe('deny')
})
for (const surface of ['desktop', 'vscode', 'mobile']) {
  test(`T8/V3: needs-user is refused on an unverified surface (${surface})`, async ($, on) => {
    expect(await checkUnderMode($, on, 'default', { surface })).toBe('deny')
  })
}
test('T8/V3: needs-user is refused on a non-interactive terminal session', async ($, on) => {
  expect(await checkUnderMode($, on, 'default', { interactive: false })).toBe('deny')
})
test('T8/V3: needs-user is refused in a non-interactive session even in default mode', async ($, on) => {
  expect(await checkUnderMode($, on, 'default', { surface: null, interactive: false })).toBe('deny')
})
test('T8/V3: a downstream deny still wins over a verified ask', async ($, on) => {
  expect(await checkUnderMode($, on, 'default', { verdict: 'deny' })).toBe('deny')
})

const OTHER = { ...TASK, id: 'shared', worktree: '/w/other', executors: [{ argv: ['npm', 'test'], check: true }] }
const scoped = (wt, id) => 'task/' + encodeURIComponent(wt) + ':' + id
const setTask = ($, json) => $.command.run({ command: 'agentctl', args: `task set ${json}`, origin: { kind: 'composer' } })

test('regression: two worktrees using one task id write separate records', async ($, on) => {
  const { mem } = await setup($, on)
  mem[scoped('/w/other', 'shared')] = OTHER
  const r = (await setTask($, '{"id":"shared","goal":"x","forbid":["npm test"]}')).text
  expect(r).toMatch(/Task shared bound to this worktree/)
  expect(mem[KEY]).toBe('shared')
  expect(mem[scoped('/w/other', 'shared')]).toEqual(OTHER)
  expect(mem[scoped('/w/repo', 'shared')].forbid).toEqual(['npm test'])
})

test('regression: a binding whose record is missing or foreign refuses instead of observing', async ($, on) => {
  const { world } = await setup($, on, { task: OTHER })
  world.checkVerdict = 'allow'
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'npm test' } })).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'Read', input: { file_path: '/w/other/secret.txt' } })).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'cat /etc/hosts' } })).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'Read', input: { file_path: '/w/repo/a.js' } })).decision).toBe('allow')
  expect((await $.command.run({ command: 'agentctl', args: 'policy' })).text).toMatch(/record is missing/)
})

test('regression: task set reports a failed record write and leaves the old binding', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.failSetPrefix = 'task/'
  const r = (await setTask($, '{"goal":"new"}')).text
  expect(r).toMatch(/could not be saved \(store error\)/)
  expect(r).not.toMatch(/bound to this worktree/)
  expect(mem[KEY]).toBe('T1')
})

test('regression: task set reports a failed binding write and leaves the old binding', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.failSetPrefix = 'binding/'
  const r = (await setTask($, '{"goal":"new"}')).text
  expect(r).toMatch(/could not be bound \(store error\)/)
  expect(mem[KEY]).toBe('T1')
})

test('regression: re-setting the bound id needs no binding write, so a binding failure cannot misreport it', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.checkVerdict = 'allow'
  world.failSetPrefix = 'binding/'
  const r = (await setTask($, '{"id":"T1","goal":"x","forbid":["npm test"]}')).text
  expect(r).toMatch(/Task T1 bound to this worktree/)
  expect(mem[KEY]).toBe('T1')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'npm test' } })).decision).toBe('deny')
})

test('regression: task clear reports a failed delete and the old policy still applies', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.failDelete = true
  const r = (await $.command.run({ command: 'agentctl', args: 'task clear', origin: { kind: 'composer' } })).text
  expect(r).toMatch(/could not be cleared/)
  expect(r).not.toMatch(/observes only/)
  expect(mem[KEY]).toBe('T1')
})

test('regression: a new scoped task never shows another worktree\'s legacy hand-over', async ($, on) => {
  const { mem } = await setup($, on, { task: null, start: false })
  mem['task/shared'] = { ...OTHER }
  mem['checkpoint/shared/legacyA'] = { savedAt: 1, taskId: 'shared', markdown: '# Hand-over — worktree A only' }
  mem[KEY] = 'shared'
  mem[scoped('/w/repo', 'shared')] = { ...TASK, id: 'shared', goal: 'B task' }
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  expect(await status($)).not.toMatch(/worktree A only/)
})

test('regression: an oversized hand-over keeps all eight headings and the limits disclosure', () => {
  const ops = {}
  for (let i = 0; i < 150; i++) ops['u' + i] = { tool: 'Bash', requested: 'npm run job-' + i + ' ' + 'x'.repeat(190), outcome: 'unresolved', startedAt: i }
  const h = handoff({ task: { id: 'T', goal: 'g', worktree: '/w', executors: [], forbid: [] }, state: { ops, background: {}, interventions: {} }, evidence: {}, fingerprint: null, decisions: [], now: 0, sessionId: 'S' })
  expect(h.length).toBeLessThanOrEqual(CAPS.handoff)
  for (let i = 1; i <= 8; i++) expect(h).toMatch(new RegExp(`## ${i}\\.`))
  expect(h).toMatch(/more omitted \(hand-over size cap\)/)
  expect(h).toMatch(/host skips this mod's hook/)
  expect(h).toMatch(/only its own judgement/)
})

// ── Proposals: Claude drafts, the person accepts (2026-10-04) ──────────────────────────────────────
const PROPOSAL = '/h/.claude/agentctl/proposals/' + encodeURIComponent('/w/repo') + '.json'
const draft = (over = {}) => JSON.stringify({ base: 'T1', goal: 'fix the quiz timer', allow: ['edit'], editRoots: ['src'], executors: [{ argv: ['npm', 'test'], check: true }], ...over })
const turnEnd = async ($, id = 'u1') => { await $.turn.start({ turnId: id }); await $.turn.complete({ turnId: id }) }

test('a proposal is previewed at turn end and bound only by an accept from the composer', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.files[PROPOSAL] = draft()
  await turnEnd($)
  expect(world.logs.join('\n')).toMatch(/Proposed task [0-9a-f]{24} — fix the quiz timer/)
  expect(world.logs.join('\n')).toMatch(/Checks and executors: npm test \(check\)/)
  const shown = (await $.command.run({ command: 'agentctl', args: 'proposal' })).text
  const digest = shown.match(/Proposed task ([0-9a-f]{24})/)[1]
  expect((await $.command.run({ command: 'agentctl', args: 'accept' })).text).toMatch(/only from your own prompt/)
  expect(mem[KEY]).toBe('T1')
  const r = (await $.command.run({ command: 'agentctl', args: `accept ${digest.slice(0, 8)}`, origin: { kind: 'composer' } })).text
  expect(r).toMatch(/Scope bound\. Next: ask Claude to start the work\./)
  await settle()
  const bound = mem['task/' + encodeURIComponent('/w/repo') + ':' + mem[KEY]]
  expect(bound).toEqual(expect.objectContaining({ goal: 'fix the quiz timer', editRoots: ['src'], worktree: '/w/repo', policyVersion: 2 }))
  expect((await $.command.run({ command: 'agentctl', args: 'proposal' })).text).toMatch(/No proposal is waiting/)
  // The same file is not offered again once handled.
  world.logs.length = 0
  await turnEnd($, 'u2')
  expect(world.logs.join('\n')).not.toMatch(/Proposed task/)
})

test('a file swapped after the preview never changes what accept binds; a new preview needs its own digest', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.files[PROPOSAL] = draft()
  await turnEnd($)
  const first = (await $.command.run({ command: 'agentctl', args: 'proposal' })).text.match(/Proposed task ([0-9a-f]{24})/)[1]
  // Swapped without a new preview: accept binds the retained object, not the file.
  world.files[PROPOSAL] = draft({ editRoots: ['.'], goal: 'everything' })
  await $.command.run({ command: 'agentctl', args: 'accept', origin: { kind: 'composer' } })
  await settle()
  expect(mem['task/' + encodeURIComponent('/w/repo') + ':' + mem[KEY]].editRoots).toEqual(['src'])
  // A later change is previewed again, against the task now bound, with a different digest.
  world.files[PROPOSAL] = draft({ base: mem[KEY], editRoots: ['.'] })
  await turnEnd($, 'u2')
  const second = (await $.command.run({ command: 'agentctl', args: 'proposal' })).text.match(/Proposed task ([0-9a-f]{24})/)[1]
  expect(second).not.toBe(first)
  expect((await $.command.run({ command: 'agentctl', args: `accept ${first.slice(0, 8)}`, origin: { kind: 'composer' } })).text).toMatch(/does not match/)
})

test('a stale proposal is refused at read and at accept; another worktree and built-in overrides are refused', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.files[PROPOSAL] = draft({ base: 'T0' })
  await turnEnd($)
  expect(world.logs.join('\n')).toMatch(/proposal not shown — stale/)
  world.files[PROPOSAL] = draft({ worktree: '/elsewhere' })
  await turnEnd($, 'u2')
  expect(world.logs.join('\n')).toMatch(/names another worktree/)
  world.files[PROPOSAL] = draft({ executors: [{ argv: ['git', 'push'] }] })
  await turnEnd($, 'u3')
  expect(world.logs.join('\n')).toMatch(/overlaps forbidden class \(remote-git-write\)/)
  world.files[PROPOSAL] = draft()
  await turnEnd($, 'u4')
  await $.command.run({ command: 'agentctl', args: 'task clear', origin: { kind: 'composer' } })
  const r = (await $.command.run({ command: 'agentctl', args: 'accept', origin: { kind: 'composer' } })).text
  expect(r).toMatch(/stale/)
  expect(mem[KEY]).toBeUndefined()
})

test('discard drops the waiting proposal and leaves the bound task; the band names a waiting proposal', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.files[PROPOSAL] = draft()
  await turnEnd($)
  expect(await status($)).toMatch(/Next: review \/agentctl proposal, then \/agentctl accept [0-9a-f]{8}/)
  expect((await $.command.run({ command: 'agentctl', args: 'discard' })).text).toMatch(/Proposal discarded/)
  expect(mem[KEY]).toBe('T1')
  expect((await $.command.run({ command: 'agentctl', args: 'accept', origin: { kind: 'composer' } })).text).toMatch(/No proposal is waiting\. To draft one: \/agentctl <what you are doing>/)
})

test('no HOME or no proposal file is no proposal, never an error', async ($, on) => {
  const { world } = await setup($, on)
  await turnEnd($)
  expect(world.logs.join('\n')).not.toMatch(/proposal/)
})

test('regression: a task set from the prompt cannot re-point the worktree', async ($, on) => {
  const { mem } = await setup($, on)
  const r = (await $.command.run({ command: 'agentctl', args: 'task set {"goal":"x","worktree":"/elsewhere"}', origin: { kind: 'composer' } })).text
  expect(r).toMatch(/names another worktree/)
  expect(mem[KEY]).toBe('T1')
})

test('regression: evidence from another task is never shown as this task\'s', async ($, on) => {
  const { mem } = await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'c1' })
  await settle()
  expect(await status($)).toMatch(/npm test: no error reported/)
  await $.command.run({ command: 'agentctl', args: 'task set {"goal":"other","executors":[{"argv":["npm","test"],"check":true}]}', origin: { kind: 'composer' } })
  expect(await status($)).toMatch(/Execution evidence: no declared check has run/)
  expect(Object.keys(mem['session/S1'].evidence).length).toBe(1)
})

test('regression: the hand-over says when the tree was last read', async ($, on) => {
  await setup($, on)
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'c1' })
  await settle()
  expect((await $.command.run({ command: 'agentctl', args: 'handoff' })).text).toMatch(/read as of \d{4}-\d\d-\d\dT/)
})

test('regression: a same-id task set after the preview makes the proposal stale', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.files[PROPOSAL] = draft()
  await turnEnd($)
  await $.command.run({ command: 'agentctl', args: 'task set {"id":"T1","goal":"changed","forbid":["npm test"]}', origin: { kind: 'composer' } })
  const r = (await $.command.run({ command: 'agentctl', args: 'accept', origin: { kind: 'composer' } })).text
  expect(r).toMatch(/stale/)
  expect(mem[KEY]).toBe('T1')
})

test('regression: re-setting a task id raises its policy version, so the earlier evidence is not shown', async ($, on) => {
  const { mem } = await setup($, on, { task: null })
  const scoped = 'task/' + encodeURIComponent('/w/repo') + ':T1'
  await $.command.run({ command: 'agentctl', args: 'task set {"id":"T1","goal":"a","executors":[{"argv":["npm","test"],"check":true}]}', origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'c1' })
  await settle()
  expect(await status($)).toMatch(/npm test: no error reported/)
  await $.command.run({ command: 'agentctl', args: 'task set {"id":"T1","goal":"b","executors":[{"argv":["npm","test"],"check":true}]}', origin: { kind: 'composer' } })
  await settle()
  expect(mem[scoped].policyVersion).toBe(2)
  expect(await status($)).toMatch(/Execution evidence: no declared check has run/)
})

test('regression: a partial reading on either side of a check is never verified', async ($, on) => {
  const { world } = await setup($, on)
  // An assume-unchanged entry: the value is unchanged but the reading is partial.
  world.git.flags = 'h a.js\0'
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'c1' })
  await settle()
  const h = (await $.command.run({ command: 'agentctl', args: 'handoff' })).text
  expect(h.split('## 5.')[0]).not.toMatch(/npm test — no error reported/)
  expect(h).toMatch(/npm test — partial coverage/)
})

test('regression: a malformed proposal is rejected and the session still starts', async ($, on) => {
  const { world } = await setup($, on, { start: false })
  world.files[PROPOSAL] = JSON.stringify({ base: 'T1', goal: 'x', executors: [null] })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  expect(world.registered.some((r) => r.name === 'agentctl')).toBe(true)
  expect(world.logs.join('\n')).toMatch(/proposal not shown — each executor needs a non-empty argv array/)
})

test('live finding: an accepted proposal file is not offered again in a later session', async ($, on) => {
  const { world } = await setup($, on, { task: null })
  world.files[PROPOSAL] = draft({ base: null })
  await turnEnd($)
  await $.command.run({ command: 'agentctl', args: 'accept', origin: { kind: 'composer' } })
  await settle()
  // A new session: same file, now drafted against "no task" while a task is bound.
  world.logs.length = 0
  world.sessionId = 'S2'
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/w/repo' })
  expect(world.logs.join('\n')).not.toMatch(/proposal not shown|Proposed task/)
  // A changed file is still read.
  world.files[PROPOSAL] = draft({ base: null, goal: 'another' })
  await turnEnd($, 'u9')
  expect(world.logs.join('\n')).toMatch(/proposal not shown — stale/)
})

test('live finding: a built-in refusal says no task can lift it, and transcript lines carry no doubled prefix', async ($, on) => {
  const { world } = await setup($, on, { task: { ...TASK, forbid: ['terraform apply'] } })
  const r = JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'git push origin main' }))
  expect(r).toMatch(/a built-in class no task can lift/)
  expect(r).not.toMatch(/task's scope/)
  const t = JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'terraform apply' }))
  expect(t).toMatch(/task's scope is shown by \/agentctl policy/)
  expect(world.logs.join('\n')).not.toMatch(/^agentctl:/m)
})

test('adversarial finding: a delegated call with no task bound is still listed by /agentctl events', async ($, on) => {
  await setup($, on, { task: null })
  await $.tool.call({ tool: 'Bash', command: 'bash push.sh' })
  expect((await $.command.run({ command: 'agentctl', args: 'events 5' })).text).toMatch(/delegated · Bash · bash push.sh/)
})

test('adversarial finding: the proposal cap counts UTF-8 bytes, not characters', async ($, on) => {
  const { world } = await setup($, on)
  world.files[PROPOSAL] = draft({ acceptance: Array(60).fill('界'.repeat(100)) })
  await turnEnd($)
  expect(world.logs.join('\n')).toMatch(/proposal not shown — the proposal is over 16384 bytes/)
})

// ── First run (0.3.0): the user's six attempts on 0.2.2, replayed ───────────────────────────────────
function promptBox(on, world, { text = '', fill = true } = {}) {
  world.box = text
  world.fillOk = fill
}
const run = async ($, args, composer = true) => (await $.command.run({ command: 'agentctl', args, ...(composer ? { origin: { kind: 'composer' } } : {}) })).text

test('first run: a sentence after /agentctl fills an empty box with a drafting request and binds nothing', async ($, on) => {
  const { world, mem } = await setup($, on, { task: null })
  promptBox(on, world)
  const r = await run($, '測試一下這個新功能')
  expect(r).toMatch(/已把請 Claude 起草範圍的請求放進輸入框——按 Enter 送出。目前尚未綁定任何範圍。/)
  expect(world.filled.length).toBe(1)
  const req = world.filled[0]
  expect(req).toMatch(/請為這件事起草 agentctl 任務範圍：「測試一下這個新功能」/)
  expect(req).toMatch(/\/bin\/propose\.mjs' --worktree '\/w\/repo' --help/)
  expect(req).toMatch(/base 為 null/)
  expect(world.submitted).toBe(0)
  expect(mem[KEY]).toBeUndefined()
  // The language follows the goal for the rest of the session.
  expect(await run($, '')).toMatch(/^下一步：描述工作/)
})

test('first run: text already in the box is never overwritten, and another origin gets no fill', async ($, on) => {
  const { world } = await setup($, on, { task: null })
  promptBox(on, world, { text: 'half-typed' })
  const r = await run($, 'add a login test')
  expect(world.filled.length).toBe(0)
  expect(world.box).toBe('half-typed')
  expect(r).toMatch(/^Send this to Claude to have it draft the scope \(nothing is bound yet\):\n\nDraft an agentctl task scope for: "add a login test"/)
})

test('review finding: another origin gets the request to copy, with no fill, no send, no binding and no language change', async ($, on) => {
  const { world, mem } = await setup($, on, { task: null })
  const r = await run($, '加一個登入測試', false)
  expect(r).toMatch(/^Send this to Claude to have it draft the scope \(nothing is bound yet\):/)
  expect(r).toMatch(/--worktree '\/w\/repo' --stdin/)
  expect(r).toContain('加一個登入測試')
  expect(world.filled.length).toBe(0)
  expect(world.submitted).toBe(0)
  expect(mem[KEY]).toBeUndefined()
  expect(await run($, 'help')).toMatch(/^agentctl keeps Claude inside a scope you confirm/)
})

test('review finding: every prompt-box failure keeps the whole request to copy and sends nothing', async ($, on) => {
  const { world } = await setup($, on, { task: null })
  for (const fault of ['readThrows', 'fillThrows']) {
    world.readThrows = world.fillThrows = false
    world[fault] = true
    const r = await run($, 'fix the timer')
    expect([fault, /Send this to Claude[\s\S]*Draft an agentctl task scope for: "fix the timer"[\s\S]*Write the proposal only/.test(r)]).toEqual([fault, true])
  }
  world.readThrows = world.fillThrows = false
  world.noBox = true
  expect(await run($, 'fix the timer')).toMatch(/Send this to Claude[\s\S]*"fix the timer"/)
  expect(world.filled.length).toBe(0)
  expect(world.submitted).toBe(0)
})

test('first run: a box that cannot be filled falls back to the request to copy', async ($, on) => {
  const { world } = await setup($, on, { task: null })
  promptBox(on, world, { fill: false })
  expect(await run($, 'fix the timer')).toMatch(/Send this to Claude[\s\S]*Draft an agentctl task scope for: "fix the timer"/)
})

test('first run: the other five attempts each end in a next step, never the usage grammar', async ($, on) => {
  const { world } = await setup($, on, { task: null })
  promptBox(on, world)
  // `/agentctl task <sentence>` and `/agentctl task set <sentence>` are goals.
  await run($, 'task 測試一下這個新功能')
  world.box = '' // the person sent the first request
  await run($, 'task set 測試一下這個新功能')
  world.box = ''
  expect(world.filled.length).toBe(2)
  expect(world.filled[1]).toMatch(/「測試一下這個新功能」/)
  const bare = await run($, '')
  expect(bare).toMatch(/^下一步：描述工作——\/agentctl <你要做的事>。內建規則（直接 git push、production 寫入）現在就會擋。/)
  expect(bare).not.toMatch(/observing only|Observation:|agentctl: agentctl/)
  expect(await run($, 'proposal set 測試一下這個新功能')).toMatch(/「\/agentctl proposal」不接受這些參數。它只顯示等待中的草稿/)
  expect(await run($, 'last')).toMatch(/目前沒有綁定任務，所以還沒有交接紀錄/)
  for (const a of ['', 'help', 'last', 'proposal']) expect(await run($, a)).not.toMatch(/^agentctl:/m)
})

test('first run: typos are corrected without a model turn, extra arguments are refused', async ($, on) => {
  const { world } = await setup($, on)
  promptBox(on, world)
  expect(await run($, 'accepet ab12cd34')).toMatch(/Did you mean "\/agentctl accept"\?/)
  expect(await run($, 'stauts')).toMatch(/Did you mean "\/agentctl status"\?/)
  expect(await run($, 'accept ab12cd34 extra')).toMatch(/"\/agentctl accept" takes no such arguments/)
  expect(await run($, 'events many')).toMatch(/"\/agentctl events" takes no such arguments/)
  expect(world.filled.length).toBe(0)
  // A goal that merely starts with an English word stays a goal.
  await run($, 'test the login flow')
  expect(world.filled.length).toBe(1)
})

test('first run: help teaches three verbs, help advanced the rest', async ($, on) => {
  await setup($, on)
  const h = await run($, 'help')
  expect(h).toMatch(/\/agentctl <what you are doing> — Claude drafts a scope \(binds nothing\)/)
  expect(h).toMatch(/\/agentctl accept <digest> — you confirm it \(starts no work\)/)
  expect(h).not.toMatch(/task set/)
  expect(await run($, 'help advanced')).toMatch(/task show \| set <json> \| clear/)
})

test('first run: the preview offers the accept line as a suggestion, and accepting says work has not started', async ($, on) => {
  const { world, mem } = await setup($, on)
  promptBox(on, world)
  world.files[PROPOSAL] = draft()
  await turnEnd($)
  expect(world.logs.join('\n')).toMatch(/Accept this scope: \/agentctl accept [0-9a-f]{8} — it binds the scope only; it does not start any work/)
  expect(world.suggested[0]).toMatch(/^\/agentctl accept [0-9a-f]{8}$/)
  const r = await run($, world.suggested[0].replace('/agentctl ', ''))
  expect(r).toMatch(/^Scope bound\. Next: ask Claude to start the work\.\nTask T\d+: fix the quiz timer/)
  expect(mem[KEY]).not.toBe('T1')
  expect(world.submitted).toBe(0)
})

test('first run: under a bound task the request names it as the base, and the reply says the task stays in force', async ($, on) => {
  const { world } = await setup($, on)
  promptBox(on, world)
  const r = await run($, 'add a retry to the quiz fetch')
  expect(world.filled[0]).toMatch(/base "T1"/)
  expect(r).toMatch(/The current task stays in force until you accept the new scope\./)
  expect(r).not.toMatch(/Nothing is bound yet/)
  world.box = ''
  expect(await run($, '加重試')).toMatch(/接受新範圍之前，目前的任務照舊生效。$/)
})

test('review finding: a suggestion that cannot show or throws leaves the copyable accept line, and accept still works', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.suggestThrows = true
  world.files[PROPOSAL] = draft()
  await turnEnd($)
  const line = world.logs.join('\n').match(/\/agentctl accept ([0-9a-f]{8})/)
  expect(line).not.toBeNull()
  world.suggestThrows = false
  world.suggestHidden = true
  expect(await run($, 'proposal')).toMatch(/Accept this scope: \/agentctl accept [0-9a-f]{8}/)
  expect(await run($, `accept ${line[1]}`)).toMatch(/^Scope bound\./)
  expect(mem[KEY]).not.toBe('T1')
})

test('review finding: an accept whose save fails keeps the proposal waiting, and the same digest works once the store recovers', async ($, on) => {
  const { world, mem } = await setup($, on)
  world.files[PROPOSAL] = draft()
  await turnEnd($)
  const d = world.logs.join('\n').match(/\/agentctl accept ([0-9a-f]{8})/)[1]
  for (const prefix of ['task/', 'binding/']) {
    world.failSetPrefix = prefix
    const r = await run($, `accept ${d}`)
    expect([prefix, /could not be (saved|bound)/.test(r), /Scope bound/.test(r)]).toEqual([prefix, true, false])
    expect(mem[KEY]).toBe('T1')
    expect(await run($, 'proposal')).toMatch(new RegExp(`accept ${d}`))
  }
  world.failSetPrefix = undefined
  expect(await run($, `accept ${d}`)).toMatch(/^Scope bound\./)
})

test('review finding: the copy follows the latest goal, and last distinguishes no task from no hand-over', async ($, on) => {
  const { world } = await setup($, on)
  await run($, '幫登入功能加測試')
  world.box = ''
  expect(await run($, 'help')).toMatch(/^agentctl 讓 Claude 在你確認的範圍內工作/)
  expect(await run($, 'last')).toMatch(/這個任務還沒有存過交接/)
  // Found live: the accept reply's last line stayed English in a Chinese session.
  world.files[PROPOSAL] = draft()
  await turnEnd($, 'zh1')
  const d = world.logs.join('\n').match(/\/agentctl accept ([0-9a-f]{8})/)[1]
  const acc = await run($, `accept ${d}`)
  expect(acc).toMatch(/^範圍已綁定。下一步：請 Claude 開始這項工作。/)
  expect(acc).toMatch(/完整範圍：\/agentctl policy$/)
  expect(acc).not.toMatch(/shows the whole scope/)
  await run($, 'add a login test')
  world.box = ''
  expect(await run($, 'help')).toMatch(/^agentctl keeps Claude inside a scope you confirm/)
  expect(await run($, 'last')).toMatch(/This task has no saved hand-over yet/)
  expect(await run($, '')).toMatch(/^Next: ask Claude to work/)
})

test('review finding: text typed between the read and the fill survives, and the reply says the box holds both', async ($, on) => {
  const { world } = await setup($, on, { task: null })
  world.typedMeanwhile = 'my note '
  const r = await run($, 'fix the timer')
  expect(world.box.startsWith('my note ')).toBe(true)
  expect(world.box).toMatch(/Draft an agentctl task scope for: "fix the timer"/)
  expect(r).toMatch(/added after text you typed meanwhile/)
  expect(world.submitted).toBe(0)
})

test('review finding: task show and task clear refuse stray words before reading or changing anything', async ($, on) => {
  const { mem } = await setup($, on)
  expect(await run($, 'task clear extra')).toMatch(/"\/agentctl task clear" takes no such arguments/)
  expect(mem[KEY]).toBe('T1')
  expect(await run($, 'task show extra')).toMatch(/"\/agentctl task show" takes no such arguments/)
  expect(await run($, 'task clear')).toMatch(/Task cleared/)
})

test('live finding: a proposal still waiting is offered again as a suggestion at the next turn\'s end', async ($, on) => {
  const { world } = await setup($, on)
  world.files[PROPOSAL] = draft()
  await turnEnd($)
  expect(world.suggested.length).toBe(1)
  await turnEnd($, 'u2')
  expect(world.suggested.length).toBe(2)
  expect(world.suggested[1]).toBe(world.suggested[0])
  await run($, 'discard')
  await turnEnd($, 'u3')
  expect(world.suggested.length).toBe(2)
})
