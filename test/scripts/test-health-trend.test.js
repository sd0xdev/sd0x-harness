const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve, join } = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  getRepoKey, getCacheDir, lock, unlock,
  readLatest, writeSnapshot, computeDelta, pruneHistory,
} = require(resolve(__dirname, '../../skills/test-health/scripts/trend'));

function makeTmpDir() {
  return fs.mkdtempSync(join(os.tmpdir(), 'test-health-trend-'));
}

// --- getRepoKey ---

test('getRepoKey returns slug--hash format', () => {
  const key = getRepoKey('/tmp/my-repo');
  assert.match(key, /^my-repo--[a-f0-9]{8}$/);
});

// --- lock / unlock ---

test('lock acquires and unlock releases', () => {
  const dir = makeTmpDir();
  try {
    const acquired = lock(dir, 1, 60);
    assert.equal(acquired, true);
    assert.ok(fs.existsSync(join(dir, '.lock')));
    unlock(dir);
    assert.ok(!fs.existsSync(join(dir, '.lock')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('lock fails after timeout when already held', () => {
  const dir = makeTmpDir();
  try {
    fs.mkdirSync(join(dir, '.lock'));
    const start = Date.now();
    const acquired = lock(dir, 0.2, 9999);
    const elapsed = Date.now() - start;
    assert.equal(acquired, false);
    assert.ok(elapsed >= 150, `Expected timeout delay, got ${elapsed}ms`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('lock returns false on non-EEXIST error', () => {
  // Use a path that doesn't exist (no parent dir) to trigger ENOENT
  const dir = join(os.tmpdir(), 'nonexistent-' + Date.now(), 'nested');
  const result = lock(dir, 0.1, 60);
  assert.equal(result, false);
});

test('lock recovers stale lock', () => {
  const dir = makeTmpDir();
  try {
    const lockDir = join(dir, '.lock');
    fs.mkdirSync(lockDir);
    // Backdate mtime by 120s to simulate stale lock
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(lockDir, past, past);
    const acquired = lock(dir, 1, 60);
    assert.equal(acquired, true);
    unlock(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- writeSnapshot + readLatest ---

test('writeSnapshot + readLatest roundtrip', () => {
  const dir = makeTmpDir();
  try {
    const snapshot = {
      timestamp: '2026-04-01T10:00:00Z',
      sha: 'abc1234',
      code_coverage: { lines: { covered: 80, total: 100, pct: 80 }, source_type: 'lcov', tool_id: 'lcov' },
    };
    writeSnapshot(dir, snapshot);
    const latest = readLatest(dir);
    assert.deepEqual(latest.code_coverage, snapshot.code_coverage);
    assert.equal(latest.sha, 'abc1234');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readLatest returns null when no snapshot exists', () => {
  const dir = makeTmpDir();
  try {
    assert.equal(readLatest(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- computeDelta ---

test('computeDelta computes coverage improvement', () => {
  const current = {
    code_coverage: { lines: { pct: 85, total: 1500 }, branches: { pct: 70, total: 600 }, tool_id: 'lcov', source_type: 'lcov' },
  };
  const previous = {
    code_coverage: { lines: { pct: 80, total: 1500 }, branches: { pct: 65, total: 600 }, tool_id: 'lcov', source_type: 'lcov' },
  };
  const delta = computeDelta(current, previous);
  assert.equal(delta.line_coverage.value, 5);
  assert.equal(delta.line_coverage.direction, '\u2191');
  assert.equal(delta.branch_coverage.value, 5);
});

// --- computeDelta: coverage comparability (population / denominator) ---

const cov = (pct, total, population) => ({
  code_coverage: {
    lines: total === undefined ? { pct } : { covered: Math.round((pct * total) / 100), total, pct },
    tool_id: 'c8', source_type: 'instrumented_artifact',
    ...(population ? { population } : {}),
  },
});

test('computeDelta same tool, denominator halved, no population recorded → no improvement asserted', () => {
  const delta = computeDelta(cov(90, 750), cov(80, 1500));

  assert.equal(delta.line_coverage.comparable, false);
  assert.equal(delta.line_coverage.direction, '?');
  assert.equal(delta.line_coverage.value, 10, 'the two numbers are still reported');
  assert.match(delta.line_coverage.reason, /denominator changed \(1500 → 750\) and the population is not recorded/);
  assert.equal(delta.coverage_reset, undefined, 'this is not a tool change');
});

test('computeDelta old snapshots with an unchanged denominator → legitimate same-cohort change kept', () => {
  const delta = computeDelta(cov(85, 1500), cov(80, 1500));

  assert.equal(delta.line_coverage.comparable, true);
  assert.equal(delta.line_coverage.basis, 'same_denominator');
  assert.equal(delta.line_coverage.direction, '\u2191');
  assert.equal(delta.line_coverage.value, 5);
});

test('computeDelta same recorded population, code grew → comparable although the denominator moved', () => {
  const population = { scope: 'repo', config_sha: '3f2a9c1e', files: 148 };
  const delta = computeDelta(cov(84, 1800, { ...population, files: 171 }), cov(82, 1500, population));

  assert.equal(delta.line_coverage.comparable, true);
  assert.equal(delta.line_coverage.basis, 'same_population');
  assert.equal(delta.line_coverage.direction, '\u2191');
});

test('computeDelta recorded population differs, denominator equal → not comparable', () => {
  const delta = computeDelta(
    cov(91, 1500, { scope: 'repo', config_sha: 'b71d0e22' }),
    cov(80, 1500, { scope: 'repo', config_sha: '3f2a9c1e' }),
  );

  assert.equal(delta.line_coverage.comparable, false);
  assert.equal(delta.line_coverage.direction, '?');
  assert.match(delta.line_coverage.reason, /population changed/);
});

test('computeDelta narrowed scope under the same config → not comparable', () => {
  const delta = computeDelta(
    cov(95, 400, { scope: 'src/billing', config_sha: '3f2a9c1e' }),
    cov(80, 1500, { scope: 'repo', config_sha: '3f2a9c1e' }),
  );

  assert.equal(delta.line_coverage.comparable, false);
  assert.match(delta.line_coverage.reason, /population changed/);
});

test('computeDelta population recorded on one side only → falls back to the denominator', () => {
  const population = { scope: 'repo', config_sha: '3f2a9c1e' };

  const sameTotal = computeDelta(cov(85, 1500, population), cov(80, 1500));
  const movedTotal = computeDelta(cov(85, 1700, population), cov(80, 1500));

  assert.equal(sameTotal.line_coverage.comparable, true);
  assert.equal(sameTotal.line_coverage.basis, 'same_denominator');
  assert.equal(movedTotal.line_coverage.comparable, false);
});

test('computeDelta neither denominator nor population recorded → provenance insufficient, no direction', () => {
  const delta = computeDelta(cov(85), cov(80));

  assert.equal(delta.line_coverage.comparable, false);
  assert.equal(delta.line_coverage.direction, '?');
  assert.match(delta.line_coverage.reason, /denominator and population are not recorded/);
});

test('computeDelta rate-only artifacts storing total 0 → two unknown denominators, not two equal ones', () => {
  // Cobertura gives a rate; the parser stores `total: 0`. 80 of 200 lines, then 80 of 100.
  const delta = computeDelta(
    { code_coverage: { lines: { covered: 80, total: 0, pct: 80 }, tool_id: 'cobertura', source_type: 'instrumented_artifact' } },
    { code_coverage: { lines: { covered: 80, total: 0, pct: 40 }, tool_id: 'cobertura', source_type: 'instrumented_artifact' } },
  );

  assert.equal(delta.line_coverage.comparable, false);
  assert.equal(delta.line_coverage.direction, '?');
  assert.match(delta.line_coverage.reason, /denominator and population are not recorded/);
});

// Parser → trend, the path a real snapshot takes.
const parsers = require(resolve(__dirname, '../../skills/test-health/scripts/artifact-parser'));
const SAME = { scope: 'repo', config_sha: '3f2a9c1e' };
const fromArtifact = (metrics, population = SAME) => ({ code_coverage: { ...metrics, tool_id: 'x', source_type: 'instrumented_artifact', population } });

test('computeDelta line-only LCOV then branch data, same population → no branch delta, not +100', () => {
  const before = parsers.parseLcov('LF:10\nLH:8\n');
  const after = parsers.parseLcov('LF:10\nLH:9\nBRF:2\nBRH:2\n');

  const delta = computeDelta(fromArtifact(after), fromArtifact(before));

  assert.equal(before.branches.measured, false);
  assert.equal(delta.branch_coverage, null);
  assert.equal(delta.line_coverage.value, 10);
});

test('computeDelta Cobertura measured 0% then 50%, same population → +50 points', () => {
  const before = parsers.parseCoberturaXml('<coverage line-rate="0" branch-rate="0" branches-valid="0">');
  const after = parsers.parseCoberturaXml('<coverage line-rate="0.5" branch-rate="0" branches-valid="0">');

  const delta = computeDelta(fromArtifact(after), fromArtifact(before));

  assert.equal(delta.line_coverage.value, 50);
  assert.equal(delta.line_coverage.comparable, true);
  assert.equal(delta.branch_coverage, null, 'branches-valid="0": nothing was measured');
});

test('computeDelta Cobertura reports carrying counts, no population → compared on their denominator', () => {
  const report = (rate, covered, valid) => parsers.parseCoberturaXml(`<coverage line-rate="${rate}" lines-covered="${covered}" lines-valid="${valid}">`);

  const same = computeDelta(fromArtifact(report(0.5, 50, 100), null), fromArtifact(report(0.25, 25, 100), null));
  const halved = computeDelta(fromArtifact(report(0.8, 80, 100), null), fromArtifact(report(0.4, 80, 200), null));

  assert.equal(same.line_coverage.value, 25);
  assert.equal(same.line_coverage.basis, 'same_denominator');
  assert.equal(halved.line_coverage.comparable, false, '80 of 200 then 80 of 100 is not an improvement');
});

test('computeDelta old snapshot with an ambiguous 0% → reported, with no direction', () => {
  const old = { lines: { covered: 0, total: 0, pct: 0 } };

  const delta = computeDelta(fromArtifact({ lines: { covered: 0, total: 0, pct: 50 } }), fromArtifact(old));

  assert.equal(delta.line_coverage.comparable, false);
  assert.equal(delta.line_coverage.value, 50);
  assert.match(delta.line_coverage.reason, /measured zero and missing metric cannot be told apart/);
});

test('computeDelta counted 0% with a real denominator → compared, old snapshots included', () => {
  const delta = computeDelta(
    fromArtifact({ lines: { covered: 0, total: 4, pct: 0 } }),
    fromArtifact({ lines: { covered: 2, total: 4, pct: 50 } }),
  );

  assert.equal(delta.line_coverage.value, -50);
  assert.equal(delta.line_coverage.comparable, true);
});

test('computeDelta same tool, different source_type → reset naming the source, not the tool', () => {
  const point = (source_type) => ({ code_coverage: { lines: { pct: 80, total: 10 }, tool_id: 'c8', source_type } });

  const delta = computeDelta(point('collected_now'), point('instrumented_artifact'));

  assert.equal(delta.coverage_reset, 'Source changed: instrumented_artifact → collected_now');
});

test('parseJestSummary with nothing to measure → measured false whatever pct says, so no delta', () => {
  const jest = (total, covered, pct) => parsers.parseJestSummary(JSON.stringify({ total: { lines: { total: 10, covered: 8, pct: 80 }, branches: { total, covered, pct } } }));

  const delta = computeDelta(fromArtifact(jest(4, 2, 50)), fromArtifact(jest(0, 0, 100)));

  assert.equal(delta.branch_coverage, null);
});

test('computeDelta malformed population (missing config_sha) → treated as unrecorded, never as a match', () => {
  const delta = computeDelta(cov(90, 900, { scope: 'repo' }), cov(80, 1500, { scope: 'repo' }));

  assert.equal(delta.line_coverage.comparable, false);
  assert.match(delta.line_coverage.reason, /population is not recorded/);
});

test('computeDelta branch coverage judged on its own denominator', () => {
  const current = { code_coverage: { lines: { pct: 85, total: 1500 }, branches: { pct: 75, total: 300 }, tool_id: 'c8', source_type: 'instrumented_artifact' } };
  const previous = { code_coverage: { lines: { pct: 80, total: 1500 }, branches: { pct: 65, total: 600 }, tool_id: 'c8', source_type: 'instrumented_artifact' } };

  const delta = computeDelta(current, previous);

  assert.equal(delta.line_coverage.comparable, true);
  assert.equal(delta.branch_coverage.comparable, false);
});

test('computeDelta missing percentage on one side → null, as before', () => {
  const delta = computeDelta(cov(85, 1500), { code_coverage: { lines: {}, tool_id: 'c8', source_type: 'instrumented_artifact' } });

  assert.equal(delta.line_coverage, null);
});

test('computeDelta returns coverage_reset when tool changes', () => {
  const current = {
    code_coverage: { lines: { pct: 85 }, tool_id: 'istanbul', source_type: 'istanbul-json' },
  };
  const previous = {
    code_coverage: { lines: { pct: 80 }, tool_id: 'lcov', source_type: 'lcov' },
  };
  const delta = computeDelta(current, previous);
  assert.ok(delta.coverage_reset);
  assert.match(delta.coverage_reset, /lcov.*istanbul/);
});

test('computeDelta returns null when no previous', () => {
  assert.equal(computeDelta({ code_coverage: {} }, null), null);
});

test('computeDelta handles count_level mismatch in test_counts', () => {
  const current = {
    test_inventory: { unit: { tests: 50, count_level: 'test_case' } },
  };
  const previous = {
    test_inventory: { unit: { tests: 10, count_level: 'package' } },
  };
  const delta = computeDelta(current, previous);
  assert.ok(delta.test_counts.unit.reset);
  assert.match(delta.test_counts.unit.reset, /package.*test_case/);
});

test('computeDelta computes test count delta when same count_level', () => {
  const current = {
    test_inventory: { unit: { tests: 50, count_level: 'test_case' }, integration: { tests: 10, count_level: 'test_case' } },
  };
  const previous = {
    test_inventory: { unit: { tests: 45, count_level: 'test_case' }, integration: { tests: 10, count_level: 'test_case' } },
  };
  const delta = computeDelta(current, previous);
  assert.equal(delta.test_counts.unit.value, 5);
  assert.equal(delta.test_counts.unit.direction, '\u2191');
  assert.equal(delta.test_counts.integration.value, 0);
  assert.equal(delta.test_counts.integration.direction, '\u2192');
});

// --- pruneHistory ---

test('pruneHistory removes oldest entries beyond maxItems', () => {
  const dir = makeTmpDir();
  try {
    const historyDir = join(dir, 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    // Create 35 snapshot files
    for (let i = 0; i < 35; i++) {
      const ts = `2026-04-${String(i + 1).padStart(2, '0')}`;
      fs.writeFileSync(join(historyDir, `${ts}--sha${i}.json`), '{}');
    }
    const removed = pruneHistory(dir, 30);
    assert.equal(removed, 5);
    const remaining = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
    assert.equal(remaining.length, 30);
    // Oldest files should be removed (sorted alphabetically, first 5 removed)
    assert.ok(!remaining.includes('2026-04-01--sha0.json'));
    assert.ok(remaining.includes('2026-04-06--sha5.json'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pruneHistory returns 0 when within limit', () => {
  const dir = makeTmpDir();
  try {
    const historyDir = join(dir, 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(join(historyDir, 'snap1.json'), '{}');
    assert.equal(pruneHistory(dir, 30), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pruneHistory returns 0 when history dir missing', () => {
  const dir = makeTmpDir();
  try {
    assert.equal(pruneHistory(dir, 30), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
