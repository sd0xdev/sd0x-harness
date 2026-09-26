'use strict';

// rules-residency r2 (tech spec § 3.4): the testing and documentation procedure moved out of the
// three path-scoped rules into two on-demand contracts. Two properties are pinned here:
//   move, not copy — each moved marker lives in its contract and in no rule, so the two cannot drift;
//   resident core  — each rule keeps its core semantics plus a Read pointer that stops the work
//                    when the contract cannot be read (FR-6).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { liveText, sectionAt } = require('../helpers/markdown-structure');

const root = resolve(__dirname, '../..');
const read = (p) => liveText(readFileSync(resolve(root, p), 'utf8'));

const TESTING_CONTRACT = 'skills/test-review/references/testing-contract.md';
const DOCS_CONTRACT = 'skills/doc-review/references/documentation-contract.md';

// Markers chosen because each names one moved rule and no other file has a reason to restate it.
const MOVED = [
  [TESTING_CONTRACT, ['rules/testing.md'], ['ENV_UNAVAILABLE', '13+ (should split)', '`⚠️ Adequate with exceptions`', 'Pre-PR required:']],
  [DOCS_CONTRACT, ['rules/docs-numbering.md', 'rules/docs-writing.md'],
    ['_inferParentType', 'A move breaks links in both directions', 'Cut at the section that dominates', 'EXEMPT_FIRST_LINE', 'skips rather\nthan fails']],
];

/** Markers of `markers` that `text` carries — the one reader the check and its control share. */
function carried(text, markers) {
  const flat = text.replace(/\s+/g, ' ');
  return markers.filter((m) => flat.includes(m.replace(/\s+/g, ' ')));
}

test('moved procedure when searched → lives in its contract and in none of the rules it left', () => {
  for (const [contract, rules, markers] of MOVED) {
    assert.deepEqual(carried(read(contract), markers), markers, `${contract} lost moved text`);
    for (const rule of rules) {
      assert.deepEqual(carried(read(rule), markers), [], `${rule} still restates text that moved to ${contract}`);
    }
  }
  // Negative control through the same reader: a marker copied back into a rule is seen.
  const copied = `${read('rules/testing.md')}\nClosed enum: ENV_UNAVAILABLE\n`;
  assert.deepEqual(carried(copied, ['ENV_UNAVAILABLE']), ['ENV_UNAVAILABLE']);
});

test('the Anchor domain rows when searched → live exactly once, in rules/testing.md, and nowhere in the moved set', () => {
  const rows = ['| Security AC | ❌ Never |', '| Data-integrity AC | ❌ Never |', '| Regression AC | ❌ Never |'];
  const count = (text, row) => text.split(row).length - 1;
  for (const row of rows) {
    assert.equal(count(read('rules/testing.md'), row), 1, `Anchor Register #3 row must stay resident once: ${row}`);
    for (const other of [TESTING_CONTRACT, DOCS_CONTRACT, 'rules/docs-numbering.md', 'rules/docs-writing.md']) {
      assert.equal(count(read(other), row), 0, `${other} restates an Anchor row: ${row}`);
    }
  }
});

/** Substantial lines of `contract` (prose or table rows, 40+ characters) that `rule` also carries. */
function copiedLines(contract, rule) {
  const flat = (s) => s.replace(/\s+/g, ' ').trim();
  const ruleFlat = flat(rule);
  return contract.split('\n').map(flat)
    .filter((l) => l.length >= 40 && !/^[|: -]+$/.test(l))
    .filter((l) => ruleFlat.includes(l));
}

