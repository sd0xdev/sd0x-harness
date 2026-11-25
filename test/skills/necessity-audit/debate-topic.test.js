'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTopic,
  parseDebateResponse,
  classifyEvidenceLocation,
} = require('../../../scripts/skills/necessity-audit/debate-topic');

function makePreflight(overrides = {}) {
  return {
    absPath: '/abs/docs/features/foo/1-requirements.md',
    relPath: 'docs/features/foo/1-requirements.md',
    featureKey: 'foo',
    docKind: 'requirements',
    greenfield: false,
    depth: 'normal',
    activeDimensions: [1, 2, 3, 4, 5, 6],
    ...overrides,
  };
}

test('buildTopic — normal depth includes all 6 dimensions + feature key', () => {
  const topic = buildTopic(makePreflight());
  assert.match(topic, /1\.\s+Necessity Now/);
  assert.match(topic, /6\.\s+Scope Drift/);
  assert.match(topic, /Feature key: foo/);
  assert.match(topic, /any termination accepted/);
});

test('buildTopic — deep depth requires agreement, in words the parser cannot mistake for a result', () => {
  const topic = buildTopic(makePreflight({ depth: 'deep' }));

  assert.match(topic, /agreement REQUIRED — the debate must end with both sides in agreement/);
  assert.match(topic, /one that merely went quiet while the sides still disagree/);
  assert.doesNotMatch(topic, /Nash/i, 'no formal game-theory claim is requested');
  assert.equal(parseDebateResponse(topic).equilibriumReached, false, 'an echoed topic is not an agreement');
});

test('buildTopic — normal depth topic echoed back → not an agreement either', () => {
  const topic = buildTopic(makePreflight());

  assert.equal(parseDebateResponse(topic).equilibriumReached, false);
});

test('buildTopic — greenfield uses REASONING-ONLY evidence note', () => {
  const topic = buildTopic(makePreflight({ greenfield: true }));
  assert.match(topic, /\[REASONING-ONLY\]/);
});

test('buildTopic — brief depth filters to dimensions 1-3 only', () => {
  const topic = buildTopic(makePreflight({ activeDimensions: [1, 2, 3] }));
  assert.match(topic, /1\.\s+Necessity Now/);
  assert.match(topic, /3\.\s+Extensibility/);
  assert.doesNotMatch(topic, /4\.\s+Configurability/);
});

test('parseDebateResponse — extracts verdict with file:line evidence + attaches elementId tag', () => {
  const raw = `
[VERDICT: Cut] FR-5 — Unused downstream — Evidence: src/foo.ts:42
## Conclusion
Nash equilibrium reached.
`;
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.perElementVerdicts.length, 1);
  assert.equal(parsed.perElementVerdicts[0].classification, 'Cut');
  assert.equal(parsed.perElementVerdicts[0].id, 'FR-5');
  assert.equal(parsed.perElementVerdicts[0].evidence, 'src/foo.ts:42');
  assert.equal(parsed.perElementVerdicts[0].evidenceCitation.type, 'file:line');
  assert.equal(parsed.perElementVerdicts[0].evidenceCitation.elementId, 'FR-5');
  assert.equal(parsed.perElementVerdicts[0].evidenceCitation.location, 'src/foo.ts:42');
});

test('parseDebateResponse — em-dash inside rationale does NOT terminate match', () => {
  const raw = `[VERDICT: Cut] FR-9 — feature — which has no consumers — is redundant — Evidence: doc:§3.2`;
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.perElementVerdicts.length, 1, 'must not silently drop verdict');
  assert.equal(parsed.perElementVerdicts[0].id, 'FR-9');
  assert.equal(parsed.perElementVerdicts[0].classification, 'Cut');
  assert.match(parsed.perElementVerdicts[0].rationale, /which has no consumers/);
  assert.equal(parsed.perElementVerdicts[0].evidence, 'doc:§3.2');
});

test('parseDebateResponse — verdict without Evidence tail still parses', () => {
  const raw = `[VERDICT: Keep] NFR-1 — baseline security requirement`;
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.perElementVerdicts.length, 1);
  assert.equal(parsed.perElementVerdicts[0].evidence, null);
  assert.equal(parsed.perElementVerdicts[0].evidenceCitation, null);
});

