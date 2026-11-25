const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const skill = readFileSync(resolve(root, 'skills/feature-verify/SKILL.md'), 'utf8');
const template = readFileSync(resolve(root, 'skills/feature-verify/references/output-template.md'), 'utf8');
const start = skill.indexOf('### Observation vs Improvement Claim');
const section = skill.slice(start, skill.indexOf('### Dual Verification'));
const flat = section.replace(/\s+/g, ' ');

test('observation vs improvement claim → sits in the P5 verdict phase', () => {
  assert.notEqual(start, -1);
  assert.ok(start > skill.indexOf('## P5: Verdict'));
  assert.ok(start < skill.indexOf('## Production Guardrails'));
});

test('observation → needs nothing beyond the normal phases', () => {
  assert.match(section, /\| Observation \| "After deploy, p95 latency reads 180 ms" · "the metric is emitted with the right labels" \| Nothing beyond P3\/P4 \|/);
  assert.match(flat, /That is all normal verification needs, and it stays as light as the tables above/);
  assert.match(flat, /A standalone observation needs none, and Pass \/ Warn \/ Blocked never depend on one/);
});

test('requested before/after difference → a comparator is collected even without a causal claim', () => {
  assert.match(section, /\| Before\/after difference \| .* \| A \*\*comparator\*\*: the same metric, query and window definition from before the deploy, or from a concurrent instance without the change \|/);
  assert.match(flat, /Collect a comparator only when one is needed: the user asked how a value differs before and after, or the report is going to state a difference or a cause/);
});

test('causal improvement claim → needs a comparator and concurrent changes ruled out, not merely listed', () => {
  assert.match(section, /\| Causal improvement claim \| "The change reduced p95 latency" \| The comparator \*\*and\*\* concurrent-change evidence: what else changed in the window — other deploys, config or flag changes, traffic volume or mix, time-of-day pattern — each checked and listed, \*\*and none of them left standing as a plausible explanation\*\* \|/);
  assert.match(section, /\| Comparator; concurrent changes checked and none found, or each ruled out with a stated reason \| The causal claim \|/);
});

test('missing comparator, unchecked or unexplained concurrent change → the claim is downgraded or removed, not softened', () => {
  assert.match(section, /\| No comparator \| The observation only \|/);
  assert.match(section, /\| Comparator; concurrent changes not checked \| The difference, with \*\*"attribution not established"\*\* \|/);
  assert.match(section, /\| Comparator; a concurrent change was found that could explain the difference \| The difference, with \*\*"attribution not established"\*\* — checking and listing it is not ruling it out \|/);
  assert.match(flat, /A causal claim that falls short is removed from the report, not softened\./);
});

test('verdict tables → unchanged, so a normal run carries no comparator requirement', () => {
  const verdicts = skill.slice(skill.indexOf('### Per-Endpoint Verdict'), start);

  assert.match(verdicts, /\| \*\*Pass\*\* \| L1 passed \+ L2 has expected signal \+ L3 normal \+ M1 correct \(N\/A items don't block\) \|/);
  assert.match(verdicts, /\| \*\*High\*\* \| L3\/L4 \+ Claude and Codex agree \|/);
  assert.doesNotMatch(verdicts, /comparator|confounder|causal/i);
});

test('report template → the improvement-claim block is optional and states the allowed wording', () => {
  const block = template.slice(template.indexOf('### Improvement Claim'), template.indexOf('### Blind Spots'));

  assert.match(block, /### Improvement Claim \(include when a difference or a cause was asked about or is stated\)/);
  assert.match(block, /\| Comparator \| .* \/ none \|/);
  assert.match(block, /\| Concurrent changes checked \|/);
  assert.match(block, /\| Wording allowed \| Observation only \/ Difference, attribution not established \/ Causal claim \|/);
  assert.match(block, /Omit this section for a normal verification — a standalone observation\./);
  assert.match(block.replace(/\s+/g, ' '), /a concurrent change left unchecked, or found and still a plausible explanation → "Difference, attribution not established"/);
});

test('checklist and example → a causal statement without support is worded as an observation', () => {
  assert.match(skill, /- \[ \] P5: Any statement that the change \*caused\* an improvement has a comparator and concurrent changes checked with none left as a plausible explanation — otherwise it is worded as an observation, or as a difference with "attribution not established"/);
  assert.match(skill.replace(/\s+/g, ' '), /A config change shipped in the same window → "attribution not established"; verdict Pass \(the feature works\), no claim that the change made it faster/);
});
