# R3 — `/push-ci` model-invocable and repeatable

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Pending
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

- [ ] `push-ci` frontmatter carries no `disable-model-invocation`, asserted by a test
- [ ] The "no exceptions" pin still passes unchanged
- [ ] § Authorization names `/deploy-flow` as a column and the run-script boundary; "All Other Skills" note excludes it
- [ ] Two model invocations in one session on a branch with new commits each run Phase 0/1 and ask their own approval (walkthrough recorded in Progress)
- [ ] `SKILL_DIGEST` re-recorded after the full-diff review; `npm test` green

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | -      |      |
| Development | -     |      |
| Testing    | -      |      |
| Acceptance | -      |      |
