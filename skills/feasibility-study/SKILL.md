---
name: feasibility-study
description: "Feasibility analysis from first principles. Use when: evaluating solutions before tech-spec, comparing approaches, risk assessment. Not for: implementation (use feature-dev), architecture advice (use codex-architect). Output: quantitative comparison + recommendation."
allowed-tools: Read, Grep, Glob, Bash(git:*), Bash(bash:*), Write, Agent, Bash(node:*)
---

# Feasibility Study Skill

## Supplementary Agent

For each solution option, dispatch background exploration:

Agent({
  description: "Explore feasibility of solution option",
  subagent_type: "feasibility-analyst",
  prompt: `Research the feasibility of: <solution description>
Evaluate technical feasibility, effort, risk, extensibility, and maintenance cost.`
})

## Trigger

- Keywords: feasibility, is this possible, can we, should we, explore options, before tech spec

## When NOT to Use

- Already have a tech spec (use `/deep-analyze`)
- Need implementation, not analysis (use `/codex-implement`)
- Quick question (use `/codex-explain` or `/codex-architect`)

## Workflow

```
Resolve → Decompose → Constraints → Code research → Solutions → Codex discussion → Decision → Report
```

### Phase 0: Resolve the feature context

The sets Phase 1 reads have to come from somewhere, and this skill is invoked directly
(`/feasibility-study <topic>`) as often as it is invoked from another skill — so it resolves them
itself rather than assuming a caller supplied them:

```bash
# The node entrypoint. The shell wrapper's own header tells skills to prefer this one once they hold
# `Bash(node:*)` — and this skill now does, for its transport dispatches. The wrapper was named here
# only while that grant was absent; keeping it afterwards would have instructed a second-choice
# entrypoint for a reason that had stopped being true.
node scripts/resolve-feature.js [--feature <key>]
```

The reply is one JSON document. What this skill reads out of it: `scan_error` **first** — the gate
below decides whether anything else in the payload means what it says — then `current_authority`
(what the system does today) and the `design_records` entries — design records carry the *rationale*;
it is the `type: requirements` subset of them that states what was **asked for**, which is why
Phase 1 filters before it selects. Each entry is
`{ file, type, namespace, confidence, is_canonical, role }`, `file` relative to `docs_path`. An empty or non-JSON reply is a failure too — `node` may be
unavailable, which the shim cannot report as a payload. Treat it exactly as `scan_error !== false`
below.

### Phase 1: Requirement Decomposition

**Input source priority**:
1. If a requirements doc resolves from `design_records` → consume as the authoritative statement of
   what was **asked for**, validate via 5-Why. It is a design record, not a description of current
   behaviour: for "what does the system do today", read code, `rules/` and `current_authority`
2. Otherwise → extract requirements from user input via 5-Why analysis

**`design_records` is an array**, so "a requirements doc" needs a rule rather than an assumption — a
split or variant-backed phase contributes more than one. Filter to `type: requirements` first, then:

| # | Candidates (`design_records` where `type: requirements`) | Result |
|---|--------------------------------------------------------|--------|
| 1 | none | Path 2 — extract from user input. A feature with no requirements doc is a normal state, not an exit |
| 2 | exactly one | that one |
| 3 | two or more, exactly one with `is_canonical: true` | that one |
| 4 | two or more, and none or several canonical | **Gate: Need Human**, naming the candidates |

Rows 1 and 4 are different answers: "there is none" is acted on, "there are two" must not be
resolved by picking. The same order `/architecture` applies to its tech-spec candidates.

> **`scan_error` gate.** Gate on **`scan_error !== false`**, not on `scan_error === true`. When it
> is not exactly `false` the four source sets are **unknown, not empty** — the corpus could not be
> enumerated (unreadable directory, broken taxonomy, no repository), *or* the resolver never ran
> and a shell fallback supplied a payload with no such field at all. `{}` is the shape that made
> the stricter test useless: it has no `scan_error`, so `=== true` is false and the gate passes a
> payload that contains nothing. Do not proceed as though the feature has no authority documents —
> report and take the ⚠️ Need Human exit. A `key` may still be present, so a non-null `key` is not
> evidence the sets are complete.

Use "5 Why" to uncover essence:
1. Surface requirement (what user asks for)
2. Underlying problem (why they need it)
3. Success criteria (quantifiable acceptance)

### Phase 2: Constraint Analysis

Inventory constraints by type (Technical, Business, Resource, Compatibility) with flexibility rating.

### Phase 3: Code Research

