'use strict';
// hooks/pre-bash-codex-launch-guard.sh — PreToolUse (Bash) guard on how a Codex dispatch is
// launched. `codex-transport.md` § Progress step 1 says: `run_in_background`, redirect nothing.
// The hook blocks (exit 2) a `codex-exec.js start|resume` launch that is foreground, redirects or
// pipes, wraps in nohup/setsid, or backgrounds with a trailing `&` — judged per top-level simple
// command by a quote-aware lexer — and passes everything else.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const HOOK = resolve(__dirname, '../../hooks/pre-bash-codex-launch-guard.sh');
const tempDirs = [];

function makeTempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

// A bin dir holding a jq stub that answers the two queries the hook makes: the `-r`
// `.tool_input.command // empty` extraction and the `-e … contains(...)` arbitration probe.
function setupStubBin() {
  const binDir = makeTempDir('sd0x-codex-launch-guard-bin-');
  writeFileSync(join(binDir, 'jq'), `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
let query, file, exitFlag = false;
for (const a of args) {
  if (a === '-r') continue;
  if (a === '-e') { exitFlag = true; continue; }
  if (!query) query = a; else if (!file) file = a;
}
let data = {};
try { data = JSON.parse(file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8')); } catch {}
if (query && query.includes('.tool_input.command')) {
  process.stdout.write((data.tool_input && data.tool_input.command) || '');
  process.exit(0);
}
if (query && query.includes('.tool_input.run_in_background')) {
  process.stdout.write(String((data.tool_input && data.tool_input.run_in_background) || false));
  process.exit(0);
}
const m = query && query.match(/contains\\("([^"]+)"\\)/);
if (m) {
  const strings = (o) => typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(strings) : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];
  const hit = strings(data).some((s) => s.includes(m[1]));
  if (hit) { process.stdout.write('"x"'); process.exit(0); }
  process.exit(exitFlag ? 1 : 0);
}
process.stdout.write('');
`);
  chmodSync(join(binDir, 'jq'), 0o755);
  return binDir;
}

function runHook(command, { binDir = setupStubBin(), env = {}, hookPath = HOOK, background = true } = {}) {
  return spawnSync('bash', [hookPath], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command, run_in_background: background } }),
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, ...env },
  });
}

const START = 'node scripts/codex-exec.js --protocol 1 start --dir /tmp/codex-exec-abc';
const RESUME = 'node .claude/scripts/codex-exec.js --protocol 1 resume --dir /tmp/codex-exec-abc';

// === blocked launch shapes =====================================================================

