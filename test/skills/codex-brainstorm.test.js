const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseDebateResponse } = require('../../scripts/skills/necessity-audit/debate-topic');

const root = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(root, 'skills/codex-brainstorm', rel), 'utf8');
const skill = read('SKILL.md');
const equilibrium = read('references/equilibrium.md');
const templates = read('references/templates.md');
const techniques = read('references/techniques.md');

// The rule the skill states, as code: X dominates Y only if X is at least as good on every
// criterion and strictly better on at least one. `null` is an unknown value, and an unknown
// supports no comparison in either direction. Lower is better on every criterion here.
function dominates(x, y) {
  let strictlyBetter = false;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === null || y[i] === null) return false;
    if (x[i] > y[i]) return false;
    if (x[i] < y[i]) strictlyBetter = true;
  }
  return strictlyBetter;
}
function retained(options) {
  return Object.keys(options).filter(
    (name) => !Object.keys(options).some((other) => other !== name && dominates(options[other], options[name]))
  );
}
// Reads the worked example's own option table, so the numbers under test are the documented ones.
function workedExampleOptions() {
  const options = {};
  for (const m of equilibrium.matchAll(/^\| ([A-C]) \| (\d+) days \| (\d+) ms \|$/gm)) {
    options[m[1]] = [Number(m[2]), Number(m[3])];
  }
  return options;
}

test('worked example table → documents A=2d/100ms, B=4d/100ms, C=4d/60ms', () => {
  const options = workedExampleOptions();

  assert.deepEqual(options, { A: [2, 100], B: [4, 100], C: [4, 60] });
});

test('worked example under the dominance rule → B excluded, A and C retained, as the text states', () => {
  const options = workedExampleOptions();

  const kept = retained(options);

  assert.deepEqual(kept, ['A', 'C']);
  assert.ok(dominates(options.A, options.B), 'A dominates B: fewer days, equal latency');
  assert.ok(!dominates(options.A, options.C) && !dominates(options.C, options.A), 'A and C trade off');
  assert.match(equilibrium, /Result: exclude B; retain A and C\./);
  assert.match(equilibrium, /A ships 2 days sooner, C responds 40 ms faster/);
});

