---
name: doc-refactor
description: "Refactor documents — simplify without losing information, visualize flows with sequenceDiagram."
allowed-tools: Read, Grep, Glob, Edit, Agent
---

# Document Refactoring

## Trigger

- Keywords: refactor doc, simplify document, doc-refactor, condense document

## When NOT to Use

- Code refactoring (use `/simplify` or `/refactor`)
- Document review without changes (use `/codex-review-doc`)
- Writing new documents (use `/tech-spec` or `/create-request`)

## Agent Dispatch

Dispatch to the dedicated `doc-refactor` agent:

```
Agent({
  description: "Refactor document — simplify without losing information",
  subagent_type: "doc-refactor",
  prompt: `Refactor the document at: $ARGUMENTS
Follow the task steps and the decision-fidelity standard defined in this skill.`
})
```

## Which Standard Applies

Decide by the file's role (`rules/docs-numbering.md` § Size Limit is the authority on the two classes):

| Document | Goal | Line budget |
|----------|------|-------------|
| Live feature prose under `docs/features/` — a document whose role is **Current authority**: it states what is true now | Remove bloat: prune what is dead, merge what is duplicated, split what remains | ~500 lines is a signal to act, judged per file |
| Record — request ticket, review log, ADR: what was decided or done at a point in time | **None beyond formatting.** Never pruned, merged, split or rewritten; a superseded decision stays in the record | None |
| Other prose — any other `.md` (`CONTRIBUTING.md`, a guide) | Preserve content; tables and diagrams where they help | None |
| **Functional document** — `skills/**` and their `references/`, `agents/`, `commands/`, `rules/*.md`, `CLAUDE.md`, templates, fixtures | Decision fidelity (below) | **None.** A file loaded and acted on as a whole has no line target, and getting shorter is not a result |

**For a document under `docs/features/`, the role decides, not the filename.** The repository
assigns each one a role — Current authority, or a record role such as Design record
(`scripts/lib/doc-metadata.js`) — and a `2-tech-spec.md` can be a design record. Use the role the caller supplied or the document's own metadata states. If the role
cannot be established, treat the document as a **record** — formatting only — and say so in the
report: pruning a live document too little costs nothing, pruning a record destroys it.

## Decision Fidelity (functional documents)

A shorter instruction is acceptable only if a reader following it reaches the **same action, with
the same evidence**, as a reader following the original.

| Step | What to do |
|------|------------|
| 1. Write the cases first | Before editing: one **normal** case, one **boundary** case (a threshold, an exception or a rare branch), one **insufficient-evidence** case (the instruction should say stop, ask or report). Record what the original directs in each: the action and the evidence it requires |
| 2. Hold one out | Add a fourth case and set it aside. Do not look at it while rewriting — it checks the rewrite, it does not shape it |
| 3. Rewrite | Apply § Techniques. Keep everything § Never Traded Away lists |
| 4. Check all four | For each case, including the held-out one, the short version must direct the same action and require the same evidence. Any difference → restore the text that carried it, or drop the edit |
| 5. Measure | Report input tokens before and after with the tokenizer named. If no tokenizer is available, report a **labelled estimate** (state the method, e.g. characters ÷ 4) — never an unlabelled number, and never lines as the measure |

A rewrite that fails a case is not finished because it is shorter. A rewrite that passes and is not
shorter is still correct — report it as such.

## Never Traded Away

- **Hard conditions** — thresholds, limits, ordering, "must" and "never" rules
- **Exceptions** — every stated exception and the condition that triggers it
- **Handoff data** — what is passed to the next step, skill or agent, and its format
- **Permissions** — frontmatter, `allowed-tools`, approval and authority statements

## Techniques

| Before | After | When it helps |
|--------|-------|---------------|
| Long paragraphs comparing things | Table | The items share dimensions |
| A step sequence between actors | `sequenceDiagram` | Order and actor matter |
| The same explanation in several places | One source + a reference | The copies say the same thing |
| A concept re-explained at each use | An **established term** the reader already knows, or one defined once in the file | Only where it replaces repeated text. A term added without removing an explanation is decoration — leave it out |
| Many examples of one point | One example that covers the boundary | The examples do not differ in what they teach |

## Task

For the file specified by `$ARGUMENTS`:

1. **Classify** it (§ Which Standard Applies) and say which standard is used
2. **Analyze** — core information vs redundancy; for a functional document, write the cases (§ Decision Fidelity steps 1–2)
3. **Refactor** — § Techniques
4. **Validate** — prose: key information preserved; record: nothing but formatting changed; functional: all four cases agree
5. **Report** — § Output

## Output

```markdown
## Refactoring Result

- Document class: live feature prose / record / other prose / functional document
- Input tokens: X → Y (tokenizer: <name>, or "estimate: <method>")

## Decision Fidelity (functional documents)

| Case | Original directs | Short version directs | Same action + evidence? |
|------|------------------|-----------------------|-------------------------|
| Normal | ... | ... | Yes / No |
| Boundary | ... | ... | Yes / No |
| Insufficient evidence | ... | ... | Yes / No |
| Held-out | ... | ... | Yes / No |

## Changes

- <summary; anything restored after a failed case>
```