test('parseDebateResponse — equilibrium detection (nash keyword)', () => {
  const raw = '## Conclusion\nReached Nash equilibrium after 3 rounds.';
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.equilibriumReached, true);
  assert.equal(parsed.rounds, 3);
});

test('parseDebateResponse — threadId extraction', () => {
  const raw = 'threadId: 1234567890abcdef1234567890abcdef';
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.threadId, '1234567890abcdef1234567890abcdef');
});

test('parseDebateResponse — verdict evidenceCitation pushed into evidenceCitations list', () => {
  const raw = `[VERDICT: Cut] FR-5 — dead — Evidence: src/foo.ts:42`;
  const parsed = parseDebateResponse(raw);
  const tagged = parsed.evidenceCitations.filter(c => c.elementId === 'FR-5');
  assert.equal(tagged.length, 1);
  assert.equal(tagged[0].type, 'file:line');
  assert.equal(tagged[0].location, 'src/foo.ts:42');
});

test('parseDebateResponse — leading whitespace before verdict is tolerated', () => {
  const raw = '    [VERDICT: Cut] FR-5 — indented — Evidence: src/foo.ts:42';
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.perElementVerdicts.length, 1);
  assert.equal(parsed.perElementVerdicts[0].id, 'FR-5');
});

test('parseDebateResponse — tab-prefixed verdict is tolerated', () => {
  const raw = '\t[VERDICT: Keep] NFR-2 — necessary';
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.perElementVerdicts.length, 1);
  assert.equal(parsed.perElementVerdicts[0].id, 'NFR-2');
});

test('parseDebateResponse — bullet-list prefix (- * +) is tolerated', () => {
  const raw = [
    '- [VERDICT: Cut] FR-5 — dash bullet',
    '* [VERDICT: Keep] FR-6 — star bullet',
    '+ [VERDICT: Review] FR-7 — plus bullet',
    '1. [VERDICT: Cut] FR-8 — numbered bullet',
  ].join('\n');
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.perElementVerdicts.length, 4);
  assert.deepEqual(parsed.perElementVerdicts.map(v => v.id), ['FR-5', 'FR-6', 'FR-7', 'FR-8']);
});

test('parseDebateResponse — multi-verdict blob with headers and prose', () => {
  const raw = `
## Per-element verdicts

- [VERDICT: Cut] FR-5 — over-engineered — Evidence: src/foo.ts:42
- [VERDICT: Keep] FR-6 — essential — Evidence: doc:§3.1
- [VERDICT: Review] FR-7 — borderline — this has — em-dashes — Evidence: src/bar.ts:10

## Conclusion
Nash equilibrium reached.
`;
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.perElementVerdicts.length, 3);
  assert.equal(parsed.perElementVerdicts[2].evidence, 'src/bar.ts:10');
});

test('parseDebateResponse — file:line in verdict Evidence NOT duplicated in global sweep', () => {
  const raw = '[VERDICT: Cut] FR-5 — dead — Evidence: src/foo.ts:42';
  const parsed = parseDebateResponse(raw);
  const fileLine = parsed.evidenceCitations.filter(c => c.type === 'file:line' && c.location === 'src/foo.ts:42');
  assert.equal(fileLine.length, 1, 'evidence must appear exactly once despite being valid file:line in verdict tail');
});

test('parseDebateResponse — prose file:line outside verdicts still captured', () => {
  const raw = `
[VERDICT: Cut] FR-5 — dead — Evidence: src/foo.ts:42

See also src/elsewhere.ts:99 for related context.
`;
  const parsed = parseDebateResponse(raw);
  const locations = parsed.evidenceCitations.map(c => c.location);
  assert.ok(locations.includes('src/foo.ts:42'));
  assert.ok(locations.includes('src/elsewhere.ts:99'));
  const fooCount = locations.filter(l => l === 'src/foo.ts:42').length;
  assert.equal(fooCount, 1, 'verdict-embedded citation not duplicated');
});

