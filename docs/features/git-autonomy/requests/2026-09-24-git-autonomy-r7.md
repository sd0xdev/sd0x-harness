# R7 — Goal-mode commit: commit without a per-use question while the user's goal is active

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Pending
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source, § 3.5)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R2](./2026-09-24-git-autonomy-r2.md), [R5](./2026-09-24-git-autonomy-r5.md)

## Background

FR-17 (maintainer decision 2026-09-24): while the user has set a Claude Code `/goal`, the model may
run `/smart-commit --execute` on a feature branch without its per-use AskUserQuestion. The
attribution guard and every git-autonomy rule stay in force. This adds a credential, so it is an
Anchor Register #4 change reviewed at `thorough`.

## Requirements

- Rule text for the four § 3.5 conditions: a user-originated goal, still active, a feature branch,
  and every required gate `pass` at the current digest with `## Goal Commit` not `off`
- `/smart-commit --execute` Step 5: under a counting goal, print the plan with a `[GOAL_COMMIT]`
  record (goal as a hash, never its text) instead of asking; every validation and every judgement
  prompt stays; never `--ai-co-author`
- Every other approval or confirmation directive in the skill names the same exception (tech spec
  § 3.5 lists today's: frontmatter, workflow diagram, Step 1a, Step 4 grouping confirmation,
  § Prohibited, § Examples)
- `## Goal Commit: on|off` in the `git-workflow-project.md` scaffold and § Project Customization
- Register #4, the `git-workflow.md` grant block, § Efficacy Boundary and CLAUDE.md /
  CLAUDE.template.md rule 4 name the credential and its scope; every pin is re-recorded in this change

## Scope

| Scope | Description |
| ----- | ----------- |
| In    | Rule text, the Step 5 branch, the setting, Anchor edits and pins, tests |
| Out   | Goal-mode push or `/deploy-flow`; goal-mode commits on protected branches (tech spec Q4) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `rules/git-workflow.md` | Modify | Grant block + § Proactive Offer: the goal credential |
| `rules/discretion.md` | Modify | Register #4 and § Efficacy Boundary |
| `CLAUDE.md`, `CLAUDE.template.md` | Modify | Rule 4 exception list |
| `skills/smart-commit/SKILL.md` | Modify | Step 5 goal branch, `[GOAL_COMMIT]` record, every other approval/confirmation directive |
| `rules/git-workflow-project.md` | Modify | `## Goal Commit` heading |
| `test/rules/discretion-tiers.test.js`, `test/rules/override-contract.test.js`, `test/scripts/smart-commit.test.js` | Modify | Pins and both-direction condition tests |

## Acceptance Criteria

- [ ] With a user-typed `/goal` active on a feature branch and all required planes `pass`, the rule text sends `/smart-commit --execute` to execution with no approval question and a `[GOAL_COMMIT]` record
- [ ] Each fallback condition keeps the ordinary approval: a goal the model set without the user's approval; a goal met, judged impossible, cleared by `/goal clear` or by an error, or superseded; a set notice lost to `/clear` or compaction; a protected branch or detached HEAD; an open gate; `## Goal Commit: off`
- [ ] The `[GOAL_COMMIT]` record carries a hash of the goal, never its text; every approval or confirmation directive in `skills/smart-commit/SKILL.md` (search: approval, confirm, ask) names the goal exception, so the goal path meets no question outside the judgement prompts
- [ ] The goal path still commits through `smart-commit-execute.sh commit`: a message with an AI trailer exits 4 and nothing is committed; `--ai-co-author` is never passed
- [ ] Push and `/deploy-flow` still require their own per-use approvals under an active goal
- [ ] Register #4, the grant block, § Efficacy Boundary and rule 4 carry the credential, and their pins are re-recorded in the same change

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | -      |      |
| Development | -     |      |
| Testing    | -      |      |
| Acceptance | -      |      |
