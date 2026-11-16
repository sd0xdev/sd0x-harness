#!/usr/bin/env node
'use strict';

// CI readback for a delivered head (skills/push-ci/references/authorization-contract.md § Task
// autonomy, "Goal publish"). Pure classifier over facts the caller fetched with `gh`; it decides
// what the evidence says about THIS delivery and refuses to read anything else as a pass.
//
// Input (JSON on stdin):
//   pushed   the OID the push published (verified against the remote)
//   pr       `gh pr view <n> --json number,state,isDraft,headRefOid,baseRefOid`
//   base     the PR's base OID recorded when this flow last created or updated it (`task record
//            --pr-base`). Required for a pass: without it the merge tree the run tested is unknown
//   runs     `gh run list --branch <b> --json databaseId,headSha,event,status,conclusion,workflowName,url`
//   required `gh pr checks <n> --required --json name,bucket` — the branch-protection required
//            checks by their check (job) names, for the PR's current head (whose OID `pr` binds).
//            `[]` = none configured. Omitted = not read, which never passes
//   confirm  the `next_confirm` object a previous read returned (`{ ids, at }`); see confirmation()
//
// Output: `{ verdict, reasons, runs, next_confirm }` — `next_confirm` is what the next read passes
// as `confirm`.
//
// Interface facts this relies on, measured on github.com 2026-11-16 (PR #30, run 37662123230): a
// `pull_request` run's `headSha` is the PR head commit, not the merge commit the job checked out;
// `gh pr checks` carries no SHA at all, so runs — not checks — are what bind evidence to a commit.
// Because the job tested head MERGED WITH the base of that moment, a base that moved since the
// recorded one makes even a green run evidence about another tree: `stale`, never `pass`.

const PENDING = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
const FAILED = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale']);
const SKIPPED = new Set(['skipped', 'neutral']);
const EVENTS = new Set(['pull_request', 'push']);

const BUCKET = { pass: 'pass', fail: 'fail', pending: 'pending', skipping: 'skipped', cancel: 'fail' };
const MIN_GAP_MS = 60 * 1000;

// A pass needs two reads at least MIN_GAP_MS apart showing the same runs: a workflow that runs only
// on `pull_request` may not exist yet when an early `push` run has already finished, and one read
// cannot tell. Missing → pending (`unconfirmed`); under a minute → pending (`confirm-too-soon`);
// other runs → pending (`confirm-mismatch`); malformed, a bare id list or a time in the future →
// unknown (`confirm-invalid`). The gap is measured on this process's own clock — the CLI takes no
// `now` from its input, so a caller cannot shorten it.
function confirmation(confirm, ids, now) {
  if (confirm === undefined || confirm === null) return 'unconfirmed';
  if (typeof confirm !== 'object' || Array.isArray(confirm) || !Array.isArray(confirm.ids)
    || !confirm.ids.every((i) => Number.isSafeInteger(i)) || typeof confirm.at !== 'string') return 'confirm-invalid';
  const at = Date.parse(confirm.at);
  if (!Number.isFinite(at) || at > now) return 'confirm-invalid';
  if (JSON.stringify([...confirm.ids].sort((a, b) => a - b)) !== JSON.stringify(ids)) return 'confirm-mismatch';
  if (now - at < MIN_GAP_MS) return 'confirm-too-soon';
  return null;
}

function classify({ pushed, pr, base = null, runs = [], required, confirm } = {}, { now = Date.now() } = {}) {
  const reasons = [];
  if (!/^[0-9a-f]{40,64}$/.test(pushed || '')) return { verdict: 'unknown', reasons: ['no-pushed-oid'], runs: [] };
  if (!pr || typeof pr.number !== 'number') return { verdict: 'unknown', reasons: ['no-pr'], runs: [] };
  if (pr.state !== 'OPEN') reasons.push(`pr-${String(pr.state).toLowerCase()}`);
  if (pr.headRefOid !== pushed) return { verdict: 'stale', reasons: [...reasons, 'pr-head-moved'], runs: [] };
  if (!/^[0-9a-f]{40,64}$/.test(base || '')) reasons.push('no-recorded-base');
  else if (pr.baseRefOid !== base) reasons.push('base-moved');
  // Latest run per workflow+event for exactly this head: an older green run for another SHA, or a
  // re-run superseded by a newer one, is not evidence for this delivery.
  const mine = (Array.isArray(runs) ? runs : []).filter((r) => r.headSha === pushed && EVENTS.has(r.event));
  const latest = new Map();
  for (const r of mine) {
    const k = `${r.workflowName}|${r.event}`;
    if (!latest.has(k) || r.databaseId > latest.get(k).databaseId) latest.set(k, r);
  }
  const chosen = [...latest.values()].map((r) => ({
    id: r.databaseId, workflow: r.workflowName, event: r.event, url: r.url,
    state: r.status !== 'completed' ? 'pending' : r.conclusion === 'success' ? 'pass' : SKIPPED.has(r.conclusion) ? 'skipped' : FAILED.has(r.conclusion) ? 'fail' : 'unknown',
  }));
  const ids = chosen.map((c) => c.id).sort((a, b) => a - b);
  const next_confirm = { ids, at: new Date(now).toISOString() };
  if (!chosen.length) return { verdict: 'none', reasons: [...reasons, 'zero-runs'], runs: [], next_confirm };
  // Required checks are judged by their own bucket — check names are job names, not workflow names.
  let reqStates = [];
  if (!Array.isArray(required)) reasons.push('required-unread');
  else if (!required.length) reasons.push('no-required-checks');
  else reqStates = required.map((c) => BUCKET[c && c.bucket] || 'unknown');
  const states = new Set([...chosen.map((c) => c.state), ...reqStates]);
  let verdict;
  if (states.has('fail')) verdict = 'fail';
  else if (states.has('pending')) verdict = 'pending';
  else if (states.has('unknown')) verdict = 'unknown';
  else if (states.has('skipped')) verdict = 'skipped';
  else verdict = 'pass';
  const unconfirmed = confirmation(confirm, ids, now);
  if (verdict === 'pass' && reasons.includes('base-moved')) verdict = 'stale';
  else if (verdict === 'pass' && (reasons.includes('no-recorded-base') || reasons.includes('required-unread'))) verdict = 'unknown';
  else if (verdict === 'pass' && unconfirmed) { verdict = unconfirmed === 'confirm-invalid' ? 'unknown' : 'pending'; reasons.push(unconfirmed); }
  if (verdict === 'pass' && pr.state !== 'OPEN') verdict = 'unknown';
  return { verdict, reasons, runs: chosen, next_confirm };
}

module.exports = { classify, MIN_GAP_MS };

if (require.main === module) {
  let input;
  try { input = JSON.parse(require('fs').readFileSync(0, 'utf8')); } catch { process.stderr.write('ci-readback: JSON on stdin required\n'); process.exit(2); }
  const r = classify(input);
  process.stdout.write(`${JSON.stringify(r)}\n`);
  process.exitCode = r.verdict === 'pass' ? 0 : r.verdict === 'pending' ? 10 : 1;
}