test('parseDebateResponse — file:line inside rationale (not Evidence tail) IS captured', () => {
  const raw = '[VERDICT: Cut] FR-5 — see src/x.ts:10 for context — Evidence: src/bar.ts:99';
  const parsed = parseDebateResponse(raw);
  const locations = parsed.evidenceCitations.map(c => c.location);
  assert.ok(locations.includes('src/x.ts:10'), 'rationale-embedded cross-reference must stay visible');
  assert.ok(locations.includes('src/bar.ts:99'));
});

test('parseDebateResponse — literal "Evidence:" in rationale uses LAST occurrence as tail', () => {
  const raw = '[VERDICT: Cut] FR-5 — per Evidence: src/rationale.ts:5 — Evidence: src/tail.ts:99';
  const parsed = parseDebateResponse(raw);
  assert.equal(parsed.perElementVerdicts.length, 1);
  assert.equal(parsed.perElementVerdicts[0].evidence, 'src/tail.ts:99');
  const locations = parsed.evidenceCitations.map(c => c.location);
  assert.ok(locations.includes('src/tail.ts:99'));
  assert.ok(locations.includes('src/rationale.ts:5'), 'rationale-embedded citation must not be suppressed');
});

test('parseDebateResponse — repeated external file:line collapsed by dedup set', () => {
  const raw = `
Mentioned once: src/foo.ts:42
Mentioned again: src/foo.ts:42
`;
  const parsed = parseDebateResponse(raw);
  const fooCount = parsed.evidenceCitations.filter(c => c.location === 'src/foo.ts:42').length;
  assert.equal(fooCount, 1, 'repeated prose citations should dedup by type|location|elementId');
});

test('classifyEvidenceLocation — file:line pattern', () => {
  const c = classifyEvidenceLocation('src/foo.ts:42');
  assert.equal(c.type, 'file:line');
  assert.equal(c.location, 'src/foo.ts:42');
});

test('classifyEvidenceLocation — file:line-range pattern', () => {
  const c = classifyEvidenceLocation('src/foo.ts:42-50');
  assert.equal(c.type, 'file:line');
  assert.equal(c.location, 'src/foo.ts:42-50');
});

test('classifyEvidenceLocation — doc:section pattern', () => {
  const c = classifyEvidenceLocation('doc:§3.5');
  assert.equal(c.type, 'doc:section');
  assert.equal(c.location, '§3.5');
});

test('classifyEvidenceLocation — §-only pattern', () => {
  const c = classifyEvidenceLocation('§3.5');
  assert.equal(c.type, 'doc:section');
  assert.equal(c.location, '3.5');
});

test('classifyEvidenceLocation — unrecognized falls to raw', () => {
  const c = classifyEvidenceLocation('some freeform evidence');
  assert.equal(c.type, 'raw');
});

// --- Agreement detection: current status lines, legacy evidence, and silence without agreement ---

const reached = (raw) => parseDebateResponse(raw).equilibriumReached;

test('parseDebateResponse — current report status "Equilibrium reached" → agreement', () => {
  assert.equal(reached('| Debate Status     | Equilibrium reached — converged |\n| Debate Rounds | 3 rounds |'), true);
  assert.equal(reached('Debate Status: Equilibrium reached — agreed trade-off between A and C'), true);
  assert.equal(reached('**Debate status**: Equilibrium reached (converged on Z)'), true);
});

test('parseDebateResponse — quiet round with the sides still apart → diverged, not agreement', () => {
  const raw = [
    '| Debate Status     | Diverged |',
    '| Stopped Because   | No new objections in round 3 |',
    '| Debate Rounds     | 3 rounds |',
    '## Conclusion',
    'Neither side raised a new objection in round 3; they still disagree on whether latency is relevant.',
  ].join('\n');

  const parsed = parseDebateResponse(raw);

  assert.equal(parsed.equilibriumReached, false);
  assert.equal(parsed.rounds, 3);
});

test('parseDebateResponse — explicit Diverged status wins over an earlier agreement phrase', () => {
  const raw = 'Round 2: equilibrium reached on FR-4.\n\nDebate Status: Diverged: FR-2 still disputed';

  assert.equal(reached(raw), false);
});

