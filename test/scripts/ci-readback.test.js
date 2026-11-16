'use strict';
// scripts/ci-readback.js — which CI evidence counts for a delivered head. Fixtures mirror the field
// names `gh run list` / `gh pr view` return (measured against PR #30, run 37662123230).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { classify, MIN_GAP_MS } = require('../../scripts/ci-readback.js');

const H = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const pr = (over = {}) => ({ number: 31, state: 'OPEN', isDraft: true, headRefOid: H, baseRefOid: BASE, ...over });
const run = (over = {}) => ({ databaseId: 100, headSha: H, event: 'pull_request', status: 'completed', conclusion: 'success', workflowName: 'CI', url: 'https://x/runs/100', ...over });

// Synthetic clock: classify takes `now` as its second argument; the CLI never reads it from input.
const NOW = Date.parse('2026-11-16T08:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const seen = (ids, ms = MIN_GAP_MS) => ({ ids, at: ago(ms) });
const READY = { base: BASE, required: [], confirm: seen([100]) };
const cls = (o) => classify({ ...READY, ...o }, { now: NOW });

test('pass → only a completed success for exactly the pushed head, on the recorded base', () => {
  const r = cls({ pushed: H, pr: pr(), runs: [run()] });
  assert.equal(r.verdict, 'pass');
  assert.deepEqual(r.runs.map((x) => [x.id, x.workflow, x.event, x.state]), [[100, 'CI', 'pull_request', 'pass']]);
});

test('zero runs, an older SHA\'s green run, and an unrelated event are not evidence', () => {
  assert.equal(cls({ pushed: H, pr: pr(), runs: [] }).verdict, 'none');
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run({ headSha: OLD })] }).verdict, 'none', 'an old green run never stands for the new head');
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run({ event: 'schedule' })] }).verdict, 'none');
});

test('pending, failed, skipped and unknown conclusions are reported apart, never as pass', () => {
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run({ status: 'queued', conclusion: null })] }).verdict, 'pending');
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run({ status: 'in_progress', conclusion: null })] }).verdict, 'pending');
  for (const c of ['failure', 'cancelled', 'timed_out', 'action_required']) assert.equal(cls({ pushed: H, pr: pr(), runs: [run({ conclusion: c })] }).verdict, 'fail', c);
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run({ conclusion: 'skipped' })] }).verdict, 'skipped', 'a Draft-skipped workflow did not test anything');
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run({ conclusion: 'weird' })] }).verdict, 'unknown');
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run(), run({ databaseId: 101, workflowName: 'Lint', status: 'queued', conclusion: null })] }).verdict, 'pending');
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run(), run({ databaseId: 101, workflowName: 'Lint', conclusion: 'failure' })] }).verdict, 'fail');
});

test('a re-run supersedes the earlier run of the same workflow and event', () => {
  const r = cls({ pushed: H, pr: pr(), runs: [run({ databaseId: 100, conclusion: 'failure' }), run({ databaseId: 105 })], confirm: seen([105]) });
  assert.equal(r.verdict, 'pass');
  assert.equal(r.runs[0].id, 105);
});

test('PR head moved, base moved, PR not open, required check missing → never pass', () => {
  assert.equal(cls({ pushed: H, pr: pr({ headRefOid: OLD }), runs: [run()] }).verdict, 'stale');
  const b = cls({ pushed: H, pr: pr({ baseRefOid: OLD }), runs: [run()] });
  assert.deepEqual([b.verdict, b.reasons], ['stale', ['base-moved', 'no-required-checks']], 'a green merge-ref run against an older base is about another tree');
  assert.equal(cls({ pushed: H, pr: pr({ state: 'CLOSED' }), runs: [run()] }).verdict, 'unknown');
  // Required checks are job names from `gh pr checks --required`, judged by their own bucket.
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run()], required: [{ name: 'test', bucket: 'pass' }, { name: 'security', bucket: 'pending' }] }).verdict, 'pending');
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run()], required: [{ name: 'test', bucket: 'fail' }] }).verdict, 'fail');
  assert.equal(cls({ pushed: H, pr: pr(), runs: [run()], required: [{ name: 'test', bucket: 'pass' }] }).verdict, 'pass', 'a job name, not a workflow name, matches');
  const unread = cls({ pushed: H, pr: pr(), runs: [run()], required: undefined });
  assert.deepEqual([unread.verdict, unread.reasons], ['unknown', ['required-unread']], 'required checks never read → never pass');
});

