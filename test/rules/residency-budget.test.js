'use strict';
// rules-residency task 4 (tech spec § 3.5): the plugin-managed resident set of a rendered fresh
// install stays at or under 50,000 characters AND a line ceiling fixed from the landed kernel, and
// every always-loaded block is named once in the residency manifest with its measured contribution.
// The user-owned `*-project.md` files that load at launch are reported, never rejected. Measured
// through scripts/instruction-budget.js, the launch accounting the instruction-budget ceiling uses,
// on what an install actually loads: the template as `/project-setup` Phase 3 writes it — one
// ecosystem block kept, placeholders filled — plus every shipped rule.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { measure, isPathScoped } = require('../../scripts/instruction-budget');

const ROOT = resolve(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MANIFEST = JSON.parse(read('docs/features/rules-residency/residency-manifest.json'));
// The character budget is the maintainer's 2026-09-25 decision (requirements § 9); the line ceiling
// was fixed from the landed kernel. Both are restated here so the manifest cannot raise either alone.
const CHAR_BUDGET = 50000;
const LINE_BUDGET = 600;
const lines = (text) => text.split('\n').length;

// Representative project values for every `/project-setup` placeholder — a real install carries
// values, not `{…}` tokens, and they are longer than the tokens they replace.
const PROJECT_VALUES = {
  PROJECT_NAME: 'acme-billing-service',
  FRAMEWORK: 'NestJS 10',
  CONFIG_FILE: 'src/config/configuration.ts',
  BOOTSTRAP_FILE: 'src/main.ts',
  DATABASE: 'PostgreSQL',
  TEST_COMMAND: 'pnpm test:unit',
  LINT_FIX_COMMAND: 'pnpm lint --fix',
  BUILD_COMMAND: 'pnpm build',
  TYPECHECK_COMMAND: 'pnpm typecheck',
  TICKET_PATTERN: '[A-Z]+-\\d+',
  ISSUE_TRACKER_URL: 'https://jira.example.com/browse/',
  TARGET_BRANCH: 'main',
};

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** `/project-setup` Phase 3: drop every ecosystem block but one, then fill every placeholder. */
function renderTemplate(template, ecosystem) {
  return template
    .replace(/<!-- block:([\w-]+) -->\n([\s\S]*?)<!-- \/block -->\n?/g, (_, key, body) => (key === ecosystem ? body : ''))
    .replace(/\{([A-Z_]+)\}/g, (token, key) => {
      if (!(key in PROJECT_VALUES)) throw new Error(`no representative value for placeholder ${token}`);
      return PROJECT_VALUES[key];
    });
}
const ecosystems = (template) => [...new Set([...template.matchAll(/<!-- block:([\w-]+) -->/g)].map((m) => m[1]))];

/** A fresh install for one ecosystem, measured. `grow` appends to one shipped rule. */
function install(ecosystem, { grow = null } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'residency-'));
  dirs.push(base);
  const repo = join(base, 'repo');
  const home = join(base, 'home');
  mkdirSync(join(repo, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(home, '.claude'), { recursive: true });
  const claude = renderTemplate(read('CLAUDE.template.md'), ecosystem);
  writeFileSync(join(repo, '.claude', 'CLAUDE.md'), claude);
  const plugin = { chars: claude.length, lines: lines(claude) };
  const user = { chars: 0, lines: 0, files: [] };
  for (const name of readdirSync(join(ROOT, 'rules')).filter((n) => n.endsWith('.md'))) {
    let text = read(`rules/${name}`);
    if (grow && grow.file === name) text += 'y'.repeat(grow.chars || 0) + '\n'.repeat(grow.lines || 0);
    writeFileSync(join(repo, '.claude', 'rules', name), text);
    if (isPathScoped(text)) continue;
    if (name.endsWith('-project.md')) {
      user.chars += text.length; user.lines += lines(text); user.files.push(name);
    } else {
      plugin.chars += text.length; plugin.lines += lines(text);
    }
  }
  const r = measure({ root: repo, home, perFile: 150000, limit: 150000, pluginRoot: null });
  return { ecosystem, claude, repo, total: r.total, plugin, user };
}

