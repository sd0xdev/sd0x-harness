'use strict';

// Task autonomy (git-autonomy R8, 2026-11-16): the pure half of the task record, the policy
// resolution and the two mechanical checks — auto commit and goal publish. No I/O here;
// `scripts/review-state.js` reads git and the state directory and hands the facts in, so every
// decision below is a function of facts a test can construct. Contract:
// skills/smart-commit/references/task-contract.md and
// skills/push-ci/references/authorization-contract.md § Task autonomy.
//
// A record is a fact store, never a credential: what authorizes a commit or a push is the policy
// the user adopted plus their own task or goal, read at the behaviour layer. Nothing a hook, a tool
// result or this file writes can stand in for either.

const POLICY_ID = 'task-autonomy-v1';
const NEW_DEFAULTS = { auto_commit: 'on', goal_publish: 'draft' };
const LEGACY = { auto_commit: 'off', goal_publish: 'off' };

// The whole smart-commit exclusion list (skills/smart-commit/SKILL.md Step 3), matched on the path:
// a candidate that would be excluded makes the commit a subset of the verified tree.
const SENSITIVE = [
  /(^|\/)\.env/, /\.pem$/, /\.key$/, /\.p12$/, /(^|\/)id_rsa/, /(^|\/)\.aws\/credentials$/,
  /\.secret$/, /(^|\/)credentials\.json$/, /(^|\/)\.npmrc$/, /(^|\/)token\.txt$/,
  /(^|\/)(node_modules|dist|\.cache)\//,
];
const isSensitive = (p) => SENSITIVE.some((re) => re.test(p));

// `git status --porcelain=v2 -z --untracked-files=all`: ordinary (1), rename/copy (2, whose origin
// path is the next NUL field), unmerged (u) and untracked (?) entries. `staged` is the index column,
// `unstaged` the work-tree column.
function parseStatus(text) {
  const out = [];
  const f = String(text || '').split('\0');
  for (let i = 0; i < f.length; i++) {
    const rec = f[i];
    if (!rec) continue;
    const t = rec[0];
    if (t === '?') out.push({ path: rec.slice(2), kind: 'untracked', staged: false, unstaged: true, deleted: false });
    else if (t === '1') {
      const parts = rec.split(' ');
      const xy = parts[1];
      out.push({ path: parts.slice(8).join(' '), kind: 'changed', staged: xy[0] !== '.', unstaged: xy[1] !== '.', deleted: xy[1] === 'D' || (xy[0] === 'D' && xy[1] === '.') });
    } else if (t === '2') {
      const parts = rec.split(' ');
      const xy = parts[1];
      out.push({ path: parts.slice(9).join(' '), kind: 'renamed', staged: xy[0] !== '.', unstaged: xy[1] !== '.', deleted: false, orig: f[++i] });
    } else if (t === 'u') {
      out.push({ path: rec.split(' ').slice(10).join(' '), kind: 'unmerged', staged: true, unstaged: true, deleted: false });
    }
  }
  return out;
}

