#!/usr/bin/env node
'use strict';

// TEMPORARY — rules-residency canary staging (tech spec tasks 8a–8c). Appends one record per
// completed change to an out-of-tree, append-only log, so recording never moves the tree digest
// and never reopens the gates it measures. Removed by task 8c's cleanup change. Protocol, schema
// and cohort rules: docs/features/rules-residency/2-tech-spec.md § 6.
//
//   scripts/dev/canary-stage.js record --change-id <id> --review-rounds <n> --scope-expansions <n>
//                          --deviations <n> [--contract <path>]... [--hard-incident <text>]...
//                          [--resident-tokens <n>]
//   scripts/dev/canary-stage.js count

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { measure } = require(path.join(__dirname, '..', 'instruction-budget.js'));

// The same repository root and <repo-key> state directory review-state.js resolves — copied rather
// than shared, because review-state.js is installed into consuming projects as a single file and
// this temporary tool must not change what that install carries. The test "record and
// review-state note → both land in the same per-repository state directory" is what keeps the two
// derivations from drifting apart.
function repoRoot() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { env }).toString('utf8').trim();
}

function stateDir(root) {
  const real = fs.realpathSync(root);
  const key = `${path.basename(real)}-${crypto.createHash('sha256').update(real).digest('hex').slice(0, 12)}`;
  return path.join(os.homedir(), '.cache', 'sd0x-dev-flow', 'state', key);
}

const LOG = 'canary-staging.jsonl';
const COHORT = 20;

function die(msg, code = 1) {
  process.stderr.write(`canary-stage: ${msg}\n`);
  process.exit(code);
}

const isCount = (v) => Number.isSafeInteger(v) && v >= 0;

// Digits alone are not enough: a long enough digit string parses to Infinity, which
// JSON.stringify writes as null — a record without its count.
function count(n, flag) {
  const v = /^\d+$/.test(n || '') ? Number(n) : NaN;
  if (!isCount(v)) die(`${flag} needs a non-negative safe integer, got "${n === undefined ? '' : n}"`, 2);
  return v;
}

function parseRecord(argv) {
  const o = { contracts: [], incidents: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) die(`${a} needs a value`, 2);
      return argv[++i];
    };
    if (a === '--change-id') o.changeId = val();
    else if (a === '--review-rounds') o.reviewRounds = count(val(), a);
    else if (a === '--scope-expansions') o.scopeExpansions = count(val(), a);
    else if (a === '--deviations') o.deviations = count(val(), a);
    else if (a === '--contract') o.contracts.push(val());
    else if (a === '--hard-incident') o.incidents.push(val());
    else if (a === '--resident-tokens') o.residentTokens = count(val(), a);
    else die(`unknown argument "${a}"`, 2);
  }
  if (!o.changeId || !o.changeId.trim()) die('--change-id is required and must not be blank', 2);
  for (const [k, flag] of [['reviewRounds', '--review-rounds'], ['scopeExpansions', '--scope-expansions'], ['deviations', '--deviations']]) {
    if (o[k] === undefined) die(`${flag} is required`, 2);
  }
  return o;
}

const isStrings = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');

// The whole shape this script writes, field for field. A line that is not exactly that — foreign
// JSON, a partial record, a blank line — means the log is not this script's, and counting or
// appending on top of it would report a cohort nobody can vouch for.
const FIELDS = ['date', 'change_id', 'review_rounds', 'scope_expansions', 'deviations',
  'contracts_activated', 'resident_chars', 'resident_tokens', 'hard_incidents'];

function isRecord(r) {
  return r !== null && typeof r === 'object' && !Array.isArray(r)
    && Object.keys(r).length === FIELDS.length && FIELDS.every((k) => Object.hasOwn(r, k))
    && typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date))
    && typeof r.change_id === 'string' && r.change_id.trim() !== ''
    && isCount(r.review_rounds) && isCount(r.scope_expansions) && isCount(r.deviations)
    && isStrings(r.contracts_activated) && isCount(r.resident_chars)
    && (r.resident_tokens === null || isCount(r.resident_tokens))
    && isStrings(r.hard_incidents);
}

function readLog(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  if (text === '') return [];
  // Every record ends with a newline. A last line without one is a partial write, and appending
  // after it would fuse the next record onto it — one unreadable line where two records were.
  if (!text.endsWith('\n')) throw new Error(`${file} does not end with a newline — its last record is incomplete; refusing to read further`);
  const lines = text.split('\n');
  lines.pop(); // the newline that ends the last record
  const seen = new Set();
  return lines.map((l, i) => {
    let r;
    try { r = JSON.parse(l); } catch { r = null; }
    if (!isRecord(r)) throw new Error(`${file}:${i + 1} is not a staging record — refusing to read further`);
    if (seen.has(r.change_id)) throw new Error(`${file}:${i + 1} stages change "${r.change_id}" a second time — refusing to read further`);
    seen.add(r.change_id);
    return r;
  });
}

// Serializes the duplicate check and the append across processes: without it two concurrent
// records for one change both read the log before either writes, and both append. The lock is an
// O_EXCL file; a holder that died leaves it behind, and that is reported rather than broken,
// because telling a dead holder from a slow one is the race the lock exists to avoid.
function withLock(dir, fn) {
  const lock = path.join(dir, `${LOG}.lock`);
  const timeout = Number(process.env.CANARY_LOCK_TIMEOUT_MS) || 5000;
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() > deadline) {
        throw new Error(`${lock} is held — another record is in progress; if no canary-stage process is running, remove the lock and retry`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// The dev checkout's always-loaded set, measured the way Claude Code accounts it, with an empty
// home so only this repository's own files count.
function residentChars(root) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'canary-home-'));
  try {
    return measure({ root, home, perFile: 150000, limit: 150000 }).total;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function record(argv) {
  const o = parseRecord(argv);
  const root = repoRoot();
  const dir = stateDir(root);
  const file = path.join(dir, LOG);
  const chars = residentChars(root);
  fs.mkdirSync(dir, { recursive: true });
  withLock(dir, () => {
    const existing = readLog(file);
    if (existing.some((r) => r.change_id === o.changeId)) throw new Error(`change "${o.changeId}" is already staged — one record per change`);
    const rec = {
      date: new Date().toISOString(),
      change_id: o.changeId,
      review_rounds: o.reviewRounds,
      scope_expansions: o.scopeExpansions,
      deviations: o.deviations,
      contracts_activated: o.contracts,
      resident_chars: chars,
      resident_tokens: o.residentTokens === undefined ? null : o.residentTokens,
      hard_incidents: o.incidents,
    };
    fs.appendFileSync(file, `${JSON.stringify(rec)}\n`);
    process.stdout.write(`[CANARY_STAGED] ${existing.length + 1}/${COHORT} ${JSON.stringify(rec)}\n`);
  });
}

function showCount() {
  const file = path.join(stateDir(repoRoot()), LOG);
  const n = readLog(file).length;
  process.stdout.write(`[CANARY_COUNT] ${n}/${COHORT} file=${file}\n`);
}

const [, , cmd, ...args] = process.argv;
try {
  if (cmd === 'record') record(args);
  else if (cmd === 'count' && args.length === 0) showCount();
  else die('usage: canary-stage.js record --change-id <id> --review-rounds <n> --scope-expansions <n> --deviations <n> [--contract <path>]... [--hard-incident <text>]... [--resident-tokens <n>] | count', 2);
} catch (e) {
  die(String((e && e.message) || e));
}