test('worked example with C latency unknown → C retained as an evidence gap, B still excluded', () => {
  const options = { ...workedExampleOptions(), C: [4, null] };

  const kept = retained(options);

  assert.deepEqual(kept, ['A', 'C']);
  assert.match(equilibrium, /\| C's latency \|.*C is retained with the gap "measure C's latency"\. B is still excluded/);
});

test('worked example with B latency unknown → B is not excluded', () => {
  const options = { ...workedExampleOptions(), B: [4, null] };

  const kept = retained(options);

  assert.deepEqual(kept, ['A', 'B', 'C']);
  assert.match(equilibrium, /\| B's latency \|.*B is \*\*not\*\* excluded/);
});

test('dominance definition → every criterion at least as good and one strictly better, in SKILL.md and the reference', () => {
  for (const [name, text] of [['SKILL.md', skill], ['equilibrium.md', equilibrium]]) {
    const flat = text.replace(/\s+/g, ' ');
    assert.match(flat, /only if\*\* (it|X) is at least as good (as Y )?on \*\*every\*\* relevant criterion \*\*and\*\* strictly better on \*\*at least one\*\*/, name);
  }
  assert.match(skill, /A dominates B \(fewer days, equal latency\), so B is excluded\. A and C are both retained/);
});

test('unknown value → evidence gap in both directions, never a tie or a loss', () => {
  const flat = equilibrium.replace(/\s+/g, ' ');

  assert.match(flat, /An unknown supports neither "at least as good" nor "worse", so it supports no dominance claim in either direction/);
  assert.match(skill.replace(/\s+/g, ' '), /an unknown value supports no dominance claim in either direction/);
  assert.match(templates, /\| \[C\]\s+\| \[value\]\s+\| unknown\s+\| Retained — evidence gap \|/);
  assert.match(templates, /### Evidence Gaps/);
});

test('debate status and option comparison → reported as independent results', () => {
  assert.match(skill, /two results, reached independently of each other/);
  assert.match(skill, /Neither decides the other\./);
  assert.match(skill, /### Phase 4: Option Comparison \(independent of the debate status\)/);
  assert.match(equilibrium, /Run this whatever the debate status is\./);
  assert.match(templates, /^## Debate Status$/m);
  assert.match(templates, /^## Option Comparison$/m);
  assert.match(equilibrium.replace(/\s+/g, ' '), /A diverged debate fills it like any other, option comparison included/);
});

test('no new objections → a stopping rule, with no formal game-theory conclusion', () => {
  assert.match(skill, /\*\*"No new objections" is a stopping rule, not a proof\.\*\*/);
  assert.match(equilibrium, /a report never claims a formal game-theory result/);
  assert.match(templates, /Do not label the outcome a Nash\s+equilibrium, a mixed strategy or "optimal"/);
  assert.match(skill, /\| No new objections \| From round 3 on, a full round in which neither side raises a new, un-rebutted objection \|/);
});

test('retired formal labels → absent from every status and report template', () => {
  for (const [name, text] of [['SKILL.md', skill], ['equilibrium.md', equilibrium], ['templates.md', templates], ['techniques.md', techniques]]) {
    assert.doesNotMatch(text, /Pure Strategy|Pareto Optimal|Pareto set|Nash Equilibrium Report|Output Nash Equilibrium/i, name);
    assert.doesNotMatch(text, /Nash Equilibrium\s*=/i, `${name} must not define the outcome as a Nash equilibrium`);
  }
  assert.match(skill, /^- Keywords:.*Nash equilibrium/m, 'the trigger keyword stays so the skill is still found by that name');
});

test('report status lines → still read correctly by the necessity-audit debate parser', () => {
  const converged = '# Brainstorm Report: T\n\n3 rounds\n\nDebate Status: Equilibrium reached — converged on X\n';
  const diverged = '# Brainstorm Report: T\n\n5 rounds\n\nDebate Status: Diverged: A\'s maintainability is still open\n';

  assert.equal(parseDebateResponse(converged).equilibriumReached, true);
  assert.equal(parseDebateResponse(diverged).equilibriumReached, false);
});

test('diverged debate → the same single report plus divergence sections, not a second report format', () => {
  const divergence = equilibrium.slice(equilibrium.indexOf('## Handling Divergence'));

  assert.match(divergence, /There is one final report — `templates\.md` § Phase 5 — whatever the status\./);
  assert.doesNotMatch(equilibrium, /^# Divergence Report/m);
  assert.match(templates.replace(/\s+/g, ' '), /This is the only final report: fill both whatever the status is/);
  assert.match(skill, /`Diverged` uses the same report, with the divergence sections added/);
  assert.match(templates, /\| Confidence\s+\| Low \(diverged — whatever else is true\) \/ otherwise High \(converged, no evidence gap\) or Medium/);
  assert.match(divergence.replace(/\s+/g, ' '), /Recommend only options § Option Comparison retained — never one this report excluded as infeasible or dominated/);
});

test('no new objections with the sides still apart → Diverged, not a forced agreement', () => {
  const flat = equilibrium.replace(/\s+/g, ' ');

  assert.match(flat, /Running out of new objections is not agreement: a debate can stop with an old disagreement still standing, and that is `Diverged`/);
  assert.match(equilibrium, /\| \*\*Diverged\*\* \| The debate stopped — max rounds reached, or no new objections — with the sides still apart/);
  assert.match(skill, /`Diverged` when an earlier disagreement is still unresolved/);
  assert.match(equilibrium, /- \[ \] Stop — no new objections, but still apart on \[issue\] — Diverged/);
  assert.match(equilibrium, /- No  → stop; status per § Debate Status/);
  assert.doesNotMatch(equilibrium, /stop: equilibrium reached/i, 'the stop branch names no status of its own');
});

test('trade-off sentence → an amount only where both values are known', () => {
  const flat = templates.replace(/\s+/g, ' ');

  assert.match(flat, /State an amount only where both values are known\. Where one is an evidence gap, write the known side and make the other conditional/);
});

test('stopping rule and the three-round minimum → one rule, first checked at the end of round 3', () => {
  assert.match(skill, /Rounds 1–3 always run: the stopping rule is first checked at the end of round 3\./);
  assert.match(equilibrium, /^From round 3 on: stop when a full round passes in which neither side raises a new, un-rebutted objection\.$/m);
  assert.match(skill, /- \[ \] At least 3 rounds of adversarial debate/);
});

test('report round count → read by the necessity-audit debate parser from the summary table', () => {
  const row = templates.match(/^\| Debate Rounds\s+\| (.*?)\s+\|$/m);
  const rendered = `| Debate Rounds     | ${row[1].replace('N', '5')} |\n| Debate Status | Diverged |\n`;

  assert.equal(row[1], 'N rounds');
  assert.equal(parseDebateResponse(rendered).rounds, 5);
});

// --- Active wording outside the skill: no formal-equilibrium claim left in what users and consumers read ---

const repoFile = (rel) => readFileSync(resolve(root, rel), 'utf8');
const FORMAL = /nash|ナッシュ|纳什|納什|내시|내쉬|Nash 均衡/i;

test('catalog, READMEs and cookbooks → describe the debate without a formal-equilibrium claim', () => {
  const surfaces = [
    'docs/skill-catalog.yml', 'docs/cookbook/adversarial-design.md', 'docs/cookbook/request-to-spec.md',
    'README.md', 'README.zh-TW.md', 'README.zh-CN.md', 'README.ja.md', 'README.ko.md', 'README.es.md',
  ];

  for (const rel of surfaces) assert.doesNotMatch(repoFile(rel), FORMAL, rel);
  assert.match(repoFile('docs/skill-catalog.yml'), /use_when: "Adversarial brainstorming \(debate until no new objections, or the round limit\)"/);
  assert.match(repoFile('README.md'), /\| `\/codex-brainstorm` \| Adversarial brainstorming \(debate until no new objections, or the round limit\) \|/);
});

test('skills that consume the debate → name its status, not a Nash equilibrium', () => {
  const consumers = [
    'skills/necessity-audit/SKILL.md', 'skills/necessity-audit/references/dimensions.md',
    'skills/necessity-audit/references/phase-c-consolidate.md',
    'skills/plan-review/SKILL.md', 'skills/best-practices/SKILL.md',
    'skills/best-practices/references/debate-guide.md', 'skills/best-practices/references/output-templates.md',
    'skills/deep-research/SKILL.md', 'skills/debug/SKILL.md', 'skills/debug/references/probe-protocol.md',
  ];

  for (const rel of consumers) assert.doesNotMatch(repoFile(rel), FORMAL, rel);
  // The parser reference names the two legacy sentence forms it still accepts; that is a
  // description of stored evidence, not a claim about the debate.
  const phaseB = repoFile('skills/necessity-audit/references/phase-b-debate-topic.md');
  assert.equal((phaseB.match(/Nash/g) || []).length, 2);
  assert.match(phaseB, /"Nash equilibrium reached…" or "\[Both sides\] reached \[Nash\] equilibrium…"/);
  assert.match(repoFile('skills/necessity-audit/references/dimensions.md'), /the debate must end in agreement \(`Equilibrium reached`; `Diverged` fails\)/);
  assert.match(repoFile('skills/best-practices/references/debate-guide.md'), /\| Early exit \| None — `\/codex-brainstorm` first checks its stopping rule \(no new objections\) at the end of round 3 \|/);
});

test('this skill → the only active mentions left are the trigger keyword and the two disclaimers', () => {
  const mentions = [skill, equilibrium, templates, techniques].join('\n').match(/Nash/g) || [];

  assert.equal(mentions.length, 4, 'trigger keyword + SKILL.md disclaimer + equilibrium.md disclaimer + templates.md disclaimer');
});

test('legacy evidence → the stored debate fixture still parses as an agreement', () => {
  const fixture = repoFile('test/fixtures/necessity-audit/mock-debate-response.txt');

  assert.match(fixture, /Nash equilibrium reached after 3 rounds\./, 'the historical fixture is not rewritten');
  assert.equal(parseDebateResponse(fixture).equilibriumReached, true);
});

test('round limit → a new objection in round 5 ends the debate as Diverged instead of opening round 6', () => {
  assert.match(equilibrium, /- Yes → continue, unless this was round 5/);
  assert.match(equilibrium, /Round 5 is the last: a "Yes" there stops the debate as Diverged, with the objection listed as open\./);
  assert.match(equilibrium, /- \[ \] Yes → Continue \(list them\) — in round 5: stop, Diverged/);
  assert.match(techniques, /Did I raise a new, un-rebutted objection this round\? \[Yes\/No\]/);
});

test('cookbook decision table → decides from the retained options, not from the debate status', () => {
  const cookbook = repoFile('docs/cookbook/adversarial-design.md');

  assert.match(cookbook, /\| One option retained, no evidence gap\? \| Proceed with it and document the rationale — whatever the debate status \|/);
  assert.match(cookbook, /\| Debate `Diverged`\? \| Read the open objections: they say what is unresolved, not which options stand — the retained set does that \|/);
});