Research existing codebase:
- Related modules and reusable logic
- Existing design patterns
- Tech debt to work around

### Phase 4: Solution Exploration

Brainstorm 2-3+ solutions, each with:
1. Core idea (one sentence)
2. Implementation path
3. Quantified feasibility (see `references/analysis-phases.md`)
4. Cost and trade-offs

### Phase 5: In-Depth Codex Discussion

**⚠️ Core step — not optional (unless `--no-codex`) ⚠️**

See `references/codex-discussion-guide.md` for full rules and examples.

| Tool | Purpose | When |
|------|---------|------|
| `/codex-brainstorm` | Enumerate all options | At start |
| `/codex-architect` | Evaluate design | After proposal forms |
| `@skills/codex-code-review/references/codex-transport.md` § Resume | Ask details | Anytime |

### Phase 6: Comparative Decision

Side-by-side comparison → filter → recommendation + backup + open questions. The filter uses what
the earlier phases already produced — Phase 2's constraints and § Evaluation Dimensions — and adds
no new scoring. Full rules: `references/analysis-phases.md` § Phase 6.

| Step | Rule |
|------|------|
| 1. Hard constraints | An option that breaks a constraint with Flexibility `None` is infeasible: exclude it and name the constraint |
| 2. Supported dominance | Exclude an option only when another feasible option is at least as good on **every** dimension and strictly better on **at least one**, and evidence (a measurement, cited code, a stated estimate) supports each of those comparisons |
| 3. Evidence gaps | A missing measurement, or two options that share an ordinal bin with no underlying values, is a gap — not a tie and not a loss. The option stays; the gap goes to Open Questions with the measurement that would close it |
| 4. Trade-off | Among the options left, say what the recommendation gives up and what it gets, in the dimensions' own terms |
| 5. Flip condition | Name the **concrete, observable condition** under which the backup becomes the recommendation — a threshold, an event, a measured result |

Steps 4–5 need a second retained option. With one option left, recommend it and report that no
other option was retained; with none, report that no option qualifies and which hard constraints block — never promote
an excluded option to fill the slot.

**Ordinal bins and missing measurements do not prove equivalence.** Two options rated 🟡 on Effort
may be 3 and 10 person-days. Compare the underlying values when they exist; when only the bin is
known, record a gap. Different bins do support an ordering (🟢 is better than 🔴).

## Evaluation Dimensions

| Dimension             | Green | Yellow | Red |
| --------------------- | ----- | ------ | --- |
| Technical Feasibility | Has existing patterns | Needs adaptation | Major innovation |
| Effort                | < 3 person-days | 3-10 person-days | > 10 person-days |
| Risk                  | Small scope | Some uncertainty | Many unknowns |
| Extensibility         | Easy to extend | Needs refactoring | Hard to extend |
| Maintenance Cost      | Clean, easy | Some complexity | Complex |

## Output

```markdown
## Feasibility Study: <title>
### Quantitative Comparison
| Criterion | Option A | Option B | Option C |
|-----------|----------|----------|----------|

### Filter
| Option | Status | Basis |
|--------|--------|-------|
<Retained / Excluded: breaks <hard constraint> / Excluded: dominated by <option> / Retained — evidence gap>

### Recommendation
<selected option, the trade-off it accepts, and the concrete condition that flips it to the backup>
```

## Verification

- [ ] 5 Why decomposition completed
- [ ] Constraints inventoried with flexibility
- [ ] Existing code researched (grep/read)
- [ ] 2-3+ solutions explored with quantified assessment
- [ ] Codex discussion documented (unless `--no-codex`)
- [ ] Comparison table + recommendation + open questions
- [ ] Every excluded option names the hard constraint it breaks or the option that dominates it, with the evidence
- [ ] Evidence gaps retained as open questions — no shared bin or missing measurement treated as equal
- [ ] Recommendation states its trade-off and the concrete condition that flips it to the backup — or says that no other option was retained, or that none qualifies

## References

- Analysis phases: `references/analysis-phases.md`
- Codex discussion: `references/codex-discussion-guide.md`
- Output template: `references/output-template.md`

## Relationship with Other Commands

```
/feasibility-study → /tech-spec → /deep-analyze → /codex-implement
```

## Examples

```
Input: /feasibility-study "Add user quota management"
Action: 5 Why → constraints → code research → 3 solutions → Codex discussion → recommendation

Input: /feasibility-study "Optimize cache" --context src/service/cache.ts
Action: Read cache code → constraints → solutions → Codex brainstorm → comparison → report
```
