#!/usr/bin/env node
'use strict';

/**
 * debate-topic.js — necessity-audit Phase B helper.
 *
 * Subcommands:
 *   build  — construct the /codex-brainstorm topic string from preflight.json
 *   parse  — extract debate metadata from a raw /codex-brainstorm response
 *            { threadId, rounds, equilibriumReached, conclusion, evidenceCitations, roundsText, perElementVerdicts }
 *
 * CLI:
 *   node debate-topic.js build --preflight <file> --output <file>
 *   node debate-topic.js parse --input <file> --output <file>
 */

const fs = require('fs');

const DIM_NAMES = {
  1: 'Necessity Now',
  2: 'Abstraction Justification',
  3: 'Extensibility Speculation',
  4: 'Configurability Excess',
  5: 'Premature Optimization',
  6: 'Scope Drift',
};

function buildTopic(preflight) {
  const { absPath, relPath, featureKey, docKind, greenfield, depth, activeDimensions } = preflight;
  const terminationPref = depth === 'deep'
    ? 'agreement REQUIRED — the debate must end with both sides in agreement (converged, or an agreed trade-off). A debate reported as diverged fails the gate, and so does one that merely went quiet while the sides still disagree'
    : 'any termination accepted';
  const dimBullets = activeDimensions.map(d => `${d}. ${DIM_NAMES[d]}`).join('\n');
  const greenfieldNote = greenfield
    ? '- no implementation yet; challenge via doc:section only, mark evidence [REASONING-ONLY]'
    : `- git grep -l -E "${featureKey}" -- . ':(exclude)docs/**' ':(exclude)**/*.md'`;

  return `## Topic — necessity audit of ${relPath}

Determine which elements in the spec are over-designed. Challenge necessity across the ACTIVE dimensions only:

${dimBullets}

## Constraints
- Target file: ${relPath} (absolute: ${absPath})
- Feature key: ${featureKey}
- Doc kind: ${docKind}
- Greenfield: ${greenfield}
- Depth: ${depth}
- Termination preference: ${terminationPref}
- Forbidden: you are NOT given Claude's pre-classification. Do not ask for it. Independently classify.
- Required evidence format: file:line (if code exists) or doc:section + [REASONING-ONLY] (if greenfield)

## Classification output contract (per-element)
For each element you identify (FR/NFR/Component/Abstraction/Extensibility/Config), emit a line of the form:
  [VERDICT: <Keep|Review|Cut>] <ID> — <one-sentence rationale> — Evidence: <file:line | doc:section>
Emit these BEFORE the Conclusion section so the Parser can extract them.

## ⚠️ Research independently ⚠️
- cat ${relPath}
- ls docs/features/${featureKey}/
${greenfieldNote}

## Rounds
This skill does NOT control round count. /codex-brainstorm uses its own ~3-5 round window. Run until that skill's stopping rule (no new objections) or its max-rounds limit. Report actual rounds as "<N> rounds".

## Coverage requirement
Each active dimension must receive >=1 challenge-response cycle. Coverage is verified post-hoc via keyword match on the final conclusion + rounds transcript.

## Output structure
1. Per-element verdict lines (format above)
2. "## Conclusion" section that starts with a line beginning "Debate Status:" carrying the status value /codex-brainstorm's report defines, then says where the two positions ended
3. Raw rounds transcript (optional; helps coverage check)
`;
}

const VERDICT_LINE_RE = /^[ \t]*(?:[-*+]\s+|\d+\.\s+)?\[VERDICT:\s*(Keep|Review|Cut)\]\s*([A-Za-z0-9_:.\-]+)\s*[—\-]\s*([^\r\n]*?)(?:\s*[—\-]\s*Evidence:\s*([^\r\n]+?))?\s*$/gm;