/** The one budget verdict every case below goes through. Throws on either ceiling. */
function checkBudget(r) {
  if (r.total !== r.plugin.chars + r.user.chars) {
    // The launch accounting and this file's own sum must agree, or the budget measures a set the
    // session does not load (an import that stopped resolving, a rule that went path-scoped).
    throw new Error(`${r.ecosystem}: measured ${r.total} ≠ plugin ${r.plugin.chars} + user ${r.user.chars}`);
  }
  if (r.plugin.chars > CHAR_BUDGET) {
    throw new Error(`${r.ecosystem}: plugin-managed resident text is ${r.plugin.chars} characters, over the ${CHAR_BUDGET} budget — land new policy on demand, or displace or compress (placement rule)`);
  }
  if (r.plugin.lines > LINE_BUDGET) {
    throw new Error(`${r.ecosystem}: plugin-managed resident text is ${r.plugin.lines} lines, over the ${LINE_BUDGET} line budget`);
  }
}

const installs = () => ecosystems(read('CLAUDE.template.md')).map((e) => install(e));
const worstOf = (all) => [...all].sort((a, b) => b.plugin.chars - a.plugin.chars)[0];

test(`every ecosystem's rendered install → plugin-managed text within ${CHAR_BUDGET} characters and ${LINE_BUDGET} lines`, (t) => {
  const all = installs();
  assert.ok(all.length >= 6, 'every ecosystem block is rendered');
  for (const r of all) {
    assert.doesNotMatch(r.claude, /\{[A-Z_]+\}/, `${r.ecosystem}: a placeholder survived the render`);
    t.diagnostic(`${r.ecosystem}: plugin ${r.plugin.chars} chars / ${r.plugin.lines} lines; user-owned ${r.user.chars} chars `
      + `(${r.user.files.join(', ')}), reported not charged; total ${r.total}`);
    assert.doesNotThrow(() => checkBudget(r));
  }
  assert.deepEqual([MANIFEST.budget.plugin_managed_chars, MANIFEST.budget.plugin_managed_lines], [CHAR_BUDGET, LINE_BUDGET],
    'the manifest states the same budget this test enforces');
});

test('the budget when a resident rule grows past a ceiling → the same check refuses it (negative control)', () => {
  const base = worstOf(installs());
  const byChars = install(base.ecosystem, { grow: { file: 'auto-loop.md', chars: CHAR_BUDGET - base.plugin.chars + 1 } });
  assert.throws(() => checkBudget(byChars), /over the 50000 budget/);
  // Dense-line gaming: the line ceiling fires while the character budget still has room.
  const byLines = install(base.ecosystem, { grow: { file: 'auto-loop.md', lines: LINE_BUDGET - base.plugin.lines + 1 } });
  assert.ok(byLines.plugin.chars <= CHAR_BUDGET, 'fixture premise: the character budget is not what fails');
  assert.throws(() => checkBudget(byLines), /line budget/);
  // A user-owned file never counts against the plugin budget, however large.
  const userGrown = install(base.ecosystem, { grow: { file: 'auto-loop-project.md', chars: CHAR_BUDGET } });
  assert.doesNotThrow(() => checkBudget(userGrown));
  assert.equal(userGrown.plugin.chars, base.plugin.chars, 'user-owned growth is reported, not charged to the plugin');
  // An unknown placeholder cannot be measured as if it were filled.
  assert.throws(() => renderTemplate('# {NEW_PLACEHOLDER}\n', 'node-ts'), /no representative value/);
});

// ── Residency manifest ──────────────────────────────────────────────────────────────────────

const residentSet = () => ['CLAUDE.template.md', ...readdirSync(join(ROOT, 'rules'))
  .filter((n) => n.endsWith('.md') && !isPathScoped(read(`rules/${n}`))).map((n) => `rules/${n}`)].sort();

