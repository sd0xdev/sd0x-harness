# R8 — Task autonomy: task start, automatic commit, goal publish

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-11-16
> **Status**: In Progress
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 3.6
> **Intent**: [intent-git-autonomy.md](../intent-git-autonomy.md) — § Re-decision 2026-11-16
> **Depends On**: [R7](./2026-09-24-git-autonomy-r7.md)

## Background

The user asked (2026-11-16) for three changes: smart-commit runs the review loop and commits on its
own without a goal; a goal also pushes, opens the PR and watches CI without menus, stating the risk;
and every task that changes artifacts offers, once, to open a Jira Task and branch from it (base
`main`) when Jira is connected. Two of these add Register #4 credentials, so this is a `thorough`
Anchor change; the user's request is the decision, and the pins move in the same change.

## Requirements

Batch A — tasks and automatic commit:

- Policy with explicit settings, the user's one-time decision, a fresh-install marker and a legacy
  fallback; upgrades never widen (the marker was replaced in review round 2 — see Progress)
- A per-worktree task record: identity, baseline, declared ownership, lifecycle
- The automatic commit: every gate first, the mechanical check, the whole verified tree, a content
  re-check after the commit
- The Jira entry by runtime capability with one question per task; the branch from fetched `main`

Batch B — goal publish:

- A plain push of the task branch under a user-set goal and the adopted policy, with remote readback
- `--defer-watch`, so the PR exists before CI is read
- A Draft PR, created or reused idempotently, never downgrading a ready PR or overwriting an edited
  body
- CI judged by runs for the pushed OID; a task-caused failure is fixed and republished under the
  loop's stall rules

## Acceptance Criteria

- [x] A non-goal task, policy adopted: every gate passes → committed with no menu and no push
      (`task-autonomy.test.js` commit-check / committed)
- [x] Read-only work, a dirty or staged baseline, an undeclared path, a sensitive file, a stale
      digest or a subset → no automatic commit (`commitCheck` reasons; CLI fixtures)
- [x] A write between the check and the commit is caught and the task marked unverified; publish
      refuses it
- [x] Goal publish: only a clean, verified, non-protected task branch with something ahead
      (`publishCheck`); push-ci refuses force, protected, multi-destination and receivepack
- [x] Jira: no question without the capability or a successful access read; operation-name routing
      survives a renamed server; plan carries every field; a secret blocks the create; an unclear
      create reads back and never repeats (`jira-entry.test.js`)
- [x] Branch from freshly fetched `main` (or `## Base Branch`), `--no-track`; dirty, existing,
      unfetchable and missing bases refuse
- [x] CI readback: pending, failed, skipped, zero runs, an old SHA, a moved head or base, a closed
      PR and a missing required check are never a pass (`ci-readback.test.js`)
- [x] Legacy without evidence; adoption recorded once; an explicit `off` wins
- [x] Register #4, the grant block, § Efficacy Boundary, rule 4, the contracts and every pin agree
- [ ] Pass /codex-review-fast
- [ ] Pass /precommit
- [ ] Pass /codex-review-doc

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | PM design (2026-11-16) after a two-model discussion |
| Development | Done | Batches A and B |
| Testing | In Progress | Review round 2 (2026-11-16): the fresh-install marker in `.sd0x/install-state.json` was dropped from the precedence — a tracked file would adopt for every clone — and replaced by the installing user's own recorded decision (`policy-decide --if-pending`), kept outside the repository and shared by its worktrees |
| Acceptance | In Progress | 2026-11-16. Codex was unavailable (refresh token expired, adapter exit 1), so fallback carriers held the gates: code review `strict-reviewer` — round 1 ⛔ Blocked (a P1: goal publish could carry a reused branch's earlier unreviewed commit; P2s: a narrower sensitive list, no recorded PR base, adoption kept per worktree, a tracked fresh-install marker adopting for clones), round 2 ⛔ Blocked (a P2: a fresh init could overwrite a recorded `declined`; spec drift), round 3 ✅ Ready; four Nits deferred. Adequacy (ac-trace, `contract-neutral-reviewer`): Adequate, gaps none; its two coverage notes were closed with tests. A test-only change then reopened the gate: a rotated `strict-reviewer` thread found a P1 (an override `on`/`draft` in the tracked file granted the credentials over the user's own decision — now narrow-only) and a P2 (required checks never supplied and matched by workflow name — now read from `gh pr checks --required` by job name, plus a confirming second read), then ✅ Ready. `/precommit` ✅ PASS at that digest. Doc review (two batches, `contract-neutral-reviewer`): round 1 ⛔ Needs revision (the spec's risk table and push-ci's Prohibited/Verification lines lagged R8), round 2 ✅ Mergeable for both |

## References

- Contract: `skills/push-ci/references/authorization-contract.md` § Task autonomy
- Procedure: `skills/smart-commit/references/task-contract.md`
