const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { join, resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const SKILL = join(ROOT, 'skills/agentctl-setup/SKILL.md');
const setup = require(join(ROOT, 'skills/agentctl-setup/scripts/agentctl-setup.js'));

const tmp = () => mkdtempSync(join(tmpdir(), 'agentctl-setup-'));
const body = () => readFileSync(SKILL, 'utf8');

// A stand-in `claude` binary: prints a version, and an installed-plugin list as JSON.
function fakeClaude(dir, { version = '2.1.289 (Claude Code)', list = '[]' } = {}) {
  const bin = join(dir, 'claude');
  writeFileSync(bin, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo '${version}'; exit 0; fi\necho '${list}'\n`);
  chmodSync(bin, 0o755);
  return bin;
}

// ── SKILL.md promises ────────────────────────────────────────────────────────

test('SKILL.md frontmatter names the skill and grants only the tools it uses', () => {
  const fm = body().match(/^---\n([\s\S]*?)\n---/)[1];
  assert.match(fm, /^name: agentctl-setup$/m);
  assert.match(fm, /^allowed-tools: Read, Write, AskUserQuestion, Bash\(node:\*\), Bash\(claude:\*\)$/m);
});

test('SKILL.md says the plugin never installs the mod and the task line is the user\'s to send', () => {
  const b = body();
  assert.match(b, /\*\*never\*\* installed by installing sd0x-dev-flow/);
  assert.match(b, /Send this line yourself/);
  assert.match(b, /Sending `\/agentctl task set` on the user's behalf/);
  assert.match(b, /not\*\* a security boundary/);
});

test('marketplace lists agentctl from mods/agentctl, where its manifest exists', () => {
  const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  const hits = market.plugins.filter((p) => p.name === 'agentctl');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, './mods/agentctl');
  assert.ok(existsSync(join(ROOT, 'mods/agentctl/.claude-plugin/plugin.json')));
});

// ── doctor ───────────────────────────────────────────────────────────────────

test('versionAtLeast: older → false, equal and newer → true, unreadable → false', () => {
  const min = [2, 1, 288];
  assert.equal(setup.versionAtLeast(setup.parseVersion('2.1.287'), min), false);
  assert.equal(setup.versionAtLeast(setup.parseVersion('2.1.288 (Claude Code)'), min), true);
  assert.equal(setup.versionAtLeast(setup.parseVersion('3.0.0'), min), true);
  assert.equal(setup.versionAtLeast(setup.parseVersion('dev build'), min), false);
});

test('findInstalled: found, absent and unreadable are three different answers', () => {
  assert.deepEqual(setup.findInstalled([{ pluginId: 'agentctl@sd0xdev-marketplace' }]), { id: 'agentctl@sd0xdev-marketplace', enabled: true });
  assert.deepEqual(setup.findInstalled({ installed: [{ pluginId: 'agentctl@m', enabled: false }] }), { id: 'agentctl@m', enabled: false });
  assert.equal(setup.findInstalled({ installed: [{ pluginId: 'agentctl-extra@m' }] }), false);
  assert.equal(setup.findInstalled([]), false);
  assert.equal(setup.findInstalled([{ unexpected: true }]), null);
  assert.equal(setup.findInstalled({ plugins: 'x' }), null);
});

test('doctor on a supported host reports ok and not installed', () => {
  const d = tmp();
  try {
    const r = setup.doctor({ cwd: d, home: d, claude: fakeClaude(d) });
    assert.equal(r.ok, true);
    assert.equal(r.claudeVersion, '2.1.289');
    assert.equal(r.installed, false);
    assert.deepEqual(r.problems, []);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('doctor names an old Claude Code and a disableAllHooks setting as problems', () => {
  const d = tmp();
  try {
    mkdirSync(join(d, '.claude'));
    writeFileSync(join(d, '.claude', 'settings.local.json'), JSON.stringify({ disableAllHooks: true }));
    const r = setup.doctor({ cwd: d, home: d, claude: fakeClaude(d, { version: '2.1.200 (Claude Code)' }) });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /2\.1\.200 is older than 2\.1\.288/);
    assert.match(r.problems.join('\n'), /disableAllHooks is true/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('doctor reports a missing claude binary as a problem, not a crash', () => {
  const d = tmp();
  try {
    const r = setup.doctor({ cwd: d, home: d, claude: join(d, 'no-such-claude') });
    assert.equal(r.ok, false);
    assert.equal(r.installed, null);
    assert.match(r.problems[0], /claude --version could not be read/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ── task-line ────────────────────────────────────────────────────────────────

test('task-line builds a line the mod accepts from plain answers', async () => {
  const r = await setup.taskLine({ goal: 'fix the quiz score bug', edit: 'src,tests', check: 'npm test', forbid: 'terraform apply' }, { cwd: '/w/repo' });
  assert.equal(r.ok, true);
  assert.match(r.line, /^\/agentctl task set \{/);
  const task = JSON.parse(r.line.slice('/agentctl task set '.length));
  assert.deepEqual(task.editRoots, ['src', 'tests']);
  assert.deepEqual(task.executors, [{ argv: ['npm', 'test'], check: true }]);
  assert.equal(task.worktree, undefined, 'the mod fills the worktree from the session, not the line');
});

test('task-line with no edit directories makes a read-only task', async () => {
  const r = await setup.taskLine({ goal: 'investigate the timeout' }, { cwd: '/w/repo' });
  assert.equal(r.ok, true);
  assert.equal(r.task.allow, undefined);
});

test('task-line refuses shell syntax, and a plain command of the same words passes', async () => {
  const bad = await setup.taskLine({ goal: 'g', check: 'npm test && rm -rf build' }, { cwd: '/w/repo' });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /uses shell syntax/);
  const good = await setup.taskLine({ goal: 'g', check: 'npm test' }, { cwd: '/w/repo' });
  assert.equal(good.ok, true);
});

test('task-line applies the mod\'s own rules: a production write cannot be an authorized check', async () => {
  const r = await setup.taskLine({ goal: 'g', check: 'kubectl delete pod quiz' }, { cwd: '/w/repo' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /overlaps forbidden class \(production-write\)/);
});

test('task-line refuses a missing goal and a credential-like command', async () => {
  const noGoal = await setup.taskLine({ goal: '' }, { cwd: '/w/repo' });
  assert.match(noGoal.errors.join('\n'), /goal is required/);
  const secret = await setup.taskLine({ goal: 'g', check: 'npm test --token=SYNTHETIC_TOKEN_VALUE' }, { cwd: '/w/repo' });
  assert.equal(secret.ok, false);
  assert.match(secret.errors.join('\n'), /credential-like/);
});

// ── deny-rules ───────────────────────────────────────────────────────────────

test('the recommended deny rules never include git push, which /push-ci needs', () => {
  assert.ok(setup.RECOMMENDED_DENY.length > 0);
  assert.equal(setup.RECOMMENDED_DENY.some((r) => /git push/.test(r)), false);
  assert.equal(setup.denyRules({ settings: '/x.json', rules: 'Bash(git push:*)' }).ok, false);
});

test('deny-rules lists without writing, then merges keeping other settings and rules', () => {
  const d = tmp();
  const f = join(d, '.claude', 'settings.local.json');
  try {
    mkdirSync(join(d, '.claude'));
    writeFileSync(f, JSON.stringify({ model: 'opus', permissions: { allow: ['Read'], deny: ['Bash(rm:*)'] } }));
    const dry = setup.denyRules({ settings: f });
    assert.equal(dry.written, false);
    assert.deepEqual(dry.missing, setup.RECOMMENDED_DENY);
    const w = setup.denyRules({ settings: f, rules: 'Bash(kubectl delete:*)', write: true });
    assert.equal(w.written, true);
    const saved = JSON.parse(readFileSync(f, 'utf8'));
    assert.deepEqual(saved, { model: 'opus', permissions: { allow: ['Read'], deny: ['Bash(rm:*)', 'Bash(kubectl delete:*)'] } });
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('deny-rules is idempotent and creates a missing settings file', () => {
  const d = tmp();
  const f = join(d, 'nested', 'settings.json');
  try {
    assert.equal(setup.denyRules({ settings: f, rules: 'Bash(helm upgrade:*)', write: true }).written, true);
    const again = setup.denyRules({ settings: f, rules: 'Bash(helm upgrade:*)', write: true });
    assert.equal(again.written, false);
    assert.deepEqual(again.missing, []);
    assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')).permissions.deny, ['Bash(helm upgrade:*)']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('deny-rules leaves an invalid or oddly shaped settings file untouched', () => {
  const d = tmp();
  try {
    const bad = join(d, 'bad.json');
    writeFileSync(bad, '{ not json');
    assert.equal(setup.denyRules({ settings: bad, write: true }).ok, false);
    assert.equal(readFileSync(bad, 'utf8'), '{ not json');
    const odd = join(d, 'odd.json');
    writeFileSync(odd, JSON.stringify({ permissions: { deny: 'Bash(x:*)' } }));
    assert.match(setup.denyRules({ settings: odd, write: true }).errors[0], /non-array "permissions.deny"/);
    for (const shape of ['["keep-me"]', '42', 'null', '{"permissions": null}']) {
      writeFileSync(odd, shape);
      assert.equal(setup.denyRules({ settings: odd, write: true }).ok, false, shape);
      assert.equal(readFileSync(odd, 'utf8'), shape, `${shape} must stay untouched`);
    }
    assert.equal(setup.denyRules({}).ok, false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ── regressions from review ──────────────────────────────────────────────────

test('regression: the mod declares its ES-module format, so older Node loads policy.js', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'mods/agentctl/package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  // Without syntax detection (the Node 18 behaviour), task-line must still load the mod's validator.
  const flags = ['--no-experimental-detect-module', '--no-experimental-require-module']
    .filter((f) => process.allowedNodeEnvironmentFlags.has(f));
  const r = spawnSync(process.execPath, [...flags, join(ROOT, 'skills/agentctl-setup/scripts/agentctl-setup.js'), 'task-line', '--goal', 'inspect the timeout'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(r.stdout).ok, true);
});

test('regression: a check the mod would refuse is rejected, the plain form passes', async () => {
  const env = await setup.taskLine({ goal: 'g', check: 'CI=true npm test' }, { cwd: '/w/repo' });
  assert.equal(env.ok, false);
  assert.match(env.errors[0], /the mod would refuse "CI=true npm test"/);
  const glob = await setup.taskLine({ goal: 'g', check: 'node --test test/*.test.js' }, { cwd: '/w/repo' });
  assert.equal(glob.ok, false);
  assert.equal((await setup.taskLine({ goal: 'g', check: 'node --test' }, { cwd: '/w/repo' })).ok, true);
});

test('regression: a needs-user command must reach the approval path', async () => {
  const r = await setup.taskLine({ goal: 'g', 'needs-user': 'npm publish' }, { cwd: '/w/repo' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.task.needsUser, [['npm', 'publish']]);
});

test('regression: SKILL.md handles an installed but disabled mod before building a task', () => {
  const b = body();
  assert.match(b, /`installed\.enabled` is `false`/);
  assert.match(b, /claude plugin enable <installed\.id>/);
});

test('regression: free-text answers travel in an allocated file, never through a shell', async () => {
  const script = join(ROOT, 'skills/agentctl-setup/scripts/agentctl-setup.js');
  const { input } = setup.allocAnswers();
  const marker = join(tmpdir(), `agentctl-setup-injected-${process.pid}`);
  writeFileSync(input, JSON.stringify({ goal: 'fix the $HOME bug', check: `npm test $(touch ${marker})` }));
  const r = spawnSync(process.execPath, [script, 'task-line', '--input', input], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.match(out.errors[0], /uses shell syntax/);
  assert.equal(existsSync(marker), false, 'the $(...) in an answer must never run');
  assert.equal(existsSync(input), false, 'the answers file is removed after one read');
});

test('regression: a plain answers file builds the line with the text kept literally', async () => {
  const { input } = setup.allocAnswers();
  writeFileSync(input, JSON.stringify({ goal: 'fix the $HOME bug', check: 'npm test' }));
  const r = setup.readAnswers(input);
  const line = await setup.taskLine(r.answers, { cwd: '/w/repo' });
  assert.equal(line.ok, true);
  assert.equal(line.task.goal, 'fix the $HOME bug');
});

test('regression: --input refuses a path alloc did not create and non-string answers', () => {
  const d = mkdtempSync(join(tmpdir(), 'not-allocated-'));
  try {
    const stray = join(d, 'answers.json');
    writeFileSync(stray, '{"goal":"x"}');
    assert.match(setup.readAnswers(stray).error, /allocated by "alloc"/);
    assert.equal(existsSync(stray), true, 'a file the helper did not allocate is not deleted');
    const { input } = setup.allocAnswers();
    writeFileSync(input, JSON.stringify({ goal: ['not', 'a', 'string'] }));
    assert.match(setup.readAnswers(input).error, /must be a string/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('regression: SKILL.md dispatches flagged modes before step 1 and keeps answers off the command line', () => {
  const b = body();
  assert.match(b, /Dispatch on the flag \*\*before\*\* step 1/);
  assert.match(b, /`\/agentctl-setup --status` \| Step 2's `doctor` report only/);
  assert.match(b, /Putting any free-text answer on a command line/);
  assert.doesNotMatch(b, /task-line --goal "/);
});

// ── AC evidence (T9) ─────────────────────────────────────────────────────────

test('AC4: a needs-user command the mod would not route to approval is refused, the plain form passes', async () => {
  const env = await setup.taskLine({ goal: 'g', 'needs-user': 'NPM_CONFIG_TAG=next npm publish' }, { cwd: '/w/repo' });
  assert.equal(env.ok, false);
  assert.match(env.errors.join('\n'), /would not reach your approval/);
  assert.equal((await setup.taskLine({ goal: 'g', 'needs-user': 'npm publish' }, { cwd: '/w/repo' })).ok, true);
});

test('AC3: a disabled install is enabled only after approval, and before any task is built', () => {
  const row = body().split('\n').find((l) => l.startsWith('| `installed.enabled` is `false`'));
  assert.ok(row, 'the disabled row exists');
  const ask = row.indexOf('AskUserQuestion naming `claude plugin enable');
  const run = row.indexOf('run it after approval');
  const task = row.indexOf('then step 4');
  assert.ok(ask > 0 && run > ask && task > run, 'ask, then enable, then the task step');
});

test('AC7: uninstall asks first, then names the mod\'s data file', () => {
  const sec = body().match(/### 6\. Uninstall[\s\S]*?(?=\n## )/)[0];
  const ask = sec.indexOf('AskUserQuestion naming `claude plugin uninstall agentctl@sd0xdev-marketplace`');
  assert.ok(ask > 0);
  assert.ok(sec.indexOf('run it after approval') > ask);
  assert.match(sec, /~\/\.claude\/plugins\/store\/agentctl_\*\.json/);
});
