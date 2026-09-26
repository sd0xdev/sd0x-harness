'use strict';
// rules-residency tasks 8b–8c: the canary closed by maintainer decision 2026-09-26 — no 20-change
// baseline, no candidate cohort, no release gate. What survives is the record: the changes the
// task 8a staging duty logged, imported once into docs/features/rules-residency/canary-log.jsonl
// with the nine-field schema of tech spec § 6. Corrections and cohort labels made at import are
// in requests/2026-09-26-canary-closeout-8b-8c.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');

const root = resolve(__dirname, '../..');
const LOG = 'docs/features/rules-residency/canary-log.jsonl';
const FIELDS = ['date', 'change_id', 'review_rounds', 'scope_expansions', 'deviations',
  'contracts_activated', 'resident_chars', 'resident_tokens', 'hard_incidents'];

const isCount = (v) => Number.isSafeInteger(v) && v >= 0;

/** Lines of a log text that are not exactly one well-formed record, plus repeated ids. */
function logProblems(text) {
  const problems = [];
  if (!text.endsWith('\n')) problems.push('last record has no trailing newline');
  const ids = new Set();
  text.split('\n').slice(0, -1).forEach((line, i) => {
    let r;
    try { r = JSON.parse(line); } catch { problems.push(`line ${i + 1}: not JSON`); return; }
    const keys = r && typeof r === 'object' && !Array.isArray(r) ? Object.keys(r) : [];
    if (keys.join() !== FIELDS.join()) { problems.push(`line ${i + 1}: fields ${keys.join(',')}`); return; }
    const ok = typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date))
      && typeof r.change_id === 'string' && r.change_id.trim()
      && ['review_rounds', 'scope_expansions', 'deviations', 'resident_chars'].every((k) => isCount(r[k]))
      && (r.resident_tokens === null || isCount(r.resident_tokens))
      && Array.isArray(r.contracts_activated) && r.contracts_activated.every((c) => typeof c === 'string')
      && Array.isArray(r.hard_incidents) && r.hard_incidents.every((c) => typeof c === 'string');
    if (!ok) problems.push(`line ${i + 1}: a field has the wrong type`);
    if (ids.has(r.change_id)) problems.push(`line ${i + 1}: repeated change id ${r.change_id}`);
    ids.add(r.change_id);
  });
  return problems;
}

const text = readFileSync(resolve(root, LOG), 'utf8');
const records = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));

// The import is a frozen record: [change_id, date, review_rounds, scope_expansions, deviations,
// contracts activated, resident_chars], in log order, as the closeout ticket lists them. The three
// corrected counts are the ones that differ from the staging log; everything else is as staged.
const EXPECTED = [
  ['f45bb5f-r4-override-contract', '2026-09-25T09:11:05.105Z', 10, 0, 4, 3, 103212],
  ['36605a1-r2-testing-docs-contracts', '2026-09-25T10:09:44.478Z', 10, 0, 0, 3, 98373],
  ['task5-procedure-hint', '2026-09-25T10:30:25.328Z', 4, 0, 0, 3, 98373],
  ['fr6-contract-refusal-probe', '2026-09-25T11:06:15.443Z', 6, 0, 0, 3, 98817],
  ['6532cfe-r3-push-authorization-contract', '2026-09-25T13:07:41.384Z', 11, 0, 2, 4, 84629],
  ['228f2e5-resident-kernel-tasks-3-4-6', '2026-09-25T16:56:55.498Z', 10, 0, 1, 7, 57733],
];
// The whole file, so a change to a field EXPECTED does not list (a contract path) is caught too.
const LOG_SHA256 = '27e58788432413549091403a753d6343f04e17e964f7433e3a21cd14871e0cc4';

const row = (r) => [r.change_id, r.date, r.review_rounds, r.scope_expansions, r.deviations,
  r.contracts_activated.length, r.resident_chars];
