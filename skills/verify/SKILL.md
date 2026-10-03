---
name: verify
description: "Verification loop — lint -> typecheck -> unit -> integration -> e2e"
allowed-tools: Bash(node:*), Bash(pnpm:*), Bash(yarn:*), Bash(npm:*), Bash(npx:*), Bash(git:*), Bash(python*:*), Bash(pytest:*), Bash(ruff:*), Bash(mypy:*), Bash(cargo:*), Bash(go:*), Bash(golangci-lint:*), Bash(./gradlew:*), Bash(mvn:*), Bash(bundle:*), Read, Grep, Glob
---

# Verification Loop

## Trigger

- Keywords: verify, run tests, check, lint, typecheck, verification

## When NOT to Use

- Pre-commit gate (use `/precommit` or `/precommit-fast`)
- Test coverage review (use `/codex-test-review`)
- Running a single specific test (run directly)

## Commit Context

Claude Code 2.1.286 and later tell Claude to run a skill named `verify` before a commit. The gate
that binds a commit is `/precommit` (`rules/auto-loop.md`), so when `/verify` runs as that
pre-commit check it neither repeats a precommit that already passed nor stands in for one that did
not:

1. Read the gate state: `node scripts/review-state.js check --format=json`, installed copy first
   (`.claude/scripts/review-state.js`).
2. `precommit.passed` is exactly `true` → report "Precommit already passed at the current code
   digest; no new checks executed" and stop. Emit no sentinel and write no verdict note.
3. Anything else — `passed` false, no `precommit` slot, output that does not parse as JSON, or no
   checker found → run `/precommit`. Its own report and evidence contract apply; `/verify` adds no
   verdict of its own.

`passed` is content-addressed — noted, at the current tree digest, with verdict `pass` — so no
separate freshness check is needed. Run any other way, `/verify` performs the steps below unchanged.

## Workflow Steps

| Step | Goal | Safety | Skip if Missing |
|------|------|--------|----------------|
| lint | Check code style (read-only) | read-only | yes |
| typecheck | Static type checking (full only) | read-only | yes |
| test-unit | Run unit test suite | read-only | yes |
| test-integration | Run integration tests (full only) | read-only | yes |
| test-e2e | Run end-to-end tests (full only) | read-only | yes |

**Failure behavior**: continue-all (run all steps, report all results)

## Task

### Step 1: Check for runner script

Use Glob to check if `.claude/scripts/verify-runner.js` exists in the project root.

- **Found** → run: `node .claude/scripts/verify-runner.js $ARGUMENTS`
  - If runner succeeds, use its output and skip to the Output section.
  - If runner **fails**, treat as a real verification failure (do not silently fallback).
- **NOT found** → skip to Step 2 (do NOT attempt to run the runner).

### Step 2: Fallback (no runner script)

If the runner was not found in Step 1, detect the project ecosystem to run steps manually.

**Ecosystem detection** (check project root for manifest files):

| Manifest | Ecosystem | Lint | Typecheck | Test |
|----------|-----------|------|-----------|------|
| `package.json` | Node.js | `{pm} lint` | `{pm} typecheck` | `{pm} test:unit` |
| `pyproject.toml` | Python | `ruff check .` | `mypy .` | `pytest` |
| `Cargo.toml` | Rust | `cargo clippy` | _(implicit)_ | `cargo test` |
| `go.mod` | Go | `golangci-lint run` | `go vet ./...` | `go test ./...` |
| `build.gradle` | Java | `./gradlew spotlessCheck` | _(implicit)_ | `./gradlew test` |

For Node.js projects, auto-detect package manager from lockfile.

**`$ARGUMENTS` == "fast"**: lint + unit only

**Otherwise (full)**: lint -> typecheck -> unit -> integration -> e2e

| Step | package.json script | If missing |
|------|---------------------|------------|
| lint | `lint` | Skip with note |
| typecheck | `typecheck` | Skip with note |
| unit | `test:unit`, fallback to `test` | Skip with note |
| integration | `test:integration` | Skip (requires explicit path) |
| e2e | `test:e2e` | Skip (requires explicit path) |

### Graceful Skip Rules

| Scenario | Behavior |
|----------|----------|
| No `lint` script | Skip, log "no lint script — skipped" |
| No `typecheck` script | Skip, log "no typecheck script — skipped" |
| No `test:unit` or `test` script | Skip, log "no test script — skipped" |
| No `package.json` | Report error, cannot run checks |

## Output

The last line is `## Verify:`, never `## Overall:`. `## Overall:` is the precommit runner's
sentinel alone (`rules/auto-loop.md` § Gate Sentinels), so a verification report is never read as
a precommit verdict.

For **fast** mode:

```markdown
## Verify (fast)

| Step | Status | Notes |
|------|--------|-------|
| lint | ✅/❌/⏭️ | |
| unit | ✅/❌/⏭️ | |

## Verify: ✅ PASS / ❌ FAIL
```

For **full** mode:

```markdown
## Verify (full)

| Step | Status | Notes |
|------|--------|-------|
| lint | ✅/❌/⏭️ | |
| typecheck | ✅/❌/⏭️ | |
| unit | ✅/❌/⏭️ | |
| integration | ✅/❌/⏭️ | skipped unless path specified |
| e2e | ✅/❌/⏭️ | skipped unless path specified |

## Failures (if any)

- Root cause: <first error>
- Fix: <suggestion>

## Verify: ✅ PASS / ❌ FAIL
```
