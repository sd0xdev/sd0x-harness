# `/push-ci` reconciles a backgrounded push before any retry (task 8)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

Claude Code 2.1.281 backgrounds a running tool when the user sends a message with Ctrl+Enter. A push
moved to the background may still be pending, hung on the gate's terminal prompt, failed, or already
published — and the message that backgrounded it can read like a go-ahead.

## Requirements

- `/push-ci` § When the push runs where nobody can answer: a backgrounded push is reconciled before
  any retry — inspect the task's output and exit, and read the remote tip — and the outcome is
  reported rather than repeated
- A new user message is not a push credential; a retry is a new push with its own approval
  (Register #4 unchanged)

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `skills/push-ci/SKILL.md`, `test/skills/push-ci.test.js` |
| Out | The gate, Phase 0–2 fences, Register #4 text |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/push-ci/SKILL.md` | Modify | Reconcile-before-retry paragraph |
| `test/skills/push-ci.test.js` | Modify | The paragraph's three obligations |

## Acceptance Criteria

- [x] The section names the four states of a backgrounded push and requires inspecting the task and reading the remote tip before any retry
- [x] It states that a new user message is not a push credential and that a retry needs its own approval
- [x] No new fence and no change to Register #4 text
- [x] `/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Batch 2 |
| Development | Done | Reconcile-before-retry paragraph. Doc review rounds 1–2 added a check of every destination the plan named, the four reported outcomes, and no retry until the original task has exited |
| Testing | Done | Section assertions in `test/skills/push-ci.test.js`; `SKILL_DIGEST` updated after reading the diff |
| Acceptance | Done | `/codex-review-fast` ✅ Ready → `/precommit` `## Overall: ✅ PASS` (doc review: 3 rounds). `--verify-ac` 2026-10-03: 3/4 ACs Complete at High; the gate AC is Complete at Medium — review verdicts are not stored per commit, only the current tree's state — so Status stays Candidate Complete (Phase 2.5 rule 5) |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4, § 5 task 8
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) INV-005