test('parseDebateResponse — unfilled template row listing every status → not an agreement', () => {
  assert.equal(reached('| Debate Status | Equilibrium reached — converged / Equilibrium reached — agreed trade-off / Diverged |'), false);
});

test('parseDebateResponse — mentioning an equilibrium without reaching one → not an agreement', () => {
  assert.equal(reached('# Nash Equilibrium Report: T\n\nRound 3 raised no new objections.'), false);
  assert.equal(reached('No Nash equilibrium was reached after 5 rounds.'), false);
  assert.equal(reached('Equilibrium not reached.'), false);
  assert.equal(reached('The debate did not reach equilibrium.'), false);
  assert.equal(reached('Round 3: no new objections. Both sides keep their positions.'), false);
});

test('parseDebateResponse — legacy evidence still reads as it did when it states agreement', () => {
  assert.equal(reached('## Conclusion\nNash equilibrium reached after 3 rounds.'), true);
  assert.equal(reached('Reached Nash equilibrium after 3 rounds.'), true);
  assert.equal(reached('| Equilibrium Type  | Pure Strategy |'), true);
  assert.equal(reached('| Equilibrium Type  | None |'), false);
  assert.equal(reached('| Equilibrium Type  | Pure Strategy / Conditional / Pareto / None |'), false);
});

test('parseDebateResponse — the conclusion states the final status; a per-round status never outranks it', () => {
  const agreedAtTheEnd = 'Round 1 — Debate Status: Diverged\n\n## Conclusion\nDebate Status: Equilibrium reached — converged\nReject FR-2 per round 1.';
  const apartAtTheEnd = 'Round 2 — Debate Status: Equilibrium reached — converged\n\n## Conclusion\nDebate Status: Diverged: FR-4 reopened in round 4.';

  assert.equal(reached(agreedAtTheEnd), true);
  assert.equal(reached(apartAtTheEnd), false);
});

test('parseDebateResponse — only the leading status value counts', () => {
  assert.equal(reached('## Conclusion\nDebate Status: No equilibrium reached after 5 rounds.'), false);
  assert.equal(reached('Debate Status: not yet equilibrium reached'), false);
  assert.equal(reached('- **Debate Status**: Equilibrium reached — converged on X'), true);
});

test('parseDebateResponse — summary table decides when the conclusion carries no status', () => {
  const raw = '| Debate Status | Equilibrium reached — converged |\n\n### Round 2\nDebate Status: Diverged at this point\n\n## Conclusion\nBoth accept: reject FR-2 per round 1.';

  assert.equal(reached(raw), true);
});

test('parseDebateResponse — a status table inside the round transcript does not override the final result', () => {
  const summary = '| Debate Status | Equilibrium reached — converged |\n| Debate Rounds | 3 rounds |\n';
  const conclusion = '## Conclusion\nDebate Status: Equilibrium reached — converged\nReject FR-2 per round 1.\n';
  const transcript = '## Rounds transcript\n### Round 1\n| Debate Status | Diverged |\n### Round 3\n| Debate Status | Equilibrium reached — converged |\n';

  assert.equal(reached(summary + conclusion + transcript), true);
  assert.equal(reached(summary + transcript + conclusion), true);
  assert.equal(reached(summary.replace('Equilibrium reached — converged', 'Diverged') + conclusion + transcript), false, 'a diverged summary still wins');
  assert.equal(reached('### Round 1\n| Debate Status | Equilibrium reached — converged |\n### Round 5\n| Debate Status | Diverged |\n'), false, 'transcript only: the last state is final');
});

test('parseDebateResponse — the explanation after a status is not read as a status', () => {
  assert.equal(reached('Debate Status: Equilibrium reached — converged on X after the sides diverged in round 1'), true);
  assert.equal(reached('| Debate Status | Equilibrium reached — agreed trade-off (Codex had diverged on latency until round 3) |'), true);
});

