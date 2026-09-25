# Rules Residency — Technical Spec

> **Current behavior authority**: Yes
> **Doc role**: Current authority
> **Requirements**: [1-requirements.md](./1-requirements.md) · **Feasibility**: [0-feasibility-study.md](./0-feasibility-study.md) § 7 (trigger carriers and override placement, decided 2026-09-25; folded into § 3.2–§ 3.4 below) · **Intent**: [intent-rules-residency.md](./intent-rules-residency.md)

> Restructure the rules layer around **residency**: a budgeted resident activation kernel,
> on-demand canonical contracts, mechanical carriers for exact-and-dangerous behaviour, and an
> enforced growth budget. Policy is not weakened anywhere; what changes is where each piece lives.
> Origin: `/codex-brainstorm` Nash equilibrium, 2026-08-29 (3 rounds, 7 valid attacks, converged).

## 1. Requirement Summary

- **Problem**: `CLAUDE.md` + `rules/*.md` load resident into every session — 1,106 lines /
  97,826 bytes ≈ 24–28K tokens, an estimated 150–300 discrete directives. External measurement
  (IFScale, arXiv 2507.11538) shows frontier-model adherence degrading from ~10–15 simultaneous
  instructions with strong primacy bias; context-rot studies show near-duplicate restatements act
  as distractors. Locally, high-priority concepts are restated 3–4× across files, and doc review
  has repeatedly caught the restatements contradicting each other. Compaction alone is refuted by
  history: the 2026-07-30 tier rewrite cut the layer to 767 lines and it regrew +339 within
  24 days, because incident knowledge defaults into resident prose.
- **Goals**: (1) plugin-managed resident surface (§ 3.5 — user-owned `*-project.md` excluded)
  ≤ 50,000 characters on a rendered fresh install (maintainer decision 2026-09-25; v4.7.0
  measures 78,369), plus a line ceiling fixed in task 4, test-pinned; (2) every Anchor and gate
  invariant preserved with zero policy weakening;
  (3) detailed procedures reachable on demand from ad-hoc sessions, not only via skills;
  (4) a placement rule that stops regrowth; (5) canary shows behavioural non-inferiority before
  5.0.0 is released (§ 6).
- **Scope**: `CLAUDE.md`, `rules/*.md`, the skills that gain reference files, hook fact-line
  output, and the tests that pin rules prose. Out of scope: any change to what the anchors
  prohibit, the gate semantics, or `pre-push-gate.sh` / guard scripts themselves.

## 2. Existing State Analysis

Measured 2026-08-29 on `main` (6bbc589):

| Component | Lines | Bytes | Notes |
|---|---:|---:|---|
| `CLAUDE.md` | 74 | 7,944 | restates anchors, gates, sub-threshold rules |
| `rules/auto-loop.md` | 133 | 20,000 | invariant + dispatch + rotation + stall + caps + overrides + enforcement |
| `rules/scope-discipline.md` | 193 | 12,844 | full contract incl. field normalization, breaker counters |
| `rules/discretion.md` | 70 | 10,919 | tiers + Anchor Register + contains a pinned § Efficacy Boundary whose long paragraph is 3,702 chars (whole pinned section: 4,268) |
| `rules/git-workflow.md` | 25 | 8,835 | one 7,493-char push-safety line |
| 12 other rules files | 611 | 37,284 | mixed anchor/procedure/style content |
| **Total resident** | **1,106** | **97,826** | ≈ 24–28K tokens per session |

Consumer analysis (distinct referencing files in `skills/ scripts/ test/ hooks/`): strongly wired —
`auto-loop.md` (49), `git-workflow.md` (27), `testing.md` (26), `security.md` (20); weakly wired —
`context-management.md` (3), `scope-discipline.md` (3), `fix-all-issues.md` (1); unwired —
`framework.md` (0), `self-improvement.md` (0). "Referenced by tests" mostly means *prose pinned*,
not *behaviour enforced*; the dangerous operations already have mechanical carriers (push/commit
guards, digest-bound review state, sentinel validators).

