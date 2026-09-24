#!/usr/bin/env node
'use strict';

// Reproduces Claude Code's launch accounting of always-loaded instruction files (measured on
// 2.1.281): which files count, how imports are followed, and which files are left out of the sum.
// Contract: docs/features/instruction-budget/2-tech-spec.md § 3.3.

const fs = require('fs');
const os = require('os');
const path = require('path');

// One model-dependent input, as in 2.1.281: the per-file limit (max(40000, window × 0.05 × k));
// the total limit is derived from it the same way the binary does, max(120000, per-file).
const FLOOR = 120000;
const DEFAULT_PER_FILE = 150000; // the value observed in the reported session
const MAX_DEPTH = 5;
const LESSONS_RE = /(?:^|[-_.])(?:lessons?|archive|log|history)(?:[-_.]|$)/i;

function parseArgs(argv) {
  const o = { root: process.cwd(), home: os.homedir(), perFile: DEFAULT_PER_FILE, format: 'md', pluginRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--root') o.root = val();
    else if (a === '--home') o.home = val();
    else if (a === '--per-file') o.perFile = Number(val());
    else if (a === '--plugin-root') o.pluginRoot = val();
    else if (a.startsWith('--format=')) o.format = a.slice(9);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!['md', 'json'].includes(o.format)) throw new Error(`unknown format ${o.format}`);
  if (!(o.perFile > 0)) throw new Error('--per-file must be a positive number');
  o.limit = Math.max(FLOOR, o.perFile);
  return o;
}

