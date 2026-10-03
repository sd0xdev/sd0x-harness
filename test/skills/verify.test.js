const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '../..');
const skillPath = resolve(root, 'skills/verify/SKILL.md');

function readSkill() {
  assert.ok(existsSync(skillPath), `skills/verify/SKILL.md does not exist at ${skillPath}`);
  return readFileSync(skillPath, 'utf8').replace(/\r\n/g, '\n');
}

function section(text, heading) {
  const at = text.indexOf(`\n## ${heading}\n`);
  assert.ok(at >= 0, `missing section ## ${heading}`);
  const next = text.indexOf('\n## ', at + 1);
  return text.slice(at, next === -1 ? undefined : next);
}

// ── Sentinel (claude-code-2-1-288-compat task 5) ─────────────────────────────────────────────
// `## Overall:` is the precommit runner's sentinel alone (rules/auto-loop.md § Gate Sentinels).

test('verify skill → both output templates end with ## Verify:, and ## Overall: appears nowhere', () => {
  const skill = readSkill();
  // Prose may name the precommit sentinel to explain it; no line may BE one.
  assert.doesNotMatch(skill, /^## Overall:/m);
  assert.match(skill, /never `## Overall:`/, "the note explaining why is present");
  // Counted over the whole file: the templates are fences whose own `## Verify (fast)` headings
  // would end a section slice early.
  assert.equal((skill.match(/^## Verify: ✅ PASS \/ ❌ FAIL$/gm) || []).length, 2, 'fast and full templates');
});

// ── Commit context (claude-code-2-1-288-compat task 6) ───────────────────────────────────────
// Reached as the host's pre-commit check, /verify reuses only a precommit that passed at the current
// digest and otherwise delegates to /precommit. It never produces a precommit verdict (INV-003).

test('commit context → sits before the workflow steps and reuses only precommit.passed === true', () => {
  const skill = readSkill();
  assert.ok(skill.indexOf('\n## Commit Context\n') < skill.indexOf('\n## Workflow Steps\n'),
    'the commit-context branch is read before the ordinary steps');
  const ctx = section(skill, 'Commit Context');
  assert.match(ctx, /`precommit\.passed` is exactly `true` → report "Precommit already passed at the current code\s+digest; no new checks executed" and stop/);
  assert.match(ctx, /installed copy first\s+\(`\.claude\/scripts\/review-state\.js`\)/);
});

test('commit context → the reuse path emits no sentinel and writes no note', () => {
  const ctx = section(readSkill(), 'Commit Context');
  assert.match(ctx, /Emit no sentinel and write no verdict note/);
  assert.doesNotMatch(ctx, /review-state\.js note/, 'the skill never writes a verdict');
});

test('commit context → every non-true reading delegates to /precommit (fail-closed)', () => {
  const ctx = section(readSkill(), 'Commit Context');
  const delegate = ctx.slice(ctx.indexOf('3. Anything else'));
  for (const reading of [/`passed` false/, /no `precommit` slot/, /does not parse as JSON/, /no\s+checker found/]) {
    assert.match(delegate, reading);
  }
  assert.match(delegate, /run `\/precommit`/);
  assert.match(delegate, /`\/verify` adds no\s+verdict of its own/);
});

test('commit context → the field it reads is a boolean the checker really emits', () => {
  const r = spawnSync(process.execPath, [resolve(root, 'scripts/review-state.js'), 'check', '--format=json'],
    { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const state = JSON.parse(r.stdout);
  assert.equal(typeof state.precommit.passed, 'boolean');
});

test('ordinary /verify → the five workflow steps are unchanged', () => {
  const steps = section(readSkill(), 'Workflow Steps');
  for (const s of ['lint', 'typecheck', 'test-unit', 'test-integration', 'test-e2e']) {
    assert.match(steps, new RegExp(`^\\| ${s} \\|`, 'm'), `missing step ${s}`);
  }
  assert.match(steps, /\*\*Failure behavior\*\*: continue-all/);
});
