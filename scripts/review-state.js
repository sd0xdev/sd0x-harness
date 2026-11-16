#!/usr/bin/env node
'use strict';

// Single-slot per-plane review state — the one small store behind the reminder
// hooks. Slot shape, `noted`/`passed`/`owed` formulas, and the advisory failure
// budget: docs/features/hook-lightweighting/2-tech-spec.md §3.1–§3.2.

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeTreeState, planeOf, digestOfRev } = require(path.join(__dirname, 'lib', 'tree-digest.js'));

// Gate plane → content plane. precommit binds the CODE digest: it is an
// obligation of the code plane, so a doc-only edit never reopens it (§3.1).
const PLANES = { code_review: 'code', doc_review: 'doc', precommit: 'code' };
const GATES = { code_review: '/codex-review-fast', doc_review: '/codex-review-doc', precommit: '/precommit' };

function die(msg) {
  process.stderr.write(`review-state: ${msg}\n`);
  process.exit(1);
}

function repoRoot() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { env }).toString('utf8').trim();
}

// <repo-key>: canonical real checkout path + short hash of it, so two
// same-named checkouts, symlinked spellings and worktrees neither share nor
// fragment state. The hash algorithm/length is non-contractual (§6).
function stateDir(root) {
  const real = fs.realpathSync(root);
  const key = `${path.basename(real)}-${crypto.createHash('sha256').update(real).digest('hex').slice(0, 12)}`;
  return path.join(os.homedir(), '.cache', 'sd0x-dev-flow', 'state', key);
}

// noted:true ⇔ a valid slot was decoded. Missing file, unparseable JSON and a
// schema-invalid object all read as not-noted; a valid slot may carry
// digest:null (undigestable tree at note time), which never matches a check.
function readSlot(dir, plane) {
  let s;
  try {
    s = JSON.parse(fs.readFileSync(path.join(dir, `${plane}.json`), 'utf8'));
  } catch {
    return null;
  }
  if (typeof s !== 'object' || s === null) return null;
  if (s.verdict !== 'pass' && s.verdict !== 'fail') return null;
  if (s.digest !== null && typeof s.digest !== 'string') return null;
  if (!Number.isInteger(s.rounds) || s.rounds < 0) return null;
  return s;
}

function note(plane, verdict) {
  if (!(plane in PLANES)) die(`unknown plane "${plane}" — valid: ${Object.keys(PLANES).join(', ')}`);
  if (verdict !== 'pass' && verdict !== 'fail') die(`invalid verdict "${verdict}" — valid: pass, fail`);
  const root = repoRoot();
  const digest = computeTreeState(root).planes[PLANES[plane]].digest;
  const dir = stateDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const prev = readSlot(dir, plane);
  const rounds = verdict === 'fail' ? (prev ? prev.rounds : 0) + 1 : 0;
  const slot = { digest, verdict, rounds, time: new Date().toISOString() };
  // Plain overwrite, no lock, no temp-and-rename: a torn concurrent write
  // decodes as noted:false and degrades to a reminder, never to a false pass.
  fs.writeFileSync(path.join(dir, `${plane}.json`), `${JSON.stringify(slot)}\n`);
  process.stdout.write(`[REVIEW_STATE] ${plane} ${JSON.stringify(slot)}\n`);
}

function computeCheck(opts = {}) {
  const root = repoRoot();
  const tree = computeTreeState(root, opts);
  const dir = stateDir(root);
  const planes = {};
  for (const [plane, content] of Object.entries(PLANES)) {
    const cur = tree.planes[content];
    // A partial plane is unverifiable — fail-open to a reminder, never silence.
    const dirty = cur.partial || cur.dirty.length > 0;
    const slot = readSlot(dir, plane);
    const noted = slot !== null;
    const digest_match =
      noted && slot.digest !== null && cur.digest !== null && slot.digest === cur.digest;
    const verdict = noted ? slot.verdict : null;
    const rounds = noted ? slot.rounds : 0;
    const passed = noted && digest_match && verdict === 'pass';
    const owed = dirty && !passed;
    planes[plane] = { noted, dirty, digest_match, verdict, rounds, passed, owed };
  }
  return {
    planes,
    change: ['code', 'doc'].filter(p => tree.planes[p].partial || tree.planes[p].dirty.length > 0),
    dirtyPaths: [...tree.planes.code.dirty, ...tree.planes.doc.dirty],
    root,
    tree,
  };
}

// Exact-name intent mapping: a changed path under docs/features/<key>/ maps to that directory's
// intent-<key>.md, and only when that exact file exists — a stray intent-<other>.md never hints.
// A fact, never a verdict; emitted only on the state-backed line (the hook's git_status fallback
// stays change-class-only by design).
// The feature-key contract (scripts/lib/feature-resolver.js SLUG_RE, restated here rather than
// required — the resolver pulls the whole classifier graph and this file stays light). It also
// guards the OUTPUT: the fact line is one line with a space-separated field grammar, and a
// directory named with a newline, space or comma would otherwise be interpolated into it verbatim
// — git status paths keep raw control characters all the way here.
const FEATURE_SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;

function intentHints(root, dirtyPaths) {
  const hints = new Set();
  for (const p of dirtyPaths) {
    const m = /^docs\/features\/([^/]+)\//.exec(p);
    if (!m) continue;
    if (!FEATURE_SLUG_RE.test(m[1])) continue;
    const hint = `docs/features/${m[1]}/intent-${m[1]}.md`;
    try {
      // Directory enumeration with exact byte name + Dirent type, not statSync/existsSync:
      // statSync follows symlinks and a case-insensitive filesystem answers for `Intent-x.md`,
      // so either could report a presence no implementing skill can deliver on. Dirent types are
      // lstat-like (a symlink is isSymbolicLink, not isFile) and `name` comparison is
      // byte-exact — same contract as next-step's advisory and doc-classifier's exclusion.
      const entries = fs.readdirSync(path.join(root, 'docs', 'features', m[1]), { withFileTypes: true });
      if (entries.some(e => e.name === `intent-${m[1]}.md` && e.isFile())) hints.add(hint);
    } catch { /* absent or unreadable reads as no hint — a hint is a reminder, never an obligation */ }
  }
  return [...hints].sort();
}

// Procedure hints (rules-residency task 5, tech spec § 3.3): which on-demand contract a mechanical
// fact makes relevant, printed as plugin-relative paths the model can Read. Facts only — the hook
// never diagnoses, classifies or reads a verdict's meaning: `rounds` is the slot's failed-verdict
// count (a floor, not a stall verdict), a path is a path, a line count is a line count.
const STALL_ROUNDS = 3;
const DOC_LINE_SIGNAL = 500;
const LOOP_CONTRACTS = [
  'skills/codex-code-review/references/review-common.md',
  'skills/codex-code-review/references/loop-diagnostics.md',
];
const OVERRIDE_CONTRACT = 'rules/override-contract.md';
const DOCUMENTATION_CONTRACT = 'skills/doc-review/references/documentation-contract.md';

