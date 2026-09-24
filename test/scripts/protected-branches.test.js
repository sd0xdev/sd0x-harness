'use strict';
// scripts/protected-branches.sh — the single protected-branch resolver (git-autonomy R1,
// docs/features/git-autonomy/2-tech-spec.md § 3.3). Exit 0 protected · 1 not · 2 unknown.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync, symlinkSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/protected-branches.sh');
const HOOK = join(ROOT, 'scripts/pre-push-gate.sh');
const dirs = [];
after(() => { for (const d of dirs) { try { chmodSync(d, 0o755); } catch {} rmSync(d, { recursive: true, force: true }); } });

function repo(files = {}) {
  const d = mkdtempSync(join(tmpdir(), 'sd0x-pb-'));
  dirs.push(d);
  spawnSync('git', ['init', '-q', d]);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(d, rel, '..'), { recursive: true });
    writeFileSync(join(d, rel), body);
  }
  return d;
}
const run = (root, branch, script = SCRIPT) =>
  spawnSync('/bin/bash', ['-p', '--', script, '--root', root, '--', branch], { encoding: 'utf8' }).status;
const OVR = '.claude/rules/git-workflow-project.md';
const section = (lines) => `# Git Workflow Project Overrides\n\n## Protected Branches\n${lines}\n\n## Offer Mode\n- stray\n`;

test('defaults with no override: main/master/develop/release/* protected, others not', () => {
  const d = repo();
  for (const b of ['main', 'master', 'develop', 'release/2026.09']) assert.equal(run(d, b), 0, b);
  for (const b of ['feat/x', 'release-notes', 'feat/main-menu', 'mainline']) assert.equal(run(d, b), 1, b);
});

test('additions: exact names and <prefix>/* widen the set; lines outside the section are ignored', () => {
  const d = repo({ [OVR]: section('<!-- add names -->\n- staging\n- rel/*') });
  assert.equal(run(d, 'staging'), 0);
  assert.equal(run(d, 'rel/2026.09'), 0);
  assert.equal(run(d, 'stray'), 1, 'a bullet under another heading is not an addition');
  assert.equal(run(d, 'staging-2'), 1, 'exact names match exactly');
});

test('an additions list that omits a default leaves the default protected', () => {
  const d = repo({ [OVR]: section('- qa') });
  assert.equal(run(d, 'main'), 0);
  assert.equal(run(d, 'release/1'), 0);
});

test('HTML comments, including multi-line ones, contribute nothing', () => {
  const d = repo({ [OVR]: section('<!--\n- fake\n-->\n- real <!-- inline -->') });
  assert.equal(run(d, 'fake'), 1);
  assert.equal(run(d, 'real'), 0);
});

for (const [label, body] of [
  ['a removal attempt with !', '- !main'],
  ['a removal attempt with a leading dash', '- -main'],
  ['an invalid ref name', '- a..b'],
  ['prose inside the section', 'protect everything'],
]) {
  test(`${label} → exit 2 for every branch (read as protected by callers)`, () => {
    const d = repo({ [OVR]: section(body) });
    assert.equal(run(d, 'feat/x'), 2);
    assert.equal(run(d, 'main'), 2);
  });
}

test('a duplicated ## Protected Branches heading → exit 2', () => {
  const d = repo({ [OVR]: '## Protected Branches\n- a\n## Protected Branches\n- b\n' });
  assert.equal(run(d, 'feat/x'), 2);
});

test('precedence: the first EXISTING file is selected; an unreadable one → 2 with no fallback', () => {
  const d = repo({ 'rules/git-workflow-project.md': section('- lower') });
  assert.equal(run(d, 'lower'), 0, 'with only the lower file, it is read');
  mkdirSync(join(d, '.claude/rules'), { recursive: true });
  symlinkSync('/nonexistent/git-workflow-project.md', join(d, OVR));
  assert.equal(run(d, 'lower'), 2, 'a dangling higher file is selected and unreadable — never fall back');
  assert.equal(run(d, 'feat/x'), 2);
});

test('an unreadable selected file → 2', { skip: process.getuid && process.getuid() === 0 }, () => {
  const d = repo({ [OVR]: section('- qa') });
  chmodSync(join(d, OVR), 0o000);
  try { assert.equal(run(d, 'feat/x'), 2); } finally { chmodSync(join(d, OVR), 0o644); }
});

test('a branch name carrying shell syntax is data, not code', () => {
  const d = repo();
  const r = spawnSync('/bin/bash', ['-p', '--', SCRIPT, '--root', d, '--', 'feat/x$(touch pwned)'], { encoding: 'utf8', cwd: d });
  assert.equal(r.status, 1);
  assert.equal(spawnSync('test', ['-e', join(d, 'pwned')]).status, 1, 'nothing was executed');
});