let templateWorst = null;
/** What a block contributes to the resident set, measured the way the budget measures it. */
function contribution(block, readFile = read) {
  if (block.file === 'CLAUDE.template.md') {
    templateWorst = templateWorst || worstOf(installs());
    return { chars: templateWorst.claude.length, lines: lines(templateWorst.claude) };
  }
  const text = readFile(block.file);
  return { chars: text.length, lines: lines(text) };
}

/** Manifest entries that disagree with the resident set on disk, or with themselves. */
function manifestProblems(manifest, residentFiles, readFile = read) {
  const problems = [];
  const listed = manifest.blocks.map((b) => b.file);
  for (const f of new Set(listed)) if (listed.filter((x) => x === f).length > 1) problems.push(`duplicate entry: ${f}`);
  for (const f of residentFiles) if (!listed.includes(f)) problems.push(`resident but unlisted: ${f}`);
  for (const f of new Set(listed)) if (!residentFiles.includes(f)) problems.push(`listed but not resident: ${f}`);
  for (const b of manifest.blocks) {
    // Temporary blocks retired with the canary (task 8c); an entry carrying the metadata is stale.
    if ('temporary' in b || 'removed_by' in b) problems.push(`${b.file}: temporary-block metadata is no longer supported`);
    const expectedOwner = b.file.endsWith('-project.md') ? 'user' : 'plugin';
    if (b.owner !== expectedOwner) problems.push(`${b.file}: owner ${b.owner}, expected ${expectedOwner}`);
    for (const key of ['tier', 'justification']) {
      if (typeof b[key] !== 'string' || !b[key].trim()) problems.push(`${b.file}: no ${key}`);
    }
    for (const key of ['detail', 'carrier']) {
      if (!Array.isArray(b[key])) { problems.push(`${b.file}: ${key} is not a list`); continue; }
      for (const p of b[key]) if (!existsSync(join(ROOT, p))) problems.push(`${b.file}: reference ${p} does not exist`);
    }
    const now = contribution(b, readFile);
    if (b.chars !== now.chars || b.lines !== now.lines) {
      problems.push(`${b.file}: contribution ${b.chars}/${b.lines} recorded, ${now.chars}/${now.lines} measured`);
    }
  }
  return problems;
}

test('the residency manifest → names every resident block once, with owner, tier, justification, live references and its measured contribution', () => {
  assert.deepEqual(manifestProblems(MANIFEST, residentSet()), []);
});

test('the manifest check when an entry is dropped, duplicated, malformed or stale → names it (negative control)', () => {
  const at = (file) => MANIFEST.blocks.find((b) => b.file === file);
  const swap = (file, patch) => ({ ...MANIFEST, blocks: MANIFEST.blocks.map((b) => (b.file === file ? { ...b, ...patch } : b)) });
  const cases = [
    [{ ...MANIFEST, blocks: MANIFEST.blocks.filter((b) => b.file !== 'rules/logging.md') }, ['resident but unlisted: rules/logging.md']],
    [{ ...MANIFEST, blocks: [...MANIFEST.blocks, at('rules/logging.md')] }, ['duplicate entry: rules/logging.md']],
    [{ ...MANIFEST, blocks: [...MANIFEST.blocks, { ...at('rules/logging.md'), file: 'rules/testing.md' }] },
      ['listed but not resident: rules/testing.md', `rules/testing.md: contribution ${at('rules/logging.md').chars}/${at('rules/logging.md').lines} recorded, `
        + `${read('rules/testing.md').length}/${read('rules/testing.md').split('\n').length} measured`]],
    [swap('rules/security.md', { detail: ['skills/nowhere.md'] }), ['rules/security.md: reference skills/nowhere.md does not exist']],
    [swap('rules/security.md', { temporary: true }), ['rules/security.md: temporary-block metadata is no longer supported']],
    [swap('rules/security.md', { carrier: undefined }), ['rules/security.md: carrier is not a list']],
    [swap('rules/logging.md', { owner: 'user' }), ['rules/logging.md: owner user, expected plugin']],
    [swap('rules/logging.md', { chars: at('rules/logging.md').chars - 1 }),
      [`rules/logging.md: contribution ${at('rules/logging.md').chars - 1}/${at('rules/logging.md').lines} recorded, ${at('rules/logging.md').chars}/${at('rules/logging.md').lines} measured`]],
  ];
  for (const [manifest, expected] of cases) assert.deepEqual(manifestProblems(manifest, residentSet()), expected);
  const scoped = [...residentSet(), 'rules/testing.md'].sort();
  assert.deepEqual(manifestProblems(MANIFEST, scoped), ['resident but unlisted: rules/testing.md']);
  // A resident rule that grew without its manifest entry is stale, through the same reader.
  const grown = (p) => (p === 'rules/security.md' ? `${read(p)}x` : read(p));
  assert.deepEqual(manifestProblems(MANIFEST, residentSet(), grown).filter((m) => m.startsWith('rules/security.md')).length, 1);
});

