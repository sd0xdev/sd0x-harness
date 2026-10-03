const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

const scriptPath = resolve(__dirname, '../../scripts/build-codex-artifacts.js');
const tempDirs = [];

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'sd0x-codex-test-'));
  tempDirs.push(dir);
  return dir;
}

function runScript(args) {
  return execFileSync('node', [scriptPath, ...args], { encoding: 'utf8' });
}

function runScriptRaw(args) {
  return spawnSync('node', [scriptPath, ...args], { encoding: 'utf8' });
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('kernel output is within 24 KiB byte limit', () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'test-project', scripts: { test: 'jest' } })
  );

  const output = runScript(['--project-dir', dir]);
  const byteSize = Buffer.byteLength(output, 'utf8');
  assert.ok(
    byteSize <= 24576,
    `Output ${byteSize} bytes exceeds 24 KiB limit`
  );
  assert.ok(byteSize > 0, 'Output should not be empty');
});

test('placeholders are replaced', () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'my-app', scripts: { test: 'vitest run' } })
  );

  const output = runScript(['--project-dir', dir]);
  assert.ok(!output.includes('{PROJECT_NAME}'), 'PROJECT_NAME not replaced');
  assert.ok(!output.includes('{TEST_COMMAND}'), 'TEST_COMMAND not replaced');
  assert.ok(!output.includes('{VERSION}'), 'VERSION not replaced');
  assert.ok(output.includes('my-app'), 'Project name should appear in output');
  assert.ok(
    output.includes('vitest run'),
    'Test command should appear in output'
  );
});

test('default project name from directory when no package.json', () => {
  const dir = createTempDir();
  const dirName = require('node:path').basename(dir);

  const output = runScript(['--project-dir', dir]);
  assert.ok(
    output.includes(dirName),
    `Should use directory name "${dirName}" as project name`
  );
});

test('test command detection from package.json', () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'pkg-test',
      scripts: { test: 'node --test test/**/*.test.js' },
    })
  );

  const output = runScript(['--project-dir', dir]);
  assert.ok(
    output.includes('node --test test/**/*.test.js'),
    'Should extract test command from package.json'
  );
});

test('default test command when no package.json scripts.test', () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'no-test', scripts: {} })
  );

  const output = runScript(['--project-dir', dir]);
  assert.ok(
    output.includes('npm test'),
    'Should fall back to "npm test" when no test script found'
  );
});

test('exit 1 on oversize output', () => {
  const dir = createTempDir();

  // Write an oversized template (> 24 KiB) directly
  const hugeContent = '# {PROJECT_NAME}\n' + 'x'.repeat(25000) + '\n';
  const templateFile = join(dir, 'huge-kernel.md');
  writeFileSync(templateFile, hugeContent);
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'oversize-test' })
  );

  // Use --template-path to test the actual script with oversized template
  const result = runScriptRaw([
    '--project-dir', dir,
    '--template-path', templateFile,
  ]);
  assert.equal(result.status, 1, 'Should exit with code 1 on oversize output');
  assert.ok(
    result.stderr.includes('exceeds'),
    'Should report size exceeded in stderr'
  );
});

test('template file missing produces error', () => {
  const dir = createTempDir();
  const missingPath = join(dir, 'nonexistent', 'agents-kernel.md');

  // Use --template-path pointing to a nonexistent file
  const result = runScriptRaw([
    '--project-dir', dir,
    '--template-path', missingPath,
  ]);
  assert.equal(result.status, 1, 'Should exit with code 1 when template missing');
  assert.ok(
    result.stderr.includes('could not read'),
    'Should report template read error'
  );
});

test('--output flag writes to file', () => {
  const dir = createTempDir();
  const outputFile = join(dir, 'AGENTS.md');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'output-test', scripts: { test: 'jest' } })
  );

  runScript(['--project-dir', dir, '--output', outputFile]);

  const content = readFileSync(outputFile, 'utf8');
  assert.ok(content.includes('output-test'), 'Output file should contain project name');
  assert.ok(content.includes('jest'), 'Output file should contain test command');
  const byteSize = Buffer.byteLength(content, 'utf8');
  assert.ok(byteSize <= 24576, `Output file ${byteSize} bytes exceeds limit`);
});

test('kernel contains .sd0x/scripts/ paths', () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'path-test', scripts: { test: 'jest' } })
  );

  const output = runScript(['--project-dir', dir]);
  assert.ok(
    output.includes('.sd0x/scripts/precommit-runner.js'),
    'Should reference .sd0x/scripts/precommit-runner.js'
  );
  assert.ok(
    output.includes('.sd0x/scripts/verify-runner.js'),
    'Should reference .sd0x/scripts/verify-runner.js'
  );
  assert.ok(
    !output.includes('node scripts/precommit-runner.js'),
    'Should not contain legacy scripts/ path for precommit-runner'
  );
  assert.ok(
    !output.includes('node scripts/verify-runner.js'),
    'Should not contain legacy scripts/ path for verify-runner'
  );
});