function classifyEvidenceLocation(raw) {
  const s = raw.trim();
  const fileLineMatch = s.match(/^([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/);
  if (fileLineMatch) {
    return { type: 'file:line', location: `${fileLineMatch[1]}:${fileLineMatch[2]}${fileLineMatch[3] ? `-${fileLineMatch[3]}` : ''}` };
  }
  const docMatch = s.match(/^(?:doc:|§)(.+?)(?:\s*\[REASONING-ONLY\])?$/i);
  if (docMatch) {
    return { type: 'doc:section', location: docMatch[1].trim() };
  }
  return { type: 'raw', location: s };
}

// Did the debate report END IN AGREEMENT? Mentioning an equilibrium is not reaching one, and a
// debate that went quiet with the sides still apart is reported as diverged
// (skills/codex-brainstorm/references/equilibrium.md § Debate Status). Fail-closed: anything that
// is not an affirmative statement reads as false.
//   1. A "Debate Status" field decides. The report states its final status in the Conclusion
//      and in the summary table; every status field found
//      in those two places must read as agreement, so any Diverged among them wins. Status
//      fields elsewhere — loose lines, or tables inside the transcript — are per-round states:
//      ignored when a final one exists, otherwise the last one is the final state. Only a
//      field's LEADING value counts.
//   2. Reports with no status field (legacy) are read from the Conclusion when there is one,
//      else from the whole report, under a CLOSED contract — § legacyAgrees below.
// A status FIELD starts its line (list marker, quote or emphasis allowed) or is a table's label
// cell. The same words inside a sentence are narrative, not a field.
const STATUS_FIELD_RE = /^[ \t>]*(?:[-*+][ \t]+|\d+\.[ \t]+)?(\|[ \t]*)?[*_`]*debate[ \t]+status[*_`]*[ \t]*[:|][ \t]*([^\n|]*)/gim;
// A per-round record line, for a report with no final status: the field itself, or
// "Round 1 — Debate Status: …".
const ROUND_STATUS_RE = /^[ \t>]*(?:[-*+][ \t]+|\d+\.[ \t]+)?(?:\|[ \t]*)?(?:[*_`]*round[ \t]+\d+[*_`]*[ \t]*[—–:-]+[ \t]*)?[*_`]*debate[ \t]+status[*_`]*[ \t]*[:|][ \t]*([^\n|]*)/gim;
const LEGACY_TYPE_RE = /^(.*?)equilibrium[ \t]+type\**[ \t]*[:|][ \t]*\**[ \t]*([^\n|]*)/gim;
// Heading of a per-round record: "## Round 1", "### Rounds transcript", "## Debate Record". Rank 1
// is the report's own title, never a round.
const TRANSCRIPT_TITLE_RE = /^(?:rounds?\b|debate[ \t]+record\b|.*\btranscript\b)/i;
const HEADING_RE = /^(#{1,6})[ \t]+([^\n]*)$/gm;
// A conclusion heading is the whole heading line: "## Conclusion", "## 結論", "## Final",
// "## Final Verdict" — not a title that merely starts with the word ("## Final Report").
const CONCLUSION_TITLE_RE = /^(?:Conclusion|結論|Final(?:[ \t]+(?:Conclusion|Verdict|Stance))?)[ \t]*:?[ \t]*$/i;
// A closed list of qualifiers that say the debate went quiet. They contain "no" without denying
// anything, so they are removed before negation is read; alone they state nothing.
const QUIET_QUALIFIER_RE = /\b(?:with|after|and)?[ \t]*no[ \t]+(?:new|remaining|further|more|outstanding|unresolved|open)[ \t]+(?:objections?|attacks?|arguments?|disagreements?)\b[ \t]*,?/gi;
const NEGATION_RE = /(?:\b(?:no|not|never|neither|nor|none|without|cannot|unable|fail(?:s|ed|ing)?|unless|until|if|whether|must|should|required?)\b|n['’]t\b)/i;
// The two canonical ways an older report stated agreement, at the start of a sentence.
const CANONICAL_RES = [
  /^(?:nash[ \t]+)?equilibrium[ \t]+(?:(?:was|is|has[ \t]+been)[ \t]+)?reached\b/i,
  /^(?:both[ \t]+(?:sides|participants|parties)[ \t]+)?reached[ \t]+(?:an?[ \t]+|the[ \t]+)?(?:nash[ \t]+)?equilibrium\b/i,
];

function headingSections(text) {
  const heads = [...text.matchAll(HEADING_RE)].map(m => ({ index: m.index, rank: m[1].length, title: m[2], bodyStart: m.index + m[0].length }));
  return heads.map((h, i) => ({ ...h, end: (heads.slice(i + 1).find(n => n.rank <= h.rank) || { index: text.length }).index }));
}

// The report without its per-round record: every transcript subtree, at whatever depth it is
// nested, is blanked in place. What is left is where the report states its FINAL state.
function withoutTranscript(raw) {
  let out = raw;
  for (const h of headingSections(raw)) {
    if (h.rank >= 2 && TRANSCRIPT_TITLE_RE.test(h.title)) {
      out = out.slice(0, h.index) + out.slice(h.index, h.end).replace(/[^\n]/g, ' ') + out.slice(h.end);
    }
  }
  return out;
}

// The report's own conclusion sections, in order. A section keeps its nested subsections and
// thematic breaks: it ends at the next heading of equal or higher rank, or the end.
function conclusionSections(finalText) {
  return headingSections(finalText)
    .filter(h => h.rank >= 2 && CONCLUSION_TITLE_RE.test(h.title))
    .map(h => ({ index: h.index, end: h.end, body: finalText.slice(h.bodyStart, h.end) }));
}

// The leading status value, with list markers and emphasis stripped. What follows the status is
// explanation ("… converged on X after the sides diverged in round 1") and is not read — except
// that an unfilled template row listing the alternatives ("… / Diverged") is not a status.
function statusValueAgrees(value) {
  const v = value.replace(/^[\s*_`"'>-]+/, '');
  if (!/^equilibrium\s+reached\b/i.test(v)) return false;
  return !/\/\s*(?:equilibrium\s+reached|diverged)\b/i.test(v);
}

// Legacy reports (no status field). This does NOT try to understand prose. The contract is
// closed, and every doubt is a "no":
//   - every "Equilibrium Type" field in scope is read: None is a denial, a single named type a
//     statement;
//   - the quiet-debate qualifiers (QUIET_QUALIFIER_RE) are dropped, then a sentence is a
//     statement only in the canonical form: it BEGINS "Equilibrium reached…" / "Nash equilibrium
//     reached…" / "[Both sides] reached [Nash] equilibrium…", is not a question, and contains
//     no negation word;
//   - any other sentence that mentions an equilibrium and contains a negation word is a denial;
//   - agreement = at least one statement and no denial, in the scope read.
// A report that needs to say more than the canonical sentence should carry the status field.
function legacyPolarity(text) {
  let stated = false;
  for (const m of text.matchAll(LEGACY_TYPE_RE)) {
    const value = m[2].trim();
    if (/^(?:none|no\b)/i.test(value)) return 'denied';
    if (!value.includes('/') && /\b(?:pure|conditional|mixed|pareto)\b/i.test(value)) stated = true;
  }
  for (const raw of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (!/equilibrium/i.test(raw) || /equilibrium[ \t]+type\b/i.test(raw)) continue;
    const sentence = raw.replace(QUIET_QUALIFIER_RE, ' ').replace(/^[\s*_`"'>#|,-]+/, '').trim();
    const negated = NEGATION_RE.test(sentence) || /\?\s*$/.test(sentence)
      || /\bequilibrium\b[^.!?\n]{0,40}?[:=—-]\s*(?:no|false|none)\b/i.test(sentence);
    if (negated) return 'denied';
    if (CANONICAL_RES.some(re => re.test(sentence))) stated = true;
  }
  return stated ? 'stated' : 'silent';
}

function detectAgreement(report) {
  const raw = report.replace(/\r\n?/g, '\n');
  const finalText = withoutTranscript(raw);
  const conclusions = conclusionSections(finalText);
  const inConclusion = m => conclusions.some(c => m.index >= c.index && m.index < c.end);

  // Conclusion and summary table state the final status; if they disagree, or either
  // contradicts itself, the report is not an agreement. Everything else is a per-round state.
  const finals = [...finalText.matchAll(STATUS_FIELD_RE)].filter(m => inConclusion(m) || m[1]);
  if (finals.length) return finals.every(m => statusValueAgrees(m[2]));

  // The old template put "Equilibrium Type" in the summary table, so it counts beside the Conclusion.
  const summaryTypes = [...finalText.matchAll(LEGACY_TYPE_RE)]
    .filter(m => /^\s*\|/.test(m[1]) && !inConclusion(m)).map(m => m[0]);
  const legacy = legacyPolarity(conclusions.length
    ? [...summaryTypes, ...conclusions.map(c => c.body)].join('\n')
    : raw);

  // No final status anywhere: the last status line is the final state — unless the conclusion
  // denies agreement in prose.
  const loose = [...raw.matchAll(ROUND_STATUS_RE)].at(-1);
  if (loose) return statusValueAgrees(loose[1]) && !(conclusions.length && legacy === 'denied');
  return legacy === 'stated';
}

function parseDebateResponse(raw) {
  const threadIdMatch = raw.match(/threadId['":\s]+([0-9a-f-]{20,})/i)
    || raw.match(/thread[_ ]?id['":\s]+([0-9a-f-]{20,})/i);
  const threadId = threadIdMatch ? threadIdMatch[1] : '';

  const roundsMatch = raw.match(/(\d+)\s+rounds?/i) || raw.match(/rounds?['":\s]+(\d+)/i);
  const rounds = roundsMatch ? parseInt(roundsMatch[1], 10) : 0;

  const equilibriumReached = detectAgreement(raw);

  const section = conclusionSections(withoutTranscript(raw.replace(/\r\n?/g, '\n'))).at(-1);
  const conclusion = section ? section.body.trim() : raw.slice(-2000).trim();

  const perElementVerdicts = [];
  const evidenceTailRanges = [];
  const verdictRe = new RegExp(VERDICT_LINE_RE.source, VERDICT_LINE_RE.flags);
  let vm;
  while ((vm = verdictRe.exec(raw)) !== null) {
    const evidenceRaw = (vm[4] || '').trim();
    const evidenceCitation = evidenceRaw ? { ...classifyEvidenceLocation(evidenceRaw), elementId: vm[2].trim() } : null;
    perElementVerdicts.push({
      classification: vm[1],
      id: vm[2].trim(),
      rationale: (vm[3] || '').trim(),
      evidence: evidenceRaw || null,
      evidenceCitation,
    });
    if (evidenceRaw) {
      const tailOffset = vm[0].lastIndexOf('Evidence:');
      if (tailOffset >= 0) {
        evidenceTailRanges.push([vm.index + tailOffset, vm.index + vm[0].length]);
      }
    }
  }

  const isInEvidenceTail = (idx) => evidenceTailRanges.some(([s, e]) => idx >= s && idx < e);

  const evidenceCitations = [];
  const seenCitations = new Set();
  const pushCitation = (cit) => {
    const key = `${cit.type}|${cit.location}|${cit.elementId || ''}`;
    if (seenCitations.has(key)) return;
    seenCitations.add(key);
    evidenceCitations.push(cit);
  };
  for (const v of perElementVerdicts) {
    if (v.evidenceCitation) pushCitation(v.evidenceCitation);
  }
  const fileLineRe = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?/g;
  const docSectionRe = /(?:doc:|§)([A-Za-z0-9.\-/_§]+)(?:\s*\[REASONING-ONLY\])?/gi;
  let m;
  while ((m = fileLineRe.exec(raw)) !== null) {
    if (isInEvidenceTail(m.index)) continue;
    pushCitation({ type: 'file:line', location: `${m[1]}:${m[2]}${m[3] ? `-${m[3]}` : ''}` });
  }
  while ((m = docSectionRe.exec(raw)) !== null) {
    if (isInEvidenceTail(m.index)) continue;
    pushCitation({ type: 'doc:section', location: m[1].trim() });
  }

  return { threadId, rounds, equilibriumReached, conclusion, evidenceCitations, roundsText: raw, perElementVerdicts };
}

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function main() {
  const sub = process.argv[2];
  if (sub === 'build') {
    const preflightFile = argVal('--preflight');
    const outputFile = argVal('--output');
    if (!preflightFile || !outputFile) {
      process.stderr.write('Usage: debate-topic.js build --preflight <file> --output <file>\n');
      process.exit(1);
    }
    const pf = JSON.parse(fs.readFileSync(preflightFile, 'utf8'));
    fs.writeFileSync(outputFile, buildTopic(pf));
    process.exit(0);
  } else if (sub === 'parse') {
    const inputFile = argVal('--input');
    const outputFile = argVal('--output');
    if (!inputFile || !outputFile) {
      process.stderr.write('Usage: debate-topic.js parse --input <file> --output <file>\n');
      process.exit(1);
    }
    const raw = fs.readFileSync(inputFile, 'utf8');
    fs.writeFileSync(outputFile, JSON.stringify(parseDebateResponse(raw), null, 2));
    process.exit(0);
  } else {
    process.stderr.write('Usage: debate-topic.js <build|parse> ...\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { buildTopic, parseDebateResponse, detectAgreement, classifyEvidenceLocation, DIM_NAMES, VERDICT_LINE_RE };
