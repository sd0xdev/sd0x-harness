'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const { PROFILES } = require('../../scripts/resolve-review-profile');

const repoRoot = resolve(__dirname, '../..');
const skillPath = resolve(repoRoot, 'skills/doc-review/SKILL.md');
const SKILL = readFileSync(skillPath, 'utf8');

function splitFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  return { frontmatter: match ? match[1] : '', body: match ? content.slice(match[0].length) : content };
}

/** Every `allowed-tools` entry, as written. */
function allowedTools(content) {
  const line = /^allowed-tools:\s*(.+)$/m.exec(splitFrontmatter(content).frontmatter);
  if (!line) return [];
  return line[1].split(',').map((t) => t.trim()).filter(Boolean);
}

/** The fenced shell blocks — the commands the skill actually instructs, not the prose about them. */
function shellBlocks(body) {
  const blocks = [];
  const fence = /^ {0,3}```(?:bash|sh|shell|zsh)\s*$/;
  let current = null;
  for (const line of body.split('\n')) {
    if (current === null) {
      if (fence.test(line)) current = [];
      continue;
    }
    if (/^ {0,3}```/.test(line)) { blocks.push(current.join('\n')); current = null; continue; }
    current.push(line);
  }
  return blocks;
}

/**
 * The binary each instructed command runs. A command the skill tells the model to run needs a
 * matching grant, or the model is instructed to do something the skill's own permissions refuse —
 * the pairing `test/skills/scan-error-gate.test.js` enforces for the source-set consumers.
 */
function instructedBinaries(content) {
  const binaries = new Set();
  for (const block of shellBlocks(splitFrontmatter(content).body)) {
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const first = line.split(/\s+/)[0];
      if (!/^[a-z][a-z0-9_.-]*$/i.test(first)) continue;
      binaries.add(first);
    }
  }
  return [...binaries];
}

function ungrantedBinaries(content) {
  const grants = allowedTools(content)
    .map((t) => /^Bash\(([^:)\s]+)/.exec(t))
    .filter(Boolean)
    .map((m) => m[1]);
  return instructedBinaries(content).filter((bin) => !grants.includes(bin));
}