test('one read never passes: a finished push run while the pull_request run is not created yet', () => {
  const early = cls({ pushed: H, pr: pr(), runs: [run({ event: 'push', workflowName: 'Lint' })], confirm: undefined });
  assert.deepEqual([early.verdict, early.reasons], ['pending', ['no-required-checks', 'unconfirmed']]);
  assert.deepEqual(early.next_confirm, { ids: [100], at: new Date(NOW).toISOString() }, 'the read hands back what the next one confirms');
  // Second read: the PR run appeared, so the run set differs from the first read — still not a pass.
  const second = cls({ pushed: H, pr: pr(), runs: [run({ event: 'push', workflowName: 'Lint' }), run({ databaseId: 101 })], confirm: seen([100]) });
  assert.deepEqual([second.verdict, second.reasons.at(-1)], ['pending', 'confirm-mismatch']);
  const third = cls({ pushed: H, pr: pr(), runs: [run({ event: 'push', workflowName: 'Lint' }), run({ databaseId: 101 })], confirm: seen([100, 101]) });
  assert.equal(third.verdict, 'pass');
});

test('the confirming read must be at least a minute old, well formed and not in the future', () => {
  const at = (confirm) => { const r = cls({ pushed: H, pr: pr(), runs: [run()], confirm }); return [r.verdict, r.reasons.at(-1)]; };
  assert.deepEqual(at(seen([100], 41 * 1000)), ['pending', 'confirm-too-soon'], 'the 41-second read seen on PR #31 is not a pass');
  assert.deepEqual(at(seen([100], MIN_GAP_MS - 1)), ['pending', 'confirm-too-soon'], 'one millisecond short');
  assert.deepEqual(at(seen([100], MIN_GAP_MS)), ['pass', 'no-required-checks'], 'exactly the minimum');
  assert.deepEqual(at(seen([100], 0)), ['pending', 'confirm-too-soon']);
  for (const bad of [[100], { ids: [100] }, { ids: [100], at: 'yesterday' }, { ids: ['100'], at: ago(MIN_GAP_MS) }, { ids: 100, at: ago(MIN_GAP_MS) }, { ids: [100], at: 1731744000000 }, 'x']) {
    assert.deepEqual(at(bad), ['unknown', 'confirm-invalid'], JSON.stringify(bad));
  }
  assert.deepEqual(at({ ids: [100], at: new Date(NOW + 1000).toISOString() }), ['unknown', 'confirm-invalid'], 'a read from the future vouches for nothing');
  assert.deepEqual(at(null), ['pending', 'unconfirmed']);
});

test('CLI → the gap is measured on its own clock; a `now` in the input cannot shorten it', () => {
  const cli = (input) => JSON.parse(spawnSync('node', [resolve(__dirname, '../../scripts/ci-readback.js')], { input: JSON.stringify(input), encoding: 'utf8' }).stdout);
  const fresh = { ids: [100], at: new Date(Date.now() - 1000).toISOString() };
  const r = cli({ pushed: H, pr: pr(), base: BASE, required: [], runs: [run()], confirm: fresh, now: Date.now() + 3600 * 1000 });
  assert.deepEqual([r.verdict, r.reasons.at(-1)], ['pending', 'confirm-too-soon']);
});

test('missing pushed OID or PR → unknown; the CLI exit code follows the verdict', () => {
  assert.equal(classify({ pr: pr() }).verdict, 'unknown');
  assert.equal(classify({ pushed: H }).verdict, 'unknown');
  const cli = (input) => spawnSync('node', [resolve(__dirname, '../../scripts/ci-readback.js')], { input: JSON.stringify({ ...READY, confirm: { ids: [100], at: new Date(Date.now() - 2 * MIN_GAP_MS).toISOString() }, ...input }), encoding: 'utf8' }).status;
  assert.equal(cli({ pushed: H, pr: pr(), runs: [run()] }), 0);
  assert.equal(cli({ pushed: H, pr: pr(), runs: [run({ status: 'queued' })] }), 10);
  assert.equal(cli({ pushed: H, pr: pr(), runs: [] }), 1);
  assert.equal(spawnSync('node', [resolve(__dirname, '../../scripts/ci-readback.js')], { input: 'not json', encoding: 'utf8' }).status, 2);
});

test('no recorded PR base → unknown, never pass: the merge tree the run tested is not known', () => {
  const r = classify({ pushed: H, pr: pr(), runs: [run()], required: [], confirm: seen([100]) }, { now: NOW });
  assert.deepEqual([r.verdict, r.reasons], ['unknown', ['no-recorded-base', 'no-required-checks']]);
  assert.equal(classify({ pushed: H, pr: pr(), base: 'not-an-oid', runs: [run()], required: [], confirm: seen([100]) }, { now: NOW }).verdict, 'unknown');
  assert.equal(classify({ pushed: H, pr: pr(), runs: [run({ conclusion: 'failure' })] }).verdict, 'fail', 'a failure is still a failure');
});
