---
name: codex-brainstorm
description: "Adversarial brainstorming via Claude+Codex debate. Use when: exploring solutions, feasibility analysis, exhaustive enumeration. Not for: implementation (use feature-dev), architecture only (use codex-architect). Output: debate status (converged or diverged) + non-dominated options with trade-offs and evidence gaps + action items."
allowed-tools: Read, Grep, Glob, Bash(ls:*), Bash(find:*), Bash(node:*), Write
---

# Codex Brainstorm Skill

## Trigger

- Keywords: brainstorm, exhaust possibilities, explore solutions, deep discussion, feasibility analysis, solution exploration, Nash equilibrium

## When NOT to Use

- Simple technical Q&A (answer directly)
- Already have a clear solution (implement directly)
- Only need code review (use `/codex-review`)

## Core Principle

```
⚠️ Independent Research → Adversarial Debate → Stop when a round raises no new objection ⚠️
```

The report carries **two results, reached independently of each other**:

| Result | Question it answers | Decided by |
|--------|--------------------|------------|
| **Debate status** | Did the two positions converge, or do they still diverge? | The objections raised and answered across rounds |
| **Option comparison** | Which feasible options does the evidence leave standing? | Dominance over the relevant criteria — `references/equilibrium.md` § Option Comparison |

Neither decides the other. Agreement does not make an option dominant, and a debate that ends
divided still excludes an option the evidence shows to be dominated.

**"No new objections" is a stopping rule, not a proof.** The debate stops at the round in
which neither side raised a new, un-rebutted objection — the point where further debate stops
paying — and `Equilibrium reached` is reserved for a stop that leaves the two sides in agreement. No payoff model was defined, so the report never claims a formal game-theory result: not
that a Nash equilibrium was proven, not that the outcome is optimal, not a "mixed strategy".

## Workflow

| Phase | Action                                                  | Output                      |
| ----- | ------------------------------------------------------- | --------------------------- |
| 1     | **Claude independent research** + analysis, forms Position A | Claude's optimal hypothesis |
| 2     | **Codex independent research** + analysis, forms Position B | Codex's optimal hypothesis  |
| 3     | Multi-round adversarial debate, mutual attacks          | Debate exchange record      |
| 4     | Apply the stopping rule; compare the options by dominance | Debate status + retained options |
| 5     | Output final report                                     | Brainstorm report           |

### Phase 2: Codex Independent Research (Critical)

**⚠️ Must let Codex research independently; do NOT feed Claude's analysis results ⚠️**

Dispatch this body per `@skills/codex-code-review/references/codex-transport.md` § Start — a **fresh** thread for Phase 2. The transport pins the
sandbox and the approval policy, so nothing is chosen here. **Save the returned `threadId`**; the
Phase 3 debate rounds continue that same thread per its § Resume (`references/techniques.md`).
Bind every placeholder before writing `prompt.md` — nothing evaluates an expression in a body-only
template.

You are a senior architect. Conduct an **independent analysis** of the following topic.

## Topic

${TOPIC}

## Constraints

${CONSTRAINTS}

## ⚠️ Important: You must research independently ⚠️

Before forming conclusions, you **must** first:
1. Discover the directory structure: `ls` at the repository root, then list the directories it actually shows — do not assume a `src/` or `test/unit/` layout; many repositories, this one included, have neither
2. Search related code: `grep -rn "keyword" . -l | head -10` — rooted at the repository, or at a directory the discovery step above actually surfaced; never at an assumed `src/`
3. Read relevant files to confirm existing implementations

## Output Requirements

1. Research summary (related modules, existing patterns)
2. Your position + supporting arguments
3. Potential risks


### Phase 3: Adversarial Debate

Structure per round:

1. Claude attacks flaws in Codex's proposal
2. Codex rebuts or updates position
3. Stopping check: did either side raise a new, un-rebutted objection this round?

### Termination Conditions

| Condition         | Description                              | Debate status to report |
| ----------------- | ---------------------------------------- | ----------------------- |
| No new objections | From round 3 on, a full round in which neither side raises a new, un-rebutted objection | Decided by where the positions stand: `Equilibrium reached` — **converged** (one proposal, or one agreed condition for choosing) or an **agreed trade-off** between retained options; `Diverged` when an earlier disagreement is still unresolved |
| Max rounds        | 5 rounds reached and objections are still open | `Diverged` |

`Diverged` uses the same report, with the divergence sections added
(`references/equilibrium.md` § Handling Divergence).

Rounds 1–3 always run: the stopping rule is first checked at the end of round 3. A quiet early
round is spent testing assumptions and evidence gaps, not ending the debate.

A termination condition ends the debate; it does not rank the options. Run Phase 4's comparison
under either status.

### Phase 4: Option Comparison (independent of the debate status)

Full rules and the worked example: `references/equilibrium.md` § Option Comparison.

1. **Feasible set** — drop an option that breaks a hard constraint, naming the constraint.
2. **Relevant criteria** — the ones the topic and constraints name, each with its direction
   (lower or higher is better). A criterion first raised mid-debate joins them only once both
   sides accept it as relevant; until then it is an open objection, not a column.
3. **Dominance** — a feasible option dominates another **only if** it is at least as good on
   **every** relevant criterion **and** strictly better on **at least one**. Exclude the dominated
   option and name what dominates it.
4. **Evidence gap** — an unknown value supports no dominance claim in either direction. The option
   stays, flagged, with the measurement that would settle it.
5. **Retained options** — every option nothing dominates, with the trade-off between them stated in
   the criteria's own units.

Example (lower is better on both): A = 2 days / 100 ms, B = 4 days / 100 ms, C = 4 days / 60 ms.
A dominates B (fewer days, equal latency), so B is excluded. A and C are both retained: A ships
2 days sooner, C is 40 ms faster — a trade-off, not a ranking. Were C's latency unknown, it would
be an evidence gap: C stays, and "measure C's latency" goes in the report.

## Verification

- [ ] Claude formed an independent position (not following Codex)
- [ ] Codex performed code research (not speculating)
- [ ] At least 3 rounds of adversarial debate
- [ ] Each round has clear attack/defense records
- [ ] Final report states the debate status (converged, agreed trade-off or diverged) without a formal game-theory claim
- [ ] Options compared by dominance separately from the debate status; every exclusion names what dominates it or the hard constraint it breaks
- [ ] Unknown values reported as evidence gaps, not as ties or losses

## References

| File             | Purpose                        |
| ---------------- | ------------------------------ |
| `references/templates.md`   | Claude/debate/report templates |
| `references/techniques.md`  | Attack/defense techniques      |
| `references/equilibrium.md` | Stopping rule, debate status, option comparison by dominance |

## Example

```
Input: What implementation approaches are available for this requirement?

Phase 1: Claude independent research → Position A (Solution X is optimal)
Phase 2: Codex independent research → Position B (Solution Y is optimal)
Phase 3: Adversarial debate
  - R1: Claude attacks Y's scalability / Codex attacks X's complexity
  - R2: Claude rebuts / Codex concedes and updates position
  - R3: Both converge to Solution Z, no new objections → stop
Phase 4: Compare X, Y, Z by dominance → Z retained, X dominated by Z, Y retained pending one measurement
Phase 5: Report — debate status: Equilibrium reached (converged on Z); evidence gap: Y's latency
```
