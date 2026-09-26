# Rules Residency — Feasibility Study: Trigger Reliability and Override Contract Placement

> **Doc role**: Design record (point in time, 2026-09-25)
> **Requirements**: [1-requirements.md](./1-requirements.md) § 9 (two open solution questions) · **Tech spec**: [2-tech-spec.md](./2-tech-spec.md) § 3.3, § 3.4
> Method: `/feasibility-study` — independent analysis, then a three-round adversarial debate with
> Codex (thread `01a0d6ba-7f31-7471-8751-9600c5610e30`), reaching equilibrium on both questions.

## 1. Problem Essence

### 1.1 Surface Requirement

Two questions the requirements left open once the maintainer decisions of 2026-09-25 were recorded:

| # | Question |
|---|----------|
| Q1 | When the push-authorization, review-loop and scope contracts leave the always-loaded layer, is a resident one-line semantic trigger plus skill loading enough for an ad-hoc session that never invokes a skill, or does each dangerous act need a mechanical carrier? |
| Q2 | The `*-project.md` precedence prose (~8k characters across three parent rules) must stay correct while the user-owned override files stay resident and untouched. Can that prose load only when those files are read or edited? |

### 1.2 Underlying Problem

| Why | Answer |
|-----|--------|
| Why move contracts out? | The plugin-managed resident set is 78,369 characters and must reach ≤ 50,000 (FR-3); the two largest blocks are push-credential reasoning that only an actor about to push needs |
| Why is the ad-hoc session the hard case? | A skill can be made to load its references (pinned by `test/rules/contract-routing.test.js`); a session acting through Bash or Edit has no such step, so the contract must be reached by something the session does anyway |
| Why is override placement different? | The override files are user-owned and resident by construction; the plugin cannot move or edit them, so only the *resolution rules* can move, and a consumer may apply a resident setting without ever opening the file |
| Core problem | Each moved contract needs a route that fires before the governed act, in every session shape, and fails closed when the contract is missing (FR-5, FR-6) |

### 1.3 Success Criteria

- Every moved contract has one canonical file and a route from each session shape it governs. A contract that governs a skill's action lives with that skill, so it is reachable wherever the skill is. A contract consulted with no skill involved — the override resolution contract — must also be present when rules are installed without the plugin, because `/install-rules` promises that state. What the plugin-free state loses for skill-governed contracts is stated as a consequence in § 7, not hidden.
- A missing contract stops the governed action (FR-6), demonstrated by a test that removes the file — including a no-skill session.
- The plugin-managed resident text stays ≤ 50,000 characters after the routes are added.
- No user-owned `*-project.md` byte changes; existing links from those files into the parent rules keep resolving.

## 2. Constraints

| Type | Constraint | Source | Flexibility |
|------|------------|--------|-------------|
| Technical | Claude Code hooks: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse and other events can return `hookSpecificOutput.additionalContext`. A PreToolUse context is added **alongside the tool result**, so Claude reads it on the next model request — after the call has run. Only a denial acts before the call: `permissionDecision: "deny"` (its reason is fed back) or exit 2 (stderr is the reason). A timed-out command hook, or a non-2 non-zero exit, does not block | code.claude.com/docs/en/hooks (checked 2026-09-25) | None |
| Technical | Path-scoped rules (`paths:` frontmatter) load when Claude **reads** a matching file (Read tool counts); not at launch unless `@`-imported; inert under this checkout's root `rules/` | code.claude.com memory.md; `test/rules/path-scoped-rules.test.js` | None |
| Technical | `/install-rules` copies `rules/*.md` into `.claude/rules/` and promises use "without plugin loaded"; it does not copy `skills/*/references/` | `skills/install-rules/SKILL.md` | Low |
| Business | Anchor Register items stay resident with unchanged meaning; approved migrations still keep a one-line rule resident | `rules/discretion.md`; maintainer 2026-09-25 | None |
| Business | User-owned `*-project.md` never modified; 16 shipped settings + one section replacement (`## Test Pyramid`) must keep resolving | FR-4; `rules/*-project.md` | None |
| Compat | Existing test pins: `override-contract.test.js`, `contract-routing.test.js`, `path-scoped-rules.test.js`, `discretion-tiers.test.js` are re-pointed, not weakened | tech spec § 3.6 | Low |
| Resource | The dev checkout must load the same resident set as a rendered install before the canary (tech spec task 3) | tech spec § 6 | Low |

