const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const {
  parseNodeTest, parseJest, parseVitest, parsePytest,
  parseGoJson, parseGoFallback, parseCargo, parseTestCount,
} = require(resolve(__dirname, '../../skills/test-health/scripts/count-parser'));

test('parseNodeTest extracts test counts', () => {
  const stdout = '# tests 47\n# pass 45\n# fail 2\n# cancelled 0\n# skipped 0';
  const result = parseNodeTest(stdout);
  assert.equal(result.total, 47);
  assert.equal(result.passed, 45);
  assert.equal(result.failed, 2);
  assert.equal(result.count_level, 'test_case');
});

test('parseNodeTest reads the spec summary, the piped default on Node 26', () => {
  const stdout = '✔ passes (0.3ms)\n✖ fails (0.4ms)\n﹣ skipped (0.1ms) # SKIP\nℹ tests 3\nℹ suites 0\nℹ pass 1\nℹ fail 1\nℹ cancelled 0\nℹ skipped 1\n';
  assert.deepEqual(parseNodeTest(stdout), { total: 3, passed: 1, failed: 1, count_level: 'test_case' });
  assert.deepEqual(parseTestCount(stdout, 'node:test'), parseNodeTest(stdout));
});

test('parseNodeTest reads a colored spec summary', () => {
  const stdout = '\x1b[34mℹ tests 3\x1b[39m\n\x1b[34mℹ pass 1\x1b[39m\n\x1b[34mℹ fail 2\x1b[39m\n';
  assert.deepEqual(parseNodeTest(stdout), { total: 3, passed: 1, failed: 2, count_level: 'test_case' });
});

for (const color of ['0', '1']) {
  test(`parseNodeTest reads what this Node prints when piped, FORCE_COLOR=${color}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-parser-'));
    try {
      // One case per file: the oldest supported runners count files, later ones cases.
      const file = (name, body) => writeFileSync(join(dir, name), `const { test } = require('node:test');\ntest('${name}', () => {${body}});\n`);
      file('good.test.js', '');
      file('bad.test.js', " throw new Error('x'); ");
      const env = { ...process.env, FORCE_COLOR: color };
      delete env.NODE_TEST_CONTEXT;
      const out = spawnSync(process.execPath, ['--test', 'good.test.js', 'bad.test.js'], { cwd: dir, env, encoding: 'utf8' }).stdout;
      assert.deepEqual(parseNodeTest(out), { total: 2, passed: 1, failed: 1, count_level: 'test_case' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('parseNodeTest returns null for non-matching output', () => {
  assert.equal(parseNodeTest('no test output here'), null);
});

test('parseJest extracts test counts', () => {
  const stdout = 'Tests:  2 failed, 45 passed, 47 total';
  const result = parseJest(stdout);
  assert.equal(result.total, 47);
  assert.equal(result.passed, 45);
  assert.equal(result.failed, 2);
});

test('parseJest handles all-pass output', () => {
  const stdout = 'Tests:  47 passed, 47 total';
  const result = parseJest(stdout);
  assert.equal(result.total, 47);
  assert.equal(result.passed, 47);
  assert.equal(result.failed, 0);
});

test('parseVitest extracts test counts', () => {
  const stdout = 'Tests  47 passed | 2 failed (49)';
  const result = parseVitest(stdout);
  assert.equal(result.total, 49);
  assert.equal(result.passed, 47);
  assert.equal(result.failed, 2);
});

test('parsePytest extracts test counts', () => {
  const stdout = '47 passed, 2 failed in 12.3s';
  const result = parsePytest(stdout);
  assert.equal(result.total, 49);
  assert.equal(result.passed, 47);
  assert.equal(result.failed, 2);
});

test('parsePytest handles all-pass', () => {
  const stdout = '47 passed in 5.2s';
  const result = parsePytest(stdout);
  assert.equal(result.total, 47);
  assert.equal(result.failed, 0);
});

test('parsePytest handles fail-only summary', () => {
  const stdout = '2 failed in 0.12s';
  const result = parsePytest(stdout);
  assert.equal(result.total, 2);
  assert.equal(result.passed, 0);
  assert.equal(result.failed, 2);
});

test('parsePytest handles errors and skipped', () => {
  const stdout = '3 passed, 1 failed, 2 error, 5 skipped in 1.2s';
  const result = parsePytest(stdout);
  assert.equal(result.total, 11);
  assert.equal(result.passed, 3);
  assert.equal(result.failed, 3); // 1 failed + 2 error
});

test('parseGoJson counts pass/fail events', () => {
  const stdout = [
    '{"Action":"pass","Test":"TestAdd"}',
    '{"Action":"pass","Test":"TestSub"}',
    '{"Action":"fail","Test":"TestDiv"}',
    '{"Action":"pass","Package":"pkg"}',
  ].join('\n');
  const result = parseGoJson(stdout);
  assert.equal(result.total, 3);
  assert.equal(result.passed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.count_level, 'test_case');
});

test('parseGoFallback counts package results', () => {
  const stdout = 'ok  \tgithub.com/pkg/a\t0.5s\nok  \tgithub.com/pkg/b\t1.2s\nFAIL\tgithub.com/pkg/c\t0.3s';
  const result = parseGoFallback(stdout);
  assert.equal(result.total, 3);
  assert.equal(result.passed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.count_level, 'package');
});

test('parseCargo extracts test counts', () => {
  const stdout = 'test result: ok. 47 passed; 2 failed; 0 ignored; 0 measured';
  const result = parseCargo(stdout);
  assert.equal(result.total, 49);
  assert.equal(result.passed, 47);
  assert.equal(result.failed, 2);
});

test('parseTestCount auto-detects framework', () => {
  const stdout = '# tests 10\n# pass 10\n# fail 0';
  const result = parseTestCount(stdout);
  assert.equal(result.total, 10);
  assert.equal(result.count_level, 'test_case');
});

test('parseTestCount returns null for empty output', () => {
  assert.equal(parseTestCount(''), null);
});