test('parseDebateResponse — legacy prose: the conclusion outranks the transcript', () => {
  const deniedAtTheEnd = 'Round 2: Both sides reached equilibrium on FR-1.\n\n## Conclusion\nNo Nash equilibrium was reached after 5 rounds.';
  const statedAtTheEnd = 'Round 2: no equilibrium reached yet.\n\n## Conclusion\nNash equilibrium reached after 4 rounds.';
  const mixedConclusion = '## Conclusion\nEquilibrium reached on FR-1. No equilibrium was reached on FR-4.';

  assert.equal(reached(deniedAtTheEnd), false);
  assert.equal(reached(statedAtTheEnd), true);
  assert.equal(reached(mixedConclusion), false, 'one denial in the conclusion outweighs a statement');
});

test('parseDebateResponse — legacy prose: a denial with the negation inside the phrase is still a denial', () => {
  assert.equal(reached('## Conclusion\nBoth sides reached equilibrium on cost. Overall equilibrium was not reached.'), false);
  assert.equal(reached('## Conclusion\nThe debate did not reach equilibrium.'), false);
  assert.equal(reached('## Conclusion\nEquilibrium has never been reached on FR-4, though both sides reached equilibrium on FR-1.'), false);
  assert.equal(reached('## Conclusion\nBoth sides reached equilibrium on cost and on latency.'), true);
});

test('parseDebateResponse — legacy prose: a contracted or cross-clause denial reads the same as the spelled-out one', () => {
  const partial = '## Conclusion\nBoth sides reached equilibrium on cost. ';

  assert.equal(reached(partial + "Overall, we didn't reach equilibrium."), false);
  assert.equal(reached(partial + 'Overall, we did not reach equilibrium.'), false);
  assert.equal(reached(partial + "After 5 rounds, we didn’t reach equilibrium overall."), false);
  assert.equal(reached(partial + 'We did not, despite five rounds, reach equilibrium.'), false);
  assert.equal(reached('## Conclusion\nBoth sides reached equilibrium on cost, but overall equilibrium was not reached.'), false);
});

test('parseDebateResponse — legacy prose is a closed contract: canonical sentence, no negation, or it is not agreement', () => {
  assert.equal(reached('## Conclusion\nNash equilibrium reached after 3 rounds.'), true);
  assert.equal(reached('## Conclusion\nBoth sides reached equilibrium on cost and on latency.'), true);
  assert.equal(reached('Neither side reached equilibrium after 5 rounds.'), false);
  assert.equal(reached('## Conclusion\nAfter long debate the two sides finally reached equilibrium.'), false, 'not the canonical leading form');
});

test('parseDebateResponse — legacy prose: a quiet-debate qualifier is neither a denial nor a statement', () => {
  assert.equal(reached('Both sides reached Nash equilibrium with no remaining objections after 3 rounds.'), true);
  assert.equal(reached('## Conclusion\nWith no new objections, both sides reached Nash equilibrium after 3 rounds.'), true);
  assert.equal(reached('No new objections.'), false, 'silence alone is not agreement');
  assert.equal(reached('With no new objections, neither side reached equilibrium.'), false);
  assert.equal(reached('With no remaining objections, equilibrium was still not reached.'), false);
});

test('parseDebateResponse — legacy report: every Equilibrium Type in scope counts, and None denies', () => {
  assert.equal(reached('Round 2\nEquilibrium Type: Pure Strategy\nRound 5\nEquilibrium Type: None'), false);
  assert.equal(reached('## Conclusion\nEquilibrium Type: Pure\nEquilibrium Type: None'), false);
  assert.equal(reached('| Equilibrium Type | Pure Strategy |\n\n## Conclusion\nAdopt X; reject FR-2 per round 1.'), true, 'the old summary table still counts');
});

test('parseDebateResponse — conclusion keeps its nested subsections; a round\'s own conclusion is not the report\'s', () => {
  assert.equal(reached('## Conclusion\nEquilibrium reached.\n\n### Unresolved objections\nNeither side reached equilibrium.'), false);
  assert.equal(reached('## Conclusion\nEquilibrium reached.\n\n---\n\n### Unresolved objections\nNeither side reached equilibrium.'), false, 'a thematic break does not end the section');
  assert.equal(reached('### Round 1\n#### Conclusion\nDebate Status: Equilibrium reached — converged\n\n## Conclusion\nDebate Status: Diverged'), false);
});

