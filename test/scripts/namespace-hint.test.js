const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { statSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

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
    if (line.startsWith('Plugin root: ') || line.startsWith('Plugin scripts: ')) continue;
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

test('namespace-hint.sh → names sd0x skills only, never every /command', () => {
  const out = execFileSync('bash', [scriptPath], { encoding: 'utf8' });
  assert.match(out, /invoke its skills as \/sd0x-dev-flow:<skill>; host commands keep their names/);
  assert.doesNotMatch(out, /all \/command references/, '/compact and /context are the host\'s');
});

// The consumer case: a project with no scripts/run-skill.sh of its own, and a plugin installed under
// a path with a space or a quote. The printed command is run as printed, from that project.
for (const name of ['plugin', 'plug in', "it's here"]) {
  test(`namespace-hint.sh → the printed runner works from a project without it (plugin root ${JSON.stringify(name)})`, () => {
    const base = mkdtempSync(join(tmpdir(), 'ns-hint-'));
    try {
      const root = join(base, name);
      const project = join(base, 'project');
      mkdirSync(project);
      mkdirSync(join(root, 'scripts'), { recursive: true });
      mkdirSync(join(root, 'skills', 'demo', 'scripts'), { recursive: true });
      copyFileSync(resolve(__dirname, '../../scripts/run-skill.sh'), join(root, 'scripts', 'run-skill.sh'));
      writeFileSync(join(root, 'skills', 'demo', 'scripts', 'hi.js'), "console.log('ran', process.argv.slice(2).join(' '));\n");
      const out = execFileSync('bash', [scriptPath], { cwd: project, encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: root } });
      const line = out.split('\n').find((l) => l.startsWith('Plugin scripts: '));
      const cmd = line.slice('Plugin scripts: '.length).replace('<skill> <script> [args]', 'demo hi.js one two');
      const r = spawnSync('sh', ['-c', cmd], { cwd: project, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, 'ran one two\n');
      assert.match(out, /Where a skill says scripts\/run-skill\.sh, use that path and keep the interpreter the skill names/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}
