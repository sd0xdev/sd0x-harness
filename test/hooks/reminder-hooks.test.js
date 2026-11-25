'use strict';
// The four reminder hooks: md out, exit 0 on every path, state check first,
// one git fallback with the cannot-tell sentence. Contract:
// docs/features/hook-lightweighting/2-tech-spec.md §3.2, §6.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
  rmSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
} = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = resolve(__dirname, '../..');
const HOOKS = {
  stop: join(ROOT, 'hooks', 'stop-guard.sh'),
  prompt: join(ROOT, 'hooks', 'user-prompt-review-guard.sh'),
  skill: join(ROOT, 'hooks', 'post-skill-auto-loop.sh'),
  compact: join(ROOT, 'hooks', 'post-compact-auto-loop.sh'),
  format: join(ROOT, 'hooks', 'post-edit-format.sh'),
};

const tempDirs = [];
after(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

function git(repo, ...args) {
  execFileSync(
    'git',
    ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function makeRepo() {
  const repo = tmp('rh-repo-');
  git(repo, 'init', '-q', '-b', 'master'); // pinned: a global init.defaultBranch must not change the fixture
  writeFileSync(join(repo, 'a.js'), 'const a = 1;\n');
  writeFileSync(join(repo, 'readme.md'), '# doc\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

function runHook(hookPath, cwd, home, { shell = 'bash', input = '{}' } = {}) {
  return spawnSync(shell, [hookPath], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '', HOOK_BYPASS: '', GIT_CONFIG_NOSYSTEM: '1' },
  });
}

function noteState(repo, home, plane, verdict) {
  const r = spawnSync('node', [join(ROOT, 'scripts', 'review-state.js'), 'note', plane, verdict], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' },
  });
  assert.equal(r.status, 0, r.stderr);
}

// A copy of one hook in a bare temp dir has no ../scripts/review-state.js, so
// it must take the git fallback.
function fallbackCopy(name) {
  const dir = tmp('rh-nochecker-');
  mkdirSync(join(dir, 'hooks'));
  const p = join(dir, 'hooks', `${name}.sh`);
  copyFileSync(HOOKS[name === 'stop-guard' ? 'stop' : name === 'user-prompt-review-guard' ? 'prompt' : 'compact'], p);
  chmodSync(p, 0o755);
  return p;
}

test('stop: state-driven — owed planes print, a noted-pass unchanged tree is silent', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  let r = runHook(HOOKS.stop, repo, home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /code_review/, 'dirty unnoted code plane is reminded');
  noteState(repo, home, 'code_review', 'pass');
  noteState(repo, home, 'precommit', 'pass');
  r = runHook(HOOKS.stop, repo, home);
  assert.equal(r.status, 0);
  // No gate reminder is owed. The one line left is the git-autonomy R4 offer: gates passed with
  // uncommitted work on a real branch — here `master`, protected, so a commit-only menu.
  assert.doesNotMatch(r.stdout, /📋/, 'noted-pass on the current digest earns silence from the gate reminders');
  assert.match(r.stdout, /^🟢 master：gate 皆已通過 → 用 AskUserQuestion 提供 commit 選單/);
  assert.equal(r.stdout.trim().split('\n').length, 1, 'exactly one offer line');
  // Once the menu has been shown at this digest, the hook is silent again.
  const CHECKER = join(ROOT, 'scripts', 'review-state.js');
  const digest = JSON.parse(execFileSync('node', [CHECKER, 'offer', '--format=json'],
    { cwd: repo, env: { ...process.env, HOME: home } }).toString()).digest;
  execFileSync('node', [CHECKER, 'offer-shown', digest], { cwd: repo, env: { ...process.env, HOME: home } });
  r = runHook(HOOKS.stop, repo, home);
  assert.equal(r.stdout, '', 'a shown offer is not repeated at the same digest');
});

test('stop: checker missing → git fallback prints plane lines and says git cannot tell whether the gates passed', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  const r = spawnSync('bash', [fallbackCopy('stop-guard')], {
    cwd: repo,
    input: '{}',
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /code 平面有未提交變更/);
  assert.match(r.stdout, /\/codex-review-fast → \/precommit（git 狀態看不出這兩個 gate 是否已在最後一次編輯後通過/);
  assert.doesNotMatch(r.stdout, /忽略此行/, 'a finished review alone must not excuse the owed precommit');
  assert.doesNotMatch(r.stdout, /doc 平面/, 'clean doc plane earns no line');
});

test('post-compact: checker missing → the same cannot-tell sentence, for both planes', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  writeFileSync(join(repo, 'readme.md'), '# doc v2\n');
  const r = runHook(fallbackCopy('post-compact-auto-loop'), repo, home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\/precommit（git 狀態看不出這兩個 gate/);
  assert.match(r.stdout, /\/codex-review-doc（git 狀態看不出這個 gate/);
  assert.doesNotMatch(r.stdout, /忽略此行/);
});

