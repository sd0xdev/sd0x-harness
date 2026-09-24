# Requirements: instruction-budget

> **Doc class**: Lifecycle — Phase 1 requirements (per `@rules/docs-numbering.md`). Feature-level problem-space analysis. **Not** a task tracking ticket; for per-task progress tracking see `requests/*.md` (created via `/create-request`).
> **Created**: 2026-09-24
> **Updated**: 2026-09-24
> **Tier**: standard
> **Intent**: [intent-instruction-budget.md](./intent-instruction-budget.md)

## 1. Problem Statement

Claude Code 2.1.281 adds up every always-loaded instruction file at session start and warns when
the sum passes a total limit. A consuming project reported this warning:

```text
⚠ 25 instruction files add up to 179.5k chars, over the 150.0k-char total limit · largest:
.claude/rules/lessons.md (38.6k), .claude/rules/auto-loop.md (19.7k), .claude/rules/lessons-archive.md (16.0k)
```

The warning is shown to the user on every launch and says the files "will impact performance".
This plugin ships the largest share of what is always loaded:

| Source | Characters |
|--------|-----------|
| 16 `rules/*.md` | 91,568 |
| `CLAUDE.template.md` | 14,979 |
| **Plugin total** | about 106,500 |

That leaves a project less than 45k characters of its own before the warning fires. Some of the
plugin's files govern work that most sessions never do: document numbering, comment blocks, test
conventions, and how to prompt Codex. They are paid for on every launch anyway.

### 5-Why Trace

1. Surface: make four rules load only for matching paths, move the Codex prompt rule into a skill
   reference, and have `/claude-health` measure the total and flag lessons files under `.claude/rules/`.
2. Why: the plugin's always-loaded set is most of the budget, and nothing measures it. The project
   in the warning also kept a lessons log and its archive in `.claude/rules/`, which Claude Code
   loads on every session.
3. Root: instruction residency has no budget and no owner. Success means the plugin's share leaves
   a project real room below the limit, rules still load when their work is in play, and the user
   learns about an over-limit setup from `/claude-health` before Claude Code warns.

## 2. Goals / Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| Rules that govern one kind of work load when that work is in play, not on every launch | Changing what any rule says, beyond pointers and load metadata |
| The Codex prompt contract loads when a skill is about to dispatch Codex, and stays reachable by every section citation that exists today | Moving any Anchor-tier instruction out of the always-loaded set without the maintainer's approval |
| `/claude-health` reports the always-loaded total with Claude Code's own accounting, and the files that drive it | Enforcing a limit: the check reports and suggests, it never blocks or edits |
| `/claude-health` flags lessons, archive and log files kept in `.claude/rules/` | Deleting or rewriting a user's lessons file |
| The plugin's own always-loaded share has a pinned ceiling so it cannot creep back | Re-doing `rules-residency`'s kernel rewrite, canary and Anchor compaction (see § 7) |

## 3. Stakeholders

| Stakeholder | Role | Key Concern |
|-------------|------|-------------|
| Plugin users | User | The launch warning goes away, and the harness still behaves the same |
| Maintainer | Developer / decision-maker | Anchor text stays resident; pins and carriers stay coherent |
| Review and dispatch skills (`codex-code-review`, `doc-review`, `security-review`, `test-review`, `plan-review`, `recap-*`, `fp-brief`, `orchestrate`) | Dependent | They cite `rules/codex-invocation.md` by path and by section; every citation must still resolve |
| `/install-rules`, `/project-setup`, `/claude-health` | Dependent | They copy, count and check the rule files and the `@rules/` lines |
| Contract tests | Dependent | Byte pins cover the discretion baseline table, the claude-health S1–S3 region, the install-rules workflow and the codex-invocation Prohibited-patterns table |

## 4. Use Cases

| # | Actor | Action | Expected Outcome |
|---|-------|--------|-----------------|
| UC-1 | User | Launches Claude Code in a project that uses the plugin | No total-limit warning caused by the plugin's share |
| UC-2 | User | Edits a test file or a feature doc | The testing or docs rules load for that work |
| UC-3 | Model | Starts a first Codex review dispatch | The Codex prompt contract is in context before the prompt is written |
| UC-4 | User | Runs `/claude-health` | Sees the always-loaded total, the limit, the top files, and any lessons or archive file under `.claude/rules/` |
| UC-5 | Maintainer | Adds a paragraph to a resident rule | A test fails if the plugin's always-loaded share passes its ceiling |