for (const [label, command] of [
  ['nohup + redirect + trailing &', `nohup ${START} > /tmp/codex-exec-abc/log 2>&1 &`],
  ['stderr merged into stdout', `${START} 2>&1`],
  ['stdout to /dev/null on resume', `${RESUME} >/dev/null`],
  ['stderr to a file', `${START} 2> /tmp/codex-exec-abc/adapter.err`],
  ['append redirect', `${START} >> /tmp/log`],
  ['setsid wrapper', `setsid ${START}`],
  ['trailing & alone', `${START} &`],
  ['trailing & after spaces', `${START} &   `],
  ['redirection BEFORE the command word', `2>/tmp/codex-exec-abc/adapter.err ${START}`],
  ['piped — control record discarded', `${START} | tail -n 0`],
  ['redirect on a later list segment', `cd /tmp && ${RESUME} 2>&1`],
  ['leading &> redirect of both streams', `&>/tmp/log ${START}`],
  ['trailing &> redirect', `${START} &> /tmp/log`],
  ['spaced prefix redirection', `2> /tmp/codex-exec-abc/adapter.err ${START}`],
  ['second launch redirected after a clean first one — every launch is scanned', `${START} && node scripts/codex-exec.js --protocol 1 start --dir /tmp/b 2>/tmp/b/adapter.err`],
  ['launch on the right side of a pipe', `echo start | ${START}`],
  ['launch inside a subshell, redirected', `(${START} 2>&1)`],
  ['redirect applied to the enclosing subshell', `(${START}) 2>/tmp/err`],
  ['enclosing subshell piped', `(${START}) | tail -n 0`],
  ['enclosing brace group redirected', `{ ${START}; } > /tmp/log 2>&1`],
  ['node option before the script path, redirected', `node --no-warnings scripts/codex-exec.js --protocol 1 start --dir /tmp/x 2>/tmp/log`],
  ['node -r option with a value before the script path, piped', `node -r /tmp/pre.js scripts/codex-exec.js --protocol 1 resume --dir /tmp/x | tail -n 0`],
  ['adapter name carried in a variable used inside the path, redirected', `ADAPTER=codex-exec.js; node "scripts/$ADAPTER" --protocol 1 start --dir /tmp/a 2>/tmp/log`],
  ['adapter path exported then used, piped', `export ADAPTER=scripts/codex-exec.js; node "$ADAPTER" --protocol 1 resume --dir /tmp/a | tail -n 0`],
  ['prefix assignment on the launch does not affect that command (bash expands first): earlier value is the adapter', `ADAPTER=scripts/codex-exec.js; ADAPTER=scripts/worker.js node "$ADAPTER" --protocol 1 start --dir /tmp/a 2>/tmp/log`],
  ['prefix assignment on an intermediate command is temporary — the adapter value survives for the later launch', `ADAPTER=scripts/codex-exec.js; ADAPTER=scripts/worker.js node /dev/null; node "$ADAPTER" --protocol 1 start --dir /tmp/a 2>&1`],
  ['adapter path carried in a shell variable, redirected', `ADAPTER=scripts/codex-exec.js; node "$ADAPTER" --protocol 1 start --dir /tmp/a 2>/tmp/log`],
  ['quoted command and adapter words, redirected', `"node" "scripts/codex-exec.js" --protocol 1 start --dir /tmp/a 2>/tmp/err`],
]) {
  test(`blocks a start/resume launch: ${label} → exit 2 with guidance on stderr`, () => {
    const r = runHook(command);
    assert.equal(r.status, 2, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /\[Codex Launch Guard\] Blocked/);
    assert.match(r.stderr, /run_in_background: true/);
    assert.match(r.stderr, /codex-transport\.md § Progress/);
  });
}

// === allowed shapes =============================================================================

for (const [label, command] of [
  ['clean start', START],
  ['clean resume', RESUME],
  ['start chained with && (no redirect)', `${START} && echo done`],
  ['alloc redirected — short, not guarded', 'node scripts/codex-exec.js --protocol 1 alloc > /tmp/alloc.json'],
  ['cleanup with stderr dropped — short, not guarded', 'node scripts/codex-exec.js --protocol 1 cleanup --dir /tmp/x 2>/dev/null'],
  ['alloc then prompt write via cat > (no start on the line)', `node scripts/codex-exec.js --protocol 1 alloc && bash -c 'cat > "$1"' _ /tmp/p`],
  ['non-Codex command with redirect', 'git status && ls > out.txt'],
  ['grep for the word start inside the adapter source', 'grep -n start scripts/codex-exec.js > /tmp/out'],
  ['&& is not a trailing &', `${START} && true`],
  ['the launch text quoted as a grep pattern, output redirected — grep is the command, not node', `grep 'node scripts/codex-exec.js --protocol 1 start --dir /tmp/x' docs/example.md > /tmp/matches`],
  ['env assignment before the command word', `CODEX_HOME=/tmp/h ${START}`],
  ['a comment line naming the launch above a clean launch', `# node scripts/codex-exec.js --protocol 1 start > log\n${START}`],
  ['quoted text containing ; and a launch with 2>&1 — quoting is respected', `grep 'example; node scripts/codex-exec.js --protocol 1 start 2>&1' docs/example.md`],
  ['double-quoted argument with a space on a clean launch', `${START} --report-file "/tmp/my dir/report.md"`],
  ['pipe elsewhere in the tool input, not on the launch', `cat scripts/codex-exec.js | grep start > /tmp/o`],
  ['node option before the script path on a clean launch', `node --no-warnings ${START.slice(5)}`],
  ['a variable script word with no codex-exec.js anywhere in the input — not a launch', `node "$SCRIPT" start 2>/tmp/log`],
  ['an unrelated script through a variable while another variable holds the adapter', `ADAPTER=scripts/codex-exec.js; SCRIPT=/dev/null; node "$SCRIPT" start 2>/tmp/log`],
  ['a comment naming the adapter above an unrelated variable-script launch', `# codex-exec.js\nSCRIPT=scripts/worker.js; node "$SCRIPT" start 2>/tmp/log`],
  ['a grep for the adapter name, then an unrelated variable-script launch', `grep -l codex-exec.js docs/ ; SCRIPT=scripts/worker.js; node "$SCRIPT" start 2>/tmp/log`],
  ['prefix assignment on the launch does not affect that command: earlier value is an unrelated script', `ADAPTER=scripts/worker.js; ADAPTER=scripts/codex-exec.js node "$ADAPTER" --protocol 1 start --dir /tmp/a 2>/tmp/log`],
  ['prefix assignment with no earlier value — bash runs `node ""`, not the adapter', `ADAPTER=scripts/codex-exec.js node "$ADAPTER" --protocol 1 start --dir /tmp/a 2>&1`],
  ['prefix assignment of the adapter on an intermediate command does not persist to the later launch', `ADAPTER=scripts/worker.js; ADAPTER=scripts/codex-exec.js node /dev/null; node "$ADAPTER" --protocol 1 start --dir /tmp/a 2>&1`],
  ['a variable assigned in an earlier tool call (unknown here) — documented boundary', `node "$CODEX_LOCATOR" --protocol 1 start --dir /tmp/a 2>/tmp/log`],
  ['clean launch through a shell variable', `ADAPTER=scripts/codex-exec.js; node "$ADAPTER" --protocol 1 start --dir /tmp/a`],
  ['clean launch inside a subshell, nothing attached to the group', `(cd /tmp && ${START})`],
  ['a sibling subshell redirected, the launch outside it', `(ls > /tmp/l) && ${START}`],
]) {
  test(`allows: ${label} → exit 0, silent`, () => {
    const r = runHook(command);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(r.stderr, '');
  });
}

