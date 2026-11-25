# Codex Brainstorm Templates

## Phase 1: Claude Independent Analysis

```markdown
## Claude Independent Analysis

### Problem Essence

#### Surface Requirement

User wants [X]

#### 5 Whys

1. Why: Why do we need [X]? → Because [Y]
2. Why: Why is [Y] important? → Because [Z]
3. Why: Why is [Z] a problem? → Because [...]
4. Why: ...
5. Why: ...

#### Core Problem

The real problem to solve is [core problem]

### Constraint Inventory

| Type     | Constraint | Flexibility  | If broken...       |
| -------- | ---------- | ------------ | ------------------ |
| Technical | ...       | None/Low/Med | What happens?      |
| Business | ...        | ...          | ...                |
| Resource | ...        | ...          | ...                |

### Claude's Optimal Hypothesis

**Proposal: [specific proposal]**

Rationale:

1. [Why this is optimal]
2. [...]

Self-critique (potential weaknesses):

1. [Weakness 1]
2. [Weakness 2]

### Prepare for Debate

Anticipated proposals from Codex:

1. [Proposal A] → My attack point: [...]
2. [Proposal B] → My attack point: [...]
```

## Phase 3: Debate Record

```markdown
## Debate Record

### Round N

**Codex Position**: [Proposal Y]

- Rationale: [...]
- Self-identified weaknesses: [...]

**Claude Attack**:

1. [Attack point 1]
2. [Attack point 2]

**Codex Rebuttal**:

1. [Rebuttal 1]
2. [Rebuttal 2]

**Claude Response**:

- Regarding Rebuttal 1: [Agree/Disagree] + [Reason]
- Regarding Rebuttal 2: [Agree/Disagree] + [Reason]

**Position Update**:

- Claude: [Maintain/Update to Z]
- Codex: [Maintain/Update to W]

**Stopping Check**:

- Did Claude raise a new, un-rebutted objection this round? [Yes/No]
- Did Codex raise a new, un-rebutted objection this round? [Yes/No]
- Evidence gaps recorded this round: [option — criterion — measurement needed] / none
```

## Phase 5: Final Report

The debate status and the option comparison are separate sections because they are separate
results (`equilibrium.md`). This is the only final report: fill both whatever the status is, and
when the status is `Diverged` add the sections in `equilibrium.md` § Handling Divergence. Do not label the outcome a Nash
equilibrium, a mixed strategy or "optimal" — the stopping rule proves none of them.

```markdown
# Brainstorm Report: [Topic]

## Executive Summary

| Item              | Value                                  |
| ----------------- | -------------------------------------- |
| Debate Status     | Equilibrium reached — converged / Equilibrium reached — agreed trade-off / Diverged |
| Stopped Because   | No new objections in round N / Max rounds reached (either can end `Diverged`) |
| Debate Rounds     | N rounds                               |
| Retained Options  | [X], [Y]                               |
| Excluded Options  | [B] (dominated by [A])                 |
| Evidence Gaps     | N — [short list] / none                |
| Confidence        | Low (diverged — whatever else is true) / otherwise High (converged, no evidence gap) or Medium (agreed trade-off, or any evidence gap) |

## Debate Status

- **Where the positions ended**: [same proposal / same condition for choosing / agreed trade-off / still apart]
- **Open objections**: [none / list]

## Option Comparison

Criteria and direction: [criterion 1 — lower is better], [criterion 2 — higher is better]

| Option | [Criterion 1] | [Criterion 2] | Status | Basis |
| ------ | ------------- | ------------- | ------ | ----- |
| [A]    | [value]       | [value]       | Retained | Not dominated |
| [B]    | [value]       | [value]       | Excluded | Dominated by [A]: at least as good on every criterion, strictly better on [criterion 1] |
| [C]    | [value]       | unknown       | Retained — evidence gap | [criterion 2] not measured |
| [D]    | [value]       | [value]       | Excluded | Infeasible: breaks [hard constraint] |

### Trade-off Between Retained Options

[A] gives [amount, in the criterion's units] on [criterion 1]; [C] gives [amount] on [criterion 2].

State an amount only where both values are known. Where one is an evidence gap, write the known
side and make the other conditional: "[A] gives [amount] on [criterion 1]; whether [C] gives
anything on [criterion 2] depends on [measurement]".

### Evidence Gaps

| Option | Unknown | Measurement That Would Close It | What It Could Change |
| ------ | ------- | ------------------------------- | -------------------- |
| [C]    | [criterion 2] | [how to measure]          | [C excluded / C dominates A / trade-off stands] |

## Recommendation

**Proposal: [X]** — [why, given the trade-off above; or "no single proposal: choose by [condition]"]

### Rejected Proposals

| Proposal | Proposer | Rejection Reason | Rejected In |
| -------- | -------- | ---------------- | ----------- |
| [B]      | Codex    | Dominated by [A] / infeasible / withdrawn after [objection] | R3 |

## Debate Summary

### Key Turning Points

1. **R2**: Claude accepted Codex's criticism of [X], abandoned [A]
2. **R4**: Codex acknowledged [constraint] is unavoidable, updated position
3. **R5**: Both converged to [X]

### Most Valuable Arguments

| Source | Argument   | Impact                       |
| ------ | ---------- | ---------------------------- |
| Claude | [argument] | Led Codex to abandon [B]     |
| Codex  | [argument] | Led Claude to update to [X]  |

## Implementation Recommendations

1. [Specific step 1]
2. [Specific step 2]
3. [Specific step 3]

## Risks and Mitigations

| Risk     | Probability  | Mitigation   |
| -------- | ------------ | ------------ |
| [Risk 1] | Low/Med/High | [Mitigation] |
```
