# Feature Verification Report Template

```markdown
# Runtime Verification Report: [Feature / Branch]

## Executive Summary

- **Verdict**: Pass / Warn / Blocked / Inconclusive
- **Confidence**: High / Medium / Low
- **Degradation Level**: L4 / L3 / L2-API / L2-OBS / L1
- **Environment**: test / staging / prod

## P0: Scope & Safety

| Check | Status | Note |
| ----- | ------ | ---- |
| Environment | [test/staging/prod] | [Base URL] |
| API Reachable | ✅/❌ | |
| Deployment Aligned | ✅/⚠️ | Local HEAD: [sha] / Deployed: [sha] |
| Read-only Confirmed | ✅ | |
| Degradation Level | L[N] | [Available: API + Log / API only / ...] |

## P1: Affected Endpoints

| Changed File | Affected Endpoint | Dependency Chain | Case Type |
| ------------ | ----------------- | ---------------- | --------- |
| [file] | [endpoint] | [chain] | L1/L2/L3 |

## P2: Test Charter

| Case ID | Type | Endpoint/Target | Method | Pass Criteria |
| ------- | ---- | --------------- | ------ | ------------- |
| L1-1 | Regression | [endpoint] | [method] | HTTP 200 + expected response |
| L2-1 | Active | [endpoint] | [method] | Log contains [keyword] |
| L3-1 | Passive | [schedule] | — | Execution log, no error |
| M1-1 | Metrics | [metric name] | — | Metric exists + correct labels |

## P3: API Execution Results

**Environment**: [env] (`[HOST]`)
**Test Window**: [YYYY-MM-DD HH:MM:SS] ~ [HH:MM:SS] UTC

| # | Case | Method | Endpoint | Payload Summary | HTTP | Code | Request ID | Latency | Verdict |
| - | ---- | ------ | -------- | --------------- | ---- | ---- | ---------- | ------- | ------- |
| 1 | L1-1 | POST | /api/v1/[ep] | `{key: "val"}` | 200 | 0 | [uuid] | 120ms | ✅ |
| 2 | L2-1 | POST | /api/v1/[ep] | `{key: "val"}` | 200 | 0 | [uuid] | 85ms | ✅ |

### L2-OBS: P3 Skipped

> When operating in L2-OBS mode, replace the P3 table above with:
>
> **P3: API Execution — SKIPPED (L2-OBS)**
> API unreachable (3/3 health-check failures). Proceeding with observation-only mode.

## P4: Observation Correlation

### L2-OBS Observation Window (if applicable)

| Parameter | Value |
|-----------|-------|
| Window Source | Deploy timestamp / User-specified / Fallback (last 30min) |
| Start | [YYYY-MM-DD HH:MM:SS UTC] |
| End | [YYYY-MM-DD HH:MM:SS UTC] |
| Baseline Available | Yes / No |

### Per-Request Log Correlation (L3+)

| # | Request ID | Query Method | Hits | Key Fields | Expected Signal | Status |
| - | ---------- | ------------ | ---- | ---------- | --------------- | ------ |
| 1 | [uuid] | requestId | 4 | code: 0 | — | ✅ |
| 2 | [uuid] | requestId | 3 | code: 0 | cache hit | ✅ |

> Fallback: Primary → alt field → URL + time window
> Retry: 30s fast → 120s delayed

### Time-Window Scan

| Scan Range | Level | Hits | Related to Diff | Assessment |
| ---------- | ----- | ---- | --------------- | ---------- |
| [start-2min] ~ [end+2min] | error | N | M | ✅/⚠️ |
| [start-2min] ~ [end+2min] | warn | N | 0 | ✅ |

### Background Service Observation (L2-OBS / L3+, if applicable)

| Case | Service | Schedule Tag | Time Window | Log Status | Status |
| ---- | ------- | ------------ | ----------- | ---------- | ------ |
| L3-1 | [svc] | [tag] | [window] | Normal | ✅ |

### M1: Metrics Observation (L4, if applicable)

| Case | Metric | Query | Labels Verified | Value | Status |
| ---- | ------ | ----- | --------------- | ----- | ------ |
| M1-1 | [name] | [query] | [labels] | N | ✅/❌ |

### Improvement Claim (include when a difference or a cause was asked about or is stated)

| Field | Value |
| ----- | ----- |
| Claim | [what is said to have improved] |
| Comparator | [same metric, query and window from before the deploy, or a concurrent instance without the change] / none |
| Before → After | [value] → [value] |
| Concurrent changes checked | [other deploys / config or flag changes / traffic volume or mix / time-of-day pattern — each: none found; or what was found and either why it cannot explain the difference, or "could explain it"] |
| Wording allowed | Observation only / Difference, attribution not established / Causal claim |

Omit this section for a normal verification — a standalone observation. No comparator → "Observation only". Comparator but a
concurrent change left unchecked, or found and still a plausible explanation → "Difference,
attribution not established". "Causal claim" only when every one is "none found" or ruled out with
its reason written in the row above.

### Blind Spots

| Blind Spot | Description | Recommended Coverage |
| ---------- | ----------- | -------------------- |
| [type] | [description] | `/codex-test-review` |

## P5: Verdict

| Dimension | Result | Evidence |
| --------- | ------ | -------- |
| L1 Regression | ✅ / N/A (L2-OBS) | N/N cases passed |
| L2 Active | ✅ / N/A (L2-OBS) | Expected signals found |
| L3 Passive | ✅/N/A | [evidence] |
| M1 Metrics | ✅/N/A | [evidence] |
| Time-Window | ✅ | 0 related errors |
| L2-OBS Window | ✅/N/A | [window source + findings] |

### Claude's Analysis

- Findings: [list with evidence]
- Assessment: [hypothesis]

### Codex's Review

- Agreement: [what Codex confirms]
- Challenges: [what Codex questions]
- Blind spots identified: [list]

### Integrated Verdict

- **Final Verdict**: ✅ Pass / ⚠️ Warn / ⛔ Blocked / ❓ Inconclusive
- **Confidence**: High / Medium / Low
- **High confidence findings**: [agreed by both]
- **Needs further investigation**: [areas of disagreement]

## Recommendations

### Immediate Actions

1. [Quick fixes — agreed by both]

### Monitor

1. [Items to watch over next N hours/days]

### Long-term

1. [Architectural improvements, test coverage gaps]

## Appendix

> **⚠️ Redaction required**: Before including raw commands/responses, strip all auth tokens, API keys, session cookies, and PII (user IDs, emails, names). Replace with `[REDACTED]`.

- Raw curl commands (auth headers redacted) and responses (if needed)
- Codex brainstorm transcript summary
```
