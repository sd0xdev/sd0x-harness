# Feasibility Study Output Template

```markdown
# [Requirement Name] Feasibility Study Report

## 1. Problem Essence

### 1.1 Surface Requirement

> What the user is asking for

### 1.2 Underlying Problem

> What is the core problem to actually solve?
> (5 Why probing result)

### 1.3 Success Criteria

> How do we know the problem is solved?
> (Quantifiable acceptance conditions)

## 2. Constraints

| Type | Constraint | Source | Flexibility |
| ---- | ---------- | ------ | ----------- |
| ...  | ...        | ...    | ...         |

## 3. Existing Capability Inventory

### 3.1 Related Modules

- `src/xxx.ts` - Reusable XX logic

### 3.2 Design Patterns

- Implementation approach of similar features

### 3.3 Tech Debt

- Known issues to work around

## 4. Possible Solutions

### Option A: [Description]

**Core idea**: One sentence

**Implementation path**:

1. ...
2. ...

**Feasibility assessment**:
| Dimension | Rating | Notes |
|-----------|:------:|-------|
| Technical Feasibility | 🟢/🟡/🔴 | ... |
| Effort | ... | ... |
| Risk | ... | ... |
| Extensibility | ... | ... |

**Cost**:

- ...

---

### Option B: [Description]

(Same structure)

---

### Option C: [Description]

(Same structure, quantity is flexible)

## 5. Codex In-Depth Discussion Record

### 5.1 Discussion Process Summary

| Round | Discussion Topic             | Codex Key Viewpoint |
| ----- | ---------------------------- | ------------------- |
| 1     | Initial solution enumeration | ...                 |
| 2     | Follow-up on details         | ...                 |
| 3     | Verify after modification    | ...                 |

### 5.2 Solution Directions Suggested by Codex

- ...

### 5.3 Risks/Issues Identified by Codex

- ...

### 5.4 Differences from Claude's Analysis

| Viewpoint               | Claude | Codex | Adopted |
| ----------------------- | ------ | ----- | ------- |
| Core problem understanding | ... | ...   | ...     |
| Recommended direction   | ...    | ...   | ...     |
| Risk assessment         | ...    | ...   | ...     |

### 5.5 Integrated Conclusion

> Combined recommendation from both perspectives, with trade-off rationale

## 6. Solution Comparison

| Dimension             | Option A | Option B | ... |
| --------------------- | :------: | :------: | :-: |
| Technical Feasibility |   🟢    |   🟡    | ... |
| Effort                |   5d     |  10d     | ... |
| Risk                  |   🟢    |   🟡    | ... |
| Extensibility         |   🟡    |   🟢    | ... |
| Maintenance Cost      |   🟢    |   🟢    | ... |

Give the underlying value beside a rating wherever one exists (`🟡 5d`). A shared rating without
values is an evidence gap, not a tie.

### 6.1 Filter

One row per option, each with one of these statuses. The rows must agree with the table above:
compare pairwise, and mark an option dominated only when some one feasible option is supported as
at least as good on every dimension and strictly better on one. Against that option, a dimension
where the candidate is better, or shares a bin with no values, means it is not dominated by it.

| Option | Status | Basis (evidence) |
| ------ | ------ | ---------------- |
| [W] | Retained | Not dominated |
| [X] | Excluded: dominated by [W] | [per dimension, the evidence that W is at least as good]; strictly better on [dimension] ([value] vs [value]) |
| [Y] | Excluded: breaks [hard constraint] | [constraint, Flexibility None] |
| [Z] | Retained — evidence gap | [dimension] not measured; see Open Questions |

## 7. Recommendation

**Recommended**: [a retained option]
**Rationale**:

- Meets constraints: [list]
- Trade-off: [what the recommendation gives up, and what it gets, against the backup] — `n/a` when no other option was retained
- Codex viewpoint: [agreement/additions]

**Backup**: [another retained option] — write `None — no other retained option` when the filter left only one
**Flips to backup when**: [concrete, observable condition — a threshold, an event or a measured result]; omit when there is no backup

If the filter left no option at all, replace this section with: **No option qualifies** — [each
option and the hard constraint it breaks] — and name what would have to change (a constraint's
flexibility, or a new option) in Open Questions.

## 8. Open Questions

- [ ] Question 1
- [ ] Evidence gap: [option] — [dimension] unknown — [measurement that would close it] — [what the result could change]

## 9. Next Steps

- `/tech-spec` - Detailed design for the selected solution
- `/deep-analyze` - Deepen the roadmap for the selected solution
```
