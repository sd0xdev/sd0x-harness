const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const skill = readFileSync(resolve(root, 'skills/feature-dev/SKILL.md'), 'utf8');
const flat = skill.replace(/\s+/g, ' ');
const start = skill.indexOf('**Hard decisions: when to decide.**');
const hard = skill.slice(start, skill.indexOf('\n## ', start));
const hardFlat = hard.replace(/\s+/g, ' ');

test('hard-decision guidance → sits in the design step, before the next section', () => {
  assert.notEqual(start, -1, 'the paragraph exists');
  assert.ok(start > skill.indexOf('**Design before code**'), 'after Design before code');
  assert.ok(start < skill.indexOf('## agentctl (optional)'), 'inside the Workflow section');
});

test('hard decision → weighs the cost of changing course and the value of waiting', () => {
  assert.match(hardFlat, /the \*\*cost of changing course\*\* later \(who depends on the choice, and what a reversal would break\)/);
  assert.match(hardFlat, /the \*\*value of waiting\*\* \(what evidence would arrive, when, and what the delay costs\)/);
});

test('costly-to-reverse external contract → addressed early', () => {
  assert.match(hard, /\| Costly to reverse — an external contract others build on: public API, wire or file format, event schema, CLI flags \| Address it \*\*early\*\*, before building on it\./);
});

test('reversible private storage choice → deferred when feasible until a named signal', () => {
  assert.match(hard, /\| Cheap to reverse — a private choice behind an interface, such as the storage layout of data only this module reads \| \*\*Defer when feasible\*\*/);
  assert.match(hard, /name the \*\*signal\*\* that would settle it \(a measurement, a usage count, a failing test\)\. Decide when that signal arrives/);
  assert.match(hard, /\| Cannot wait — the work is blocked without it \| Decide now with the simplest reversible shape, and still name the signal/);
});

test('trivial feature → skips the hard-decision step and records nothing', () => {
  assert.match(hardFlat, /Only for a decision that is genuinely hard — a trivial feature skips this paragraph and records nothing\./);
  assert.match(flat, /`\/codex-architect` is for genuinely hard trade-offs .* not every feature\./, 'the existing lightweight default is unchanged');
  assert.doesNotMatch(skill.slice(skill.indexOf('## Verification Checklist')), /hard decision|signal/i, 'no new checklist item is imposed on every feature');
});

test('example → contract settled first, storage deferred to a named threshold', () => {
  const examples = skill.slice(skill.indexOf('## Examples'));

  assert.match(examples, /Response schema is an external contract → settle it first \(\/codex-architect\)/);
  assert.match(examples, /private and reversible → start with the simplest table behind the repository interface, revisit\s+when queue depth stays above 10,000 jobs for a day/);
});
