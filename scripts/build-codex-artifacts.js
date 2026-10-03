#!/usr/bin/env node
/**
 * build-codex-artifacts.js
 * Generates AGENTS.md kernel from template + host project context.
 * Reads the kernel template, detects host context (package.json, CLAUDE.md),
 * replaces placeholders, embeds the canonical Anchor blocks verbatim from the plugin's
 * rules/ (claude-code-2-1-288-compat tech spec § 3.2), and outputs the result.
 *
 * Usage:
 *   node scripts/build-codex-artifacts.js [--project-dir <dir>] [--output <file>] [--template-path <file>] [--rules-dir <dir>]
 *   Default: project-dir=cwd, output=stdout, template-path=auto-detected, rules-dir=the plugin's rules/
 */

const fs = require('node:fs');
const path = require('node:path');

const BYTE_LIMIT = 24576; // 24 KiB hard cap

function parseArgs(argv) {
  const args = { projectDir: process.cwd(), output: null, templatePath: null, rulesDir: null };
  const knownFlags = new Set(['--project-dir', '--output', '--template-path', '--rules-dir']);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--') && !knownFlags.has(k)) {
      process.stderr.write(`Error: unknown flag ${k}\nUsage: node build-codex-artifacts.js [--project-dir <dir>] [--output <file>] [--template-path <file>] [--rules-dir <dir>]\n`);
      process.exit(1);
    }
    if (knownFlags.has(k)) {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) {
        process.stderr.write(`Error: ${k} requires a value\n`);
        process.exit(1);
      }
      if (k === '--project-dir') { args.projectDir = path.resolve(v); }
      if (k === '--output') { args.output = path.resolve(v); }
      if (k === '--template-path') { args.templatePath = path.resolve(v); }
      if (k === '--rules-dir') { args.rulesDir = path.resolve(v); }
      i++;
    }
  }
  return args;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function detectProjectName(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  const pkg = readText(pkgPath);
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      if (parsed.name) return parsed.name;
    } catch { /* ignore parse errors */ }
  }
  return path.basename(projectDir);
}

