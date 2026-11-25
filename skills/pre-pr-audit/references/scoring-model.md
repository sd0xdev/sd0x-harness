# Scoring Model — Pre-PR Audit

## Check-Level Scoring

| Result | Value | When |
|--------|-------|------|
| Pass | 1.0 | Check fully satisfied |
| Partial | 0.5 | Partially met (e.g., some tests exist but incomplete) |
| Fail | 0.0 | Check not met |
| N/A | excluded | Check not applicable (e.g., no request doc for AC trace) |

**N/A means "does not apply", never "could not be obtained".** A check that applies to this change
but has no evidence — no test through a changed consumer path, nothing asserting on a changed output
— is a **Fail (0.0)** and is listed as missing key evidence (`../SKILL.md` § Key Evidence). Excluding
it would renormalize the weights around the gap and raise the score because evidence is absent.
The one existing exception stays as it is: with no test execution data at all, Execution Integrity
is N/A under the Static-only cap (0.6) below — and that too is listed as missing key evidence.

## Dimension Score

```
dimension_score = (Σ applicable_check_values / applicable_check_count) × 100
dimension_confidence = (applicable_check_count / total_check_count) × 100
```

## Dimension Weights

| # | Dimension | Weight |
|---|-----------|--------|
| 1 | Execution Integrity | 25 |
| 2 | Coverage Adequacy | 25 |
| 3 | Test Quality | 20 |
| 4 | Risk-to-Test Alignment | 20 |
| 5 | Evidence Governance | 10 |
| | **Total** | **100** |

## Raw Score (N/A Renormalization)

When one or more dimensions are N/A, exclude them and renormalize weights:

```
raw = Σ(score_i × weight_i) / Σ(weight_i)
```

Where `i` iterates only over dimensions with score ≠ N/A.

**Edge case**: If all dimensions are N/A → raw = 0, gate = ⛔ PR-Blocked.

## Evidence Confidence Cap

| Level | Condition | Cap |
|-------|-----------|-----|
| Full | All 5 dimensions have data | 1.0 |
| Partial | 1 dimension N/A | 0.9 |
| Limited | 2+ dimensions N/A | 0.75 |
| Static-only | No test execution data (Execution Integrity N/A) | 0.6 |

## Final Index

```
final_index = round(raw × cap)
```

Clamped to 0-100.

## Gate Mapping

| Score | User Gate | Sentinel |
|-------|-----------|----------|
| >=85 | ✅ Ready | `✅ PR-Ready` |
| 60-84 | ⚠️ Needs attention | `⚠️ PR-Caution` |
| <60 | ⛔ Not ready | `⛔ PR-Blocked` |

### Missing-Evidence Ceiling

Applied after the score maps to a gate, and before hard-fails:

| Missing key evidence (`../SKILL.md` § Key Evidence) | Gate |
|------------------------------------------------------|------|
| None | As mapped above |
| One or more items | At most `⚠️ PR-Caution` — a score ≥ 85 does not yield `✅ PR-Ready` |

### Worked Examples

| Case | Raw | Cap | Final | Missing key evidence | Hard-fail | Gate |
|------|-----|-----|-------|----------------------|-----------|------|
| Everything present | 92 | 1.0 | 92 | none | none | `✅ PR-Ready` |
| High raw score, no test execution data | 92 | 0.6 | 55 | test execution | none | `⛔ PR-Blocked` |
| High raw score, changed output path untested | 96 | 1.0 | 96 | output path | none | `⚠️ PR-Caution` |
| High raw score, changed consumer path untested | 90 | 0.9 | 81 | consumer path | none | `⚠️ PR-Caution` |
| High raw score, precommit stale | 95 | 1.0 | 95 | none | precommit stale | `⛔ PR-Blocked (hard-fail)` |

## Diagnostic Mapping (report body)

| Score | Diagnostic |
|-------|-----------|
| >=85 | Adequate |
| 75-84 | Adequate with exceptions |
| 60-74 | Need Human |
| <60 | Inadequate |

## Hard-Fail Precedence

Hard-fail overrides are evaluated **before** score-based gating. Any hard-fail forces `⛔ PR-Blocked` regardless of final_index.

Order of precedence: hard-fail → missing-evidence ceiling → score. The summary reports all three
when they apply; a higher layer never hides a lower one's finding.

## Strict Mode Exit Codes

| Gate | Exit Code |
|------|-----------|
| ✅ PR-Ready | 0 |
| ⚠️ PR-Caution | 0 (advisory) |
| ⛔ PR-Blocked | 1 |
| Hard-fail triggered | 2 |