// Refnames this flow creates or targets: `git check-ref-format --branch` rules, narrowed to the
// characters a branch name in this workflow uses, and never option-shaped.
const BRANCH_RE = /^(?!.*\.\.)(?!.*\/\/)(?!.*@\{)(?!.*\.lock(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const PROJECT_RE = /^[A-Z][A-Z0-9_]{1,19}$/;
const validBranch = (b) => typeof b === 'string' && BRANCH_RE.test(b) && !/[./]$/.test(b);

// Which policy is in force, and where it came from. Precedence: an explicit override `off` · the
// user's own recorded decision (kept outside the repository, per user; a granting override value
// counts only once that decision is `adopted`) · legacy. Legacy is the
// conservative reading of everything else — plugin-only use, a clone of a repository someone else
// set up: nothing in the repository is one user's consent for another, so the absence of the user's
// own decision never widens anything. A fresh `/codex-setup init` records the installing user's
// decision through the same channel. `adoption: pending` tells the model to ask once; a recorded
// decision, either way, is never asked about again.
//   override.<key> = { state: 'absent' | 'unknown' | 'value', value }
function resolvePolicy({ override = {}, decision = null } = {}) {
  let source;
  let base;
  if (decision === 'adopted') { source = 'adopted'; base = NEW_DEFAULTS; }
  else if (decision === 'declined') { source = 'declined'; base = LEGACY; }
  else { source = 'legacy'; base = LEGACY; }
  // A setting in the (tracked) override file can only NARROW: `off` wins for everyone, while a
  // granting value takes effect only for a user who adopted the mode — the file is shared, and a
  // teammate's `on` is not this user's consent.
  const pick = (k, allowed) => {
    const o = override[k];
    if (o && o.state === 'value' && o.value === 'off') return { value: 'off', from: 'override' };
    if (o && o.state === 'value' && allowed.includes(o.value)) {
      return decision === 'adopted' ? { value: o.value, from: 'override' } : { value: base[k], from: 'override-needs-adoption' };
    }
    // An override that exists but cannot be read, or holds a value this does not recognise, narrows:
    // these two settings only ever grant.
    if (o && o.state === 'unknown') return { value: 'off', from: 'override-unreadable' };
    if (o && o.state === 'value') return { value: 'off', from: 'override-invalid' };
    return { value: base[k], from: source };
  };
  const ac = pick('auto_commit', ['on', 'off']);
  const gp = pick('goal_publish', ['draft', 'off']);
  const free = (k, ok) => (override[k] && override[k].state === 'value' && ok(override[k].value) ? override[k].value : null);
  // Only two explicit `off` values settle the question for a user who has not answered it.
  const settled = !decision && ac.value === 'off' && gp.value === 'off' && ac.from === 'override' && gp.from === 'override';
  return {
    policy: POLICY_ID,
    auto_commit: ac.value,
    goal_publish: gp.value,
    base_branch: free('base_branch', validBranch) || 'main',
    jira_project: free('jira_project', (v) => PROJECT_RE.test(v)),
    source,
    sources: { auto_commit: ac.from, goal_publish: gp.from },
    adoption: settled ? 'override' : decision || 'pending',
  };
}

function newTaskId(now = Date.now(), rand = Math.random) {
  return `T${now.toString(36)}${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

const tipOf = (task) => (task ? task.head_chain[task.head_chain.length - 1] : null);

function branchReasons(task, branch, protectedStatus, head) {
  const reasons = [];
  if (!branch) reasons.push('detached');
  else if (protectedStatus !== 1) reasons.push(protectedStatus === 0 ? 'protected' : 'protected-unknown');
  if (task && branch && task.branch && task.branch !== branch) reasons.push('branch-mismatch');
  if (task && head !== tipOf(task)) reasons.push('head-moved');
  return reasons;
}

// The auto-commit predicate. Facts:
//   task            the active record (null when none)
//   policy          resolvePolicy()
//   branch          current branch, or null when detached; protectedStatus 0 · 1 · 2
//   head            current HEAD OID
//   entries         parseStatus() of the work tree now
//   gatesPassed     every plane the dirty content requires is passed at `digest`
//   digest          the combined digest now (null = undigestable)
// The candidate is the WHOLE dirty set: v1 never commits a subset, because a subset's tree is not
// the tree the gates verified. Ownership is the task's own declaration (`task own`), checked against
// what git reports; a path nobody declared — another agent's file, a stray artefact — stops it.
function commitCheck({ task, policy, branch, protectedStatus, head, entries, gatesPassed, digest }) {
  const reasons = [];
  if (!task || task.status !== 'active') reasons.push('no-task');
  if (policy.auto_commit !== 'on') reasons.push('policy-off');
  reasons.push(...branchReasons(task, branch, protectedStatus, head));
  if (task && !task.baseline.clean) reasons.push('baseline-dirty');
  const candidate = entries.map((e) => e.path);
  if (!candidate.length) reasons.push('nothing-to-do');
  if (entries.some((e) => e.kind === 'unmerged')) reasons.push('unmerged');
  if (entries.some((e) => e.staged)) reasons.push('staged');
  const owned = new Set(task ? task.owned : []);
  const unowned = entries.filter((e) => !owned.has(e.path) || (e.orig && !owned.has(e.orig))).map((e) => e.path);
  if (unowned.length) reasons.push('unowned');
  const sensitive = candidate.filter(isSensitive);
  if (sensitive.length) reasons.push('sensitive');
  if (digest === null) reasons.push('undigestable');
  else if (!gatesPassed) reasons.push('gates-open');
  return { ok: reasons.length === 0, reasons, candidate, unowned, sensitive };
}

// The goal-publish predicate — the mechanical half. Whether a goal the USER set is active is read
// at the behaviour layer and nowhere else. Facts as commitCheck, plus:
//   ahead           commits the push would publish (null = cannot tell)
//   aheadOids       their OIDs; every one must be a commit this task made and verified — a reused
//                   branch can carry earlier local commits nobody reviewed, and those never ride along
//   aheadGates      every plane the ahead content requires is passed at `digest`
function publishCheck({ task, policy, branch, protectedStatus, head, entries, ahead, aheadOids = [], aheadGates, digest }) {
  const reasons = [];
  if (!task || task.status !== 'active') reasons.push('no-task');
  if (policy.goal_publish !== 'draft') reasons.push('policy-off');
  reasons.push(...branchReasons(task, branch, protectedStatus, head));
  if (task && task.unverified) reasons.push('unverified-commit');
  if (entries.length) reasons.push('dirty');
  if (ahead === null) reasons.push('ahead-unknown');
  else if (ahead === 0) reasons.push('nothing-to-publish');
  else {
    const mine = new Set(task ? task.commits : []);
    if (aheadOids.length !== ahead || aheadOids.some((o) => !mine.has(o))) reasons.push('foreign-commits');
  }
  if (digest === null) reasons.push('undigestable');
  else if (!aheadGates) reasons.push('gates-open');
  return { ok: reasons.length === 0, reasons };
}

module.exports = {
  POLICY_ID, NEW_DEFAULTS, LEGACY, BRANCH_RE, PROJECT_RE,
  isSensitive, parseStatus, resolvePolicy, validBranch, newTaskId, commitCheck, publishCheck,
};