Counter-evidence, recorded so the spec does not overclaim: in a very long real session
(2026-08-27..29) anchors were never violated and gates never skipped — the local failure is not
noncompliance but the certain token tax, drift between restatements, and unbounded regrowth.

## 3. Technical Solution

### 3.1 Architecture

```mermaid
flowchart TD
    K["Resident activation kernel\n≤50,000 chars ∧ line ceiling, digest-pinned"] --> K1["Anchors first (primacy)\n+ terminal completion + gate invariants"]
    U["User-owned *-project.md without paths:\nresident as-is, outside the kernel budget"]
    UP["User-owned path-scoped *-project.md\nloads on matching file reads, not resident"]
    K --> K3["Codex-independence core (4 lines)"]
    K --> K4["Semantic trigger table\nsituation → contract"]
    K4 -->|ad-hoc work| C["On-demand canonical contracts\nskills/*/references/"]
    S["Skills"] -->|tested reference edges| C
    H["Hooks"] -->|"fact-conditioned procedure_hint\n(reminders; § 3.3)"| C
    H -.->|"deny on a mechanical fact only\n(required contract missing; never a verdict)"| C
    C --> C1["review-loop / stall / cap diagnostics"]
    C --> C2["scope contract (fields, breaker, dispositions)"]
    C --> C3["push authorization topology"]
    C --> C4["testing & AC evidence"]
    C --> C5["documentation mechanics"]
    M["Mechanical carriers"] --> M1["push/commit guards · sentinel validators\ndigest-bound review state · checkers"]
    G["Growth control"] --> G1["dual budget test\n+ residency manifest\n+ default placement = on-demand"]
```

### 3.2 Resident kernel content (the whole of it)

Ordered for primacy. Target ≤ 50,000 characters across the rendered `CLAUDE.md` + surviving
plugin-managed `rules/*.md` (every `*-project.md` excluded — see item 7):

1. **Anchor Register + tier system** (`discretion.md`, compacted to ~40–50 lines): three tiers,
   closed register, `[DEVIATION]` syntax, proposal channel. § Efficacy Boundary is replaced by a
   compact semantic rule + pointer to the push authorization contract (**Anchor-level change —
   approved by the maintainer 2026-09-25; lands with coordinated test updates**).
2. **Auto-loop core** (~70–90 lines): terminal completion invariant, per-plane freshness, gate
   sequence, tier table + blocking thresholds, sentinel vocabulary, sub-threshold rule, human-exit
   summary, "hooks are reminders". Dispatch/fallback/rotation/stall/cap/override mechanics move
   out.
3. **Git/security anchors** (compact): prohibited mutations, the enumerated approval workflows
   and their exact operations, no bare force, protected branches, no secrets, attribution
   whitelist. The 7,493-char topology matrix (`git-workflow.md` § Push safety) and the
   § Proactive Offer / Goal mode procedure move to the push authorization contract (Anchor-level,
   same approval); the resident core keeps a one-line rule for each.
4. **Codex-independence core** (~4 lines, resident as high-priority Default): first dispatch —
   metadata only, mandate exploration, never feed conclusions or diff; same-thread reply may carry
   the new diff but never the interpretation; rotation restores the first-dispatch rule.
5. **Scope guard** (~15–25 lines): frozen baseline, one-hop/branch-introduced scope, uncertainty
   fails closed, no repo-wide helper sweeps, out-of-scope critical → human exit.
6. **Semantic trigger table** — the ad-hoc activation kernel:

| Situation observed | Read first — stop the governed action if the Read fails |
|---|---|
| First or rotated Codex dispatch | independent-dispatch contract |
| First review report, or any blocking verdict | review-loop contract |
| Finding/edit outside frozen baseline; uncertain scope | scope contract |
| Repeated failed rounds; no-progress evidence | stall-diagnosis contract |
| Git mutation intent | push/git authorization contract |
| Test or AC work | testing contract |
| Feature-document work | documentation contract |
| Interpreting, auditing or editing a `*-project.md` override | override resolution contract (`rules/override-contract.md`) |