## 3. Existing Capability Inventory

### 3.1 Related Modules

- `hooks/hooks.json` — SessionStart, UserPromptSubmit, PreToolUse (Edit/Write, Bash), PostToolUse (Edit, Skill), Stop. Every hook is a reminder; none blocks except the two narrow PreToolUse guards.
- `hooks/pre-bash-codex-launch-guard.sh` — the precedent for a PreToolUse Bash guard that inspects a command shape and denies with a reason; it documents its own missed forms (`bash -c`, `eval`, substitution) and its fail-open without `jq`/Node.
- `scripts/review-state.js check` — prints the `[AUTO_LOOP_STATE]` fact line with `intent_hint=` derived from dirty paths; tech spec task 5 extends it with `procedure_hint=`. Its `overrideSetting` reads `## Offer Mode` and **returns the default when the override file is unreadable** (fail-open; see § 8).
- Code that reads override values: `scripts/review-state.js` (`## Offer Mode`, `## Goal Commit`), `scripts/protected-branches.sh` and `scripts/pre-push-gate.sh` (`## Protected Branches`), `scripts/lib/fc-doc-currency.js` (a heuristic read of `auto-loop-project.md`). Each parses its own named slot, and none needs the resolution prose. `scripts/lib/review-dispatch.js` reads nothing: it is a no-I/O decision function, and the review workflow reads `## Review Thread Rotation` behaviourally and passes the threshold in.
- Mechanical carriers for dangerous git acts: `smart-commit-execute.sh` (always, inside the skill), `commit-msg-guard.sh` and `pre-push-gate.sh` (opt-in git hooks).
- `test/rules/contract-routing.test.js` — registry of on-demand contracts (`scope-contract`, `codex-invocation-contract`, `loop-diagnostics`); forward check (every citation resolves) and backward check (every contract is reachable from an activation source). Accepts `rules/*.md` and `skills/*/references/*.md` citations.

### 3.2 Design Patterns

- **Two-carrier**: resident semantic rule + independent mechanical or workflow carrier (tech spec § 3.4).
- **Read-before-dispatch, stop if unreadable**: `rules/codex-invocation.md` already states "a skill that cannot read it does not dispatch" — the exact FR-6 shape for one contract today.
- **Fail-closed resolvers**: `scripts/protected-branches.sh` reads an unreadable or invalid override as *protected*.

### 3.3 Tech Debt

