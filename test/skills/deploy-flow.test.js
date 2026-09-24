'use strict';
// /deploy-flow (git-autonomy R5): the skill's executable half, scripts in temp repos. Contract:
// docs/features/git-autonomy/2-tech-spec.md § 3.2 (step grammar) and § 3.3 (/deploy-flow).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, chmodSync, symlinkSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = resolve(__dirname, '../..');
const DF = join(ROOT, 'skills/deploy-flow/scripts/deploy-flow.sh');
const SKILL = readFileSync(join(ROOT, 'skills/deploy-flow/SKILL.md'), 'utf8');
const SPEC = readFileSync(join(ROOT, 'docs/features/git-autonomy/2-tech-spec.md'), 'utf8');

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const df = (repo, args, env = {}) => spawnSync('/bin/bash', [DF, args[0], '--root', repo, ...args.slice(1)],
  { encoding: 'utf8', env: { ...process.env, ...env } });

/** main + develop (one extra commit) + release/2026.09 at main, with a declared workflow. */
function makeRepo({ workflow = 'merge develop -> release/*', runSteps = null, extra = '' } = {}) {
  const repo = tmp('df-repo-');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  for (const [k, v] of [['user.name', 'Dev'], ['user.email', 'dev@example.com'], ['commit.gpgsign', 'false']]) git(repo, 'config', k, v);
  mkdirSync(join(repo, 'rules')); mkdirSync(join(repo, 'scripts'));
  writeFileSync(join(repo, 'scripts', 'deploy.sh'), '#!/bin/sh\nprintf "argc=%s\\n" "$#"; for a in "$@"; do printf "arg=%s\\n" "$a"; done\n');
  chmodSync(join(repo, 'scripts', 'deploy.sh'), 0o755);
  writeFileSync(join(repo, 'rules', 'git-workflow-project.md'),
    `# x\n\n## Deploy Workflow\n\n\`\`\`text\n${workflow}\n\`\`\`\n${runSteps ? `\n## Run Steps\n\n${runSteps}\n` : ''}${extra}`);
  writeFileSync(join(repo, 'app.js'), 'const v = 1;\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'branch', 'release/2026.09');
  git(repo, 'switch', '-q', '-c', 'develop');
  writeFileSync(join(repo, 'feature.js'), 'const f = 1;\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'feature');
  git(repo, 'switch', '-q', 'main');
  return repo;
}
const oid = (repo, b) => git(repo, 'rev-parse', `refs/heads/${b}`);

// ── parse ────────────────────────────────────────────────────────────────────────────────────
test('parse when the declaration is valid → one TSV line per step, then the mode', () => {
  const repo = makeRepo({ workflow: 'merge develop -> release/*\nmerge release/* -> main --ff-only\nrun scripts/deploy.sh staging' });
  const r = df(repo, ['parse']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), [
    'merge\tdevelop\trelease/*\t--no-ff', 'merge\trelease/*\tmain\t--ff-only', 'run\tscripts/deploy.sh\tstaging', 'mode\tprint']);
});

test('parse when a line breaks the grammar → exit 2, and nothing of the block is used', () => {
  const bad = {
    'a token outside the allowed set': 'run scripts/deploy.sh $(whoami)',
    'double spaces between tokens': 'merge develop  -> main',
    'an unknown step': 'rebase develop -> main',
    'a bad merge form': 'merge develop -> main --squash',
    'a path outside the repository': 'run ../outside.sh',
    'an absolute path': 'run /bin/sh',
    'a missing script': 'run scripts/nope.sh',
  };
  for (const [why, workflow] of Object.entries(bad)) {
    const r = df(makeRepo({ workflow }), ['parse']);
    assert.equal(r.status, 2, `${why}: ${r.stdout}`);
    assert.equal(r.stdout, '', `${why}: no step may leak out of a rejected block`);
  }
});

test('parse when Run Steps is invalid, or a script path is a symlink → exit 2', () => {
  assert.equal(df(makeRepo({ runSteps: 'always' }), ['parse']).status, 2);
  const repo = makeRepo({ workflow: 'run scripts/link.sh' });
  symlinkSync('/bin/sh', join(repo, 'scripts', 'link.sh'));
  assert.equal(df(repo, ['parse']).status, 2, 'a symlink could point anywhere; the named file must be the one that runs');
});

test('parse when commented examples sit in the scaffold → they are not steps', () => {
  const repo = makeRepo({ workflow: 'merge develop -> main' });
  const tpl = readFileSync(join(ROOT, 'rules/git-workflow-project.md'), 'utf8');
  writeFileSync(join(repo, 'rules', 'git-workflow-project.md'), tpl);
  const r = df(repo, ['parse']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'mode\tprint\n', 'the shipped scaffold declares nothing and defaults to print');
});

// ── merge ────────────────────────────────────────────────────────────────────────────────────
test('merge on the happy path → a --no-ff merge of the approved object with the fixed message', () => {
  const repo = makeRepo();
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  const r = df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(repo, 'log', '-1', '--format=%P'), `${t} ${s}`);
  assert.equal(git(repo, 'log', '-1', '--format=%B'), "Merge branch 'develop' into release/2026.09");
});

test('merge refusals → dirty tree, undeclared step and a moved branch all exit 3 with nothing merged', () => {
  const repo = makeRepo();
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  writeFileSync(join(repo, 'app.js'), 'const v = 2;\n');
  assert.equal(df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff']).status, 3, 'dirty tree');
  git(repo, 'checkout', '--', 'app.js');
  assert.equal(df(repo, ['merge', 'main', 'release/2026.09', oid(repo, 'main'), t, '--no-ff']).status, 3, 'undeclared source');
  assert.equal(df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--ff-only']).status, 3, 'undeclared form');
  git(repo, 'switch', '-q', 'develop');
  writeFileSync(join(repo, 'later.js'), '1;\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'moved');
  git(repo, 'switch', '-q', 'main');
  const moved = df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff']);
  assert.equal(moved.status, 3);
  assert.match(moved.stderr, /moved after approval/);
  assert.equal(oid(repo, 'release/2026.09'), t, 'nothing merged');
});

test('merge on a conflict → aborted, exit 5, target unchanged and no merge in progress', () => {
  const repo = makeRepo();
  git(repo, 'switch', '-q', 'release/2026.09');
  writeFileSync(join(repo, 'feature.js'), 'const f = 2;\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'clash');
  git(repo, 'switch', '-q', 'main');
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  const r = df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff']);
  assert.equal(r.status, 5, r.stderr);
  assert.equal(oid(repo, 'release/2026.09'), t);
  assert.equal(existsSync(join(repo, '.git', 'MERGE_HEAD')), false);
});

test('merge with a valid branch name containing $(…) → merged as data, never evaluated', () => {
  const name = 'feat/$(touch.PWNED)'; // a legal ref name; a shell string would run `touch.PWNED`
  const repo = makeRepo({ workflow: `merge ${name} -> main` });
  git(repo, 'branch', name, 'develop');
  const r = df(repo, ['merge', name, 'main', oid(repo, name), oid(repo, 'main'), '--no-ff']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(repo, 'log', '-1', '--format=%B'), `Merge branch '${name}' into main`);
  assert.equal(existsSync(join(repo, 'touch.PWNED')), false, 'no shell evaluation of a branch name');
});

test('merge --ff-only → HEAD becomes the source OID and the target is its ancestor; no message checked', () => {
  const repo = makeRepo({ workflow: 'merge develop -> release/* --ff-only' });
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  const r = df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--ff-only']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(oid(repo, 'release/2026.09'), s);
});

test('merge when a commit-msg hook appends an AI trailer → caught on read-back, exit 4 naming the OID', () => {
  const repo = makeRepo();
  const hooks = join(repo, '.git', 'hooks');
  writeFileSync(join(hooks, 'commit-msg'), '#!/bin/sh\nprintf "\\nCo-Authored-By: Claude <noreply@anthropic.com>\\n" >> "$1"\n');
  chmodSync(join(hooks, 'commit-msg'), 0o755);
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  const r = df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff'], { ALLOW_AI_COAUTHOR: '1' });
  assert.equal(r.status, 4, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, new RegExp(`merge commit ${git(repo, 'rev-parse', 'HEAD')}`), 'names the offending OID');
  assert.match(git(repo, 'log', '-1', '--format=%B'), /Co-Authored-By/, 'nothing is amended — that is the developer\'s call');
});

test('merge read-back when a replace ref masks the message → the recorded commit is still judged', () => {
  const repo = makeRepo();
  const hooks = join(repo, '.git', 'hooks');
  writeFileSync(join(hooks, 'post-commit'), '#!/bin/sh\n');
  const hook = '#!/bin/sh\nprintf "\\nGenerated by Claude\\n" >> "$1"\n';
  writeFileSync(join(hooks, 'commit-msg'), hook); chmodSync(join(hooks, 'commit-msg'), 0o755);
  // A replace ref for a commit that does not exist yet cannot be planted in advance, so the
  // property is pinned at its mechanism: the read-back runs with --no-replace-objects.
  assert.match(readFileSync(DF, 'utf8'), /--no-replace-objects log -1 --format=%B/);
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  assert.equal(df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff']).status, 4);
});

// ── candidates / run ─────────────────────────────────────────────────────────────────────────
test('candidates for a pattern → only existing local branches under the prefix', () => {
  const repo = makeRepo();
  git(repo, 'branch', 'release/2026.10');
  git(repo, 'branch', 'releases/other');
  const r = df(repo, ['candidates', 'release/*']);
  assert.deepEqual(r.stdout.trim().split('\n'), ['release/2026.09', 'release/2026.10']);
});

test('run under the default print mode → refused, nothing executes', () => {
  const repo = makeRepo({ workflow: 'run scripts/deploy.sh staging' });
  const r = df(repo, ['run', '--expect-head', git(repo, 'rev-parse', 'HEAD'), '--expect-blob', git(repo, 'hash-object', 'scripts/deploy.sh'), 'scripts/deploy.sh', 'staging']);
  assert.equal(r.status, 3);
  assert.equal(r.stdout, '');
});

test('run under execute → only the declared step, arguments as separate argv entries', () => {
  const repo = makeRepo({ workflow: 'run scripts/deploy.sh staging eu-west,1', runSteps: 'execute' });
  const plan = Object.fromEntries(df(repo, ['run-plan', 'scripts/deploy.sh', 'staging', 'eu-west,1']).stdout.trim().split('\n').map((l) => l.split('\t')));
  const ok = df(repo, ['run', '--expect-head', plan.head, '--expect-blob', plan.blob, 'scripts/deploy.sh', 'staging', 'eu-west,1']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, 'argc=2\narg=staging\narg=eu-west,1\n');
  assert.equal(df(repo, ['run', '--expect-head', plan.head, '--expect-blob', plan.blob, 'scripts/deploy.sh', 'prod']).status, 3, 'an undeclared argument set is refused');
});

// ── the skill text ───────────────────────────────────────────────────────────────────────────
test('the skill when read → states the run-script risk verbatim from the tech spec', () => {
  const norm = (t) => t.replace(/[>\s*_`]+/g, ' ').replace(/[“”]/g, '"').trim().toLowerCase();
  const specRisk = /\*the script runs with your credentials([\s\S]*?)and the harness cannot tell\s+which\*/.exec(SPEC);
  assert.ok(specRisk, 'the canonical statement is in the tech spec');
  assert.ok(norm(SKILL).includes(norm(`the script runs with your credentials${specRisk[1]}and the harness cannot tell which`)),
    'the per-step question states the canonical risk');
});

test('the skill when read → never runs git push and asks per step', () => {
  assert.match(SKILL, /never runs git push/i);
  assert.match(SKILL, /one AskUserQuestion naming the step, source, target, form and both full OIDs/);
  assert.doesNotMatch(SKILL, /disable-model-invocation/);
  assert.match(SKILL.split('\n---\n')[0], /AskUserQuestion/);
});

test('merge when the pre-merge guard rejects the message → exit 4 before anything merges (mutation proof)', () => {
  const repo = makeRepo();
  // The installed guard copy is the first the script resolves; a rejecting one must stop the step
  // before `git merge` runs — the same call the real guard answers on a clean template.
  mkdirSync(join(repo, '.claude', 'scripts'), { recursive: true });
  writeFileSync(join(repo, '.claude', 'scripts', 'commit-msg-guard.sh'), '#!/bin/bash\nexit 1\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'rejecting guard'); // committed: the tree stays clean
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  const r = df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff']);
  assert.equal(r.status, 4, r.stderr);
  assert.match(r.stderr, /nothing merged/);
  assert.equal(oid(repo, 'release/2026.09'), t);
});

test('a dirty worktree, untracked files included → clean, merge and run all refuse with exit 3', () => {
  const repo = makeRepo({ workflow: 'merge develop -> release/*\nrun scripts/deploy.sh staging', runSteps: 'execute' });
  assert.equal(df(repo, ['clean']).status, 0);
  writeFileSync(join(repo, 'stray.txt'), 'untracked\n');
  assert.equal(df(repo, ['clean']).status, 3, 'an untracked file is uncommitted work');
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  assert.equal(df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff']).status, 3);
  rmSync(join(repo, 'stray.txt'));
  writeFileSync(join(repo, 'scripts', 'deploy.sh'), '#!/bin/sh\necho tampered\n');
  const r = df(repo, ['run', '--expect-head', git(repo, 'rev-parse', 'HEAD'), '--expect-blob', git(repo, 'hash-object', 'scripts/deploy.sh'), 'scripts/deploy.sh', 'staging']);
  assert.equal(r.status, 3, 'a modified script is not the declared one');
  assert.doesNotMatch(r.stdout, /tampered/);
});

test('merge when the target branch carries a permissive guard copy → the approved tree\'s guard still judges', () => {
  const repo = makeRepo();
  mkdirSync(join(repo, '.claude', 'scripts'), { recursive: true });
  const real = readFileSync(join(ROOT, 'scripts', 'commit-msg-guard.sh'), 'utf8');
  writeFileSync(join(repo, '.claude', 'scripts', 'commit-msg-guard.sh'), real);
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'real guard on main');
  git(repo, 'switch', '-q', 'release/2026.09');
  mkdirSync(join(repo, '.claude', 'scripts'), { recursive: true });
  writeFileSync(join(repo, '.claude', 'scripts', 'commit-msg-guard.sh'), '#!/bin/bash\nexit 0\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'permissive guard on target');
  git(repo, 'switch', '-q', 'main');
  const hooks = join(repo, '.git', 'hooks');
  writeFileSync(join(hooks, 'commit-msg'), '#!/bin/sh\nprintf "\\nCo-Authored-By: Claude <noreply@anthropic.com>\\n" >> "$1"\n');
  chmodSync(join(hooks, 'commit-msg'), 0o755);
  const [s, t] = [oid(repo, 'develop'), oid(repo, 'release/2026.09')];
  const r = df(repo, ['merge', 'develop', 'release/2026.09', s, t, '--no-ff']);
  assert.equal(r.status, 4, 'the permissive copy on the target branch must not judge the read-back');
});

test('run when HEAD or the script changed after approval → exit 3 and nothing runs, even on a clean tree', () => {
  const repo = makeRepo({ workflow: 'run scripts/deploy.sh staging', runSteps: 'execute' });
  const plan = Object.fromEntries(df(repo, ['run-plan', 'scripts/deploy.sh', 'staging']).stdout.trim().split('\n').map((l) => l.split('\t')));
  assert.match(plan.head, /^[0-9a-f]{40}$/); assert.match(plan.blob, /^[0-9a-f]{40}$/);
  // A commit between approval and execution replaces the script while leaving the tree clean.
  writeFileSync(join(repo, 'scripts', 'deploy.sh'), '#!/bin/sh\necho swapped\n');
  git(repo, 'commit', '-q', '-am', 'swap script');
  const r = df(repo, ['run', '--expect-head', plan.head, '--expect-blob', plan.blob, 'scripts/deploy.sh', 'staging']);
  assert.equal(r.status, 3);
  assert.doesNotMatch(r.stdout, /swapped/);
  assert.match(r.stderr, /HEAD moved after approval/);
  // Without the approval values the step never runs at all.
  assert.equal(df(repo, ['run', 'scripts/deploy.sh', 'staging']).status, 2);
});

test('the skill when read → runs steps in declaration order and stops on a nonzero exit', () => {
  assert.match(SKILL, /### Phase 1: Each step, in declaration order/);
  assert.match(SKILL, /a `run` declared before a `merge` runs\s+before it/);
  assert.match(SKILL, /nonzero exit stops the flow/);
});

test('parse when a declared run script is ignored or untracked → parse error, never run', () => {
  const repo = makeRepo({ workflow: 'run scripts/local.sh', runSteps: 'execute' });
  writeFileSync(join(repo, '.gitignore'), 'scripts/local.sh\n');
  writeFileSync(join(repo, 'scripts', 'local.sh'), '#!/bin/sh\necho ignored-ran\n');
  chmodSync(join(repo, 'scripts', 'local.sh'), 0o755);
  git(repo, 'add', '.gitignore'); git(repo, 'commit', '-q', '-m', 'ignore local script');
  const r = df(repo, ['parse']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not tracked by git/);
  assert.equal(df(repo, ['run-plan', 'scripts/local.sh']).status, 3, 'an undeclarable step has no plan');
});

test('an installed helper with no installed guard → never falls back to a guard outside the project', () => {
  // Installed layout: <parent>/<repo>/.claude/scripts/deploy-flow.sh. A readable, permissive guard
  // planted at <parent>/scripts/ is exactly what `../../../scripts` from there would have named.
  const parent = tmp('df-parent-');
  const repo = join(parent, 'proj');
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  for (const [k, v] of [['user.name', 'Dev'], ['user.email', 'dev@example.com'], ['commit.gpgsign', 'false']]) git(repo, 'config', k, v);
  mkdirSync(join(repo, 'rules')); mkdirSync(join(repo, '.claude', 'scripts'), { recursive: true });
  writeFileSync(join(repo, 'rules', 'git-workflow-project.md'), '# x\n\n## Deploy Workflow\n\n```text\nmerge develop -> main\n```\n');
  writeFileSync(join(repo, '.claude', 'scripts', 'deploy-flow.sh'), readFileSync(DF));
  writeFileSync(join(repo, 'a.js'), '1;\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'switch', '-q', '-c', 'develop'); writeFileSync(join(repo, 'b.js'), '2;\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'dev'); git(repo, 'switch', '-q', 'main');
  mkdirSync(join(parent, 'scripts'));
  writeFileSync(join(parent, 'scripts', 'commit-msg-guard.sh'), '#!/bin/bash\nexit 0\n');
  const env = { ...process.env }; delete env.CLAUDE_PLUGIN_ROOT;
  const r = spawnSync('/bin/bash', [join(repo, '.claude', 'scripts', 'deploy-flow.sh'), 'merge', '--root', repo,
    'develop', 'main', oid(repo, 'develop'), oid(repo, 'main'), '--no-ff'], { encoding: 'utf8', env });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /commit-msg-guard\.sh not found/);
  assert.equal(oid(repo, 'main'), git(repo, 'rev-parse', 'main'), 'nothing merged');
});

test('parse when Run Steps carries a second live line → parse error, never execute', () => {
  const r = df(makeRepo({ workflow: 'run scripts/deploy.sh staging', runSteps: 'execute\nplease' }), ['parse']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /expected one value/);
});

test('the skill when read → pins one private copy of the helper for the whole flow', () => {
  assert.match(SKILL, /Pin the helper once, before any step/);
  assert.match(SKILL, /DF=\$\(mktemp [^)]*\) && cat -- "\$SRC" > "\$DF"/);
  assert.match(SKILL, /never the locator again/);
  assert.match(SKILL, /run `parse` again: output that differs from Phase 0's/);
});
