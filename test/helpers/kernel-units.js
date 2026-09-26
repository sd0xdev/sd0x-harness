'use strict';

// Resident-kernel units for the digest pins in test/rules/kernel-digests.test.js (rules-residency
// tech spec § 3.6). A unit is the preamble or one `##` section of a resident file. Headings are
// found in the LIVE text, so a `## ` inside a fence or an HTML comment cannot split a unit, but
// each unit is hashed over its RAW bytes: an edit hidden in a fence or a comment still moves the
// digest, which is the failure a claim-keyed pin over live text missed.
const { createHash } = require('node:crypto');
const { atxHeadingName, liveText, toLines } = require('./markdown-structure');

/** `[{ name, text }]` — '(preamble)' first, then each live `##` section in document order. */
function kernelUnits(doc) {
  const raw = toLines(doc);
  const live = toLines(liveText(doc));
  const units = [{ name: '(preamble)', lines: [] }];
  raw.forEach((line, i) => {
    const name = atxHeadingName(live[i] || '', 2);
    if (name) units.push({ name, lines: [line] });
    else units[units.length - 1].lines.push(line);
  });
  return units.map(({ name, lines }) => ({ name, text: lines.join('\n') }));
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** `{ unitName: sha256 }` for a document, optionally limited to the named units. Two live sections
 *  with one name are refused: keyed by name, the second would overwrite the first, and a planted
 *  duplicate heading would carry resident text no pin covers. */
function unitDigests(doc, only = null) {
  const units = kernelUnits(doc);
  const seen = new Set();
  for (const { name } of units) {
    if (seen.has(name)) throw new Error(`duplicate kernel unit "${name}" — each live section name must occur once`);
    seen.add(name);
  }
  const out = {};
  for (const { name, text } of units) if (!only || only.includes(name)) out[name] = sha256(text);
  return out;
}

module.exports = { kernelUnits, unitDigests, sha256 };