// --- a tree git cannot read is neither clean nor changed ----------------------------------------

/** A repository whose `git status` fails while `rev-parse` still works: an unreadable index. */
function brokenIndexRepo() {
  const repo = makeRepo();
  writeFileSync(join(repo, '.git', 'index'), 'garbage');
  return repo;
}

test('user-prompt fallback: git status fails → silent; a successful empty status → change=none', () => {
  const home = tmp('rh-home-');
  const hook = fallbackCopy('user-prompt-review-guard');
  const broken = runHook(hook, brokenIndexRepo(), home);
  assert.deepEqual([broken.status, broken.stdout], [0, '']);
  assert.match(runHook(hook, makeRepo(), home).stdout, /^\[AUTO_LOOP_STATE\] change=none source=git_status/);
});

test('user-prompt fallback: a file named ok, and a rename involving it, are ordinary records', () => {
  const home = tmp('rh-home-');
  const hook = fallbackCopy('user-prompt-review-guard');
  const repo = makeRepo();
  writeFileSync(join(repo, 'ok'), 'x\n');
  assert.match(runHook(hook, repo, home).stdout, /^\[AUTO_LOOP_STATE\] change=code source=git_status/);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'ok');
  git(repo, 'mv', 'ok', 'ok.md');
  assert.match(runHook(hook, repo, home).stdout, /^\[AUTO_LOOP_STATE\] change=code,doc source=git_status/);
});

test('state path: git status fails → change=unknown, and the owed lines say the read was incomplete', () => {
  const home = tmp('rh-home-');
  const repo = brokenIndexRepo();
  assert.match(runHook(HOOKS.prompt, repo, home).stdout, /^\[AUTO_LOOP_STATE\] change=unknown unverified=code,doc reviews=/);
  for (const hook of [HOOKS.stop, HOOKS.compact]) {
    const out = runHook(hook, repo, home).stdout;
    assert.equal((out.match(/平面讀取不完整，無法判斷是否有變更或是否已通過/g) || []).length, 3, 'all three planes stay owed');
    assert.doesNotMatch(out, /有未提交變更且/, 'a change nobody read is not asserted');
  }
});

