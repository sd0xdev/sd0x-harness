# Analysis Phases

## Phase 1: Requirement Decomposition (First Principles)

Use the "5 Why" method to uncover the essence of the requirement:

1. What does the user superficially want?
2. Why do they want this? (First layer)
3. Why? (Continue probing to the core problem)
4. What are the success criteria? (Quantifiable acceptance conditions)

## Phase 2: Constraint Analysis

Inventory all constraints:

| Type       | Constraint          | Source    | Flexibility |
| ---------- | ------------------- | --------- | ----------- |
| Technical  | ...                 | ...       | None/Low/Med|
| Business   | ...                 | ...       | ...         |
| Resource   | ...                 | ...       | ...         |
| Compat     | No breaking changes | Stability | Low         |

## Phase 3: Code Research

Research existing code capabilities:

```bash
# Search related modules
grep -rln "related keyword" . | head -20   # rooted at the repository, not an assumed src/

# Check existing implementations
ls   # then list the directories this actually shows; there is no assumed src/ layout
```

**Must verify**:

- Are there similar features that can be reused?
- What approaches does existing code support?
- What design patterns can be leveraged?
- What tech debt needs to be worked around?

## Phase 4: Solution Exploration (Core)

**Brainstorm at least 2-3 solutions in different directions** (no upper limit, scale with problem complexity)

Each solution needs:

1. Core idea (one sentence)
2. Implementation path (steps)
3. Quantified feasibility assessment (see evaluation dimensions)
4. Cost and trade-offs

## Evaluation Dimension Standards

| Dimension             | Green                         | Yellow                   | Red                  |
| --------------------- | ----------------------------- | ------------------------ | -------------------- |
| Technical Feasibility | Has existing patterns, direct use | Needs some adaptation | Requires major innovation |
| Effort                | < 3 person-days               | 3-10 person-days         | > 10 person-days     |
| Risk                  | Small change scope, manageable| Some uncertainty          | Many unknowns        |
| Extensibility         | Easy to extend                | Needs refactoring to extend | Hard to extend     |
| Maintenance Cost      | Clean code, easy to understand| Some complexity           | Complex, hard to maintain |

## Phase 6: Comparative Decision

- Side-by-side comparison table (all dimensions)
- Filter (below): hard constraints, then supported dominance, keeping evidence gaps
- Recommended solution, the trade-off it accepts, and the condition that flips it to the backup
- Backup solution and applicable scenarios
- Open questions (items needing further confirmation, including every evidence gap)

### Filter

The inputs already exist: the Phase 2 constraint inventory and the evaluation dimensions above.

| Step | Rule | Recorded as |
| ---- | ---- | ----------- |
| 1. Hard constraints | A constraint with Flexibility `None` is hard. An option that breaks one is infeasible | `Excluded: breaks <constraint>` |
| 2. Supported dominance | Option X dominates Y only if X is at least as good on every dimension and strictly better on at least one, and each comparison has evidence behind it | `Excluded: dominated by X` + the evidence |
| 3. Evidence gaps | A dimension with no measurement, or a comparison that rests only on a shared bin, cannot support step 2 | `Retained — evidence gap` + an open question |

What counts as support for a comparison:

| Situation | Supports "at least as good"? | Supports "strictly better"? |
| --------- | ---------------------------- | --------------------------- |
| Both values measured or estimated (5d vs 10d) | Yes | Yes, when they differ |
| Different bins (🟢 vs 🔴) | Yes, for the better bin | Yes |
| Same bin, underlying values known (3d vs 10d, both 🟡) | Use the values, not the bin | Use the values, not the bin |
| Same bin, no underlying values | **No** — evidence gap | No |
| One value missing | **No** — evidence gap | No |

A shared bin or a missing measurement is never recorded as "equal". Equal needs evidence too.

### How many options are left

| Retained after the filter | Recommendation | Backup and flip condition |
| ------------------------- | -------------- | ------------------------- |
| Two or more | One of them | A retained option as backup, with its flip condition |
| Exactly one | That one | `None — no other retained option`; no flip condition. Never name an excluded option as backup |
| None | **No option qualifies** — list each option with the hard constraint it breaks | None. Say what would have to change: a constraint's flexibility, or a new option |

### Trade-off and flip condition

Applies when two or more options are retained.

| Element | Requirement | Example |
| ------- | ----------- | ------- |
| Trade-off | What the recommendation gives up and gets, in the dimensions' own terms | "A costs 5 fewer person-days; B is easier to extend to multi-tenant" |
| Flip condition | A concrete, observable condition that makes the backup the recommendation | "If a second tenant is committed before the release, choose B" |
| Not a flip condition | A condition nobody could observe or check | "If requirements change", "if needed later" |

The backup is the retained option the flip condition points to — the one that becomes the better
choice when that condition holds — not simply the runner-up on today's numbers.

When an evidence gap could reverse the recommendation, closing that gap is the flip condition —
state the measurement and the result that would flip it.
