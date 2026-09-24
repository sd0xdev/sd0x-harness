# R4 — Menu offer for commit/push, and suggestions as options (FR-16)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Candidate Complete
> **Priority**: P0
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R1](./2026-09-24-git-autonomy-r1.md), [R2](./2026-09-24-git-autonomy-r2.md), [R3](./2026-09-24-git-autonomy-r3.md)

## Background

The root pain: after a task the model suggests `/smart-commit --execute` in prose, and on a phone the user must copy and paste it. Tech spec § 3.1 and § 3.3 (`review-state.js offer`, the menu, FR-16).

## Requirements

- `review-state.js offer [--format=json]` → `{offer, kind, reason, branch, digest, push_dropped}`; `offer-shown <digest>`; conditions per tech spec § 3.3 (required gates passed at the digest by change class; push kinds only where `protected-branches.sh` exits 1; `Offer Mode`; once per digest)
- On selection: re-run `offer`; proceed only at the same digest, branch and `kind` with the picked option still offered
- `rules/git-workflow.md` new `## Proactive Offer` (Default): the gated offer, suggestion-as-option, and "never invoke `/smart-commit --execute` or `/push-ci` unasked"
- `hooks/stop-guard.sh` prints one reminder line when `offer` is true
- `feature-dev`, `bug-fix`, `debug`, `test-deep`: replace "user must invoke `/smart-commit --execute` separately" per tech spec § 3.4; `post-dev-recap` unchanged

## Scope

| Scope | Description |
| ----- | ----------- |
| In    | Offer script, rule section, hook line, four skills' wording, tests |
| Out   | `/deploy-flow` as an option (R5 owns it); FR-15 one-word trigger (deferred) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `scripts/review-state.js` | Modify | `offer`, `offer-shown` |
| `test/scripts/review-state.test.js` | Modify | Offer cases |
| `rules/git-workflow.md` | Modify | `## Proactive Offer` |
| `hooks/stop-guard.sh` | Modify | Reminder line |
| `skills/{feature-dev,bug-fix,debug,test-deep}/SKILL.md` | Modify | Menu wording |

## Acceptance Criteria

- [x] Every `reason` value is reachable in tests, and `offer` never returns a push kind on a protected branch or for an exit-2 resolver answer
- [x] A shown menu (any selection, incl. a rejected workflow approval) silences the offer at that digest; a new gate pass at a new digest re-arms it
- [x] A selection after an edit, or after a switch to a protected branch at the same digest, is void and invokes nothing
- [x] `Offer Mode: commit-only` turns `commit+push` into a commit-only menu; `off` suppresses the offer
- [x] `grep -rn "must invoke .*/smart-commit --execute.* separately" skills/` returns nothing; the four skills state the menu rule
- [x] Walkthrough on a feature branch: gates pass → one menu → "commit and push" → `/smart-commit --execute` plan + approval → `/push-ci` plan + approval, no text typed
- [x] `stop-guard.sh` reminder line appears only when `offer` is true and never blocks

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | Offer semantics per tech spec § 3.3; review added four ahead-range cases (unknown range, reverted change, rename, merge resolution) and a single-snapshot rule |
| Development | Done  | `review-state.js offer` / `offer-shown`; `rules/git-workflow.md` § Proactive Offer; `stop-guard.sh` offer line (same timeout ladder); feature-dev, bug-fix, debug, test-deep reworded and granted `AskUserQuestion` + `Skill` |
| Testing    | Done   | `test/scripts/review-state.test.js` +14 offer cases, every `reason` reachable; stop-hook test expects the offer line then silence after `offer-shown`; `npm test` 4891/4891; `/precommit` ✅ PASS |
| Acceptance | Done   | Codex review ✅ Ready (rotated thread). Walkthrough done 2026-09-25 on `docs/requests-acceptance`: with every gate passed, `offer` returned `commit+push`; one menu (Commit and push · Commit · Not now) was answered, re-validated and recorded with `offer-shown`; `/smart-commit --execute` showed its plan and asked (commit `d246d21`), then `/push-ci` showed its plan and asked (pushed). No text was typed. An earlier pass the same day ran under an active user goal, where Goal mode committed without the menu and a push-only menu followed; this pass declined Goal mode (a stated deviation) so the AC's full path ran. `--verify-ac` 2026-09-25: 7/7 Complete; AC 3 at Medium-High and AC 6 at Medium — the `offer-shown` state, the commit 35 s later and the push reflog match this record, but the menus and approvals themselves are session facts — hence Candidate Complete |