/** The scripts the body tells the model to run, as repo-relative paths. */
function instructedScripts(content) {
  const found = new Set();
  for (const block of shellBlocks(splitFrontmatter(content).body)) {
    for (const m of block.matchAll(/\bnode\s+(?:"\$\{CLAUDE_PLUGIN_ROOT\}\/)?((?:scripts|skills)\/[\w./-]+\.js)/g)) found.add(m[1]);
  }
  return [...found];
}

/** The profile names the `## Review Profiles` table declares, in table order. */
function tabledProfiles(content) {
  const section = /\n## Review Profiles\n([\s\S]*?)(?=\n## )/.exec(content);
  if (!section) return [];
  const names = [];
  for (const line of section[1].split('\n')) {
    const cell = /^\|\s*`([a-z-]+)`\s*\|/.exec(line);
    if (cell) names.push(cell[1]);
  }
  return names;
}

// ── Frontmatter and the instruction/permission pairing ─────────────────────

test('skills/doc-review/SKILL.md declares its name and a non-empty description', () => {
  const { frontmatter } = splitFrontmatter(SKILL);

  assert.match(frontmatter, /^name:\s*doc-review\s*$/m);
  assert.match(frontmatter, /^description:\s*".+"\s*$/m,
    'the description is the dispatcher discovery interface — an empty one hides the skill');
});

test('every instructed binary is granted — node joined the grants with the fallback dispatch', () => {
  // review-loop-resilience (2026-08-23): the fallback branch names review-dispatch.js and
  // validate-family-sentinel.js as workflow steps, so node moved from deliberately-ungranted to
  // granted. An ungranted binary would now be an unintended prompt mid-review.
  assert.deepEqual(ungrantedBinaries(SKILL), [],
    'a named workflow step must not stall on a permission prompt mid-review');
});

test('the pairing check fails on an ungranted binary and passes on a granted one', () => {
  const ungranted = [
    '---', 'name: x', 'allowed-tools: Bash(git:*), Read', '---', '',
    '```bash', 'python3 scripts/resolve-review-profile.py', '```', '',
  ].join('\n');
  const granted = ungranted.replace('Bash(git:*)', 'Bash(python3:*), Bash(git:*)');

  assert.deepEqual(ungrantedBinaries(ungranted), ['python3'],
    'without a negative control this check is green on the day it lands and never again');
  assert.deepEqual(ungrantedBinaries(granted), []);
});

test('Bash(node:*) and Task are granted, and the grant is explained in the skill body', () => {
  assert.ok(allowedTools(SKILL).includes('Bash(node:*)'),
    'the fallback dispatch and sentinel validation are named steps — they must not stall on a prompt');
  assert.ok(allowedTools(SKILL).includes('Task'),
    'the fallback carrier is dispatched via Task');
  assert.ok(instructedBinaries(SKILL).includes('node'),
    'the grant is only meaningful while the workflow still instructs node commands');
  assert.match(SKILL, /the boundary is now behavioural/,
    'an unexplained grant flip reads as an oversight and gets "fixed" back — the body must say why');
});

test('every script the workflow instructs exists in this checkout', () => {
  const scripts = instructedScripts(SKILL);
  const missing = scripts.filter((rel) => !existsSync(resolve(repoRoot, rel)));

  assert.deepEqual(missing, [], 'a workflow step naming a script that does not exist cannot run');
  assert.ok(scripts.includes('scripts/check-doc-links.js'));
  assert.ok(scripts.includes('scripts/resolve-review-profile.js'));
});

// ── Workflow ordering ──────────────────────────────────────────────────────

test('deterministic checks are instructed before the Codex dispatch, not after', () => {
  const links = SKILL.indexOf('node "${CLAUDE_PLUGIN_ROOT}/scripts/check-doc-links.js"');
  const resolver = SKILL.indexOf('node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-review-profile.js"');
  const dispatch = SKILL.indexOf('### Step 4');

  assert.ok(links > 0 && resolver > 0 && dispatch > 0, 'all three steps must be present');
  assert.ok(links < resolver, 'link facts feed the resolver plan and the prompt');
  assert.ok(resolver < dispatch,
    'the profile is resolved before the prompt is built — a shallow prompt for a change that did not '
    + 'earn one is never assembled');
});

test('the profile is stated to narrow reading, never whether review runs', () => {
  assert.match(SKILL, /narrows what the reviewer \*\*reads\*\*, never \*\*whether\*\* review runs/,
    'Anchor Register #6: tier and profile decide depth only');
  assert.match(SKILL, /no resolver\s+outcome auto-passes anything/,
    'a resolver that could auto-pass would be a gate this feature promised not to add');
});

// ── The plan, not the file, is the review unit ─────────────────────────────

test('the review unit is the plan: no step dispatches per file', () => {
  assert.match(SKILL, /All changed documents \(`\.md` and `\.mdx`\) in one change are one review plan/);
  assert.match(SKILL, /One Dispatch Per Batch/,
    'the dispatch unit is the batch the resolver produced');
  assert.doesNotMatch(SKILL, /per updated file|file-by-file review|one dispatch per file/i,
    'per-file dispatch is exactly what this workflow replaced');
});

test('the target set may not be narrowed, and an over-budget plan splits loudly', () => {
  assert.match(SKILL, /Never narrow a multi-file change to one file, and never ask the user to pick one/);
  assert.match(SKILL, /Never claim one dispatch you did not make, and never drop a file to fit/,
    'silently dropping a file to fit the budget reads as coverage it never had');
});

// ── The default target set is the doc plane ────────────────────────────────

test('the plugin\'s scripts → run from the plugin root, and the dispatch module is loaded, not run', () => {
  const flat = SKILL.replace(/\s+/g, ' ');
  assert.match(flat, /The scripts this workflow names are the plugin's own, whatever the project keeps under `scripts\/`/);
  assert.match(flat, /`scripts\/lib\/review-dispatch\.js` \(Step 4\) is a module — `require` it from the plugin root and call `decide\(\.\.\.\)`/);
  assert.equal(typeof require('../../scripts/lib/review-dispatch.js').decide, 'function');
  for (const b of shellBlocks(splitFrontmatter(SKILL).body)) {
    assert.doesNotMatch(b, /node scripts\//, 'a project file of the same name must not be run in its place');
  }
});

test('a collected path → reaches the batch whole, whatever characters it holds', () => {
  assert.match(SKILL.replace(/\s+/g, ' '), /Give it every collected path as one `\{"path": …\}` entry/);
  assert.match(SKILL, /resolve-review-profile\.js" --plan <plan\.json\|->/);
  for (const b of shellBlocks(splitFrontmatter(SKILL).body)) assert.doesNotMatch(b, /--files/);
  const { execFileSync } = require('node:child_process');
  const paths = ['docs/api,v2.mdx', ' edge .md', '\tguide.mdx', '--review.mdx', 'plain.md'];
  const plan = JSON.parse(execFileSync('node', [resolve(repoRoot, 'scripts/resolve-review-profile.js'), '--plan', '-', '--root', repoRoot],
    { input: JSON.stringify({ tier: 'standard', files: paths.map((p) => ({ path: p })) }), encoding: 'utf8' }));
  assert.deepEqual(plan.batches.flatMap((b) => b.files).sort(), [...paths].sort());
});

test('a document whose name looks like an option → is scanned as the skill spells it, and a dropped one shows in `checked`', () => {
  const { execFileSync } = require('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
  const { join } = require('node:path');
  assert.match(SKILL, /check-doc-links\.js" --root [^\n]* \.\/<changed document path> …/);
  assert.match(SKILL.replace(/\s+/g, ' '), /`checked` must equal the number of paths passed/);
  const dir = mkdtempSync(join(require('node:os').tmpdir(), 'doc-links-'));
  const scan = (p) => JSON.parse(execFileSync('node', [resolve(repoRoot, 'scripts/check-doc-links.js'), '--root', dir, p], { cwd: dir, encoding: 'utf8' }));
  try {
    writeFileSync(join(dir, '--review.mdx'), '[x](./missing.md)\n');
    const asSpelled = scan('./--review.mdx');
    assert.deepEqual([asSpelled.checked, asSpelled.failures.length], [1, 1]);
    assert.equal(scan('--review.mdx').checked, 0, 'the case the comparison exists for');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a path with two texts → the link scan is said to cover the work tree only, in the skill and the prompt', () => {
  const prompt = readFileSync(resolve(repoRoot, 'skills/doc-review/references/codex-prompt-doc.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(SKILL.replace(/\s+/g, ' '), /its result says nothing about the staged one: the dispatch says which paths those are, and the reviewer checks their staged links/);
  assert.match(prompt, /it is two texts: apply its profile to the changed content of both\. The staged copy is `git show :<path>`/);
  assert.match(prompt, /It read the work-tree text only: where a file's staged text differs .* the links in the staged text are yours to check/);
});

for (const [name, files, want] of [
  ['an installed copy', ['.claude/scripts', 'PLUGIN/scripts', 'scripts'], '.claude/scripts/review-state.js'],
  ['no installed copy', ['PLUGIN/scripts', 'scripts'], 'PLUGIN/scripts/review-state.js'],
  ['a source checkout without the plugin', ['scripts'], 'scripts/review-state.js'],
]) {
  test(`the documented checker lookup with ${name} → ${want}, in both review skills`, () => {
    const { execFileSync } = require('node:child_process');
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
    const { join } = require('node:path');
    const base = mkdtempSync(join(require('node:os').tmpdir(), 'plug in-'));
    try {
      for (const d of files) { mkdirSync(join(base, d), { recursive: true }); writeFileSync(join(base, d, 'review-state.js'), ''); }
      for (const p of ['skills/doc-review/SKILL.md', 'skills/codex-code-review/SKILL.md']) {
        const lines = readFileSync(resolve(repoRoot, p), 'utf8').split('\n').filter((l) => /CHECKER=/.test(l));
        assert.equal(lines.length, 3, p);
        // What the host does with ${CLAUDE_PLUGIN_ROOT} in a plugin skill: the path is written in its place.
        const script = `${lines.join('\n').replaceAll('${CLAUDE_PLUGIN_ROOT}', join(base, 'PLUGIN'))}\nprintf %s "$CHECKER"`;
        const got = execFileSync('sh', ['-c', script], { cwd: base, encoding: 'utf8' });
        assert.equal(got.replace(`${base}/`, ''), want, p);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}

test('default collection → the doc plane the classifier defines, not a .md filter of its own', () => {
  const row = SKILL.split('\n').find((l) => l.startsWith('| No path |'));
  assert.match(row, /Every path `git status --porcelain=v1 -z --untracked-files=all --no-renames` reports/);
  assert.match(row, /A status that fails is not an empty set: stop and report it/);
  assert.match(SKILL.replace(/\s+/g, ' '), /is two texts: the dispatch names it and the reviewer reads both `git diff --cached -- <path>` and `git diff -- <path>`/);
  assert.match(row, /the `\.md` and `\.mdx` suffixes, case-sensitive, as `planeOf` in `scripts\/lib\/tree-digest\.js` decides/);
});

for (const [name, files, want, how] of [
  ['a document renamed out of the plane', ['guide.mdx'], ['guide.mdx'], 'guide.txt'],
  ['a document renamed within the plane', ['guide.md'], ['guide.md', 'guide.mdx'], 'guide.mdx'],
  ['a staged edit whose work tree matches HEAD', ['guide.mdx'], ['guide.mdx'], 'STAGED-THEN-RESTORED'],
  ['a staged deletion', ['gone.md'], ['gone.md'], 'DELETED'],
  ['an .mdx-only change', ['a.mdx'], ['a.mdx']],
  ['a mixed change', ['a.mdx', 'b.md', 'c.js', 'UPPER.MD', 'with space.mdx'], ['a.mdx', 'b.md', 'with space.mdx']],
  ['a code-only change', ['c.js', 'UPPER.MD'], []],
]) {
  test(`the documented collection over ${name} → exactly the paths the digest calls doc`, () => {
    const { execFileSync } = require('node:child_process');
    const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
    const { join } = require('node:path');
    const { computeTreeState, planeOf } = require('../../scripts/lib/tree-digest.js');
    const repo = mkdtempSync(join(require('node:os').tmpdir(), 'doc-collect-'));
    const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.x', ...a], { encoding: 'utf8' });
    try {
      git('init', '-q', '-b', 'main');
      writeFileSync(join(repo, files[0]), 'old\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'init');
      if (how === 'STAGED-THEN-RESTORED') {
        writeFileSync(join(repo, files[0]), 'staged\n');
        git('add', files[0]);
        writeFileSync(join(repo, files[0]), 'old\n'); // the work tree matches HEAD again; the index does not
      } else if (how === 'DELETED') git('rm', '-q', files[0]);
      else if (how) git('mv', files[0], how);
      else for (const f of files) writeFileSync(join(repo, f), 'new\n'); // one tracked change, the rest untracked
      const listed = git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames')
        .split('\0').filter(Boolean).map((r) => r.slice(3));
      const collected = [...new Set(listed)].filter((p) => planeOf(p) === 'doc').sort();
      assert.deepEqual(collected, [...want].sort());
      assert.deepEqual(collected, computeTreeState(repo).planes.doc.dirty, 'what is reviewed is what the plane owes');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
}

// ── A plane pass needs the whole scope ─────────────────────────────────────

test('a targeted pass → never a new plane pass without full scope; an existing pass and every fail stand', () => {
  const flat = SKILL.replace(/\s+/g, ' ');
  assert.match(flat, /\*\*A plane pass needs the whole scope\.\*\* A passing review of named files settles those files\./);
  assert.match(flat, /only when every doc-plane path it would vouch for was covered — the uncommitted ones and those in commits a push would publish — by this plan, or by an earlier passing review of the same content/);
  assert.match(flat, /A clean tree is not an empty scope: with two documents ahead, reviewing one covers one\./);
  assert.match(flat, /When the coverage is not complete, or not known, report the result for the files reviewed and leave the slot alone; a pass already recorded at the same digest stays valid\./);
  assert.match(flat, /This narrows `pass` only — a blocking finding is noted `fail` as above\./);
  assert.match(flat, /self-note the plan's verdict once, not per batch/, 'a complete multi-batch plan still settles in one note');
  const spec = readFileSync(resolve(repoRoot, 'skills/review-spec/SKILL.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(spec, /noted as `doc_review pass` only under `@skills\/doc-review\/SKILL\.md` § Step 5/);
});

test('what a missing note costs → stated the same way for code and docs, with the automation that reads it', () => {
  const sentence = 'Record a verdict only after the gate has run and its result has been established for the current change. If recording fails, the report still stands; reminders, Git offers, and automatic commit or publish checks may continue to show the gate as open.';
  for (const p of ['skills/doc-review/SKILL.md', 'skills/codex-code-review/SKILL.md']) {
    const flat = readFileSync(resolve(repoRoot, p), 'utf8').replace(/\s+/g, ' ');
    assert.ok(flat.includes(sentence), p);
    assert.doesNotMatch(flat, /one redundant reminder line/, p);
  }
  assert.doesNotMatch(readFileSync(resolve(repoRoot, 'rules/auto-loop.md'), 'utf8'), /it just keeps its reminder alive/);
});

test('the link checker is described as advisory, not as a gate', () => {
  assert.match(SKILL, /\*\*Advisory\s+input, not a gate\*\*/);
  assert.match(SKILL, /always exits 0/,
    'the exit code is the whole claim — check-doc-links.js returns 0 whatever it finds');
});

// ── The profile table is the resolver's table ──────────────────────────────

test('the profile table lists exactly the profiles the resolver can produce', () => {
  const tabled = tabledProfiles(SKILL);

  assert.ok(tabled.length > 0, 'the ## Review Profiles table must be parseable');
  assert.deepEqual([...tabled].sort(), [...PROFILES].sort(),
    'a profile the resolver emits but the skill does not document is one nobody can act on');
});

test('the table parser reads the table, not any backticked name in the file', () => {
  const decoy = SKILL.replace('## Review Profiles', '## Review Profiles Elsewhere');

  assert.deepEqual(tabledProfiles(decoy), [],
    'without this the assertion above would pass on prose mentioning the profile names');
});

test('record-diff is documented as carrying no code-alignment obligation', () => {
  const section = /\n## Review Profiles\n([\s\S]*?)(?=\n## )/.exec(SKILL)[1];
  const row = section.split('\n').find((l) => l.startsWith('| `record-diff`'));

  assert.ok(row, 'the record-diff row must exist');
  assert.match(row, /No code-alignment obligation/,
    'exempting time-point records from code alignment is the cost cut this feature is for');
});

// ── Sub-threshold handling stays intact ────────────────────────────────────

test('deferred doc findings keep the reporting-convention tag and field order', () => {
  assert.match(SKILL, /\[NIT_DEFERRED\] file:line \| issue \| reason: sub-threshold-doc \| <ISO8601>/,
    'the tag and field order are the greppable convention (hook-lightweighting: nothing parses '
    + 'it) — reworded, every report/transcript grep that relies on the shape breaks');
  assert.match(SKILL, /Do not batch-fix 🟡\/⚪ and re-review/,
    'a re-review of non-blocking findings is the round the gate already said was unnecessary');
});

test('the skill never says an empty failures list settles links on its own', () => {
  const content = SKILL;

  // The checker is a scanner, not a parser. A step telling the agent the question is settled on
  // `failures` alone contradicts the prompt it then builds, and the agent reads the step first.
  const claim = /empty\s+`?failures`?[^.]*\b(settled|resolves|resolve)\b/i;
  assert.doesNotMatch(content, claim,
    'an unqualified "empty failures settles it" instruction is the failure this test exists to catch');
  assert.match(content, /`unresolved`/,
    'the positive control: the coverage field has to be named somewhere for the pair to be readable');
  assert.match(content, /only\s+alongside\s+`unresolved: 0`/,
    'and the pairing has to be stated, not merely implied by mentioning the field');
});

test('the Doc Sync contract is one dispatch everywhere — no surface says per-file any more', () => {
  const surfaces = [
    'rules/auto-loop.md',
    'skills/feature-dev/SKILL.md',
    'skills/update-docs/SKILL.md',
    'skills/doc-review/SKILL.md',
    'skills/create-request/SKILL.md',
  ];
  for (const rel of surfaces) {
    const text = readFileSync(resolve(repoRoot, rel), 'utf8');
    assert.ok(!/per updated file/.test(text), `${rel} must not carry the per-file dispatch sentence`);
  }
  // Both directions: the replacement wording actually stands where the old sentence lived.
  const autoLoop = readFileSync(resolve(repoRoot, 'rules/auto-loop.md'), 'utf8');
  assert.match(autoLoop, /review them all in \*\*one\*\* `\/codex-review-doc` dispatch/);
  assert.match(autoLoop, /resolve-review-profile\.js/, 'depth and batching are named as the resolver\u2019s');
  const featureDev = readFileSync(resolve(repoRoot, 'skills/feature-dev/SKILL.md'), 'utf8');
  assert.match(featureDev, /ONE dispatch/, 'feature-dev routes Doc Sync through the same single dispatch');
});

test('the implementation record exists and reports the r1 baseline the counters actually hold', () => {
  const implPath = resolve(repoRoot, 'docs/features/doc-review-phasing/4-implementation.md');
  assert.ok(existsSync(implPath), '4-implementation.md is the record this feature promised');
  const impl = readFileSync(implPath, 'utf8');
  assert.match(impl, /## 1\. What shipped/, 'the record says what shipped');
  // The baseline is stated against fields doc_iteration_history holds — cumulative, not per-cycle.
  assert.match(impl, /`dispatches`/);
  assert.match(impl, /`verdicts`/);
  assert.match(impl, /Dispatch-to-verdict loss/, 'the derived loss figure is the measurement r3 promised');
  assert.match(impl, /doc_iteration_history/);
  // A frozen point-in-time record, so its figures are assertable: wrong numbers here would be a
  // false record, not drift — 18 dispatches, 2 verdicts, 16 lost, 89%.
  assert.match(impl, /\| `dispatches` \| 18 \|/);
  assert.match(impl, /\| `verdicts` \| 2 /);
  assert.match(impl, /16 of 18 dispatches produced no verdict/);
  assert.match(impl, /— 89%/);
  // And the measurement precedes the § 5 machinery it justifies, as the AC orders them.
  const measured = impl.indexOf('## 2. Measurement');
  const proposed = impl.indexOf('## 5.');
  assert.ok(measured > -1, 'the measurement section exists under its own heading');
  assert.ok(proposed === -1 || measured < proposed, 'the baseline is reported before § 5 proposes anything');
});
