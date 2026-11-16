'use strict';
// scripts/jira-entry.js and scripts/lib/secret-scan.js — the task-start Jira entry's deterministic
// half. Synthetic tool lists and plans only; nothing here reaches Jira.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const J = require('../../scripts/jira-entry.js');
const { scanSecrets } = require('../../scripts/lib/secret-scan.js');

const CLI = resolve(__dirname, '../../scripts/jira-entry.js');
const cli = (args, input) => spawnSync('node', [CLI, ...args], { input: input === undefined ? '' : JSON.stringify(input), encoding: 'utf8' });

const NEW_SERVER = ['mcp__claude_ai_Atlassian_MCP__atlassianUserInfo', 'mcp__claude_ai_Atlassian_MCP__createJiraIssue', 'mcp__claude_ai_Atlassian_MCP__searchJiraIssuesUsingJql', 'mcp__claude_ai_Atlassian_MCP__getJiraIssue'];
const OLD_SERVER = ['mcp__claude_ai_Atlassian__getAccessibleAtlassianResources', 'mcp__claude_ai_Atlassian__createJiraIssue', 'mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql'];

test('capability → matched by operation name on any server; both Atlassian generations qualify', () => {
  for (const names of [NEW_SERVER, OLD_SERVER, ['mcp__some_other_name__getAccessibleAtlassianResources', 'mcp__some_other_name__createJiraIssue', 'mcp__some_other_name__searchJiraIssuesUsingJql']]) {
    assert.equal(J.capability(names).tools_present, true, names[0]);
  }
  assert.deepEqual(J.capability(NEW_SERVER).tools.createIssue, ['mcp__claude_ai_Atlassian_MCP__createJiraIssue']);
});

test('capability → missing create, search or any access probe means no Jira question', () => {
  assert.deepEqual(J.capability([]).missing, ['resources', 'createIssue', 'search']);
  assert.equal(J.capability(NEW_SERVER.filter((n) => !n.endsWith('createJiraIssue'))).tools_present, false);
  assert.equal(J.capability(NEW_SERVER.filter((n) => !n.endsWith('atlassianUserInfo'))).tools_present, false);
  assert.equal(J.capability(['createJiraIssue', 'searchJiraIssuesUsingJql', 'atlassianUserInfo']).tools_present, false, 'a non-MCP name is not a runtime tool');
  assert.equal(J.capability(null).tools_present, false);
  assert.equal(J.capability(['mcp__x__createJiraIssueDraft', 'mcp__x__searchJiraIssuesUsingJql', 'mcp__x__atlassianUserInfo']).tools_present, false, 'suffix must be the whole operation');
});

test('plan → every sent field is in the plan, the hash binds it, the token is stable per task', () => {
  const p = J.plan({ project: 'OK', summary: 'Add retry', description: 'Retry the quiz fetch.', taskId: 'T1' });
  assert.equal(p.ok, true);
  assert.match(p.fields.description, /Retry the quiz fetch\.\n\nsd0x-task:[0-9a-f]{12}$/);
  assert.equal(p.fields.type, 'Task');
  assert.equal(p.fields.base, 'main');
  assert.equal(J.plan({ project: 'OK', summary: 'Add retry', description: 'Retry the quiz fetch.', taskId: 'T1' }).plan_hash, p.plan_hash);
  assert.notEqual(J.plan({ project: 'OK', summary: 'Add retry', description: 'changed', taskId: 'T1' }).plan_hash, p.plan_hash, 'a changed description is a different approval');
  assert.notEqual(J.plan({ project: 'OK', summary: 'Add retry', taskId: 'T2' }).token, p.token, 'a new task gets a new readback token');
});

test('plan → a secret in summary or description blocks the create; findings never echo the value', () => {
  const p = J.plan({ project: 'OK', summary: 'Fix login', description: 'curl https://u:hunter2secret@example.com\nAPI_KEY=abcdef123456' });
  assert.equal(p.ok, false);
  assert.deepEqual(p.findings.map((f) => [f.field, f.rule, f.line]), [['description', 'url-credentials', 1], ['description', 'assignment', 2]]);
  assert.doesNotMatch(JSON.stringify(p.findings), /hunter2|abcdef123456/);
  assert.deepEqual(J.plan({ project: 'ok', summary: '' }).errors, ['project', 'summary']);
});

test('secret scan → the common token shapes; ordinary prose and the attribution guard are different things', () => {
  const hits = (s) => scanSecrets(s).map((f) => f.rule);
  assert.deepEqual(hits('-----BEGIN RSA PRIVATE KEY-----'), ['private-key']);
  assert.deepEqual(hits('AKIAIOSFODNN7EXAMPLE'), ['aws-access-key']);
  assert.deepEqual(hits(`ghp_${'a'.repeat(36)}`), ['github-token']);
  assert.deepEqual(hits('xoxb-1234567890-abc'), ['slack-token']);
  assert.deepEqual(hits(`Authorization: Bearer ${'x'.repeat(20)}`), ['bearer']);
  assert.deepEqual(hits('password: s3cretvalue'), ['assignment']);
  assert.deepEqual(hits('Add a retry to the quiz fetch; see docs/x.md and https://example.com/page'), []);
  assert.deepEqual(hits('Co-Authored-By: Claude <noreply@anthropic.com>'), [], 'attribution is not a secret — different guard');
});

test('jql and readback → bounded query; one match binds, none stays unknown, several conflict', () => {
  const q = J.jql({ project: 'OK', token: 'sd0x-task:0123456789ab', since: '2026-11-16 10:00' });
  assert.match(q, /^project = OK AND reporter = currentUser\(\) AND created >= "2026-11-16 10:00" AND text ~ /);
  assert.throws(() => J.jql({ project: 'OK" OR 1=1', token: 'sd0x-task:0123456789ab', since: '2026-11-16' }));
  assert.throws(() => J.jql({ project: 'OK', token: 'x', since: '2026-11-16' }));
  assert.deepEqual(J.readback([{ key: 'OK-9' }]), { state: 'created', key: 'OK-9' });
  assert.deepEqual(J.readback([]), { state: 'unknown', key: null }, 'index lag is not "no ticket" — never create again');
  assert.equal(J.readback([{ key: 'OK-9' }, { key: 'OK-10' }]).state, 'conflict');
});

test('branchName → the jira branch policy prefix and slug; an invalid key is refused', () => {
  assert.equal(J.branchName({ key: 'OK-12', summary: 'Add user profile page!', type: 'Story' }), 'feat/OK-12-add-user-profile-page');
  assert.equal(J.branchName({ key: 'OK-12', summary: 'Crash', type: 'Bug' }), 'fix/OK-12-crash');
  assert.throws(() => J.branchName({ key: '--all', summary: 'x' }));
});

test('CLI → JSON on stdin; plan exit 3 on a blocked plan; usage exit 2', () => {
  assert.equal(JSON.parse(cli(['capability'], NEW_SERVER).stdout).tools_present, true);
  assert.equal(cli(['plan'], { project: 'OK', summary: 'x', description: 'token=abcdefghij' }).status, 3);
  assert.equal(cli(['plan'], { project: 'OK', summary: 'x' }).status, 0);
  assert.equal(cli(['bogus']).status, 2);
  assert.equal(cli(['jql', '--project', 'OK', '--token', 'bad', '--since', '2026-11-16']).status, 2);
});
