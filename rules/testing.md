---
paths:
  - "test/**"
  - "tests/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/__tests__/**"
  - "docs/features/**/requests/**"
---
# Testing Rules

This file is the resident core. The procedure — the evidence priority table, the three exception
gates and their caps, the Adequacy Gate sentinels and the pre-PR execution line — is in
`skills/test-review/references/testing-contract.md` in the sd0x-dev-flow plugin (the
`test-review` skill's own `references/`). Read it before writing or reviewing tests, or
before judging whether an AC has evidence. If that Read fails, stop that work and say so rather than
working from memory.

## Test Pyramid

| Type | Directory | Mock Policy | When |
|------|-----------|-------------|------|
| Unit | `test/unit/` (or project convention) | ✅ Any | Isolated logic |
| Integration | `test/integration/` (or project convention) | ⚠️ External only | Cross-module |
| E2E | `test/e2e/` (or project convention) | ❌ Forbidden | Full system |

Execution: Integration/E2E defaults to running a single file only; use `/verify` to execute

## Conventions

| Convention | Rule |
|-----------|------|
| Structure | AAA (Arrange → Act → Assert) per test case |
| Naming | `'<unit> <condition> → <expected>'` or `'when <X> then <Y>'` |
| Assertion | `assert/strict` (or ecosystem equivalent); no empty assertions |
| Size | ≤ 7 assertions per test case |
| Data | Realistic inputs; no `"test"`, `"foo"`, `123` without justification |
| Guards | A test that *refuses* something exercises the **actual guard path** in both directions, in the same commit: a representative forbidden case that must fail, and the same words as ordinary data that must pass. Test and controls invoke the same implementation — prove the negative by deleting or mutating the production guard on its actual execution path, never a test-only helper, duplicate, or proxy. That **representative proof is where assurance stops**: it does not require guards-of-guards, exhaustive mutation batteries, or completeness floors, unless an explicit AC or a security/data-integrity invariant demands them |

## Evidence Model

Every non-quality-gate AC maps to evidence: an automated test first, a runtime verification next,
and a manual exception only when it passes the three gates and fits the cap in `skills/test-review/references/testing-contract.md`
§ Evidence Model — Read it before judging whether any AC has evidence; if that Read fails, stop
judging AC evidence and say so. Some
domains never take an exception:

| Domain | Exception Allowed? |
|--------|-------------------|
| Security AC | ❌ Never |
| Data-integrity AC | ❌ Never |
| Regression AC | ❌ Never |
| All others | ✅ Within cap |

## Adequacy Gate Sentinels

The four sentinels the Adequacy Gate reports, and what each one means, are in `skills/test-review/references/testing-contract.md`
§ Adequacy Gate Sentinels. Read it before reporting an Adequacy Gate verdict; if that Read fails,
report no verdict and say so.

## Execution

The pre-PR command line and the failure-report format are in `skills/test-review/references/testing-contract.md` § Execution.
Read it before the pre-PR run; if that Read fails, stop and say so.

## Project Customization

Project-specific overrides belong in `testing-project.md` (not this file).
See `@rules/testing-project.md` for your project's custom testing conventions.

Override contract: an active `##` section there customizes this file — **Default and Guidance tiers only**. Anchor-tier rows (the security / data-integrity / regression "❌ Never" rows, per `rules/discretion.md` § Anchor Register) are never overridable: on conflict the Anchor wins and the conflict is reported. Resolution is **Anchor-first** — a tier annotation in either file cannot downgrade a Register hit. `## Test Pyramid` is a **section replacement** of this file's section; `## Adequacy Mode (project-only extension — not in testing.md core)` is a **setting** the Adequacy Gate reads; any other heading fails closed to **Default** and is reported. The user's file is never edited.

Before interpreting, auditing or editing the override, Read `override-contract.md` in the same directory as this rule — `.claude/rules/override-contract.md` in an installed project, `rules/override-contract.md` in the plugin source — for the resolution order, the two kinds, and each heading's consumer and tier. If that Read fails, do not edit or audit the override.
