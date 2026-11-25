'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const skill = read('skills/skill-health-check/SKILL.md');
const close = read('skills/ask/references/close-skills.md');

test('discovery → reached from the skill, read-only, with consent before anything that costs', () => {
  const flat = skill.replace(/\s+/g, ' ');
  assert.match(skill, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/skill-health-check\/scripts\/skill-discovery\.js" observe/);
  assert.match(flat, /changes no description, setting or skill, and runs no model/);
  assert.match(flat, /without it there is no ordinary-install verdict/);
  assert.match(flat, /`--discovery` \(no lint report, no gate\)/);
  assert.match(flat, /A comparison needs the user's explicit consent/);
  assert.match(flat, /never change a description on an observation alone/);
  assert.match(flat, /\(the user's answer, never yours\)/);
});

test('close skills → every command named exists, aliases point at their real parents, and it only suggests', () => {
  const names = new Set([...close.matchAll(/`\/([a-z0-9-]+)(?: --discovery)?`/g)].map((m) => m[1]));
  assert.ok(names.size > 20);
  for (const n of names) assert.ok(existsSync(resolve(root, `skills/${n}/SKILL.md`)), n);
  const parents = { 'codex-review-fast': 'codex-code-review', 'codex-review-doc': 'doc-review', 'codex-security': 'security-review', 'codex-test-review': 'test-review', 'codex-test-gen': 'test-review' };
  for (const [a, p] of Object.entries(parents)) assert.ok(read(`skills/${a}/SKILL.md`).includes(p), `${a} → ${p}`);
  assert.match(close.replace(/\s+/g, ' '), /Suggest, never redirect/);
  assert.match(close.replace(/\s+/g, ' '), /No skill is right when the request can be answered or done directly/);
  assert.match(close.replace(/\s+/g, ' '), /whose answer needs repository evidence still has one/);
});

test('/ask → reads the close-skills guide when a request fits several', () => {
  assert.match(read('skills/ask/SKILL.md').replace(/\s+/g, ' '), /When the request fits more than one skill, or asks which skill to use, read this skill's own `references\/close-skills\.md`\. Where one of its rows covers the request/);
});
