'use strict';
// instruction-budget R1: four rules load only when their work is in play. Claude Code 2.1.281 does
// not load a rule with a non-`**` `paths:` list at launch — unless a CLAUDE.md `@`-imports it, which
// loads it anyway (measured, docs/features/instruction-budget/1-requirements.md § 7). So the pin is
// both halves: the frontmatter, and the absence of an `@` import in the template we ship.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { sectionAt, liveText } = require('../helpers/markdown-structure');

const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const TESTING = ['test/**', 'tests/**', '**/*.test.*', '**/*.spec.*', '**/__tests__/**', 'docs/features/**/requests/**'];
const SCOPED = {
  'docs-numbering.md': ['docs/**'],
  'docs-writing.md': ['**/*.md', 'hooks/**', 'scripts/**', 'skills/**'],
  'testing.md': TESTING,
  'testing-project.md': TESTING,
};

function pathsOf(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const lines = m[1].split('\n');
  if (lines[0] !== 'paths:') return null;
  return lines.slice(1).map((l) => /^ {2}- "(.+)"$/.exec(l)).map((x) => (x ? x[1] : null));
}

for (const [file, globs] of Object.entries(SCOPED)) {
  test(`rules/${file} when read → carries exactly its tech-spec § 3.1 paths`, () => {
    assert.deepEqual(pathsOf(read(`rules/${file}`)), globs);
  });
}

test('path-scoped globs → none is `**` alone, which Claude Code would load unconditionally', () => {
  for (const globs of Object.values(SCOPED)) assert.ok(!globs.every((g) => g === '**'));
});

test('CLAUDE.template.md ## Rules → never @-imports a path-scoped rule, and names each in plain text', () => {
  const rules = sectionAt(liveText(read('CLAUDE.template.md')), 2, 'Rules');
  for (const file of Object.keys(SCOPED)) {
    assert.doesNotMatch(rules, new RegExp(`@rules/${file.replace('.', '\\.')}`), `${file} is @-imported`);
    assert.match(rules, new RegExp(`- \`rules/${file.replace('.', '\\.')}\` \\(path-scoped`), `${file} is not named`);
  }
  // Negative control: the same check fails on the pre-R1 line.
  assert.match('- @rules/testing.md -- Test pyramid', /@rules\/testing\.md/);
});

test('rules that stay resident → carry no frontmatter (every other shipped rule loads at launch)', () => {
  const { readdirSync } = require('node:fs');
  for (const f of readdirSync(resolve(root, 'rules')).filter((n) => n.endsWith('.md') && !(n in SCOPED))) {
    assert.equal(pathsOf(read(`rules/${f}`)), null, `${f} unexpectedly path-scoped`);
  }
});