/** Imported records that differ from the frozen expectation, by position. */
const importDrift = (recs) => {
  const out = [];
  for (let i = 0; i < Math.max(recs.length, EXPECTED.length); i++) {
    if (JSON.stringify(recs[i] ? row(recs[i]) : null) !== JSON.stringify(EXPECTED[i] || null)) out.push(i + 1);
  }
  return out;
};
/** Change ids whose record carries a hard incident — the closing read. */
const withIncidents = (recs) => recs.filter((r) => r.hard_incidents.length).map((r) => r.change_id);

test('the imported canary log when read → every line is one nine-field record with a unique id', () => {
  assert.deepEqual(logProblems(text), []);
  assert.equal(records.length, 6, 'the six changes the staging duty logged before it was removed');
});

test('the imported canary log when read → every record matches the frozen import, corrections included', () => {
  assert.deepEqual(importDrift(records), []);
  const digest = (t) => createHash('sha256').update(t).digest('hex');
  assert.equal(digest(text), LOG_SHA256, 'the imported log is a frozen record');
  // A field EXPECTED does not list — a contract path — still moves the digest.
  assert.notEqual(digest(text.replace('references/codex-transport.md', 'references/codex-transport.mdx')), LOG_SHA256);
  // Negative control through the same reader: a substituted record and a changed measurement.
  const substituted = [...records.slice(0, 1), { ...records[1], change_id: 'another-change' }, ...records.slice(2)];
  assert.deepEqual(importDrift(substituted), [2]);
  assert.deepEqual(importDrift(records.map((r, i) => (i === 3 ? { ...r, resident_chars: r.resident_chars + 1 } : r))), [4]);
});

test('the closing read → no hard incident in any imported record', () => {
  assert.deepEqual(withIncidents(records), []);
  assert.deepEqual(withIncidents([...records, { ...records[0], change_id: 'x', hard_incidents: ['anchor violation'] }]), ['x']);
});

// The canary no longer gates 5.0.0 (maintainer decision 2026-09-26). The current spec must not say
// it does, and the requirements record keeps the old signal only as struck, superseded text.
const SPEC = 'docs/features/rules-residency/2-tech-spec.md';
const REQ = 'docs/features/rules-residency/1-requirements.md';
/** Where a current document still ties the release to a canary read. The tech spec is current
 *  authority, so it must state the withdrawal and no passage of it may state the gate. Records keep
 *  their history: the requirements doc is checked only for its FR-10 signal being marked superseded,
 *  so the § 9 decision that says the gate once "reads ship" stands as ordinary data. */
function releaseGateResidue(spec, req) {
  const out = [];
  const flat = spec.replace(/\s+/g, ' ');
  if (!flat.includes('no candidate cohort runs, and the canary does not gate 5.0.0')) out.push(`${SPEC} does not state the withdrawn gate`);
  if (/reads ship|the canary gates 5\.0\.0/.test(flat)) out.push(`${SPEC} still ties the release to a canary read`);
  const signal = req.split('\n').find((l) => l.startsWith('- FR-10/NFR-1:')) || '';
  if (!/^- FR-10\/NFR-1: ~~.*~~ Superseded 2026-09-26/.test(signal)) out.push(`${REQ} FR-10 acceptance signal is not marked superseded`);
  return out;
}