test('version is read from plugin.json', () => {
  const dir = createTempDir();
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'version-test' })
  );

  const output = runScript(['--project-dir', dir]);
  assert.ok(
    output.includes('sd0x-dev-flow v'),
    'Should include version string from plugin.json'
  );
  assert.ok(!output.includes('{VERSION}'), 'VERSION placeholder should be replaced');
});

test('malformed flag value produces error', () => {
  const result = runScriptRaw(['--project-dir', '--output', '/tmp/test']);
  assert.equal(result.status, 1, 'Should exit with code 1 on malformed flags');
  assert.ok(
    result.stderr.includes('requires a value'),
    'Should report missing value for flag'
  );
});

// ── Canonical Anchor blocks (claude-code-2-1-288-compat task 1) ──────────────────────────────
// The expected regions below are computed with plain string search, independently of the
// generator's line-walking extractor, so a drift in either one shows up as a mismatch.
const { copyFileSync, mkdirSync } = require('node:fs');
const { extractCanonicalBlocks } = require('../../scripts/build-codex-artifacts.js');

const repoRules = resolve(__dirname, '../../rules');
const SOURCE_FILES = ['discretion.md', 'git-workflow.md', 'security.md', 'logging.md', 'self-improvement.md'];

function rulesFixture(mutate = {}) {
  const dir = join(createTempDir(), 'rules');
  mkdirSync(dir);
  for (const f of SOURCE_FILES) {
    if (mutate[f]) writeFileSync(join(dir, f), mutate[f](readFileSync(join(repoRules, f), 'utf8')));
    else copyFileSync(join(repoRules, f), join(dir, f));
  }
  return dir;
}

function expectedRegions() {
  const read = (f) => readFileSync(join(repoRules, f), 'utf8');
  const disc = read('discretion.md');
  const regStart = disc.indexOf('## Anchor Register');
  const regEnd = disc.indexOf('\n## ', regStart + 1);
  const gw = read('git-workflow.md');
  const begin = '<!-- anchor:register-4:begin -->\n';
  const r4Start = gw.indexOf(begin) + begin.length;
  const r4End = gw.indexOf('\n<!-- anchor:register-4:end -->');
  const lineOf = (text, prefix) => text.split('\n').find((l) => l.startsWith(prefix));
  return {
    'anchor-register': disc.slice(regStart, regEnd).replace(/\n+$/, ''),
    'register-4': gw.slice(r4Start, r4End),
    security: read('security.md').replace(/\n+$/, ''),
    'never-log': lineOf(read('logging.md'), 'Never log:'),
    redaction: lineOf(read('self-improvement.md'), 'Keep dates,'),
  };
}

test('extractCanonicalBlocks on the plugin rules → every block byte-equal to its source region', () => {
  const blocks = Object.fromEntries(extractCanonicalBlocks(repoRules).map((b) => [b.id, b.text]));
  const expected = expectedRegions();
  assert.deepEqual(Object.keys(blocks), Object.keys(expected));
  for (const [id, text] of Object.entries(expected)) {
    assert.equal(Buffer.compare(Buffer.from(blocks[id]), Buffer.from(text)), 0, `${id} differs from its source`);
  }
});

test('generated AGENTS.md → carries every canonical block verbatim under the Anchors heading', () => {
  const dir = createTempDir();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'anchor-carrier', scripts: { test: 'jest' } }));
  const output = runScript(['--project-dir', dir]);
  const anchors = output.slice(output.indexOf('## Anchors (verbatim from sd0x-dev-flow rules)'));
  assert.ok(anchors.length < output.length, 'the Anchors heading is present');
  for (const [id, text] of Object.entries(expectedRegions())) {
    assert.ok(anchors.includes(text), `${id} is carried verbatim`);
  }
});

test('a canonical boundary missing from its source → generation exits 1 naming the block', () => {
  const rules = rulesFixture({ 'logging.md': (t) => t.replace('Never log:', 'Do not log:') });
  const result = runScriptRaw(['--project-dir', createTempDir(), '--rules-dir', rules]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /canonical block never-log: expected exactly one "Never log:" line, found 0/);
  assert.equal(result.stdout, '', 'nothing is emitted when a block cannot be bound');
});

