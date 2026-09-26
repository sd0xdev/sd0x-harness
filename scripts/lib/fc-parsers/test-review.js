'use strict';

/**
 * Parse `/codex-test-review --ac-trace` output into a DimensionResult.
 *
 * Actual Codex output (per `skills/test-review/references/codex-prompt-ac-trace.md`):
 *   Per-AC `status`:  COVERED | EXCEPTION_VALID | EXCEPTION_INVALID | UNCOVERED | INCONCLUSIVE
 *   Final `gate`:     Adequate | Adequate_with_exceptions | Need_Human | Inadequate
 *   Exception field:  VALID_EXCEPTION | INVALID_EXCEPTION
 *
 * Internal verdict normalisation:
 *   COVERED / EXCEPTION_VALID / VALID_EXCEPTION / ADEQUATE → ADEQUATE
 *   EXCEPTION_INVALID / UNCOVERED / INVALID_EXCEPTION / INADEQUATE → INADEQUATE
 *   INCONCLUSIVE → UNVERIFIED
 *
 * Dimension aggregation:
 *   any INADEQUATE → fail
 *   any UNVERIFIED (no INADEQUATE) → partial
 *   any VALID_EXCEPTION (no INADEQUATE / UNVERIFIED) → partial
 *   all ADEQUATE → pass
 *   no per-AC rows + gate present → map gate
 *   nothing recognised → unverified
 *
 * @param {string} text
 * @returns {object}
 */
function parse(text) {
  const base = {
    name: 'ac_evidence',
    enabled: true,
    provider: '/codex-test-review',
    status: 'unverified',
    applicable_items: 0,
    summary: '',
    per_ac: [],
  };
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    base.summary = 'empty output';
    return base;
  }

  const perAc = parsePerAcVerdicts(text);
  base.per_ac = perAc;
  base.applicable_items = perAc.length;
  const gate = extractGate(text);

  if (perAc.length === 0) {
    if (gate) {
      base.status = mapGate(gate);
      base.summary = `gate=${gate}`;
      return base;
    }
    const freeForm = inferFreeForm(text);
    if (freeForm.status === 'unverified') {
      base.summary = 'no AC verdicts or gate found';
      return base;
    }
    base.status = freeForm.status;
    base.summary = freeForm.summary;
    return base;
  }

  const hasInadequate = perAc.some(a => a.verdict === 'INADEQUATE');
  const hasUnverified = perAc.some(a => a.verdict === 'UNVERIFIED');
  const hasException = perAc.some(a => a.verdict === 'VALID_EXCEPTION');
  if (hasInadequate) base.status = 'fail';
  else if (hasUnverified) base.status = 'partial';
  else if (hasException) base.status = 'partial';
  else base.status = 'pass';

  base.summary = formatSummary(perAc, gate);
  return base;
}

const PER_AC_STATUS_TOKENS = {
  COVERED: 'ADEQUATE',
  EXCEPTION_VALID: 'VALID_EXCEPTION',
  VALID_EXCEPTION: 'VALID_EXCEPTION',
  ADEQUATE: 'ADEQUATE',
  EXCEPTION_INVALID: 'INADEQUATE',
  INVALID_EXCEPTION: 'INADEQUATE',
  UNCOVERED: 'INADEQUATE',
  INADEQUATE: 'INADEQUATE',
  INCONCLUSIVE: 'UNVERIFIED',
};

function normaliseStatusToken(token) {
  if (!token) return null;
  const upper = token.toUpperCase();
  return PER_AC_STATUS_TOKENS[upper] || null;
}

function parsePerAcVerdicts(text) {
  const rows = [];
  const tokenClass = Object.keys(PER_AC_STATUS_TOKENS).join('|');
  const tableRowRe = new RegExp(
    `^\\|\\s*(AC-\\d+)\\s*\\|\\s*[^|]*?\\s*\\|\\s*(${tokenClass})\\s*\\|`,
    'i',
  );
  const bulletRowRe = new RegExp(
    `^\\s*(?:[-*]\\s*)?(AC-\\d+)\\s*[:\\-–]\\s*(${tokenClass})\\b`,
    'i',
  );
  const acNumberBlockRe = new RegExp(
    `ac_number:\\s*(\\d+)[\\s\\S]{0,400}?status:\\s*(${tokenClass})`,
    'gi',
  );

  for (const line of text.split('\n')) {
    const table = line.match(tableRowRe);
    if (table) addRow(rows, table[1], table[2]);
    const bullet = line.match(bulletRowRe);
    if (bullet) addRow(rows, bullet[1], bullet[2]);
  }

  for (const match of text.matchAll(acNumberBlockRe)) {
    addRow(rows, `AC-${match[1]}`, match[2]);
  }

  return rows;
}

