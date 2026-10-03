# `/verify` § Commit context reuses a passed precommit, else delegates (task 6)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Depends On**: [`/verify` prints `## Verify:`](./2026-10-03-b2-t5-verify-sentinel.md)

## Background

When the host's pre-commit guidance sends Claude to `/verify`, the gate that actually binds a commit
is `/precommit`. `/verify` must neither duplicate a precommit that already passed at the current
digest nor stand in for one that did not (intent INV-003).

## Requirements

- `skills/verify/SKILL.md` gains § Commit context, used only when `/verify` is reached through the
  host's pre-commit guidance
- It reads `review-state.js check --format=json` (installed copy first); when `precommit.passed`
  is exactly `true`, it reports "Precommit already passed at the current code digest; no new checks
  executed" and stops — no sentinel, no verdict note
- Otherwise — `passed` false, the slot missing, the output malformed or the checker absent — it runs
  `/precommit`, whose own evidence contract applies
- Ordinary `/verify` is unchanged

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `skills/verify/SKILL.md`; `test/skills/verify.test.js` (new) |
| Out | The runner (task 5); `review-state.js` |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/verify/SKILL.md` | Modify | § Commit context |
| `test/skills/verify.test.js` | New | Commit-context contract and its fail-closed cases |

## Acceptance Criteria

- [x] § Commit context reuses only `precommit.passed === true`; a false value, missing slot, malformed JSON and absent checker each delegate to `/precommit`
- [x] The reuse path emits no sentinel and writes no note
- [x] Ordinary `/verify` steps are unchanged
- [x] `/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Batch 2 |
| Development | Done | § Commit Context in `skills/verify/SKILL.md`; § Output names why `## Overall:` is not used |
| Testing | Done | New `test/skills/verify.test.js`; one test reads a real `review-state.js check` to confirm `precommit.passed` is a boolean |
| Acceptance | Done | `/codex-review-fast` ✅ Ready → `/precommit` `## Overall: ✅ PASS` |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4, § 5 task 6, § 6 Verify
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) INV-003