test('a canonical boundary duplicated in its source → generation exits 1 naming the block', () => {
  const marker = '<!-- anchor:register-4:begin -->';
  const rules = rulesFixture({ 'git-workflow.md': (t) => `${marker}\n${t}` });
  const result = runScriptRaw(['--project-dir', createTempDir(), '--rules-dir', rules]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /canonical block register-4: expected exactly one begin marker, found 2/);
});

test('an unmodified copy of the rules via --rules-dir → generation succeeds (negative control)', () => {
  const result = runScriptRaw(['--project-dir', createTempDir(), '--rules-dir', rulesFixture()]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('## Anchors (verbatim from sd0x-dev-flow rules)'));
});

test('a placeholder inside a canonical block → left verbatim while the template placeholder is substituted', () => {
  const rules = rulesFixture({ 'security.md': (t) => `${t.replace(/\n+$/, '')}\n\nProject marker: {PROJECT_NAME}\n` });
  const dir = createTempDir();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'boundary-app' }));
  const result = runScriptRaw(['--project-dir', dir, '--rules-dir', rules]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('Project marker: {PROJECT_NAME}'), 'the block keeps its bytes');
  assert.ok(result.stdout.startsWith('# boundary-app'), 'the template heading is substituted');
});

test('--rules-dir naming a directory without the sources → exit 1 with a read error', () => {
  const result = runScriptRaw(['--project-dir', createTempDir(), '--rules-dir', join(createTempDir(), 'absent')]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /canonical block anchor-register: could not read rules\/discretion\.md/);
});

// ── Kernel remainder (claude-code-2-1-288-compat task 2) ────────────────────────────────────
// Everything above the Anchors heading is Default-tier prose. It must agree with the rules and must
// not restate an Anchor in its own words — a paraphrase of an Anchor is still Anchor, and a second
// carrier drifts. The phrases below are the distinctive wording of Register items #1, #2 and #4 that
// the pre-5.0 kernel restated; the Anchors section now carries them verbatim instead.
const ANCHOR_RESTATEMENTS = [
  /\bAI names?\b/i, /Co-Authored-By/i, /\bcommit (?:any )?secrets\b/i, /\bMD5\b/, /\bSHA1\b/,
  /\bprivate keys?\b/i, /\bgit (?:add|commit|push|stash|rebase)\b/, /\breset --hard\b/, /--force\b/,
];

function kernelRemainder(output) {
  const at = output.indexOf('## Anchors (verbatim from sd0x-dev-flow rules)');
  assert.ok(at > 0, 'the Anchors heading is present');
  return output.slice(0, at);
}

function anchorRestatements(text) {
  return ANCHOR_RESTATEMENTS.filter((re) => re.test(text)).map(String);
}

function generateKernel(templatePath) {
  const dir = createTempDir();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'kernel-app', scripts: { test: 'npm run unit' } }));
  return runScript(['--project-dir', dir, ...(templatePath ? ['--template-path', templatePath] : [])]);
}

test('generated kernel → lists all four precommit sentinels and drops "Fix every issue"', () => {
  const remainder = kernelRemainder(generateKernel());
  for (const s of ['## Overall: ✅ PASS', '## Overall: ⛔ FAIL', '## Overall: ❌ FAIL', '## Overall: ⚠️ NO CHECKS RUN']) {
    assert.ok(remainder.includes(s), `missing sentinel ${s}`);
  }
  assert.doesNotMatch(remainder, /Fix every issue/i);
});

test('generated kernel → states the Read-fails-stop rule and that a named grant is not an installation', () => {
  const remainder = kernelRemainder(generateKernel());
  assert.match(remainder, /if it cannot be read, stop that action and say so/);
  assert.match(remainder, /not evidence that it is installed in this project/);
  assert.match(remainder, /Verification is not the precommit gate/);
});

test('kernel remainder → restates no Anchor Register item outside the verbatim Anchors section', () => {
  assert.deepEqual(anchorRestatements(kernelRemainder(generateKernel())), []);
});

test('a kernel template with a paraphrased Anchor line → the restatement check flags it (negative control)', () => {
  const template = readFileSync(resolve(__dirname, '../../skills/codex-setup/references/agents-kernel.md'), 'utf8')
    .replace('## Conventions\n', '## Conventions\n\n0. Author attribution — use the developer\'s GitHub username, never AI names\n');
  const templatePath = join(createTempDir(), 'kernel.md');
  writeFileSync(templatePath, template);
  assert.deepEqual(anchorRestatements(kernelRemainder(generateKernel(templatePath))), ['/\\bAI names?\\b/i']);
  // The same words as ordinary data outside the remainder do not count: the Anchors section itself
  // carries the attribution rule verbatim, and the check is scoped to the remainder.
  assert.ok(anchorRestatements(generateKernel()).length > 0, 'the verbatim Anchors section does mention them');
});