test('a git status that fails after printing a record → no fallback asserts that record\'s plane', () => {
  const home = tmp('rh-home-');
  const bin = tmp('rh-bin-');
  const real = execFileSync('sh', ['-c', 'command -v git']).toString().trim();
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nfor a in "$@"; do if [ "$a" = status ]; then case " $* " in *" -z "*) printf '?? partial.md\\0';; *) echo '?? partial.md';; esac; exit 1; fi; done\nexec ${real} "$@"\n`);
  chmodSync(join(bin, 'git'), 0o755);
  const repo = makeRepo();
  for (const name of ['stop-guard', 'post-compact-auto-loop', 'user-prompt-review-guard']) {
    const r = spawnSync('bash', [fallbackCopy(name)], { cwd: repo, input: '{}', encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '' } });
    assert.equal(r.status, 0, name);
    assert.doesNotMatch(r.stdout, /平面有未提交變更|change=|partial\.md/, name);
  }
});

test('post-compact: git status fails → says so instead of showing an empty list', () => {
  const home = tmp('rh-home-');
  const out = runHook(HOOKS.compact, brokenIndexRepo(), home).stdout;
  assert.match(out, /未提交變更：git status 讀取失敗，無法判斷/);
  assert.doesNotMatch(out, /前 20 筆/);
  const clean = runHook(HOOKS.compact, makeRepo(), home).stdout;
  assert.doesNotMatch(clean, /未提交變更/, 'a clean tree that was read prints no list and no failure');
});

test('post-compact: 3000 untracked files → the branch and exactly the first 20 records', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  for (let i = 0; i < 3000; i += 1) writeFileSync(join(repo, `file-with-a-reasonably-long-name-for-status-${String(i).padStart(4, '0')}.txt`), '');
  const status = execFileSync('git', ['-C', repo, 'status', '--porcelain=v1', '-uall']).toString();
  assert.ok(status.length > 65536, 'fixture premise: the listing is larger than a pipe buffer');
  const out = runHook(HOOKS.compact, repo, home).stdout;
  assert.match(out, /branch=master/);
  assert.deepEqual(out.split('\n').filter((l) => l.startsWith('?? ')), status.split('\n').slice(0, 20));
});

test('fallback classifier: .md/.mdx doc, .MD code, rename dirties both planes, spaces survive -z', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  writeFileSync(join(repo, 'UPPER.MD'), 'not a doc by the case-sensitive rule\n');
  writeFileSync(join(repo, 'with space.mdx'), '# doc\n');
  const hook = fallbackCopy('stop-guard');
  let r = spawnSync('bash', [hook], { cwd: repo, input: '{}', encoding: 'utf8', env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '' } });
  assert.match(r.stdout, /code 平面/, '.MD is code (case-sensitive, as tree-digest implements)');
  assert.match(r.stdout, /doc 平面/, '.mdx with a space is doc');
  // A staged rename md→js dirties BOTH planes (the union rule).
  const repo2 = makeRepo();
  git(repo2, 'mv', 'readme.md', 'renamed.js');
  r = spawnSync('bash', [hook], { cwd: repo2, input: '{}', encoding: 'utf8', env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '' } });
  assert.match(r.stdout, /code 平面/, 'rename target dirties code');
  assert.match(r.stdout, /doc 平面/, 'rename source dirties doc');
});

test('user-prompt: fact line from state, source=git_status on fallback, silent when git unreadable', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  let r = runHook(HOOKS.prompt, repo, home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[AUTO_LOOP_STATE\] change=none reviews=.* source=state/);
  const noChecker = fallbackCopy('user-prompt-review-guard');
  r = spawnSync('bash', [noChecker], { cwd: repo, input: '{}', encoding: 'utf8', env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '' } });
  assert.match(r.stdout, /^\[AUTO_LOOP_STATE\] change=none source=git_status/);
  const nonRepo = tmp('rh-nonrepo-');
  r = spawnSync('bash', [noChecker], { cwd: nonRepo, input: '{}', encoding: 'utf8', env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '', GIT_CEILING_DIRECTORIES: '' } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'no git, no claims — silent exit 0');
});

test('post-skill prints its one unconditional line whatever arrived on stdin', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  for (const input of ['{}', '{"tool_response":{"error":"failed"}}', 'not json at all']) {
    const r = runHook(HOOKS.skill, repo, home, { input });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /review → precommit → doc-sync/);
    assert.match(r.stdout, /本行不知道你剛跑了哪個 skill/);
  }
});

test('post-compact: git context + the same gates-owed nudge as stop', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  writeFileSync(join(repo, 'readme.md'), '# doc v2\n');
  const r = runHook(HOOKS.compact, repo, home);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /branch=/);
  assert.match(r.stdout, /readme\.md/, 'uncommitted file list is replayed');
  assert.match(r.stdout, /doc_review/, 'owed plane nudge included');
});

test('every hook exits 0 outside a repository and in an empty dir', () => {
  const nonRepo = tmp('rh-nonrepo-');
  const home = tmp('rh-home-');
  for (const [name, hook] of Object.entries(HOOKS)) {
    const r = runHook(hook, nonRepo, home);
    assert.equal(r.status, 0, `${name} must exit 0 (stderr: ${r.stderr})`);
  }
});

// Same availability guard as test/skills/remind.test.js: the CI runner (ubuntu-latest)
// ships no zsh, and spawnSync on a missing binary returns status null — which reads as
// a hook failure it is not. CI installs zsh explicitly (.github/workflows/ci.yml) so
// the portability guard still runs there; the skip covers other zsh-less environments.
const HAVE_ZSH = (() => {
  try {
    execFileSync('zsh', ['-c', 'exit 0'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('identical behaviour under zsh and bash (fallback path included)', { skip: !HAVE_ZSH }, () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  for (const hook of [HOOKS.stop, HOOKS.prompt, fallbackCopy('stop-guard')]) {
    const b = runHook(hook, repo, home, { shell: 'bash' });
    const z = runHook(hook, repo, home, { shell: 'zsh' });
    assert.equal(z.status, b.status, hook);
    assert.equal(z.stdout, b.stdout, hook);
  }
  // Absolute pin so two identically-broken shells cannot agree their way past:
  const b = runHook(HOOKS.stop, repo, home, { shell: 'zsh' });
  assert.match(b.stdout, /code_review/);
});

test('post-edit-format creates and mutates no file beyond the formatted target', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  writeFileSync(join(repo, 'b.js'), 'const b=1\n');
  const before = readdirSync(repo).sort().join(',');
  const r = runHook(HOOKS.format, repo, home, {
    input: JSON.stringify({ tool_input: { file_path: join(repo, 'b.js') } }),
  });
  assert.equal(r.status, 0, r.stderr);
  const after_ = readdirSync(repo).sort().join(',');
  assert.equal(after_, before, 'no mirror, no sidecar, no lock — nothing appears');
});

test('AUTO_LOOP_CHECK_TIMEOUT guard: 0 must not disable the bound (timeout 0 / alarm 0 run unbounded)', () => {
  for (const hook of [HOOKS.stop, HOOKS.prompt, HOOKS.compact]) {
    const src = readFileSync(hook, 'utf8');
    assert.match(src, /\[ "\$_T" -gt 0 \] \|\| _T=10/, `${hook}: strictly-positive timeout guard missing`);
  }
});

test('stop: a custom git flow with no override → one 🧭 line per session, from the hook input session id', () => {
  const repo = makeRepo();
  const home = tmp('rh-home-');
  execFileSync('git', ['-C', repo, 'switch', '-q', '-c', 'JIRA-77']);
  const input = (id) => JSON.stringify({ session_id: id, hook_event_name: 'Stop' });
  const first = runHook(HOOKS.stop, repo, home, { input: input('sess-a') });
  assert.equal(first.status, 0);
  assert.match(first.stdout, /🧭 偵測到自訂 git 流程（branch-name）/);
  assert.doesNotMatch(runHook(HOOKS.stop, repo, home, { input: input('sess-a') }).stdout, /🧭/, 'not twice in one session');
  assert.doesNotMatch(runHook(HOOKS.stop, repo, home, { input: '{}' }).stdout, /🧭/, 'no session id, no custom-flow line');
  assert.doesNotMatch(runHook(HOOKS.stop, repo, home, { input: '{"session_id":"x; rm -rf /"}' }).stdout, /🧭/,
    'an id that is not a plain token is dropped, never passed on');
});
