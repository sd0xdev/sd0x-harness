# Requirements: review-coverage-visibility

> **Doc class**: Lifecycle — Phase 1 requirements (per `@rules/docs-numbering.md`). Feature-level problem-space analysis. **Not** a task tracking ticket; for per-task progress tracking see `requests/*.md` (created via `/create-request`).
> **Created**: 2026-11-25
> **Updated**: 2026-11-25
> **Tier**: standard
> **Intent**: [intent-review-coverage-visibility.md](./intent-review-coverage-visibility.md)

Baseline for every "today" statement: sd0x-dev-flow 5.2.1 at `b214212`. Statements marked **[V]** were
read in the source or exercised by an existing test; **[H]** is a hypothesis nobody has measured.

## 1. Problem Statement

Before publishing, a maintainer wants to know what review evidence applies to the code being sent.
Today they get one word, "passed", and it answers a different question: whether the automated offer
may be shown.

**What "passed" means.** `code_review` is passed when the one recorded verdict is `pass` and the
current code-plane digest equals the recorded one (`scripts/review-state.js` § `computeCheck`) **[V]**.
The digest covers the content of every code-plane file. A Fast or Full review is asked to judge the
uncommitted changes against `HEAD`, plus untracked files; it receives metadata and reads the diff itself
later (`skills/codex-code-review/SKILL.md` § Variants and § Step 1) **[V]**. So the verdict is bound to
a whole tree, while the reviewer was asked about one diff. Commits already ahead of the destination are in the tree and not in the diff.

**What the store cannot say.** A slot holds `{digest, verdict, rounds, time}` (§ `note`) **[V]**: no
variant, base, file list or commit. Two different histories therefore read identically:

| | History | Recorded | Offer |
|---|---|---|---|
| A | Commit 1 reviewed and committed; then commit 2's edits reviewed and committed | `pass` at digest D | push |
| B | Commit 1 committed with no review; then commit 2's edits reviewed and committed | `pass` at digest D | push |

