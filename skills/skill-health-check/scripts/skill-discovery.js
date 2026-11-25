#!/usr/bin/env node
'use strict';

// On-demand observation of skill discovery: installed / listed / described / selected / explicit, kept
// apart. Reads this plugin's own skills and same-named copies only; no model call, no network, no write.
// Design: docs/features/skill-discoverability/2-tech-spec.md.

const fs = require('fs');
const path = require('path');

const PHRASES = path.join(__dirname, '..', 'references', 'discovery-phrases.json');
const METHODS = { doctor: 'host /doctor', context: 'host /context', 'self-report': 'the model\'s own account (self-report)' };
const INSTALLS = ['ordinary', 'checkout', 'unknown'];
const REACHED = ['explicit', 'described', 'unknown'];

function die(msg) {
  process.stderr.write(`skill-discovery: ${msg}\n`);
  process.exit(2);
}

function parse(argv, allowed) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !allowed.includes(k)) die(`unknown argument "${argv[i]}"`);
    if (argv[i + 1] === undefined) die(`--${k} needs a value`);
    o[k] = argv[++i];
  }
  return o;
}

const frontmatter = (text) => (/^---\r?\n([\s\S]*?)\r?\n---/.exec(text) || [, ''])[1];
const unquote = (s) => s.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');

function installed(pluginRoot) {
  const dir = path.join(pluginRoot, 'skills');
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, 'SKILL.md'))).sort();
  } catch {
    return null;
  }
  return names.map((name) => {
    const fm = frontmatter(fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8'));
    const d = /^description:\s*(.*)$/m.exec(fm);
    return { name, described: Boolean(d && unquote(d[1])), chars: d ? unquote(d[1]).length : 0, modelMay: !/^disable-model-invocation:\s*true\s*$/m.test(fm) };
  });
}

// Copies of this plugin's own skill names in one folder. Other names are never looked at.
function copies(folder, skills, pluginRoot) {
  const out = { link: [], same: [], different: [], notChecked: 0 };
  for (const { name } of skills) {
    const at = path.join(folder, name, 'SKILL.md');
    const own = path.join(pluginRoot, 'skills', name, 'SKILL.md');
    try {
      const real = fs.realpathSync(at);
      if (real === fs.realpathSync(own)) out.link.push(name);
      else out[fs.readFileSync(real).equals(fs.readFileSync(own)) ? 'same' : 'different'].push(name);
    } catch (e) {
      if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') out.notChecked++;
    }
  }
  return out;
}

