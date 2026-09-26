# Auto-Loop Rule ⚠️ CRITICAL

**Terminal completion invariant** — the one rule everything else serves: *work on a change may be declared complete only when every gate its change class requires has passed after the last edit in that gate's change class* — a doc edit re-opens the doc gate, not the code gates, and vice versa (freshness is tracked per plane; a post-precommit Doc Sync therefore does not re-open code review). For code that is an independent review (`/codex-review-fast` — the reviewer researches on its own, per @rules/codex-invocation.md) and then `/precommit`; for `.md` docs it is `/codex-review-doc`. When to run them, how to batch edits, and how deep to review are yours to judge — the invariant constrains the end state, not the choreography. Hooks are **reminders** (§ Enforcement): read the `[AUTO_LOOP_STATE]` facts they print and own the decision. Corollaries, so they are not re-derived: Declaring ≠ Executing (naming a gate is not running it), Summary ≠ Completion (a report does not close an open gate), Fixing ≠ Verifying (re-running the review is the evidence — Self-assessment is not evidence).

## Review Dispatch

**One reviewer — Codex — everywhere by default.** `/codex-review-fast` and `/codex-review-doc` must not launch a secondary. Opt-in dual: `/codex-review-branch --dual` only, off unless the flag is passed. Loop re-review: `--continue` re-dispatches Codex on the same thread. Cycle reset: any code edit invalidates prior verdicts — the reviewer must re-run regardless of prior pass status.

**`codex_fail` (adapter exit 1 only) → a contract-aware fallback reviewer carries the gate**; a pending or unknown completion keeps the gate open and dispatches nothing. Record `[REVIEWER_FALLBACK] plane=<plane> from=codex to=<agent> reason=<quota|timeout|error> | <ISO8601>` — **sticky per change**. Decide via `scripts/lib/review-dispatch.js`; adopt fail-closed via `scripts/validate-family-sentinel.js <contract>`, **never translated across contracts**. A validated fallback verdict is a real gate verdict, noted as usual — noting one no dispatched reviewer produced is forging. Every carrier exhausted: **no validated verdict exists** — plan emits `[PLAN_REVIEW_DEGRADED]` only; the rest emit nothing — and `⚠️ Need Human` surfaces. **necessity-audit is excluded from both fallback and rotation in v1**; `seek-verdict` stays non-gate. **Thread rotation**: after 3 replies on one thread (R-a — `auto-loop-project.md` `## Review Thread Rotation` overrides, 2–6) or a judged context overrun (R-b), re-review opens a fresh first-dispatch thread and records `[THREAD_ROTATED]`.

The trigger and `reason=` rules, carriers, the rotation procedure and its reconciliation are `skills/codex-code-review/references/review-common.md` § Degradation Matrix and § Review Loop. Read it before a fallback dispatch or a rotation; if that Read fails, dispatch no fallback and rotate nothing — keep the gate open and report the failed Read.

**Agent defaults**: every agent in `agents/` declares `model: opus` and `effort: high` — a review at a silently lower tier would still read like a passing one. Pinned by `test/agents/frontmatter.test.js`; change the default there and in this line together.

## Tiers

The configured tier (`auto-loop-project.md ## Tier`, unset → `standard`) is a **baseline, not a ceiling**: choose the effective tier from the change's semantics, escalating above the baseline when warranted, never dropping below it. A security or data-integrity change is treated as `thorough` whatever is configured — escalate, and say that you did.

| Tier | Use for | Blocks on | Round cap |
|------|---------|-----------|-----------|
| `fast` | Docs, comments, config, small low-risk edits | P0 | 6 |
| `standard` **(default)** | Ordinary features and bug fixes | P0, P1 | 15 |
| `thorough` | Security, data integrity, releases, public API | P0, P1, P2 | 30 |

The caps are a deliberately loose runaway backstop. An explicit `## Max Rounds` (3–50) in `auto-loop-project.md` overrides the tier's cap. Count review rounds yourself; the state slot's `rounds` (`review-state.js check --format=json`) counts failed verdicts since the last pass — a floor, never the whole story. At the cap → § Stall Detection and Diagnosis. Architecture-level changes, feature removal, or the user asking to stop exit to ⛔ Need Human at any point. **80 is a passing grade.** When the remaining findings are all below the tier's blocking severity, the correct move is `/precommit`, not another round.

Gate sequence: review Ready (no blocking findings) → `/precommit`; precommit Pass → Adequacy Gate → Doc Sync; a precommit failure is fixed and re-run. Adequacy Gate: when a request doc with `## Acceptance Criteria` maps to the change, run `/codex-test-review --ac-trace <request-path>`; mode from `testing-project.md ## Adequacy Mode` (advisory by default). Doc Sync: sync the **current-authority** docs, append status/outcome to the **records** (never rewritten to mirror later code); review them all in **one** `/codex-review-doc` dispatch, with reading depth and batching from `scripts/resolve-review-profile.js`.

## Stall Detection and Diagnosis

