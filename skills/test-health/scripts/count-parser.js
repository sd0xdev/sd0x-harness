#!/usr/bin/env node
'use strict';

const { stripVTControlCharacters } = require('node:util');

/**
 * count-parser.js
 * Parse test counts from test runner stdout output.
 * Supports: node:test, jest, vitest, pytest, go test, cargo test.
 */

// `#` is the TAP summary and `ℹ` the spec one: piped, Node 22 prints the first and Node 26 the second.
// The spec one is colored when color is forced.
function parseNodeTest(stdout) {
  const text = stripVTControlCharacters(stdout);
  const tests = text.match(/^[#ℹ] tests (\d+)/m);
  const pass = text.match(/^[#ℹ] pass (\d+)/m);
  const fail = text.match(/^[#ℹ] fail (\d+)/m);
  if (!tests) return null;
  return {
    total: parseInt(tests[1], 10),
    passed: pass ? parseInt(pass[1], 10) : 0,
    failed: fail ? parseInt(fail[1], 10) : 0,
    count_level: 'test_case',
  };
}

function parseJest(stdout) {
  const m = stdout.match(/Tests:\s+(?:(\d+) failed,\s+)?(?:(\d+) passed,\s+)?(\d+) total/);
  if (!m) return null;
  return {
    total: parseInt(m[3], 10),
    passed: m[2] ? parseInt(m[2], 10) : 0,
    failed: m[1] ? parseInt(m[1], 10) : 0,
    count_level: 'test_case',
  };
}

function parseVitest(stdout) {
  const m = stdout.match(/Tests\s+(\d+)\s+passed\s*\|\s*(\d+)\s+failed\s*\((\d+)\)/);
  if (!m) return null;
  return {
    total: parseInt(m[3], 10),
    passed: parseInt(m[1], 10),
    failed: parseInt(m[2], 10),
    count_level: 'test_case',
  };
}

function parsePytest(stdout) {
  const passedMatch = stdout.match(/(\d+) passed/);
  const failedMatch = stdout.match(/(\d+) failed/);
  const errorMatch = stdout.match(/(\d+) error/);
  const skippedMatch = stdout.match(/(\d+) skipped/);
  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
  const errors = errorMatch ? parseInt(errorMatch[1], 10) : 0;
  const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
  if (!passedMatch && !failedMatch && !errorMatch) return null;
  return {
    total: passed + failed + errors + skipped,
    passed,
    failed: failed + errors,
    count_level: 'test_case',
  };
}

function parseGoJson(stdout) {
  let passed = 0, failed = 0;
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.Test && obj.Action === 'pass') passed++;
      else if (obj.Test && obj.Action === 'fail') failed++;
    } catch {
      // not JSON line, skip
    }
  }
  if (passed === 0 && failed === 0) return null;
  return { total: passed + failed, passed, failed, count_level: 'test_case' };
}

function parseGoFallback(stdout) {
  let okCount = 0, failCount = 0;
  for (const line of stdout.split('\n')) {
    if (/^ok\s+/.test(line)) okCount++;
    else if (/^FAIL\s+/.test(line)) failCount++;
  }
  if (okCount === 0 && failCount === 0) return null;
  return { total: okCount + failCount, passed: okCount, failed: failCount, count_level: 'package' };
}

function parseCargo(stdout) {
  const m = stdout.match(/(\d+) passed;\s*(\d+) failed;\s*(\d+) ignored/);
  if (!m) return null;
  return {
    total: parseInt(m[1], 10) + parseInt(m[2], 10),
    passed: parseInt(m[1], 10),
    failed: parseInt(m[2], 10),
    count_level: 'test_case',
  };
}

function parseTestCount(stdout, framework) {
  const parsers = {
    'node:test': parseNodeTest,
    jest: parseJest,
    vitest: parseVitest,
    pytest: parsePytest,
    'go-json': parseGoJson,
    'go-fallback': parseGoFallback,
    cargo: parseCargo,
  };
  const parser = parsers[framework];
  if (parser) return parser(stdout);
  // Auto-detect: try each parser
  for (const fn of Object.values(parsers)) {
    const result = fn(stdout);
    if (result) return result;
  }
  return null;
}

function detectFramework(rootOrPkgPath) {
  if (typeof rootOrPkgPath !== 'string' || !rootOrPkgPath) return null;
  const fs = require('fs');
  const p = require('path');
  // Determine root directory: if path ends with package.json, use its directory
  const root = rootOrPkgPath.endsWith('package.json') ? p.dirname(rootOrPkgPath) : rootOrPkgPath;
  const pkgJsonPath = rootOrPkgPath.endsWith('package.json') ? rootOrPkgPath : p.join(root, 'package.json');

  // Node.js detection via package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.jest) return 'jest';
    if (deps.vitest) return 'vitest';
    const testScript = pkg.scripts?.test || '';
    if (testScript.includes('node --test')) return 'node:test';
    if (testScript.includes('jest')) return 'jest';
    if (testScript.includes('vitest')) return 'vitest';
  } catch { /* not a Node project or no package.json */ }

  // Python detection
  try {
    if (fs.existsSync(p.join(root, 'pyproject.toml')) || fs.existsSync(p.join(root, 'setup.py'))) return 'pytest';
  } catch { /* ignore */ }

  // Go detection
  try {
    if (fs.existsSync(p.join(root, 'go.mod'))) return 'go-json';
  } catch { /* ignore */ }

  // Rust detection
  try {
    if (fs.existsSync(p.join(root, 'Cargo.toml'))) return 'cargo';
  } catch { /* ignore */ }

  return null;
}

module.exports = {
  parseNodeTest,
  parseJest,
  parseVitest,
  parsePytest,
  parseGoJson,
  parseGoFallback,
  parseCargo,
  parseTestCount,
  detectFramework,
};
