# R3 — `/push-ci` model-invocable and repeatable

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: In Progress
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

The only repeat-call restriction on `/push-ci` is `disable-model-invocation: true` plus the "Auto-triggering" prohibition. Maintainer approved removing it (2026-09-24); the credential is unchanged. Tech spec § 3.4.

## Requirements

- Drop `disable-model-invocation`; § Prohibited "Auto-triggering this skill" → "Pushing without this invocation's own AskUserQuestion approval"
- § Authorization block gains a `/deploy-flow` line and its table a `/deploy-flow` column (never runs `git push` itself; an opted-in run script may push outside this skill — the run-script risk, tech spec § 3.3 step 3)
- "Push REQUIRES explicit user approval via AskUserQuestion — no exceptions" stays verbatim
- Review the full skill diff, then re-record the whole-file `SKILL_DIGEST`

## Scope

| Scope | Description |
| ----- | ----------- |
| In    | `skills/push-ci/SKILL.md` frontmatter, § Authorization, § Prohibited; its test |
| Out   | `/epic-merge` and `/gh-stack` keep `disable-model-invocation`; the Register #4 entry for `/deploy-flow` (R5) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/push-ci/SKILL.md` | Modify | Invocability, Authorization, Prohibited |
| `test/skills/push-ci.test.js` | Modify | Frontmatter assertion; `SKILL_DIGEST` |

## Acceptance Criteria

- [x] `push-ci` frontmatter carries no `disable-model-invocation`, asserted by a test
- [x] The "no exceptions" pin still passes unchanged
- [x] § Authorization names `/deploy-flow` as a column and the run-script boundary; "All Other Skills" note excludes it
- [ ] Two model invocations in one session on a branch with new commits each run Phase 0/1 and ask their own approval (walkthrough recorded in Progress)
- [x] `SKILL_DIGEST` re-recorded after the full-diff review; `npm test` green

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | `/gh-stack` never carried `disable-model-invocation`, so R3 changes `/push-ci` alone; `/epic-merge` keeps the flag |
| Development | Done  | Flag removed; § Prohibited "Auto-triggering" → per-invocation approval; § Authorization block and table gain `/deploy-flow` |
| Testing    | Done   | Frontmatter test (push-ci invocable, epic-merge not); "no exceptions" pin unchanged; `SKILL_DIGEST` re-recorded after the full-diff review; `npm test` 4876/4876 |
| Acceptance | Pending | Codex thorough review ✅ Ready. The two-invocation walkthrough is still owed — it needs a branch with new commits and a real push, so it waits for the next feature-branch push. Invocation 1 of 2 (2026-09-25, branch `docs/requests-acceptance`): the model invoked `/push-ci` from an offer-menu Push selection; Phase 0 ran (new branch, `PUSH_GATE=absent`, one destination), Phase 1 showed the plan and asked its own approval, Phase 2 pushed `a2ccedb` and wrote the upstream; `/watch-ci` found no run because `ci.yml` triggers only on `main` pushes and PRs. The second invocation follows the next commit |