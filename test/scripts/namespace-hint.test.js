const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { statSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

const scriptPath = resolve(__dirname, '../../scripts/namespace-hint.sh');

test('namespace-hint.sh exists and is executable', () => {
  const stat = statSync(scriptPath);
  assert.ok(stat.isFile(), 'script should be a file');
  // Check executable bit (owner)
  assert.ok((stat.mode & 0o100) !== 0, 'script should be executable');
});

test('each core line of namespace-hint.sh output is under 100 chars', () => {
  const output = execFileSync('bash', [scriptPath], { encoding: 'utf8' });
  const lines = output.trim().split('\n');
  assert.ok(lines.length >= 1, 'output should have at least 1 line');
  for (const line of lines) {
    // Skip drift sentinel warning (SessionStart hook additional context) — this line
    // is intentionally longer and follows Claude Code SessionStart output conventions
    if (line.startsWith('SessionStart hook additional context:')) continue;
    // The plugin root is an absolute install path whose length the plugin does not choose.
    if (line.startsWith('Plugin root: ')) continue;
    if (line === '') continue;
    assert.ok(line.length < 100, `line should be under 100 chars: "${line}" (${line.length})`);
  }
});

test('namespace-hint.sh output contains plugin name', () => {
  const output = execFileSync('bash', [scriptPath], { encoding: 'utf8' }).trim();
  assert.ok(output.includes('sd0x-dev-flow'), 'output should contain plugin name');
});

test('namespace-hint.sh output contains namespace guidance', () => {
  const output = execFileSync('bash', [scriptPath], { encoding: 'utf8' }).trim();
  assert.ok(
    output.includes('/sd0x-dev-flow:') || output.includes('sd0x-dev-flow:command'),
    'output should contain namespace example'
  );
});

// rules-residency task 3 (code review): the resident trigger table names contracts as skills/…
// paths, which a consuming project does not have — the plugin root line is what resolves them.
test('namespace-hint.sh → prints the plugin root, from CLAUDE_PLUGIN_ROOT or else its own parent', () => {
  const pluginRoot = resolve(__dirname, '../..');
  const set = execFileSync('bash', [scriptPath], { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: '/opt/plugins/sd0x-dev-flow' } });
  assert.match(set, /^Plugin root: \/opt\/plugins\/sd0x-dev-flow$/m);
  const env = { ...process.env };
  delete env.CLAUDE_PLUGIN_ROOT;
  const unset = execFileSync('bash', [scriptPath], { encoding: 'utf8', env });
  assert.ok(unset.split('\n').includes(`Plugin root: ${pluginRoot}`), 'falls back to the script directory\'s parent');
});