test('the withdrawn release gate → no current document ties 5.0.0 to a canary read', () => {
  const spec = readFileSync(resolve(root, SPEC), 'utf8');
  const req = readFileSync(resolve(root, REQ), 'utf8');
  assert.deepEqual(releaseGateResidue(spec, req), []);
  // Positive control: the record's own history uses the same words and passes.
  assert.match(req, /reads ship/, 'fixture premise: the requirements record keeps the 2026-09-25 decision text');
  // Negative control: the superseded wording restored in either document is named.
  const oldSignal = '- FR-10/NFR-1: the tech spec\'s canary comparison shows no hard incident and soft metrics within margin, and 5.0.0 is tagged only after it reads ship.';
  const restored = req.replace(/^- FR-10\/NFR-1:.*$/m, oldSignal);
  assert.deepEqual(releaseGateResidue(spec, restored), [`${REQ} FR-10 acceptance signal is not marked superseded`]);
  assert.deepEqual(releaseGateResidue(`${spec}\n5.0.0 is released once the candidate cohort reads ship.\n`, req), [`${SPEC} still ties the release to a canary read`]);
  // The reversal of the actual closeout sentence fails both halves.
  const reversed = spec.replace('the canary does not gate 5.0.0', 'the canary gates 5.0.0');
  assert.notEqual(reversed, spec, 'fixture premise: the closeout sentence is on one line');
  assert.deepEqual(releaseGateResidue(reversed, req), [`${SPEC} does not state the withdrawn gate`, `${SPEC} still ties the release to a canary read`]);
});

test('the log check when a record is malformed, repeated or unterminated → names it (negative control)', () => {
  const first = text.split('\n')[0];
  assert.deepEqual(logProblems(`${first}\n${first}\n`), [`line 2: repeated change id ${records[0].change_id}`]);
  assert.deepEqual(logProblems(first), ['last record has no trailing newline']);
  const extra = JSON.stringify({ ...records[0], note: 'x' });
  assert.match(logProblems(`${extra}\n`)[0], /^line 1: fields /);
  const badType = JSON.stringify({ ...records[0], review_rounds: -1 });
  assert.deepEqual(logProblems(`${badType}\n`), ['line 1: a field has the wrong type']);
});

test('the staging duty when task 8c closed it → its tool and its resident line are gone', () => {
  assert.equal(existsSync(resolve(root, 'scripts/dev/canary-stage.js')), false);
  assert.doesNotMatch(readFileSync(resolve(root, 'CLAUDE.md'), 'utf8'), /canary-stage|canary-staging/);
});

/** Places the 2026-09-26 closeout decision is not recorded: spec § 5 rows and § 6, requirements § 9 and FR-10. */
function decisionGaps(spec, req) {
  const gaps = [];
  const row = (id) => spec.split('\n').find((l) => l.startsWith(`| ${id} |`)) || '';
  if (!/merging the stack is the pull request's step/.test(row('8b'))) gaps.push('§ 5 row 8b');
  if (!/No candidate cohort and no decision table: maintainer decision 2026-09-26/.test(row('8c'))) gaps.push('§ 5 row 8c');
  if (!/\| S \| 8c \|$/.test(row('9'))) gaps.push('§ 5 row 9 dependency');
  if (!spec.includes('- **Canary — closed by maintainer decision 2026-09-26.**')) gaps.push('§ 6 closeout');
  if (!/^- \[x\] \*\*Canary closeout\*\* — .*Decided 2026-09-26: yes\./m.test(req)) gaps.push('requirements § 9');
  if (!/^\| FR-10 \| ~~.*~~ Withdrawn 2026-09-26 \(§ 9\) \| ~~Must~~ Withdrawn \|/m.test(req)) gaps.push('requirements FR-10');
  return gaps;
}

test('the 2026-09-26 closeout decision → recorded in spec § 5 and § 6, requirements § 9 and FR-10', () => {
  const spec = readFileSync(resolve(root, SPEC), 'utf8');
  const req = readFileSync(resolve(root, REQ), 'utf8');
  assert.deepEqual(decisionGaps(spec, req), []);
  // Negative control through the same reader: the pre-decision § 5 dependency and FR-10 priority.
  const oldSpec = spec.replace(/\| S \| 8c \|$/m, '| S | 8c reads ship |');
  const oldReq = req.replace(/^\| FR-10 \|.*$/m, '| FR-10 | Behaviour after the change is not worse than before | Must | canary is a release gate |');
  assert.deepEqual(decisionGaps(oldSpec, oldReq), ['§ 5 row 9 dependency', 'requirements FR-10']);
});
