#!/usr/bin/env node
// Writes an agentctl task proposal for the mod to preview (tech spec § 3.7). Claude runs it after the
// person sends a drafting request. It validates with the mod's own reader, writes only the
// worktree's proposal file — privately and atomically — and changes nothing else: no binding, no
// settings, no permission rule. Nothing it writes is in force until the person accepts it.
//
//   node propose.mjs --worktree <absolute path> --help
//   node propose.mjs --worktree <absolute path> --stdin <<'DELIM'  …JSON…  DELIM

import { mkdirSync, renameSync, writeFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute } from 'node:path'
import { MAX_PROPOSAL_BYTES, proposalPath, readProposal } from '../lib/proposal.js'

const HELP = `Fields (JSON object on stdin; only "goal" is required):
  goal        string — what the task is
  allow       ["edit"] to allow edits; omit for read-only
  editRoots   paths inside the worktree that may be edited, e.g. ["src/login", "tests/login"]
  executors   checks to record as evidence, e.g. [{"argv": ["npm", "test"], "check": true}]
              plain commands only: no shell operators, no VAR=value prefix
  forbid      extra commands to refuse, e.g. ["terraform apply"]
  needsUser   commands that must ask a person, e.g. [["npm", "publish"]]
  tools       other tools the task may use, e.g. ["mcp__docs__search"]
  acceptance  strings — what "done" means
  base        the task id bound now, or null; the mod refuses a draft made against another
Built-in classes (production writes, direct git push / gh pr merge) cannot be allowed.
The proposal binds nothing: the person accepts it with /agentctl accept <digest>.`

function out(result, code) {
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exit(code)
}

const argv = process.argv.slice(2)
const at = argv.indexOf('--worktree')
const worktree = at >= 0 ? argv[at + 1] : undefined
if (argv.includes('--help')) { process.stdout.write(HELP + '\n'); process.exit(0) }
if (!worktree || !isAbsolute(worktree)) out({ ok: false, errors: ['--worktree <absolute path> is required'] }, 2)
if (!argv.includes('--stdin')) out({ ok: false, errors: ['pass the JSON on stdin with --stdin (see --help)'] }, 2)

let text
try {
  const buf = readFileSync(0)
  if (buf.length > MAX_PROPOSAL_BYTES) out({ ok: false, errors: [`the proposal is over ${MAX_PROPOSAL_BYTES} bytes`] }, 1)
  text = buf.toString('utf8')
} catch (err) {
  out({ ok: false, errors: [`stdin could not be read (${err.code || 'error'})`] }, 1)
}
// Validate against the draft's own base: the mod checks it against the task bound at reading.
let base = null
try { const j = JSON.parse(text); if (j && typeof j === 'object' && typeof j.base === 'string') base = j.base } catch { /* readProposal reports it */ }
const r = readProposal(text, { cwd: worktree, boundId: base })
if (!r.ok) out({ ok: false, errors: r.errors }, 1)

const file = proposalPath(homedir(), encodeURIComponent(worktree))
try {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, text, { mode: 0o600 })
  renameSync(tmp, file)
} catch (err) {
  out({ ok: false, errors: [`the proposal could not be written (${err.code || 'error'})`] }, 1)
}
out({ ok: true, path: file, next: 'The mod shows a preview when this turn ends; the person accepts it with /agentctl accept <digest>.' }, 0)
