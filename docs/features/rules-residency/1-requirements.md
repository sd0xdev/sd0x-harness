# Requirements: Rules Residency (v5.0)

> **Doc class**: Lifecycle — Phase 1 requirements (per `@rules/docs-numbering.md`). Feature-level problem-space analysis. **Not** a task tracking ticket; for per-task progress tracking see `requests/*.md` (created via `/create-request`).
> **Created**: 2026-09-25
> **Updated**: 2026-09-25
> **Tier**: standard
> **Tech Spec**: [2-tech-spec.md](./2-tech-spec.md)
> **Request tickets**: See [`requests/`](./requests/) for per-task execution tracking
> **Intent**: [intent-rules-residency.md](./intent-rules-residency.md)

## 1. Problem Statement

Every Claude Code session in a project that installs this plugin starts by loading the plugin's
rules and `CLAUDE.md` template in full. At v4.7.0 that always-loaded set leaves no room to grow:
the plugin's own ceiling test sits at 89,999 of 90,000 characters, and every rule change in the
v4.7 cycle had to be shortened to pass it. The volume is not the only cost — the same text is read
by the model as instructions, and most of it describes procedures that apply only when a
particular kind of work starts (pushing, reviewing, editing an override file). The rules that must
hold in every session — the Anchor Register and the gate invariants — share that space with text
that is needed rarely.

### 5-Why Trace

1. Surface: reduce the always-loaded instructions, move what can load on demand, and keep the core
   rules intact — planned for v5.0.
2. Why: the ceiling blocks any further rule change without a matching deletion, and a project's own
   instructions compete with the plugin's for the same Claude Code budget (150,000 characters
   observed in 2.1.281).
3. Why does the plugin fill the budget: detailed procedures and the reasoning behind decisions
   (measurement dates, review rounds, incident history) live in resident rule files, because new
   policy has defaulted to residency.
4. Why is that costly beyond size: instructions compete for attention — near-duplicate statements
   across files have contradicted each other in past doc reviews, and the rules that must never be
   missed are diluted by procedure.
5. Root: residency is decided by where text was first written, not by when it is needed. Success is
   a resident layer that holds exactly what must apply before the task is known, with everything
   else reachable when its situation arises — and a mechanism that keeps it that way.

## 2. Goals / Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| Lower the plugin-managed always-loaded volume enough to restore working headroom | Changing what any Anchor prohibits or authorizes, or any gate's semantics |
| Keep every Anchor Register item and gate invariant effective from the first turn of every session | Modifying, stripping or re-heading user-owned `*-project.md` files — they are the plugin user's customization space |
| Keep moved content reachable in the situations that need it, including sessions that invoke no skill | Reducing volume by deleting live information (moves only; dead text may be pruned) |
| Measure what an installed project actually loads | Tuning for models other than the current target (Claude Opus 5.5) |
| Stop the resident layer from regrowing | Changing `pre-push-gate.sh`, `commit-msg-guard.sh` or other mechanical guards |

## 3. Stakeholders

| Stakeholder | Role | Key Concern |
|-------------|------|-------------|
| Plugin users (installed projects) | User | Their own `CLAUDE.md`, rules and `*-project.md` settings keep working and keep their budget share; upgrading to 5.0 does not silently change behaviour they rely on |
| Plugin maintainer | Operator | Approves every Anchor-level move; no weakening of safety rules; the change stays reviewable |
| Claude sessions | Dependent (executor) | Must obey Anchors before loading anything; must know when to load a contract, and stop when it cannot |
| Codex and fallback reviewers | Dependent | Read the same contracts the executor reads; no split-brain between resident and on-demand copies |
| Test suite and CI | Dependent | Byte pins on Anchor text, carrier tests and routing tests move with the content they guard |
| `/claude-health`, `/install-rules`, `/project-setup` | Dependent | Report, install and render the resident set; their counts and checks follow its shape |
| Plugin developers | Developer | A clear rule for where new policy goes, and a budget signal that fails early |

