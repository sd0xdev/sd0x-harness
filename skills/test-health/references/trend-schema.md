# Trend Storage Schema

## Location

`.claude/cache/test-health/<repoKey>/`

### repoKey

`${safeSlug(repoBase)}--${sha1(remote).slice(0, 8)}`

- `safeSlug`, `sha1` from `scripts/lib/utils.js`
- `repoBase = path.basename(repoRoot)`
- `remote = git remote get-url origin || repoRoot`

Consistent with `scripts/verify-runner.js:85`.

## Directory Structure

```
.claude/cache/test-health/<repoKey>/
├── latest.json          # Copy of most recent snapshot (not symlink)
├── history/
│   ├── 2026-04-01-10-00-00--a1b2c3d.json
│   ├── 2026-03-31-09-30-00--f4e5d6c.json
│   └── ...
```

## Snapshot Schema

```json
{
  "version": 1,
  "sha": "a1b2c3d",
  "timestamp": "2026-04-01T10:00:00Z",
  "code_coverage": {
    "lines": { "covered": 1234, "total": 1500, "pct": 82.3, "measured": true },
    "branches": { "covered": 456, "total": 600, "pct": 76.0, "measured": true },
    "source_type": "instrumented_artifact",
    "tool_id": "c8",
    "freshness": "current",
    "population": { "scope": "repo", "config_sha": "3f2a9c1e", "files": 148 }
  },
  "test_inventory": {
    "unit": { "files": 25, "tests": 47, "count_source": "stdout_parse", "count_level": "test_case" },
    "integration": { "files": 1, "tests": 12, "count_source": "stdout_parse", "count_level": "test_case" },
    "e2e": { "files": 0, "tests": 0, "count_source": "file_count", "count_level": "test_file" }
  },
  "feature_coverage": {
    "covered": 12,
    "total": 15,
    "pct": 80.0
  },
  "quality": {
    "p0": 0, "p1": 0, "p2": 1, "nit": 2,
    "dimensions": {
      "happy_path": 4,
      "error_handling": 3,
      "edge_cases": 3,
      "mock_quality": 4
    }
  }
}
```

`code_coverage.population` is **optional** — snapshots written before it existed do not carry it and
stay readable (§ Coverage Trend says how they compare). It records what the tool was pointed at
**when it produced the coverage data** — the producing invocation, not this run's search path:

| Field | Value |
|-------|-------|
| `scope` | The path the coverage-producing run was limited to, or `repo` |
| `config_sha` | Short hash of the coverage tool's include/exclude configuration in effect for that run (the config file's content, or the relevant `package.json` key); the literal `none` when the tool ran on defaults |
| `files` | Number of source files in the artifact — informational, never compared |

| How the data was obtained | `population` |
|---------------------------|--------------|
| `--collect`: this run executed the coverage command | Record it — the scope and configuration are the ones this run used |
| An existing artifact was consumed (quick mode, and full mode without `--collect`) | Record it only if the producing scope and configuration can be established for that artifact; otherwise **omit it**. `--scope` here only limits where artifacts are searched for, and the configuration on disk may have changed since the artifact was written |

Never guess a value: an invented or mismatched `scope` / `config_sha` would make two different
populations look the same. Omit `population` and the comparison falls back to the denominator.

## Rolling Window

- Keep last **30** snapshots
- On write: prune oldest beyond 30
- Configurable via `testing-project.md` override

## Concurrency Safety (Lock Pattern)

Standard mkdir-based lock (atomic on POSIX — `mkdir` fails if the directory exists; the
enforcement hook this pattern was originally copied from retired with hook-lightweighting).

1. **Acquire lock**: `mkdir <cacheDir>/.lock` (no `-p`, atomic — fails if exists)
   - Any error other than "already exists" (a missing or unwritable directory): no retry — the write is attempted without the lock at once
   - Already exists: read the `.lock` directory's mtime
   - If mtime age > 60s (TTL): stale lock → remove it and retry
   - Otherwise retry about every 100 ms, for up to 5 s (`lock` in `scripts/trend.js`)
   - **Still not acquired after 5 s → the write and the prune proceed without the lock** (fail-open). A completed write therefore does not prove exclusive access