Each row names its canonical file in the residency manifest. The instruction is an actual Read of
that file as the first step, and a failed Read stops the governed action (FR-6) — the shape
`rules/codex-invocation.md` already uses for the Codex prompt contract ([0-feasibility-study.md](./0-feasibility-study.md)
§ 7, Q1-C). Skills make the same Read their first step, pinned by routing tests.

**7.** **User-owned project settings are not kernel content.** The `*-project.md` files are the
plugin user's customization space. The migration never modifies, strips or re-heads any of them.
Those without `paths:` frontmatter (`auto-loop-project.md`, `git-workflow-project.md`) load at
launch exactly as the user left them; they count toward the total resident measure but never
toward the plugin-managed budget. A path-scoped one (`testing-project.md`) loads only when a
matching file is read and is outside every resident measure — in a **rendered install**, where
`CLAUDE.template.md` never `@`-imports it (pinned by `test/rules/path-scoped-rules.test.js`).
This repository's own `CLAUDE.md` still `@`-imports it today (rule 5 and the § Rules list), along
with the three other path-scoped rules `testing.md`, `docs-writing.md` and `docs-numbering.md`, so
here all four are resident until task 3 removes every such import; the canary in § 6 measures the
candidate only after that removal ([1-requirements.md](./1-requirements.md) FR-4, § 7).

### 3.3 Three-path activation

1. **Resident triggers** (table above) — primary path for ad-hoc sessions; the model recognizes
   situations hooks cannot (baseline membership, finding identity, semantic progress).
2. **Skills** — each mutating/reviewing skill lists its required contracts; routing tests pin the
   skill→contract edges.
3. **Hooks** — `[AUTO_LOOP_STATE]` gains an optional `procedure_hint=<contract,…>` field derived
   from mechanical facts only (e.g. `rounds≥3` → review-loop,stall). A hook may **deny** a
   recognisable tool call on a mechanical fact — a required contract file missing — with a reason
   naming the contract and the route to retry. Hooks never diagnose, classify, interpret a verdict
   or grant git authorization, and `rounds` remains a floor, not a semantic stall verdict. A
   denial is a bounded refusal, not a guarantee: a timed-out or crashing command hook does not
   block (Claude Code hooks reference). A PreToolUse git-mutation guard is optional hardening for
   a separately measured post-5.0 change, not part of the kernel change
   ([0-feasibility-study.md](./0-feasibility-study.md) § 7).

### 3.4 Two-carrier principle and destinations

Every critical policy = one compact resident semantic rule + one behaviourally independent carrier
(mechanical guard or workflow-loaded exact contract). No third resident paraphrase. One recorded
exception: an ad-hoc git mutation — lawful only as a user-authorized execution — has the resident
Anchor rule and a behavioural Read, and an independent carrier only where the opt-in
`commit-msg-guard.sh` / `pre-push-gate.sh` hooks are installed ([0-feasibility-study.md](./0-feasibility-study.md)
§ 5.5). Moves:

| Content | Destination |
|---|---|
| Review fallback, rotation, stall/cap diagnostics | `skills/codex-code-review/references/` |
| Override resolution tables (`auto-loop.md` § Override Contract, `testing.md` and `git-workflow.md` § Project Customization) | `rules/override-contract.md`, one canonical path-scoped rule (`paths: [".claude/rules/*-project.md"]`) that `/install-rules` installs beside the user-owned files. Each parent keeps its heading as a live stub with the compact core — Anchor-first; the closed list of 16 shipped settings and the one section replacement; an exact parent heading is a replacement; an unknown heading fails closed to Default and is reported; user files are never edited — and a Read pointer, so links from installed `*-project.md` files keep resolving |
| Push authorization topology (the 7,493-char line + Efficacy narrative) and the § Proactive Offer / Goal mode procedure | `skills/push-ci/references/authorization-contract.md`, loaded by every git-mutating skill (§ 6) |
| Scope field normalization, gate derivation, breaker counters, dispositions | `skills/codex-code-review/references/scope-contract.md` |
| Test pyramid/naming/evidence caps (non-anchor rows) | `skills/test-review/references/` + feature/bug skills |
| Doc numbering/splitting/comment mechanics | document skills' references |
| Context thresholds, lesson-log format | on-demand references |
| Historical rationale and measurements | `docs/features/…` records |

