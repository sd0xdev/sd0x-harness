# Record that NG-1's premise ended with Claude Code 2.1.277 (task 4)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

`docs/features/harness-engineering-adoption/2-tech-spec.md` row NG-1 says Claude Code only reads
`CLAUDE.md` and keeps the AGENTS.md generator as a Codex by-product. Since 2.1.277 that premise is
false. The spec row is a record of its time and is not edited; a dated record supersedes it.

## Requirements

- New record `docs/features/harness-engineering-adoption/requests/2026-10-03-ng1-agents-md-native.md`
  stating the platform change, the date, and that the generator is now a first-class entry point
- Points to this feature's tech spec for the remedy
- `harness-engineering-adoption/2-tech-spec.md` is not modified

## Scope

| Scope | Description |
| ----- | ----------- |
| In | One new record file |
| Out | Any edit to the original spec |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `docs/features/harness-engineering-adoption/requests/2026-10-03-ng1-agents-md-native.md` | New | Superseding record |

## Acceptance Criteria

- [x] The record names NG-1, Claude Code 2.1.277, and links this feature's tech spec
- [x] `harness-engineering-adoption/2-tech-spec.md` is byte-unchanged
- [x] `node scripts/check-doc-links.js` reports no failure for the record
- [x] `/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Batch 1 |
| Development | Done | Record written; the original spec is untouched |
| Testing | Done | Link check: no failures, 0 unresolved; `git diff` of the original spec is empty |
| Acceptance | Done | `/codex-review-doc` ✅ Mergeable (3 rounds; the findings were in `skills/codex-setup/SKILL.md`, none in this record) |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4, § 5 task 4
