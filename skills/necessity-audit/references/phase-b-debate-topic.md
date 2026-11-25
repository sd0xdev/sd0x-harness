# Phase B — Codex adversarial debate

## Invocation (MANDATORY)

Use `Skill("codex-brainstorm", <topic>)`. Never dispatch the transport directly for Phase B — the codex-brainstorm skill enforces bilateral stance tracking and reports the debate status (agreement or `Diverged`).

## Topic construction

```bash
node scripts/skills/necessity-audit/debate-topic.js build \
  --preflight <preflight.json> \
  --output <topic.md>
```

The topic (see `debate-topic.js::buildTopic`):

| Section | Content |
|---------|---------|
| Active dimensions | Only the dims from `preflight.activeDimensions` (depth-filtered) |
| Termination preference | `deep` → agreement REQUIRED (a quiet round with the sides still apart is `Diverged` and fails); `brief`/`normal` → any termination |
| Independent research | `cat <relPath>`, `ls docs/features/<featureKey>/`, `git grep -lE "<featureKey>" -- . ':(exclude)docs/**' ':(exclude)**/*.md'` |
| Classification contract | `[VERDICT: Keep\|Review\|Cut] <id> — <rationale> — Evidence: <file:line\|doc:§>` |
| Forbidden | Do NOT reveal Claude's Phase-A classifications — Codex must classify independently |

## Response parsing

```bash
node scripts/skills/necessity-audit/debate-topic.js parse \
  --input <raw-response.txt> \
  --output <debate.json>
```

Extracted fields (see `parseDebateResponse`):

| Field | Source |
|-------|--------|
| `threadId` | `/threadId['":\s]+[0-9a-f-]{20,}/i` |
| `rounds` | `/(\d+) rounds?/i` |
| `equilibriumReached` | `detectAgreement`: did the report **end in agreement**? An explicit `Debate Status` field — at the start of a line or in a table's label cell, not inside a sentence — decides, by its leading value (`Equilibrium reached …` → true; anything else, `Diverged` included → false; the explanation after the status is not read, and an unfilled row listing the alternatives is not a status). The final status is the one in the report's own conclusion (`## Conclusion`, `## Final Verdict`, with their nested subsections; if the report has several, all of them count). Anything under a round or transcript heading, at any depth, is excluded first — its conclusions included. The other place is the summary table (any status table outside the round transcript): every status field found in those two places must read as agreement, so a `Diverged` in either wins and a report that contradicts itself is not an agreement. Status fields elsewhere (per-round lines or tables in a transcript) are ignored when a final one exists; with none, the last one (a field line, or `Round N — Debate Status: …`; never a mention inside a sentence) counts, unless the conclusion denies agreement in prose. Reports with no status field are read under a closed contract, from `## Conclusion` (nested subsections included) plus any `Equilibrium Type` row in the summary table, or from the whole report when it has no conclusion: every `Equilibrium Type` field in that scope counts, `None` as a denial and a single named type as a statement; qualifiers such as "with no remaining objections" are dropped first; a sentence is then a statement only when it **begins** "Equilibrium reached…", "Nash equilibrium reached…" or "[Both sides] reached [Nash] equilibrium…" with no negation word; any other sentence that mentions an equilibrium and contains a negation word, or is a question, or is a keyed denial ("equilibrium: no"), is a denial; agreement needs at least one statement and no denial. Merely mentioning an equilibrium, or a round with no new objections, is **not** agreement. The field keeps its name so stored `debate.json` / report files stay readable |
| `conclusion` | Body of the last report-level conclusion section (`## Conclusion` / `## 結論` / `## Final …`, round and transcript subtrees removed); the last 2,000 characters when there is none |
| `perElementVerdicts` | `[VERDICT: ...] <id> — <rat> — Evidence: <ev>` lines (tolerates leading whitespace, bullets, em-dashes in rationale) |
| `evidenceCitations` | verdict-tail + prose-external `file:line` / `doc:§` — id-tagged when from verdict, global otherwise; deduped by type + location + elementId |

## Greenfield mode

When `preflight.greenfield === true`, evidence format is `doc:§<section> [REASONING-ONLY]` — Codex debates via spec logic alone, no code grep.
