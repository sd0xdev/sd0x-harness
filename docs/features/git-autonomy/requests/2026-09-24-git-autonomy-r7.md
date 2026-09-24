# R7 — Goal-mode commit: commit without a per-use question while the user's goal is active

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Candidate Complete
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source, § 3.5)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R2](./2026-09-24-git-autonomy-r2.md), [R5](./2026-09-24-git-autonomy-r5.md)

## Background

FR-17 (maintainer decision 2026-09-24): while the user has set a Claude Code `/goal`, the model may
run `/smart-commit --execute` without its per-use AskUserQuestion — on a protected branch only after
recommending a feature branch and getting the user's allowance. The
attribution guard and every git-autonomy rule stay in force. This adds a credential, so it is an
Anchor Register #4 change reviewed at `thorough`.

## Requirements

- Rule text for the four § 3.5 conditions: a user-originated goal, still active, a feature branch or
  a protected branch the user allowed, and every required gate `pass` at the current digest with
  `## Goal Commit` not `off`
- The protected-branch first commit: recommend a feature branch; if declined, ask to allow the
  branch for this goal
- `/smart-commit --execute` Step 5: under a counting goal, print the plan with a `[GOAL_COMMIT]`
  record (goal as a hash, never its text) instead of asking; every validation and every judgement
  prompt stays; never `--ai-co-author`
- Every other approval or confirmation directive in the skill names the same exception (tech spec
  § 3.5 lists today's: frontmatter, workflow diagram, Step 1a, Step 4 grouping confirmation,
  § Prohibited, § Examples)
- A `## Goal Commit` heading in the `git-workflow-project.md` scaffold, set by a bare `on` or `off`
  line under it, and its row in § Project Customization
- Register #4, the `git-workflow.md` grant block, § Efficacy Boundary and CLAUDE.md /
  CLAUDE.template.md rule 4 name the credential and its scope; every pin is re-recorded in this change

## Scope

| Scope | Description |
| ----- | ----------- |
| In    | Rule text, the Step 5 branch, the setting, Anchor edits and pins, tests |
| Out   | Goal-mode push or `/deploy-flow` |

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

- [x] With a user-typed `/goal` active on a feature branch and all required planes `pass`, the rule text sends `/smart-commit --execute` to execution with no approval question and a `[GOAL_COMMIT]` record
- [x] Each fallback condition keeps the ordinary approval: a goal the model set without the user's approval; a goal met, judged impossible, cleared by `/goal clear` or by an error, or superseded; a set notice lost to `/clear` or compaction; a protected branch the user has not allowed (a declined allowance included) or a detached HEAD; an open gate; `## Goal Commit` set to `off` (the heading, then a bare `off` line under it)
- [x] The `[GOAL_COMMIT]` record carries a hash of the goal, never its text; every approval or confirmation directive in `skills/smart-commit/SKILL.md` (search: approval, confirm, ask) names the goal exception, so the goal path meets no question outside the judgement prompts
- [x] The goal path still commits through `smart-commit-execute.sh commit`: a message with an AI trailer exits 4 and nothing is committed; `--ai-co-author` is never passed
- [x] On a protected branch the first goal-mode commit recommends a feature branch, and only after the user declines asks to allow the branch; a yes covers later commits of that goal on that branch
- [x] Push and `/deploy-flow` still require their own per-use approvals under an active goal
- [x] Register #4, the grant block, § Efficacy Boundary and rule 4 carry the credential, and their pins are re-recorded in the same change

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | Conditions 1–2 are behaviour-layer (no hook input carries the goal); 3–4 became `review-state.js goal-commit`. The record hashes with `git hash-object --stdin`, a tool the skill already grants |
| Development | Done  | `goal-commit` subcommand; `## Goal Commit` setting; § Proactive Offer "Goal mode" with precedence over the menu; grant line, Register #4, § Efficacy Boundary and both rule 4 lines; every approval/confirmation directive in `/smart-commit` names the exception |
| Testing    | Done   | `test/scripts/review-state.test.js` +3 goal-commit cases; `test/scripts/smart-commit.test.js` pins each directive's exception; grant, Efficacy and Register pins re-recorded; `npm test` 4932/4932; `/precommit` ✅ PASS |
| Acceptance | Done   | Codex thorough review ✅ Ready (menu precedence, hash agreement, the remaining plan-confirmation lines); `--verify-ac` 2026-09-25: 7/7 Complete; AC 2, 5 and 6 at Medium — the § 6 rule-text contract tests had never been written. Added the same day as `test/rules/goal-mode.test.js` (every § 3.5 clause, with a per-clause negative control). Condition 2 was also refined at the user's direction: a compaction alone no longer reads as no goal, because Claude Code re-injects the goal record after it; the latest goal record decides. Hence Candidate Complete until a re-verification |