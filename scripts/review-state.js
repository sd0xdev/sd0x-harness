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
const { computeTreeState, planeOf } = require(path.join(__dirname, 'lib', 'tree-digest.js'));

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

function computeCheck() {
  const root = repoRoot();
  const tree = computeTreeState(root);
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
    process.stdout.write(`[AUTO_LOOP_STATE] change=${change.length ? change.join(',') : 'none'} reviews=${reviews}${hintField} source=state\n`);
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
  const override = ['.claude/rules/git-workflow-project.md', 'rules/git-workflow-project.md']
    .some((f) => { try { fs.lstatSync(path.join(root, f)); return true; } catch { return false; } });
  if (override) return 2; // an override exists but nothing can read it
  return DEFAULT_PROTECTED.some((p) => (p.endsWith('/*') ? branch.startsWith(p.slice(0, -1)) : branch === p)) ? 0 : 1;
}

// A bare-value setting from the project's git override: the first live (non-comment) value line
// under `## <heading>`. Absent file, heading or value → the default; an unrecognised value also reads
// as the default (the /claude-health check #7 reports it) — these settings only ever narrow.
function overrideSetting(root, heading, allowed, dflt) {
  for (const f of ['.claude/rules/git-workflow-project.md', 'rules/git-workflow-project.md']) {
    let text;
    try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    const live = text.replace(/<!--[\s\S]*?-->/g, '');
    const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`^##[ \\t]+${esc}[ \\t]*$([\\s\\S]*?)(?=^##[ \\t]|(?![\\s\\S]))`, 'm').exec(live);
    if (!m) return dflt;
    const value = m[1].split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    return allowed.includes(value) ? value : dflt;
  }
  return dflt;
}
const offerMode = (root) => overrideSetting(root, 'Offer Mode', ['on', 'commit-only', 'off'], 'on');

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

function readShown(dir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'offer.json'), 'utf8'));
    return typeof j.digest === 'string' ? j.digest : null;
  } catch {
    return null;
  }
}

function computeOffer() {
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

  if (digest === null || readShown(stateDir(root)) === digest) return out(false, 'none', 'already-offered');

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

function offer(format) {
  const r = computeOffer();
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

function offerShown(digest) {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest || '')) die(`invalid digest "${digest}" — pass the digest the offer reported`);
  const root = repoRoot();
  const dir = stateDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'offer.json'), `${JSON.stringify({ digest, time: new Date().toISOString() })}\n`);
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
  else if (overrideSetting(root, 'Goal Commit', ['on', 'off'], 'on') === 'off') r = out(false, 'disabled');
  else if (dirty.flatMap((c) => PLANES_BY_CONTENT[c]).some((p) => !planes[p].passed)) r = out(false, 'gates-open');
  else r = out(true, null, { needs_branch_allowance: protectedStatus(root, branch) !== 1 });
  if (format === 'json') process.stdout.write(`${JSON.stringify(r)}\n`);
  else process.stdout.write(`[GOAL_COMMIT_CHECK] ok=${r.ok} reason=${r.reason || 'none'} branch=${r.branch || '-'} needs_branch_allowance=${r.needs_branch_allowance}\n`);
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
    offer(fmt);
  } else if (cmd === 'offer-shown') {
    offerShown(args[0]);
  } else if (cmd === 'goal-commit') {
    const fmt = (args.find(a => a.startsWith('--format=')) || '--format=fact').slice('--format='.length);
    if (!['fact', 'json'].includes(fmt)) die(`unknown format "${fmt}" — valid: fact, json`);
    goalCommit(fmt);
  } else if (cmd === 'flow-detect') {
    const fmt = (args.find(a => a.startsWith('--format=')) || '--format=fact').slice('--format='.length);
    if (!['fact', 'json', 'md'].includes(fmt)) die(`unknown format "${fmt}" — valid: fact, json, md`);
    const si = args.indexOf('--session');
    flowDetect(fmt, si === -1 ? undefined : args[si + 1]);
  } else if (cmd === 'flow-answer') {
    flowAnswer(args[0]);
  } else {
    die(`usage: review-state.js note <plane> <pass|fail> | check [--format=md|fact|json] | offer [--format=md|fact|json] | offer-shown <digest> | goal-commit [--format=fact|json] | flow-detect [--format=fact|json|md] [--session <id>] | flow-answer never`);
  }
} catch (e) {
  die(String((e && e.message) || e));
}