test('foreground launch with a quoted adapter path → exit 2 (quoting does not hide a launch)', () => {
  const r = runHook('node "scripts/codex-exec.js" --protocol 1 start --dir /tmp/a', { background: false });
  assert.equal(r.status, 2, `stderr: ${r.stderr}`);
});

test('foreground launch (run_in_background false) → exit 2 naming the launch mode', () => {
  const r = runHook(START, { background: false });
  assert.equal(r.status, 2, `stderr: ${r.stderr}`);
  assert.match(r.stderr, /not launched with run_in_background: true/);
});

test('run_in_background absent from tool_input → exit 2 (fail-closed on the launch mode)', () => {
  const r = spawnSync('bash', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: START } }),
    encoding: 'utf8',
    env: { ...process.env, PATH: `${setupStubBin()}:${process.env.PATH}` },
  });
  assert.equal(r.status, 2, `stderr: ${r.stderr}`);
});

test('empty command → exit 0 (no-op)', () => {
  const r = runHook('');
  assert.equal(r.status, 0);
});

test('jq unusable → fail-open exit 0, even on a redirected launch (the documented fail-open)', () => {
  // A jq that fails is what "jq unavailable" looks like from inside the hook: the `|| true`
  // extraction yields an empty command and the guard has nothing to judge.
  const brokenBin = makeTempDir('sd0x-codex-launch-guard-broken-bin-');
  writeFileSync(join(brokenBin, 'jq'), '#!/bin/bash\nexit 127\n');
  chmodSync(join(brokenBin, 'jq'), 0o755);
  const r = runHook(`nohup ${START} > /tmp/log 2>&1 &`, { binDir: brokenBin });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
});

test('node unusable → fail-open exit 0 (the judgement needs node; documented like the jq case)', () => {
  // A stub `node` that exits 127 stands in for a host without node: the hook cannot judge and passes.
  const bin = setupStubBin();
  writeFileSync(join(bin, 'node'), '#!/bin/bash\nexit 127\n');
  chmodSync(join(bin, 'node'), 0o755);
  // the jq stub is itself a node script — give it a real interpreter via an absolute shebang copy
  const jqSrc = readFileSync(join(bin, 'jq'), 'utf8').replace('#!/usr/bin/env node', `#!${process.execPath}`);
  writeFileSync(join(bin, 'jq'), jqSrc);
  const r = runHook(`${START} 2>&1`, { binDir: bin });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
});

