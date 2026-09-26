# Documentation Contract

> Loaded on demand — before splitting a feature document, before relying on a comment-block
> exemption or changing the checker, and when judging whether a document is exempt from the line
> budget beyond the resident core's list. Pruning and merging need only the resident core. The resident cores are `rules/docs-numbering.md` and
> `rules/docs-writing.md`; this file carries the procedure they point to.

**Tier.** This file sits outside `rules/discretion.md` § File Baselines. Every statement here was
moved from one of those two rules and keeps the tier it had there: what came from
`docs-numbering.md` (§ Why the Budget Targets Bloat, § Splitting a Feature Document,
§ Functional-Document Exemption) is **Default**; what came from `docs-writing.md`
(§ Comment Blocks: Counting, Exemptions and the Checker) is **Guidance**. The comment-block
thresholds and the move-or-dedupe rule — `docs-writing.md`'s two Default exceptions — stay in its
resident core and are not restated here.

## Why the Budget Targets Bloat

The line budget in `rules/docs-numbering.md` § Size Limit governs the feature documents under
`docs/features/` — it is not a line budget for `.md` files at large. **Functional documents are
out of scope entirely** (§ Functional-Document Exemption below): a functional document is an
*instruction surface* — it is loaded as a unit and executed, not read section by section, so length
costs nothing the way it costs a reader who scrolls, and there is no numbered-subfolder shape to
split it into. Compressing one to stay under a limit that never applied to it removes information
for no benefit.

**What the rule is actually against is bloat** — the tech spec or requirements doc that keeps
absorbing sections until no one reads it end to end. 500 lines is the *signal* that a prose
document has probably reached that point, not a mechanical trigger: **the model judges the
individual file**. A 550-line spec whose sections are genuinely one argument may stand (state the
call and the reason); a 350-line doc already sprawling across unrelated concerns is better
addressed early. What is not a judgment call: letting a lifecycle doc grow unbounded because the
fix is work, or compressing away live information to duck under a number.

Splitting was once the only remedy the rule named, and it is the only one that leaves the total
unchanged — a corpus can only grow under a rule whose sole answer to "too long" is "put it in more
files". That is why the resident core orders the remedies prune, merge, split.

## Splitting a Feature Document

**Splitting is a manual edit — no skill does it for you.** `/update-docs` syncs docs against code
and `/doc-refactor` condenses one file; neither moves sections into a subfolder or rewrites inbound
links. The shape to produce:

```
docs/features/<feature>/2-tech-spec/
├── 2-tech-spec.md        # Main: canonical filename, keeps §-structure, links to subs
├── 1-<sub-topic>.md      # Subs: numbered from 1, no lifecycle meaning
└── 2-<sub-topic>.md
```

Three constraints, each with a parser behind it: the main file keeps the **canonical filename**
(`doc-classifier.js` sets `is_canonical` only on an exact match); the folder keeps the **lifecycle
prefix** (`_inferParentType` resolves a directory by its `^[0-4]-`, so no taxonomy entry is
needed); and sub-file numbers restart at 1 because the parent's type overrides theirs —
`3-core-logic.md` inside `2-tech-spec/` must not leak as a phase-3 architecture doc.

**A move breaks links in both directions, and only one of them is visible from outside.** Inbound
links break silently, so finish the job: `grep -rn '<old-filename>' docs/ skills/ rules/ scripts/ test/`
and repoint every hit — the path gains one directory level, so a sibling `./2-tech-spec.md` becomes
`./2-tech-spec/2-tech-spec.md` and a `../` reference gains a `../`. Scripts that hard-code the old
path count too. **Then the other direction**: every relative link *inside* the moved file has
shifted by the same amount, and those fail just as silently — verify each one resolves rather than
eyeballing it:

```bash
grep -o '](\.[^)]*)' <moved-file> | sed 's/^](//;s/)$//' | while read -r l; do
  [ -e "$(dirname <moved-file>)/$l" ] || echo "DEAD $l"
done
```

Then run `/codex-review-doc` on the result.

**Cut at the section that dominates**, not at an arbitrary line count. Usually one `##` section
carries most of the file, and its `###` boundaries are the natural sub-documents. A split landing
mid-argument is worse than the long file.

## Functional-Document Exemption

Every `.md` that is an instruction surface rather than a document someone reads is exempt from the
line budget:

| Exempt | Why |
|--------|-----|
| `skills/**` — `SKILL.md` and its bundled `references/*.md` | Loaded as a unit by the dispatcher; a reference is pulled in whole by the skill that owns it |
| `agents/*.md`, `commands/*.md` | Same — a system prompt or command body, not a document |
| `rules/*.md` loaded via `@` | Splitting adds import hops without reducing what loads — reduce the content instead |
| Templates, generated files and fixtures | Their length is dictated by what they generate or fix |
| Any file that is one unsplittable table | No cut point exists that is not mid-argument |

The test is *not* the directory but the role: if the file is loaded and acted on as a whole, the
limit does not apply. `docs/**` prose is the thing it does apply to.

## Comment Blocks: Counting, Exemptions and the Checker

**Why the unit is the logical block** (the rule itself is `rules/docs-writing.md` § Code Comments):
if a blank line ended a block, the cheapest way under the threshold would be a blank line every 29
lines, which changes the block's shape and nothing about what the reader loads.

**Exempt — exactly what the checker recognizes, no more**: a block whose **first line** matches
`SPDX-License-Identifier`, `Copyright (c)/©/<year>`, `eslint-disable`, or `shellcheck disable`; and
any file under a directory named `node_modules`/`.claude`/`dist`/`vendor` (any depth).

The exemption covers the **contiguous run the directive heads**, not everything a blank line
bridges into it. Otherwise the two rules cancel: one `# SPDX-License-Identifier` line, one blank,
then 60 lines of rationale would be a single exempt block, and the header would launder arbitrary
explanation at the cost of a blank line. The remainder below the bridge is measured on its own and
reported at its own first line — so an exempt header followed directly by its licence text stays
exempt, which is the case the exemption was written for. Other directive forms (`@ts-nocheck`,
`prettier-ignore`, …) and generated files outside those directory names are **not** auto-exempt —
extend `EXEMPT_FIRST_LINE`/`EXEMPT_DIR_NAMES` in the checker (with a test) before relying on a new
form.

**The checker.** `node scripts/check-comment-blocks.js` (threshold 30 blocking / 25 warning,
recursive over `hooks/ scripts/ skills/`). Comment syntax is resolved per language — `.sh` counts
only `#`, so a shell `case "$1" in /*)` is not read as a C block-comment opener. Wired into
`/precommit` as the `comment_blocks` step, which runs first (static and cheap) and **skips rather
than fails** unless the repo checked the checker into its own `scripts/` — which also settles the
scan dirs, since finding it there proves `scripts/` exists. The installed copy at `.claude/scripts/`
deliberately does **not** count: `/install-scripts` puts it there in consuming projects, and the
checker scans the *repo's* top-level `hooks/ scripts/ skills/`, so honouring it would judge someone
else's code by this plugin's 30-line convention and could fail their precommit. Vendoring the
checker into your own `scripts/` is how a project opts in.
