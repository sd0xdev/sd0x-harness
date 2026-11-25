# 6-Dimension Necessity Rubric

Authoritative definition of the 6 dimensions used by `/necessity-audit` Phase A scoring and Phase B debate topic.

**These dimensions are intentionally distinct from `/fp-brief`'s 6 FP dimensions** — FP dimensions extract reasoning chains; necessity dimensions challenge existence.

## Depth → Active Dimensions

| Depth | Active Dimensions |
|-------|-------------------|
| `brief` | 1, 2, 3 (Necessity Now, Abstraction Justification, Extensibility Speculation) |
| `normal` | 1, 2, 3, 4, 5, 6 (all) |
| `deep` | 1, 2, 3, 4, 5, 6 (all) + the debate must end in agreement (`Equilibrium reached`; `Diverged` fails) |

## The 6 Dimensions

### 1. Necessity Now

**Challenge question**: Does this element solve a problem that **exists today**, or a problem that **might exist later**?

| Severity | Indicator |
|----------|-----------|
| Clean | Clear current need; 1+ named stakeholder with active requirement |
| Low | Current need plausible; implied stakeholder |
| Med | "We might need this eventually" language; no named requester |
| High | Explicitly speculative ("in the future...", "for potential growth..."); no concrete use case |

**Typical evidence**: `file:line` of the actual caller invoking this FR; OR `doc:section` of requirements referencing the FR as active need.

### 2. Abstraction Justification

**Challenge question**: Does this abstraction layer have **≥2 concrete consumers**, or is it abstraction-for-abstraction?

| Severity | Indicator |
|----------|-----------|
| Clean | ≥2 consumers visible in code (`file:line` refs) |
| Low | 2 consumers planned, 1 implemented |
| Med | 1 consumer + "this allows future X" reasoning |
| High | 0 consumers; abstraction is conceptual only |

**Typical evidence**: `grep -rl "<abstraction-name>" --include="*.ts" --include="*.js"` count.

### 3. Extensibility Speculation

**Challenge question**: Does this extension point have **known future users**, or is it "someone might want to extend this"?

| Severity | Indicator |
|----------|-----------|
| Clean | Named extension plan in roadmap + at least one extension scaffolded |
| Low | Named extension plan in roadmap |
| Med | Generic "plugin interface" with no announced plugin |
| High | Extensibility carved out with zero named extenders |

**Typical evidence**: Extension registry / plugin list in code; OR `doc:section` naming specific future extension.

### 4. Configurability Excess

**Challenge question**: Does this flag / config option have **real use cases with distinct stakeholders**?

| Severity | Indicator |
|----------|-----------|
| Clean | Flag toggles production-relevant behavior; ≥2 stakeholder groups want different values |
| Low | Flag used in tests + dev / prod difference |
| Med | Flag exists "for flexibility" with no named toggler |
| High | Flag adds complexity with no known consumer |

**Typical evidence**: `grep` for flag references; `file:line` of decisions that depend on flag value.

### 5. Premature Optimization

**Challenge question**: Is this optimization backed by **measurement**, or is it precautionary?

| Severity | Indicator |
|----------|-----------|
| Clean | Benchmark / profiler output + measured baseline + target |
| Low | Known bottleneck from production metrics (no formal benchmark yet) |
| Med | "This could be slow" reasoning; no measurement |
| High | Cache / batch / async added without any performance data |

**Typical evidence**: Benchmark file `file:line`; OR ADR documenting measured requirement.

### 6. Scope Drift

**Challenge question**: Does this element solve the **original Problem Statement**, or has it drifted into adjacent concerns?

| Severity | Indicator |
|----------|-----------|
| Clean | Element directly addresses a 5-Why line from `1-requirements.md` |
| Low | Element supports an acceptance signal |
| Med | Element addresses adjacent concern not in original scope |
| High | Element addresses unrelated concern ("while we're here, let's also...") |

**Typical evidence**: `doc:section` mapping element to Problem Statement or Acceptance Signal in `1-requirements.md`; OR absence thereof.

## Aggregate Severity per Dimension

Dimension-level severity is derived from element counts in each dimension (see `consolidate.js::aggregateDimensions`):

| Severity | Condition |
|----------|-----------|
| High | ≥2 Cut in dimension |
| Med | 1 Cut OR ≥2 Review |
| Low | ≥1 Review |
| Clean | No Review, no Cut |
| Skipped | Dimension inactive per `--depth` |

## Classification Thresholds (per element)

Applied by `classify.js`:

| Classification | Condition |
|----------------|-----------|
| Cut | ≥1 active dimension scores High |
| Review | ≥2 active dimensions score Med (and no High) |
| Keep | Otherwise |

Codex may independently re-classify during Phase B debate. Final classification uses **stricter direction** (Keep → Review → Cut).