function readText(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function realOrSelf(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

// `paths:` frontmatter: a list (block or flow form) or a single string. Scoped unless every entry
// is `**` (which Claude Code treats as unconditional).
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  return m ? { body: text.slice(m[0].length), yaml: m[1] } : { body: text, yaml: null };
}
function isPathScoped(text) {
  const { yaml } = frontmatter(text);
  if (!yaml) return false;
  const lines = yaml.split(/\r?\n/);
  const i = lines.findIndex((l) => /^paths\s*:/.test(l));
  if (i === -1) return false;
  const inline = lines[i].replace(/^paths\s*:\s*/, '').trim();
  let entries = [];
  if (inline.startsWith('[')) entries = inline.replace(/^\[|\]$/g, '').split(',');
  else if (inline) entries = [inline];
  else for (let k = i + 1; k < lines.length && /^\s*-\s/.test(lines[k]); k++) entries.push(lines[k].replace(/^\s*-\s*/, ''));
  entries = entries.map((e) => e.trim().replace(/^['"]|['"]$/g, '')).map((e) => (e.endsWith('/**') ? e.slice(0, -3) : e)).filter(Boolean);
  if (entries.length === 0) return false;
  return !entries.every((e) => e === '**');
}

// `@path` imports outside fenced code: `@./x.md`, `@rules/x.md`, `@~/x.md`, `@/abs.md`.
function imports(text) {
  const out = [];
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const noCode = line.replace(/`[^`]*`/g, '');
    for (const m of noCode.matchAll(/(?:^|\s)@((?:~\/|\.{0,2}\/)?[A-Za-z0-9._\/-]+\.[A-Za-z0-9]+)/g)) out.push(m[1]);
  }
  return out;
}

function listMd(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMd(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function measure(opts) {
  const root = path.resolve(opts.root);
  const home = path.resolve(opts.home);
  const seen = new Set();
  const files = [];
  const scoped = [];
  // Breadth-first over the import graph, so every file is first reached by its shortest route:
  // a file seen at depth 5 through a long chain is not then skipped when CLAUDE.md imports it
  // directly, and its own imports are followed from the shallow depth.
  const queue = [];
  const add = (file, origin, depth = 0) => queue.push({ file, origin, depth });
  const drain = () => {
    while (queue.length) {
      queue.sort((a, b) => a.depth - b.depth);
      const { file, origin, depth } = queue.shift();
      const real = realOrSelf(file);
      if (seen.has(real)) continue;
      const text = readText(file);
      if (text === null) continue;
      seen.add(real);
      files.push({ path: file, chars: text.length, origin });
      if (depth >= MAX_DEPTH) continue;
      for (const imp of imports(frontmatter(text).body)) {
        const target = imp.startsWith('~/') ? path.join(home, imp.slice(2)) : path.resolve(path.dirname(file), imp);
        queue.push({ file: target, origin: 'import', depth: depth + 1 });
      }
    }
  };
  const addRule = (file, origin) => {
    const text = readText(file);
    if (text === null) return;
    if (isPathScoped(text)) { scoped.push(file); return; }
    add(file, origin);
  };
  add(path.join(home, '.claude', 'CLAUDE.md'), 'user');
  for (const f of listMd(path.join(home, '.claude', 'rules'))) addRule(f, 'user-rule');
  for (const f of ['CLAUDE.md', path.join('.claude', 'CLAUDE.md'), 'CLAUDE.local.md']) add(path.join(root, f), 'project');
  for (const f of listMd(path.join(root, '.claude', 'rules'))) addRule(f, 'project-rule');
  drain();

  const overLimit = files.filter((f) => f.chars > opts.perFile);
  const counted = files.filter((f) => f.chars <= opts.perFile);
  const total = counted.reduce((n, f) => n + f.chars, 0);
  // The plugin's share, by provenance: a counted rule under .claude/rules/ is the plugin's when the
  // install manifest (.sd0x/install-state.json `rules`) lists it, when its content equals the
  // plugin's copy, or when it is a plugin-shipped override template; plus the shipped CLAUDE
  // template, estimated at its source size (the installed .claude/CLAUDE.md is that template with
  // placeholders filled in). Without --plugin-root there is no provenance and the share is null.
  let pluginShare = null;
  if (opts.pluginRoot) {
    const pr = path.resolve(opts.pluginRoot);
    let manifest = new Set();
    try { manifest = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, '.sd0x', 'install-state.json'), 'utf8')).rules || {})); } catch { /* no manifest */ }
    const shipped = new Set((() => { try { return fs.readdirSync(path.join(pr, 'rules')); } catch { return []; } })());
    const rulesDir = path.join(root, '.claude', 'rules') + path.sep;
    pluginShare = counted.filter((f) => {
      if (!f.path.startsWith(rulesDir)) return false;
      const name = path.basename(f.path);
      if (!shipped.has(name)) return false;
      if (manifest.has(name) || name.endsWith('-project.md')) return true;
      return readText(f.path) === readText(path.join(pr, 'rules', name));
    }).reduce((n, f) => n + f.chars, 0);
    const claudeMd = counted.find((f) => f.path === path.join(root, '.claude', 'CLAUDE.md'));
    const template = readText(path.join(pr, 'CLAUDE.template.md'));
    if (claudeMd && template !== null) pluginShare += Math.min(claudeMd.chars, template.length);
  }
  const lessons = listMd(path.join(root, '.claude', 'rules'))
    .filter((f) => LESSONS_RE.test(path.basename(f, '.md')))
    .map((f) => ({ path: path.relative(root, f), fix: 'move it out of .claude/rules/ (the lessons log lives at .claude/sd0x-dev-flow-lessons.md), or give it paths: frontmatter' }));
  const rel = (p) => (p.startsWith(root) ? path.relative(root, p) : p.startsWith(home) ? `~/${path.relative(home, p)}` : p);
  return {
    version_note: 'accounting reproduced from Claude Code 2.1.281; both limits are model-dependent estimates',
    total,
    limit: opts.limit,
    per_file: opts.perFile,
    floor: FLOOR,
    over: total > opts.limit,
    files: counted.length,
    largest: [...counted].sort((a, b) => b.chars - a.chars).slice(0, 3).map((f) => ({ path: rel(f.path), chars: f.chars })),
    over_per_file: overLimit.map((f) => ({ path: rel(f.path), chars: f.chars })),
    path_scoped: scoped.map(rel),
    plugin_share: pluginShare,
    lessons_in_rules: lessons,
  };
}

function render(r) {
  const lines = [`Instruction budget: ${r.total.toLocaleString('en-US')} / ${r.limit.toLocaleString('en-US')} chars across ${r.files} always-loaded files (${r.version_note}; total = max(${r.floor.toLocaleString('en-US')}, per-file ${r.per_file.toLocaleString('en-US')}))`];
  if (r.over) lines.push('⚠️ over the total limit — Claude Code warns at launch');
  lines.push(r.plugin_share === null ? 'Plugin share: unknown (pass --plugin-root)' : `Plugin share: ${r.plugin_share.toLocaleString('en-US')} chars (the CLAUDE template part is estimated)`);
  for (const f of r.largest) lines.push(`  largest: ${f.path} (${f.chars.toLocaleString('en-US')})`);
  for (const f of r.over_per_file) lines.push(`⚠️ ${f.path} is over the per-file limit (${f.chars.toLocaleString('en-US')}) — warned on its own, left out of the total`);
  for (const f of r.lessons_in_rules) lines.push(`⚠️ ${f.path}: a lessons/archive/log file in rules/ loads every session — ${f.fix}`);
  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const r = measure(opts);
    process.stdout.write(opts.format === 'json' ? `${JSON.stringify(r)}\n` : render(r));
  } catch (e) {
    process.stderr.write(`instruction-budget: ${e.message}\n`);
    process.exit(2);
  }
}

module.exports = { measure, isPathScoped, imports, parseArgs };