// ── § Contract Triggers ─────────────────────────────────────────────────────────────────────

// The eight tech-spec § 3.2 situations, as the contract each one loads, in table order.
const TRIGGER_CONTRACTS = [
  'skills/codex-code-review/references/codex-invocation-contract.md',
  'skills/codex-code-review/references/review-common.md',
  'skills/codex-code-review/references/scope-contract.md',
  'skills/codex-code-review/references/loop-diagnostics.md',
  'skills/push-ci/references/authorization-contract.md',
  'skills/test-review/references/testing-contract.md',
  'skills/doc-review/references/documentation-contract.md',
  'rules/override-contract.md',
];
const FAILED_READ = /When the situation arises, Read the contract first; if that Read fails, stop the governed action and say so\./;
const PLACEMENT = /New policy lands in an on-demand contract by default\. It becomes resident only when it is needed before the task type is knowable, or when its failure mode — irreversible, security, attribution, secrets, gate supremacy — cannot wait for a Read; a resident addition over budget must displace or compress something\./;

/** The § Contract Triggers section of a CLAUDE file, or '' when it has none. */
function triggerSection(doc) {
  const at = doc.indexOf('\n## Contract Triggers\n');
  if (at === -1) return '';
  const end = doc.indexOf('\n## ', at + 1);
  return doc.slice(at, end === -1 ? undefined : end);
}