function procedureHints(root, planes, dirtyPaths) {
  const hints = new Set();
  if (Object.values(planes).some(p => p.rounds >= STALL_ROUNDS)) LOOP_CONTRACTS.forEach(c => hints.add(c));
  for (const p of dirtyPaths) {
    // The two places an override lives: this checkout's rules/ and an install's .claude/rules/.
    if (/^(\.claude\/)?rules\/[^/]+-project\.md$/.test(p)) hints.add(OVERRIDE_CONTRACT);
    // A feature document past the size signal — records (request tickets) are exempt from it.
    if (/^docs\/features\/.+\.md$/.test(p) && !/\/requests\//.test(p)) {
      try {
        // Dirty paths are latin1 strings carrying git's raw bytes (tree-digest.js); rebuild the raw
        // path so a non-ASCII filename is read, not re-encoded into a path that does not exist.
        const full = Buffer.concat([Buffer.from(root, 'utf8'), Buffer.from(path.sep), Buffer.from(p, 'latin1')]);
        if (!fs.lstatSync(full).isFile()) continue;
        const text = fs.readFileSync(full, 'utf8');
        const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
        if (lines > DOC_LINE_SIGNAL) hints.add(DOCUMENTATION_CONTRACT);
      } catch { /* deleted or unreadable reads as no hint — a hint is a reminder, never an obligation */ }
    }
  }
  return [...hints].sort();
}

function statusToken(p) {
  if (!p.noted) return 'none';
  if (!p.digest_match) return 'stale';
  return p.verdict;
}

// One computation, three renderings (§3.2). md is the only rendering allowed
// to be silent; fact and json always answer.
function check(format) {
  const { planes, change, dirtyPaths, root } = computeCheck();
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(planes)}\n`);
    return;
  }
  if (format === 'fact') {
    const reviews = Object.entries(planes)
      .map(([name, p]) => `${name}:${statusToken(p)}${p.rounds > 0 ? `(r${p.rounds})` : ''}`)
      .join(',');
    const hints = intentHints(root, dirtyPaths);
    const hintField = hints.length ? ` intent_hint=${hints.join(',')}` : '';
    const procedures = procedureHints(root, planes, dirtyPaths);
    const procField = procedures.length ? ` procedure_hint=${procedures.join(',')}` : '';
    process.stdout.write(`[AUTO_LOOP_STATE] change=${change.length ? change.join(',') : 'none'} reviews=${reviews}${hintField}${procField} source=state\n`);
    return;
  }
  for (const [name, p] of Object.entries(planes)) {
    if (!p.owed) continue;
    const why = p.noted ? (p.digest_match ? `最後記錄為 ${p.verdict}` : '記錄的 digest 已過期') : '無有效記錄';
    const roundsNote = p.rounds > 0 ? `｜已 ${p.rounds} 輪未過` : '';
    process.stdout.write(`📋 ${name}：${PLANES[name]} 平面有未提交變更且${why} → ${GATES[name]}${roundsNote}（規則見 rules/auto-loop.md）\n`);
  }
}

// --- Proactive offer (git-autonomy R4) --------------------------------------------------------
// Decides whether the model may offer a commit / push menu now, and remembers that a menu was shown
// at a digest so it is offered once per passing digest. Contract: docs/features/git-autonomy/
// 2-tech-spec.md § 3.3 (`review-state.js offer`). A fact for the model — never a credential: the
// workflow a selection invokes still asks its own approval.

const PLANES_BY_CONTENT = { code: ['code_review', 'precommit'], doc: ['doc_review'] };
const DEFAULT_PROTECTED = ['main', 'master', 'develop', 'release/*'];

function gitOut(root, argv) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  try {
    return execFileSync('git', ['-C', root, ...argv], { env, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
  } catch {
    return null;
  }
}

// The project's git override: the first candidate that EXISTS (lstat, so a dangling symlink
// counts), never falling back past it — the same candidate order and no-fallback rule as
// protected-branches.sh. Stricter than that script's `[ -e ] || [ -L ]` test: only ENOENT /
// ENOTDIR mean "absent" here, and any other lstat error (an untraversable directory, say) leaves
// existence unknown, which must not fall through to a lower file. The shell half is deferred
// (docs/features/rules-residency/requests/2026-09-25-override-setting-fail-closed.md). Returns null
// when neither candidate exists, { path } for the selected file, or { unknown: true }.
function selectOverride(root) {
  for (const rel of ['.claude/rules/git-workflow-project.md', 'rules/git-workflow-project.md']) {
    const p = path.join(root, rel);
    try {
      fs.lstatSync(p);
      return { path: p };
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') continue;
      return { unknown: true };
    }
  }
  return null;
}

// The protected-set answer, fail-closed: 0 protected · 1 not · 2 unknown (treated as protected).
// The resolver ships beside this file (plugin: scripts/, installed: .claude/scripts/).
function protectedStatus(root, branch) {
  const resolver = path.join(__dirname, 'protected-branches.sh');
  if (fs.existsSync(resolver)) {
    try {
      execFileSync('/bin/bash', ['-p', '--', resolver, '--root', root, '--', branch], { stdio: 'ignore' });
      return 0;
    } catch (e) {
      return e.status === 1 ? 1 : 2;
    }
  }
  if (selectOverride(root)) return 2; // an override exists, or may, but nothing here can read it
  return DEFAULT_PROTECTED.some((p) => (p.endsWith('/*') ? branch.startsWith(p.slice(0, -1)) : branch === p)) ? 0 : 1;
}

// A bare-value setting from the project's git override (selectOverride): the first live
// (non-comment) value line under `## <heading>`. No file, heading or value → the default; an
// unrecognised value also reads as the default (the /claude-health check #7 reports it). A selected
// file that cannot be read, or an override whose existence cannot be decided, answers `closed`,
// the setting's narrowing value: these settings only ever narrow, so the default would fail open.
function overrideSetting(root, heading, allowed, dflt, closed) {
  const sel = selectOverride(root);
  if (!sel) return dflt;
  if (sel.unknown) return closed;
  let text;
  try { text = fs.readFileSync(sel.path, 'utf8'); } catch { return closed; }
  const live = text.replace(/<!--[\s\S]*?-->/g, '');
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^##[ \\t]+${esc}[ \\t]*$([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, 'm').exec(live);
  if (!m) return dflt;
  const value = m[1].split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  return allowed.includes(value) ? value : dflt;
}
const offerMode = (root) => overrideSetting(root, 'Offer Mode', ['on', 'commit-only', 'off'], 'on', 'off');

// Files the push kind would publish: commits ahead of the upstream, or of the default branch's
// merge-base when there is none. null = cannot tell, which never yields a push kind.
function aheadFiles(root) {
  let base = null;
  const up = gitOut(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (up && up.trim()) base = up.trim();
  else {
    const head = gitOut(root, ['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD']);
    const def = head && head.trim() ? head.trim() : null;
    if (!def) return null;
    const mb = gitOut(root, ['merge-base', 'HEAD', def]);
    if (!mb || !mb.trim()) return null;
    base = mb.trim();
  }
  const count = gitOut(root, ['rev-list', '--count', `${base}..HEAD`]);
  if (count === null) return null;
  const commits = Number(count.trim());
  if (commits === 0) return { commits, files: [] };
  // Per-commit paths, not the net change: a push publishes every commit, so a doc changed and then
  // reverted inside the range is still published history that a doc gate has to have passed.
  // --no-renames: a rename reports both sides, so a doc renamed to code still counts as doc. Paths
  // keep their bytes (NUL-delimited, not trimmed); the leading newline git prints per commit is the
  // only separator stripped.
  // --diff-merges=first-parent: a merge commit lists what it brings onto this branch, including a
  // change made during merge resolution, which the default merge handling would not list at all.
  const names = gitOut(root, ['log', '--format=', '--name-only', '--no-renames', '--diff-merges=first-parent', '-z', `${base}..HEAD`]);
  return names === null ? null : { commits, files: [...new Set(names.split('\0').map((n) => n.replace(/^\n+/, '')).filter(Boolean))] };
}

function combinedDigest(tree) {
  const parts = ['code', 'doc'].map((p) => tree.planes[p].digest);
  if (parts.some((d) => d === null)) return null;
  return `sha256:${crypto.createHash('sha256').update(parts.join('\n')).digest('hex')}`;
}

// Two markers, one per menu: `offer.json` for the ordinary menu, `offer-deferred.json` for the one
// push menu a user goal held back — so each is shown once per digest and neither swallows the other.
const shownFile = (deferred) => (deferred ? 'offer-deferred.json' : 'offer.json');

function readShown(dir, deferred = false) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, shownFile(deferred)), 'utf8'));
    return typeof j.digest === 'string' ? j.digest : null;
  } catch {
    return null;
  }
}