test('parseDebateResponse — legacy report: the conclusion outranks a type or a statement in the transcript', () => {
  assert.equal(reached('### Round 1\nEquilibrium Type: Pure\n\n## Conclusion\nWe never reached equilibrium.'), false);
  assert.equal(reached('Round 2: no equilibrium reached yet.\nRound 4: equilibrium reached.'), false, 'no conclusion: a denial anywhere wins');
  assert.equal(reached('Round 2: no equilibrium reached yet.\n\n## Conclusion\nEquilibrium reached in round 4.'), true);
});

test('parseDebateResponse — a round conclusion in the transcript never replaces the final verdict', () => {
  const verdict = '## Final Verdict\nDebate Status: Diverged\n\n';
  const transcript = '## Rounds transcript\n### Round 1\n#### Conclusion\nDebate Status: Equilibrium reached — converged\n';

  assert.equal(reached(verdict + transcript), false);
  assert.equal(reached(transcript + '\n' + verdict), false);
  assert.equal(parseDebateResponse(verdict + transcript).conclusion, 'Debate Status: Diverged');
  assert.equal(reached((verdict + transcript).replace('Diverged', 'Equilibrium reached — converged').replace(/(#### Conclusion\nDebate Status: )[^\n]*/, '$1Diverged')), true);
});

test('parseDebateResponse — a transcript nested under the conclusion is still per-round', () => {
  const nested = (final) => `## Conclusion\nDebate Status: ${final}\n\n### Rounds transcript\n#### Round 1\nDebate Status: Diverged\n#### Round 3\nDebate Status: Equilibrium reached — converged\n`;

  assert.equal(reached(nested('Equilibrium reached — converged')), true);
  assert.equal(reached(nested('Diverged')), false);
  assert.equal(reached('## Conclusion\nEquilibrium reached in round 3.\n\n### Round 1\nNo equilibrium yet.'), true, 'legacy prose too');
});

test('parseDebateResponse — the same round before or after the conclusion → the same verdict', () => {
  const round = '### Round 1\n#### Conclusion\nDebate Status: Diverged\n\n';
  const agreed = '## Conclusion\nDebate Status: Equilibrium reached — converged\n\n';

  assert.equal(reached(round + agreed), true);
  assert.equal(reached(agreed + round), true);
});

test('parseDebateResponse — CRLF and LF give the same verdict and the same conclusion', () => {
  const lf = '## Conclusion\nDebate Status: Diverged\n\n## Rounds transcript\nDebate Status: Equilibrium reached\n';
  const crlf = lf.replace(/\n/g, '\r\n');

  assert.equal(reached(lf), false);
  assert.equal(reached(crlf), false);
  assert.equal(reached(crlf.replace('Diverged', 'Equilibrium reached')), true);
  assert.equal(parseDebateResponse(crlf).conclusion, 'Debate Status: Diverged');
});

test('parseDebateResponse — a status mentioned inside a sentence is narrative, not a field', () => {
  assert.equal(reached('## Conclusion\nDebate Status: Equilibrium reached — converged\nRound 1 recorded Debate Status: Diverged before the measurement arrived.'), true);
  assert.equal(reached('## Conclusion\nDebate Status: Diverged\nRound 1 recorded Debate Status: Equilibrium reached on cost.'), false);
});

test('parseDebateResponse — no final field: a status mentioned in a sentence is not a per-round record', () => {
  assert.equal(reached('## Conclusion\nThe preliminary report recorded Debate Status: Equilibrium reached on cost. The sides still disagree on scope.'), false);
  assert.equal(reached('## Conclusion\nThe example uses Debate Status: Equilibrium reached.'), false);
  assert.equal(reached('Round 1 — Debate Status: Diverged\nRound 3 — Debate Status: Equilibrium reached — converged'), true, 'the supported per-round form');
});

test('parseDebateResponse — a transcript status never overrides a conclusion that denies agreement', () => {
  assert.equal(reached('## Round 3\nDebate Status: Equilibrium reached\n\n## Conclusion\nNeither side reached equilibrium.'), false);
  assert.equal(reached('## Conclusion\nEquilibrium reached. Was equilibrium reached?'), false, 'a question is a denial');
});

test('parseDebateResponse — a rank-1 title naming a transcript is the report, not a round', () => {
  assert.equal(reached('# Debate transcript and report\n\n## Conclusion\nDebate Status: Diverged\n\nDebate Status: Equilibrium reached'), false);
});

test('parseDebateResponse — two report-level conclusions that disagree → not an agreement', () => {
  assert.equal(reached('## Conclusion\nDebate Status: Equilibrium reached — converged\n\n## Final Verdict\nDebate Status: Diverged'), false);
});

test('parseDebateResponse — a report title that starts with "Final" is not the conclusion', () => {
  const raw = '## Final Report\n\n| Debate Status | Equilibrium reached — converged |\n\n## Conclusion\nDebate Status: Diverged';

  const parsed = parseDebateResponse(raw);

  assert.equal(parsed.equilibriumReached, false);
  assert.equal(parsed.conclusion, 'Debate Status: Diverged', 'the same section feeds the returned conclusion');
});

test('parseDebateResponse — summary table and conclusion disagree → not an agreement, whichever says Diverged', () => {
  assert.equal(reached('| Debate Status | Diverged |\n\n## Conclusion\nDebate Status: Equilibrium reached — converged'), false);
  assert.equal(reached('| Debate Status | Equilibrium reached — converged |\n\n## Conclusion\nDebate Status: Diverged'), false);
});

test('parseDebateResponse — legacy prose: a question about agreement is not a statement of it', () => {
  assert.equal(reached('Was equilibrium reached in round 3? No.'), false);
  assert.equal(reached('Has the debate reached equilibrium? Not yet.'), false);
  assert.equal(reached('Equilibrium reached in round 3. Both accept the trade-off.'), true);
});

test('parseDebateResponse — a conclusion that contradicts itself → not an agreement', () => {
  assert.equal(reached('## Conclusion\nDebate Status: Diverged\n\n| Debate Status | Equilibrium reached — converged |'), false);
});

test('parseDebateResponse — legacy prose: negation is judged inside the agreement clause', () => {
  assert.equal(reached('No Nash equilibrium was reached after 5 rounds.'), false);
  assert.equal(reached('Equilibrium reached? No.'), false);
  assert.equal(reached('Equilibrium reached: no'), false);
  assert.equal(reached('If equilibrium reached, stop.'), false);
});

test('parseDebateResponse — empty report → not an agreement', () => {
  assert.equal(reached(''), false);
});

// --- The agreement requirement, end to end: parsed report → deterministic gate check ---

const { runDeterministicChecks } = require('../../../scripts/skills/necessity-audit/consolidate');

test('deep depth — silence without agreement fails the agreement requirement', () => {
  const quietButApart = [
    'threadId: 0123456789abcdef0123456789abcdef',
    '| Debate Status     | Diverged |',
    '| Stopped Because   | No new objections in round 3 |',
    '| Debate Rounds     | 3 rounds |',
    '## Conclusion',
    'Round 3 raised no new objection. Reject FR-2 per round 1; the sides still disagree on FR-4.',
  ].join('\n');

  const checks = runDeterministicChecks(parseDebateResponse(quietButApart), [], 'deep');

  assert.equal(checks.equilibrium_required_met, false);
  assert.equal(checks.rounds_ok, true, 'the debate itself ran; only the agreement requirement fails');
});

test('deep depth — the same quiet round ending in agreement meets the requirement', () => {
  const quietAndAgreed = [
    'threadId: 0123456789abcdef0123456789abcdef',
    '| Debate Status     | Equilibrium reached — converged |',
    '| Stopped Because   | No new objections in round 3 |',
    '| Debate Rounds     | 3 rounds |',
    '## Conclusion',
    'Round 3 raised no new objection. Both accept: reject FR-2 per round 1, review FR-4.',
  ].join('\n');

  const checks = runDeterministicChecks(parseDebateResponse(quietAndAgreed), [], 'deep');

  assert.equal(checks.equilibrium_required_met, true);
});

test('normal depth — a diverged debate is still accepted, as before', () => {
  const checks = runDeterministicChecks(parseDebateResponse('Debate Status: Diverged\n3 rounds'), [], 'normal');

  assert.equal(checks.equilibrium_required_met, true);
});
