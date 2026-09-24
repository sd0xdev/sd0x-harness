'use strict';

// git-autonomy NFR-5: every carrier that lists the shipped override templates lists exactly the
// `rules/*-project.md` set on disk — no missing template, no stale or invented one. Counts are
// pinned separately (project-setup-counts, claude-health, generate-readme-catalog); this file pins
// the *lists*. Each carrier is located by one anchor line or region, the `*-project.md` names in it
// are extracted, and the result is compared to disk as a set.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { liveText, sectionAt } = require('../helpers/markdown-structure');

const root = resolve(__dirname, '../..');
const read = (p) => liveText(readFileSync(resolve(root, p), 'utf8'));
const onDisk = readdirSync(resolve(root, 'rules')).filter((f) => f.endsWith('-project.md')).sort();

const NAME_RE = /[a-z][a-z0-9-]*-project(?:\.md)?\b/g;
const names = (text) => [...new Set((text.match(NAME_RE) || []).map((n) => (n.endsWith('.md') ? n : `${n}.md`)))].sort();

/** The one line of `text` that satisfies `pred`; more or fewer is itself a failure. */
function soleLine(text, pred, what) {
  const hits = text.split('\n').filter(pred);
  assert.equal(hits.length, 1, `${what}: expected exactly one anchor line, found ${hits.length}`);
  return hits[0];
}

const README_LOCALES = ['README.md', 'README.zh-TW.md', 'README.zh-CN.md', 'README.ja.md', 'README.ko.md', 'README.es.md'];

/** [carrier name, () => the text region that is the carrier's list]. */
const CARRIERS = [
  ...['CLAUDE.template.md', 'CLAUDE.md'].map((f) => [`${f} ## Rules @-lines`, () =>
    sectionAt(read(f), 2, 'Rules').split('\n').filter((l) => /^- @rules\/[\w-]+-project\.md/.test(l)).join('\n')]),
  ['docs/rules.md table rows', () =>
    read('docs/rules.md').split('\n').filter((l) => /^\| `[\w-]+-project` \|/.test(l)).join('\n')],
  ['rules/discretion.md out-of-scope sentence', () =>
    soleLine(read('rules/discretion.md'), (l) => l.includes('are **out of scope of this file'), 'discretion')
      .split('are **out of scope')[0]],
  ['skills/install-rules copy contract mapping', () =>
    soleLine(read('skills/install-rules/SKILL.md'), (l) => l.includes('override templates are copied from `rules/`'), 'install-rules')
      .split('`override_templates` in')[1].split(').')[0]],
  ['skills/project-setup 5.3 backfill list', () =>
    soleLine(read('skills/project-setup/SKILL.md'), (l) => l.includes('for each override template, check whether its line is also present'), 'project-setup backfill')],
  ['skills/project-setup override list', () =>
    soleLine(read('skills/project-setup/SKILL.md'), (l) => l.includes('— user-owned override templates'), 'project-setup')],
  ...README_LOCALES.map((f) => [`${f} Anchor-first override sentence`, () =>
    soleLine(read(f), (l) => l.includes('`auto-loop-project.md`') && /Anchor/.test(l) && !l.startsWith('|'), f)]),
];

test('override templates on disk when enumerated → at least the three shipped templates', () => {
  assert.ok(onDisk.length >= 3, `expected at least three templates, got ${onDisk}`);
});

for (const [name, region] of CARRIERS) {
  test(`${name} when read → lists exactly the override templates on disk`, () => {
    assert.deepEqual(names(region()), onDisk, `${name} disagrees with rules/*-project.md`);
  });
}

test('the set comparison when a carrier drops or invents a template → fails (negative control)', () => {
  const [, region] = CARRIERS[0];
  const text = region();
  const dropped = text.split('\n').filter((l) => !l.includes('git-workflow-project.md')).join('\n');
  assert.notDeepEqual(names(dropped), onDisk, 'a missing template is caught');
  const invented = `${text}\n- @rules/deploy-project.md -- invented`;
  assert.notDeepEqual(names(invented), onDisk, 'an extra, nonexistent template is caught');
  // The same words as ordinary data pass: the unchanged region matches disk.
  assert.deepEqual(names(text), onDisk);
});