// Every substantial line, not a sample: a moved paragraph copied back into a rule is caught whichever
// paragraph it is. Raw text on purpose — masking would turn fenced lines into identical NUL runs.
const raw = (p) => readFileSync(resolve(root, p), 'utf8');
test('each contract when compared line by line → shares no substantial line with the rules it left', () => {
  for (const [contract, rules] of MOVED) {
    for (const rule of rules) {
      const shared = copiedLines(raw(contract), raw(rule));
      assert.deepEqual(shared, [], `${rule} and ${contract} both carry these lines`);
    }
  }
  // Negative control through the same reader: a contract paragraph pasted into a rule is found.
  const line = 'Three constraints, each with a parser behind it: the main file keeps the **canonical filename**';
  assert.ok(raw(DOCS_CONTRACT).includes(line), 'fixture premise: the line is in the contract');
  assert.equal(copiedLines(`${line}\n`, `${raw('rules/docs-numbering.md')}\n${line}`).length, 1);
  // …and one whose spacing is significant: both sides are normalized, so alignment spaces do not hide it.
  const aligned = raw(DOCS_CONTRACT).split('\n').find((l) => l.includes('2-tech-spec.md        # Main'));
  assert.ok(aligned, 'fixture premise: the aligned folder-shape line is in the contract');
  assert.equal(copiedLines(`${aligned}\n`, `${raw('rules/docs-numbering.md')}\n${aligned}`).length, 1);
});

test('resident cores when read → name their contract and stop the work when it cannot be read', () => {
  const cores = [
    ['rules/testing.md', TESTING_CONTRACT, 'If that Read fails, stop that work and say so'],
    ['rules/docs-numbering.md', DOCS_CONTRACT, 'If that Read fails, do not split and claim no exemption beyond the list above.'],
    ['rules/docs-writing.md', DOCS_CONTRACT, 'If that Read fails, do not change the checker or rely on an exemption — stop that work'],
  ];
  for (const [rule, contract, stop] of cores) {
    const text = read(rule).replace(/\s+/g, ' ');
    assert.ok(text.includes(`\`${contract}\``), `${rule} must name ${contract}`);
    assert.ok(text.includes(stop), `${rule} must stop the governed work when the Read fails`);
  }
});

test('resident cores when read → keep the rules an ad-hoc session needs before any Read', () => {
  const numbering = read('rules/docs-numbering.md').replace(/\s+/g, ' ');
  for (const clause of ['Scope: prose feature documents under `docs/features/`', 'Functional documents are exempt',
    '**Prune**', '**Merge**', '**Split**', 'Records are exempt from all three', 'Measure with `wc -l`']) {
    assert.ok(numbering.includes(clause), `docs-numbering.md core lost: ${clause}`);
  }
  const writing = read('rules/docs-writing.md').replace(/\s+/g, ' ');
  for (const clause of ['| ≥ 30 | **Migrate now**', '| 25–29 | Warning', 'never plain deletion', 'logical block, not the contiguous run']) {
    assert.ok(writing.includes(clause), `docs-writing.md core lost: ${clause}`);
  }
});

test('owning skills when read → Read their contract first and stop when it fails', () => {
  for (const [skill, ref] of [['skills/test-review/SKILL.md', 'references/testing-contract.md'],
    ['skills/doc-review/SKILL.md', 'references/documentation-contract.md']]) {
    const text = read(skill).replace(/\s+/g, ' ');
    assert.ok(text.includes(`**Read first**: \`${ref}\``), `${skill} must Read ${ref} first`);
    assert.ok(text.includes('If that Read fails, stop and report it'), `${skill} must stop when the Read fails`);
  }
});

