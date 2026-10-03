# Intent — agent-control-plane-mod

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

## North star

A person can hand a task to one Claude Code session and leave it, and still know what it is doing,
when to step in, and whether what it hands back is backed by evidence rather than by its own
sentence. The first version makes one session manageable; managing many is a later decision.

## Non-goals

- A second supervising agent, a Slack crawler, a web dashboard, a message queue, or scheduling
  across machines or runtimes.
- Authority over any gate or credential: the mod reads `review-state.js` and never writes it,
  approves no tool call, and is not a git credential (Anchor Register #4). Its task-policy refusal
  is best-effort scope control, not a gate.
- Being a security or isolation boundary: it does not replace the host's permission prompt, the
  sandbox, or the credential scope that keeps production read-only.
- Rewriting a command's target (cluster, context, namespace) toward a safer one.
- A cosmetic pause: a control the host cannot honour is not drawn.
- A model-written hand-over in version one; it spends the user's quota.
- Shipping inside sd0x-dev-flow while the mods API is marked as changeable between releases.

## Invariants

- `INV-001`: Every panel field names its source and time, or reads `unknown`; nothing is inferred
  to fill a gap.
- `INV-002`: A test, lint or build result is execution evidence bound to the tree state it ran on;
  a result whose tree state no longer matches is shown as stale, never as current, and a gate
  verdict is never shown as an observed test pass.
- `INV-003`: A background job that started is recorded as started; only an observed exit marks it
  passed or failed.
- `INV-004`: A tool call the task's policy forbids is refused by name; one the mod cannot classify
  is refused too; an allowed one goes to the host's own permission path unchanged.
- `INV-005`: The mod never answers `allow` on a path it did not evaluate: its own errors refuse.
  Where the installed host skips the hook and lets a call continue, that limitation is disclosed in
  the panel and the hand-over, never silent.
- `INV-006`: Every control reports what it did and did not affect as observed; "all stopped" is
  shown only when every model turn and every subprocess has an observed end state.
- `INV-007`: The hand-over is produced from structured records with no model call, no network and
  no subprocess, and no recorded field — command text, URL or path included — carries a secret.

## Acceptance sketch

Declare a read-only investigation task, let Claude run tests, edit one source file afterwards, then
close and reopen the session. The panel shows the task and the last hand-over before any tool runs;
the earlier test pass reads as stale; a `kubectl rollout restart` tool call is refused with its rule
and no Allow control; `/handover` under `claude -p` prints the eight answers with no model, network
or process call; and the mod's source and tests show no approve, verdict-write, prompt-write or
model call.