function detectTestCommand(projectDir) {
  // Priority 1: package.json scripts.test
  const pkgPath = path.join(projectDir, 'package.json');
  const pkg = readText(pkgPath);
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      if (parsed.scripts && parsed.scripts.test) {
        return parsed.scripts.test;
      }
    } catch { /* ignore */ }
  }

  // Priority 2: CLAUDE.md test command pattern
  const claudePaths = [
    path.join(projectDir, '.claude', 'CLAUDE.md'),
    path.join(projectDir, 'CLAUDE.md'),
  ];
  for (const cp of claudePaths) {
    const content = readText(cp);
    if (content) {
      const match = content.match(/\*\*Test command\*\*\s*--\s*`([^`]+)`/);
      if (match) return match[1];
    }
  }

  return 'npm test';
}

function detectPluginVersion() {
  // Look for plugin.json relative to this script
  const scriptDir = __dirname;
  const pluginPaths = [
    path.join(scriptDir, '..', '.claude-plugin', 'plugin.json'),
    path.join(scriptDir, '..', 'plugin.json'),
  ];
  for (const pp of pluginPaths) {
    const content = readText(pp);
    if (content) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.version) return parsed.version;
      } catch { /* ignore */ }
    }
  }
  return '0.0.0';
}

function findKernelTemplate() {
  const scriptDir = __dirname;
  const candidates = [
    path.join(scriptDir, '..', 'skills', 'codex-setup', 'references', 'agents-kernel.md'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Canonical Anchor blocks, copied byte-for-byte from the plugin's own rules/ at generation time.
// A paraphrase of an Anchor is still Anchor, so the kernel never restates one in its own words;
// a source that cannot be bound to exactly one region fails generation instead of falling back to
// handwritten text. Boundaries and rationale: docs/features/claude-code-2-1-288-compat/2-tech-spec.md § 3.2.
const ANCHORS_PLACEHOLDER = '{ANCHORS}';

class CanonicalBlockError extends Error {}

function stripTrailingNewlines(s) {
  return s.replace(/\n+$/, '');
}

function stripFrontmatter(text) {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---\n', 4);
  return end === -1 ? text : text.slice(end + 5);
}

function soleIndex(lines, pred, id, what) {
  const hits = [];
  lines.forEach((l, i) => { if (pred(l)) hits.push(i); });
  if (hits.length !== 1) {
    throw new CanonicalBlockError(`canonical block ${id}: expected exactly one ${what}, found ${hits.length}`);
  }
  return hits[0];
}

function readSource(rulesDir, file, id) {
  const text = readText(path.join(rulesDir, file));
  if (text === null) throw new CanonicalBlockError(`canonical block ${id}: could not read rules/${file}`);
  return text.replace(/\r\n/g, '\n');
}

const BLOCKS = [
  {
    id: 'anchor-register', file: 'discretion.md', cite: '`rules/discretion.md` § Anchor Register',
    extract(text, id) {
      const lines = text.split('\n');
      const start = soleIndex(lines, (l) => l.startsWith('## Anchor Register'), id, '"## Anchor Register" heading');
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) if (lines[i].startsWith('## ')) { end = i; break; }
      return stripTrailingNewlines(lines.slice(start, end).join('\n'));
    },
  },
  {
    id: 'register-4', file: 'git-workflow.md', cite: '`rules/git-workflow.md` — Anchor Register #4 block',
    extract(text, id) {
      const lines = text.split('\n');
      const begin = soleIndex(lines, (l) => l.trim() === '<!-- anchor:register-4:begin -->', id, 'begin marker');
      const end = soleIndex(lines, (l) => l.trim() === '<!-- anchor:register-4:end -->', id, 'end marker');
      if (end <= begin + 1) throw new CanonicalBlockError(`canonical block ${id}: markers out of order or empty`);
      return lines.slice(begin + 1, end).join('\n');
    },
  },
  {
    id: 'security', file: 'security.md', cite: '`rules/security.md` (whole file)',
    extract(text) {
      return stripTrailingNewlines(stripFrontmatter(text));
    },
  },
  {
    id: 'never-log', file: 'logging.md', cite: '`rules/logging.md` — never-log list',
    extract(text, id) {
      const lines = text.split('\n');
      return lines[soleIndex(lines, (l) => l.startsWith('Never log:'), id, '"Never log:" line')];
    },
  },
  {
    id: 'redaction', file: 'self-improvement.md', cite: '`rules/self-improvement.md` § Redaction',
    extract(text, id) {
      const lines = text.split('\n');
      return lines[soleIndex(lines, (l) => l.startsWith('Keep dates,'), id, '"Keep dates," line')];
    },
  },
];

function findRulesDir() {
  return path.join(__dirname, '..', 'rules');
}

function extractCanonicalBlocks(rulesDir) {
  return BLOCKS.map((b) => ({ id: b.id, cite: b.cite, text: b.extract(readSource(rulesDir, b.file, b.id), b.id) }));
}

function renderAnchorsSection(blocks) {
  const parts = [
    '## Anchors (verbatim from sd0x-dev-flow rules)',
    '',
    'Copied byte-for-byte from the sd0x-dev-flow plugin\'s `rules/` when this file was generated — never edit them here; regenerate with `/codex-setup sync`.',
  ];
  for (const b of blocks) parts.push('', `Source: ${b.cite}`, '', b.text);
  return parts.join('\n');
}

// Placeholder substitution runs on the template's own text only; the Anchors section is inserted
// afterwards, so no {PROJECT_NAME}/{VERSION}/{TEST_COMMAND} inside a canonical block is ever rewritten.
function assemble(template, subs, anchorsSection) {
  const substitute = (s) => s
    .replace(/\{PROJECT_NAME\}/g, () => subs.projectName)
    .replace(/\{VERSION\}/g, () => subs.version)
    .replace(/\{TEST_COMMAND\}/g, () => subs.testCommand);
  const parts = template.split(ANCHORS_PLACEHOLDER);
  if (parts.length > 2) throw new CanonicalBlockError(`template carries ${ANCHORS_PLACEHOLDER} more than once`);
  if (parts.length === 1) return `${stripTrailingNewlines(substitute(template))}\n\n${anchorsSection}\n`;
  return `${substitute(parts[0])}${anchorsSection}${substitute(parts[1])}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  // Find and read kernel template
  const templatePath = args.templatePath || findKernelTemplate();
  if (!templatePath) {
    process.stderr.write('Error: kernel template not found at skills/codex-setup/references/agents-kernel.md\n');
    process.exit(1);
  }

  const template = readText(templatePath);
  if (!template) {
    process.stderr.write(`Error: could not read kernel template: ${templatePath}\n`);
    process.exit(1);
  }

  // Detect host context
  const projectName = detectProjectName(args.projectDir);
  const testCommand = detectTestCommand(args.projectDir);
  const version = detectPluginVersion();

  // Canonical Anchor blocks, then placeholders outside them
  let output;
  try {
    const blocks = extractCanonicalBlocks(args.rulesDir || findRulesDir());
    output = assemble(template, { projectName, version, testCommand }, renderAnchorsSection(blocks));
  } catch (err) {
    if (!(err instanceof CanonicalBlockError)) throw err;
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  // Byte budget check
  const byteSize = Buffer.byteLength(output, 'utf8');
  if (byteSize > BYTE_LIMIT) {
    process.stderr.write(
      `Error: output size ${byteSize} bytes exceeds ${BYTE_LIMIT} byte limit\n`
    );
    process.exit(1);
  }

  // Output
  if (args.output) {
    const dir = path.dirname(args.output);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(args.output, output, 'utf8');
    process.stdout.write(`Written ${byteSize} bytes to ${args.output}\n`);
  } else {
    process.stdout.write(output);
  }
}

if (require.main === module) main();

module.exports = { extractCanonicalBlocks, renderAnchorsSection, assemble, CanonicalBlockError, BYTE_LIMIT };
