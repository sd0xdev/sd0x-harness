#!/usr/bin/env node
'use strict';

/**
 * artifact-parser.js
 * Detect and parse coverage artifacts (LCOV, Istanbul JSON, Jest summary,
 * Cobertura XML, Go cover profile, Tarpaulin JSON, JaCoCo XML/CSV).
 *
 * Exports: detectArtifacts, parseLcov, parseIstanbulJson, parseJestSummary,
 *          parseCoberturaXml, parseGoCoverProfile, parseTarpaulinJson,
 *          parseJacocoXml, parseJacocoCsv, checkFreshness
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// --- Artifact detection ---

const KNOWN_PATHS = [
  { pattern: 'coverage/lcov.info', format: 'lcov', tool: 'c8' },
  { pattern: 'coverage/coverage-final.json', format: 'istanbul', tool: 'nyc' },
  { pattern: 'coverage/coverage-summary.json', format: 'jest-summary', tool: 'jest' },
  { pattern: '.nyc_output/coverage-final.json', format: 'istanbul', tool: 'nyc' },
  { pattern: 'coverage.xml', format: 'cobertura', tool: 'coverage.py' },
  { pattern: 'cover.out', format: 'go-cover', tool: 'go-cover' },
  { pattern: 'coverage.out', format: 'go-cover', tool: 'go-cover' },
  { pattern: 'tarpaulin-report.json', format: 'tarpaulin', tool: 'tarpaulin' },
  { pattern: 'cobertura.xml', format: 'cobertura', tool: 'tarpaulin' },
  { pattern: 'build/reports/jacoco/test/jacocoTestReport.xml', format: 'jacoco-xml', tool: 'jacoco' },
  { pattern: 'target/site/jacoco/jacoco.xml', format: 'jacoco-xml', tool: 'jacoco' },
  { pattern: 'build/reports/jacoco/test/jacocoTestReport.csv', format: 'jacoco-csv', tool: 'jacoco' },
  { pattern: 'lcov.info', format: 'lcov', tool: 'unknown' },
];

function detectArtifacts(root) {
  const candidates = [];
  for (const entry of KNOWN_PATHS) {
    const full = path.join(root, entry.pattern);
    if (fs.existsSync(full)) {
      const stat = fs.statSync(full);
      candidates.push({
        path: full,
        relativePath: entry.pattern,
        format: entry.format,
        tool: entry.tool,
        mtime: Math.floor(stat.mtimeMs / 1000),
        size: stat.size,
        depth: entry.pattern.split('/').length - 1,
      });
    }
  }
  // .coverage detection (Python SQLite - not parseable)
  const dotCov = path.join(root, '.coverage');
  if (fs.existsSync(dotCov)) {
    const stat = fs.statSync(dotCov);
    candidates.push({
      path: dotCov,
      relativePath: '.coverage',
      format: 'coverage-db',
      tool: 'coverage.py',
      mtime: Math.floor(stat.mtimeMs / 1000),
      size: stat.size,
      depth: 0,
      unparseable: true,
      hint: 'Run `coverage xml` to generate parseable coverage.xml',
    });
  }
  return candidates;
}

function selectBest(candidates) {
  const parseable = candidates.filter(c => !c.unparseable);
  if (parseable.length === 0) return null;
  if (parseable.length === 1) return parseable[0];
  parseable.sort((a, b) => {
    if (a.mtime !== b.mtime) return b.mtime - a.mtime;
    if (a.depth !== b.depth) return a.depth - b.depth;
    const completeness = { lcov: 3, istanbul: 2, 'jest-summary': 2, cobertura: 1 };
    return (completeness[b.format] || 0) - (completeness[a.format] || 0);
  });
  return parseable[0];
}

// --- Freshness check ---

function checkFreshness(artifactPath, repoRoot) {
  const stat = fs.statSync(artifactPath);
  const artifactMtime = Math.floor(stat.mtimeMs / 1000);
  let headTimestamp;
  try {
    headTimestamp = parseInt(
      execFileSync('git', ['log', '-1', '--format=%ct', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
      10
    );
  } catch {
    return { freshness: 'unknown', dirty_tree: false };
  }
  let dirtyTree = false;
  try {
    const porcelain = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    dirtyTree = porcelain.length > 0;
  } catch {
    // ignore
  }
  return {
    freshness: artifactMtime >= headTimestamp ? 'current' : 'stale',
    dirty_tree: dirtyTree,
  };
}

// --- Parsers ---

// `measured: false` = the artifact did not carry this metric; its pct is a placeholder, not a
// measured value. Trend comparison depends on the difference (references/trend-schema.md).
function counted(covered, total) {
  return { covered, total, pct: total > 0 ? round(covered / total * 100) : 0, measured: total > 0 };
}

function parseLcov(content) {
  let lf = 0, lh = 0, brf = 0, brh = 0;
  for (const line of content.split('\n')) {
    if (line.startsWith('LF:')) lf += parseInt(line.slice(3), 10) || 0;
    else if (line.startsWith('LH:')) lh += parseInt(line.slice(3), 10) || 0;
    else if (line.startsWith('BRF:')) brf += parseInt(line.slice(4), 10) || 0;
    else if (line.startsWith('BRH:')) brh += parseInt(line.slice(4), 10) || 0;
  }
  return {
    lines: counted(lh, lf),
    branches: counted(brh, brf),
  };
}

function parseIstanbulJson(content) {
  const data = JSON.parse(content);
  let sCov = 0, sTotal = 0, bCov = 0, bTotal = 0;
  for (const file of Object.values(data)) {
    const s = file.s || {};
    for (const v of Object.values(s)) { sTotal++; if (v > 0) sCov++; }
    const b = file.b || {};
    for (const arr of Object.values(b)) {
      for (const v of arr) { bTotal++; if (v > 0) bCov++; }
    }
  }
  return {
    lines: counted(sCov, sTotal),
    branches: counted(bCov, bTotal),
  };
}

function parseJestSummary(content) {
  const data = JSON.parse(content);
  const t = data.total || {};
  return {
    lines: { covered: t.lines?.covered || 0, total: t.lines?.total || 0, pct: t.lines?.pct || 0, measured: (t.lines?.total || 0) > 0 },
    branches: { covered: t.branches?.covered || 0, total: t.branches?.total || 0, pct: t.branches?.pct || 0, measured: (t.branches?.total || 0) > 0 },
  };
}

function parseCoberturaXml(content) {
  const root = (content.match(/<coverage\b[^>]*>/) || [content])[0];
  const attr = name => { const m = root.match(new RegExp(`\\b${name}="([^"]+)"`)); return m ? parseFloat(m[1]) : NaN; };
  // A rate is a measurement unless the report says there was nothing to measure
  // (coverage.py without branch coverage writes branch-rate="0" branches-valid="0"). The counts
  // are kept when the report carries them; total stays 0 for a rate-only report.
  const metric = (rate, valid, covered) => {
    const total = valid > 0 ? valid : 0;
    return {
      covered: total > 0 ? (Number.isFinite(covered) ? covered : Math.round(rate * total) || 0) : 0,
      total,
      pct: Number.isFinite(rate) ? round(rate * 100) : 0,
      measured: Number.isFinite(rate) && valid !== 0,
    };
  };
  return {
    lines: metric(attr('line-rate'), attr('lines-valid'), attr('lines-covered')),
    branches: metric(attr('branch-rate'), attr('branches-valid'), attr('branches-covered')),
  };
}

function parseGoCoverProfile(content) {
  const lines = content.split('\n').filter(l => l && !l.startsWith('mode:'));
  let covered = 0, total = 0;
  for (const line of lines) {
    const match = line.match(/(\d+)$/);
    if (match) {
      total++;
      if (parseInt(match[1], 10) > 0) covered++;
    }
  }
  return {
    lines: counted(covered, total),
    branches: counted(0, 0),
  };
}

function parseTarpaulinJson(content) {
  const data = JSON.parse(content);
  const covered = data.covered || 0;
  const coverable = data.coverable || 0;
  return {
    lines: counted(covered, coverable),
    branches: counted(0, 0),
  };
}

function parseJacocoXml(content) {
  let instrCov = 0, instrTotal = 0, brCov = 0, brTotal = 0;
  const counterRe = /<counter type="(\w+)" missed="(\d+)" covered="(\d+)"\/>/g;
  let m;
  while ((m = counterRe.exec(content)) !== null) {
    const [, type, missed, covered] = m;
    if (type === 'INSTRUCTION') {
      instrCov += parseInt(covered, 10);
      instrTotal += parseInt(missed, 10) + parseInt(covered, 10);
    } else if (type === 'BRANCH') {
      brCov += parseInt(covered, 10);
      brTotal += parseInt(missed, 10) + parseInt(covered, 10);
    }
  }
  return {
    lines: counted(instrCov, instrTotal),
    branches: counted(brCov, brTotal),
  };
}

function parseJacocoCsv(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return { lines: counted(0, 0), branches: counted(0, 0) };
  const header = lines[0].split(',');
  const instrMissIdx = header.indexOf('INSTRUCTION_MISSED');
  const instrCovIdx = header.indexOf('INSTRUCTION_COVERED');
  const brMissIdx = header.indexOf('BRANCH_MISSED');
  const brCovIdx = header.indexOf('BRANCH_COVERED');
  let instrCov = 0, instrTotal = 0, brCov = 0, brTotal = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (instrMissIdx >= 0 && instrCovIdx >= 0) {
      const missed = parseInt(cols[instrMissIdx], 10) || 0;
      const covered = parseInt(cols[instrCovIdx], 10) || 0;
      instrCov += covered;
      instrTotal += missed + covered;
    }
    if (brMissIdx >= 0 && brCovIdx >= 0) {
      const missed = parseInt(cols[brMissIdx], 10) || 0;
      const covered = parseInt(cols[brCovIdx], 10) || 0;
      brCov += covered;
      brTotal += missed + covered;
    }
  }
  return {
    lines: counted(instrCov, instrTotal),
    branches: counted(brCov, brTotal),
  };
}

function parseArtifact(filePath, format) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsers = {
    lcov: parseLcov,
    istanbul: parseIstanbulJson,
    'jest-summary': parseJestSummary,
    cobertura: parseCoberturaXml,
    'go-cover': parseGoCoverProfile,
    tarpaulin: parseTarpaulinJson,
    'jacoco-xml': parseJacocoXml,
    'jacoco-csv': parseJacocoCsv,
  };
  const parser = parsers[format];
  if (!parser) return null;
  return parser(content);
}

function round(n) { return Math.round(n * 10) / 10; }

module.exports = {
  detectArtifacts,
  selectBest,
  checkFreshness,
  parseArtifact,
  parseLcov,
  parseIstanbulJson,
  parseJestSummary,
  parseCoberturaXml,
  parseGoCoverProfile,
  parseTarpaulinJson,
  parseJacocoXml,
  parseJacocoCsv,
  KNOWN_PATHS,
};
