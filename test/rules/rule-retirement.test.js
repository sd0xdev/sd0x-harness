'use strict';

// rules-residency task 3 retires two managed rules: `fix-all-issues.md` (moved into the resident
// auto-loop core and the scope contract) and `framework.md` (no consumer). A retired rule must stay
// gone from the plugin, be named on `/install-rules`' retired list so installed copies are removed
// when unmodified, be classified by `/claude-health`, and be imported by no tracked CLAUDE file.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const RETIRED = ['fix-all-issues.md', 'framework.md'];

/** Retired names that some carrier still treats as live — the one reader check and control share. */
function stillLive(texts) {
  const live = [];
  for (const name of RETIRED) {
    if (existsSync(resolve(root, 'rules', name))) live.push(`rules/${name} exists`);
    for (const [file, text] of Object.entries(texts)) {
      if (new RegExp(`@rules/${name.replace('.', '\\.')}`).test(text)) live.push(`${file} imports ${name}`);
      if (file === 'rules/discretion.md' && text.includes(`| \`${name}\` |`)) live.push(`discretion.md classifies ${name}`);
    }
  }
  return live;
}

const carriers = () => ({
  'CLAUDE.md': read('CLAUDE.md'),
  'CLAUDE.template.md': read('CLAUDE.template.md'),
  'rules/discretion.md': read('rules/discretion.md'),
});

test('retired rules when searched → gone from the plugin, imported by no CLAUDE file, classified by no baseline row', () => {
  assert.deepEqual(stillLive(carriers()), []);
  // Negative control through the same reader: a restored import is seen.
  const restored = { ...carriers(), 'CLAUDE.template.md': `${read('CLAUDE.template.md')}\n- @rules/framework.md\n` };
  assert.deepEqual(stillLive(restored), ['CLAUDE.template.md imports framework.md']);
});

test('install-rules when read → lists every retired rule, and says an unmodified copy is removed and a modified one kept', () => {
  const skill = read('skills/install-rules/SKILL.md');
  for (const name of RETIRED) assert.match(skill, new RegExp(`^\\| \`${name.replace('.', '\\.')}\` \\| rules-residency task 3 \\|`, 'm'));
  assert.match(skill, /\| Retired \(listed below; the plugin no longer ships it\) \| Unchanged since install \(hash match\) → remove the local copy, mark its manifest entry `deleted: true`/);
  assert.match(skill, /Modified by user → keep the file, report it, change nothing \|/);
});

test('claude-health when read → classifies a retired rule that is still installed', () => {
  assert.match(read('skills/claude-health/SKILL.md'),
    /^\| `RETIRED` \| name on `\/install-rules`' retired list, plugin file absent, local exists \| P2 \|/m);
});

// A retired rule is absent from the plugin's rules/ directory, so neither the install enumeration
// nor a health inventory built from shipped files ever reaches an installed copy. Both workflows must
// walk the retired list itself (code review, rules-residency task 3).
/** Retired names a workflow text never walks: install-rules' sweep phase and claude-health's inventory row. */
function unreached(installRules, claudeHealth) {
  const missed = [];
  const sweep = /^Phase 2\.5: Retired sweep — every name on the Retired table, checked in \.claude\/rules\/$/m.test(installRules)
    && /\*\*Phase 2\.5 runs on every invocation, whatever install set Phase 3 picks\.\*\*/.test(installRules);
  if (!sweep) missed.push('install-rules has no retired sweep');
  const row = claudeHealth.split('\n').find((l) => l.startsWith('| Retired rules | `.claude/rules/*.md` |')) || '';
  for (const name of RETIRED) if (!row.includes(`\`${name}\``)) missed.push(`claude-health inventory omits ${name}`);
  return missed;
}

test('install-rules and claude-health when upgrading → both walk the retired list, not the shipped rules dir', () => {
  const ir = read('skills/install-rules/SKILL.md');
  const ch = read('skills/claude-health/SKILL.md');
  assert.deepEqual(unreached(ir, ch), []);
  // Negative control through the same reader: dropping the phase, or a name from the row, is seen.
  assert.deepEqual(unreached(ir.replace(/^Phase 2\.5: .*\n/m, ''), ch), ['install-rules has no retired sweep']);
  assert.deepEqual(unreached(ir, ch.replace('`framework.md`. Classified', 'Classified')), ['claude-health inventory omits framework.md']);
});
