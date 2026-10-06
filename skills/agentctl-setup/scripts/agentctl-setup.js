#!/usr/bin/env node
'use strict';

// Deterministic half of /agentctl-setup. Subcommands, each printing one JSON document:
//   doctor                  — can the agentctl mod run here, and is it installed?
//   status                  — one short line: installed/enabled, installed/disabled, not installed or unknown
//   task-line <options>     — the `/agentctl task set {...}` line, validated by the mod's own rules
//   propose --input <file>  — writes a task proposal the mod previews; the person accepts it
//   deny-rules --settings <path> [--rules a,b] [--write]
//                           — which recommended permissions.deny rules are missing; --write merges them
// The skill asks the questions; this script decides nothing a person has not chosen, and it never
// installs anything (installing is `claude plugin install`, run by the skill after approval).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const MIN_VERSION = [2, 1, 288];
const PLUGIN_ROOT = path.resolve(__dirname, '../../..');
const MOD_DIR = path.join(PLUGIN_ROOT, 'mods', 'agentctl');

// Named production writes worth a native deny rule as a second layer. `git push` is deliberately
// absent: /push-ci runs it, so denying it natively would break sd0x-dev-flow's own push workflow.
const RECOMMENDED_DENY = [
  'Bash(kubectl delete:*)',
  'Bash(kubectl rollout:*)',
  'Bash(kubectl apply:*)',
  'Bash(helm upgrade:*)',
  'Bash(helm uninstall:*)',
  'Bash(terraform apply:*)',
  'Bash(terraform destroy:*)',
];

function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(text || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function versionAtLeast(v, min) {
  if (!v) return false;
  for (let i = 0; i < 3; i++) {
    if (v[i] !== min[i]) return v[i] > min[i];
  }
  return true;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000 });
  return { ok: !r.error && r.status === 0, stdout: r.stdout || '', error: r.error ? r.error.code || String(r.error) : null };
}

function readJson(file) {
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return { exists: false, value: null };
    return { exists: true, value: null, error: err.code || 'invalid JSON' };
  }
}

// `disableAllHooks: true` in any settings layer turns user-installed mods off.
function hooksDisabledIn(files) {
  return files.filter((f) => readJson(f).value?.disableAllHooks === true);
}

// `claude plugin list --json` prints an array, or `{ installed, available }` with `--available`;
// entries carry `pluginId` (`name@marketplace`) and `name`. An entry this cannot read makes the answer
// "unknown" (null), never "not installed".
function findInstalled(parsed) {
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.installed) ? parsed.installed : null;
  if (!arr) return null;
  for (const p of arr) {
    const id = String(p?.pluginId ?? p?.id ?? p?.name ?? '');
    if (!id) return null;
    if (id.split('@')[0] === 'agentctl') return { id, enabled: p.enabled !== false };
  }
  return false;
}