A cap cannot tell a converging loop from a churning one; a stall can. A **stall round** closes none of the outstanding findings, counted by finding identity; **3** consecutive stall rounds is the signal to stop fixing and diagnose. On that signal, at the round cap, or at the round-10 checkpoint: diagnose, make **one bounded adjustment** declared before it is made, and return to the loop. Security and data-integrity changes skip the protocol: any trigger → ⚠️ Need Human. The same change hitting the cap a **second** time → ⚠️ Need Human, no second diagnosis. A **fourth** stall on the same change → ⚠️ Need Human, no fourth diagnosis. Never re-try an adjustment recorded as failed.

→ `skills/codex-code-review/references/loop-diagnostics.md` — streak rules, stall memory, the closed class table, the bounded directions and the banking sequence. Read it before diagnosing. If that Read fails, make no diagnosis and no
adjustment — report the trigger and the failed Read, and take ⚠️ Need Human.

## Fix Obligation

Every **owed** in-scope blocking finding is fixed — "unrelated", "pre-existing", "no impact" and
"later" are not reasons. Owed means `fix_obligation=mandatory` at or above the tier's blocking
severity, or `admitted` at any severity; in-scope includes `uncertain`. An out-of-scope critical
finding (P0 / security / data-integrity) routes to human exit E1, never into a repo-wide sweep. Fix
the root cause when you find it, and every exception leaves a record — none is "I decided it didn't
matter". The exception table, what a fix must explain, and the precedence rules are
`skills/codex-code-review/references/scope-contract.md` § Fix Obligation: Read it before deferring
or excepting a blocking finding; if that Read fails, defer and except nothing and decide no fix
obligation — report that the contract could not be read, and leave the gate open until it can be.

## Sub-Threshold Findings

| Tier | Blocking | Sub-threshold |
|------|----------|---------------|
| `fast` | P0 | P1, P2, Nit |
| `standard` | P0, P1 | P2, Nit |
| `thorough` | P0, P1, P2 | Nit |

On `✅ Ready` with only sub-threshold findings: log them and proceed. No extra fix pass, no extra re-review. The record is `[NIT_DEFERRED] file:line | issue | reason: sub-threshold-<severity> | <ISO8601>` at column 0 — a **reporting convention**: nothing parses or persists it. Two are fixed on the spot instead: a one-line fix in a file already open, and a sub-threshold finding that is really a security or data-integrity defect (escalate that one to `thorough` and say so). Either is an edit like any other — the plane is re-reviewed at the new digest before any pass is noted.

## Gate Sentinels (behaviour-layer, emit verbatim)

A paraphrased sentinel reads as no verdict, and a stray one reads as a forged verdict.

| Sentinel | Context |
|----------|---------|
| `✅ Ready` / `⛔ Blocked` | Code review |
| `✅ Mergeable` / `⛔ Needs revision` | Doc review |
| `## Overall: ✅ PASS` / `## Overall: ⛔ FAIL` / `## Overall: ❌ FAIL` / `## Overall: ⚠️ NO CHECKS RUN` | Precommit — emitted by the runner at column 0, exactly one `## Overall:` line per report |
| `✅ Plan Ready` / `⛔ Plan Blocked` / `⚠️ Plan Needs Human` / `[PLAN_REVIEW_DEGRADED]` / `[PLAN_REVIEW_SKIPPED]` | Plan review (under a `## Plan Review` header; plan output never contains a bare `✅ Ready`, `✅ Mergeable`, `## Gate:` or bare `⛔ Blocked`) |

`✅ All Pass` is prose for "every gate passed", not the precommit sentinel. `⚠️ Need Human` is behaviour-layer only.

## Override Contract

`rules/auto-loop-project.md` (user-owned) customizes this file — **Default and Guidance tiers only**. Anchor-tier instructions (`rules/discretion.md` § Anchor Register) are never overridable: on conflict the Anchor wins and the conflict is reported. Resolution is **Anchor-first** — a tier annotation in either file cannot downgrade a Register hit. Its shipped headings are **settings** read by name: `## Tier`, `## Max Rounds`, `## Plan Review`, `## Plan Review Max Rounds`, `## Git Memory`, `## Think Harder`, `## Review Thread Rotation` and `## Codex Profile`. A heading that restates one of this file's own `##` headings exactly is a **section replacement**; any other heading fails closed to **Default** and is reported. The user's file is never edited.

Before interpreting, auditing or editing an override, Read `override-contract.md` in the same directory as this rule — `.claude/rules/override-contract.md` in an installed project, `rules/override-contract.md` in the plugin source. If that Read fails, do not edit or audit the override.

## Enforcement

There is none — by design (hook-lightweighting, 2026-08-13). Hooks are **reminders** over one state slot per plane (`code_review`, `doc_review`, `precommit`) outside the repo. After the reviewer ran, record its verdict with `node scripts/review-state.js note <plane> <pass|fail>` (the precommit runner notes its own). The verdict is the reviewer's report — one never noted still stands, it just keeps its reminder alive; the note binds the verdict to the current tree digest, so an edit re-opens its plane's reminder. Nothing blocks: the honest way to silence a reminder is to run the gate and note the verdict — noting without running is forging one. Escape hatch: `HOOK_BYPASS=1`. Context capacity never overrides an open gate (@rules/context-management.md). Mechanics: `docs/features/hook-lightweighting/2-tech-spec.md` §3. Overrides: @rules/auto-loop-project.md.
