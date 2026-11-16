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

### PM acceptance R2 (2026-11-16)

After Draft PR #31 (CI green at `ce367bf`), the PM's acceptance review found four gaps, fixed in one
follow-up:

- **Verified tree.** `commit-check` stored per-path blobs read *after* the digest the gates passed
  at, and `task committed` compared only those paths, so a rewrite during the check — or an added
  path, a deleted clean path or a mode change after it — could be recorded as verified. Reproduced
  with a clean filter that rewrites the file while the check hashes it. Now the check stores only
  the digest from its single tree read, and `task committed` digests the whole committed tree
  (`digestOfRev`) and requires equality (`tree-mismatch` otherwise).
- **Confirming read.** `ci-readback.js` accepted a confirmation 41 s old. A read now returns
  `next_confirm` (`{ ids, at }`), and the classifier itself refuses a missing, malformed,
  mismatched, future or under-a-minute confirmation, on its own clock.
- **Current authority.** `git-workflow.md` § Push safety, the `push-ci` header and its L2 table, and
  the override scaffold now say the same thing about Goal publish: the user's active goal under the
  mode they adopted replaces the per-use question for a plain non-protected publish, and an empty
  setting means each user's own decision.
- **Evidence.** PR body and handoff restated with the final test, CI and review results.

These edits reopened the code and doc gates, so the earlier passes above do not cover them. Re-run
on the follow-up, results recorded after each round finished:

- Code review (`strict-reviewer`, same thread): ✅ Ready on the fixes, then ✅ Ready again after
  the doc-driven pin moves in three test files.
- `/precommit` at that final code tree: a first run failed only the known timing test in
  `request-status.test.js` (passes 3/3 alone; file untouched); the re-run read
  `## Overall: ✅ PASS` — 5201 tests, 5193 pass, 0 fail, 8 skipped.
- Doc review batch 1, rotated to a fresh `contract-neutral-reviewer` thread after three replies:
  ✅ Mergeable, coherence fixes, ✅ Mergeable. Batch 2: ✅ Mergeable.

### Release review (2026-11-16)

Before marking PR #31 ready, the plugin version moved 5.1.1 → 5.1.2 (`/bump-version`, patch). The
native Codex branch review could not run: two dispatches both failed with Codex's own
"refresh token has expired" error, so the code gate fell back to `strict-reviewer` with the branch
template. It found a P1 — `gh pr checks --required` lists only checks that have reported, so a
required check configured for the base but not reported yet could read as a pass — fixed by
`required_names` (the configured set, from classic protection and rulesets; unread → `unknown`,
configured but unreported → `pending`); and a P2 — smart-commit's Auto commit path calls `node`
without a `Bash(node:*)` grant — fixed.

Results, recorded after each round finished: the re-review (`strict-reviewer`, same template) found
that the new grant broke two exact grant pins (P1) and that a partial configured-set read was not
specified as fail-closed (P2); both fixed and pinned, then ✅ Ready. `/precommit` at that code tree:
`## Overall: ✅ PASS` — 5202 tests, 5194 pass, 0 fail, 8 skipped. Doc review
(`contract-neutral-reviewer`): ✅ Mergeable twice, its `gh api` placeholder finding fixed in between.
The native Codex review then ran (thread `01a1e47c…`, after the user's Codex credentials were
refreshed): round 1 ⛔ Blocked with five P1 — the publish range read from the cached tracking ref
instead of the push destination (F1), `goal-publish` answering with a re-read HEAD (F2), runs grouped
by workflow display name (F3), the PR base re-recorded on every update (F4), and grouped commits
unable to re-check between groups (F5). Fixes: `ls-remote` against `origin`'s one push URL and one
captured HEAD the push is bound to; `workflowDatabaseId` grouping (`workflow-unidentified` →
`unknown`); the base read before the triggering event and bound with `--pr-base <oid> --for <head>`
(`base_for` must equal the pushed OID); batch progress whose every intermediate commit must set only
planned paths to their checked content (`batch-broken`, `foreign-commit`). Round 2 ⛔ Blocked: F4's
first record could already be wrong, and a reverted foreign commit could ride the batch (F6) — both
fixed as above. Round 3 ⛔ Blocked: a non-ASCII path was planned as a deletion (F7) — the plan lookup
now uses the digest's byte keys, with a task-level regression that fails on the old lookup. Round 4
✅ Ready, `gate_reason=NONE`. `/precommit` at that code tree: `## Overall: ✅ PASS` — 5211 tests,
5203 pass, 0 fail, 8 skipped.

## References

- Contract: `skills/push-ci/references/authorization-contract.md` § Task autonomy
- Procedure: `skills/smart-commit/references/task-contract.md`
