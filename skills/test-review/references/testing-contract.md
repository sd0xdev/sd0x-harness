# Testing Contract

> Loaded on demand — before writing or reviewing tests, or judging whether an acceptance criterion
> has evidence. The resident core is `rules/testing.md`; this file carries the procedure it points
> to.

**Tier.** This file sits outside `rules/discretion.md` § File Baselines. Every statement here was
moved from `rules/testing.md` and keeps the tier it had there: **Default**. The Anchor rows of that
rule (Anchor Register #3) stay in the resident core, `rules/testing.md` § Evidence Model, and are not
restated here.

## Evidence Model

Every non-quality-gate AC must map to evidence.

| Evidence Type | Priority | Requirement |
|--------------|----------|-------------|
| Automated test | 1 (preferred) | Test file + assertion covering AC behavior |
| Runtime verification | 2 | `/feature-verify` result at L3+ confidence |
| Manual exception | 3 (verified only) | See Exception Rules below |

### Exception Rules (v1: 3-gate)

| Gate | Requirement |
|------|-------------|
| Reason class | Closed enum: `ENV_UNAVAILABLE` / `UNSAFE_TO_AUTOMATE` / `ONE_TIME_MIGRATION` |
| Codex verification | `/codex-test-review --ac-trace` must emit `VALID_EXCEPTION` |
| Expiry | Required (ISO 8601); default +14d; expired = ⛔ in strict, ⚠️ in advisory |

| AC Count | Max Exceptions |
|----------|---------------|
| 1-8 (standard) | 1 |
| 9-12 (legacy) | 2 |
| 13+ (should split) | 2 (hard cap) |

Which domains may take an exception at all is the resident core's table,
`rules/testing.md` § Evidence Model.

## Adequacy Gate Sentinels

| Sentinel | Meaning | Parsed by |
|----------|---------|-----------|
| `✅ Adequate` | All ACs covered by evidence | Behavior-layer |
| `⚠️ Adequate with exceptions` | Validated exceptions within cap | Behavior-layer |
| `⚠️ Need Human` | Every carrier exhausted (no validated verdict — behaviour-layer only), or the validated report is inconclusive | Behavior-layer |
| `⛔ Inadequate` | Unverified/expired exception, cap breach, or prohibited domain | Behavior-layer |

## Execution

Pre-PR required: `{LINT_FIX_COMMAND} && {TEST_COMMAND}`
Failure report format: `Command: <cmd> | Error: <cause> | Fix: <fix>`
