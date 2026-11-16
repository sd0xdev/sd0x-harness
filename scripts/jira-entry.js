#!/usr/bin/env node
'use strict';

// The deterministic half of the task-start Jira entry (skills/smart-commit/references/task-contract.md
// § Jira entry). The model reads its own runtime tool list and calls the tools; this file decides
// from facts handed in on stdin:
//
//   capability   which runtime tools serve each Jira operation — matched by OPERATION name, never by
//                an MCP server prefix, so a renamed or second Atlassian server needs no edit here
//   plan         the create+branch plan the entry question shows: secret findings, a readback token
//                and the hash that binds the user's one selection to exactly this content
//   jql          the readback query after a create whose outcome is unknown (timeout)
//
// Nothing here calls Jira, git or the network.

const crypto = require('crypto');
const { scanSecrets } = require('./lib/secret-scan.js');

// Operation → accepted tool-name endings. A tool counts when its name is `<server>__<operation>`
// for any server; the alternatives cover the two Atlassian MCP generations seen in the wild.
const OPS = {
  resources: ['getAccessibleAtlassianResources'],
  identity: ['atlassianUserInfo'],
  getIssue: ['getJiraIssue'],
  createIssue: ['createJiraIssue'],
  issueTypes: ['getJiraProjectIssueTypesMetadata', 'getJiraIssueTypeMetaWithFields'],
  search: ['searchJiraIssuesUsingJql'],
};

function capability(toolNames) {
  const names = Array.isArray(toolNames) ? toolNames.filter((n) => typeof n === 'string') : [];
  const tools = {};
  for (const [op, endings] of Object.entries(OPS)) {
    tools[op] = names.filter((n) => n.startsWith('mcp__') && endings.some((e) => n.endsWith(`__${e}`)));
  }
  // To ask at all: a way to prove access (resources or identity), to create, and to read back.
  const missing = ['createIssue', 'search'].filter((op) => !tools[op].length);
  if (!tools.resources.length && !tools.identity.length) missing.unshift('resources');
  return { tools_present: missing.length === 0, missing, tools };
}

const TYPE_PREFIX = { bug: 'fix', story: 'feat', task: 'feat', 'sub-task': 'feat', documentation: 'docs' };
function slug(summary) {
  return String(summary || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40).replace(/-+$/, '');
}
function branchName({ key, summary, type }) {
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key || '')) throw new Error('invalid issue key');
  const prefix = TYPE_PREFIX[String(type || '').toLowerCase()] || 'feat';
  const s = slug(summary);
  return `${prefix}/${key}${s ? `-${s}` : ''}`;
}

// The plan the entry question shows. Every field the create would send is in it, the description
// included, so the user's one selection approves exactly this content. A secret finding blocks the
// create option outright; the text is never auto-redacted and sent.
function plan({ project, type = 'Task', summary, description = '', base = 'main', taskId }) {
  const errors = [];
  if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(project || '')) errors.push('project');
  if (!summary || String(summary).length > 255) errors.push('summary');
  if (String(description).length > 8000) errors.push('description-too-long');
  const findings = [...scanSecrets(summary).map((f) => ({ ...f, field: 'summary' })), ...scanSecrets(description).map((f) => ({ ...f, field: 'description' }))];
  const token = `sd0x-task:${crypto.createHash('sha256').update(`${taskId || ''}|${project}|${summary}`).digest('hex').slice(0, 12)}`;
  const body = `${String(description).trimEnd()}\n\n${token}`;
  const fields = { project, type, summary: String(summary || ''), description: body, base };
  // A blocked plan returns no field text at all: the CLI prints this object, and a secret the scan
  // found must not reach captured tool output just because the create was refused. Findings carry
  // rule, field and line only.
  if (findings.length) return { ok: false, errors, findings, token: null, plan_hash: null, fields: null };
  const planHash = crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  return { ok: errors.length === 0, errors, findings, token, plan_hash: planHash, fields };
}

const isoOk = (s) => /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/.test(s);
function jql({ project, token, since }) {
  if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(project || '')) throw new Error('invalid project');
  if (!/^sd0x-task:[0-9a-f]{12}$/.test(token || '')) throw new Error('invalid token');
  if (!isoOk(since || '')) throw new Error('invalid since (yyyy-MM-dd or yyyy-MM-dd HH:mm)');
  return `project = ${project} AND reporter = currentUser() AND created >= "${since}" AND text ~ "\\"${token}\\"" ORDER BY created DESC`;
}

// The readback verdict: one match binds it, none stays unknown (index lag is possible — never a
// reason to create again), several is a conflict for the user.
function readback(issues) {
  const list = Array.isArray(issues) ? issues : [];
  if (list.length === 1) return { state: 'created', key: list[0].key };
  if (list.length === 0) return { state: 'unknown', key: null };
  return { state: 'conflict', keys: list.map((i) => i.key) };
}

module.exports = { capability, plan, jql, readback, branchName, slug, OPS };

if (require.main === module) {
  const [, , cmd, ...args] = process.argv;
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i === -1 ? undefined : args[i + 1]; };
  const stdin = () => { try { return JSON.parse(require('fs').readFileSync(0, 'utf8') || 'null'); } catch { return null; } };
  const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
  try {
    if (cmd === 'capability') out(capability(stdin()));
    else if (cmd === 'plan') { const p = plan(stdin() || {}); out(p); process.exitCode = p.ok ? 0 : 3; }
    else if (cmd === 'branch-name') out({ branch: branchName({ key: opt('key'), summary: opt('summary'), type: opt('type') }) });
    else if (cmd === 'jql') out({ jql: jql({ project: opt('project'), token: opt('token'), since: opt('since') }) });
    else if (cmd === 'readback') out(readback(stdin()));
    else { process.stderr.write('usage: jira-entry.js capability|plan|readback (JSON on stdin) | branch-name --key K --summary S [--type T] | jql --project P --token T --since D\n'); process.exitCode = 2; }
  } catch (e) {
    process.stderr.write(`jira-entry: ${e.message}\n`);
    process.exitCode = 2;
  }
}
