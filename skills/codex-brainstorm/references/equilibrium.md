# Stopping Rule, Debate Status and Option Comparison

Two results come out of a brainstorm, and they are reached independently:

| Result | Section | What it rests on |
| ------ | ------- | ---------------- |
| Debate status | § Stopping Rule, § Debate Status | Which objections were raised, answered or left open |
| Option comparison | § Option Comparison | Evidence about each option on each relevant criterion |

Agreement between the two debaters is not evidence about an option, and disagreement does not
cancel a comparison the evidence supports.

## Stopping Rule

```
From round 3 on: stop when a full round passes in which neither side raises a new, un-rebutted objection.
```

The rule is first checked at the end of round 3 — the skill's minimum. Rounds 1 and 2 always run;
a quiet early round is spent testing assumptions and evidence gaps.

"Equilibrium" in this skill names a debate that stopped this way with the two sides in agreement
(§ Debate Status), nothing more. It says the debate has stopped
producing objections; it does not say the outcome is optimal. The debate defines no payoffs and no
strategy sets, so a report never claims a formal game-theory result — not a proven Nash
equilibrium, not a mixed strategy, not optimality.

```
┌──────────────────────────────────────────────────────┐
│ Round N complete (N ≥ 3)                              │
├──────────────────────────────────────────────────────┤
│ Q1: Did Claude raise a new, un-rebutted objection?    │
│     - Yes → continue, unless this was round 5         │
│     - No  → Q2                                        │
├──────────────────────────────────────────────────────┤
│ Q2: Did Codex raise a new, un-rebutted objection?     │
│     - Yes → continue, unless this was round 5         │
│     - No  → stop; status per § Debate Status          │
└──────────────────────────────────────────────────────┘
Round 5 is the last: a "Yes" there stops the debate as Diverged, with the objection listed as open.
```

A repeated objection that was already answered is not new. An objection that only a measurement
can settle is recorded once as an evidence gap (§ Option Comparison); raising it again in a later
round is not new either, so it does not keep the debate open.

## Debate Status

Report exactly one status, decided by where the two positions stand when the debate stops — by
either stopping condition. The first two are both `Equilibrium reached`; they differ in what the two
sides ended up agreeing on. Running out of new objections is not agreement: a debate can stop with
an old disagreement still standing, and that is `Diverged`.

| Status | When | Report line |
| ------ | ---- | ----------- |
| **Equilibrium reached — converged** | The stopping rule fired and both sides hold the same proposal, or the same condition for choosing between proposals | "Equilibrium reached — converged on X" or "… converged: if A then X, if B then Y" |
| **Equilibrium reached — agreed trade-off** | The stopping rule fired and both sides agree that several options remain, each better — or claimed to be better, pending a measurement — on a different criterion | "Equilibrium reached — agreed trade-off between X and Y" |
| **Diverged** | The debate stopped — max rounds reached, or no new objections — with the sides still apart: an objection open, or an answered one that the other side does not accept | "Diverged: [unresolved points], need [additional info]" |

The status records where the debaters ended, not what the evidence shows. Two sides can agree on a
trade-off whose one side nobody measured: the status is still "agreed trade-off", and § Option
Comparison reports the unmeasured side as an evidence gap.

## Option Comparison

Run this whatever the debate status is.

| Step | Rule |
| ---- | ---- |
| 1. Feasible set | Drop any option that breaks a hard constraint. Name the constraint. An infeasible option is excluded, not "dominated" |
| 2. Relevant criteria | Use the criteria the topic and its constraints name. State the direction of each: lower is better, or higher is better. A criterion first raised during the debate joins them only once both sides accept it as relevant, and then needs a value per option like any other; until then it is listed as an open objection |
| 3. Dominance | X dominates Y **only if** X is at least as good as Y on **every** relevant criterion **and** strictly better on **at least one**. Exclude Y and name X |
| 4. Evidence gap | A value nobody measured or cited is unknown. An unknown supports neither "at least as good" nor "worse", so it supports no dominance claim in either direction. Keep the option, flag the gap, and name the measurement that would close it |
| 5. Retained options | Every feasible option that nothing dominates. State the trade-off between them in the criteria's own units |

Being better on most criteria is not dominance. Neither is being preferred by both debaters.

### Worked example

Three feasible options, two criteria, lower is better on both:

| Option | Effort | Latency |
| ------ | ------ | ------- |
| A | 2 days | 100 ms |
| B | 4 days | 100 ms |
| C | 4 days | 60 ms |

| Pair | Effort | Latency | Result |
| ---- | ------ | ------- | ------ |
| A vs B | A better (2 < 4) | equal | **A dominates B** — B excluded |
| C vs B | equal | C better (60 < 100) | C dominates B as well |
| A vs C | A better (2 < 4) | C better (60 < 100) | Neither dominates — both retained |

Result: exclude B; retain A and C. The trade-off: A ships 2 days sooner, C responds 40 ms faster.
Which matters more is a decision for whoever owns the latency budget and the deadline, not
something the comparison settles.

With an unknown value the same table gives a different answer:

| Unknown | Effect |
| ------- | ------ |
| C's latency | C vs B cannot be decided, and A vs C still has A better on effort only. C is retained with the gap "measure C's latency". B is still excluded, because A vs B uses known values only |
| B's latency | A can no longer be shown to be at least as good as B on latency, so B is **not** excluded. B is retained with the gap "measure B's latency" |

## Per-Round Stopping Check

```markdown
## Stopping Check (Round N)

### My Position

- Current proposal: [X]
- Updated: [Yes/No]

### New Objections This Round

- Did I raise a new, un-rebutted objection against Codex's proposal?
  - [ ] Yes → Continue (list them) — in round 5: stop, Diverged
  - [ ] No
- Did Codex raise a new, un-rebutted objection against my proposal?
  - [ ] Yes → Continue — in round 5: stop, Diverged
  - [ ] No

### Debate Status

- [ ] Continue debate
- [ ] Stop — converged on [X]
- [ ] Stop — converged on a condition: if [A] then [X], if [B] then [Y]
- [ ] Stop — agreed trade-off between [X] and [Y]
- [ ] Stop — no new objections, but still apart on [issue] — Diverged, add the divergence sections to the report
- [ ] Max rounds reached — Diverged, add the divergence sections to the report

### Evidence Gaps Recorded

- [Option] — [criterion] unknown — [measurement that would close it]
```

## Handling Divergence

There is one final report — `templates.md` § Phase 5 — whatever the status. A diverged debate
fills it like any other, option comparison included: an option the evidence shows to be dominated
is excluded even though the debaters disagree about the rest. It then adds these sections after
`## Debate Status`, and its Recommendation is the conditional one below.

```markdown
## Divergence Points

| Issue | Claude Position | Codex Position | Reason for Divergence |
| ----- | --------------- | -------------- | --------------------- |
| [X]   | ...             | ...            | Different assumptions |

## Additional Information Needed

1. [If A is known, B can be determined]
2. [If constraint C is confirmed, convergence is possible]

## Conditional Recommendations

- If [condition 1]: Recommend [a retained option]
- If [condition 2]: Recommend [another retained option]
```

Recommend only options § Option Comparison retained — never one this report excluded as infeasible
or dominated, whichever debater proposed it. If a new measurement or a changed constraint could
bring an excluded option back, say so under Additional Information Needed: it needs a fresh
comparison before anyone recommends it.
