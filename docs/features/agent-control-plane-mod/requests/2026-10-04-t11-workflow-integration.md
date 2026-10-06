# T11 — agentctl in the workflow: Claude drafts, the person accepts

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-04
> **Status**: Completed
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 3.5, § 3.6, § 5 task 11
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-25, FR-26
> **Code location**: this repository — `skills/agentctl-setup/`, `skills/feature-dev/`, `skills/bug-fix/`, `skills/refactor/`

## Background

Asking the user to define a permission scope for every task is not realistic. The user asked for
Claude to plan the scope and for agentctl to sit inside the auto-loop as far as is sensible, as a
complement to the harness rather than a second workflow — never as a gate.

## Requirements

- `status`: one line of install state, never a claim that the mod runs
- `propose`: the setup answers plus tools, acceptance and base, validated by the mod's own code, written to a private file outside the worktree
- One shared reference for drafting from a ticket and for how agentctl sits beside each gate
- Short optional sections in `/feature-dev`, `/bug-fix`, `/refactor`; `/agentctl-setup --task` drafts a proposal

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 3.5 and § 3.6, § 5 task 11 |
| Out | Changes to rules or hooks; automatic ingestion of hand-overs by `/next-step` or recap skills |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/agentctl-setup/scripts/agentctl-setup.js` | Modify | `status`, `propose`; checks must match an executor |
| `skills/agentctl-setup/SKILL.md` | Modify | Proposal mode |
| `skills/agentctl-setup/references/workflow-integration.md` | New | Drafting and the fit beside the gates |
| `skills/feature-dev/SKILL.md`, `skills/bug-fix/SKILL.md`, `skills/refactor/SKILL.md` | Modify | Optional agentctl section |
| `test/skills/agentctl-setup.test.js`, `test/scripts/agentctl-version.test.js` | Modify | Helper, skill and version-relative lock tests |

## Acceptance Criteria

- [x] `propose` writes a 0600 file under `~/.claude/agentctl/proposals/`, never in the worktree, whose digest equals the mod's; what the mod refuses is refused and nothing is written
- [x] `status` reports installed/enabled, installed/disabled, not installed or unknown, and says it is configuration only
- [x] A check that would only be delegated (an inline assignment) is refused as a check
- [x] The three workflow skills offer agentctl only on `installed/enabled` and state it is never a gate
- [x] The reference keeps agentctl evidence beside a verdict, never the reason a gate passed
- [x] Pass /codex-review-fast
- [x] Pass /precommit
- [x] Pass /codex-review-doc

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Brainstorm equilibrium (2026-10-04): no new skill, no snapshot bridge in v1 |
| Development | Done | Helper, reference, three sections, setup skill |
| Testing | Done | `test/skills/agentctl-setup.test.js` 36 pass; `npm test` 5130 pass |
| Acceptance | Done | 2026-10-04: `/codex-review-fast` (thorough): ✅ Ready. `/precommit`: ✅ PASS. `/codex-review-doc` (three batches): ✅ Mergeable — the review added `propose --stdin`, because a bound task refuses the Write to the answers file |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Mod: [2026-10-04-t10-mod-deny-list-proposals.md](2026-10-04-t10-mod-deny-list-proposals.md)
