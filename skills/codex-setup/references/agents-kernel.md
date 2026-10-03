# {PROJECT_NAME} — Development Rules (sd0x-dev-flow v{VERSION})

## Core Behavioral Requirements

- Before declaring work complete, read how the terminal completion invariant named in the Anchors below applies to your change — it is defined in the sd0x-dev-flow plugin's `rules/auto-loop.md`
- Review findings: fix every finding at or above the blocking severity of the change's tier, and every finding you admit into a fix; record the rest with a reason instead of widening the change into unrelated files
- When reviewing code, independently research the project — do not accept fed conclusions
- Quality workflow: develop -> test -> verify -> precommit

## Where the Detailed Rules Live

Procedures — the review loop, scope, commit and push authorization, testing and documentation —
live in the sd0x-dev-flow plugin's `rules/` and `skills/*/references/`, not in this file. Before
acting under one, read it; if it cannot be read, stop that action and say so. A workflow the
Anchors below name (`/push-ci`, `/smart-commit --execute`, …) is a skill of that plugin: its being
named here is not evidence that it is installed in this project.

## Available Scripts

| Script | Command | When |
|--------|---------|------|
| Precommit (fast) | `node .sd0x/scripts/precommit-runner.js --mode fast` | Before commit |
| Precommit (full) | `node .sd0x/scripts/precommit-runner.js --mode full` | Before PR |
| Verify | `node .sd0x/scripts/verify-runner.js --mode full` | After changes |

Verification is not the precommit gate: only the precommit runner's `## Overall:` line is a
precommit verdict.

## Test Requirements

- Test command: `{TEST_COMMAND}`
- Required coverage: happy path + error handling + edge cases
- New code must have corresponding tests
- Bug fixes require regression tests

## Conventions

1. Reference existing code — find similar files first, keep style consistent
2. Git branching: `feat/*` | `fix/*` | `docs/*` | `refactor/*` -> main
3. Commit format: `<type>: <subject>` (feat/fix/docs/refactor/test/chore)

## Sentinel Vocabulary

These markers appear in precommit output — use them to determine the verdict:

| Sentinel | Meaning |
|----------|---------|
| `## Overall: ✅ PASS` | Every executed check passed |
| `## Overall: ⛔ FAIL` | One or more checks failed |
| `## Overall: ❌ FAIL` | One or more checks failed |
| `## Overall: ⚠️ NO CHECKS RUN` | Nothing was validated — not a pass |

{ANCHORS}
