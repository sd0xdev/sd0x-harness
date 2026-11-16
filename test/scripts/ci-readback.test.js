'use strict';
// scripts/ci-readback.js — which CI evidence counts for a delivered head. Fixtures mirror the field
// names `gh run list` / `gh pr view` return (measured against PR #30, run 37662123230).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { classify } = require('../../scripts/ci-readback.js');

const H = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const pr = (over = {}) => ({ number: 31, state: 'OPEN', isDraft: true, headRefOid: H, baseRefOid: BASE, ...over });
const run = (over = {}) => ({ databaseId: 100, headSha: H, event: 'pull_request', status: 'completed', conclusion: 'success', workflowName: 'CI', url: 'https://x/runs/100', ...over });

const READY = { base: BASE, required: [], confirm: [100] };
const cls = (o) => classify({ ...READY, ...o });

test('pass → only a completed success for exactly the pushed head, on the recorded base', () => {
  const r = classify({ pushed: H, pr: pr(), ...READY, runs: [run()] });
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
  const r = cls({ pushed: H, pr: pr(), runs: [run({ databaseId: 100, conclusion: 'failure' }), run({ databaseId: 105 })], confirm: [105] });
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
  // Second read: the PR run appeared, so the run set differs from the first read — still not a pass.
  const second = cls({ pushed: H, pr: pr(), runs: [run({ event: 'push', workflowName: 'Lint' }), run({ databaseId: 101 })], confirm: [100] });
  assert.equal(second.verdict, 'pending');
  const third = cls({ pushed: H, pr: pr(), runs: [run({ event: 'push', workflowName: 'Lint' }), run({ databaseId: 101 })], confirm: [100, 101] });
  assert.equal(third.verdict, 'pass');
});

test('missing pushed OID or PR → unknown; the CLI exit code follows the verdict', () => {
  assert.equal(classify({ pr: pr() }).verdict, 'unknown');
  assert.equal(classify({ pushed: H }).verdict, 'unknown');
  const cli = (input) => spawnSync('node', [resolve(__dirname, '../../scripts/ci-readback.js')], { input: JSON.stringify({ ...READY, ...input }), encoding: 'utf8' }).status;
  assert.equal(cli({ pushed: H, pr: pr(), runs: [run()] }), 0);
  assert.equal(cli({ pushed: H, pr: pr(), runs: [run({ status: 'queued' })] }), 10);
  assert.equal(cli({ pushed: H, pr: pr(), runs: [] }), 1);
  assert.equal(spawnSync('node', [resolve(__dirname, '../../scripts/ci-readback.js')], { input: 'not json', encoding: 'utf8' }).status, 2);
});

test('no recorded PR base → unknown, never pass: the merge tree the run tested is not known', () => {
  const r = classify({ pushed: H, pr: pr(), runs: [run()], required: [], confirm: [100] });
  assert.deepEqual([r.verdict, r.reasons], ['unknown', ['no-recorded-base', 'no-required-checks']]);
  assert.equal(classify({ pushed: H, pr: pr(), base: 'not-an-oid', runs: [run()], required: [], confirm: [100] }).verdict, 'unknown');
  assert.equal(classify({ pushed: H, pr: pr(), runs: [run({ conclusion: 'failure' })] }).verdict, 'fail', 'a failure is still a failure');
});
