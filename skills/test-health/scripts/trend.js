#!/usr/bin/env node
'use strict';

/**
 * trend.js
 * Trend snapshot read/write + delta computation + rolling window pruning.
 * Uses lockdir + atomic write pattern (mtime-based TTL, no pid/ts files).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Reuse safeSlug + sha1 from shared utils if available, else inline
let safeSlug, sha1;
try {
  const pluginRoot = (() => {
    const sentinel = p => fs.existsSync(path.join(p, 'scripts', 'lib', 'utils.js'));
    const marker = p => fs.existsSync(path.join(p, '.claude-plugin', 'plugin.json'));
    let d = __dirname;
    while (d !== path.dirname(d)) {
      if (sentinel(d) && marker(d)) return d;
      d = path.dirname(d);
    }
    return null;
  })();
  if (pluginRoot) {
    const utils = require(path.join(pluginRoot, 'scripts', 'lib', 'utils'));
    safeSlug = utils.safeSlug;
    sha1 = utils.sha1;
  }
} catch { /* fallback below */ }

if (!safeSlug) {
  const crypto = require('crypto');
  sha1 = s => crypto.createHash('sha1').update(String(s)).digest('hex');
  safeSlug = s => String(s || '').trim().replace(/\s+/g, '-').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function getRepoKey(repoRoot) {
  const repoBase = path.basename(repoRoot);
  let remote;
  try {
    remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    remote = repoRoot;
  }
  return `${safeSlug(repoBase)}--${sha1(remote).slice(0, 8)}`;
}

function getCacheDir(repoRoot) {
  const key = getRepoKey(repoRoot);
  return path.join(repoRoot, '.claude', 'cache', 'test-health', key);
}

// --- Lock (mkdir-based, mtime TTL) ---

function lock(cacheDir, timeout = 5, ttl = 60) {
  const lockDir = path.join(cacheDir, '.lock');
  const start = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lockDir);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') return false;
      // Check stale lock via mtime
      try {
        const stat = fs.statSync(lockDir);
        const age = Math.floor((Date.now() - stat.mtimeMs) / 1000);
        if (age > ttl) {
          fs.rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch { /* lock dir gone, retry */ continue; }
      if (Date.now() - start > timeout * 1000) return false;
      // busy-wait 100ms (acceptable for CLI tool, bounded by timeout)
      const end = Date.now() + 100;
      while (Date.now() < end) { /* spin */ }
    }
  }
}

