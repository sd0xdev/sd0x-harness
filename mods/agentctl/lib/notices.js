// Local notices (requirements FR-24; tech spec § 3.4 Notices). Pure: given the current interventions
// and what was already notified, decide what to say now. One notice per blocking reason; repeated
// only when the reason cleared and came back, or its severity rose; never twice within the cool-down.

export const COOLDOWN_MS = 10 * 60 * 1000
const RANK = { info: 0, warn: 1, critical: 2 }

// sent: { [reason]: { at, severity, active } }
export function decideNotices(interventions, sent, now, cooldownMs = COOLDOWN_MS) {
  const next = {}
  const toSend = []
  for (const [reason, prev] of Object.entries(sent ?? {})) next[reason] = { ...prev, active: false }
  for (const [reason, iv] of Object.entries(interventions ?? {})) {
    const prev = sent?.[reason]
    const rose = prev && RANK[iv.severity] > RANK[prev.severity]
    const returned = prev && prev.active === false
    const fresh = !prev
    const cooled = !prev || now - prev.at >= cooldownMs
    if ((fresh || ((returned || rose) && cooled))) {
      toSend.push({ reason, severity: iv.severity })
      next[reason] = { at: now, severity: iv.severity, active: true }
    } else {
      next[reason] = { ...prev, active: true, severity: prev.severity }
    }
  }
  return { toSend, sent: next }
}

// A background task's notification arrives as a prompt whose origin is `task-notification`; its text
// carries `<task-id>` and `<status>` elements (found live on 2.1.288). Anything else, or a status that
// is not terminal, is not a completion.
export function parseTaskNotification(text) {
  const s = String(text ?? '')
  const id = /<task-id>([^<]{1,200})<\/task-id>/.exec(s)?.[1]?.trim()
  const status = /<status>([^<]{1,40})<\/status>/.exec(s)?.[1]?.trim()
  if (!id || !status) return null
  if (!['completed', 'failed', 'killed', 'cancelled'].includes(status)) return null
  return { id, status }
}
