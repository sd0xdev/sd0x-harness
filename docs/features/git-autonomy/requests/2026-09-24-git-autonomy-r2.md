# R2 — `git-workflow-project.md` override and its registration

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Candidate Complete
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R1](./2026-09-24-git-autonomy-r1.md)

## Background

A third user-owned override, same Anchor-first contract as `auto-loop-project.md` and `testing-project.md`. Tech spec § 3.2; the override-file list is hard-coded in ~15 places.

## Requirements

- `rules/git-workflow-project.md` scaffold: live `Precedence:` preamble, `Based on: git-workflow.md @ <blob>` stamp, headings `Branch Naming`, `Commit Format`, `Protected Branches`, `Offer Mode`, `Deploy Workflow`, `Run Steps` (the last with the run-script risk as its comment)
- `rules/git-workflow.md` gains `## Project Customization` (Anchor-first steps 0–4, heading → kind → tier table) outside every pinned block
- Register the third file in every carrier: `discretion.md` L3, `rule-override-pattern` §3.3/§3.4, `install-rules` copy contract, `claude-health` S2.5 #1/#3, `project-setup` counts, `CLAUDE*.md` `## Rules`, README rule counts
- `claude-health` reports: removal attempts / parse errors in `## Protected Branches` (never omissions), `## Deploy Workflow` parse errors, invalid `Run Steps` values

## Scope

| Scope | Description |
| ----- | ----------- |
| In    | Scaffold, parent section, registration, health checks, pins |
| Out   | Consumers of `Offer Mode` (R4) and `Deploy Workflow` / `Run Steps` (R5) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `rules/git-workflow-project.md` | New | Scaffold |
| `rules/git-workflow.md` | Modify | `## Project Customization` |
| `rules/discretion.md` | Modify | L3 out-of-scope list |
| `skills/install-rules/SKILL.md` | Modify | Copy contract |
| `skills/claude-health/SKILL.md` | Modify | S2.5 checks |
| `skills/project-setup/SKILL.md` | Modify | Counts |
| `test/rules/override-contract.test.js` | Modify | Pins for the new section and templates |

## Acceptance Criteria

- [x] `/install-rules` copies all three override templates once, stamping `Based on:` with the base blob hash, and never rewrites an installed one
- [x] An override heading that hits the Anchor Register is reported as a conflict and ignored
- [x] `claude-health` S2.5 reports drift and missing-reference for all three files, and the three conflict classes above
- [x] A test fails when any carrier's override count or list disagrees with `rules/*-project.md` on disk
- [x] `override-contract.test.js` pins `git-workflow.md` § Project Customization like the other two sections
- [x] `npm test` green; README rule counts regenerated and matching disk

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | Settings-only scaffold per tech spec § 3.2; `## Project Customization` mirrors `testing.md`'s |
| Development | Done  | `rules/git-workflow-project.md`; `git-workflow.md` § Project Customization; registered in discretion, CLAUDE*, docs/rules, install-rules, project-setup (incl. installing `protected-branches.sh`, the item R1 carried here), claude-health (S2.5 check #7, inventory), rule-override-pattern `override_templates`, six READMEs |
| Testing    | Done   | `test/rules/override-carriers.test.js` (set comparison, six READMEs, negative control); override-contract pins for the section, preamble and mapping; claude-health check #7; project-setup counts derived from disk; `npm test` 4876/4876; `/precommit` ✅ PASS |
| Acceptance | Done   | Codex thorough code review ✅ Ready after two P2 fixes (check #7 ran only on active content; carrier test was presence-only); `--verify-ac` 2026-09-25: 6/6 Complete; AC 2 at Medium (Anchor-hit conflicts are rule text the model applies; only `## Protected Branches` has an executable check, which fails closed), hence Candidate Complete |