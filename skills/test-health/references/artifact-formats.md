# Coverage Artifact Formats

## Supported Formats

| # | Ecosystem | Artifact Path Pattern | Format | Parser Logic |
|---|-----------|----------------------|--------|-------------|
| 1 | Node.js (c8/nyc/istanbul) | `coverage/lcov.info`, `coverage/coverage-final.json`, `.nyc_output/` | LCOV / Istanbul JSON | LCOV: extract `LF:`, `LH:` (lines), `BRF:`, `BRH:` (branches). Istanbul JSON: extract per-file statement/branch counts |
| 2 | Node.js (jest) | `coverage/coverage-summary.json` | Jest summary JSON | Extract `.total.lines.pct`, `.total.branches.pct` |
| 3 | Python (coverage.py) | `coverage.xml`, `htmlcov/` | Cobertura XML | Extract `line-rate`, `branch-rate` from `<coverage>` root element |
| 4 | Python (coverage.py) | `.coverage` | SQLite DB (binary) | Detection only — prompt user to run `coverage xml` to produce parseable artifact |
| 5 | Go | `cover.out`, `coverage.out` | Go cover profile | Parse `mode:` header, then `file:startLine.startCol,endLine.endCol count` lines. Covered = count > 0 |
| 6 | Rust (tarpaulin) | `tarpaulin-report.json`, `cobertura.xml` | Tarpaulin JSON / Cobertura | JSON: extract `covered`/`coverable`. Cobertura: same as #3 |
| 7 | Java (JaCoCo) | `build/reports/jacoco/`, `target/site/jacoco/` | JaCoCo XML / CSV | XML: extract `INSTRUCTION` + `BRANCH` counters from `<counter>` elements. CSV: parse header row + sum counters |
| 8 | Generic | `lcov.info`, `cobertura.xml` | LCOV / Cobertura | Unified parser (same as #1 LCOV / #3 Cobertura) |

## Scan Strategy

1. Scan from project root, depth limit 3 levels
2. Check known path patterns in priority order (per ecosystem detection)
3. Collect all candidates, then select best using priority rules

### Candidate Selection Priority

| Priority | Criterion | Reason |
|----------|-----------|--------|
| 1 | Freshness: mtime >= HEAD commit timestamp | Most current data |
| 2 | Proximity: closer to project root | Avoid monorepo sub-package artifacts |
| 3 | Completeness: has both line + branch data | More information |

Single candidate found → use directly (no scoring).

## Freshness Check

1. Read artifact file mtime: `stat -f %m <path>` (macOS) or `stat -c %Y <path>` (Linux)
2. Read HEAD commit timestamp: `git log -1 --format=%ct HEAD`
3. Compare: artifact mtime < HEAD timestamp → `freshness: stale`
4. Check dirty tree: `git status --porcelain` non-empty → `dirty_tree: true` (advisory warning, no confidence downgrade)

## Output Schema

```json
{
  "lines": { "covered": 1234, "total": 1500, "pct": 82.3, "measured": true },
  "branches": { "covered": 456, "total": 600, "pct": 76.0, "measured": true },
  "source_type": "instrumented_artifact",
  "tool_id": "c8",
  "freshness": "current",
  "dirty_tree": false
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `measured` (per metric) | `true` / `false` | Whether the artifact carried this metric. `false` → ignore its `pct` whatever the value, and report the metric as unavailable |
| `source_type` | `instrumented_artifact` / `collected_now` / `heuristic` / `missing` | How data was obtained |
| `tool_id` | `c8` / `nyc` / `istanbul` / `jest` / `coverage.py` / `go-cover` / `tarpaulin` / `jacoco` / `unknown` | Which tool generated the artifact |
| `freshness` | `current` / `stale` / `unknown` | Artifact age vs HEAD; `unknown` when HEAD cannot be read |
| `dirty_tree` | `true` / `false` | `true`: uncommitted changes exist. `false`: none were seen — which is not "clean" when `freshness` is `unknown` or `git status` failed, since the tree was not checked |
