# AGENTS.md kernel remainder rewritten to agree with the rules (task 2)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P0
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Depends On**: [Canonical Anchor block extraction](./2026-10-03-b1-t1-canonical-block-extraction.md)

## Background

`skills/codex-setup/references/agents-kernel.md` lists two precommit sentinels where
`rules/auto-loop.md` defines four, says "Fix every issue found", and names no Anchor. Once the
Anchors arrive verbatim (task 1), the rest of the kernel must agree with the resident rules at
Default tier and must not restate an Anchor (intent INV-002).

## Requirements

- Sentinel table lists all four precommit sentinels: `## Overall: ✅ PASS`, `## Overall: ⛔ FAIL`,
  `## Overall: ❌ FAIL`, `## Overall: ⚠️ NO CHECKS RUN`
- "Fix every issue found" replaced by the owed-finding rule (tech spec § 3.2)
- Verification distinguished from precommit
- The 5.0 Read rule: procedures live in the sd0x-dev-flow plugin; when a referenced contract
  cannot be read, stop the governed action; a grant named in the Anchors is not evidence the
  workflow is installed
- No Default-tier line restates an Anchor Register item

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `skills/codex-setup/references/agents-kernel.md`; kernel content tests |
| Out | Extraction mechanics (task 1); doctor (task 3) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/codex-setup/references/agents-kernel.md` | Modify | Default-tier remainder + Anchors placeholder |
| `test/scripts/build-codex-artifacts.test.js` | Modify | Generated-kernel content checks |

## Acceptance Criteria

- [x] Generated kernel contains all four precommit sentinels and no `Fix every issue`
- [x] Generated kernel states the Read-fails-stop rule and that a grant is not an installation
- [x] A check over the remainder (outside the Anchors section) finds no line restating an Anchor Register item; a planted paraphrase fails it
- [x] Existing `.sd0x/scripts/` path test still passes
- [x] `/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.2 |
| Development | Done | Kernel rewritten: four sentinels, owed-finding rule, Read-fails-stop, verify ≠ precommit; attribution and security paraphrases removed |
| Testing | Done | Generated-kernel content tests and the remainder restatement check with a planted-paraphrase negative control |
| Acceptance | Done | `/codex-review-fast` ✅ Ready → `/precommit` `## Overall: ✅ PASS` |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.2, § 5 task 2
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) INV-002, INV-004
