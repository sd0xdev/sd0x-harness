# R6 — Detect a custom git flow and ask once to scaffold the override

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R2](./2026-09-24-git-autonomy-r2.md), [R4](./2026-09-24-git-autonomy-r4.md)

## Background

FR-9: when a project releases its own way (a merge-based release script, a CI trigger script, a branch name the default convention rejects) and has no override, the model may ask once whether to create `git-workflow-project.md` — never create or edit it unasked.

## Requirements

- Detection signals named in `rules/git-workflow.md` (§ Project Customization or § Proactive Offer): a script under `scripts/` or CI config invoking `git merge` into a release/protected branch; a **CI trigger script** (a repo script that dispatches a pipeline, e.g. `gh workflow run` or a CI provider's trigger call) with no merge in it; a current branch name the `## Branch Naming` default rejects
- The ask is an AskUserQuestion option set (FR-16): scaffold via `/install-rules --customize git-workflow`, not now, never for this repo
- Asked at most once per session; "never for this repo" is remembered in the offer state beside `offer.json`

## Scope

| Scope | Description |
| ----- | ----------- |
| In    | Rule text, detection helper, the one-time question, tests |
| Out   | Writing the override content (the user does, or `/install-rules --customize`) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `rules/git-workflow.md` | Modify | Detection signals and the ask |
| `scripts/review-state.js` | Modify | Remembered "never" |
| `test/scripts/review-state.test.js` | Modify | Detection + once-only cases |

## Acceptance Criteria

- [x] Each signal alone yields the question in a temp repo with no override — a merge script, a pipeline-trigger script with no merge, a rejected branch name; the same repo with the override does not
- [x] The question is asked at most once per session, and "never for this repo" suppresses it across sessions
- [x] Choosing scaffold invokes `/install-rules --customize git-workflow`; nothing writes the override without that choice

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | "Once per session" needs a session id no script sees — the Stop hook passes the one in its input; "never" and each session's marker are separate files, each created atomically |
| Development | Done  | `review-state.js flow-detect` / `flow-answer never`; Stop hook `🧭` line; § Proactive Offer "Custom flow" names the question and routes Scaffold to `/install-rules --customize git-workflow --reset` |
| Testing    | Done   | `test/scripts/review-state.test.js` +9 flow cases (each signal, negatives, quoted/global-option/CI-ref targets, racing hooks, never persists); hook test with session ids; `npm test` 4928/4928; `/precommit` ✅ PASS |
| Acceptance | Done   | Codex review ✅ Ready after seven rounds on the detector (the regex matchers became one shell-word tokenizer); `--verify-ac` not yet run, hence Candidate Complete |