## 5. Functional Requirements

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| FR-1 | `docs-numbering.md`, `docs-writing.md`, `testing.md` and `testing-project.md` are installed as path-scoped rules (`paths:` frontmatter). Each one's paths must cover everywhere that rule applies today. `docs-writing.md` § Code Comments applies to code files. `testing.md`'s evidence rules apply to request docs and test-review work. `auto-loop.md` reads `testing-project.md` `## Adequacy Mode` at the gate. Until § 9's first question is decided, `testing.md`'s Register #3 "❌ Never" rows stay in launch context whatever else moves | Must | Measured: a path-scoped rule is not loaded at launch. A glob narrower than the rule's reach would drop it where it binds |
| FR-2 | Every `@rules/<file>` line for a path-scoped rule becomes a plain-text reference in `CLAUDE.template.md` and in `/project-setup`'s backfill. `/claude-health` S2.5 #3 accepts the plain reference for path-scoped files and stops reporting them as P1 | Must | Measured: a path-scoped rule that `CLAUDE.md` `@`-imports is loaded at launch anyway. Without the second half, every consuming project gets a new P1 |
| FR-3 | The plugin's own repository still loads these rules when their work is in play. `rules/` is not `.claude/rules/` there, so `paths:` has no effect | Must | Dropping root `CLAUDE.md`'s `@` lines alone would unload them from the repo that develops them |
| FR-4 | The Codex prompt contract (`rules/codex-invocation.md`) becomes an on-demand skill reference. The rule file keeps a pointer that still carries the citable headings. Every current section citation resolves, and every skill that dispatches a review loads the reference before its first dispatch | Must | Four skill files cite its sections by name and about thirty cite the file, per the 2026-09-24 survey (§ 10). The on-demand contracts from `rules-residency` r1 are the precedent |
| FR-5 | `/claude-health` measures the always-loaded instruction total with Claude Code's accounting. It counts User, Project, Local and Managed memory files, follows `@` imports, and skips path-scoped rules. A file over the per-file limit is reported on its own and left out of the sum. The report shows the total, the limit, the three largest files, and the plugin's share | Must | The user should learn this from the harness, with the plugin's share separated out |
| FR-6 | `/claude-health` flags lessons, archive, log or history files under `.claude/rules/` and names the fix: move the file out of `rules/` (the lessons log's home is `.claude/sd0x-dev-flow-lessons.md`) or give it `paths:` | Must | Two of the three largest files in the reported warning were a lessons log and its archive |
| FR-7 | Every carrier that lists, counts or pins these files agrees with the new layout. That covers the discretion 13-file table, `/project-setup` counts, README counts and `docs/rules.md`, the `/remind` rule glob, `.sd0x/install-state.json`, and the `contract-routing` registry | Must | The survey found the lists hard-coded and test-locked |
| FR-8 | A test pins a ceiling on the plugin's always-loaded share, measured with the FR-5 accounting | Should | Without it the share grows back. The number is the tech spec's call and must stay reconcilable with `rules-residency` § 3.5 |
| FR-9 | `/install-rules` preserves `paths:` frontmatter on copy and on `--customize` refresh | Must | Its copy is whole-file today. A refresh that dropped the frontmatter would silently make the rule always-loaded again |

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Reliability | No failure mode lets work proceed without the rule that governs it. A Claude Code that ignores `paths:` loads the rule always. The resident pointer left at `rules/codex-invocation.md` keeps the core prohibition (metadata only, mandated exploration, never feed conclusions or the diff), and a dispatching skill that cannot load the full reference stops instead of dispatching | No path from this change leaves a rule unloaded where it binds; a test proves the missing-reference path dispatches nothing |
| NFR-2 | Security | Anchor text stays resident. That means the Register #3 testing "❌ Never" rows, the Register #4 git rules and all of `security.md` | `discretion-tiers.test.js` Register pins unchanged, or changed only with the maintainer's approval |
| NFR-3 | Usability | A plugin install on an empty project stays below the total limit with a wide margin | The plugin's always-loaded share, measured as in FR-5, at or under the FR-8 ceiling. Target: at most half of the 120k floor |
| NFR-4 | Maintainability | The FR-5 accounting is one implementation that the check and the FR-8 test both use | One module, two consumers |

## 7. Constraints & Assumptions

| Type | Description | Source |
|------|-------------|--------|
| Constraint | Measured on 2.1.281 in a headless session: a `paths:` rule is not loaded at launch; `paths: "**"` loads always; a `paths:` rule that `CLAUDE.md` `@`-imports loads at launch | Probe repo on 2026-09-24, marker lines echoed by `claude -p` |
| Constraint | The warning is advisory: it is a `large-memory-files` notice ("will impact performance") and nothing is truncated. The total limit is `max(120000, per-file limit)`. The per-file limit is `max(40000, context window × 0.05 × a scale factor)`, so it depends on the model; 150k was observed. The 4 MiB per-file skip is a separate hard rule | Claude Code 2.1.281 binary: the functions building `totalLimitChars` and the startup notice |
| Constraint | Consuming projects get the rules in `.claude/rules/`, which Claude Code auto-loads. This repository keeps them in `rules/` and loads them only through root `CLAUDE.md`'s `@` lines | `/install-rules`; this checkout has no `.claude/rules/` |
| Constraint | Pinned text blocks every simple edit: the discretion baseline table, the claude-health S1–S3 region and heading order, the install-rules `## Workflow`, and the codex-invocation Prohibited-patterns table plus its verbatim clauses | Survey § 1, § 3 |
| Constraint | `rules-residency` (current authority) keeps a Codex-independence core and all anchors resident, and moves only the non-anchor testing rows on demand | `docs/features/rules-residency/2-tech-spec.md` § 3.2, § 3.4, § 4 |
| Assumption | Claude Code loads a file only once when both the `.claude/rules/` auto-load and a `.claude/CLAUDE.md` `@` import reach it | Not measured; it decides whether consuming projects are counted twice today |
| Assumption | Path-scoped rules load when a matching file is read or edited, which covers the moment their guidance is needed | `code.claude.com/docs/en/memory.md` |

## 8. Acceptance Signals

- Signal 1 (FR-1/FR-2/UC-1): in a fresh install, a headless marker probe shows the four rules absent at launch, and present after a matching file is touched.
- Signal 2 (FR-2): `/claude-health` on a fresh install reports no S2.5 P1 for `testing-project.md`.
- Signal 3 (FR-3): in this repository, a session that edits a test file has `testing.md` in context.
- Signal 4 (FR-4): `contract-routing.test.js` resolves every former `rules/codex-invocation.md` section citation. A first-dispatch prompt built by `/codex-review-fast` shows the reference was loaded first.
- Signal 5 (FR-5/NFR-4): on a fixture that reproduces the reported warning, `/claude-health` prints the same file count and total that Claude Code prints, within 1%.
- Signal 6 (FR-6): a fixture with `.claude/rules/lessons.md` and `lessons-archive.md` gets one finding per file, naming the move.
- Signal 7 (FR-8/NFR-3): the ceiling test fails when a 5,000-character paragraph is added to a resident rule.
- Signal 8 (NFR-2): Register pins are unchanged, or the change carries the maintainer's recorded approval.

## 9. Open Questions

- [ ] **testing.md's Anchor rows.** Path-scoping `testing.md` takes the Register #3 "❌ Never" rows out of launch context, and `discretion-tiers.test.js` requires those rows to stay in that file. Options are to keep those rows resident elsewhere, accept that `discretion.md` already restates Register #3, or leave `testing.md` resident. This is the maintainer's call.
- [ ] **Relationship to `rules-residency`.** This feature does part of that spec's task 1 and task 4 for an external reason. Should it be recorded as a slice of that spec, or supersede those rows? `/tech-spec` must reconcile the 40,000-byte resident budget with FR-8.
- [ ] **Loading in the plugin repo (FR-3).** A `.claude/rules/` link to `rules/`, a skill-level load, or keeping `@` lines only in root `CLAUDE.md`. Solution concern; suggest `/feasibility-study` if the options are not obvious in the tech spec.
- [ ] **Double counting.** Confirm the § 7 dedupe assumption with a probe. If it is false, consuming projects pay twice today, and FR-2 is worth more than the table in § 1 shows.
- [ ] **Where the FR-5 check lives.** The claude-health S1–S3 region and heading order are pinned. Placing the check means either a new module after Fix Tiers or a deliberate re-pin. That decision belongs in the tech spec.

## 10. References

- Survey of carriers, pins and citations: the Explore report of 2026-09-24, summarized in § 7; the counts are the ones listed there
- `docs/features/rules-residency/2-tech-spec.md` — the resident-kernel budget and the on-demand contract pattern
- `docs/features/rules-residency/requests/2026-08-29-extract-on-demand-contracts-r1.md` — precedent for moving a contract to a skill reference
- `test/rules/contract-routing.test.js` — `CONTRACTS` registry for on-demand references
- `skills/claude-health/SKILL.md` § Sync Module, S2.5; `skills/install-rules/SKILL.md` § Workflow; `skills/project-setup/SKILL.md` step 5.3
- `https://code.claude.com/docs/en/memory.md` — path-scoped rules
