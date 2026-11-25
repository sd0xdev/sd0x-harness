const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const skillPath = resolve(root, 'skills/test-health/SKILL.md');

// --- SKILL.md assertions ---

test('test-health SKILL.md exists', () => {
  assert.ok(existsSync(skillPath), 'skills/test-health/SKILL.md should exist');
});

test('test-health SKILL.md has quick and full modes', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /quick/i, 'should describe quick mode');
  assert.match(content, /full/i, 'should describe full mode');
  assert.match(content, /--full/, 'should have --full flag');
});

test('test-health SKILL.md has output schema', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /Test Inventory/i, 'should have test inventory section');
  assert.match(content, /Code Coverage/i, 'should have code coverage section');
  assert.match(content, /Trend/i, 'should have trend section');
});

test('test-health SKILL.md has consume-first strategy', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /consume/i, 'should mention consume-first');
  assert.match(content, /heuristic/i, 'should mention heuristic fallback');
});

test('test-health SKILL.md has anti-theater guardrails', () => {
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /composite score/i, 'should mention no composite score');
  assert.match(content, /source.*transparency/i, 'should mention source transparency');
});

// --- Reference file assertions ---

test('artifact-formats.md exists with format table', () => {
  const p = resolve(root, 'skills/test-health/references/artifact-formats.md');
  assert.ok(existsSync(p), 'artifact-formats.md should exist');
  const content = readFileSync(p, 'utf8');
  assert.match(content, /LCOV/i, 'should describe LCOV format');
  assert.match(content, /Cobertura/i, 'should describe Cobertura format');
  assert.match(content, /JaCoCo/i, 'should describe JaCoCo format');
});

test('trend-schema.md exists with snapshot schema', () => {
  const p = resolve(root, 'skills/test-health/references/trend-schema.md');
  assert.ok(existsSync(p), 'trend-schema.md should exist');
  const content = readFileSync(p, 'utf8');
  assert.match(content, /snapshot/i, 'should describe snapshot schema');
  assert.match(content, /repoKey/i, 'should describe repoKey formula');
  assert.match(content, /lock/i, 'should describe lock pattern');
});

test('test-count-parsers.md exists with framework parsers', () => {
  const p = resolve(root, 'skills/test-health/references/test-count-parsers.md');
  assert.ok(existsSync(p), 'test-count-parsers.md should exist');
  const content = readFileSync(p, 'utf8');
  assert.match(content, /node:test/i, 'should describe node:test parser');
  assert.match(content, /jest/i, 'should describe jest parser');
  assert.match(content, /count_level/i, 'should describe count_level');
});

// --- Catalog registration ---

test('docs/skill-catalog.yml registers /test-health', () => {
  const content = readFileSync(resolve(root, 'docs/skill-catalog.yml'), 'utf8');
  assert.match(content, /^ {2}- command: \/test-health$/m, '/test-health must be registered in the skill catalog');
});

// --- Coverage trend comparability (population / denominator) ---

test('test-health coverage trend → same tool is not enough; population and denominator decide comparability', () => {
  const skill = readFileSync(skillPath, 'utf8');
  const schema = readFileSync(resolve(root, 'skills/test-health/references/trend-schema.md'), 'utf8');

  assert.match(schema, /\*\*The same tool can still measure a different population\.\*\*/);
  assert.match(schema, /\| Recorded, same `scope` \+ `config_sha` \| Any — code may have grown or shrunk \| `comparable: true`, `basis: same_population` \|/);
  assert.match(schema, /\| Missing on either point \(old snapshots\) \| Recorded on both — a positive count — and equal \| `comparable: true`, `basis: same_denominator` \|/);
  assert.match(schema, /\| Missing on either point \| Different, missing, or `0` \(a rate-only artifact stores no denominator\) \| `comparable: false` — provenance insufficient \|/);
  assert.match(schema, /\*\*If a metric's percentage is missing on\s+either point, that metric has no delta\*\*/);
  assert.match(schema, /\*\*Do not call it an improvement\s+or a regression\*\*/);
  assert.match(skill, /\| Population change detection \|/);
  assert.match(skill, /the row reads `Not comparable — <reason>`/);
});

test('test-health snapshot population → optional, and omitted rather than guessed', () => {
  const schema = readFileSync(resolve(root, 'skills/test-health/references/trend-schema.md'), 'utf8');

  assert.match(schema, /`code_coverage\.population` is \*\*optional\*\* — snapshots written before it existed do not carry it and\s+stay readable/);
  assert.match(schema, /Record it only if the producing scope and configuration can be established for that artifact; otherwise \*\*omit it\*\*/);
  assert.match(schema, /\*\*when it produced the coverage data\*\* — the producing invocation, not this run's search path/);
  assert.match(schema, /Never guess a value/);
  assert.match(schema, /\| Different `tool_id` \| — \| Reset trend:/, 'the tool-change reset is unchanged');
});

test('test-health trend docs → describe what trend.js actually does for the lock and the delta', () => {
  const schema = readFileSync(resolve(root, 'skills/test-health/references/trend-schema.md'), 'utf8');
  const trendSource = readFileSync(resolve(root, 'skills/test-health/scripts/trend.js'), 'utf8');

  assert.match(schema, /Otherwise retry about every 100 ms, for up to 5 s/);
  assert.match(trendSource, /function lock\(cacheDir, timeout = 5, ttl = 60\)/, 'the documented 5 s / 60 s are the code defaults');
  assert.match(schema, /\*\*Still not acquired after 5 s → the write and the prune proceed without the lock\*\* \(fail-open\)/);
  assert.match(schema, /no relative percentage is computed/);
  assert.doesNotMatch(schema, /pct_change/);
});
