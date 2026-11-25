'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const flat = (p) => readFileSync(resolve(root, p), 'utf8').replace(/\s+/g, ' ');
const review = flat('skills/codex-code-review/SKILL.md');
const push = flat('skills/push-ci/SKILL.md');

test('the code review when it settles its request → runs the reader from the plugin root, before dispatch, for each changed tree', () => {
  const at = review.indexOf('node "${CLAUDE_PLUGIN_ROOT}/scripts/review-scope.js" asked');
  assert.ok(at > review.indexOf('### Step 1: Collect Change Metadata') && at < review.indexOf('### Step 1.1: Resolve the tier'));
  assert.match(review, /again before each re-dispatch whose tree changed/);
  assert.match(review, /when the tree holds a changed code path outside that list, skip it and its sentences for the round/);
  assert.match(review, /Branch variant: add --base <MERGE_BASE>/);
});

test('the request line → stays in the conversation and never reaches the reviewer or the gate', () => {
  assert.match(review, /nothing stores it and it never enters a reviewer prompt/);
  assert.match(review, /A run that fails is skipped without comment and changes nothing about the review/);
  assert.match(review, /\*asked about\* is not \*read\*, \*outside\* is not \*unreviewed\*, and neither moves the gate/);
  for (const p of ['codex-prompt-fast.md', 'codex-prompt-full.md', 'codex-prompt-branch.md']) {
    assert.doesNotMatch(flat(`skills/codex-code-review/references/${p}`), /REVIEW_REQUEST|review-scope/, p);
  }
});

test('the push plan → one optional line inside Phase 1, outside every credential, and silent when nothing is named', () => {
  const plan = push.slice(push.indexOf('### Phase 1: Push Plan'), push.indexOf('### Phase 2: Execute Push'));
  assert.match(plan, /- Review scope: \*\*optional, only when a commit can be named\.\*\*/);
  assert.match(plan, /omit this line when it prints nothing, when it fails, or when an earlier plan in this conversation already showed the same statement for the same commits and requests/);
  assert.match(plan, /no credential, no condition of the push, and never a reason to ask for a review or to add a question/);
  assert.match(plan, /When the user asks what was reviewed, run it with `--all`/);
  assert.equal((push.match(/review-scope/g) || []).length, 2, 'the plan line and its source-checkout spelling');
});

test('the reader → is not consulted by any eligibility code or hook', () => {
  for (const p of ['scripts/review-state.js', 'scripts/lib/task-autonomy.js', 'scripts/pre-push-gate.sh', 'hooks/hooks.json', 'hooks/stop-guard.sh', 'hooks/user-prompt-review-guard.sh']) {
    assert.doesNotMatch(flat(p), /review-scope/, p);
  }
});
