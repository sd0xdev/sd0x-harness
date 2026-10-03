# `/claude-health` Prompt Audit step and plugin-copies inventory (task 9)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

Claude Code 2.1.283 added `/doctor prompt-audit [path]`, which audits instruction files — the
plugin's installed rules and the generated `AGENTS.md` included — and proposes edits. Claude Code
2.1.273 syncs claude.ai skills into `~/.claude/skills/synced/`. `/claude-health` names neither, so a
proposed edit to Anchor text, or a second copy of a plugin skill, reaches the user unflagged.

## Requirements

- A manual **Prompt Audit** step naming `/doctor prompt-audit [path]`; this skill does not run it
- Findings on plugin-shipped content are report-only; a proposed edit to Anchor text is rejected
- An S4-style **plugin copies** inventory: local install, marketplace plugin and
  `~/.claude/skills/synced/`, each with the version it carries; report-only
- The pinned S1–S3 region and its heading sequence stay unchanged

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `skills/claude-health/SKILL.md`, `test/skills/claude-health.test.js` |
| Out | Running the host audit; editing any copy |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/claude-health/SKILL.md` | Modify | Plugin Copies (S4) and Prompt Audit sections; output template |
| `test/skills/claude-health.test.js` | Modify | Section content and placement |

## Acceptance Criteria

- [x] The skill names `/doctor prompt-audit [path]` as a manual step with its minimum version, and does not run it
- [x] Plugin-shipped findings are report-only and an Anchor-text edit is rejected
- [x] S4 lists the three origins with the version source of each, and an unreadable origin is reported as not checked
- [x] The S1–S3 region pin and heading-sequence pin pass unchanged
- [x] `/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Batch 3; host docs: memory § Audit your instruction files, skills § synced |
| Development | Done | § Plugin Copies (S4) and § Prompt Audit (manual step) after the Instruction Budget Module. Code review round 1 reached the versioned marketplace cache and left local-install drift to S1.4 alone |
| Testing | Done | Four tests in `test/skills/claude-health.test.js`; the S1–S3 region pin and the heading-sequence pin pass unchanged |
| Acceptance | Done | `/codex-review-fast` ✅ Ready (3 rounds) → `/precommit` `## Overall: ✅ PASS`. `--verify-ac` 2026-10-03: 4/5 ACs Complete at High; the gate AC is Complete at Medium — review verdicts are not stored per commit, only the current tree's state — so Status stays Candidate Complete (Phase 2.5 rule 5) |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4, § 5 task 9
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) acceptance sketch