// `deferred` (git-autonomy, user direction 2026-09-25): the one push menu held back while a user goal
// ran is offered when the goal ends, and the ordinary once-per-digest marker must not swallow it — a
// commit made during the goal leaves the reviewed digest unchanged. It reads its OWN marker instead,
// so it too is shown once per digest; every gate, protected-branch and Offer Mode check still applies.
function computeOffer({ deferred = false } = {}) {
  // One snapshot: the gate verdicts and the digest the offer reports come from the same tree read,
  // so passes earned at one digest can never be paired with another.
  const { planes, root, tree } = computeCheck();
  const digest = combinedDigest(tree);
  const out = (offer, kind, reason, extra = {}) => ({ offer, kind, reason, branch, digest, push_dropped: null, ...extra });
  const head = gitOut(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const branch = head && head.trim() ? head.trim() : null;
  if (!branch) return out(false, 'none', 'detached');

  const dirtyContent = ['code', 'doc'].filter((p) => tree.planes[p].partial || tree.planes[p].dirty.length > 0);
  // null = what a push would publish cannot be established (no upstream and no origin/HEAD, or a
  // git read failed). Then no push kind is offered at all: a gate cannot vouch for unknown content.
  const ahead = aheadFiles(root);
  const aheadContent = ahead === null ? [] : [...new Set(ahead.files.map(planeOf))];
  let kind;
  let unknownAhead = false;
  if (dirtyContent.length) {
    kind = 'commit+push'; // commit, then push what was just committed
    unknownAhead = ahead === null;
  } else if (ahead && ahead.commits > 0) kind = 'push';
  else return out(false, 'none', 'nothing-to-do');

  const mode = offerMode(root);
  if (mode === 'off') return out(false, 'none', 'disabled');

  // Every plane whose change class appears in what the offer would publish must be PASSED at
  // this digest — "not owed" cannot vouch for a clean-tree push, since a clean plane is never owed.
  const content = new Set([...dirtyContent, ...aheadContent]);
  const required = [...content].flatMap((c) => PLANES_BY_CONTENT[c]);
  if (required.some((p) => !planes[p].passed)) return out(false, 'none', 'gates-open');

  if (digest === null) return out(false, 'none', 'already-offered');
  if (readShown(stateDir(root), deferred) === digest) return out(false, 'none', 'already-offered');

  // One label per dropped push, most specific first: the project's setting, then the branch, then
  // an unknown ahead range.
  let pushDropped = null;
  if (mode === 'commit-only') pushDropped = 'commit-only';
  else {
    const st = protectedStatus(root, branch);
    if (st !== 1) pushDropped = st === 0 ? 'protected' : 'protected-unknown';
    else if (unknownAhead) pushDropped = 'ahead-unknown';
  }
  if (pushDropped) {
    if (kind === 'push') return out(false, 'none', pushDropped === 'commit-only' ? 'disabled' : pushDropped);
    kind = 'commit';
  }
  return out(true, kind, null, { push_dropped: pushDropped });
}

function offer(format, opts) {
  const r = computeOffer(opts);
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(r)}\n`);
    return;
  }
  if (format === 'md') {
    if (r.offer) {
      const menu = r.kind === 'commit' ? 'commit' : r.kind === 'push' ? 'push' : 'commit / commit and push';
      process.stdout.write(`🟢 ${r.branch}：gate 皆已通過 → 用 AskUserQuestion 提供 ${menu} 選單（規則見 rules/git-workflow.md § Proactive Offer）\n`);
    }
    return;
  }
  process.stdout.write(`[OFFER] offer=${r.offer} kind=${r.kind} reason=${r.reason || 'none'} branch=${r.branch || '-'} push_dropped=${r.push_dropped || 'none'}\n`);
}

function offerShown(digest, deferred = false) {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest || '')) die(`invalid digest "${digest}" — pass the digest the offer reported`);
  const root = repoRoot();
  const dir = stateDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, shownFile(deferred)), `${JSON.stringify({ digest, time: new Date().toISOString() })}\n`);
  process.stdout.write(`[OFFER_SHOWN] ${digest}\n`);
}

// --- Goal-mode commit (git-autonomy R7, FR-17) ---------------------------------------------------
// The mechanical half of the goal credential: whether uncommitted work may be committed without a
// per-use question — every required plane passed at this digest, a real branch, `## Goal Commit` not
// off. Whether a goal the USER set is active is the behaviour-layer half (rules/git-workflow.md
// § Proactive Offer, "Goal mode"): no hook or script can see it. A protected branch answers
// `needs_branch_allowance: true` — the first commit there asks (tech spec § 3.5 condition 3).
function goalCommit(format) {
  const { planes, root, tree } = computeCheck();
  const digest = combinedDigest(tree);
  const head = gitOut(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const branch = head && head.trim() ? head.trim() : null;
  const out = (ok, reason, extra = {}) => ({ ok, reason, branch, digest, needs_branch_allowance: false, ...extra });
  let r;
  const dirty = ['code', 'doc'].filter((p) => tree.planes[p].partial || tree.planes[p].dirty.length > 0);
  if (!branch) r = out(false, 'detached');
  else if (!dirty.length) r = out(false, 'nothing-to-do');
  else if (overrideSetting(root, 'Goal Commit', ['on', 'off'], 'on', 'off') === 'off') r = out(false, 'disabled');
  else if (dirty.flatMap((c) => PLANES_BY_CONTENT[c]).some((p) => !planes[p].passed)) r = out(false, 'gates-open');
  else r = out(true, null, { needs_branch_allowance: protectedStatus(root, branch) !== 1 });
  if (format === 'json') process.stdout.write(`${JSON.stringify(r)}\n`);
  else process.stdout.write(`[GOAL_COMMIT_CHECK] ok=${r.ok} reason=${r.reason || 'none'} branch=${r.branch || '-'} needs_branch_allowance=${r.needs_branch_allowance}\n`);
}

// --- Task autonomy (git-autonomy R8, 2026-11-16) ------------------------------------------------
// The I/O half of scripts/lib/task-autonomy.js: the policy in force, the per-worktree task record,
// the task branch, and the two mechanical checks. Every record here is a fact store, never a
// credential — skills/smart-commit/references/task-contract.md.
// Loaded on first use, not at startup: an installed copy (.claude/scripts/) ships with
// lib/tree-digest.js only, and its check / note / offer paths — what the hooks run — must keep working
// without this library. The task commands run from the plugin's own scripts/.
let taModule = null;
const TA = new Proxy({}, {
  get(_, key) {
    if (!taModule) {
      try { taModule = require(path.join(__dirname, 'lib', 'task-autonomy.js')); } catch {
        die('lib/task-autonomy.js is missing beside this copy — run the task commands from the plugin\'s scripts/');
      }
    }
    return taModule[key];
  },
});

// A setting's raw state, for the settings that may GRANT: absent (no file, heading or value),
// unknown (a selected file that cannot be read), or the first live value line under the heading.
function overrideRaw(root, heading) {
  const sel = selectOverride(root);
  if (!sel) return { state: 'absent' };
  if (sel.unknown) return { state: 'unknown' };
  let text;
  try { text = fs.readFileSync(sel.path, 'utf8'); } catch { return { state: 'unknown' }; }
  const live = text.replace(/<!--[\s\S]*?-->/g, '');
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^##[ \\t]+${esc}[ \\t]*$([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, 'm').exec(live);
  if (!m) return { state: 'absent' };
  const value = m[1].split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  return value ? { state: 'value', value } : { state: 'absent' };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// The adoption decision belongs to the REPOSITORY, not to one worktree of it: keyed by the shared
// git directory, so every linked worktree reads the same answer and none asks again. It lives in
// this user's state directory — never in the repository, where a clone would inherit one user's
// consent for another.
function policyDir(root) {
  const common = gitOut(root, ['rev-parse', '--git-common-dir']);
  if (!common || !common.trim()) return stateDir(root);
  const abs = path.resolve(root, common.trim());
  let real;
  try { real = fs.realpathSync(abs); } catch { return stateDir(root); }
  const key = `repo-${crypto.createHash('sha256').update(real).digest('hex').slice(0, 12)}`;
  return path.join(os.homedir(), '.cache', 'sd0x-dev-flow', 'state', key);
}

function currentPolicy(root) {
  const d = readJson(path.join(policyDir(root), 'policy.json'));
  return TA.resolvePolicy({
    override: {
      auto_commit: overrideRaw(root, 'Auto Commit'),
      goal_publish: overrideRaw(root, 'Goal Publish'),
      base_branch: overrideRaw(root, 'Base Branch'),
      jira_project: overrideRaw(root, 'Jira Project'),
    },
    decision: d && d.policy === TA.POLICY_ID && ['adopted', 'declined'].includes(d.decision) ? d.decision : null,
  });
}

function emit(obj, format, factLine) {
  process.stdout.write(format === 'json' ? `${JSON.stringify(obj)}\n` : `${factLine(obj)}\n`);
}

function policyCmd(format) {
  const p = currentPolicy(repoRoot());
  emit(p, format, (r) => `[POLICY] auto_commit=${r.auto_commit} goal_publish=${r.goal_publish} base=${r.base_branch} source=${r.source} adoption=${r.adoption}`);
}

// The user's one-time answer to the adoption question, or their explicit request to switch. Written
// only on that answer; never asked again either way. `--if-pending` is the installer's form: it
// records nothing when a decision already exists, so a fresh install never overrides an answer the
// user gave — a `declined` above all.
function policyDecide(decision, ifPending) {
  if (!['adopted', 'declined'].includes(decision)) die(`invalid decision "${decision}" — valid: adopted, declined`);
  const root = repoRoot();
  const dir = policyDir(root);
  const prev = readJson(path.join(dir, 'policy.json'));
  if (ifPending && prev && prev.policy === TA.POLICY_ID && ['adopted', 'declined'].includes(prev.decision)) {
    process.stdout.write(`[POLICY_KEPT] ${prev.decision}\n`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'policy.json'), `${JSON.stringify({ policy: TA.POLICY_ID, decision, time: new Date().toISOString() })}\n`);
  process.stdout.write(`[POLICY_DECIDED] ${decision}\n`);
}

const taskFile = (root) => path.join(stateDir(root), 'task.json');
function loadTask(root) {
  const t = readJson(taskFile(root));
  return t && typeof t.id === 'string' && Array.isArray(t.head_chain) && Array.isArray(t.owned) && t.baseline ? t : null;
}
function saveTask(root, t) {
  fs.mkdirSync(stateDir(root), { recursive: true });
  fs.writeFileSync(taskFile(root), `${JSON.stringify(t)}\n`);
}
function archiveTask(root, t) {
  fs.appendFileSync(path.join(stateDir(root), 'task-history.jsonl'), `${JSON.stringify(t)}\n`);
}

const statusEntries = (root) => {
  const s = gitOut(root, ['status', '--porcelain=v2', '-z', '--untracked-files=all']);
  return s === null ? null : TA.parseStatus(s);
};
const headOid = (root) => { const h = gitOut(root, ['rev-parse', '--verify', '-q', 'HEAD']); return h ? h.trim() : null; };
const currentBranch = (root) => { const h = gitOut(root, ['symbolic-ref', '--short', '-q', 'HEAD']); return h && h.trim() ? h.trim() : null; };

function taskStart(intent, supersede) {
  const root = repoRoot();
  const prev = loadTask(root);
  if (prev && prev.status === 'active') {
    if (!supersede) {
      process.stdout.write(`${JSON.stringify({ ok: false, reason: 'active-task', task: prev })}\n`);
      return;
    }
    archiveTask(root, { ...prev, status: 'superseded', ended_at: new Date().toISOString() });
  }
  const entries = statusEntries(root);
  if (entries === null) die('git status failed — the task baseline cannot be read');
  const head = headOid(root);
  const t = {
    id: TA.newTaskId(),
    status: 'active',
    intent: String(intent || '').slice(0, 300),
    started_at: new Date().toISOString(),
    branch: currentBranch(root),
    base: null,
    baseline: { head, clean: entries.length === 0, entries: entries.map((e) => ({ path: e.path, kind: e.kind, staged: e.staged })) },
    head_chain: [head],
    owned: [],
    commits: [],
    jira: { state: 'unchecked' },
    publish: {},
  };
  saveTask(root, t);
  process.stdout.write(`${JSON.stringify({ ok: true, task: t })}\n`);
}

function requireTask(root) {
  const t = loadTask(root);
  if (!t || t.status !== 'active') die('no active task — run `task start` first');
  return t;
}

function taskShow() {
  const root = repoRoot();
  process.stdout.write(`${JSON.stringify({ task: loadTask(root) })}\n`);
}

function taskEnd(status) {
  if (!['completed', 'cancelled', 'superseded'].includes(status)) die(`invalid status "${status}" — valid: completed, cancelled, superseded`);
  const root = repoRoot();
  const t = requireTask(root);
  const done = { ...t, status, ended_at: new Date().toISOString() };
  archiveTask(root, done);
  saveTask(root, done);
  process.stdout.write(`[TASK_ENDED] ${t.id} ${status}\n`);
}

// The task's own declaration of the paths it changed. Repo-relative, inside the work tree only.
function taskOwn(paths) {
  const root = repoRoot();
  const t = requireTask(root);
  for (const p of paths) {
    if (!p || path.isAbsolute(p) || p.split('/').includes('..')) die(`invalid path "${p}" — repo-relative paths only`);
  }
  t.owned = [...new Set([...t.owned, ...paths])];
  saveTask(root, t);
  process.stdout.write(`${JSON.stringify({ ok: true, owned: t.owned })}\n`);
}

const JIRA_STATES = ['unavailable', 'prompted', 'declined', 'existing', 'created', 'unknown', 'failed'];
function taskJira(state, opts) {
  if (!JIRA_STATES.includes(state)) die(`invalid jira state "${state}" — valid: ${JIRA_STATES.join(', ')}`);
  if (opts.key && !/^[A-Z][A-Z0-9_]+-\d+$/.test(opts.key)) die(`invalid issue key "${opts.key}"`);
  const root = repoRoot();
  const t = requireTask(root);
  t.jira = { state, key: opts.key || t.jira.key || null, plan_hash: opts['plan-hash'] || t.jira.plan_hash || null, token: opts.token || t.jira.token || null, time: new Date().toISOString() };
  saveTask(root, t);
  process.stdout.write(`${JSON.stringify({ ok: true, jira: t.jira })}\n`);
}

// The task branch: from the freshly fetched base (main unless the project names another), never from
// a stale ref, never carrying a dirty tree across bases, never tracking the base.
function taskBranch(name, baseArg) {
  const root = repoRoot();
  const t = requireTask(root);
  const pol = currentPolicy(root);
  const base = baseArg || pol.base_branch;
  const out = (o) => { process.stdout.write(`${JSON.stringify(o)}\n`); };
  if (!TA.validBranch(name)) die(`invalid branch name "${name}"`);
  if (!TA.validBranch(base)) die(`invalid base "${base}"`);
  const cur = currentBranch(root);
  if (cur === name) {
    t.branch = name;
    // A reused branch still has a PR target: the resolved base NAME (`--base`, `## Base Branch`, else
    // main), which /create-pr's Goal publish requires. No OID is invented for it — a destination
    // that lacks this branch then has no proven base to publish from, and the publish check refuses.
    if (!t.base) t.base = { name: base, oid: null, reused: true };
    saveTask(root, t);
    return out({ ok: true, reused: true, branch: name, base: t.base });
  }
  const entries = statusEntries(root);
  if (entries === null) die('git status failed');
  if (entries.length) return out({ ok: false, reason: 'dirty', paths: entries.map((e) => e.path) });
  if (gitOut(root, ['show-ref', '--verify', '-q', `refs/heads/${name}`]) !== null) return out({ ok: false, reason: 'exists', branch: name });
  if (gitOut(root, ['fetch', '--quiet', 'origin', `refs/heads/${base}:refs/remotes/origin/${base}`]) === null) {
    return out({ ok: false, reason: 'fetch-failed', base });
  }
  const oid = gitOut(root, ['rev-parse', '--verify', '-q', `refs/remotes/origin/${base}^{commit}`]);
  if (!oid) return out({ ok: false, reason: 'base-missing', base });
  if (gitOut(root, ['switch', '--quiet', '--no-track', '-c', name, oid.trim()]) === null) return out({ ok: false, reason: 'switch-failed', branch: name });
  t.branch = name;
  t.base = { name: base, oid: oid.trim(), fetched_at: new Date().toISOString() };
  // The start's eligibility is the task's, not the branch's: a task that started on a dirty or
  // staged tree never auto-commits, however tidy the tree is when its branch is cut.
  t.baseline = { ...t.baseline, head: oid.trim() };
  t.head_chain = [oid.trim()];
  saveTask(root, t);
  out({ ok: true, reused: false, branch: name, base: t.base });
}

function planesPassed(planes, contents) {
  return contents.flatMap((c) => PLANES_BY_CONTENT[c]).every((p) => planes[p].passed);
}

// Every commit in tip..head must be one a batch group could have made: one parent, touching only
// planned paths, each set to exactly the content the batch's check recorded (a deletion where it
// recorded none). Net-tree equality and ancestry alone cannot tell a group from a foreign commit
// that was later reverted, and Goal publish takes every OID this accepts as the task's own.
function batchCommitsPlanned(root, tip, head, planned) {
  if (!planned || typeof planned !== 'object') return false;
  const revs = gitOut(root, ['rev-list', '--parents', `${tip}..${head}`]);
  if (revs === null) return false;
  for (const line of revs.split('\n').filter(Boolean)) {
    const [c, ...parents] = line.split(' ');
    if (parents.length !== 1) return false;
    const d = gitOut(root, ['diff-tree', '-r', '-z', '--no-commit-id', '--no-renames', parents[0], c]);
    if (d === null) return false;
    const f = d.split('\0');
    for (let i = 0; i + 1 < f.length; i += 2) {
      if (!f[i].startsWith(':')) return false;
      const [, newMode, , newOid, status] = f[i].slice(1).split(' ');
      const p = f[i + 1];
      if (!Object.prototype.hasOwnProperty.call(planned, p)) return false;
      const want = planned[p];
      if (status === 'D' ? want !== null : want !== `${newMode} ${newOid}`) return false;
    }
  }
  return true;
}

function commitCheckCmd(format) {
  const { planes, root, tree } = computeCheck({ withEntries: true });
  const task = loadTask(root);
  const entries = statusEntries(root);
  if (entries === null) die('git status failed');
  const branch = currentBranch(root);
  const dirty = ['code', 'doc'].filter((p) => tree.planes[p].partial || tree.planes[p].dirty.length > 0);
  const digest = combinedDigest(tree);
  const head = headOid(root);
  const tip = task ? task.head_chain[task.head_chain.length - 1] : null;
  const batch = task && task.last_check && head && tip && head !== tip
    ? {
      descends: gitOut(root, ['merge-base', '--is-ancestor', tip, head]) !== null,
      commitsPlanned: batchCommitsPlanned(root, tip, head, task.last_check.planned),
    } : null;
  const r = TA.commitCheck({
    task, policy: currentPolicy(root), branch, protectedStatus: branch ? protectedStatus(root, branch) : 2,
    head, entries, gatesPassed: planesPassed(planes, dirty), digest, batch,
  });
  const result = { ...r, task_id: task ? task.id : null, branch, digest };
  if (r.ok) {
    // The digest the gates passed at, from the same single tree read — nothing is read after it.
    // `task committed` requires the committed tree to digest to exactly this, so a write during or
    // after the check, an added or deleted path or a mode change cannot ride on this pass.
    // A check inside an open batch keeps the batch's own record: its digest and planned candidates
    // are what every later group, and `task committed`, are held to.
    if (!batch) {
      // tree-digest keys its entries by raw path bytes held as latin1 strings; status paths here are
      // UTF-8 strings, so the lookup converts (a miss would read as a planned deletion — fail-closed).
      const planned = Object.fromEntries(r.candidate.map((p) => {
        const e = tree.entries && tree.entries.get(Buffer.from(p, 'utf8').toString('latin1'));
        return [p, e ? `${e.mode} ${e.oid}` : null];
      }));
      task.last_check = { digest, candidate: r.candidate, planned, time: new Date().toISOString() };
      saveTask(root, task);
    }
  }
  emit(result, format, (o) => `[AUTO_COMMIT_CHECK] ok=${o.ok} reasons=${o.reasons.join(',') || 'none'} branch=${o.branch || '-'} candidates=${o.candidate.length}`);
}

// After the auto commit: the commits must sit on top of the task's tip, the work tree must be clean
// (nothing was left out), and the final committed tree — every path, mode and object — must digest
// to exactly what the gates passed at. Grouped commits are fine; only their final tree is verified.
// A mismatch marks the task unverified — the commit stays local, and goal publish refuses it.
function taskCommitted() {
  const root = repoRoot();
  const t = requireTask(root);
  const head = headOid(root);
  const tip = t.head_chain[t.head_chain.length - 1];
  const out = (o) => { process.stdout.write(`${JSON.stringify(o)}\n`); };
  if (!t.last_check) return out({ ok: false, reason: 'no-check' });
  if (head === tip) return out({ ok: false, reason: 'no-new-commit' });
  if (gitOut(root, ['merge-base', '--is-ancestor', tip, head]) === null) return out({ ok: false, reason: 'not-descendant' });
  const entries = statusEntries(root);
  const problems = [];
  if (entries === null || entries.length) problems.push('not-clean');
  if (!batchCommitsPlanned(root, tip, head, t.last_check.planned)) problems.push('foreign-commit');
  const at = digestOfRev(root, head);
  if (!at) problems.push('tree-unreadable');
  else if (combinedDigest({ planes: { code: { digest: at.code }, doc: { digest: at.doc } } }) !== t.last_check.digest) problems.push('tree-mismatch');
  const range = gitOut(root, ['rev-list', '--reverse', `${tip}..${head}`]);
  const oids = range ? range.split('\n').filter(Boolean) : [];
  t.commits = [...t.commits, ...oids];
  t.head_chain = [...t.head_chain, head];
  t.unverified = problems.length > 0 || Boolean(t.unverified);
  t.verified_digest = problems.length ? null : t.last_check.digest;
  delete t.last_check;
  saveTask(root, t);
  out({ ok: problems.length === 0, problems, commits: oids, head });
}

// What the push would publish: the commits of `head` the DESTINATION does not already hold. The
// destination is `origin`'s push URL (exactly one, as push-ci Phase 0 requires), read live with
// ls-remote — never the cached `refs/remotes/origin/<branch>`, which can be stale or name another
// repository than the push goes to. Its tip must be a local ancestor of `head`; a branch the
// destination lacks publishes from the task's fetched base. Anything unresolvable → null (refuse).
function publishAhead(root, branch, task, head) {
  const urls = gitOut(root, ['remote', 'get-url', '--push', '--all', 'origin']);
  const list = urls ? urls.split('\n').filter(Boolean) : [];
  if (list.length !== 1) return null;
  // The URL above already went through one `url.*.insteadOf` pass; handing it to ls-remote applies
  // another. A chained rule would make this read a repository the push never contacts, so the
  // expansion must be the identity (push-ci Phase 2's second-rewrite refusal, same detector).
  const again = gitOut(root, ['ls-remote', '--get-url', '--', list[0]]);
  if (again === null || again.trim() !== list[0]) return null;
  const adv = gitOut(root, ['ls-remote', '--upload-pack=git-upload-pack', '--', list[0], `refs/heads/${branch}`]);
  if (adv === null) return null;
  const tipOf = (text, ref) => {
    const l = text.split('\n').find((x) => x.endsWith(`\t${ref}`));
    return l ? l.split('\t')[0] : null;
  };
  const remoteTip = tipOf(adv, `refs/heads/${branch}`);
  // A branch the destination lacks publishes from the task's base only if the DESTINATION already
  // holds that base: its base branch's live tip must be a commit we have, with the base in its
  // history. An empty or unrelated destination would otherwise receive history no check counted.
  if (!remoteTip) {
    if (!task || !task.base || !TA.validBranch(task.base.name)) return null;
    const advBase = gitOut(root, ['ls-remote', '--upload-pack=git-upload-pack', '--', list[0], `refs/heads/${task.base.name}`]);
    const destBase = advBase === null ? null : tipOf(advBase, `refs/heads/${task.base.name}`);
    if (!destBase || gitOut(root, ['cat-file', '-e', `${destBase}^{commit}`]) === null) return null;
    if (gitOut(root, ['merge-base', '--is-ancestor', task.base.oid, destBase]) === null) return null;
  }
  const from = remoteTip || (task && task.base ? task.base.oid : null);
  if (!from || !/^[0-9a-f]{40,64}$/.test(from)) return null;
  if (gitOut(root, ['merge-base', '--is-ancestor', from, head]) === null) return null;
  const oids = gitOut(root, ['rev-list', `${from}..${head}`]);
  const names = gitOut(root, ['log', '--format=', '--name-only', '--no-renames', '--diff-merges=first-parent', '-z', `${from}..${head}`]);
  if (names === null || oids === null) return null;
  const list2 = oids.split('\n').filter(Boolean);
  return {
    commits: list2.length,
    oids: list2,
    files: [...new Set(names.split('\0').map((n) => n.replace(/^\n+/, '')).filter(Boolean))],
    remoteTip,
    // The destination's identity as push-ci Phase 0 digests it (SHA-256 of the raw URL), so the push
    // can be bound to the destination this check counted against.
    destDigest: crypto.createHash('sha256').update(list[0]).digest('hex'),
  };
}

function goalPublish(format) {
  const { planes, root, tree } = computeCheck();
  const task = loadTask(root);
  const entries = statusEntries(root) || [{ path: '(status failed)' }];
  const branch = currentBranch(root);
  // One HEAD for the whole check and its answer: the push must then be bound to exactly this OID.
  const head = headOid(root);
  const ahead = branch && head ? publishAhead(root, branch, task, head) : null;
  const contents = ahead ? [...new Set(ahead.files.map(planeOf))] : [];
  const r = TA.publishCheck({
    task, policy: currentPolicy(root), branch, protectedStatus: branch ? protectedStatus(root, branch) : 2,
    head, entries, ahead: ahead ? ahead.commits : null, aheadOids: ahead ? ahead.oids : [], aheadGates: planesPassed(planes, contents),
    digest: combinedDigest(tree),
  });
  const result = { ...r, task_id: task ? task.id : null, branch, head, remote_tip: ahead ? ahead.remoteTip : null, dest_digest: ahead ? ahead.destDigest : null, base: task ? task.base : null, ahead: ahead ? ahead.commits : null };
  emit(result, format, (o) => `[GOAL_PUBLISH_CHECK] ok=${o.ok} reasons=${o.reasons.join(',') || 'none'} branch=${o.branch || '-'} ahead=${o.ahead === null ? '?' : o.ahead}`);
}

// Delivery facts the publish steps read back: pushed OID, the PR's base OID at this flow's last create
// or update (what CI is judged against), PR number and URL, the hash of the PR body
// this flow last wrote (so a hand-edited body is never overwritten), the CI verdict. Facts only.
const PUBLISH_FIELDS = { pushed: /^[0-9a-f]{40,64}$/, 'pr-base': /^[0-9a-f]{40,64}$/, pr: /^\d+$/, 'pr-url': /^https:\/\/\S+$/, 'pr-body-sha': /^[0-9a-f]{64}$/, ci: /^(pass|pending|fail|skipped|none|unknown|stale)$/, delivery: /^(pushed|pr-open|ci-pass|blocked|partial)$/ };
function taskRecord(opts) {
  const root = repoRoot();
  const t = requireTask(root);
  const forHead = opts.for;
  delete opts.for;
  for (const [k, v] of Object.entries(opts)) {
    if (!PUBLISH_FIELDS[k]) die(`unknown field --${k} — valid: ${Object.keys(PUBLISH_FIELDS).map((f) => `--${f}`).join(', ')}, --for`);
    if (!PUBLISH_FIELDS[k].test(v)) die(`invalid value for --${k}`);
  }
  // The PR base is the base the run for ONE head is judged against, so it is read immediately before
  // the event that triggers that run (the push, or the PR create) and bound to that head with --for.
  // It is recorded once per head: a later metadata update can never re-label an old run as evidence
  // about a newer base, and a base that moves after the trigger reads `stale` at readback.
  if (opts['pr-base'] !== undefined) {
    if (!forHead || !/^[0-9a-f]{40,64}$/.test(forHead)) die('--pr-base needs --for <the head OID whose run it is the base of>');
    if (t.publish['pr-base-for'] === forHead && t.publish['pr-base'] !== opts['pr-base']) {
      die('pr-base is already recorded for this head — it is read before the trigger and never re-recorded');
    }
  } else if (forHead !== undefined) die('--for only goes with --pr-base');
  for (const [k, v] of Object.entries(opts)) t.publish[k] = v;
  if (opts['pr-base'] !== undefined) t.publish['pr-base-for'] = forHead;
  t.publish.time = new Date().toISOString();
  saveTask(root, t);
  process.stdout.write(`${JSON.stringify({ ok: true, publish: t.publish })}\n`);
}

function parseOpts(args) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && !args[i].startsWith('--format=')) {
      const key = args[i].slice(2);
      if (['supersede'].includes(key)) opts[key] = true;
      else {
        if (i + 1 >= args.length) die(`--${key} needs a value`);
        opts[key] = args[++i];
      }
    } else if (!args[i].startsWith('--format=')) rest.push(args[i]);
  }
  return { opts, rest };
}

