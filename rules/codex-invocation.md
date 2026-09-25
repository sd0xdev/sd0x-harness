# Codex Invocation Rule ⚠️ CRITICAL

**Codex must independently research. Never feed it your conclusions.** The full contract is
`skills/codex-code-review/references/codex-invocation-contract.md`; this file is its always-loaded
core. **Before any review or verification dispatch, read the full contract** — a skill that cannot
read it does not dispatch.

The core, which holds even before the reference is read:

- A **review first dispatch** carries metadata — changed-file list, diff stats, the task — and
  mandates exploration. Never the diff, the code, a conclusion, a leading question, a scope
  restriction or a list of directions to attack. The three exceptions below are the only dispatches
  that may carry more, each within its own bounds.
- A **same-thread reply** may carry the new diff, never your reading of it; it asks Codex to verify
  the fixes and whether they introduced new issues.
- A **rotated thread's** first dispatch is a first dispatch again.

How a prompt is carried — the transport — is `skills/codex-code-review/references/codex-transport.md`'s
subject, not this file's. Each section below is the core of the contract's section of the same name.

## Which dispatches this file governs

Review and verification dispatches; a conversation dispatch (`codex-implement`, `codex-explain`,
open-ended `codex-brainstorm`) is not governed.

## Required in every first-dispatch prompt

Metadata plus a mandate to explore, from the skill's template.

## Prohibited patterns

Feeding the diff, code or a conclusion; leading or confirmation questions; scope restrictions; a
cumulative attack list.

## Judgement-over-evidence exception

`feature-verify` and `necessity-audit` may hand over the artifact under judgement and its evidence,
never a verdict.

## Verification dispatch exception

`seek-verdict` and `issue-analyze` may state the claim being adjudicated, as a claim; `seek-verdict`
alone gets one rebuttal round.

## Loop review exception

A same-thread reply may carry the new diff; the exception is scoped to the thread, never to the
task.
