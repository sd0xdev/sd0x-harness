# Output Template — Pre-PR Audit

## Markdown Report

```markdown
## Pre-PR Audit Report

| Field | Value |
|-------|-------|
| Branch | `<branch>` |
| HEAD | `<sha>` |
| Mode | fast / deep |
| Timestamp | <ISO 8601> |

### Confidence Index: <final>/100 <sentinel>

Raw <raw> × evidence cap <cap> = <final>. <one line: why the cap is below 1.0, or "all five dimensions have data" — write "full evidence" only when Not Verified below is also "none">

**Hard-fails**: <none | each triggered override by name>
**Not Verified (key evidence missing)**: <none | each item: test execution / consumer path of `<symbol>` / output path `<what is emitted>` / risk input>

The four lines above are the summary. They are never shortened to the number and the sentinel
alone, and the raw score is never shown without its cap.

| Dimension | Score | Confidence | Status |
|-----------|-------|------------|--------|
| Execution Integrity | <N> | <N>% | ✅/⚠️/⛔ |
| Coverage Adequacy | <N> | <N>% | ✅/⚠️/⛔ |
| Test Quality | <N> | <N>% | ✅/⚠️/⛔ |
| Risk-to-Test Alignment | <N> | <N>% | ✅/⚠️/⛔ |
| Evidence Governance | <N> | <N>% | ✅/⚠️/⛔ |

### Hard-Fail Checks

- [x] Precommit passed (HEAD match)
- [x] No policy breaches
- [x] Evidence fresh
- [x] No critical untested files

### Findings

- [P1] <file:line> <description> → <recommendation>
- [P2] <description>

### Next Actions

1. <prioritized action>
2. <action>

### Gate: <sentinel>
```

## Sentinel Strings

| Gate | Sentinel | Exit Code (strict) |
|------|----------|--------------------|
| ✅ Ready | `✅ PR-Ready` | 0 |
| ⚠️ Needs attention | `⚠️ PR-Caution` | 0 |
| ⛔ Not ready | `⛔ PR-Blocked` | 1 |
| Hard-fail | `⛔ PR-Blocked (hard-fail)` | 2 |

## JSON Schema (`--json`)

```json
{
  "version": 1,
  "branch": "<string>",
  "head": "<sha>",
  "mode": "fast|deep",
  "timestamp": "<ISO 8601>",
  "confidence_index": 82,
  "raw_score": 91,
  "gate": "PR-Ready|PR-Caution|PR-Blocked",
  "evidence_cap": 0.9,
  "missing_evidence": [
    { "kind": "test_execution|consumer_path|output_path|risk_input", "subject": "exportReport() → reports/summary.csv" }
  ],
  "dimensions": [
    {
      "name": "Execution Integrity",
      "weight": 25,
      "score": 100,
      "confidence": 75,
      "status": "pass",
      "checks": [
        { "name": "precommit_passed", "value": 1.0, "detail": "HEAD match" },
        { "name": "tests_pass", "value": 1.0, "detail": "162/162" },
        { "name": "lint_clean", "value": 1.0, "detail": "0 errors" },
        { "name": "flaky_indicator", "value": "N/A", "detail": "no signal" }
      ]
    }
  ],
  "hard_fails": [
    { "name": "precommit_stale", "triggered": false },
    { "name": "policy_breach", "triggered": false },
    { "name": "evidence_stale", "triggered": false },
    { "name": "critical_untested", "triggered": false }
  ],
  "findings": [
    { "severity": "P1", "file": "src/auth.ts", "line": 42, "description": "...", "recommendation": "..." }
  ],
  "next_actions": ["..."]
}
```
