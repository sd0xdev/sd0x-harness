// What the band, `/agentctl` and `/agentctl policy|events` say (requirements FR-2, FR-3, FR-17,
// FR-23; tech spec § 3.3). Pure: every input arrives as data, every line names its source and age,
// and a field whose source did not answer says so instead of showing a value.

import { sanitize } from './sanitize.js'

// The four states a field can be in (FR-3).
export function field(label, reading, now) {
  if (!reading) return `${label}: missing`
  if (reading.failed) return `${label}: unavailable (${reading.failed})`
  const age = Math.max(0, Math.round((now - reading.at) / 1000))
  const stale = reading.staleAfterMs !== undefined && now - reading.at > reading.staleAfterMs
  return `${label}: ${reading.value} — ${reading.source}, ${age}s ago${stale ? ' (stale)' : ''}`
}

// review-state.js check --format=json → a gate reading. A gate pass is a gate pass, never a test pass.
export function gateReading(run, at) {
  if (typeof run === 'string') return { failed: run, at }
  if (!run || run.exitCode !== 0) return { failed: `check exited ${run ? run.exitCode : 'without a result'}`, at }
  let s
  try { s = JSON.parse(run.stdout) } catch { return { failed: 'not JSON', at } }
  const word = (p) => (!p ? '?' : p.passed ? '✅' : p.verdict === 'fail' && p.digest_match ? '⛔' : p.noted && !p.digest_match ? '⏳ stale' : p.owed ? '⏳ owed' : '·')
  return { value: `code ${word(s.code_review)} · doc ${word(s.doc_review)} · precommit ${word(s.precommit)}`, source: 'review-state.js check', at }
}

// Usage windows are read by kind; a missing window is missing, never 0%. One account's windows are
// shown for this session only and never summed with other sessions.
export function usageReading(usage, kind, at) {
  if (!usage) return null
  const w = (usage.rateLimits ?? []).find((r) => r.kind === kind)
  if (!w) return null
  return { value: `${Math.round(w.percentUsed)}%${w.resetsAt ? ` (resets ${w.resetsAt})` : ''}`, source: `session usage (${w.source ?? 'host'})`, at }
}

export function contextReading(usage, at) {
  const p = usage?.context?.percent
  return typeof p === 'number' ? { value: `${Math.round(p)}%`, source: 'session usage', at } : null
}

function evidenceLines(evidence, currentFingerprint, now) {
  const out = []
  for (const ev of Object.values(evidence ?? {})) {
    const fresh = currentFingerprint && ev.after && ev.after.value === currentFingerprint.value && ev.before && ev.before.value === ev.after.value
    const state = ev.outcome === 'backgrounded' ? 'started, completion unobserved'
      : ev.outcome === 'refused' ? 'refused'
      : !ev.after || !ev.before ? 'evidence unavailable'
      : ev.before.value !== ev.after.value ? 'tree changed during the run — unbound'
      : fresh ? 'current'
      : 'stale (tree changed since)'
    const age = Math.max(0, Math.round((now - ev.at) / 1000))
    out.push(`  ${sanitize(ev.requested, 120)}: ${ev.outcome === 'ok' ? 'no error reported' : ev.outcome} · ${state} · ${ev.coverage ?? 'coverage unknown'} · ${age}s ago`)
  }
  return out
}

const REASON_LABEL = {
  input: 'waiting for your input',
  permission: 'waiting for a permission decision',
  'policy-denied': 'refused by task policy',
  'rate-limit': 'rate limit reached',
  'suspected-stall': 'no activity (unconfirmed stall)',
}

function interventionLines(state, now) {
  return Object.entries(state.interventions ?? {}).map(([reason, v]) => {
    const age = Math.max(0, Math.round((now - v.since) / 1000))
    const detail = typeof v.detail === 'string' ? sanitize(v.detail, 120) : v.detail?.resetsAt ? `resets ${v.detail.resetsAt}` : ''
    return `  ${REASON_LABEL[reason] ?? reason}${detail ? ` — ${detail}` : ''} · since ${age}s ago`
  })
}