function addRow(rows, id, token) {
  const verdict = normaliseStatusToken(token);
  if (!verdict) return;
  const existing = rows.find(r => r.id === id);
  if (existing) {
    if (severityRank(verdict) > severityRank(existing.verdict)) {
      existing.verdict = verdict;
    }
    return;
  }
  rows.push({ id, verdict });
}

function severityRank(verdict) {
  if (verdict === 'INADEQUATE') return 3;
  if (verdict === 'UNVERIFIED') return 2;
  if (verdict === 'VALID_EXCEPTION') return 1;
  return 0;
}

// Gate wording appears in two conventions across specs:
//   testing-contract.md §Adequacy Gate Sentinels — "Adequate with exceptions" (space, icon-prefixed)
//   Codex --ac-trace contract                  — "Adequate_with_exceptions" (snake_case)
// Accept both (plus optional leading sentinel icon and `gate: …` / `Gate: …`
// label). Matching both prevents an empty per_ac + space-form gate from
// falling through to `inferFreeForm`, which would incorrectly upgrade the
// dimension to `pass` on seeing the bare word "Adequate".
const GATE_RE = /(?:^|\s)(?:gate|Gate)\s*[:—-]?\s*(?:[^\w\s]+\s*)?(Adequate[_ ]with[_ ]exceptions|Adequate|Need[_ ]Human|Inadequate)\b/i;

function extractGate(text) {
  const m = text.match(GATE_RE);
  return m ? m[1] : null;
}

function normaliseGateKey(gate) {
  return gate.toLowerCase().replace(/[\s_]+/g, '_');
}

function mapGate(gate) {
  const key = normaliseGateKey(gate);
  if (key === 'inadequate') return 'fail';
  if (key === 'adequate') return 'pass';
  if (key === 'adequate_with_exceptions') return 'partial';
  return 'unverified';
}

function inferFreeForm(text) {
  const hasInadequate = /\bINADEQUATE\b|\bUNCOVERED\b|\bEXCEPTION_INVALID\b|\bINVALID_EXCEPTION\b/i.test(text);
  const hasAdequate = /\bADEQUATE\b|\bCOVERED\b/i.test(text);
  const hasException = /\bVALID_EXCEPTION\b|\bEXCEPTION_VALID\b/i.test(text);
  const hasInconclusive = /\bINCONCLUSIVE\b/i.test(text);
  if (hasInadequate) return { status: 'fail', summary: 'verdict inferred from free-form scan' };
  if (hasInconclusive) return { status: 'partial', summary: 'inconclusive evidence' };
  if (hasException) return { status: 'partial', summary: 'exception-only evidence' };
  if (hasAdequate) return { status: 'pass', summary: 'verdict inferred from free-form scan' };
  return { status: 'unverified', summary: '' };
}

function formatSummary(perAc, gate) {
  const counts = { ADEQUATE: 0, INADEQUATE: 0, VALID_EXCEPTION: 0, UNVERIFIED: 0 };
  for (const row of perAc) counts[row.verdict] = (counts[row.verdict] || 0) + 1;
  const parts = [];
  if (counts.ADEQUATE) parts.push(`${counts.ADEQUATE} adequate`);
  if (counts.VALID_EXCEPTION) parts.push(`${counts.VALID_EXCEPTION} exception`);
  if (counts.UNVERIFIED) parts.push(`${counts.UNVERIFIED} inconclusive`);
  if (counts.INADEQUATE) parts.push(`${counts.INADEQUATE} inadequate`);
  if (gate) parts.push(`gate=${gate}`);
  return parts.join(', ');
}

module.exports = { parse };
