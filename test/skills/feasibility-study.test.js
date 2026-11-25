const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(root, 'skills/feasibility-study', rel), 'utf8');
const skill = read('SKILL.md');
const phases = read('references/analysis-phases.md');
const template = read('references/output-template.md');
const flat = (text) => text.replace(/\s+/g, ' ');

function section(text, heading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing ${heading}`);
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next === -1 ? undefined : next);
}

test('Phase 6 filter → built from the existing constraints and evaluation dimensions, no new scoring', () => {
  const phase6 = flat(skill.slice(skill.indexOf('### Phase 6: Comparative Decision'), skill.indexOf('## Evaluation Dimensions')));

  assert.match(phase6, /Phase 2's constraints and § Evaluation Dimensions — and adds no new scoring/);
  assert.match(phase6, /\| 1\. Hard constraints \| An option that breaks a constraint with Flexibility `None` is infeasible/);
  assert.match(skill, /^## Evaluation Dimensions$/m, 'the dimension table the filter reads is still there');
});

test('dominance filter → excludes only on every-dimension support plus one strict improvement', () => {
  for (const [name, text] of [['SKILL.md', skill], ['analysis-phases.md', phases]]) {
    assert.match(flat(text), /at least as good on (\*\*)?every(\*\*)? dimension and strictly better on (\*\*)?at least one(\*\*)?/, name);
  }
  assert.match(flat(skill), /evidence \(a measurement, cited code, a stated estimate\) supports each of those comparisons/);
  assert.match(template, /\| \[X\] \| Excluded: dominated by \[W\] \| \[per dimension, the evidence that W is at least as good\]; strictly better on \[dimension\]/);
  assert.match(template.replace(/\s+/g, ' '), /compare pairwise, and mark an option dominated only when some one feasible option is supported as at least as good on every dimension and strictly better on one/);
});

test('shared ordinal bin or missing measurement → an evidence gap, never equivalence', () => {
  const filter = section(phases, '## Phase 6: Comparative Decision');

  assert.match(skill, /\*\*Ordinal bins and missing measurements do not prove equivalence\.\*\*/);
  assert.match(filter, /\| Same bin, no underlying values \| \*\*No\*\* — evidence gap \| No \|/);
  assert.match(filter, /\| One value missing \| \*\*No\*\* — evidence gap \| No \|/);
  assert.match(filter, /A shared bin or a missing measurement is never recorded as "equal"/);
  assert.match(template, /A shared rating without\s+values is an evidence gap, not a tie\./);
});

test('measured values and different bins → still support an ordering', () => {
  const filter = section(phases, '## Phase 6: Comparative Decision');

  assert.match(filter, /\| Both values measured or estimated \(5d vs 10d\) \| Yes \| Yes, when they differ \|/);
  assert.match(filter, /\| Different bins \(🟢 vs 🔴\) \| Yes, for the better bin \| Yes \|/);
  assert.match(filter, /\| Same bin, underlying values known \(3d vs 10d, both 🟡\) \| Use the values, not the bin \|/);
});

test('evidence gaps → retained and carried into open questions', () => {
  assert.match(flat(skill), /The option stays; the gap goes to Open Questions with the measurement that would close it/);
  assert.match(template, /\| \[Z\] \| Retained — evidence gap \|/);
  assert.match(section(template, '## 8. Open Questions'), /- \[ \] Evidence gap: \[option\] — \[dimension\] unknown — \[measurement that would close it\]/);
});

test('recommendation → states its trade-off and a concrete condition that flips it to the backup', () => {
  const recommendation = section(template, '## 7. Recommendation');

  assert.match(recommendation, /- Trade-off: \[what the recommendation gives up, and what it gets, against the backup\]/);
  assert.match(recommendation, /\*\*Flips to backup when\*\*: \[concrete, observable condition/);
  assert.match(flat(skill), /\| 5\. Flip condition \| Name the \*\*concrete, observable condition\*\* under which the backup becomes the recommendation/);
  assert.match(phases, /\| Not a flip condition \| A condition nobody could observe or check \| "If requirements change", "if needed later" \|/);
});

test('verification checklist → carries the filter, the gaps and the flip condition', () => {
  const checklist = section(skill, '## Verification');

  assert.match(checklist, /names the hard constraint it breaks or the option that dominates it/);
  assert.match(checklist, /no shared bin or missing measurement treated as equal/);
  assert.match(checklist, /concrete condition that flips it to the backup/);
});

test('one or zero options left after the filter → no excluded option is promoted to backup', () => {
  const filter = section(phases, '## Phase 6: Comparative Decision');

  assert.match(filter, /\| Exactly one \| That one \| `None — no other retained option`; no flip condition\. Never name an excluded option as backup \|/);
  assert.match(filter, /\| None \| \*\*No option qualifies\*\* — list each option with the hard constraint it breaks \|/);
  assert.match(flat(skill), /With one option left, recommend it and report that no other option was retained; with none, report that no option qualifies/);
  assert.match(section(template, '## 7. Recommendation'), /write `None — no other retained option` when the filter left only one/);
});

test('recommendation template → names retained options only, never the rows its filter excluded', () => {
  const recommendation = section(template, '## 7. Recommendation');

  assert.match(recommendation, /\*\*Recommended\*\*: \[a retained option\]/);
  assert.match(recommendation, /\*\*Backup\*\*: \[another retained option\]/);
  assert.doesNotMatch(recommendation, /Option [XY]\b/);
});