// === the embedded judgement must survive bash quoting =========================================

test('hook parses (bash -n) and the embedded GUARD_JS carries no apostrophe that would end its quote', () => {
  const r = spawnSync('bash', ['-n', HOOK], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const src = readFileSync(HOOK, 'utf8');
  const js = src.slice(src.indexOf("GUARD_JS='") + 10, src.indexOf("'\nreason=$("));
  assert.ok(js.length > 100, 'GUARD_JS block not found');
  assert.ok(!js.includes("'"), 'an apostrophe inside the single-quoted GUARD_JS ends the string and the hook exits 127 (measured)');
});

// === the guard path is real: mutate the production check and watch the blocked case pass =========

test('guard proof: with the redirect branch removed from the hook, the redirected launch passes', () => {
  const src = readFileSync(HOOK, 'utf8');
  const marker = 'else if (inherited(cmd, "redirect")) reason = "stdout/stderr redirected (>, 2>, 2>&1, <) on the launch command or its enclosing group";';
  assert.ok(src.includes(marker), 'the redirect branch must exist to be mutated');
  const dir = makeTempDir('sd0x-codex-launch-guard-mutant-');
  const mutant = join(dir, 'pre-bash-codex-launch-guard.sh');
  writeFileSync(mutant, src.replace(marker, 'else if (inherited(cmd, "redirect")) reason = "";'));
  chmodSync(mutant, 0o755);
  const blocked = runHook(`${START} 2>&1`);
  const mutated = runHook(`${START} 2>&1`, { hookPath: mutant });
  assert.equal(blocked.status, 2);
  assert.equal(mutated.status, 0, 'the mutant must let the redirected launch through — otherwise the test never exercised the guard');
});

// === arbitration: plugin copy defers to a registered local copy =================================

test('arbitration: defers (exit 0) when a local copy is installed and registered in settings', () => {
  const project = makeTempDir('sd0x-codex-launch-guard-project-');
  const localHooks = join(project, '.claude', 'hooks');
  mkdirSync(localHooks, { recursive: true });
  writeFileSync(join(localHooks, 'pre-bash-codex-launch-guard.sh'), '#!/bin/bash\nexit 0\n');
  chmodSync(join(localHooks, 'pre-bash-codex-launch-guard.sh'), 0o755);
  writeFileSync(join(project, '.claude', 'settings.json'), JSON.stringify({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/pre-bash-codex-launch-guard.sh' }] }] },
  }));
  const r = runHook(`${START} 2>&1`, { env: { CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_ROOT: resolve(__dirname, '../..') } });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
});

test('arbitration: local copy present but NOT registered → the plugin copy still guards (exit 2)', () => {
  const project = makeTempDir('sd0x-codex-launch-guard-project-');
  const localHooks = join(project, '.claude', 'hooks');
  mkdirSync(localHooks, { recursive: true });
  writeFileSync(join(localHooks, 'pre-bash-codex-launch-guard.sh'), '#!/bin/bash\nexit 0\n');
  chmodSync(join(localHooks, 'pre-bash-codex-launch-guard.sh'), 0o755);
  writeFileSync(join(project, '.claude', 'settings.json'), JSON.stringify({ hooks: {} }));
  const r = runHook(`${START} 2>&1`, { env: { CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_ROOT: resolve(__dirname, '../..') } });
  assert.equal(r.status, 2, `stderr: ${r.stderr}`);
});

// === registry ====================================================================================

test('hooks.json registers the guard under PreToolUse with matcher Bash', () => {
  const config = JSON.parse(readFileSync(resolve(__dirname, '../../hooks/hooks.json'), 'utf8'));
  const entry = config.hooks.PreToolUse.find((e) => e.hooks?.some((h) => h.command?.includes('pre-bash-codex-launch-guard')));
  assert.ok(entry, 'PreToolUse must carry a pre-bash-codex-launch-guard entry');
  assert.equal(entry.matcher, 'Bash');
});