// --- Custom-flow detection (git-autonomy R6) ----------------------------------------------------
// When a project releases its own way and has no git override, the model may ask once whether to
// scaffold one (rules/git-workflow.md § Proactive Offer, "Custom flow"). A fact, never an action:
// nothing here writes the override.

const DEFAULT_BRANCH_NAMING = /^(?:feat|fix|docs|refactor)\/./;
const CI_FILES = ['.gitlab-ci.yml', '.circleci/config.yml', 'Jenkinsfile', 'azure-pipelines.yml', 'bitbucket-pipelines.yml'];
const TRIGGER_RE = /\bgh\s+workflow\s+run\b|\/dispatches\b|circleci\.com\/api\/v2\/project\/[^\s]*\/pipeline|\/trigger\/pipeline\b|\/job\/[^\s]*\/build(?:WithParameters)?\b/;

function readSmall(file) {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > 256 * 1024) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function listFiles(root, rel, depth = 3) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const r = path.join(rel, e.name);
    if (e.isDirectory() && depth > 0 && e.name !== 'node_modules' && !e.name.startsWith('.')) out.push(...listFiles(root, r, depth - 1));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

// A merge's target is the branch checked out last before it — `git switch|checkout` earlier in the
// same file, however far back, or a CI `actions/checkout` step's `ref:`. The merge's own argument is
// the SOURCE and never counts. Git's global options are skipped before the subcommand is read, so
// `git -c merge.ff=false merge x` is a merge.
const GIT_OPT_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);
const SWITCH_OPT_WITH_TARGET = new Set(['-c', '-C', '-b', '-B', '--create', '--force-create', '--orphan']);
// Shell-style words: quotes group and are removed, so `"release/2026"` is the word release/2026; a
// word records whether any part of it was quoted. Only an unquoted `git` word starts a command, so
// `echo "git merge x"` is one quoted word of data.
function shellWords(stmt) {
  const words = [];
  let cur = null;
  let quote = null;
  const push = () => { if (cur !== null) words.push(cur); cur = null; };
  for (let i = 0; i < stmt.length; i++) {
    const ch = stmt[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < stmt.length) cur.text += stmt[++i];
      else cur.text += ch;
    } else if (ch === '"' || ch === "'") {
      if (cur === null) cur = { text: '', quoted: false };
      cur.quoted = true;
      quote = ch;
    } else if (/\s/.test(ch)) push();
    else {
      if (cur === null) cur = { text: '', quoted: false };
      cur.text += ch;
    }
  }
  push();
  return words;
}
function gitCommand(stmt) {
  const words = shellWords(stmt);
  const g = words.findIndex((w) => !w.quoted && (w.text === 'git' || w.text.endsWith('/git')));
  if (g === -1) return null;
  const tokens = words.slice(g + 1).map((w) => w.text);
  let k = 0;
  while (k < tokens.length && tokens[k].startsWith('-')) {
    k += GIT_OPT_WITH_VALUE.has(tokens[k]) ? 2 : 1;
  }
  if (k >= tokens.length) return null;
  return { sub: tokens[k], args: tokens.slice(k + 1) };
}
function checkoutTarget(args) {
  for (let k = 0; k < args.length; k++) {
    if (SWITCH_OPT_WITH_TARGET.has(args[k])) return args[k + 1] || null;
    if (args[k] === '--') return args[k + 1] || null;
    if (!args[k].startsWith('-')) return args[k];
  }
  return null;
}
// A CI checkout step sets the target too: `uses: actions/checkout` followed, inside that step, by
// `ref: <branch>` (the action's input for the branch, tag or SHA to check out).
const CI_CHECKOUT_RE = /^\s*-?\s*uses:\s*['"]?actions\/checkout\b/;
const CI_REF_RE = /^\s*ref:\s*['"]?([^\s'"#]+)/;
function isProtectedName(name) {
  return DEFAULT_PROTECTED.some((p) => (p.endsWith('/*') ? name.startsWith(p.slice(0, -1)) : name === p));
}
function mergesIntoProtected(text) {
  let target = null;
  let inCheckout = false;
  for (const raw of text.split('\n')) {
    if (/^\s*(?:#|\/\/)/.test(raw)) continue;
    if (CI_CHECKOUT_RE.test(raw)) { inCheckout = true; continue; }
    if (/^\s*-\s/.test(raw)) inCheckout = false; // the next step begins
    if (inCheckout) {
      const r = CI_REF_RE.exec(raw);
      if (r) { target = r[1]; continue; }
    }
    for (const stmt of raw.replace(/^\s*-?\s*run:\s*/, '').split(/;|&&|\|\|/)) {
      const c = gitCommand(stmt);
      if (!c) continue;
      if (c.sub === 'switch' || c.sub === 'checkout') {
        const t = checkoutTarget(c.args);
        if (t) target = t;
      } else if (c.sub === 'merge' && target !== null && isProtectedName(target)) return true;
    }
  }
  return false;
}

function flowSignals(root, branch) {
  const signals = [];
  const candidates = [
    ...listFiles(root, 'scripts'),
    ...listFiles(root, path.join('.github', 'workflows'), 0),
    ...CI_FILES,
  ];
  for (const rel of candidates) {
    const text = readSmall(path.join(root, rel));
    if (text === null) continue;
    if (mergesIntoProtected(text)) {
      signals.push({ signal: 'merge-script', file: rel });
    } else if (rel.startsWith('scripts') && TRIGGER_RE.test(text)) {
      signals.push({ signal: 'pipeline-trigger', file: rel });
    }
  }
  if (branch && protectedStatus(root, branch) === 1 && !DEFAULT_BRANCH_NAMING.test(branch)) {
    signals.push({ signal: 'branch-name', branch });
  }
  return signals;
}

// State is one file per fact, each created atomically: `flow-never` for the repo-wide dismissal,
// `flow-sessions/<id>` for "this session was told". Exclusive creation is the check and the mark in
// one step, so two Stop hooks racing cannot both print, and neither can erase the other's record.
function flowNever(dir) {
  try { fs.lstatSync(path.join(dir, 'flow-never')); return true; } catch { return false; }
}
function markSession(dir, session) {
  fs.mkdirSync(path.join(dir, 'flow-sessions'), { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, 'flow-sessions', session), new Date().toISOString(), { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}
function sessionMarked(dir, session) {
  try { fs.lstatSync(path.join(dir, 'flow-sessions', session)); return true; } catch { return false; }
}

// `session` is the Claude Code session id the Stop hook passes; with it the reminder is printed
// at most once per session, which is recorded when it prints. Without it (a direct call) the answer
// is never session-gated.
const SESSION_RE = /^[A-Za-z0-9._-]{1,128}$/;

function flowDetect(format, session) {
  if (session !== undefined && !SESSION_RE.test(session)) die(`invalid session id "${session}"`);
  const root = repoRoot();
  const dir = stateDir(root);
  const head = gitOut(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  const branch = head && head.trim() ? head.trim() : null;
  const out = (ask, reason, signals = []) => ({ ask, reason, signals });
  let r;
  const hasOverride = ['.claude/rules/git-workflow-project.md', 'rules/git-workflow-project.md']
    .some((f) => { try { fs.lstatSync(path.join(root, f)); return true; } catch { return false; } });
  if (hasOverride) r = out(false, 'override-present');
  else if (flowNever(dir)) r = out(false, 'dismissed');
  else if (session !== undefined && sessionMarked(dir, session)) r = out(false, 'shown-this-session');
  else {
    const signals = flowSignals(root, branch);
    r = signals.length ? out(true, null, signals) : out(false, 'no-signal');
  }
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(r)}\n`);
    return;
  }
  if (format === 'md') {
    if (!r.ask) return;
    // Print only if this call is the one that marked the session: a concurrent Stop hook that got
    // there first has already printed it.
    if (session !== undefined && !markSession(dir, session)) return;
    process.stdout.write(`🧭 偵測到自訂 git 流程（${r.signals.map((x) => x.signal).join(', ')}）且沒有 git-workflow-project.md → 用 AskUserQuestion 問一次是否建立（規則見 rules/git-workflow.md § Proactive Offer）\n`);
    return;
  }
  process.stdout.write(`[FLOW] ask=${r.ask} reason=${r.reason || 'none'} signals=${r.signals.map((s) => s.signal).join(',') || 'none'}\n`);
}

function flowAnswer(answer) {
  if (answer !== 'never') die(`invalid answer "${answer}" — valid: never`);
  const root = repoRoot();
  const dir = stateDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'flow-never'), new Date().toISOString());
  process.stdout.write(`[FLOW_RECORDED] ${answer}\n`);
}

const [, , cmd, ...args] = process.argv;
try {
  if (cmd === 'note') {
    note(args[0], args[1]);
  } else if (cmd === 'check') {
    const fmt = (args.find(a => a.startsWith('--format=')) || '--format=md').slice('--format='.length);
    if (!['md', 'fact', 'json'].includes(fmt)) die(`unknown format "${fmt}" — valid: md, fact, json`);
    check(fmt);
  } else if (cmd === 'offer') {
    const fmt = (args.find(a => a.startsWith('--format=')) || '--format=fact').slice('--format='.length);
    if (!['md', 'fact', 'json'].includes(fmt)) die(`unknown format "${fmt}" — valid: md, fact, json`);
    const unknown = args.filter((a) => !a.startsWith('--format=') && a !== '--deferred');
    if (unknown.length) die(`unknown argument "${unknown[0]}" — valid: --format=<md|fact|json>, --deferred`);
    offer(fmt, { deferred: args.includes('--deferred') });
  } else if (cmd === 'offer-shown') {
    const rest = args.filter((a) => a !== '--deferred');
    if (rest.length !== 1) die('usage: offer-shown [--deferred] <digest>');
    offerShown(rest[0], args.includes('--deferred'));
  } else if (cmd === 'goal-commit') {
    const fmt = (args.find(a => a.startsWith('--format=')) || '--format=fact').slice('--format='.length);
    if (!['fact', 'json'].includes(fmt)) die(`unknown format "${fmt}" — valid: fact, json`);
    goalCommit(fmt);
  } else if (cmd === 'policy') {
    const fmt = (args.find(a => a.startsWith('--format=')) || '--format=fact').slice('--format='.length);
    if (!['fact', 'json'].includes(fmt)) die(`unknown format "${fmt}" — valid: fact, json`);
    policyCmd(fmt);
  } else if (cmd === 'policy-decide') {
    const rest = args.filter((a) => a !== '--if-pending');
    if (rest.length !== 1) die('usage: policy-decide [--if-pending] <adopted|declined>');
    policyDecide(rest[0], args.includes('--if-pending'));
  } else if (cmd === 'task') {
    const [sub, ...rest] = args;
    const fmt = (rest.find(a => a.startsWith('--format=')) || '--format=json').slice('--format='.length);
    if (!['fact', 'json'].includes(fmt)) die(`unknown format "${fmt}" — valid: fact, json`);
    const { opts, rest: pos } = parseOpts(rest);
    if (sub === 'start') taskStart(opts.intent, Boolean(opts.supersede));
    else if (sub === 'show') taskShow();
    else if (sub === 'end') taskEnd(pos[0]);
    else if (sub === 'own') { if (!pos.length) die('usage: task own <path>...'); taskOwn(pos); }
    else if (sub === 'jira') taskJira(pos[0], opts);
    else if (sub === 'branch') taskBranch(pos[0], opts.base);
    else if (sub === 'commit-check') commitCheckCmd(fmt);
    else if (sub === 'committed') taskCommitted();
    else if (sub === 'record') taskRecord(opts);
    else die('usage: task start --intent <text> [--supersede] | show | end <completed|cancelled|superseded> | own <path>... | jira <state> [--key K] [--plan-hash H] [--token T] | branch <name> [--base <b>] | commit-check [--format=json|fact] | committed | record [--pushed OID] [--pr-base OID] [--pr N] [--pr-url URL] [--pr-body-sha HEX] [--ci STATE] [--delivery STATE]');
  } else if (cmd === 'goal-publish') {
    const fmt = (args.find(a => a.startsWith('--format=')) || '--format=fact').slice('--format='.length);
    if (!['fact', 'json'].includes(fmt)) die(`unknown format "${fmt}" — valid: fact, json`);
    goalPublish(fmt);
  } else if (cmd === 'flow-detect') {
    const fmt = (args.find(a => a.startsWith('--format=')) || '--format=fact').slice('--format='.length);
    if (!['fact', 'json', 'md'].includes(fmt)) die(`unknown format "${fmt}" — valid: fact, json, md`);
    const si = args.indexOf('--session');
    flowDetect(fmt, si === -1 ? undefined : args[si + 1]);
  } else if (cmd === 'flow-answer') {
    flowAnswer(args[0]);
  } else {
    die(`usage: review-state.js note <plane> <pass|fail> | check [--format=md|fact|json] | offer [--format=md|fact|json] | offer-shown <digest> | goal-commit [--format=fact|json] | policy [--format=fact|json] | policy-decide [--if-pending] <adopted|declined> | task <sub> | goal-publish [--format=fact|json] | flow-detect [--format=fact|json|md] [--session <id>] | flow-answer never`);
  }
} catch (e) {
  die(String((e && e.message) || e));
}
