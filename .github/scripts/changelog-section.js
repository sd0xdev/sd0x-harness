#!/usr/bin/env node
'use strict';

// Prints one version's section of CHANGELOG.md — from its `## <version>` or `## Historical:
// <version>` heading (a leading `v` is dropped) to the line before the next `## ` heading — so the release workflow can append that
// version's migration guide to the generated release notes. A version with no section prints
// nothing and exits 0: most releases carry no migration guide.
//
//   node .github/scripts/changelog-section.js <version> [changelog-path]

const fs = require('fs');
const path = require('path');

/** The section text for `version`, ending in one newline, or '' when there is none. */
function section(changelog, version) {
  const v = String(version).replace(/^v/, '');
  const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The version must end at a non-version character, so 5.0.0 matches neither 5.0.0-rc.1, 5.0.01
  // nor the build-metadata form 5.0.0+meta.
  const heading = new RegExp(`^## (?:Historical: )?${escaped}(?![\\w.+-])`);
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return '';
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end === -1) end = lines.length;
  return `${lines.slice(start, end).join('\n').trimEnd()}\n`;
}

if (require.main === module) {
  const [version, file = path.join(__dirname, '..', '..', 'CHANGELOG.md')] = process.argv.slice(2);
  if (!version) {
    process.stderr.write('usage: changelog-section.js <version> [changelog-path]\n');
    process.exit(2);
  }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    process.stderr.write(`changelog-section: cannot read ${file}: ${e.message}\n`);
    process.exit(1);
  }
  process.stdout.write(section(text, version));
}

module.exports = { section };
