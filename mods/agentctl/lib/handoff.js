// Model-free hand-over (requirements FR-15, UC-6; tech spec § 3.4). Pure: built only from records.
// It answers the eight questions and keeps three sources apart: what the user confirmed (the task),
// what tools observed (operations, evidence), and what Claude only claimed (never stored as a fact,
// so the hand-over says plainly that nothing claimed is shown as verified).

import { CAPS, sanitize } from './sanitize.js'
import { HARD_FORBIDDEN } from './policy.js'

const s = (x, n = 200) => sanitize(x, n)

// Each section is { heading, items, fixed }: headings and `fixed` lines always appear; `items` fill the
// remaining budget in order and the rest is counted, so the size cap never drops a heading or the
// limits disclosure (INV-005) the way truncating the finished text would.
function assemble(head, sections, cap) {
  const fixedText = [...head, ...sections.flatMap((x) => ['', x.heading, ...x.fixed])].join('\n')
  const omitLine = (n) => `- … ${n} more omitted (hand-over size cap)`
  let budget = cap - fixedText.length - sections.length * omitLine(99999).length
  const out = [...head]
  for (const x of sections) {
    out.push('', x.heading)
    let shown = 0
    for (const it of x.items) {
      if (it.length + 1 > budget) break
      out.push(it); budget -= it.length + 1; shown++
    }
    if (shown < x.items.length) out.push(omitLine(x.items.length - shown))
    out.push(...x.fixed)
  }
  return out.join('\n')
}

export function handoff({ task, state, evidence, fingerprint, decisions, now, sessionId }) {
  const head = [
    `# Hand-over — ${task ? s(task.goal, 120) : 'no task bound'}`,
    '',
    `Generated from structured records at ${new Date(now).toISOString()} (session ${s(sessionId, 60)}); no model was called.`,
  ]
  const sec = []
  sec.push({ heading: '## 1. Goal', items: [], fixed: [task ? s(task.goal, 500) : 'No task was declared for this session.'] })
  const scope = []
  if (task) {
    scope.push(`- Worktree: ${s(task.worktree)}`)
    scope.push(`- Edits: ${(task.allow ?? []).includes('edit') ? `allowed in ${(task.editRoots ?? ['.']).map((r) => s(r)).join(', ')}` : 'not allowed'}`)
    scope.push(`- Authorized executors: ${(task.executors ?? []).map((e) => s(e.argv.join(' '))).join('; ') || 'none'}`)
    scope.push(`- Forbidden: ${(task.forbid ?? []).map((f) => s(Array.isArray(f) ? f.join(' ') : f)).join('; ') || 'none'}, plus ${[...new Set(HARD_FORBIDDEN.map((h) => h.rule))].join(', ')}`)
    if (task.acceptance?.length) scope.push(`- Acceptance conditions: ${task.acceptance.map((a) => s(a)).join('; ')}`)
  }
  sec.push({ heading: '## 2. Allowed and forbidden scope', items: scope, fixed: task ? [] : ['- No scope was declared.'] })
  const ops = Object.entries(state.ops ?? {})
  const edits = ops.filter(([, o]) => ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(o.tool) && o.outcome === 'ok')
  sec.push({ heading: '## 3. What changed', items: [], fixed: [
    fingerprint ? `- Tree: HEAD ${s(fingerprint.head, 60)}, ${fingerprint.changedCount ?? '?'} changed or untracked path(s) (${fingerprint.coverage})` : '- Tree: not read for this hand-over',
    `- Edits observed this session: ${edits.length}`,
  ] })
  const ev = Object.values(evidence ?? {})
  const current = (e) => fingerprint && e.after && e.before && e.before.value === e.after.value && e.after.value === fingerprint.value && e.outcome === 'ok'
  const verified = ev.filter(current).map((e) => `- ${s(e.requested)} — no error reported, tree unchanged since (${e.coverage})`)
  sec.push({ heading: '## 4. Verified (execution evidence on the current tree)', items: verified, fixed: verified.length ? [] : ['- Nothing.'] })
  const notVerified = ev.filter((e) => !current(e)).map((e) => {
    const why = e.outcome === 'backgrounded' ? 'started, completion unobserved' : e.outcome !== 'ok' ? `outcome ${e.outcome}` : !e.after || !e.before ? 'evidence unavailable' : e.before.value !== e.after.value ? 'tree changed during the run' : 'stale — the tree changed since'
    return `- ${s(e.requested)} — ${why}`
  })
  sec.push({ heading: '## 5. Not verified', items: notVerified, fixed: ['- Anything Claude stated as done, passing or fixed without an evidence record above is only its own judgement.'] })
  const open = ops.filter(([, o]) => o.endedAt === undefined && o.outcome !== 'refused')
  const bg = Object.entries(state.background ?? {}).filter(([, b]) => b.status === 'started' || b.status === 'in-flight')
  const running = [
    ...open.map(([id, o]) => `- ${s(o.requested)} (${o.tool}, ${o.outcome}) — ${id}`),
    ...bg.map(([id, b]) => `- background ${s(id, 60)} — ${b.status}${b.asOf ? ` as of ${new Date(b.asOf).toISOString()}` : ''}`),
  ]
  sec.push({ heading: '## 6. Still running or unknown', items: running, fixed: running.length ? [] : ['- Nothing observed as still running. Untracked processes cannot be confirmed either way.'] })
  const iv = Object.keys(state.interventions ?? {})
  sec.push({ heading: '## 7. Next step', items: [], fixed: [iv.length ? `- Resolve: ${iv.map((x) => s(x, 60)).join(', ')}` : '- None recorded. Decide from sections 4–6.'] })
  const refused = (decisions ?? []).filter((d) => d.outcome === 'deny' || d.outcome === 'unknown' || d.outcome === 'needs-user-refused')
  sec.push({ heading: '## 8. Still not allowed', items: [], fixed: [
    ...(refused.length ? refused.slice(-10).map((d) => `- ${s(d.requested)} — ${s(d.rule)}`) : ['- No call was refused this session; the forbidden scope in section 2 still applies.']),
    '- Earlier approvals do not carry over: on resume, every call is classified again and the host asks again.',
    // INV-005: what this mod cannot refuse is disclosed here as in /agentctl policy, never silent.
    '- Limits: if the host skips this mod\'s hook (worker crash, mod disabled) nothing here refused; another mod can change a verdict at tool.check. Hard rules belong in permissions.deny.',
  ] })
  return assemble(head, sec, CAPS.handoff)
}
