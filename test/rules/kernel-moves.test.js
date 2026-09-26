'use strict';
// rules-residency task 3 (intent INV-003): content that leaves residency has exactly one canonical
// home — moved, never copied, never silently dropped. This is the inventory of every live statement
// task 3 moved out of a resident file, clause by clause where a paragraph was split: each must be
// found in its destination and no longer in its source. Text pruned as dead or duplicate is not listed here; the request ticket records why it
// was dead. Statements moved by r1–r4 are pinned by their own tests (scope-discipline,
// testing-docs-contracts, push-authorization-contract, override-contract).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const read = (p) => (existsSync(resolve(root, p)) ? readFileSync(resolve(root, p), 'utf8') : '');
const flat = (s) => s.replace(/\s+/g, ' ');

const REVIEW_COMMON = 'skills/codex-code-review/references/review-common.md';
const LOOP_DIAGNOSTICS = 'skills/codex-code-review/references/loop-diagnostics.md';
const SCOPE_CONTRACT = 'skills/codex-code-review/references/scope-contract.md';
const HOOK_SPEC = 'docs/features/hook-lightweighting/2-tech-spec.md';

// [source, destination, statement] — matched on whitespace-flattened text, so re-wrapping is free.
const MOVES = [
  ['rules/auto-loop.md', REVIEW_COMMON, /`timeout` may be selected \*\*only after an adapter exit 1 has independently occurred\*\*/],
  ['rules/auto-loop.md', REVIEW_COMMON, /A host-level event alone does not qualify/],
  ['rules/auto-loop.md', REVIEW_COMMON, /The `reason=` label is a separate axis from the trigger, but it never substitutes for it/],
  ['rules/auto-loop.md', REVIEW_COMMON, /a foreground ceiling leaves a still-running process \(unknown completion\) and a killed adapter terminates by signal, not exit 1; both keep the gate open and dispatch nothing/],
  ['rules/auto-loop.md', REVIEW_COMMON, /\(policy change, review-loop-resilience 2026-08-23 — it was `⚠️ Need Human`\)/],
  ['rules/auto-loop.md', REVIEW_COMMON, /The change's first dispatch probes Codex/],
  ['rules/auto-loop.md', REVIEW_COMMON, /re-reviews never re-probe, the next change probes afresh/],
  ['rules/auto-loop.md', REVIEW_COMMON, /without Codex its automated dismiss closes/],
  ['rules/auto-loop.md', REVIEW_COMMON, /a depth review \(`\/codex-review-branch`\) re-finds what is still true/],
  ['rules/auto-loop.md', LOOP_DIAGNOSTICS, /absence is not a signal/],
  ['rules/auto-loop.md', LOOP_DIAGNOSTICS, /a round you cannot compare per-finding holds it where it was/],
  ['rules/auto-loop.md', LOOP_DIAGNOSTICS, /`DOC_TOO_LONG`/],
  ['rules/auto-loop.md', LOOP_DIAGNOSTICS, /`UNVERIFIED_CLAIM`/],
  ['rules/auto-loop.md', LOOP_DIAGNOSTICS, /`TIER_MISMATCH`/],
  ['rules/auto-loop.md', LOOP_DIAGNOSTICS, /`REFERENCE_DRIFT`/],
  ['rules/auto-loop.md', LOOP_DIAGNOSTICS, /`REQUIREMENT_AMBIGUITY`/],
  ['rules/auto-loop.md', LOOP_DIAGNOSTICS, /`SCATTER`/],
  ['rules/auto-loop.md', HOOK_SPEC, /`fail` increments `rounds`, `pass` resets it/],
  ['rules/auto-loop.md', HOOK_SPEC, /committing the noted tree does not/],
  ['rules/auto-loop.md', HOOK_SPEC, /passed ⇔ `noted && digest_match && verdict=="pass"`/],
  ['rules/auto-loop.md', HOOK_SPEC, /the degraded path \(checker unavailable\) is the plain git read/],
  ['rules/auto-loop.md', HOOK_SPEC, /~\/\.cache\/sd0x-dev-flow\/state\//],
  ['rules/fix-all-issues.md', SCOPE_CONTRACT, /Fix the root cause, not the symptom/],
  ['rules/fix-all-issues.md', SCOPE_CONTRACT, /This rule has never meant "every remark from a reviewer must be actioned before you may stop"/],
  ['CLAUDE.template.md', 'docs/architecture.md', /`\$\{CLAUDE_PLUGIN_ROOT\}` unavailable in command `\.md`/],
  ['CLAUDE.template.md', 'docs/architecture.md', /wrap all `!` checks in `bash -c '\.\.\.'`/],
  ['rules/context-management.md', 'skills/orchestrate/SKILL.md', /`baseline_sha256` 只活在主 session 的 context/],
];

/** Moves whose statement is missing from its destination, or still present in its source. */
function brokenMoves(moves, readFile) {
  const broken = [];
  for (const [source, destination, statement] of moves) {
    if (!statement.test(flat(readFile(destination)))) broken.push(`${destination} lacks ${statement}`);
    if (statement.test(flat(readFile(source)))) broken.push(`${source} still carries ${statement}`);
  }
  return broken;
}

test('every statement task 3 moved out of residency → in its one destination, gone from its source', () => {
  assert.ok(MOVES.length >= 27, 'the move inventory must not shrink');
  assert.deepEqual(brokenMoves(MOVES, read), []);
});

test('a move reverted or dropped → named by the same reader (negative control)', () => {
  const [source, destination] = MOVES[0];
  const copiedBack = (p) => (p === source ? `${read(p)}\n\`timeout\` may be selected **only after an adapter exit 1 has independently occurred**\n` : read(p));
  assert.deepEqual(brokenMoves([MOVES[0]], copiedBack), [`${source} still carries ${MOVES[0][2]}`]);
  const dropped = (p) => (p === destination ? read(p).replace(/A host-level event alone does not qualify/, 'A host event qualifies') : read(p));
  assert.deepEqual(brokenMoves([MOVES[1]], dropped), [`${destination} lacks ${MOVES[1][2]}`]);
});
