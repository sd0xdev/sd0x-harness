# `/codex-setup doctor` instruction-files and AGENTS.md freshness rows (task 3)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P0
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Depends On**: [Canonical Anchor block extraction](./2026-10-03-b1-t1-canonical-block-extraction.md)

## Background

`doctor` compares the installed `AGENTS.md` with the hash recorded at install time, which catches a
hand edit but not an upgrade, and it says nothing about which instruction files Claude Code loads.

## Requirements

- **Instruction files** row: which of `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`,
  `AGENTS.md` exist in the working directory and its ancestors; the effective `instructionFiles`
  mode from user or managed settings (project settings are ignored by the host; unreadable →
  "default assumed"); what therefore loads, per mode (tech spec § 3.3)
- **AGENTS.md freshness** row: installed file compared with freshly generated expected content
- Existing rows unchanged

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `skills/codex-setup/SKILL.md` § doctor; `test/skills/codex-setup.test.js` |
| Out | Generator internals (task 1) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/codex-setup/SKILL.md` | Modify | Two new `doctor` rows with their decision tables |
| `test/skills/codex-setup.test.js` | Modify | Rows present; mode table matches the host's four modes |

## Acceptance Criteria

- [x] `doctor` documents the Instruction files row with all four modes and the ancestor walk
- [x] Under `claude-md-or-agents-md`, `CLAUDE.local.md` suppresses AGENTS.md; under `claude-md-and-agents-md` it does not — both stated
- [x] Unreadable settings report "default assumed", never a guessed mode
- [x] The freshness row compares against regenerated content and names `/codex-setup sync` as the remedy
- [x] Existing doctor rows and their tests unchanged
- [x] `/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.3 |
| Development | Done | Two doctor rows and the three-step subsection. Doc review rounds 1–2 added `.claude/AGENTS.md`, the availability step, the `--settings` source and `claudeMdExcludes`, all checked against the host memory docs |
| Testing | Done | Six doctor tests in `test/skills/codex-setup.test.js`; they check the written procedure, not a live session |
| Acceptance | Done | `/codex-review-fast` ✅ Ready → `/precommit` `## Overall: ✅ PASS` |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.3, § 5 task 3, § 6 Doctor
- Host behaviour: code.claude.com/docs/en/memory § Choose which instruction files load