function doctor({ cwd = process.cwd(), home = os.homedir(), claude = 'claude' } = {}) {
  const ver = run(claude, ['--version']);
  const version = ver.ok ? parseVersion(ver.stdout) : null;
  const git = run('git', ['--version']).ok;
  const settings = [
    path.join(home, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.local.json'),
  ];
  const list = run(claude, ['plugin', 'list', '--json']);
  let installed = null;
  if (list.ok) {
    try {
      installed = findInstalled(JSON.parse(list.stdout));
    } catch {
      installed = null;
    }
  }
  const disabledBy = hooksDisabledIn(settings);
  const problems = [];
  if (!version) problems.push('claude --version could not be read');
  else if (!versionAtLeast(version, MIN_VERSION)) problems.push(`Claude Code ${version.join('.')} is older than ${MIN_VERSION.join('.')}, the first version with mods`);
  if (!git) problems.push('git is not on PATH; evidence readings need it');
  if (!fs.existsSync(path.join(MOD_DIR, '.claude-plugin', 'plugin.json'))) problems.push(`the mod is missing at ${MOD_DIR}`);
  if (disabledBy.length) problems.push(`disableAllHooks is true in ${disabledBy.join(', ')}, which turns mods off`);
  return {
    ok: problems.length === 0,
    claudeVersion: version ? version.join('.') : null,
    git,
    modDir: MOD_DIR,
    installed, // false = not installed, null = could not tell
    disableAllHooksIn: disabledBy,
    problems,
  };
}

// Configuration, never activity: `claude plugin list` cannot say whether the mod runs in this
// session (a --plugin-dir load, a crashed worker). The mod's own preview is what shows it received
// a proposal.
function status({ claude = 'claude' } = {}) {
  const list = run(claude, ['plugin', 'list', '--json']);
  let installed = null;
  if (list.ok) {
    try { installed = findInstalled(JSON.parse(list.stdout)); } catch { installed = null; }
  }
  const state = installed === null ? 'unknown' : installed === false ? 'not installed' : installed.enabled ? 'installed/enabled' : 'installed/disabled';
  return { ok: true, state, line: `agentctl: ${state} (configuration only; not proof it runs in this session)` };
}

function splitList(value) {
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function argvOf(command) {
  const s = String(command || '').trim();
  if (!s) return null;
  if (/["'`$\\|;&<>()]/.test(s)) return { error: `"${s}" uses shell syntax; give a plain command such as "npm test"` };
  return s.split(/\s+/);
}

async function taskLine(opts, { cwd = process.cwd(), modDir = MOD_DIR } = {}) {
  const errors = [];
  const task = { goal: String(opts.goal || '').trim() };
  const edit = splitList(opts.edit);
  if (edit.length) {
    task.allow = ['edit'];
    task.editRoots = edit;
  }
  const executors = [];
  for (const c of splitList(opts.check)) {
    const a = argvOf(c);
    if (a?.error) errors.push(a.error);
    else if (a) executors.push({ argv: a, check: true });
  }
  if (executors.length) task.executors = executors;
  const needsUser = [];
  for (const c of splitList(opts['needs-user'])) {
    const a = argvOf(c);
    if (a?.error) errors.push(a.error);
    else if (a) needsUser.push(a);
  }
  if (needsUser.length) task.needsUser = needsUser;
  const forbid = splitList(opts.forbid);
  if (forbid.length) task.forbid = forbid;
  if (errors.length) return { ok: false, errors };
  // The mod's own validator and classifier: a line printed here is one the mod accepts, and every
  // command it names reaches the outcome the user chose — a check runs, a needs-user call asks.
  const { validateTask, classify } = await import(pathToFileURL(path.join(modDir, 'lib', 'policy.js')).href);
  const full = { ...task, worktree: path.resolve(cwd) };
  const v = validateTask(full);
  if (!v.ok) return { ok: false, errors: v.errors };
  for (const e of executors) {
    const c = classify(full, { tool: 'Bash', command: e.argv.join(' ') });
    // Under the deny-list an unclassified command also passes (to the host); a check must match as
    // an executor, or no evidence would be recorded for it.
    if (!c.executor) errors.push(`the mod would refuse "${e.argv.join(' ')}" (${c.rule}); give a plain command such as "npm test"`);
  }
  for (const n of needsUser) {
    const c = classify(full, { tool: 'Bash', command: n.join(' ') });
    if (c.outcome !== 'needs-user') errors.push(`"${n.join(' ')}" would not reach your approval (${c.rule})`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, line: `/agentctl task set ${JSON.stringify(task)}`, task };
}

// A proposal the mod will preview: the same validation as a task line, then the mod's own proposal
// reader, then one private file outside the worktree. Nothing is bound until the person types
// `/agentctl accept`.
async function propose(answers, { cwd = process.cwd(), home = os.homedir(), modDir = MOD_DIR } = {}) {
  const t = await taskLine(answers, { cwd, modDir });
  if (!t.ok) return t;
  const draft = { ...t.task };
  const tools = splitList(answers.tools);
  if (tools.length) draft.tools = tools;
  const acceptance = String(answers.acceptance || '').split('\n').map((x) => x.trim()).filter(Boolean);
  if (acceptance.length) draft.acceptance = acceptance;
  if (answers.base !== undefined) draft.base = answers.base === 'none' ? null : answers.base;
  const worktree = path.resolve(cwd);
  const text = JSON.stringify(draft, null, 2) + '\n';
  const { readProposal, previewLines, proposalPath } = await import(pathToFileURL(path.join(modDir, 'lib', 'proposal.js')).href);
  const r = readProposal(text, { cwd: worktree, boundId: draft.base ?? null });
  if (!r.ok) return { ok: false, errors: r.errors };
  const file = proposalPath(home, encodeURIComponent(worktree));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
  // The digest the mod will show is SHA-256 of the same canonical object — which includes the base.
  // Without an explicit base the mod fills in the task bound when it reads the file, which this
  // helper cannot see, so it names no digest: the mod's own preview is the one to accept.
  if (draft.base === undefined) {
    const preview = previewLines({ effective: r.effective, digest: '' })
      .filter((l) => !/^ {2}Replaces:|^ {2}Accept from your own prompt/.test(l))
      .map((l) => l.replace(/^Proposed task\s+—/, 'Proposed task —'));
    preview.push('  Replaces: whatever task is bound when the mod reads it; the mod\'s preview names it and its digest');
    return { ok: true, path: file, digest: null, preview };
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(r.effective)).digest('hex').slice(0, 24);
  return { ok: true, path: file, digest, preview: previewLines({ effective: r.effective, digest }) };
}

function denyRules({ settings, rules, write = false }) {
  if (!settings) return { ok: false, errors: ['--settings <path> is required'] };
  const chosen = rules ? splitList(rules) : RECOMMENDED_DENY;
  const unknown = chosen.filter((r) => !RECOMMENDED_DENY.includes(r));
  if (unknown.length) return { ok: false, errors: [`not a recommended rule: ${unknown.join(', ')}`] };
  const cur = readJson(settings);
  if (cur.exists && !cur.value) return { ok: false, errors: [`${settings} is not valid JSON (${cur.error}); it was not changed`] };
  const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  // An existing file must hold a JSON object: any other shape would be replaced, losing its contents.
  if (cur.exists && !isObject(cur.value)) return { ok: false, errors: [`${settings} does not hold a JSON object; it was not changed`] };
  const data = cur.exists ? cur.value : {};
  if (data.permissions !== undefined && !isObject(data.permissions)) {
    return { ok: false, errors: [`${settings} has a non-object "permissions"; it was not changed`] };
  }
  const deny = Array.isArray(data.permissions?.deny) ? data.permissions.deny : [];
  if (data.permissions?.deny !== undefined && !Array.isArray(data.permissions.deny)) {
    return { ok: false, errors: [`${settings} has a non-array "permissions.deny"; it was not changed`] };
  }
  const missing = chosen.filter((r) => !deny.includes(r));
  if (!write || missing.length === 0) return { ok: true, settings, present: chosen.filter((r) => deny.includes(r)), missing, written: false };
  const next = { ...data, permissions: { ...(data.permissions || {}), deny: [...deny, ...missing] } };
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  const tmp = `${settings}.agentctl-setup.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, settings);
  return { ok: true, settings, present: chosen.filter((r) => deny.includes(r)), missing, written: true };
}

// Free-text answers never pass through a shell: the skill writes them as JSON into a file this
// allocates (0600, in a fresh 0700 directory), and `task-line --input` reads it once and removes it.
const ANSWER_KEYS = ['goal', 'edit', 'check', 'forbid', 'needs-user', 'tools', 'acceptance', 'base'];

function allocAnswers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentctl-setup-'));
  const file = path.join(dir, 'answers.json');
  fs.writeFileSync(file, '{}\n', { mode: 0o600 });
  return { ok: true, input: file };
}

function readAnswers(file) {
  const dir = path.dirname(file);
  if (path.basename(file) !== 'answers.json' || !path.basename(dir).startsWith('agentctl-setup-') || path.dirname(dir) !== fs.realpathSync(os.tmpdir()) && path.dirname(dir) !== os.tmpdir()) {
    return { error: `--input must be a file allocated by "alloc"; got ${file}` };
  }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { error: `the answers file could not be read as JSON (${err.code || 'invalid JSON'})` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return parseAnswers(text);
}

// The same answers on stdin, for when a bound agentctl task refuses the Write to the alloc file
// (it lies outside the task's edit roots). The skill sends them through a quoted heredoc, which the
// shell passes literally.
function parseAnswers(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'the answers could not be read as JSON (invalid JSON)' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'the answers file must hold a JSON object' };
  const out = {};
  for (const k of ANSWER_KEYS) {
    if (parsed[k] === undefined) continue;
    if (typeof parsed[k] !== 'string') return { error: `answer "${k}" must be a string` };
    out[k] = parsed[k];
  }
  return { answers: out };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') out.write = true;
    else if (a === '--stdin') out.stdin = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  let result;
  if (sub === 'doctor') result = doctor();
  else if (sub === 'status') result = status();
  else if (sub === 'propose') {
    const r = args.input ? readAnswers(args.input) : args.stdin ? parseAnswers(fs.readFileSync(0, 'utf8')) : { error: 'propose needs --input <file from alloc> or --stdin' };
    result = r.error ? { ok: false, errors: [r.error] } : await propose(r.answers);
  }
  else if (sub === 'alloc') result = allocAnswers();
  else if (sub === 'task-line' && args.input) {
    const r = readAnswers(args.input);
    result = r.error ? { ok: false, errors: [r.error] } : await taskLine(r.answers);
  } else if (sub === 'task-line') result = await taskLine(args);
  else if (sub === 'deny-rules') result = denyRules({ settings: args.settings, rules: args.rules, write: args.write });
  else result = { ok: false, errors: ['usage: agentctl-setup.js doctor | status | alloc | propose --input <file from alloc> | propose --stdin | task-line --input <file from alloc> | task-line --goal <g> [--edit a,b] [--check "npm test"] [--forbid x,y] [--needs-user "npm publish"] | deny-rules --settings <path> [--rules a,b] [--write]'] };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result.ok ? 0 : 1;
}

module.exports = { doctor, status, propose, taskLine, denyRules, findInstalled, allocAnswers, readAnswers, parseVersion, versionAtLeast, RECOMMENDED_DENY, MOD_DIR };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    process.stdout.write(JSON.stringify({ ok: false, errors: [String(err && err.message ? err.message : err)] }) + '\n');
    process.exit(1);
  });
}
