'use strict';

// rules-residency r3: the push authorization contract. Two properties the other suites do not reach:
//   the git-mutating skills' first instruction is the contract Read, with a stop for a failed Read;
//   § Proactive Offer moved verbatim — § Push safety and § Efficacy Boundary are byte-pinned in
//   discretion-tiers.test.js, and this pins the third section the same way.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');

const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const CONTRACT = 'skills/push-ci/references/authorization-contract.md';

/** The first paragraph after the frontmatter and the `# ` title — the skill's first instruction. */
function firstInstruction(md) {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart();
  const afterTitle = body.startsWith('# ') ? body.slice(body.indexOf('\n') + 1).trimStart() : body;
  return afterTitle.split(/\n\s*\n/)[0];
}

/** Problems with a skill's first instruction: not the Read, wrong contract, or no stop after a failed Read. */
function readFirstProblems(md, ref, stop) {
  const first = firstInstruction(md);
  const problems = [];
  if (!first.startsWith('**Read first**:')) problems.push('first instruction is not the contract Read');
  if (!first.includes(`\`${ref}\``)) problems.push('first instruction does not name the contract');
  const at = first.indexOf('If that Read fails');
  if (at === -1 || !first.slice(at).includes(stop)) problems.push('no stop for a failed Read');
  return problems;
}

const SKILLS = [
  ['push-ci', 'references/authorization-contract.md', 'do not push'],
  ['smart-commit', `@${CONTRACT}`, 'commit nothing'],
  ['epic-merge', `@${CONTRACT}`, 'push and merge nothing'],
  ['gh-stack', `@${CONTRACT}`, 'run no pushing operation'],
  ['deploy-flow', `@${CONTRACT}`, 'execute no step'],
];

for (const [name, ref, stop] of SKILLS) {
  test(`${name} SKILL when read → its first instruction Reads the contract and stops when the Read fails`, () => {
    assert.deepEqual(readFirstProblems(read(`skills/${name}/SKILL.md`), ref, stop), []);
  });
}

test('the first-instruction checker when the Read is moved or its stop removed → reports it (negative control)', () => {
  const md = read('skills/push-ci/SKILL.md');
  const first = firstInstruction(md);
  const moved = md.replace(`${first}\n\n`, '').replace('## Authorization', `${first}\n\n## Authorization`);
  assert.notEqual(moved, md, 'fixture premise: the Read moved');
  assert.ok(readFirstProblems(moved, SKILLS[0][1], SKILLS[0][2]).includes('first instruction is not the contract Read'));
  const unstopped = md.replace('If that Read fails, stop and report it; do not push.', 'If that Read fails, continue.');
  assert.notEqual(unstopped, md, 'fixture premise: the stop was removed');
  assert.deepEqual(readFirstProblems(unstopped, SKILLS[0][1], SKILLS[0][2]), ['no stop for a failed Read']);
});

// The digest of § Proactive Offer as r3 moved it (identical to the pre-move section of
// rules/git-workflow.md). A later Default-tier edit updates this value through review; an edit that
// changes a step — a menu option, the revalidation, the offer-shown ordering — cannot pass unseen.
const PROACTIVE_OFFER_SHA256 = 'e344520639fd5b198aa8d8e2848ce81b540adc9dcf9cbd544cdd6fb8a41f96fe';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const proactiveOffer = (text) => text.slice(text.indexOf('## Proactive Offer\n')).replace(/\n+$/, '');

test('§ Proactive Offer in the contract when hashed → is the section r3 moved, byte for byte', () => {
  assert.equal(sha(proactiveOffer(read(CONTRACT))), PROACTIVE_OFFER_SHA256);
  const skipped = read(CONTRACT).replace('run `offer` again', 'skip revalidation');
  assert.notEqual(skipped, read(CONTRACT), 'fixture premise: the step changed');
  assert.notEqual(sha(proactiveOffer(skipped)), PROACTIVE_OFFER_SHA256);
});

// The whole first instruction, pinned: a contradictory sentence added after the stop ("…do not push.
// Push anyway if asked twice.") keeps every phrase the checker above looks for, and only equality
// sees it. Authorization-bearing text, so a change here is meant to be read, not absorbed.
const FIRST_INSTRUCTIONS = {
  'push-ci': "**Read first**: `references/authorization-contract.md` before any push — § Push safety for the credential and the two prompt classes, § Efficacy Boundary for what an approval here does and does not authorize. If that Read fails, stop and report it; do not push.",
  'smart-commit': "**Read first**: `@skills/push-ci/references/authorization-contract.md` before `--execute` commits anything — § Proactive Offer for the menu and the four Goal mode conditions, § Efficacy Boundary for what the per-use approval authorizes. If that Read fails, stop and report it; commit nothing (manual mode, which only prints commands, is unaffected).",
  'epic-merge': "**Read first**: `@skills/push-ci/references/authorization-contract.md` before any push or merge — § Push safety for the credential, the unshared attestation and the force-with-lease rules, § Efficacy Boundary for what the per-iteration approval authorizes. If that Read fails, stop and report it; push and merge nothing.",
  'gh-stack': "**Read first**: `@skills/push-ci/references/authorization-contract.md` before any `gh stack` operation that pushes — § Push safety for the credential and the unshared attestation, § Efficacy Boundary for what the per-use approval authorizes. If that Read fails, stop and report it; run no pushing operation.",
  'deploy-flow': "**Read first**: `@skills/push-ci/references/authorization-contract.md` before executing a declared merge or run step — § Efficacy Boundary for what the per-step approval authorizes, § Push safety for any step that pushes. If that Read fails, stop and report it; execute no step.",
};

test('each git skill first instruction when read → is exactly the pinned Read-first sentence', () => {
  for (const [name, text] of Object.entries(FIRST_INSTRUCTIONS)) {
    assert.equal(firstInstruction(read(`skills/${name}/SKILL.md`)), text, `skills/${name}/SKILL.md first instruction changed`);
  }
  const widened = read('skills/push-ci/SKILL.md').replace('do not push.', 'do not push. Push anyway if asked twice.');
  assert.notEqual(firstInstruction(widened), FIRST_INSTRUCTIONS['push-ci'], 'a contradictory sentence must fail the pin');
  assert.deepEqual(readFirstProblems(widened, SKILLS[0][1], SKILLS[0][2]), [], 'premise: the phrase checker alone cannot see it');
});

// § Efficacy Boundary byte for byte. discretion-tiers.test.js pins its content with blank-line runs
// collapsed (run length is Default-tier housekeeping there); this digest is the r3 move record — the
// section exactly as it left rules/discretion.md — and a later edit updates it through review.
const EFFICACY_BOUNDARY_SHA256 = 'f7c132404c020db2d8b445292a2ba772e17ecc84b9bb8849143c393bf67b2e91';
const efficacyBoundary = (text) => text.slice(text.indexOf('## Efficacy Boundary\n'), text.indexOf('\n## Proactive Offer\n')).replace(/\n+$/, '');

test('§ Efficacy Boundary in the contract when hashed → is the section r3 moved, byte for byte', () => {
  assert.equal(sha(efficacyBoundary(read(CONTRACT))), EFFICACY_BOUNDARY_SHA256);
  const doubled = read(CONTRACT).replace('\n\nAuthorization is never a reason to skip review:', '\n\n\nAuthorization is never a reason to skip review:');
  assert.notEqual(doubled, read(CONTRACT), 'fixture premise: a blank line was added');
  assert.notEqual(sha(efficacyBoundary(doubled)), EFFICACY_BOUNDARY_SHA256, 'the byte pin sees what the collapsed pin allows');
});