(Both on an unprotected branch, every other required plane passed.) Nothing stored separates them. In A,
commit 1's own pass was overwritten by commit 2's; overwriting is the decided price of one slot (`docs/features/hook-lightweighting/2-tech-spec.md`, "Single slot means
current-tree memory") **[V]**. A is also the designed flow: a change boundary is pass → note → commit →
later edit (`docs/features/review-loop-recovery/2-tech-spec.md` § 3.4) **[V]**. So "the latest review
was not asked about commit 1" is normally true of well-reviewed work, and is not evidence of a gap.

**How far the problem reaches today [V].** It is narrower than "the tool ignores ahead commits":

| Place | Treatment of commits ahead |
|---|---|
| Push offer | Uses them to choose which planes must be passed; offers no push when the range is unknown or the branch is protected |
| Goal publish | Refuses commits the task did not make and verify (`foreign-commits`) |
| Doc review | A new plane pass needs the whole scope, commits ahead included (`skills/doc-review/SKILL.md` § Step 5) |
| Branch review | Asks for a one-line commit log and the net diff from a merge base to `HEAD`, plus uncommitted work. The range can differ from what a push publishes, and a change made and reverted inside it is not in the net diff |
| `/push-ci` plan | States a commit count relative to the local `origin/<branch>` ref when it exists, and `HEAD`; nothing about review |
| Fast / Full code review | **No statement about them** |

**The two counts differ, even with every ref fresh [V].** The offer counts from the branch's configured
upstream, else the default branch's merge base (`aheadFiles`); `/push-ci` counts from the local
`refs/remotes/origin/<branch>` when it exists, and publishes to `origin`'s effective push URL, which may
name another repository. A topic branch that tracks `origin/main` while its own remote branch is older
publishes commits the offer's range leaves out. No local count alone establishes what the destination
will receive, and calling a range "local" does not disclose that.

The gap is therefore the **code** plane, for an **interactive** push, in what the maintainer is
**told**. On a protected branch the offer never shows a push, so the `/push-ci` plan is the only
decision point there.

**Frequency and harm are unknown [H].** No field incident is claimed. Independent document-review
threads raised the gap during 5.2.1, and the owner's decision for that release was to leave the code
routing as it is.

### 5-Why Trace

1. Surface: before pushing, show what the reviews apply to.
2. Why: "gates passed" is read as "someone reviewed what I am sending".
3. Why: one verdict serves both as human evidence and as the input to automated eligibility, and only
   the second has a defined meaning.
4. Why: the slot was designed for two jobs — no duplicate review of an unchanged tree, and a visible
   round count. Publishing decisions began reading it later (git-autonomy R4–R8).
5. Root: the maintainer lacks a truthful statement — what an identified review was asked about, what
   lies outside it, what is unknown — at the moment they already stop to decide. Success is a
   better-informed owner decision, not more reviews.

### Terms

| Term | Means | Does not mean |
|---|---|---|
| **Asked about** | The change was in the requested scope of an identified review, as far as the evidence at hand shows | That the reviewer read it, or that the published content matches what was read |
| **Covered** | Asked about, **and** there is evidence that the published change matches the content the review read | — |
| **Outside** | Evidence shows the requested scope of an identified review excluded the change | That no review ever saw it |
| **Unknown** | The evidence at hand settles none of these, including after a known edit between request and report | Either of the above |

**Today's workflow produces no content-match evidence by itself [V]**: a dispatch carries metadata, the
reviewer reads later, and the digest is taken when the verdict is noted. A silent conversation proves no
match. The normal positive statement is therefore "asked about"; "covered" stays available for a case
that has the evidence, and the first slice does not need it.

## 2. Goals / Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| At a decision the maintainer already faces, say what the identified review was asked about, what published content lies outside it, and what cannot be established | Any new gate, question, reminder, hook output or automatic enforcement |
| Keep human evidence and automated eligibility as two separate statements | Changing what `note` records, what `passed` means, or any eligibility result (`offer`, `task commit-check`, `goal-publish`) |
| Say "unknown" when that is the truth | Proving what a reviewer actually read, or turning "not asked about" into "not reviewed" |
| Leave the choice to ask for another review with the owner | Requiring or recommending a review because something is outside or unknown |
| Work with what the conversation and git already hold | Coverage metadata, a ledger, per-commit or scoped verdicts (a Non-goal of `review-loop-recovery`; scope hashes and `covers:` are deferred in `doc-review-phasing` § 5 pending measured recall failure) |
| | Edits made while a review runs — a timing question, recorded in § 9 as conditional later scope |

**Keeping the current behavior is a valid outcome.** `/codex-review-branch` already lets an owner ask
about a whole branch. § 8 says which results end the feature there.

## 3. Stakeholders

| Stakeholder | Role | Key Concern |
|-------------|------|-------------|
| Maintainer about to push | User | A short, true answer; no false comfort and no false alarm |
| Maintainer of a multi-commit branch | User | Work reviewed commit by commit must not be called unreviewed |
| Model running the workflow | User | One unambiguous rule for when "asked about" and "covered" may be said; discretion over depth kept |
| Plugin maintainer | Developer | Pinned texts (`/push-ci`, note wording) and the resident budget |
| `offer`, Auto commit, Goal publish | Dependent | Their meaning must not shift |
| Reader of the PR or release | Dependent | Must not receive a coverage claim nothing supports |
| agentctl users | Dependent (optional mod) | No dependency added in either direction |

## 4. Use Cases

"Range" is what this push would publish. Every case is the code plane.

| # | Actor | Action | Expected Outcome |
|---|-------|--------|-----------------|
| UC-1 | Maintainer | Commits exactly the edits just reviewed in this conversation, nothing else ahead, then pushes | Asked about; at most one short clause, no extra step |
| UC-2 | Maintainer | Reviews only the current edits; an older commit is also ahead | Names the older commit as outside this review; its own review status is unknown unless other evidence is at hand |
| UC-3 | Maintainer | Pushes three commits, each reviewed in this conversation before it was committed | Asked about, by naming the three reviews. Without the earlier two at hand: outside the last review, status unknown — never "unreviewed" |
| UC-4 | Maintainer | Opens a new conversation, or continues after compaction, with a valid slot and no report at hand | Eligibility: as computed. Coverage: unknown |
| UC-5 | Maintainer | Has no slot, or a slot for another digest | Eligibility: gates open. Coverage: no current record; says nothing about whether a review ever happened |
| UC-6 | Maintainer | Ran a branch review whose base is not the push destination's tip | Asked about where the review's requested net change contains the published change; overlapping ranges alone are not enough. The rest: outside where the requested scope shows it excluded, otherwise unknown |
| UC-7 | Maintainer | Has no upstream, a tracking ref of unknown age, an upstream that is not where the push goes, or a push URL whose relation to the local ref is not established | The known range is labelled as what it is; coverage of the actual push is unknown |
| UC-8 | Maintainer | Pushes a commit and its revert, with only a review that was asked about the net diff | Both are published and both are outside that review; unknown if its requested scope is not at hand; asked about only if each was itself in a review's requested scope |
| UC-9 | Owner | Reads "outside" or "unknown" and pushes anyway | Nothing repeats, blocks or is recorded against them |

### Before / after

The "after" wording is illustrative: it fixes what must be distinguishable, not the phrasing or place.
All three rows assume the range is established as what the destination will receive (FR-6).

| Path | Told today [V] | Should be able to tell |
|---|---|---|
| UC-2: `a1` ahead and outside this review's scope; `b2` holds the reviewed edits | Offer line: all gates passed, push menu. `/push-ci` plan: "Commits: 2 ahead" | "Eligible: yes. This Fast review was asked about `b2`'s edits. `a1` is outside it; whether it was reviewed earlier is not known here." |
| UC-3: three commits, three reviews in this conversation | The same two lines | "Eligible: yes. Reviews in this conversation were asked about all three commits." |
| UC-4: new conversation, valid slot | The same two lines | "Eligible: yes, a pass is recorded for this content. What that review was asked about is not known here." |

## 5. Functional Requirements

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| FR-1 | When a code review result is reported, the owner can tell from it what that review was asked about — the uncommitted changes, or the net change from a named base — and that commits outside that were not part of the request | Must | The moment the fact is most certain. The workflow already records a resolved base and a frozen file list as report metadata (`skills/codex-code-review/SKILL.md` § Step 1); what the owner lacks is their meaning for the push |
| FR-2 | At an interactive push decision, the owner can tell for the range: what identified reviews were asked about, what is outside them, and what is unknown | Must | The decision the feature exists for |
| FR-3 | "Asked about" is said only of an identified review whose requested scope contained the change. "Covered" additionally needs evidence that the published change matches the content that review read; silence about edits is not such evidence. A recorded pass, shared ancestry, an overlapping range or a matching file name never suffices alone for either | Must | Prevents the false green |
| FR-4 | "Outside" names an identified review and follows only from evidence that its requested scope excluded the change; with no identified review there is no "outside". Absent, partial or lost evidence reads "unknown". "Unreviewed" is never derived from either | Must | Prevents the false alarm in history A |
| FR-5 | Eligibility and coverage are separate statements, and neither is inferred from the other | Must | The root confusion |
| FR-6 | A coverage statement about a push identifies the destination it goes to and how the counted base relates to it. Where only another range is known, that range is labelled and coverage of the push is unknown | Must | The offer, `/push-ci` and Goal publish count from different bases |
| FR-7 | The owner chooses what follows. No review is started, required or urged, and the same statement is not repeated for the same content and range | Must | The reminder-only goal, owner authority |
| FR-8 | A statement covers each commit the push publishes, not only the net difference | Should | Matches how the offer counts; a reverted commit is still published |
| FR-9 | Evidence from `precommit` is not presented as review evidence | Should | It runs the project's checks on the work tree; it is not a reading of a diff |
| FR-10 | Wording agrees with the doc plane's existing full-scope rule where the two overlap | Could | One vocabulary; the doc rule itself is not changed |
| FR-11 | Detect edits made during a review; store what a review covered; extend the doc plane's pass rule to code; add an agentctl view | Won't | Each is a separate decision with its own evidence (§ 9) |

**First slice** — FR-1 to FR-7, code plane, interactive, same conversation, no stored data. Evidence
that the conversation does not hold reads unknown; that is the expected answer, not a defect.

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Maintainability | No always-loaded text | 0 characters added in `docs/features/rules-residency/residency-manifest.json` |
| NFR-2 | Usability | Short, and quiet when there is nothing to tell | At most 3 lines; at most 1 clause in UC-1; 0 added questions |
| NFR-3 | Reliability | Correct on the frozen scenario set (§ 8) | 0 "asked about" or "covered" claims without FR-3's evidence; 0 "unreviewed" claims |
| NFR-4 | Performance | No per-turn cost | 0 hook entries, 0 added processes outside the on-demand decision points |
| NFR-5 | Reliability | Eligibility unchanged | Existing offer, commit-check and goal-publish tests pass unmodified |
| NFR-6 | Security | Statements carry paths, commit IDs and review names only | 0 diff text, credentials or remote URLs with userinfo |

## 7. Constraints & Assumptions

| Type | Description | Source |
|------|-------------|--------|
| Constraint | One slot per plane; no scoped or composable verdicts; every verdict is a whole-change verdict | `review-loop-recovery` intent, Non-goals and `INV-003` |
| Constraint | Newest verdict only, no history | `hook-lightweighting` spec, design decision 3 |
| Constraint | Hooks remind and never enforce | User statement, 2026-11-25; `rules/auto-loop.md` § Enforcement |
| Constraint | No change to auto-loop policy, thresholds or model discretion; the 5.2.1 decision on code routing stands | User statement; owner decision, 2026-11-25 |
| Constraint | `/push-ci`'s command and authorization text is pinned; a plan line authorizes nothing | `test/skills/push-ci.test.js`; Anchor Register #4 |
| Constraint | The optional mod stays optional | `mods/agentctl/README.md`; user direction |
| Assumption | The model can name what a review in this conversation was asked about, because it wrote that dispatch | Inferred; `references/codex-invocation-contract.md` requires the changed-file list |
| Constraint | Detecting edits during a review is out of scope, so without other evidence a statement reports the requested scope and leaves the content match unknown | § 9, conditional question |
| Assumption | A useful share of pushes happens in the conversation that ran the reviews **[H]** | Inferred; if false, the first slice mostly says "unknown" |
| Assumption | The reading "passed means everything I am sending was reviewed" occurs in practice **[H]** | Inferred from two reviewers; no user observed |

### Cost of being wrong

| Error | What it costs | What limits it today |
|---|---|---|
| False green: a positive statement about content no review was asked about, or "asked about" read as "covered" | Unexamined code published under a reassurance worse than today's silence | Branch review, PR review, CI, Goal publish's refusal. How often they catch it is not measured |
| False alarm: properly reviewed commits shown as a gap | Needless reviews; readers learn to skip the line | Nothing — and history A is the designed multi-commit flow |
| Today's silence | The owner must remember | Their memory, or a branch review |

**Counterexamples the feature must survive**

- History A with only commit 2's review at hand: "outside that review, earlier status unknown" is the
  strongest true statement about commit 1.
- History A in a new conversation, with only the slot: the slot identifies no review, so even "outside"
  is unsupported. The strongest true statement is "a pass is recorded for this content; its review
  scope is unknown".

## 8. Acceptance Signals

**Check before building anything.** Write today's text and the proposed text for UC-1 to UC-8 and ask
the maintainer, per case, "what do you know about review of what you would send, and what would you do next?".
Fixed beforehand: the cases, order, wording and expected answers. Recorded: answers and chosen action
only. One reader shows whether the wording can work, not how often it helps.

| Signal | Verifies |
|---|---|
| Every UC-1 to UC-8 scenario yields its expected category and no forbidden claim | FR-2 to FR-6, FR-8, NFR-3 |
| From a review report alone, a reader states what it was asked about, for Fast, Full and Branch | FR-1 |
| UC-2 and UC-3 read differently when the evidence is at hand, and UC-3 and UC-4 make no gap claim when it is not | FR-3, FR-4 |
| The same content and range are stated once; a push after "outside" or "unknown" proceeds unchanged | FR-7, UC-9 |
| A precommit pass alone never appears as review coverage | FR-9 |
| Existing eligibility tests and the residency budget pass unmodified | FR-5, NFR-1, NFR-5 |

| Result of the check | Consequence |
|---|---|
| **First, correctness**: any case is read with the wrong category, "unknown" or "outside" is read as "not reviewed", "asked about" is read as "read and matching", or a forbidden claim appears | Not a success, whatever else changed. Reword once and re-check; if it persists, stop |
| **Then, usefulness** (only with correctness met): in UC-2 or UC-4 the reader's answer about what is known is more accurate than with today's text, and UC-1 and UC-3 prompt no review the reader judges needless. Choosing the same action still counts | Proceed to a tech spec for the first slice |
| Correct, but no answer is more accurate than with today's text | Stop; keep current behavior |
| The owner says their pushes usually follow a new conversation | Stop; the first slice cannot answer them, and stored coverage is a re-decision |

After a first slice: stop and remove it if any false "asked about" or "covered" is found, or if the owner reports the
statement only prompted reviews they judged needless.

## 9. Open Questions

- [ ] **Owner**: is the push decision the right moment, or is FR-1 alone (the review report) enough?
- [ ] **Owner**: do you usually push in the conversation that ran the reviews?
- [ ] **Owner**: is "unknown" at the push decision useful to you, or only noise?
- [ ] Solution concern: which existing surface carries the statement — the review report, the offer menu, the `/push-ci` plan. The offer never shows a push on a protected branch; the plan is pinned text — suggest `/feasibility-study`
- [ ] Solution concern: whether the range should be the offer's local one or a live one — suggest `/feasibility-study`
- [ ] Solution concern: extending the doc plane's full-scope pass rule to code would answer the question at `note` time, and would leave the slot unset after ordinary Fast reviews in history B — a policy change needing the owner
- [ ] Conditional: edits made while a review runs. Re-open when one recorded pass is confirmed on content that differs from what its review read
- [ ] Adjacent, not in scope: `/precommit` and `/precommit-fast` also share one slot

## 10. References

- Source: `scripts/review-state.js` (`note`, `computeCheck`, `aheadFiles`, `computeOffer`, `publishAhead`); `scripts/lib/tree-digest.js` (`digestOfRev`); `scripts/lib/task-autonomy.js` (`publishCheck`)
- Existing tests: `test/scripts/review-state.test.js` — "offer with nothing uncommitted and nothing ahead → nothing-to-do; ahead only → push", "two ahead docs on a clean tree …"; `test/scripts/task-autonomy.test.js` — "a reused branch carrying an earlier unreviewed local commit refuses (foreign-commits)"; `test/skills/doc-review.test.js` — the targeted-pass test
- Prior decisions: [`hook-lightweighting` spec](../hook-lightweighting/2-tech-spec.md), [`review-loop-recovery` intent](../review-loop-recovery/intent-review-loop-recovery.md), [`git-autonomy` spec](../git-autonomy/2-tech-spec.md), [`doc-review-phasing` spec](../doc-review-phasing/2-tech-spec.md)
- Comparison, primary sources read 2026-11-25: [GitHub, About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) records "the state of the diff at the point when a pull request is approved"; [Gerrit, Review Labels](https://gerrit-review.googlesource.com/Documentation/config-labels.html) copies a vote to a new patch set only where a configured condition matches. Both bind an approval to a **diff**; this repository binds its verdict to a **tree**. Context only — neither is a requirement here