// Every original `##` heading stays in its rule: the repository cites them by name (`§`), so a
// heading that moved would leave those citations pointing at nothing.
test('the three rules when their headings are listed → keep every original `##` heading', () => {
  const h2 = (p) => [...read(p).matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(h2('rules/testing.md'),
    ['Test Pyramid', 'Conventions', 'Evidence Model', 'Adequacy Gate Sentinels', 'Execution', 'Project Customization']);
  assert.deepEqual(h2('rules/docs-numbering.md'),
    ['Lifecycle docs', 'Ancillary docs', 'Size Limit — 500 Lines', 'Cross-references', 'Prohibited']);
  assert.deepEqual(h2('rules/docs-writing.md'), ['Code Comments', 'Durable References', 'Locale-Aware Writing']);
});

// The owning skill is a second place the moved policy used to be restated; it now points instead.
test('test-review SKILL when read → points at the contract instead of restating its gates and caps', () => {
  const skill = read('skills/test-review/SKILL.md').replace(/\s+/g, ' ');
  const restated = ['Closed enum', 'ENV_UNAVAILABLE', '1-8 AC = max 1', 'hard cap 2', 'Validated exceptions within cap'];
  assert.deepEqual(carried(skill, restated), [], 'the skill restates contract policy');
  assert.ok(skill.includes('`references/testing-contract.md` § Evidence Model'), 'the exception step must point at the contract');
  assert.ok(skill.includes('`references/testing-contract.md` § Adequacy Gate Sentinels'), 'the gate step must point at the contract');
});

// A `§` citation lands a reader on one section, not on the file preamble — so each moved section
// carries the pointer and its own stop condition.
test('rules/testing.md moved sections when read alone → each names the contract and stops when the Read fails', () => {
  // Each stop names the whole governed act, not a narrower piece of it.
  for (const [heading, stop] of [['Evidence Model', 'if that Read fails, stop judging AC evidence and say so'],
    ['Adequacy Gate Sentinels', 'if that Read fails, report no verdict and say so'],
    ['Execution', 'if that Read fails, stop and say so']]) {
    const body = sectionAt(read('rules/testing.md'), 2, heading).replace(/\s+/g, ' ');
    assert.ok(body.includes(`\`${TESTING_CONTRACT}\``), `§ ${heading} must name the contract`);
    assert.ok(body.includes(stop), `§ ${heading} must stop the whole governed act when the Read fails`);
  }
});

// The values the move promised to preserve, pinned where they now live.
test('testing contract Evidence Model when read → keeps the exact caps and expiry it carried in rules/testing.md', () => {
  const evidence = sectionAt(read(TESTING_CONTRACT), 2, 'Evidence Model');
  assert.match(evidence, /^\| 1-8 \(standard\) \| 1 \|$/m);
  assert.match(evidence, /^\| 9-12 \(legacy\) \| 2 \|$/m);
  assert.match(evidence, /^\| 13\+ \(should split\) \| 2 \(hard cap\) \|$/m);
  assert.match(evidence, /Required \(ISO 8601\); default \+14d; expired = ⛔ in strict, ⚠️ in advisory/);
  assert.match(evidence, /Closed enum: `ENV_UNAVAILABLE` \/ `UNSAFE_TO_AUTOMATE` \/ `ONE_TIME_MIGRATION`/);
  // Negative control through the same assertion: a changed cap no longer matches.
  assert.doesNotMatch(evidence.replace('| 1-8 (standard) | 1 |', '| 1-8 (standard) | 3 |'), /^\| 1-8 \(standard\) \| 1 \|$/m);
});

// The contract's own load conditions and the rule's stop cover the same acts: splitting and
// exemption judgments. Pruning and merging are settled by the resident core alone.
test('docs-numbering § Size Limit when read alone → routes a split and an exemption claim to the contract', () => {
  const size = sectionAt(read('rules/docs-numbering.md'), 2, 'Size Limit — 500 Lines').replace(/\s+/g, ' ');
  const route = size.slice(size.lastIndexOf('Before a split'));
  assert.ok(route.includes(`\`${DOCS_CONTRACT}\``), 'the route names the contract');
  assert.match(route, /claiming a file is exempt/, 'an exemption claim beyond the list is routed');
  assert.match(route, /If that Read fails, do not split and claim no exemption/);
  const load = read(DOCS_CONTRACT).split('\n').filter((l) => l.startsWith('>')).join(' ').replace(/\s+/g, ' ');
  assert.match(load, /Pruning and merging need only the resident core/, 'the contract claims no act the rule does not route');
});

// The kernel's trigger row (tech spec § 3.2) routes exactly the acts the rules and the contract do.
test('the tech spec trigger row for the documentation contract → names every act the rules route to it', () => {
  const spec = readFileSync(resolve(root, 'docs/features/rules-residency/2-tech-spec.md'), 'utf8');
  const row = spec.split('\n').find((l) => l.includes('| documentation contract ('));
  assert.ok(row, 'the documentation trigger row exists');
  for (const act of ['Splitting a feature document', 'claiming a line-budget exemption the resident list does not settle',
    'relying on a comment-block exemption', 'changing the comment-block checker', 'pruning and merging need only the resident core']) {
    assert.ok(row.includes(act), `trigger row omits: ${act}`);
  }
});
