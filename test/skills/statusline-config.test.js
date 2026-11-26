const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const skillPath = resolve(__dirname, '../../skills/statusline-config/SKILL.md');
const techSpecPath = resolve(__dirname, '../../docs/features/statusline-config/2-tech-spec.md');

// jq's string literal needs four backslashes in the documented command so that
// it matches one Windows path separator at runtime.
const windowsPathFilter = String.raw`gsub("\\\\"; "/")`;

test('statusline skill normalizes Windows paths before shell rendering', () => {
  const content = readFileSync(skillPath, 'utf8');

  assert.ok(content.includes('Normalize Windows path separators'),
    'the skill must explain why Windows path normalization is required');
  assert.ok(content.includes(windowsPathFilter),
    'the skill must document the jq filter that converts backslashes to slashes');
  assert.match(content, /before .*?(?:printf "%b"|git -C)/s,
    'normalization must happen before printf %b or git -C consumes the path');
});

test('statusline technical spec keeps the Windows path rule in sync', () => {
  const content = readFileSync(techSpecPath, 'utf8');

  assert.ok(content.includes('Windows paths'),
    'the technical spec must call out Windows paths explicitly');
  assert.ok(content.includes(windowsPathFilter),
    'the technical spec must include the same jq normalization filter');
  assert.ok(content.includes('workspace.current_dir') && content.includes('cwd'),
    'the rule must cover both documented directory fields');
});