## 4. Use Cases

| # | Actor | Action | Expected Outcome |
|---|-------|--------|-----------------|
| UC-1 | Claude session | Starts in an installed project and edits code | Auto-loop gates, Anchors and scope core apply without any extra load |
| UC-2 | Claude session | Is about to push, including a push the user authorized by message | Loads the push authorization rules before the push; refuses when they cannot be read |
| UC-3 | Claude session | Is about to dispatch or answer a review | Loads the review contracts that apply (dispatch, loop, scope) |
| UC-4 | Plugin user | Edits `auto-loop-project.md` or `git-workflow-project.md` | Their settings and comments are untouched by the upgrade; the override rules apply when the file is edited |
| UC-5 | Plugin user | Runs `/claude-health` | Sees the resident total and any file over budget; with FR-11, also the plugin-managed and user-owned shares |
| UC-6 | Plugin developer | Adds a new rule | With FR-8, the budget test fails if the addition makes the plugin-managed resident set exceed its limit, pointing to on-demand placement |
| UC-7 | Maintainer | Reviews an Anchor-level move | Sees the old and new text side by side and approves before it lands |

## 5. Functional Requirements

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| FR-1 | Every Anchor Register item, its exception list and the attribution whitelist remain in force from the first turn of every session, with meaning unchanged | Must | The user's stated constraint: core rules are not compromised |
| FR-2 | The terminal completion invariant, its four corollaries, gate sentinels, the sub-threshold rule and "context never overrides a gate" remain resident | Must | Gate supremacy (Register #5–#7) cannot wait for a load |
| FR-3 | The plugin-managed resident volume, measured on a rendered fresh install, falls to ≤ 50,000 characters | Must | Restores headroom; target set by the maintainer 2026-09-25 (§ 9) |
| FR-4 | User-owned `*-project.md` files are never modified by the migration; those without `paths:` are counted in the total resident measure (§ 7) but are not a reduction target | Must | They are the plugin user's customization space |
| FR-5 | Content that leaves residency has exactly one canonical home and is reachable from its triggering situation, including in sessions that invoke no skill | Must | A rule that is not loaded when needed is a rule that does not exist |
| FR-6 | When a required contract cannot be read, the action it governs does not proceed | Must | Fails closed, as the resident Codex core already does |
| FR-7 | The ceiling measurement reflects what `/project-setup` renders into an installed project | Must | The v4.7 reading overstates by about 4.3k characters |
| FR-8 | A change that grows the plugin-managed resident set beyond its limit fails a test that names on-demand placement as the remedy | Should | Prevents the regrowth recorded in the tech spec |
| FR-9 | Resident text carries no history narratives, migration-relative phrasing or register inflation that the target model does not need | Should | Dated patterns cost attention without adding constraints |
| FR-10 | Behaviour after the change is not worse than before on review rounds, deviations and hard incidents, shown before 5.0.0 is released | Must | The move must not trade safety or quality for size; the canary is a release gate (maintainer decision 2026-09-25, § 9) |
| FR-11 | `/claude-health` reports the plugin's share and the user's share of the resident total separately | Could | Lets a user see whose text is using their budget |
| FR-12 | Per-model variants of the rules | Won't | One target model per release; re-audit at the next model release |
| FR-13 | The 5.0.0 `CHANGELOG.md` entry carries a migration guide: a 4.x → 5.0 comparison of what left residency and where each piece now lives; that no `*-project.md` edit is required; that 5.0 recommends Claude Opus 5.5 or later; and that the 3.0 line is marked deprecated, suitable only for models before Claude Opus 4.8 — and the guide reaches both release channels, the npm package and the GitHub release page | Must | Installed projects see behaviour-relevant rule moves and a model line to pick from; follows the 3.0.0 precedent (maintainer decision 2026-09-25, § 9) |

Priority: Must / Should / Could / Won't (MoSCoW)

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Reliability | No Anchor violation, unrecorded gate pass, destructive-git or AI-attribution incident attributable to the change | 0 |
| NFR-2 | Maintainability | Each moved rule exists in one canonical file | 0 duplicated policy statements across resident and on-demand files (routing/carrier tests) |
| NFR-3 | Maintainability | Plugin-managed resident volume after 5.0 | ≤ 50,000 characters on a rendered fresh install |
| NFR-4 | Usability | A user upgrading from 4.7 needs no manual edit to their `*-project.md` | 0 required edits |
| NFR-5 | Reliability | Full test suite green, including byte pins re-pointed with the content | 0 failures |
| NFR-6 | Maintainability | No net information loss: every removed resident sentence is either moved or shown dead | 100% of removals accounted for in the change record |

## 7. Constraints & Assumptions

| Type | Description | Source |
|------|-------------|--------|
| Constraint | Anchor Register items, their exception lists and § Efficacy Boundary are byte-pinned; moving them is an Anchor-level change requiring maintainer approval | `rules/discretion.md`; tech spec § 7 Q1 |
| Constraint | `*-project.md` files are user-owned and outside the plugin's classification. This supersedes tech spec task 7 ("strip `*-project.md` scaffolds to live values") and the § 3.4 row that moves their tutorials; reconciling the spec is a blocking prerequisite before any 5.0 migration work starts | `rules/discretion.md` preamble; user direction 2026-09-25 |
| Constraint | Three measures, never interchanged. **Plugin-managed resident**: the rendered template plus plugin rules without `paths:`, excluding every `*-project.md` — the only measure FR-3 targets. **User-owned resident**: the `*-project.md` files without `paths:` (`auto-loop-project.md`, `git-workflow-project.md`) — reported, never targeted. **Total resident**: the sum, which is what Claude Code's limit applies to. A path-scoped override (`testing-project.md`) loads only when a matching file is read in a rendered install, whose template never `@`-imports it, so it is in none of the three, though it is still never modified; this repository's own `CLAUDE.md` imports it today, and the kernel change removes that import (tech spec task 3) | This analysis; `scripts/instruction-budget.js` "plugin share" also counts shipped override templates, so it is a different quantity |
| Constraint | Claude Code 2.1.281 loads rules without `paths:` and any `@`-imported file at launch; per-file limit and total limit are model-dependent (150,000 observed) | instruction-budget requirements § 7 (measured) |
| Constraint | Release target is v5.0.0 | User direction 2026-09-25 |
| Assumption | Current state at v4.7.0: total resident 85,673 characters = plugin-managed 78,369 (template 11,328 + plugin rules 67,041) + user-owned 7,304 (`auto-loop-project.md` 3,874 + `git-workflow-project.md` 3,430) | Measured 2026-09-25 with `scripts/instruction-budget.js` |
| Assumption | The two largest resident blocks are push-credential reasoning: § Push safety ≈ 7.8k and § Efficacy Boundary ≈ 4.6k | Measured 2026-09-25 |
| Assumption | Claude Opus 5.5 follows plainly stated rules without emphasis inflation, and plans without scripted steps | `/claude-api prompt-audit` guidance for the target model |
| Assumption | A session recognizes its triggering situations (push intent, review dispatch, override edit) reliably enough that a resident trigger plus skill loading covers ad-hoc work | Tech spec § 3.3; unverified — Open Question 4 |

## 8. Acceptance Signals

- FR-1/FR-2: a byte-pin or digest test over the resident Anchor and gate text passes, and a reviewer comparing old and new text finds no change in meaning.
- FR-3/FR-7/NFR-3: on a rendered fresh install, the plugin-managed resident measure (§ 7 — not `instruction-budget.js`'s current "plugin share", which also counts shipped override templates) is at or below the target.
- FR-4/NFR-4: `git diff v4.7.0 -- rules/*-project.md` is empty for the migration commits; an installed 4.7 project upgraded with `/install-rules` keeps its `*-project.md` bytes.
- FR-5/NFR-2: routing tests show every trigger reaches its contract, and carrier tests show each moved statement exists only in its canonical file.
- FR-6: a test removes a required contract and shows the governed action refuses.
- FR-8: adding one character beyond the limit to a plugin-managed resident rule fails the budget test; the same addition to a user-owned `*-project.md` does not.
- FR-10/NFR-1: the tech spec's canary comparison shows no hard incident and soft metrics within margin, and 5.0.0 is tagged only after it reads ship.
- FR-13: the 5.0.0 `CHANGELOG.md` entry has a migration section listing each moved block with its 4.x location and its 5.0 location, names Claude Opus 5.5 or later as the recommended models, and marks the 3.0 line deprecated for models before Claude Opus 4.8; `npm pack --dry-run` lists `CHANGELOG.md`, and the 5.0.0 GitHub release body carries the migration section or a link to it.

## 9. Open Questions

- [x] **Blocking prerequisite** — reconcile tech spec task 7 and the § 3.4 "Rule customization tutorials" row with the `*-project.md` non-goal before 5.0 migration work starts. Done 2026-09-25: task 7 withdrawn, the § 3.4 row removed, and § 3.2 item 7 and the § 3.5 budget scope now exclude every `*-project.md`
- [x] **Anchor-level moves** — may § Push safety, § Efficacy Boundary and § Proactive Offer/Goal mode leave residency behind a compact resident core? Maintainer decision (tech spec § 7 Q1). Decided 2026-09-25: all three move; the resident core keeps a one-line rule for each, and the replacement wording is still reviewed inside task 3's change
- [x] **Target** — what plugin-managed resident volume should 5.0 reach (the tech spec states ≤ 40,000 bytes for the kernel; this analysis measures characters on a rendered install)? Decided 2026-09-25: ≤ 50,000 characters on a rendered fresh install (FR-3, NFR-3)
- [x] **Canary** — is the tech spec's 20+20-change non-inferiority canary a release gate for 5.0, or a post-release check? Decided 2026-09-25: a release gate; 5.0.0 is tagged only after the candidate cohort reads ship (FR-10)
- [x] **Trigger reliability** — is a resident trigger line enough for ad-hoc push and review work, or does each need a mechanical carrier? Decided 2026-09-25 by [0-feasibility-study.md](./0-feasibility-study.md) § 7 (Q1-C): the resident trigger names the exact contract and requires a first-step Read that stops the governed action when it fails; a PreToolUse git guard is optional hardening in a separately measured post-5.0 change
- [x] **Override contract placement** — can the `*-project.md` precedence rules load only when those files are edited, given the user files themselves stay resident? Decided 2026-09-25 by [0-feasibility-study.md](./0-feasibility-study.md) § 7 (Q2-F): the parent rules keep their override headings as stubs carrying a compact resolution core, and the tables live once in a path-scoped `rules/override-contract.md` that `/install-rules` installs beside the user-owned files
- [x] **Semver** — does any 5.0 change alter an installed project's behaviour enough to need migration notes (the 3.0.0 precedent in `CHANGELOG.md`)? Decided 2026-09-25: yes; the 5.0.0 entry carries a migration guide with the 4.x → 5.0 comparison, the recommended-model line (Claude Opus 5.5 or later) and the 3.0 deprecation mark for models before Claude Opus 4.8 (FR-13)

## 10. References

- Request tickets: [`./requests/`](./requests/) — per-task execution tracking
- Tech Spec: [2-tech-spec.md](./2-tech-spec.md) — the residency architecture this analysis feeds
- Research: `scripts/instruction-budget.js` measurements at v4.7.0 (2026-09-25); `/claude-api prompt-audit` of the resident surface (2026-09-25); `docs/features/instruction-budget/1-requirements.md` § 7 (Claude Code loading behaviour)