function unlock(cacheDir) {
  const lockDir = path.join(cacheDir, '.lock');
  try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// --- Read/Write ---

function readLatest(cacheDir) {
  const latestPath = path.join(cacheDir, 'latest.json');
  try {
    return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeSnapshot(cacheDir, snapshot) {
  const historyDir = path.join(cacheDir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  if (!lock(cacheDir)) {
    // fail-open: write without lock
    _doWrite(cacheDir, historyDir, snapshot);
    pruneHistory(cacheDir, 30);
    return;
  }
  try {
    _doWrite(cacheDir, historyDir, snapshot);
    pruneHistory(cacheDir, 30);
  } finally {
    unlock(cacheDir);
  }
}

function _doWrite(cacheDir, historyDir, snapshot) {
  const ts = snapshot.timestamp ? snapshot.timestamp.replace(/[:.]/g, '-').slice(0, 19) : new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sha = snapshot.sha || 'unknown';
  const filename = `${ts.replace(/T/, '-')}--${sha}.json`;
  const tmpPath = path.join(historyDir, filename + '.tmp');
  const finalPath = path.join(historyDir, filename);
  const latestPath = path.join(cacheDir, 'latest.json');

  fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2));
  fs.renameSync(tmpPath, finalPath);
  // Update latest.json (copy, not symlink)
  fs.copyFileSync(finalPath, latestPath);
}

// --- Delta computation ---

function computeDelta(current, previous) {
  if (!previous) return null;
  const delta = {};

  // Coverage delta: same tool_id + source_type, and the same measured population
  // (references/trend-schema.md § Coverage Trend).
  if (current.code_coverage && previous.code_coverage) {
    const cc = current.code_coverage;
    const pc = previous.code_coverage;
    if (cc.tool_id === pc.tool_id && cc.source_type === pc.source_type) {
      const population = _populationRelation(cc.population, pc.population);
      delta.line_coverage = _coverageDiff(cc.lines, pc.lines, population);
      delta.branch_coverage = _coverageDiff(cc.branches, pc.branches, population);
    } else {
      delta.coverage_reset = cc.tool_id !== pc.tool_id
        ? `Tool changed: ${pc.tool_id} → ${cc.tool_id}`
        : `Source changed: ${pc.source_type} → ${cc.source_type}`;
    }
  }

  // Test count delta (only same count_level per layer)
  if (current.test_inventory && previous.test_inventory) {
    delta.test_counts = {};
    for (const layer of ['unit', 'integration', 'e2e']) {
      const cl = current.test_inventory[layer];
      const pl = previous.test_inventory[layer];
      if (cl && pl && cl.count_level === pl.count_level) {
        delta.test_counts[layer] = _diff(cl.tests, pl.tests);
      } else if (cl && pl) {
        delta.test_counts[layer] = { reset: `count_level changed: ${pl.count_level} → ${cl.count_level}` };
      }
    }
  }

  return delta;
}

// 'same' | 'changed' | 'unknown'. A population is what the tool was pointed at — scope plus
// include/exclude configuration — not how many lines it found there.
function _populationRelation(current, previous) {
  const key = p => (p && typeof p === 'object' && typeof p.scope === 'string' && typeof p.config_sha === 'string')
    ? `${p.scope}\u0000${p.config_sha}` : null;
  const ck = key(current);
  const pk = key(previous);
  if (ck === null || pk === null) return 'unknown';
  return ck === pk ? 'same' : 'changed';
}

// A percentage difference is asserted as a direction only when both points measure the same
// population. Declared-same population → comparable, whatever the denominator did (code grew).
// No declaration on either side (old snapshots) → comparable only if the denominator is recorded
// (a positive count) and unchanged; otherwise the numbers are reported and no direction is claimed.
function _coverageDiff(current, previous, population) {
  // A metric the artifact did not carry has no delta. Parsers mark presence with `measured`;
  // snapshots older than that field leave a 0% with no denominator ambiguous (measured zero, or
  // a placeholder for a missing metric), so the numbers are shown and no direction is claimed.
  const absent = m => !m || m.pct == null || m.measured === false;
  if (absent(current) || absent(previous)) return null;
  const ambiguous = m => m.measured !== true && m.pct === 0 && !(m.total > 0);
  const diff = _diff(current.pct, previous.pct);
  if (!diff) return null;
  // A recorded denominator is a positive count. Some parsers store `total: 0` when the artifact
  // gives only a rate (Cobertura), and two zeros are two unknowns, not two equal denominators.
  const known = t => Number.isFinite(t) && t > 0;
  const bothKnown = known(current?.total) && known(previous?.total);
  const sameTotal = bothKnown && current.total === previous.total;
  let reason = null;
  if (ambiguous(current) || ambiguous(previous)) reason = '0% with no denominator: measured zero and missing metric cannot be told apart';
  else if (population === 'changed') reason = 'population changed: scope or include/exclude configuration differs';
  else if (population === 'unknown' && !sameTotal) {
    reason = bothKnown
      ? `denominator changed (${previous.total} → ${current.total}) and the population is not recorded`
      : 'denominator and population are not recorded';
  }
  if (reason) return { ...diff, direction: '?', comparable: false, reason };
  return { ...diff, comparable: true, basis: population === 'same' ? 'same_population' : 'same_denominator' };
}

function _diff(current, previous) {
  if (current == null || previous == null) return null;
  const value = current - previous;
  const direction = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  return { previous, current, value, direction };
}

// --- Pruning ---

function pruneHistory(cacheDir, maxItems = 30) {
  const historyDir = path.join(cacheDir, 'history');
  if (!fs.existsSync(historyDir)) return 0;
  const files = fs.readdirSync(historyDir)
    .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
    .sort();
  const toRemove = files.length > maxItems ? files.slice(0, files.length - maxItems) : [];
  for (const f of toRemove) {
    fs.unlinkSync(path.join(historyDir, f));
  }
  return toRemove.length;
}

module.exports = {
  getRepoKey,
  getCacheDir,
  lock,
  unlock,
  readLatest,
  writeSnapshot,
  computeDelta,
  pruneHistory,
};
