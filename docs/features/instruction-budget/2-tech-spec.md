# instruction-budget Technical Spec

> **Requirements**: [1-requirements.md](./1-requirements.md) · **Intent**: [intent-instruction-budget.md](./intent-instruction-budget.md)
> **Request tickets**: [`requests/`](./requests/) — R1 (path-scoping), R2 (Codex prompt contract on demand), R3 (budget check)
> **Created**: 2026-09-24

## 1. Requirement Summary

- **Problem**: Claude Code 2.1.281 warns when always-loaded instruction files pass a total limit;
  this plugin ships about 106,500 of the characters counted, leaving a project little room.
- **Goals**: A) four rules load only when their work is in play; B) the Codex prompt contract loads
  on demand behind a resident core; C) `/claude-health` measures the total the way Claude Code does
  and flags lessons/archive files in `.claude/rules/`; a pinned ceiling stops the plugin's share
  growing back.
- **Decided** (requirements § 9): `testing.md` path-scopes; its Register #3 rows stay in the file and
  the rule stays resident through `discretion.md` Register #3.

## 2. Existing Code Analysis

| Fact | Where | Consequence |
|------|-------|-------------|
| A rule with `paths:` frontmatter is not loaded at launch; `paths: "**"` loads always | Claude Code 2.1.281 (measured, requirements § 7) | The glob list must name the rule's real reach |
| An `@`-imported file is loaded at launch whatever its frontmatter | same | A path-scoped rule must not be `@`-imported by a shipped `CLAUDE.md` |
| The loader dedupes by path (`processedPaths`) | same binary | `.claude/rules/x.md` auto-loaded and `@`-imported counts once |
| Per-file limit `max(40000, window × 0.05 × k)`; total `max(120000, per-file)`; over-limit files are warned alone and left out of the sum | same binary | The budget check reproduces this accounting; the limit is model-dependent, 150,000 observed |
| This repo loads `rules/` only through root `CLAUDE.md`'s `@` lines; it has no `.claude/rules/` | checkout | Root `CLAUDE.md` keeps its `@` lines (FR-3); consumers get `.claude/rules/` from `/install-rules` |
| `/install-rules` copies whole files | `skills/install-rules/SKILL.md` § Workflow | Frontmatter survives install and `--customize` refresh (FR-9) |
| `rules/codex-invocation.md` is read by path in three test files and cited by section from four skill files | survey 2026-09-24 | The file stays, as a resident core carrying the cited headings |

## 3. Technical Solution

### 3.1 Path-scoped rules (R1)

Each of the four gains frontmatter. The globs name where the rule's instructions bind today:

