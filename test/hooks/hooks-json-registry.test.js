const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve, join, dirname } = require('node:path');
const { readFileSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const hooksJsonPath = resolve(__dirname, '../../hooks/hooks.json');
const hooksConfig = JSON.parse(readFileSync(hooksJsonPath, 'utf8'));

test('hooks.json is valid JSON with hooks key', () => {
  assert.ok(hooksConfig.hooks, 'should have hooks key');
  assert.ok(hooksConfig.hooks.SessionStart, 'should have SessionStart entries');
});

test('namespace-hint SessionStart hook uses "startup|clear|compact" matcher, not empty string', () => {
  const sessionStartEntries = hooksConfig.hooks.SessionStart;
  const namespaceHintEntry = sessionStartEntries.find(
    (e) => e.hooks?.some((h) => h.command?.includes('namespace-hint'))
  );

  assert.ok(namespaceHintEntry, 'should have namespace-hint SessionStart entry');
  assert.equal(
    namespaceHintEntry.matcher,
    'startup|clear|compact',
    'namespace-hint matcher must be "startup|clear|compact": it injects namespace guidance and the ' +
    'plugin root the resident contract triggers resolve against on startup, after /clear (which wipes ' +
    'the context that carried them) and after compaction — but NOT on resume, where CLAUDE_PLUGIN_ROOT ' +
    'may be unavailable and the resumed transcript already carries the lines'
  );
});

test('post-compact-auto-loop SessionStart hook uses "compact" matcher', () => {
  const sessionStartEntries = hooksConfig.hooks.SessionStart;
  const compactEntry = sessionStartEntries.find(
    (e) => e.hooks?.some((h) => h.command?.includes('post-compact-auto-loop'))
  );

  assert.ok(compactEntry, 'should have post-compact-auto-loop SessionStart entry');
  assert.equal(compactEntry.matcher, 'compact', 'post-compact hook matcher must be "compact"');
});

test('UserPromptSubmit hook registered for user-prompt-review-guard', () => {
  const upsEntries = hooksConfig.hooks.UserPromptSubmit;
  assert.ok(upsEntries, 'should have UserPromptSubmit entries');
  assert.ok(upsEntries.length >= 1, 'should have at least 1 UserPromptSubmit hook');
  const guardEntry = upsEntries.find(
    (e) => e.hooks?.some((h) => h.command?.includes('user-prompt-review-guard'))
  );
  assert.ok(guardEntry, 'should have user-prompt-review-guard UserPromptSubmit entry');
});

test('no SessionStart hook uses empty matcher', () => {
  const sessionStartEntries = hooksConfig.hooks.SessionStart;
  const emptyMatcherEntries = sessionStartEntries.filter((e) => e.matcher === '');

  assert.equal(
    emptyMatcherEntries.length,
    0,
    'no SessionStart hook should use empty matcher "" — ' +
    'each hook must specify explicit matcher (startup, compact, resume) ' +
    'to avoid errors when CLAUDE_PLUGIN_ROOT is unavailable on non-startup events'
  );
});

// Claude Code matchers are exact tool-name matches: "Edit|Write" alternates
// on Edit and Write but never fires for NotebookEdit. The edit hooks read
// tool_input.notebook_path as a fallback, so they MUST be dispatched for
// NotebookEdit or that fallback is dead code and notebook edits bypass both
// the sensitive-file guard (PreToolUse) and the review-gate tracker (PostToolUse).
for (const { event, script } of [
  { event: 'PreToolUse', script: 'pre-edit-guard' },
  { event: 'PostToolUse', script: 'post-edit-format' },
]) {
  test(`${event} ${script} matcher includes NotebookEdit`, () => {
    const entry = hooksConfig.hooks[event].find(
      (e) => e.hooks?.some((h) => h.command?.includes(script))
    );
    assert.ok(entry, `should have ${script} ${event} entry`);
    const alts = entry.matcher.split('|');
    assert.ok(
      alts.includes('NotebookEdit'),
      `${script} matcher "${entry.matcher}" must include NotebookEdit so notebook ` +
      'edits are dispatched to the hook (matchers are exact tool-name matches)'
    );
    assert.ok(alts.includes('Edit') && alts.includes('Write'), 'must still cover Edit and Write');
  });
}

// --- reminder-layer shape (hook-lightweighting §3.2) -------------------------
//
// The registry carries reminder hooks only: no shell-wrapped inline commands,
// and no entry may reference the deleted enforcement machinery.

test('no registered command references the deleted enforcement machinery', () => {
  const flat = JSON.stringify(hooksConfig);
  for (const token of ['post-tool-review-state', 'session-init', 'dispatch-cli', 'dispatch-log']) {
    assert.equal(flat.includes(token), false, `hooks.json must not reference ${token}`);
  }
});

test('every registered command is a direct script invocation, not an inline shell wrapper', () => {
  for (const entries of Object.values(hooksConfig.hooks)) {
    for (const entry of entries) {
      for (const h of entry.hooks) {
        assert.doesNotMatch(h.command, /^bash -c /, `inline wrapper survived: ${h.command}`);
      }
    }
  }
});

// --- every entry survives the plugin root it is installed under ---------------------------------
//
// A shell-form command runs through `sh -c`, so an unquoted ${CLAUDE_PLUGIN_ROOT} splits at a space
// and the entry — guards included — fails with 127 instead of running. Inert stubs stand in for the
// scripts: this pins which file each decoded command starts, not what the real script does.

const REGISTERED = Object.entries(hooksConfig.hooks).flatMap(([event, entries]) => entries.flatMap(
  (e) => e.hooks.map((h) => ({ event, matcher: e.matcher, command: h.command }))));
const EXPECTED = [
  ['SessionStart', 'startup|clear|compact', 'scripts/namespace-hint.sh'],
  ['SessionStart', 'compact', 'hooks/post-compact-auto-loop.sh'],
  ['PreToolUse', 'Edit|Write|NotebookEdit', 'hooks/pre-edit-guard.sh'],
  ['PreToolUse', 'Bash', 'hooks/pre-bash-codex-launch-guard.sh'],
  ['PostToolUse', 'Edit|Write|NotebookEdit', 'hooks/post-edit-format.sh'],
  ['PostToolUse', 'Skill', 'hooks/post-skill-auto-loop.sh'],
  ['Stop', '', 'hooks/stop-guard.sh'],
  ['UserPromptSubmit', '', 'hooks/user-prompt-review-guard.sh'],
];

/** Runs each command under a stub plugin root and reports which stub it started, with what args. */
function dispatch(rootName, commands) {
  const base = mkdtempSync(join(tmpdir(), 'hooks-root-'));
  const root = join(base, rootName);
  try {
    for (const [, , rel] of EXPECTED) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), `#!/bin/sh\nprintf '%s|%s' '${rel}' "$#"\n`);
      chmodSync(join(root, rel), 0o755);
    }
    return commands.map((c) => {
      const r = spawnSync('sh', ['-c', c], { cwd: base, encoding: 'utf8', env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: root } });
      return r.status === 0 ? r.stdout : `exit ${r.status}`;
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test('the registry lists exactly the eight entries, each with its event, matcher and script', () => {
  assert.deepEqual(REGISTERED.map((r) => [r.event, r.matcher]), EXPECTED.map(([e, m]) => [e, m]));
});

for (const rootName of ['plugin', 'plug in', "pl'ug  (x) $HOME&in"]) {
  test(`every registered command under a plugin root named ${JSON.stringify(rootName)} → starts its own script`, () => {
    assert.deepEqual(dispatch(rootName, REGISTERED.map((r) => r.command)), EXPECTED.map(([, , rel]) => `${rel}|0`));
  });
}

test('the same dispatch over the unquoted spelling → fails under a space, works without one (negative control)', () => {
  const unquoted = REGISTERED.map((r) => r.command.replaceAll('"', ''));
  assert.deepEqual(dispatch('plugin', unquoted), EXPECTED.map(([, , rel]) => `${rel}|0`));
  assert.deepEqual(dispatch('plug in', unquoted), EXPECTED.map(() => 'exit 127'));
});
