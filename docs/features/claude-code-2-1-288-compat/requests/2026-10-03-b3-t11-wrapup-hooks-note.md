# Wrap-up note in the READMEs and the hook fail-closed sentence (task 11)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

Claude Code can give Claude a small allowance to reach a stopping point when a subscription hits
its usage limit mid-task, and 2.1.288 blocks a tool call whose PreToolUse or PermissionRequest hook
fails to match or receives input that cannot be serialized. Neither is something this repository
can exercise (intent INV-007), and neither is stated in its docs.

## Requirements

- README § Rules & Hooks, in all six languages: the wrap-up allowance helps reach a stopping point,
  does not close a gate, and the Stop hook's reminder may not appear during it
- `docs/hooks.md`: one sentence on the 2.1.288 host rule, stated as documented and not tested, and
  that the guards keep their documented fail-open on a missing `jq` / `node`

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `README*.md`, `docs/hooks.md` |
| Out | Any hook behaviour change |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `README.md`, `README.{zh-TW,zh-CN,ja,ko,es}.md` | Modify | Wrap-up paragraph |
| `docs/hooks.md` | Modify | Host fail-closed sentence |

## Acceptance Criteria

- [x] All six READMEs say the allowance does not close a gate and that the Stop reminder may not appear
- [x] `docs/hooks.md` names 2.1.288, says "documented, not tested", and keeps the guards' fail-open statement unchanged
- [x] `/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Batch 3; Claude Code changelog 2.1.288 |
| Development | Done | Wrap-up paragraph in six READMEs; `docs/hooks.md` sentence on 2.1.288. Doc review round 1 corrected the formatter wording: a project-local or `PATH` `prettier` with a project config |
| Testing | Done | Link check clean |
| Acceptance | Done | `/codex-review-doc` ✅ Mergeable (2 rounds) |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4, § 5 task 11
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) INV-007