| Rule | `paths:` |
|------|----------|
| `docs-numbering.md` | `docs/**` |
| `docs-writing.md` | `**/*.md`, `hooks/**`, `scripts/**`, `skills/**` — prose anywhere, plus the directories `check-comment-blocks.js` enforces the comment thresholds on |
| `testing.md` | `test/**`, `tests/**`, `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, `docs/features/**/requests/**` |
| `testing-project.md` | same as `testing.md` |

`auto-loop.md` § Tiers reads `testing-project.md` `## Adequacy Mode` at the gate by reading the
file, which needs no residency. `CLAUDE.template.md` `## Rules` turns the four `@rules/…` lines into
plain `rules/<file> (path-scoped)` references; root `CLAUDE.md` keeps its `@` lines (FR-3).
`/claude-health` S2.5 check #3 accepts the plain reference for a template that carries `paths:`
frontmatter, and reports an `@` import of one as P2 ("defeats path scoping"). `/project-setup`
counts become "13 `@rules/` imports + 4 path-scoped references".

### 3.2 Codex prompt contract on demand (R2)

The full text moves to `skills/codex-code-review/references/codex-invocation.md`, registered in
`contract-routing.test.js` `CONTRACTS` (activated by `rules/codex-invocation.md` and
`skills/codex-code-review/SKILL.md`). `rules/codex-invocation.md` becomes the resident core:

- the core prohibition — first dispatch carries metadata only and mandates exploration; never the
  diff, the code, a conclusion or a leading question; a same-thread reply may carry the new diff,
  never an interpretation; a rotated thread's first dispatch is a first dispatch again;
- every heading another file cites (`Which dispatches this file governs`, `Required in every
  first-dispatch prompt`, `Prohibited patterns`, and the three exception headings), each with its
  one-sentence rule and a pointer to the same heading in the reference;
- **a stop rule**: a skill about to dispatch a review that cannot read the reference does not
  dispatch (NFR-1).

Tests that pin the contract's text (`codex-transport.test.js`, `review-loop-resilience.test.js`)
read the reference; `discretion-tiers.test.js` keeps its baseline row for the resident file.

### 3.3 Budget check (R3)

`scripts/instruction-budget.js [--root <repo>] [--home <dir>] [--limit <n>] [--format=json|md]`
reproduces the launch accounting:

1. Collect memory files: `~/.claude/CLAUDE.md`, `~/.claude/rules/**/*.md`, `<repo>/CLAUDE.md`,
   `<repo>/.claude/CLAUDE.md`, `<repo>/CLAUDE.local.md`, `<repo>/.claude/rules/**/*.md`.
2. Drop a rule whose frontmatter has a non-empty `paths:` list that is not **every** entry `**` —
   2.1.281's own test (`s.every(g => g === "**")`): a list mixing `**` with a narrower glob is still
   path-scoped and not loaded at launch; only an all-`**` or empty list is unconditional.
3. Follow `@path` imports from each kept file (relative to it, `~/` to home; outside fenced code;
   depth ≤ 5), deduping by real path.
4. Limits come from one model-dependent input, the per-file limit (`--per-file`, default 150,000 —
   the value observed in the reported session; 2.1.281 computes it as `max(40000, window × 0.05 × k)`).
   The total limit is derived exactly as 2.1.281 does: `max(120000, per-file)`. A file over the
   per-file limit is reported on its own and left out of the sum. Both values are estimates of a
   model-dependent number, and the output says so.
5. Report the total, the derived limit, the three largest
   files, the plugin's share (files whose basename is a plugin rule or `CLAUDE.md` sections the
   template ships), and every `.claude/rules/` file whose name matches `lessons|archive|log|history`
   with the fix: move it out of `rules/` (the lessons log lives at `.claude/sd0x-dev-flow-lessons.md`)
   or give it `paths:`.

`/claude-health` gains `### Instruction Budget Module` **after** `### Fix Tiers` (outside the pinned
S1–S3 region), running the script and reporting P2 when over the limit or when a lessons file is in
`rules/`. The script is copied by `/install-scripts` like every `scripts/*.js`.

**Ceiling (FR-8)**: `test/scripts/instruction-budget.test.js` builds a fresh-install fixture from
`rules/` and `CLAUDE.template.md` and asserts the plugin's always-loaded share is at most **80,000**
characters. After R1 and R2 the measured share is about 75,000; NFR-3's 60,000 target needs the
`rules-residency` kernel work and is recorded there, not forced here.

## 4. Risks and Dependencies

| Risk | Mitigation |
|------|-----------|
| A glob narrower than a rule's reach | The § 3.1 table is reviewed against each rule's sections; `docs-writing.md` keeps `**/*.md` |
| Claude Code changes its accounting | The script reproduces 2.1.281's; a version note in its output, and the test fixture fails loudly if the rules are re-shaped |
| Pinned text moves with `codex-invocation.md` | Tests are repointed in the same change; section citations keep resolving through the resident headings |

## 5. Work Breakdown

| # | Request | FRs | Tier |
|---|---------|-----|------|
| R1 | Path-scope four rules; template plain references; health #3; project-setup counts | FR-1, FR-2, FR-3, FR-9 | standard |
| R2 | Codex prompt contract to a reference behind a resident core | FR-4, NFR-1 | standard |
| R3 | `instruction-budget.js`, the health module, the ceiling test, the lessons flag | FR-5, FR-6, FR-7, FR-8, NFR-4 | standard |

Order: R1 → R2 → R3 (the ceiling measures what R1 and R2 leave).

## 6. Testing Strategy

| Layer | What |
|-------|------|
| Unit | `instruction-budget.js` over fixtures: path-scoped excluded, `paths: "**"` included, `@` import followed and deduped, over-limit file reported and left out, lessons file flagged |
| Contract | The four rules carry the § 3.1 globs; the template never `@`-imports them; health #3 wording; the reference's headings pinned in `CONTRACTS`; the resident file keeps every cited heading |
| Ceiling | Fresh-install fixture ≤ 80,000 characters |

## 7. Open Questions

- [ ] Whether `docs-writing.md`'s comment thresholds should also cover code outside
  `hooks/ scripts/ skills/` — today only those directories are checked mechanically, so the glob
  follows the checker.
