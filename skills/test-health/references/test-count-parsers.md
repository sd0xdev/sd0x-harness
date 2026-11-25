# Test Count Parsers

## Framework Output Patterns

| # | Framework | Output Pattern | Regex | `count_level` |
|---|-----------|---------------|-------|---------------|
| 1 | Node.js (`node:test`) | TAP: `# tests 47`, `# pass 45`, `# fail 2`; spec (piped default on Node 26; TAP on Node 22): `ℹ tests 47`, … | `/^[#ℹ] tests (\d+)/m`, `/^[#ℹ] pass (\d+)/m`, `/^[#ℹ] fail (\d+)/m` | `test_case` |
| 2 | Jest | `Tests: 2 failed, 45 passed, 47 total` | `/Tests:\s+(?:(\d+) failed,\s+)?(?:(\d+) passed,\s+)?(\d+) total/` | `test_case` |
| 3 | Vitest | `Tests  47 passed \| 2 failed (49)` | `/Tests\s+(\d+)\s+passed\s+\|\s+(\d+)\s+failed\s+\((\d+)\)/` | `test_case` |
| 4 | Pytest | `47 passed, 2 failed` | `/(\d+) passed(?:,\s+(\d+) failed)?/` | `test_case` |
| 5 | Go (`-json`) | `{"Action":"pass","Test":"TestName"}` | Parse JSON lines, count `Action: "pass"` with non-empty `Test` field | `test_case` |
| 6 | Go (fallback) | `ok  ./... 12.345s` / `FAIL` | Count `ok` lines vs `FAIL` lines | `package` |
| 7 | Cargo | `test result: ok. 47 passed; 2 failed; 0 ignored` | `/(\d+) passed;\s*(\d+) failed;\s*(\d+) ignored/` | `test_case` |

## Mode-Aware Count Source

| Mode | Primary Source | Fallback | `count_source` |
|------|---------------|----------|----------------|
| Quick | Glob file count (no commands executed) | If verify-runner cache exists (`.claude/cache/verify/<repoKey>/*/summary.json`), read `steps[].logFile` → parse historical logs | `file_count` / `cached_stdout` |
| Full | Execute test command → parse stdout | Glob file count | `stdout_parse` / `file_count` |

## Layer Classification

Consistent with `/test-deep` SKILL.md Phase 1 (canonical source: `skills/test-deep/SKILL.md`).

| Directory Pattern | Layer |
|-------------------|-------|
| `test/unit/**`, `test/scripts/lib/**` | Unit |
| `test/integration/**` | Integration |
| `test/e2e/**` | E2E |
| Not matching integration/e2e pattern | Unit (default) |

## `count_level` Definition

| Value | Meaning | Comparable With |
|-------|---------|----------------|
| `test_case` | Individual test case count (from stdout parsing) | `test_case` only |
| `test_file` | Test file count (from Glob) | `test_file` only |
| `package` | Go package count (from `ok`/`FAIL` lines) | `package` only |

Mixed `count_level` values are never compared in trend analysis. Tool change or level change resets trend line.

## Framework Detection

| Detection Method | Framework |
|-----------------|-----------|
| `package.json` has `jest` in dependencies/devDependencies | Jest |
| `package.json` has `vitest` in dependencies/devDependencies | Vitest |
| `package.json` scripts use `node --test` | node:test |
| `pyproject.toml` or `setup.py` exists | Pytest |
| `go.mod` exists | Go |
| `Cargo.toml` exists | Cargo |

## Output Schema

```json
{
  "unit": { "files": 25, "tests": 47, "count_source": "stdout_parse", "count_level": "test_case" },
  "integration": { "files": 1, "tests": 12, "count_source": "stdout_parse", "count_level": "test_case" },
  "e2e": { "files": 0, "tests": 0, "count_source": "file_count", "count_level": "test_file" }
}
```