Not moved: anything inside a `*-project.md`, including its comments and customization guidance.
Those files are user-owned and outside this migration (§ 3.2 item 7).

Cut/merge: `framework.md` deleted (0 consumers); `fix-all-issues.md` merged into auto-loop core +
scope contract; duplicate anchor restatements in `CLAUDE.md` reduced to the single early summary.

### 3.5 Growth control

- **Dual budget test**: the plugin-managed resident set (the rendered `CLAUDE.md` template +
  transitively imported plugin rules without `paths:`, excluding every `*-project.md`) ≤ 50,000
  characters, measured on a rendered fresh install, AND ≤ a physical-line ceiling that task 4
  fixes from the landed kernel. The user-owned resident set (the `*-project.md` files
  without `paths:`) is reported separately and never rejected; the total is reported alongside
  both, and a path-scoped override is in none of the three
  ([1-requirements.md](./1-requirements.md) § 7). The 50,000 target is the maintainer's
  2026-09-25 decision (requirements § 9).
- **Placement rule** (resident, one paragraph): new policy lands on-demand by default; promotion
  to residency requires either pre-activation necessity (needed before task type is knowable) or
  an irreversible/security/attribution/secret/gate-supremacy failure mode that cannot wait for a
  reference load. Over-budget additions must displace or compress. A genuinely new Anchor takes a
  human-approved exception (budget must not outrank safety).
- **Residency manifest**: per resident block — owner, tier, pre-activation justification,
  canonical detail reference, line/character contribution, mechanical carrier if any.
  Test-verified.

### 3.6 Test policy for the migrated layer