/** `[situation, contract]` pairs, the installed override path normalized to the plugin source. */
function triggerPairs(doc) {
  return triggerSection(doc).split('\n')
    .filter((l) => /^\| [^-]/.test(l) && !l.startsWith('| Situation |'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .map(([situation, target]) => [situation, ((/^`([^`]+)`$/.exec(target) || [])[1] || '').replace(/^\.claude\/rules\//, 'rules/')]);
}

/** What is wrong with one file's trigger table against the specified eight. */
function triggerProblems(doc) {
  const problems = [];
  const pairs = triggerPairs(doc);
  if (pairs.length !== TRIGGER_CONTRACTS.length) problems.push(`${pairs.length} rows, expected ${TRIGGER_CONTRACTS.length}`);
  pairs.forEach(([s, p], i) => {
    if (p !== TRIGGER_CONTRACTS[i]) problems.push(`row ${i + 1} "${s}" loads ${p || 'nothing'}, expected ${TRIGGER_CONTRACTS[i]}`);
    else if (!existsSync(join(ROOT, p))) problems.push(`row ${i + 1} "${s}" names a missing file`);
  });
  if (!FAILED_READ.test(triggerSection(doc))) problems.push('no failed-Read stop');
  if (!PLACEMENT.test(triggerSection(doc))) problems.push('no placement rule');
  return problems;
}

test('§ Contract Triggers when read → the eight specified situations, each loading its contract, with the stop and the placement rule, identical in both CLAUDE files', () => {
  const tpl = read('CLAUDE.template.md');
  const repo = read('CLAUDE.md');
  assert.deepEqual(triggerProblems(tpl), []);
  assert.deepEqual(triggerProblems(repo), []);
  assert.deepEqual(triggerPairs(repo), triggerPairs(tpl), 'the checkout and the template map the same situations to the same contracts');
  assert.deepEqual(MANIFEST.blocks.find((b) => b.file === 'CLAUDE.template.md').detail, TRIGGER_CONTRACTS,
    'the manifest names the trigger contracts as the template\'s detail, in table order');
});

test('the trigger check when a row points at a different existing contract, or a row is added → names it (negative control)', () => {
  const repo = read('CLAUDE.md');
  const swapped = repo.replace('| `skills/codex-code-review/references/review-common.md` |', '| `skills/codex-code-review/references/scope-contract.md` |');
  assert.notEqual(swapped, repo, 'fixture premise: the review-common row is present');
  assert.deepEqual(triggerProblems(swapped),
    ['row 2 "A review report arrives, or a verdict blocks" loads skills/codex-code-review/references/scope-contract.md, expected skills/codex-code-review/references/review-common.md']);
  const extra = repo.replace('\n\nNew policy lands', '\n| Planted situation | `rules/security.md` |\n\nNew policy lands');
  assert.equal(triggerProblems(extra)[0], '9 rows, expected 8');
  const noStop = repo.replace('if that Read fails, stop the governed action and say so.', 'read it if convenient.');
  assert.deepEqual(triggerProblems(noStop), ['no failed-Read stop']);
});

/** Contract paths a rendered install names but cannot Read: `skills/…` resolved under the plugin
 *  root the session-start hook prints, `.claude/rules/…` under the installed project. */
function unreadableContracts(r, pluginRoot) {
  const out = execFileSync('bash', [join(ROOT, 'scripts', 'namespace-hint.sh')],
    { cwd: r.repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot } });
  const printed = (/^Plugin root: (.+)$/m.exec(out) || [])[1];
  if (!printed) return ['the session-start hook printed no plugin root'];
  const texts = [r.claude, ...readdirSync(join(r.repo, '.claude', 'rules')).map((n) => readFileSync(join(r.repo, '.claude', 'rules', n), 'utf8'))];
  const named = new Set();
  for (const text of texts) for (const m of text.matchAll(/`((?:skills\/[\w./-]+|\.claude\/rules\/[\w.-]+)\.md)`/g)) named.add(m[1]);
  return [...named].filter((p) => !existsSync(p.startsWith('skills/') ? join(printed, p) : join(r.repo, p))).sort();
}

test('a rendered install when its contracts are Read → every skills/… path resolves under the printed plugin root', () => {
  const r = install('node-ts');
  assert.deepEqual(unreadableContracts(r, ROOT), []);
  // The trigger table itself says where its paths resolve, so a session knows to use that root.
  assert.match(triggerSection(r.claude), /Their `skills\/…` paths, here and in `\.claude\/rules\/`, are relative to the sd0x-dev-flow plugin root, which the session-start hook prints as `Plugin root:` \(no such line: it is the directory holding `skills\/push-ci\/SKILL\.md` under `~\/\.claude\/plugins\/`\)\./);
  // Negative control through the same reader: against a root without the plugin's skills, every
  // skills/… contract is reported unreadable — the case a bare project-relative path would hit.
  const empty = mkdtempSync(join(tmpdir(), 'no-plugin-'));
  dirs.push(empty);
  mkdirSync(join(empty, 'scripts'));
  const missing = unreadableContracts(r, empty);
  assert.ok(missing.includes('skills/push-ci/references/authorization-contract.md') && missing.every((p) => p.startsWith('skills/')),
    `expected only skills/… paths to be unreadable, got ${missing.join(', ')}`);
});
