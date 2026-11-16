'use strict';
// git-autonomy R8 (2026-11-16): the two task-autonomy credentials live in rule text the model reads,
// so the contract is that text — same construction as goal-mode.test.js. Each clause is one
// condition or boundary; the checker returns the clauses a text is missing, the real text must yield
// none, and deleting any one clause must yield exactly that one.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const AUTH = read('skills/push-ci/references/authorization-contract.md');
const TASK = read('skills/smart-commit/references/task-contract.md');

const AUTH_CLAUSES = {
  'no evidence never widens': 'An upgrade never widens what a repository allowed before: no evidence reads as the old behaviour',
  'explicit off and narrower instructions win': "The user's narrower instruction — \"do not commit\", \"local only\", \"no PR\" — wins over the policy",
  'read-only never commits': 'Read-only research, review-only and discussion never commit, whatever the work tree holds',
  'every gate first': 'Every required gate has passed after the last edit',
  'stale gate returns to the loop': 'A gate found stale returns to the auto-loop; it is never skipped',
  'mechanical commit check': '`review-state.js task commit-check --format=json` returns `ok: true`',
  'committed re-check': '`review-state.js task committed` must return `ok: true`',
  'grouped commits are not each verified': 'only the final tree is the verified one',
  'never a subset': 'nothing is committed automatically and no subset is committed',
  'no stash or reset to pass': 'Never `git add -p`, stash or reset to make the check pass',
  'goal origin as Goal mode': 'Goal mode conditions 1 and 2 above, word for word',
  'publish check': '`review-state.js goal-publish --format=json` returns `ok: true`',
  'unknown protection refuses': '`protected-branches.sh` exit 1 (unknown refuses)',
  'plain and bound push': '`FORCE_WITH_LEASE=[false]`, one push destination with its digest and no `receivepack`',
  'risk notice informs only': 'The notice informs; it authorizes nothing',
  'pr-review before PR': '`/pr-review` passes',
  'push before PR, CI after': 'a workflow that runs only on `pull_request` has nothing to show until the PR exists',
  'draft never ready, ready never draft': 'An existing ready PR is never turned back into a draft, a draft is never marked ready',
  'edited body kept': 'a body someone edited by hand is never overwritten',
  'only this head on the recorded base passes': 'Only a completed success for exactly that head, on the base recorded at PR time, with every required check passing and the same runs seen on two reads at least a minute apart',
  'never ready to start CI': 'A Draft PR is never marked ready to make CI start',
  'stall rules bound the fix loop': "the auto-loop's stall and cap rules bound the attempts",
  'external failures reported': 'A permission problem, platform outage, quota or approval wait is reported, never pushed again',
  'CI-gated goal not done early': 'A goal whose condition needs CI passing is not complete until `ci-pass`',
  'ended goal stops mutation': 'When the goal is cleared, replaced or ends, no new remote mutation starts',
  'never force, protected, merge, deploy, bypass': 'Never under this credential: a force form, a protected or unknown branch, a tag, a deletion, a destination change, a merge, ready-for-review, a release or a deploy',
};

const TASK_CLAUSES = {
  'a record is never a credential': 'A task record is a fact store, never a credential',
  'continuations ask nothing again': 'a review round, a retry, a fix after a failed gate, a compaction, a goal continuation',
  'dirty baseline never auto-commits': 'it never auto-commits, and the notice says so',
  'adoption asked once': 'once per repository, never again after either answer',
  'explicit switch is the adoption': "The user's explicit request to switch modes is itself the adoption",
  'capability by operation, not server': 'It matches tools by operation',
  'access read before asking': 'Empty, 401, expired authorization, timeout or a network error → no Jira question',
  'project never guessed': 'never a silent pick',
  'description boundary': 'no code, diff, log, stack trace, environment value, internal URL or credential',
  'secret removes create': 'A finding from the secret scan removes the create option for this draft; never auto-redact and send',
  'preview shows every field': 'The question\'s preview shows **every** field the create sends',
  'selection is the approval': 'do not ask again through `/jira`',
  'unknown never creates again': '**never create again** unless the user asks',
  'branch failure keeps ticket': 'Keep the key. Retry only the branch',
  'main, never remote default': 'Never `origin/HEAD` or the repository default in its place',
  'failed fetch creates nothing': 'a failed fetch creates nothing',
  'dirty never carried': 'Never stash, reset or carry the changes across bases',
  'ownership declared and checked': 'any path nobody declared — another agent\'s file, a stray artefact — stops the automatic commit',
  'local task ends with its commit': 'A local task ends with its commit; it does not wait for a PR merge',
};

function missing(text, clauses) {
  const t = flat(text);
  return Object.entries(clauses).filter(([, c]) => !t.includes(flat(c))).map(([k]) => k);
}

for (const [label, text, clauses] of [['authorization-contract § Task autonomy', AUTH, AUTH_CLAUSES], ['task-contract', TASK, TASK_CLAUSES]]) {
  test(`${label} when read → carries every condition and boundary`, () => {
    assert.deepEqual(missing(text, clauses), []);
  });
  test(`${label} clause deleted → the checker names exactly that clause (negative control)`, () => {
    for (const [name, clause] of Object.entries(clauses)) {
      const t = flat(text);
      const at = t.indexOf(flat(clause));
      assert.notEqual(at, -1, name);
      assert.equal(t.indexOf(flat(clause), at + 1), -1, `"${name}" must occur once so deleting it is visible`);
      assert.deepEqual(missing(t.slice(0, at) + t.slice(at + flat(clause).length), clauses), [name]);
    }
  });
}

test('skills name the credential paths the contract defines, and never widen them', () => {
  const push = read('skills/push-ci/SKILL.md');
  assert.match(push, /\| `--goal-publish` \|/);
  assert.match(push, /\| `--defer-watch` \|/);
  assert.match(push, /Using `--goal-publish` with `--force-with-lease`, on a protected or unknown branch/);
  assert.match(push, /never fall back to asking inside a\s+goal-publish run, and never widen the push to make it fit/);
  const pr = read('skills/create-pr/SKILL.md');
  assert.match(pr, /closed, merged or more than one → stop and report, never reopen or guess/);
  assert.match(pr, /An existing ready PR stays ready; a draft is never marked ready/);
  const sc = read('skills/smart-commit/SKILL.md');
  assert.match(sc, /### Auto commit \(git-autonomy R8\)/);
  assert.match(sc, /this path never commits on a warning/);
  assert.match(sc, /Never commit a subset,\s+and never stash, reset or `git add -p` to make the check pass/);
  const jira = read('skills/jira/SKILL.md');
  assert.match(jira, /never by server name/);
  assert.match(jira, /never from the current HEAD/);
});

test('rule 4 in both CLAUDE files names the two credentials', () => {
  for (const f of ['CLAUDE.md', 'CLAUDE.template.md']) {
    const rule4 = read(f).split('\n').find((l) => /^4\. \*\*(⚓ )?Anchor\*\*/.test(l));
    assert.ok(rule4, `${f} must carry rule 4`);
    assert.match(rule4, /a plain push without it under "Goal publish"/, `${f}: Goal publish`);
    assert.match(rule4, /or under "Auto commit"/, `${f}: Auto commit`);
  }
});
