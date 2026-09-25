---
paths:
  - "docs/**"
---
# Document Numbering Rules

Feature documents live in `docs/features/<feature>/`. Lifecycle docs carry a **numeric prefix** for their phase; ancillary docs carry a **semantic prefix** instead.

```
docs/features/<feature>/
├── 0-feasibility-study.md       # Lifecycle — or a 0-feasibility-study/ folder
├── 1-requirements.md            #   with 0-feasibility-study.md + N-<sub-topic>.md inside
├── 2-tech-spec.md
├── 3-architecture.md
├── 4-implementation.md
├── runbook-release.md           # Ancillary — semantic prefix, no phase number
├── checklist-deploy.md
└── requests/
    └── YYYY-MM-DD-<title>.md    # Date-prefixed
```

## Lifecycle docs

`<N>-<kebab-case-name>.md`, where N reflects **phase order, not priority**. Gaps are fine — `0, 2, 3` just means phase 1 did not apply.

| Number | Phase | Command | Required |
|--------|-------|---------|----------|
| 0 | Feasibility study | `/feasibility-study` | Recommended |
| 1 | Requirements spec | `/req-analyze` | Recommended |
| 2 | Technical spec | `/tech-spec` | Required |
| 3 | Architecture design | `/architecture` | Recommended |
| 4+ | Implementation / appendix | — | As needed |

## Ancillary docs

Operational or supplementary artifacts that belong to no phase. `doc-classifier.js` recognizes them by `semantic_pattern` (step 4 of its 7-step precedence), not by prefix fallback — the namespace is `ancillary` in `scripts/config/doc-taxonomy.json`.

| Type | Pattern | Type | Pattern |
|------|---------|------|---------|
| Runbook | `runbook-<topic>.md` | Handoff | `handoff-<topic>.md` |
| Checklist | `checklist-<topic>.md` | Briefing | `briefing-<topic>.md` |
| ADR | `adr-<number>-<title>.md` | FP Brief | `*-fp-brief.md` |
| Review Log | `review-log-<topic>.md` | Intent | `intent-<feature>.md` |

The Intent basename is **exactly** `intent-<feature>.md` for the feature directory it sits in —
consumers resolve that exact name; a wildcard scan only surfaces strays or ambiguity.

## Size Limit — 500 Lines

**Scope: prose feature documents under `docs/features/`** — not `.md` files at large. Functional
documents are exempt: `skills/**` with their `references/`, `agents/`, `commands/`, `@`-loaded
`rules/*.md`, templates, generated files, fixtures, and any file that is one unsplittable table.
The test is the role, not the directory — a file loaded and acted on as a whole has no line budget.

500 lines is a **signal the model judges per file**, not a mechanical trigger: the target is bloat,
the tech spec or requirements doc no one reads end to end. A coherent long doc may stand with the
reason stated. Never let a lifecycle doc grow unbounded because the fix is work, and never compress
away live information to duck under the number.

### Prune first, then merge, then split

| Order | Remedy | Applies when | What it costs |
|-------|--------|--------------|---------------|
| 1 | **Prune** | The content is no longer true, describes a design that was never built, or is duplicated verbatim in a doc that owns it | Nothing — dead text is not information |
| 2 | **Merge** | Two sections say the same thing from different angles, or a section belongs to a doc that already covers the topic | Nothing, if the surviving copy is the fuller one |
| 3 | **Split** | What remains is all live, all unique, and still too long for one read | The reader gains a hop; the corpus gains a file |

**Prune means removing text that is dead, not text that is inconvenient.** Live information is
moved, never deleted: if it is true and stated nowhere else, it goes into the doc that owns it —
that is remedy 2, not remedy 1. Say which remedy you applied and why, and if you pruned, say what
made the text dead (superseded by which change, duplicated in which file).

Records are exempt from all three. A request ticket, review log or ADR states a point in time; text
in it going out of date is the record working, and pruning it destroys the only copy. See
`skills/update-docs/SKILL.md` § Step 1.5.

| Lines (prose docs under `docs/features/`) | Reading |
|-------|--------|
| ≤ 400 | Fine |
| 401–500 | Prune the dead sections at the next substantive edit; split if what is left is still over |
| > 500 | Act — prune, merge, or split, in that order. The model may keep it whole by stating why this file reads better unsplit |

Measure with `wc -l`. Lines, not bytes — that is what the reader scrolls.

Before a split — the folder shape, the three parser constraints it must keep, repointing links in
both directions, and where to cut — and before claiming a file is exempt on grounds the list above
does not settle, Read `skills/doc-review/references/documentation-contract.md` in the sd0x-dev-flow
plugin (the `doc-review` skill's own `references/`): § Splitting a Feature Document and
§ Functional-Document Exemption. If that Read fails, do not split and claim no exemption beyond
the list above.

## Cross-references

Relative paths only: `./2-tech-spec.md` at the same level, `../2-tech-spec.md` from a subfolder, `./0-feasibility-study/0-feasibility-study.md` into one.

## Prohibited

| ❌ | Why |
|----|-----|
| `tech-spec.md` | Lifecycle docs (phases 0-4) need their numeric prefix |
| `5-runbook.md` | Ancillary docs use semantic prefixes, not phase numbers |
| `2026-01-30-tech-spec.md` | Date prefixes belong to `requests/` only |
| `2_Tech_Spec.md` | kebab-case, lowercase |
| `1-intent.md` (any `[0-4]-intent.md`) | The numbered form mis-types via the classifier's prefix fallback (phase 1 → requirements); intent is ancillary, never numbered |
| `intent.md` | Unclassifiable appendix — the basename must carry the feature key: `intent-<feature>.md` |