export function statusText(m) {
  const { now, task, state } = m
  const lines = []
  lines.push(task ? `Task: ${sanitize(task.goal, 120)} (${task.id})` : 'Task: none bound — observing only')
  lines.push(`Observation: ${m.health === 'ok' ? 'ok' : m.health}`)
  lines.push(`Runtime: ${state.runtime.value}${state.runtime.tool ? ` (${state.runtime.tool})` : ''} since ${Math.max(0, Math.round((now - state.runtime.since) / 1000))}s ago · phase ${state.phase.value} · result ${state.result.value}`)
  const iv = interventionLines(state, now)
  lines.push(iv.length ? 'Needs attention:' : 'Needs attention: nothing observed')
  lines.push(...iv)
  lines.push(field('Gates', m.gate, now))
  lines.push(field('Context', m.context, now))
  lines.push(field('5h window', m.fiveHour, now))
  const ev = evidenceLines(m.evidence, m.fingerprint, now)
  lines.push(ev.length ? 'Evidence (execution, not gate verdicts):' : 'Evidence: no declared check observed')
  lines.push(...ev)
  const bg = Object.entries(state.background ?? {}).filter(([, b]) => b.status === 'started' || b.status === 'in-flight')
  if (bg.length) lines.push(`Background in flight: ${bg.length} (${bg.map(([id]) => id).join(', ')})`)
  return lines.join('\n')
}

export function bandText(m) {
  const { task, state, now } = m
  const iv = Object.keys(state.interventions ?? {})
  const attention = iv.length ? `⚠ ${iv.map((r) => REASON_LABEL[r] ?? r).join(', ')}` : 'no attention needed'
  const head = task ? `agentctl · ${sanitize(task.goal, 40)}` : 'agentctl · no task'
  const rt = `${state.runtime.value}${state.runtime.tool ? `:${state.runtime.tool}` : ''} ${Math.max(0, Math.round((now - state.runtime.since) / 1000))}s`
  let gate = 'gates missing'
  if (m.gate?.failed) gate = 'gates unavailable'
  else if (m.gate) {
    const age = Math.max(0, Math.round((now - m.gate.at) / 1000))
    const stale = m.gate.staleAfterMs !== undefined && now - m.gate.at > m.gate.staleAfterMs
    gate = `${m.gate.value} (${age}s${stale ? ', stale' : ''})`
  }
  const resume = m.checkpoint ? ` · last hand-over ${new Date(m.checkpoint.savedAt).toISOString()}` : ''
  return `${head} · ${rt} · ${attention} · ${gate}${resume}${m.health === 'ok' ? '' : ` · ${m.health}`}`
}

export const LIMITS = [
  'This mod is a control and a display, not an isolation boundary; production read-only is enforced by credentials and the target\'s own permissions.',
  'If the host skips this mod\'s hook (worker crash, mod disabled) nothing here refuses; keep named dangerous commands in your permissions.deny rules.',
  'Native permission rules match command text, not programs; another mod can change a verdict at tool.check.',
  'Authorized executors run with their effects unclassified.',
]

export function policyText(task) {
  if (!task) return ['No task bound: the mod observes only.', ...LIMITS].join('\n')
  const one = (x) => (Array.isArray(x) ? x.join(' ') : Array.isArray(x?.argv) ? x.argv.join(' ') + (x.check ? ' (check)' : '') : String(x))
  const fmt = (xs) => (xs?.length ? xs.map((x) => sanitize(one(x), 200)).join('; ') : 'none')
  return [
    `Task ${task.id} · policy version ${task.policyVersion ?? 1}`,
    ...(task.recordMissing ? ['The bound task record is missing: everything but reads inside the worktree is refused. Set the task again.'] : []),
    `Worktree: ${sanitize(task.worktree, 200)}`,
    `Edits: ${(task.allow ?? []).includes('edit') ? `allowed in ${fmt(task.editRoots ?? ['.'])}` : 'not allowed'}`,
    `Forbidden (task): ${fmt(task.forbid)} · plus the built-in production-write and remote-git-write classes`,
    `Authorized executors: ${fmt(task.executors)}`,
    `Needs a person: ${fmt(task.needsUser)}`,
    `Other tools allowed: ${fmt(task.tools)}`,
    'Everything else is refused as unclassified.',
    ...LIMITS,
  ].join('\n')
}

export function eventsText(decisions, n, now) {
  const list = (decisions ?? []).slice(-n)
  if (!list.length) return 'No decisions recorded in this session.'
  return list.map((d) => `${Math.max(0, Math.round((now - d.at) / 1000))}s ago · ${d.outcome} · ${d.tool} · ${sanitize(d.requested, 160)} · ${sanitize(d.rule, 160)}`).join('\n')
}