// The host's project root, else the repository the command runs in: a subdirectory is not a project.
function projectRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, '.git'))) {
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
  return dir;
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

function count(o, key) {
  if (o[key] === undefined) return null;
  if (!/^\d{1,4}$/.test(o[key])) die(`--${key} needs a whole number`);
  return Number(o[key]);
}

// The requirements' § 8 step-1 rows, in order. Only what was given decides; a gap stays unknown.
function verdict(f) {
  if (f.checkout) return 'This is a source checkout, not an ordinary install: no verdict about discovery.';
  if (f.install === 'unknown') return 'How this plugin was installed is not known: no verdict about an ordinary install.';
  if (f.listed === null || f.described === null) return 'Listing not observed: nothing is concluded.';
  if (f.inconsistent) return `The numbers disagree (${f.inconsistent}): nothing is concluded.`;
  if (f.described === f.listed) return 'Every listed entry is described: the truncation line stops here. Selection stays unknown.';
  if (!f.nameOnly.length) return 'Some entries are name-only, but not which: the impact on finding a skill by describing a task is unknown. The observation may end here.';
  const how = f.nameOnly.map((n) => f.reached[n] || 'unknown');
  if (how.includes('described')) return 'At least one name-only skill is reached by describing a task: a comparison could be worth asking for. It costs model runs, so it needs your consent.';
  if (how.every((h) => h === 'explicit')) return 'Every name-only skill is reached only explicitly or by a gate: nothing to fix.';
  return 'Task-based use of the name-only skills is unknown: the impact stays unknown. The observation may end here.';
}

function observe(argv) {
  const o = parse(argv, ['plugin-root', 'project', 'home', 'listed', 'described', 'method', 'name-only', 'reached', 'install', 'format']);
  if (o.install !== undefined && !INSTALLS.includes(o.install)) die(`--install is one of ${INSTALLS.join(', ')}`);
  const pluginRoot = o['plugin-root'] || process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../../..');
  const skills = installed(pluginRoot);
  if (!skills || !skills.length) die('no skills found under the plugin root');
  const project = o.project || projectRoot();
  const home = o.home || process.env.HOME || '';
  if (o.method !== undefined && !METHODS[o.method]) die(`--method is one of ${Object.keys(METHODS).join(', ')}`);
  const known = new Set(skills.map((s) => s.name));
  const bare = (n) => n.trim().replace(/^\/?(sd0x-dev-flow:)?/, '');
  const given = (o['name-only'] || '').split(',').map(bare).filter(Boolean);
  const nameOnly = [...new Set(given.filter((n) => known.has(n)))];
  const reached = {};
  for (const pair of (o.reached || '').split(',').filter(Boolean)) {
    const [n, how] = pair.split('=');
    if (!REACHED.includes(how)) die(`--reached takes name=${REACHED.join('|')}`);
    if (known.has(bare(n))) reached[bare(n)] = how;
  }
  const listed = count(o, 'listed');
  const described = count(o, 'described');
  if ((listed !== null || described !== null) && !o.method) die('--listed and --described need --method');
  const may = skills.filter((s) => s.modelMay);
  let inconsistent = null;
  if (listed !== null && described !== null) {
    if (described > listed) inconsistent = 'more described than listed';
    else if (nameOnly.length && nameOnly.length !== listed - described) inconsistent = 'the named skills do not match listed minus described';
  }
  // A path can show a checkout; only the user can say that an install is an ordinary one.
  const checkout = o.install === 'checkout' || (real(pluginRoot) + path.sep).startsWith(real(project) + path.sep);
  const facts = {
    installed: skills.length, modelMay: may.length, withDescription: skills.filter((s) => s.described).length,
    descriptionChars: skills.reduce((n, s) => n + s.chars, 0), explicitOnly: skills.filter((s) => !s.modelMay).map((s) => s.name),
    checkout, install: checkout ? 'checkout' : o.install || 'unknown', listed, described, method: o.method || null, nameOnly, ignoredNames: given.length - given.filter((n) => known.has(n)).length,
    reached, inconsistent,
    project: copies(path.join(project, '.claude', 'skills'), skills, pluginRoot),
    user: home ? copies(path.join(home, '.claude', 'skills'), skills, pluginRoot) : null,
  };
  facts.verdict = verdict(facts);
  if (o.format === 'json') return process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
  const dup = (c, what) => (c === null ? `${what}: not checked`
    : `${what}: ${c.link.length} linked to this plugin's folder, ${c.same.length} separate and identical, ${c.different.length} separate and different${c.notChecked ? `, ${c.notChecked} not checked` : ''}`);
  const how = facts.method ? METHODS[facts.method] : null;
  process.stdout.write([
    '## Skill Discovery', '',
    checkout ? '> Source checkout: these counts do not stand for an ordinary install.' : facts.install === 'unknown' ? '> How this plugin was installed was not given.' : '> Counts for the plugin loaded here, an ordinary install by your account. One observation is one install.', '',
    '| Layer | Observed | Source |', '|---|---|---|',
    `| Installed | ${facts.installed} skills, ${facts.withDescription} with a description (${facts.descriptionChars} characters in all) | measured on disk |`,
    `| The model may choose | ${facts.modelMay}; explicit only: ${facts.explicitOnly.join(', ') || 'none'} | frontmatter |`,
    `| Listed to the model | ${listed === null ? 'unknown' : listed} | ${how || 'not given'} |`,
    `| Described to the model | ${described === null ? 'unknown' : described} | ${how || 'not given'} |`,
    '| Selected for a phrase | not tested | a count never shows this |',
    '| Explicit | `/sd0x-dev-flow:<name>` runs this plugin\'s copy; an unqualified name may reach another copy | by design |', '',
    `Same-named copies — ${dup(facts.project, 'project')}; ${dup(facts.user, 'user')}.`,
    ...(nameOnly.length ? [`Name-only as given: ${nameOnly.map((n) => `${n} (${reached[n] || 'unknown'})`).join(', ')}.`] : []),
    ...(facts.ignoredNames ? [`${facts.ignoredNames} given name(s) are not this plugin's and were ignored.`] : []),
    '', `**${facts.verdict}**`, '',
  ].join('\n'));
}

function phrases() {
  return JSON.parse(fs.readFileSync(PHRASES, 'utf8')).phrases;
}

// Deterministic for a seed, so two conditions can be given the same or a different order on purpose.
function shuffled(items, seed) {
  const out = [...items];
  let x = (seed >>> 0) || 1;
  const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 2 ** 32; };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function worksheet(argv) {
  const o = parse(argv, ['seed', 'lang']);
  if (o.seed !== undefined && !/^\d{1,9}$/.test(o.seed)) die('--seed needs a whole number');
  if (o.lang !== undefined && !['en', 'zh'].includes(o.lang)) die('--lang is en or zh');
  const list = shuffled(phrases().filter((p) => !o.lang || p.lang === o.lang || p.lang === 'any'), Number(o.seed || 1));
  process.stdout.write(['Running these phrases costs model calls: do it only if you chose to.', 'Record the skill used, or none, for each id and condition; answers are not shown here.', '', ...list.map((p) => `${p.id}\t${p.phrase}`), ''].join('\n'));
}

function score(argv) {
  const o = parse(argv, ['answers', 'format']);
  if (!o.answers) die('--answers <file> is required');
  let given;
  try {
    given = JSON.parse(fs.readFileSync(o.answers, 'utf8')).answers;
  } catch {
    die('the answers file could not be read as JSON');
  }
  if (!Array.isArray(given)) die('the answers file needs an "answers" list');
  const all = phrases();
  const byId = new Map(all.map((p) => [p.id, p]));
  const out = {};
  const seen = new Set();
  for (const a of given) {
    const p = byId.get(a && a.id);
    const cond = a && String(a.condition || '');
    if (!p) die('an answer names an unknown phrase id');
    if (!['described', 'name-only'].includes(cond)) die(`answer ${p.id} needs a condition: described or name-only`);
    if (seen.has(`${p.id} ${cond}`)) die(`answer ${p.id} is given twice for ${cond}`);
    if (a.chosen !== null && typeof a.chosen !== 'string') die(`answer ${p.id} needs "chosen": a skill name or null`);
    seen.add(`${p.id} ${cond}`);
    const c = (out[cond] = out[cond] || { targets: { hit: 0, missed: 0, wrong: 0 }, none: { quiet: 0, unwanted: 0 }, explicit: { ran: 0, failed: 0 }, byLanguage: {} });
    const chosen = a.chosen === null ? null : a.chosen.trim().replace(/^\/?(sd0x-dev-flow:)?/, '');
    const r = p.kind === 'none' ? (chosen === null ? 'quiet' : 'unwanted')
      : p.kind === 'explicit' ? (p.accept.includes(chosen) ? 'ran' : 'failed')
        : chosen === null ? 'missed' : p.accept.includes(chosen) ? 'hit' : 'wrong';
    c[p.kind === 'target' ? 'targets' : p.kind][r]++;
    const l = (c.byLanguage[p.lang] = c.byLanguage[p.lang] || {});
    l[r] = (l[r] || 0) + 1;
  }
  for (const cond of Object.keys(out)) out[cond].unanswered = all.filter((p) => !seen.has(`${p.id} ${cond}`)).length;
  if (o.format === 'json') return process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  const rows = Object.entries(out).map(([cond, c]) => `| ${cond} | ${c.targets.hit} | ${c.targets.missed} | ${c.targets.wrong} | ${c.none.quiet} | ${c.none.unwanted} | ${c.explicit.ran}/${c.explicit.ran + c.explicit.failed} | ${c.unanswered} |`);
  process.stdout.write(['| Condition | Hit | Missed | Wrong | Quiet when none fits | Unwanted use | Explicit ran | Unanswered |', '|---|---|---|---|---|---|---|---|', ...rows, '', 'These counts stay apart: one figure could improve while unwanted use grows. A few phrases show a possibility, not a rate.', ''].join('\n'));
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'observe') observe(rest);
else if (cmd === 'worksheet') worksheet(rest);
else if (cmd === 'score') score(rest);
else die('usage: skill-discovery.js observe | worksheet | score  (see SKILL.md § Discovery)');
