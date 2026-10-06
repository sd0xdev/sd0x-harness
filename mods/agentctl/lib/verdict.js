// The tool.check verdict (tech spec § 3.4, feasibility § 6): never weaken a deny, never create an
// allow. `allow` leaves this function only as an unchanged downstream `allow` on a pass-through call.

// Where an `ask` is known to reach a person, from recorded dialogs only (T8, 2026-10-04, 2.1.289):
// the interactive terminal under the default (manual), acceptEdits and auto permission modes showed
// the host's own Yes/No dialog. dontAsk refused the ask; bypassPermissions, plan, `-p`, Desktop,
// VS Code and mobile are unverified. Anything not listed — including an unknown mode — is refused.
export const VERIFIED_ASK_SURFACES = ['terminal']
export const VERIFIED_ASK_MODES = ['default', 'acceptEdits', 'auto']

export function surfaceVerified(session) {
  return Boolean(session?.interactive)
    && VERIFIED_ASK_SURFACES.includes(session?.surface)
    && VERIFIED_ASK_MODES.includes(session?.permissionMode)
}

// outcome: the classifier's; downstream: { decision, reason?, rule? } from next(e).
export function combine(outcome, downstream, verified) {
  const down = downstream && typeof downstream.decision === 'string' ? downstream : { decision: 'deny', reason: 'agentctl: no downstream verdict' }
  if (outcome.outcome === 'deny' || outcome.outcome === 'unknown') return { decision: 'deny', reason: `agentctl refused: ${outcome.rule}` }
  if (down.decision === 'deny') return down
  if (outcome.outcome === 'pass') return down
  if (outcome.outcome === 'needs-user') {
    return verified
      ? { decision: 'ask', reason: `agentctl: ${outcome.rule} — needs your approval` }
      : { decision: 'deny', reason: `agentctl refused: ${outcome.rule} needs a person, and this surface has no verified approval dialog` }
  }
  return { decision: 'deny', reason: 'agentctl refused: unrecognised classification' }
}
