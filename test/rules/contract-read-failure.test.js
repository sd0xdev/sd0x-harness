'use strict';

// FR-6, static half (rules-residency tech spec § 6): every resident pointer to an on-demand contract
// says what the governed work does when the Read fails. The behavioural half — a headless session with
// the contract removed — is the probe recorded in docs/features/rules-residency/review-log-fr6-probe.md;
// it found the two pointers from r1 (scope, stall diagnosis) naming their contract without a stop, and
// a session with the contract removed went on to declare a finding out of scope and to diagnose a stall.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { liveText, sectionAt } = require('../helpers/markdown-structure');

const root = resolve(__dirname, '../..');
const flat = (s) => s.replace(/\s+/g, ' ');
const section = (file, heading) => flat(sectionAt(liveText(readFileSync(resolve(root, file), 'utf8')), 2, heading));

// [rule, section, contract, the Read-before-act instruction, the stop clause]
const POINTERS = [
  ['rules/scope-discipline.md', 'Load the full contract when', 'skills/codex-code-review/references/scope-contract.md',
    'Read it before declaring a finding out of scope, deferring a candidate, or deriving a gate.',
    'If that Read fails, stop: decide no fix obligation, declare nothing out of scope, defer nothing and derive no gate — report that the contract could not be read, and leave the gate open until it can be.'],
  ['rules/auto-loop.md', 'Stall Detection and Diagnosis', 'skills/codex-code-review/references/loop-diagnostics.md',
    'Read it before diagnosing.',
    'If that Read fails, make no diagnosis and no adjustment — report the trigger and the failed Read, and take ⚠️ Need Human.'],
  ['rules/auto-loop.md', 'Override Contract', 'rules/override-contract.md',
    'Before interpreting, auditing or editing an override, Read', 'If that Read fails, do not edit or audit the override.'],
  ['rules/testing.md', 'Evidence Model', 'skills/test-review/references/testing-contract.md',
    'Read it before judging whether any AC has evidence', 'if that Read fails, stop judging AC evidence and say so'],
  ['rules/docs-numbering.md', 'Size Limit — 500 Lines', 'skills/doc-review/references/documentation-contract.md',
    'Before a split', 'If that Read fails, do not split and claim no exemption beyond the list above.'],
  ['rules/docs-writing.md', 'Code Comments', 'skills/doc-review/references/documentation-contract.md',
    'Before relying on an exemption, or changing the checker, Read',
    'If that Read fails, do not change the checker or rely on an exemption — stop that work and say so.'],
];

/** Listed pointers whose section lacks the contract, the Read instruction, or a stop that follows it. */
function missingStops(pointers, sectionText) {
  return pointers.filter(([rule, heading, contract, read, stop]) => {
    const text = sectionText(rule, heading);
    const at = text.indexOf(read);
    return !(text.includes(contract) && at !== -1 && text.indexOf(stop, at) > at);
  }).map(([rule, heading]) => `${rule} § ${heading}`);
}

// The other two override stubs and the other two testing.md sections are pinned where their content
// lives (override-contract.test.js, testing-docs-contracts.test.js); this list is one pointer per contract.
test('each listed contract pointer when read in its own section → names the contract, says Read first, then the stop', () => {
  assert.deepEqual(missingStops(POINTERS, section), []);
});

test('a pointer whose stop clause or Read instruction is deleted → is named by the same reader (negative control)', () => {
  const [rule, heading, , read, stop] = POINTERS[0];
  for (const cut of [stop, read]) {
    const stripped = (r, h) => (r === rule && h === heading ? section(r, h).replace(cut, '') : section(r, h));
    assert.deepEqual(missingStops(POINTERS, stripped), [`${rule} § ${heading}`]);
  }
});