2. **Write temp file**: `<cacheDir>/history/<timestamp>--<sha>.json.tmp`, the timestamp reduced to seconds with `-` throughout — e.g. `history/2026-04-01-10-00-00--a1b2c3d.json.tmp`
3. **Atomic rename**: `mv .tmp → .json`
4. **Update latest.json**: copy newest snapshot (not symlink)
5. **Release lock** — only if this writer acquired it: remove `<cacheDir>/.lock`. A writer that proceeded without the lock leaves `.lock` alone; it belongs to someone else

**Note**: the lock is mtime-based only (no PID tracking) and fail-open, so two writers can overlap: exclusive access is best-effort, never guaranteed.

## Trend Comparison Rules

### Coverage Trend

Compare only data points with matching `tool_id + source_type`:

| Previous | Current | Action |
|----------|---------|--------|
| Same `tool_id` and same `source_type` | — | Continue to the population check below |
| Different `tool_id` | — | Reset trend: `"⚠️ Tool changed from {old} to {new} — trend reset"` |
| Same `tool_id`, different `source_type` | — | Reset trend: `"⚠️ Source changed from {old} to {new} — trend reset"` |

Each metric — lines, branches — is judged on its own. **If a metric's percentage is missing on
either point, that metric has no delta** (`null`): report it as unavailable and skip the checks
below for it. A line-only artifact gives a line delta and no branch delta. Presence is the metric's `measured`
field, which the parsers set and the snapshot keeps:

| `measured` | Meaning |
|------------|---------|
| `true` | The artifact carried the metric; a 0% is a measured 0%, a rate-only one included |
| `false` | The artifact did not carry it → no delta (`null`). Ignore `pct` whatever it says: usually a placeholder `0`, but a Jest summary with `total: 0` keeps its `100` |
| Not recorded (old snapshots) | Compared as below, except a 0% with no positive `total`: measured zero and missing metric cannot be told apart → `comparable: false`, with that reason |

**The same tool can still measure a different population.** Excluding untested files, narrowing
`--scope`, or adding a generated directory changes the denominator and moves the percentage with no
test added or removed. So a percentage difference is reported as a *direction* (↑ / ↓ / →) only when
both points measure the same population (`computeDelta` in `scripts/trend.js`):

| `population` on both points | Denominator (`total`) | Result |
|-----------------------------|-----------------------|--------|
| Recorded, same `scope` + `config_sha` | Any — code may have grown or shrunk | `comparable: true`, `basis: same_population` |
| Recorded, `scope` or `config_sha` differs | Any | `comparable: false` — population changed |
| Missing on either point (old snapshots) | Recorded on both — a positive count — and equal | `comparable: true`, `basis: same_denominator` |
| Missing on either point | Different, missing, or `0` (a rate-only artifact stores no denominator) | `comparable: false` — provenance insufficient |

When `comparable` is `false` the delta keeps `previous`, `current` and `value`, carries the `reason`,
and its `direction` is `?`. Report the two numbers and the reason. **Do not call it an improvement
or a regression**, and do not fold it into "Trend direction".

### Test Count Trend

Compare only data points with matching `count_level`:

| Level | Comparable With |
|-------|----------------|
| `test_case` | `test_case` only |
| `test_file` | `test_file` only |
| `package` | `package` only |

Mixed `count_level` → separate trend lines, no cross-comparison.

### Stale Data

- `freshness: stale` data points participate in trend but with confidence downgrade annotation
- Trend output marks stale points: `(stale)` suffix

## Delta Computation

```
value = current.value - previous.value          // what computeDelta returns
direction = value > 0 ? "↑" : value < 0 ? "↓" : "→"
```

Show `value` as returned — no relative percentage is computed, so a previous value of zero is not a
special case:

| Metric | Unit of `value` | Example |
|--------|-----------------|---------|
| Coverage (lines, branches) | Percentage points | 80.2% → 82.3% is `↑ +2.1` points, shown as `+2.1%` in the dashboard's Delta column |
| Test count | Tests (or files / packages, per `count_level`) | 57 → 59 is `↑ +2` |

A coverage delta with `comparable: false` is output as `? not comparable — <reason>` beside the two
values.
