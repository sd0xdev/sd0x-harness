const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');

// --- SKILL.md content assertions ---

test('pre-pr-audit SKILL.md has 5 dimensions with weights', () => {
  const content = readFileSync(resolve(root, 'skills/pre-pr-audit/SKILL.md'), 'utf8');
  assert.match(content, /Execution Integrity.*25%/, 'should have Execution Integrity 25%');
  assert.match(content, /Coverage Adequacy.*25%/, 'should have Coverage Adequacy 25%');
  assert.match(content, /Test Quality.*20%/, 'should have Test Quality 20%');
  assert.match(content, /Risk-to-Test Alignment.*20%/, 'should have Risk-to-Test Alignment 20%');
  assert.match(content, /Evidence Governance.*10%/, 'should have Evidence Governance 10%');
});

test('pre-pr-audit SKILL.md has scoring model reference', () => {
  const content = readFileSync(resolve(root, 'skills/pre-pr-audit/SKILL.md'), 'utf8');
  assert.match(content, /references\/scoring-model\.md/, 'should reference scoring-model.md');
});

test('pre-pr-audit SKILL.md has 3-tier gate sentinels', () => {
  const content = readFileSync(resolve(root, 'skills/pre-pr-audit/SKILL.md'), 'utf8');
  assert.match(content, /✅ PR-Ready/, 'should have PR-Ready sentinel');
  assert.match(content, /⚠️ PR-Caution/, 'should have PR-Caution sentinel');
  assert.match(content, /⛔ PR-Blocked/, 'should have PR-Blocked sentinel');
});

test('pre-pr-audit SKILL.md has hard-fail overrides', () => {
  const content = readFileSync(resolve(root, 'skills/pre-pr-audit/SKILL.md'), 'utf8');
  assert.match(content, /Hard-Fail Overrides/, 'should have Hard-Fail section');
  assert.match(content, /Precommit stale/, 'should check precommit freshness');
  assert.match(content, /Evidence stale/, 'should check evidence freshness');
  assert.match(content, /Critical untested/, 'should check critical untested files');
});

test('pre-pr-audit SKILL.md has Prohibited block', () => {
  const content = readFileSync(resolve(root, 'skills/pre-pr-audit/SKILL.md'), 'utf8');
  assert.match(content, /git add.*git commit.*git push/i, 'should prohibit git actions');
});

test('pre-pr-audit SKILL.md has fast/deep modes', () => {
  const content = readFileSync(resolve(root, 'skills/pre-pr-audit/SKILL.md'), 'utf8');
  assert.match(content, /fast/, 'should have fast mode');
  assert.match(content, /deep/, 'should have deep mode');
  assert.match(content, /--strict/, 'should have strict flag');
});

// --- References ---

test('scoring-model.md exists with formulas', () => {
  const path = resolve(root, 'skills/pre-pr-audit/references/scoring-model.md');
  assert.ok(existsSync(path), 'scoring-model.md should exist');
  const content = readFileSync(path, 'utf8');
  assert.match(content, /pass.*1\.0/i, 'should define pass = 1.0');
  assert.match(content, /N\/A.*excluded/i, 'should define N/A = excluded');
  assert.match(content, /final_index/, 'should have final index formula');
});

test('output-template.md exists with sentinel strings', () => {
  const path = resolve(root, 'skills/pre-pr-audit/references/output-template.md');
  assert.ok(existsSync(path), 'output-template.md should exist');
  const content = readFileSync(path, 'utf8');
  assert.match(content, /PR-Ready/, 'should have PR-Ready sentinel');
  assert.match(content, /PR-Blocked/, 'should have PR-Blocked sentinel');
});

// --- Catalog registration ---

test('docs/skill-catalog.yml registers /pre-pr-audit', () => {
  const content = readFileSync(resolve(root, 'docs/skill-catalog.yml'), 'utf8');
  assert.match(content, /^ {2}- command: \/pre-pr-audit$/m, '/pre-pr-audit must be registered in the skill catalog');
});

// rules-residency r2: four exception checks moved to the testing contract; the prohibited-domain
// rows stay in the resident core. The audit names each source where it now lives and Reads first.
test('pre-pr-audit hard-fail overrides when read → cite the exception rules where they now live and Read the contract first', () => {
  const audit = readFileSync(resolve(__dirname, '../../skills/pre-pr-audit/SKILL.md'), 'utf8');
  const rows = audit.split('\n').filter((line) =>
    /^\| (Prohibited domain exception|Exception cap exceeded|Expired exception|Invalid reason class|Unverified exception) \|/.test(line));
  assert.equal(rows.length, 5);
  assert.match(rows[0], /`rules\/testing\.md` § Evidence Model/);
  for (const row of rows.slice(1)) assert.match(row, /`@skills\/test-review\/references\/testing-contract\.md` § Evidence Model/);
  assert.match(audit, /Read `@skills\/test-review\/references\/testing-contract\.md`; if that Read fails,\s+stop the audit before scoring and report that no readiness verdict can be given/);
  assert.match(audit, /never emit a\s+`PR-Ready`, `PR-Caution` or `PR-Blocked` sentinel with the hard-fail checks unrun/);
  const references = audit.split('\n## References\n')[1].split('\n## ')[0];
  assert.match(references, /`@skills\/test-review\/references\/testing-contract\.md` — exception gates, caps and expiry/);
  assert.doesNotMatch(references, /`@rules\/testing\.md` — Evidence model \+ exception policy/);
  assert.doesNotMatch(audit, /\| `@rules\/testing\.md` \|/, 'no row cites the rule for procedure that moved');
});