Adversarial observation from the 2026-08-28 review session, unpersisted as a standalone experiment
record: claim-keyed semantic tests were the failure class — paraphrase-plus-decoy and equal-length
in-fence edits passed them — while digest pins and executable tests survived. The surviving
artifacts (`test/skills/create-request-scan.test.js`'s header and commit `6bbc589`) record the
resulting executable-test philosophy, not the specific experiments. Task 6 **must** persist a
minimal reproduction alongside the re-pinning so this policy rests on a committed record.
Therefore:

- Compact resident kernel: **exact digest pins** per stable contract unit (small + rarely edited ⇒
  hash churn is proportionate friction, not the old chore).
- Executable claims (regexes, recipes, commands): **executable fixture tests**.
- Claim-keyed semantic assertions: supplemental diagnostics only, never the authorizing guard.
- Every guard ships with a negative control (reversed contract + plausible decoy must fail).
- Existing pinned Anchors (`discretion-tiers.test.js` et al.) stay unchanged until task 3 lands
  the approved Anchor migration (approved 2026-09-25); compaction and re-pinning land as one
  reviewed specification change.

## 4. Risks and Dependencies

| Risk | Mitigation |
|---|---|
| Trigger recognition is itself semantic — a degraded session may miss its own cue | Path redundancy: skills and hook hints activate the same contracts independently |
| On-demand contract not loaded before an ad-hoc dangerous act | Anchors + mutation prohibitions stay resident; mechanical guards are load-independent |
| Copied-not-moved content → split-brain contracts | Each contract has exactly one canonical file; skills/rules point, never restate; manifest + routing tests pin the edges |
| Removing duplicate restatements loses reinforcement | Two-carrier: resident semantics + independent mechanical/workflow carrier beats three prose copies |
| Budget gamed by dense lines or unreadable compression | Dual line+character ceiling; review still rejects clarity-damaging wording |
| Anchor-level compaction (discretion § Efficacy, git-workflow § Push safety and § Proactive Offer / Goal mode) mis-migrated | Maintainer approval granted 2026-09-25 for all three; single reviewed change; old and new text diffed side-by-side; pinned tests updated in the same commit |
| Local benefit unproven | Canary is a **non-inferiority** test (§ 6); certain token/drift costs mean a null result favours the slim layer |

Dependencies: maintainer approval for the Anchor-level migrations (granted 2026-09-25 for
§ Push safety, § Efficacy Boundary and § Proactive Offer / Goal mode); `review-state.js` hook
output extension for `procedure_hint`.

## 5. Work Breakdown

| # | Task | Size | Depends on |
|---|---|---|---|
| 1 | Create canonical on-demand contracts (move, don't copy): push authorization, scope, review-loop/stall, testing, docs, and `rules/override-contract.md` (§ 3.4) — path-scoped, picked up by `/install-rules`' `*.md` enumeration (it is not a `*-project.md`, so the managed-set exclusion does not apply), added to `/project-setup`'s fixed rule list, covered by `path-scoped-rules.test.js` including a check that nothing `@`-imports it; the three parent override headings become stubs carrying the compact core and a Read pointer; `override-contract.test.js` is re-pointed to the canonical file with every check it has today | M | — |
| 2 | Point skills at contracts: each governed workflow's **first step Reads its contract and stops when the Read fails** (§ 3.2); register every contract in `contract-routing.test.js` with its activation sources, including the override contract and its three stubs; add FR-6 tests that remove a contract and show the governed workflow refuses | M | 1 |
| 3 | Compact resident kernel: rewrite `CLAUDE.md`, `auto-loop.md`, `discretion.md`, `git-workflow.md`, `security.md`, scope guard; add trigger table; carry the temporary canary-staging duty as a manifest-marked temporary block; delete `framework.md`, merge `fix-all-issues.md`; remove every `@` import of a path-scoped rule from this repository's own `CLAUDE.md` — today `testing.md`, `testing-project.md`, `docs-writing.md` and `docs-numbering.md`, in rule 5 and in the § Rules list — so the dev checkout loads the same resident set as the rendered template, with a test that pins `CLAUDE.md` the way `path-scoped-rules.test.js` pins the template | L | 1, 2 (Anchor-migration approval granted 2026-09-25) |
| 4 | Dual-budget test + residency manifest + placement rule | S | 3 |
| 5 | Hook `procedure_hint` (fact-conditioned only) | S | 1 |
| 6 | Re-pin: digest pins on compact kernel, executable tests, retire big prose pins; **persist the minimal adversarial reproduction** (§ 3.6) | M | 3 |
| 7 | ~~Strip `*-project.md` scaffolds to live values; move tutorials to `/install-rules`~~ — **withdrawn** 2026-09-25: `*-project.md` files are user-owned and never modified ([1-requirements.md](./1-requirements.md) FR-4) | — | — |
| 8a | Install the temporary staging duty on the **current** layer (own gated change: one resident line naming the duty + staging path), then log 20 baseline changes | M | — |
| 8b | Land the prepared kernel change | — | 3–6, 8a |
| 8c | Candidate cohort + decision per § 6; then freeze/import candidate records and **remove the staging duty** in a separately gated, non-cohort cleanup change | M | 8b |
| 9 | `CHANGELOG.md` 5.0.0 entry with a migration guide, following the 3.0.0 precedent: (a) a 4.x → 5.0 comparison — what left residency and where each piece now lives; (b) no `*-project.md` edit is required; (c) the model line — 5.0 recommends Claude Opus 5.5 or later; (d) the 3.0 line is marked deprecated, suitable only for models before Claude Opus 4.8, and the 3.0.0 historical section keeps that mark; (e) **delivery** — `CHANGELOG.md` is today outside the npm package (`package.json` `files`) and unread by `.github/workflows/release.yml`, which builds the release body from commit subjects, so the task also adds `CHANGELOG.md` to `files` and makes the workflow append the 5.0.0 migration section (or a link to it) to the generated release body, verified by `npm pack --dry-run` listing the file and the published release page carrying the guide; (f) **installs without the plugin** — rules copied by `/install-rules` with the plugin not loaded get no push authorization contract, so a user-authorized push there stops at the trigger's failed Read (FR-6). Maintainer decision 2026-09-25: this case is not handled beyond stating it in the guide | S | 8c reads ship |
| 10 | Make `review-state.js` `overrideSetting` fail closed: a selected override file that cannot be read answers each setting's most restrictive value (`Offer Mode` → `off`, `Goal Commit` → `off`) instead of the default, matching `protected-branches.sh` for that case. `review-state.js` also treats an override whose existence cannot be decided (an `lstat` error other than `ENOENT`/`ENOTDIR`) the same way; the shell guards do not — their `[ -e ] \|\| [ -L ]` test reads that case as absent, and fixing them is deferred as a mechanical-guard change. `protectedStatus`'s fallback shares the same selection; regression test in both directions ([request](./requests/2026-09-25-override-setting-fail-closed.md)). Independent of the migration; lands on this branch (maintainer decision 2026-09-25) | S | — |

Suggested tickets: one per row 1–2 (movement), one covering 3–4+6 (the kernel change, single
reviewed unit), one for 5, one for 8, one for 9, one for 10. 5.0.0 is released only after 8c reads
ship and task 9 lands.

## 6. Testing Strategy

- **Mechanical**: dual-budget test; manifest completeness test; routing tests (every git-mutating
  skill loads the authorization contract; every review skill loads loop+scope+dispatch contracts;
  doc/test skills load theirs); digest pins on kernel units; executable fixture tests for every
  executable claim; negative controls per guard.
- **Fail-closed contracts (FR-6)**: per governed workflow, a test removes the contract and shows
  the workflow refuses before acting; `override-contract.test.js` keeps its live-text, Anchor
  supremacy, mapping and unknown-heading checks against the canonical file. The no-skill case —
  an ad-hoc session that meets a trigger with the contract missing — is **demonstrated** with a
  headless `claude -p` probe in an isolated repository, the way instruction-budget measured
  path-scoped loading, and reported as behaviour observed, never as a guarantee a hook supplies.
- **Canary (non-inferiority)** — executable protocol:
  - **Metrics artifact — two stages, so recording cannot invalidate what it records.** A record
    written into the repo at change close would move the code-plane digest (`tree-digest.js`
    classifies non-`.md` paths as code) and reopen the very gates the record just measured.
    Instead: (1) **staging** — at each change's close, append the record to an out-of-tree
    append-only log at `~/.cache/sd0x-dev-flow/state/<repo-key>/canary-staging.jsonl` (the same
    directory as review-state, which the tool resolves the same way; no digest impact), through
    `scripts/dev/canary-stage.js record`, which refuses a second record for one change id and
    any log it cannot vouch for — a line that is not exactly the nine-field record it writes, a
    blank line, a repeated change id, or a last record without its newline. Shape is what it can
    check; it cannot tell who wrote a well-formed line. The measured change's gates and rounds are
    those noted **before** the record is staged. (2) **import** — when a cohort completes, copy
    the frozen records into the committed `docs/features/rules-residency/canary-log.jsonl` as one
    separate, non-cohort change with its own gates (two imports total: baseline, candidate).
    Record schema: `{date, change_id, review_rounds, scope_expansions, deviations,
    contracts_activated[], resident_chars, resident_tokens, hard_incidents[]}` — `resident_chars`
    is measured by the script (the checkout's always-loaded set, `instruction-budget.js`
    accounting); `resident_tokens` is recorded only when measured and is `null` otherwise, so an
    estimate never stands in for a measurement. Staging is a behaviour-layer duty with an
    explicit lifecycle: installed on the current layer by task 8a (its own gated change, before
    any baseline change is counted), carried into the candidate kernel by task 3 as a
    manifest-marked **temporary** block, and removed by task 8c's separately gated cleanup change
    after the decision. An early hard rollback still imports the frozen partial candidate records
    before cleanup — evidence survives the rollback. `review-state.js` is a single-slot overwrite store
    and git history does not recover session boundaries, so **no retrospective baseline exists** —
    the baseline is prospective.
  - **Baseline cohort (task 8a, BEFORE the kernel change)**: the next **20** completed changes on
    the current layer that run at least one review gate (read-only sessions excluded), logged to
    the artifact. The kernel change does not land until the baseline is complete — no fallback
    thresholds; an absent baseline blocks, it is not substituted.
  - **Candidate cohort (task 8c, AFTER)**: the next **20** qualifying completed changes, same
    artifact, same schema.
  - **Hard metrics (gated on occurrence — any → rollback)**: anchor violations; gates declared
    passed without a noted fresh verdict; destructive-git or AI-attribution incidents.
  - **Soft metrics (non-inferiority, margin +20% vs. baseline mean, per completed change)**:
    review rounds; scope-expansion incidents; `[DEVIATION]` count.
  - **Certain gain (measured, not gated)**: resident tokens per session. The character budget
    shrinks ≈ 36% (plugin-managed share 78,369 → ≤ 50,000); the token saving is measured
    separately and may differ.
  - **Attribution (fixed map, no operator judgment)**: review-rounds breach → roll back the
    review-loop contract to residency; scope-expansion breach → the scope contract; deviations
    breach, a multi-metric breach, or any ambiguity → **whole-kernel rollback**. The
    `contracts_activated` field exists to audit the map, not to replace it.
  - **Decision table (in precedence order)**: (1) any hard incident → immediate whole-kernel
    rollback, **regardless of cohort size** — zero tolerance takes precedence over every other
    rule here. (2) Soft metric exceeds margin → extend candidate cohort by 10 once; still
    exceeding → apply the attribution map. (3) Otherwise → ship. Underpowered (<20 qualifying
    changes in 30 days, either cohort) → extend window; an underpowered **soft-metric** read
    never ships and never rolls back — hard incidents remain immediate whatever the count.
  - **Release gate** (maintainer decision 2026-09-25): the canary gates 5.0.0. The candidate
    cohort runs in this repository on the landed kernel before any release; 5.0.0 is released
    only when the decision table reads ship. A rollback or an underpowered read holds the release.

## 7. Open Questions

1. **Anchor-level approvals** (blocking): compaction of `discretion.md` § Efficacy Boundary and
   `git-workflow.md`'s push-safety line into the push authorization contract — maintainer must
   approve the migration and the replacement wording before task 3. **Migration approved
   2026-09-25** for § Push safety, § Efficacy Boundary and § Proactive Offer / Goal mode; the
   replacement wording still goes to the maintainer inside task 3's reviewed change.
2. ~~Exact byte ceiling: 40,000 is ~10K tokens by heuristic; confirm or tune after task 3 lands.~~
   **Resolved 2026-09-25**: the target is ≤ 50,000 characters of plugin-managed resident text on a
   rendered fresh install (§ 3.5); task 4 fixes the paired line ceiling from the landed kernel.
3. `procedure_hint` shape: extend `[AUTO_LOOP_STATE]` line vs. second fact line — decide in task 5.
4. Whether `docs-numbering.md`'s mechanical taxonomy half stays resident for `doc-classifier.js`
   parity, or moves with the rest — decide during task 1 by checking what the classifier reads.
5. ~~Installs without the plugin: install the push authorization contract with the rules?~~
   **Resolved 2026-09-25**: not handled. A user-authorized push there stops at the failed Read;
   task 9 (f) states it in the migration guide.
6. Exact wording and character cost of the compact override core in the three stubs (target
   ≤ ~0.6k together) — measured in task 3.
