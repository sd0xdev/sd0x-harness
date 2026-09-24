'use strict';
// git-autonomy FR-17 (tech spec § 3.5, § 6 "Goal-mode commit"): the goal credential lives in rule
// text the model reads, so the contract is that text. Each clause below is one § 3.5 condition or
// fallback; the checker returns the clauses a text is missing, so the real rule must yield none and
// deleting any one clause must yield exactly that one (the negative control runs the same checker).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const RULE = readFileSync(resolve(__dirname, '../../rules/git-workflow.md'), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

const CLAUSES = {
  'all four conditions must hold': 'when all four hold, each re-checked before every commit',
  'origin after a compaction comes from the transcript': 'After a compaction, confirm the origin from the session transcript — their `/goal` entry or their approval of the proposal — never the summary',
  'goal replaces only the per-use question': 'may run `/smart-commit --execute` without the per-use question',
  'only a user-set or user-approved goal counts': 'their own `/goal <condition>` message, or a goal proposal they approved',
  'a model-set goal never counts': 'A goal the model set without the user\'s approval never counts',
  'the latest goal record decides': 'the **latest** goal record in the current conversation',
  'the compaction record is evidence': 'a goal-status record (re-injected after a compaction',
  'every ended state falls back': 'reports the goal met, impossible, cleared (`/goal clear` or an error) or replaced',
  'compaction alone does not end a goal': 'Compaction alone does not end a goal',
  'no goal record reads as no goal': 'no goal record at all reads as no goal',
  'gates and branch via goal-commit': '`review-state.js goal-commit --format=json` returns `ok: true`',
  'protected branch: recommend a feature branch first': 'recommend creating a feature branch; only if the user declines, ask whether commits on this branch may proceed for this goal',
  'an allowance covers the rest of the goal': 'A yes covers the rest of that goal on that branch',
  'never --ai-co-author': '`--ai-co-author` is never passed',
  'the record hashes the goal': '`[GOAL_COMMIT] goal=<first 12 hex of git hash-object of the condition>',
  'never the goal text': 'never the goal text',
  'push and deploy keep their approvals': 'Pushes, `/deploy-flow` and every other operation keep their own approvals',
  'commits only': 'the one exception is Goal mode, below, and it covers commits only',
  '## Goal Commit off narrows': '| `## Goal Commit` | Setting — `on` (default) · `off`, read by `review-state.js goal-commit`',
};

function missingClauses(text) {
  const t = flat(text);
  return Object.entries(CLAUSES).filter(([, c]) => !t.includes(flat(c))).map(([k]) => k);
}

test('rules/git-workflow.md Goal mode when read → carries every § 3.5 condition and fallback', () => {
  assert.deepEqual(missingClauses(RULE), []);
});

test('Goal mode clause deleted → the checker names exactly that clause (negative control, each clause)', () => {
  for (const [name, clause] of Object.entries(CLAUSES)) {
    const at = flat(RULE).indexOf(flat(clause));
    const mutated = flat(RULE).slice(0, at) + flat(RULE).slice(at + flat(clause).length);
    assert.deepEqual(missingClauses(mutated), [name], `deleting "${name}" must be detected`);
  }
});

test('Goal mode condition 2 when compaction is mentioned → never reads a compaction alone as no goal', () => {
  assert.doesNotMatch(flat(RULE), /Evidence lost to `\/clear` or compaction reads as no goal/);
});