- `review-state.js overrideSetting` is fail-open for an unreadable `git-workflow-project.md` (a user's `Offer Mode: off` reads as `on`).
- Before this study, tech spec § 3.3 said hooks "never diagnose, classify, or block", which conflicted with FR-6 for any hook-based carrier; § 3.3 now permits a denial on a mechanical fact (§ 7).
- Eight `rules/*.md` files already point into `skills/`, so the "without plugin loaded" promise is already partial; a new dependency of that kind is avoidable but not unprecedented.

## 4. Possible Solutions

### Q1 — carriers for contracts that leave residency

| Option | Core idea | Covers | Principal gap |
|--------|-----------|--------|---------------|
| Q1-A Keep the full contracts resident | Nothing moves | Every session | Cannot reach ≤ 50,000; the failure the migration exists to fix |
| Q1-B Resident trigger + skill loading only | One-line trigger names the situation; skills Read their references | Skill workflows; ad-hoc work if the model follows the trigger | The trigger and the Read are behavioural; a citation alone loads nothing |
| Q1-C Resident trigger → **first-step Read** → refuse on failure, plus `procedure_hint` | The trigger names the exact file and says "Read it; if the Read fails, stop"; skills make that Read their first step (pinned by routing tests); hooks add fact-conditioned hints | Skill and ad-hoc sessions; fail-closed on a missing file | Still behavioural for "skipped the Read while the file exists"; nothing mechanical can close that without changing what a gate verdict is |
| Q1-D Q1-C + PreToolUse(Bash) git-mutation guard | A hook denies a recognised `git push/commit/rebase/reset --hard/stash` command with a reason naming the contract and the workflow | Recognisable ad-hoc git commands before execution | Text matching has blind spots; crash/timeout is fail-open; cannot see the one-use user-message authorization Register #4 allows, so blanket denial breaks a lawful path |
| Q1-G PreToolUse / PostToolUse `additionalContext` on a recognised git command | A hook injects a pointer to the contract instead of denying | Recognisable git commands | The context arrives alongside the tool result, i.e. after the act; it can remind, never precede. Adds nothing Q1-D does not, before the act |
| Q1-E Path-scoped rules for git contracts | `paths:` rule loads the contract | — | Paths key on files; a push touches no file. Not applicable |
| Q1-F Mechanical gate-closing preflight for reviews | `note pass` requires a validated report artifact | Gate closing | Reverses part of hook-lightweighting; the slot is a model self-note by design (`auto-loop.md` § Enforcement). A separate feature, not a residency task |

**Assessment**

| Dimension | Q1-B | Q1-C | Q1-D |
|-----------|:----:|:----:|:----:|
| Technical feasibility | 🟢 | 🟢 existing pattern (`codex-invocation.md`) | 🟡 guard precedent exists but the parser surface is larger |
| Effort | 🟢 < 1 d | 🟢 1–2 d (trigger table + routing registry + FR-6 tests) | 🟡 3–5 d (guard, both-direction tests, canary protocol) |
| Risk | 🔴 silent failure in no-skill sessions | 🟡 residual behavioural gap, stated | 🟡 fail-open on crash; may block user-authorized execution |
| Extensibility | 🟢 | 🟢 one registry row per contract | 🟡 every new dangerous command extends the parser |
| Maintenance | 🟢 | 🟢 | 🟡 |

### Q2 — where the override resolution prose lives

| Option | Core idea | Failure mode |
|--------|-----------|--------------|
| Q2-A Keep all three sections resident | No change | Keeps ~6,081 resident characters (`testing.md` is already path-scoped, so its 1,916 cost nothing at launch) |
| Q2-B Prose inside the user files | — | Violates FR-4; strands installed copies |
| Q2-C Path-scoped companion rule only | Loads on Read of an override file | Fires for authoring, not for applying an already-resident setting; inert under this checkout's root `rules/` |
| Q2-D Skill reference only (`skills/install-rules/references/`) | One canonical file cited by skills | Absent in the "rules installed without the plugin" state that `/install-rules` promises; an ad-hoc edit loads nothing |
| Q2-E Conditional SessionStart injection | Hook detects active overrides and injects the prose | Active overrides make the prose launch context again; detection and hook failures |
| Q2-F **Resident core stub + one canonical path-scoped `rules/override-contract.md`** | Each parent keeps its heading as a live stub carrying the compact core and a pointer; the tables live once, in a path-scoped rule `/install-rules` installs beside the user files; `/install-rules` and `/claude-health` cite it; the dev checkout reaches it through the stubs' explicit Read | Ordinary runtime consumers need the *value* and the *core*, never the tables; the tables load on authoring, audit, or genuine ambiguity |
| Q2-G Mechanical parser for every setting | Code reads all 16 settings | Cannot resolve section replacements or Anchor conflicts; over-scoped |

**Assessment**

| Dimension | Q2-A | Q2-C | Q2-D | Q2-F |
|-----------|:----:|:----:|:----:|:----:|
| Technical feasibility | 🟢 | 🟢 | 🟢 | 🟢 |
| Effort | 🟢 0 | 🟢 1 d | 🟢 1 d | 🟡 2–3 d (stubs, contract, registry row, `/install-rules` and `/project-setup` lists, re-pointed `override-contract.test.js`) |
| Risk | 🟢 | 🟡 misses use-time | 🔴 missing without plugin | 🟢 |
| Resident saving | 0 | ~6.1k | ~6.1k | ~5.5k (core stubs cost ~0.6k) |
| Maintenance | 🟡 three copies of the same rule shape | 🟢 | 🟢 | 🟢 one canonical table |

## 5. Codex In-Depth Discussion Record

### 5.1 Discussion Process Summary

| Round | Topic | Codex key viewpoint |
|-------|-------|---------------------|
| 0 | Independent research (fresh thread, metadata only) | A one-line trigger plus skill loading is insufficient for no-skill sessions; proposed action-boundary preflights that verify the reference is readable, plus a PreToolUse git guard; for overrides, "load on Read" is too late because settings are applied without opening the file — proposed resident core + canonical on-demand contract with an explicit load edge from every consumer. Flagged the § 3.3/FR-6 conflict and the `overrideSetting` fail-open |
| 1 | Claude attacked: readable ≠ read (Declaring ≠ Executing); load edge from every consumer is residency by another name; review-side preflight is not implementable under hook-lightweighting; the guard is fail-open on crash | Codex withdrew the readability preflight ("the workflow's first operation should be Read the exact contract; if the Read fails, stop"), withdrew the gate-closing preflight, downgraded the guard to optional hardening with a high bar, and conceded the per-consumer load edge. New attacks: keep heading stubs for user-file links; the core must carry the known-heading list to detect unknown headings; not every shipped heading is a setting (`## Test Pyramid`); keep exactly one canonical table |
| 2 | Claude accepted all three; proposed canonical file under `skills/install-rules/references/` with a tiny path-scoped pointer, and deferring the guard to a post-5.0 measured change | Codex objected to the skill-reference location: `/install-rules` promises use without the plugin and copies only `rules/*.md`, so the pointer would lead to an absent file. Preferred `rules/override-contract.md`. Agreed the guard is not a kernel-change prerequisite; objected to reusing § 6's canary schema for the guard experiment (population and provenance differ). Measured 16 shipped settings |
| 3 | Claude accepted `rules/override-contract.md` and a separate post-5.0 measurement protocol; final equilibrium check | "Q1: at equilibrium. Q2: at equilibrium. No further attacks." — **Nash equilibrium reached on both questions** |

### 5.2 Solution Directions Suggested by Codex

- Make the contract Read the **first executable step** of every governed workflow, mirroring `rules/codex-invocation.md`.
- Keep the three parent headings as live stubs so installed user-owned files keep resolving.
- Put the canonical override table in an installed rule, not a skill reference, to honour the "without plugin loaded" promise.
- Test FR-6 as a real missing-contract workflow, including a no-skill session, and describe the result as behaviour demonstrated, never a hook guarantee.

### 5.3 Risks and Issues Identified by Codex

- Tech spec § 3.3 "hooks never block" conflicts with FR-6 — a spec decision, now taken (§ 7).
- `review-state.js overrideSetting` is fail-open for an unreadable override.
- PreToolUse command hooks are fail-open on crash and timeout, so a guard can only ever be a tripwire.
- A generic git guard cannot see the one-use user-message authorization the Anchor Register allows.
- `contracts_activated[]` in the § 6 canary is a reported field, not evidence of a successful Read.

### 5.4 Differences from Claude's Analysis

| Viewpoint | Claude | Codex | Adopted |
|-----------|--------|-------|---------|
| Fail-closed mechanism | First-step Read in the instruction | Runtime readability preflight → withdrew | First-step Read |
| Git guard | Optional hardening | Initially part of the carrier set → optional, separately measured | Optional, post-5.0, own protocol |
| Override tables at use time | Value + compact core suffices | Load edge from every consumer → conceded | Value + core; tables on authoring/audit |
| Canonical override file | `skills/install-rules/references/` + path-scoped pointer | `rules/override-contract.md`, installed | `rules/override-contract.md` |
| Heading stubs in parents | Not in the first draft | Required for user-file links | Kept |

### 5.5 Integrated Conclusion

Both questions resolve to a compact resident rule that names the exact file and the fail-closed behaviour, plus one canonical on-demand contract reached by the actor that needs it. Whether that meets the tech spec § 3.4 two-carrier principle — a resident rule **and a behaviourally independent carrier** — depends on who acts:

| Actor | Resident carrier | Independent carrier | Two-carrier? |
|-------|------------------|---------------------|--------------|
| A git-mutating skill (`/smart-commit`, `/push-ci`, `/epic-merge`, `/gh-stack`, `/deploy-flow`) | Anchor Register #4 + one-line trigger | The workflow-loaded exact contract, pinned by routing tests, plus `smart-commit-execute.sh` where it applies | Yes |
| A review skill | Terminal completion invariant + trigger | The workflow-loaded review-loop and scope contracts | Yes |
| An ad-hoc git mutation — lawful only as a user-authorized execution (Register #4) | Anchor Register #4 + trigger | The opt-in `commit-msg-guard.sh` / `pre-push-gate.sh` **where installed**; the first-step Read is behavioural | **Only where the opt-in hooks are installed** |

The third row is an explicit exception, recorded rather than claimed away: where the opt-in git hooks are not installed, an ad-hoc user-authorized execution has the resident Anchor rule and a behavioural Read, not an independent carrier. That is the same state as 4.7 for everything except the moved detail, and it is the gap Q1-D is the candidate to close after 5.0. The tech spec § 3.4 records the same exception. The detection a PreToolUse `additionalContext` could add (Q1-G) arrives after the act, so it does not change this row.

## 6. Solution Comparison

| Dimension | Q1-C (recommended) | Q1-D | Q2-F (recommended) | Q2-A |
|-----------|:-----------------:|:----:|:------------------:|:----:|
| Technical feasibility | 🟢 | 🟡 | 🟢 | 🟢 |
| Effort | 1–2 d | 3–5 d | 2–3 d | 0 |
| Risk | 🟡 stated residual | 🟡 | 🟢 | 🟢 |
| Extensibility | 🟢 | 🟡 | 🟢 | 🟡 |
| Maintenance cost | 🟢 | 🟡 | 🟢 | 🟡 |
| Resident saving toward ≤ 50,000 | enables the ~17.6k Anchor-block move | 0 | ~5.5k | 0 |

## 7. Recommendation

**Q1 → Q1-C.** Resident Anchor + precise action trigger → first-step Read of the named contract → refusal when the Read fails, with fact-based `procedure_hint` as assistance. The PreToolUse git guard (Q1-D) is optional hardening in a separately measured post-5.0 change with its own collection protocol. Tech spec § 3.3 is reworded: hooks may deny a recognisable action on mechanical facts (a missing required contract) and return a reason naming the contract and the route, but never diagnose, classify, or grant git authorization.

**Q2 → Q2-F.** Each parent rule keeps its override heading as a live stub carrying the compact core — Anchor-first; the closed list of 16 shipped settings and the one section replacement; an exact parent heading is a replacement; an unknown heading fails closed to Default and is reported; user files are never edited — and pointing to the single canonical `rules/override-contract.md`, a path-scoped rule `/install-rules` installs beside the user-owned files and `contract-routing.test.js` registers.

**Consequence for installs without the plugin.** `/install-rules` copies `rules/*.md` only. In that state no git-mutating skill exists, so the only lawful git mutation is a user-authorized execution, and the push authorization contract under `skills/push-ci/references/` is absent. Under Q1-C the trigger's Read then fails and the push stops (FR-6). In 4.7 the same detail was resident, so this is a behaviour change for plugin-free installs: fail-closed, never silently permissive. Q2-F does not have this consequence, because the override contract is installed with the rules. Whether `/install-rules` should also copy the authorization contract is § 8's second question, and the 5.0 migration guide (task 9) states the outcome either way.

**Backup**: Q2-A (keep the prose resident) if the 50,000 target is met without it; Q1-D ahead of 5.0 only if the canary's hard metrics show an ad-hoc governed action taken without its contract.

## 8. Open Questions

- [x] File a request for the `review-state.js overrideSetting` fail-open (unreadable `git-workflow-project.md` → defaults, so `Offer Mode: off` reads as `on`), with a regression test; independent of this migration. Filed 2026-09-25 as [requests/2026-09-25-override-setting-fail-closed.md](./requests/2026-09-25-override-setting-fail-closed.md) (tech spec task 10), fixed on this branch.
- [x] Plugin-free installs (§ 7 consequence): should `/install-rules` also install the push authorization contract where the trigger can find it, or does 5.0 accept that a user-authorized push stops there? Decided 2026-09-25: not handled; the migration guide states it (tech spec task 9 (f)).
- [ ] Exact wording of the resident compact core and its character cost (target ≤ ~0.6k across the three stubs), measured in task 3.
- [x] Plan how `/project-setup`'s fixed rule list, installation counts and `path-scoped-rules.test.js` gain the new rule, and how the installed placement stays un-`@`-imported. Planning decided 2026-09-25: assigned to tech spec task 1; the implementation lands with that task.
- [ ] The post-5.0 git-guard experiment: population, operational definition of "governed action without a preceding successful Read", and targeted no-skill cases.

## 9. Next Steps

- Already folded into `2-tech-spec.md` with this study: § 3.2 (the trigger table's Read-first rule), § 3.3 (the reworded hook clause), § 3.4 (the override contract row and the recorded two-carrier exception).
- `/tech-spec` — the remaining work: § 5 (task 1 gains `rules/override-contract.md`; task 2 gains the FR-6 missing-contract tests), § 6 (the no-skill FR-6 test).
- Mark the two § 9 items in `1-requirements.md` decided, pointing here.