test('--list prints the resolved set; usage errors exit 64', () => {
  const d = repo({ [OVR]: section('- qa\n- rel/*') });
  const r = spawnSync('/bin/bash', ['-p', '--', SCRIPT, '--root', d, '--list'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.deepEqual(r.stdout.trim().split('\n'), ['main', 'master', 'develop', 'release/*', 'qa', 'rel/*']);
  assert.equal(spawnSync('/bin/bash', [SCRIPT], { encoding: 'utf8' }).status, 64);
  assert.equal(spawnSync('/bin/bash', [SCRIPT, '--bogus', 'x'], { encoding: 'utf8' }).status, 64);
});

// === parity: the hook carries the same block, byte for byte ===============================

const block = (src) => {
  const a = src.indexOf('# BEGIN protected-set');
  const b = src.indexOf('# END protected-set');
  assert.ok(a >= 0 && b > a, 'marker pair present');
  return src.slice(a, b);
};

test('parity: pre-push-gate.sh inlines the resolver block byte-identically', () => {
  assert.equal(block(readFileSync(HOOK, 'utf8')), block(readFileSync(SCRIPT, 'utf8')));
});

test('guard proof: removing an addition branch from the real function lets the added name through', () => {
  const d = repo({ [OVR]: section('- staging') });
  const src = readFileSync(SCRIPT, 'utf8');
  const marker = "        printf '%s\\n' \"$name\"\n";
  assert.ok(src.includes(marker), 'the exact-name emission exists to be mutated');
  const mutantDir = mkdtempSync(join(tmpdir(), 'sd0x-pb-mut-'));
  dirs.push(mutantDir);
  const mutant = join(mutantDir, 'protected-branches.sh');
  writeFileSync(mutant, src.replace(marker, '        :\n'));
  assert.equal(run(d, 'staging'), 0);
  assert.equal(run(d, 'staging', mutant), 1, 'the mutant drops the addition — the test exercised the real path');
});

// === the hook reads the same set, end to end (no terminal, so a protected prompt refuses) =====

const { spawnDetached } = require('./helpers/detached-spawn.js');
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const NULL_OID = '0000000000000000000000000000000000000000';

function gateCreation(d, branch) {
  spawnSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@e', 'commit', '-q', '--allow-empty', '--no-gpg-sign', '-m', 'x']);
  const oid = spawnSync('git', ['-C', d, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const line = `refs/heads/${branch} ${oid} refs/heads/${branch} ${NULL_OID}`;
  return spawnDetached(
    `unset ALLOW_PUSH_PROTECTED ALLOW_FORCE_UNSHARED ALLOW_FORCE_WITH_LEASE; bash ${shq(HOOK)} origin https://example.invalid/r.git 2>&1; echo "EXIT:$?"`,
    { cwd: d, input: `${line}\n` });
}

test('hook: a project-added rel/* branch meets the protected prompt; an unlisted branch does not', () => {
  const d = repo({ [OVR]: section('- rel/*') });
  const prot = gateCreation(d, 'rel/2026.09');
  assert.match(prot, /EXIT:1/, prot);
  assert.match(prot, /protected/i, prot);
  assert.match(gateCreation(d, 'feat/x'), /EXIT:0/);
});

test('hook: an unparseable override reads every branch as protected (fail closed)', () => {
  const d = repo({ [OVR]: section('- !main') });
  const out = gateCreation(d, 'feat/x');
  assert.match(out, /EXIT:1/, out);
});

// === the skill fences: every resolution block, run in temp repos ===========================

const { copyFileSync } = require('node:fs');
function skillBlocks(skill) {
  const src = readFileSync(join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
  return [...src.matchAll(/# Protected-set resolution \(git-autonomy R1\)[\s\S]*?\nelse case "\$(\w+)" in [^\n]*\nfi\n/g)]
    .map((m) => ({ text: m[0], v: m[1] }));
}
function runBlock({ text, v }, cwd, branch) {
  const r = spawnSync('bash', ['-c', `${v}=$1\n${text}\necho "PB=$PB_STATUS"`, '_', branch], { cwd, encoding: 'utf8' });
  const m = /PB=(\d+)/.exec(r.stdout);
  return m ? Number(m[1]) : null;
}
const BLOCKS = [...skillBlocks('push-ci'), ...skillBlocks('epic-merge')];

test('skills: push-ci carries 2 resolution blocks and epic-merge 2 (Phase 0 + Phase 2; Step 5 + Rollback)', () => {
  assert.equal(skillBlocks('push-ci').length, 2);
  assert.equal(skillBlocks('epic-merge').length, 2);
});

test('skills: with the resolver installed, a project-added rel/* is protected and an unparseable override is unknown', () => {
  const d = repo({ [OVR]: section('- rel/*') });
  mkdirSync(join(d, '.claude/scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(d, '.claude/scripts/protected-branches.sh'));
  for (const b of BLOCKS) {
    assert.equal(runBlock(b, d, 'rel/2026.09'), 0);
    assert.equal(runBlock(b, d, 'feat/x'), 1);
    assert.equal(runBlock(b, d, 'feat/x$(touch pwned)'), 1);
  }
  assert.equal(spawnSync('test', ['-e', join(d, 'pwned')]).status, 1, 'no block evaluated the branch name');
  writeFileSync(join(d, OVR), section('- !main'));
  for (const b of BLOCKS) assert.equal(runBlock(b, d, 'feat/x'), 2);
});

test('skills: resolver not installed — an override on disk means unknown; no override means the default set', () => {
  const withOverride = repo({ [OVR]: section('- qa') });
  const bare = repo();
  for (const b of BLOCKS) {
    assert.equal(runBlock(b, withOverride, 'feat/x'), 2, 'cannot read the additions → unknown');
    assert.equal(runBlock(b, bare, 'main'), 0);
    assert.equal(runBlock(b, bare, 'release/1'), 0);
    assert.equal(runBlock(b, bare, 'feat/main-menu'), 1);
  }
});

// Each workflow's guard through its refusal decision, not just the status it computes: push-ci
// Phase 2 (lease refusal) and Phase 0 (the PROTECTED reading the pre-approval keys on), both
// epic-merge push sites, and gh-stack's layer fence. `$1` is the branch; the guard exits nonzero on
// refusal and prints its marker when it lets the branch through.
function guardBodies() {
  const read = (skill) => readFileSync(join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
  const res = String.raw`# Protected-set resolution \(git-autonomy R1\)[\s\S]*?\nelse case "\$\w+" in [^\n]*\nfi\n`;
  const pc = read('push-ci');
  const em = read('epic-merge');
  const gh = read('gh-stack');
  // Anchor each guard to the resolution block directly in front of it: a lazy match from the
  // first block would run on through every fence in between.
  const after = (src, tail) => [...src.matchAll(new RegExp(res, 'g'))]
    .map((m) => { const t = new RegExp('^' + tail).exec(src.slice(m.index + m[0].length)); return t ? m[0] + t[0] : null; })
    .filter(Boolean);
  const phase2 = after(pc, String.raw`if \[\[ "\$PB_STATUS" != 1 \]\] && \[\[ "\$FORCE_WITH_LEASE" == "true" \]\]; then[\s\S]*?\nfi\n`);
  const phase0 = after(pc, String.raw`case "\$PB_STATUS" in 0\) PROTECTED=yes[^\n]*\n`);
  const emGuards = after(em, String.raw`if \[\[ "\$PB_STATUS" != 1 \]\]; then[\s\S]*?\nfi\n`);
  const ghFence = /```bash\nlayer='<b>'\n([\s\S]*?)```/.exec(gh);
  assert.ok(phase2.length === 1 && phase0.length === 1 && emGuards.length === 2 && ghFence, 'every guard is where the skills put it');
  return [
    ['push-ci Phase 2', `BRANCH=$1\nFORCE_WITH_LEASE=true\n${phase2[0]}echo PASSED`],
    ['push-ci Phase 0', `BRANCH=$1\n${phase0[0]}[ "$PROTECTED" = no ] || exit 3\necho PASSED`],
    ['epic-merge Step 5', `head=$1\n${emGuards[0]}echo PASSED`],
    ['epic-merge Rollback', `head=$1\n${emGuards[1]}echo PASSED`],
    ['gh-stack layer', `layer=$1\n${ghFence[1]}echo PASSED`],
  ];
}
const runGuard = (body, cwd, branch) => spawnSync('bash', ['-c', body, '_', branch], { cwd, encoding: 'utf8' });

test('guards: every workflow refuses a project-added rel/* and every branch under an unparseable override', () => {
  const d = repo({ [OVR]: section('- rel/*') });
  mkdirSync(join(d, '.claude/scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(d, '.claude/scripts/protected-branches.sh'));
  const bodies = guardBodies();
  for (const [label, body] of bodies) {
    const refused = runGuard(body, d, 'rel/2026.09');
    assert.notEqual(refused.status, 0, `${label}: rel/* must be refused`);
    assert.ok(!refused.stdout.includes('PASSED'), `${label}: rel/* must not fall through`);
    const ok = runGuard(body, d, 'feat/x');
    assert.equal(ok.status, 0, `${label}: feat/x is not protected — ${ok.stderr}`);
    assert.ok(ok.stdout.includes('PASSED'), `${label}: feat/x must reach the push`);
  }
  writeFileSync(join(d, OVR), section('- !main'));
  for (const [label, body] of bodies) {
    const r = runGuard(body, d, 'feat/x');
    assert.notEqual(r.status, 0, `${label}: exit 2 (unknown) must refuse`);
    assert.ok(!r.stdout.includes('PASSED'), `${label}: unknown must not fall through`);
  }
});

test('an HTML comment left open at EOF → exit 2 (it would hide the lines after it)', () => {
  const d = repo({ [OVR]: '<!-- scaffold notes\n## Protected Branches\n- rel/*\n' });
  assert.equal(run(d, 'rel/x'), 2);
  assert.equal(run(d, 'feat/x'), 2);
});
