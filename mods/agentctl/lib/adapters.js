// Per-command argv grammars for observational commands (tech spec § 3.4, feasibility § 6).
// A command passes only when every option is on its allow list; an unknown option, a write form or
// an option that names a program to run is refused. The mod never inserts flags: it validates the
// argv it was given or the call is not classified.

const GIT_GLOBAL_OK = new Set(['--no-pager', '--no-optional-locks'])

// Each git subcommand: allowed flags (exact, or `prefix=` for value forms) and a check on positionals.
const GIT = {
  status: { flags: ['-s', '--short', '-b', '--branch', '--porcelain', '--porcelain=v1', '--porcelain=v2', '-z', '-uno', '-unormal', '-uall', '--untracked-files=', '--ignored', '--no-renames'], positional: 'paths' },
  log: { flags: ['--oneline', '-n', '-p', '--stat', '--name-only', '--name-status', '--graph', '--decorate', '--all', '--format=', '--pretty=', '--since=', '--until=', '--author=', '--grep=', '--max-count=', '--follow', '--first-parent', '--reverse', '--no-merges', '-1', '-2', '-3', '-5', '-10', '-20'], positional: 'revs-paths' },
  diff: { flags: ['--stat', '--name-only', '--name-status', '--cached', '--staged', '--numstat', '--shortstat', '-U0', '-U1', '-U3', '--unified=', '--word-diff', '--color=never', '--no-color', '--check', '--no-ext-diff', '--no-textconv'], positional: 'revs-paths', mustHave: ['--no-ext-diff', '--no-textconv'] },
  show: { flags: ['--stat', '--name-only', '--name-status', '--oneline', '--format=', '--pretty=', '--no-patch', '-s', '--no-ext-diff', '--no-textconv'], positional: 'revs-paths', mustHave: ['--no-ext-diff', '--no-textconv'] },
  'rev-parse': { flags: ['--abbrev-ref', '--short', '--verify', '--show-toplevel', '--git-dir', '--is-inside-work-tree', '--symbolic-full-name', '-q', '--quiet'], positional: 'revs' },
  // Listing forms only: any positional would create, rename or delete a branch.
  branch: { flags: ['-a', '--all', '-r', '--remotes', '-v', '-vv', '--list', '--show-current', '--merged', '--no-merged', '--contains', '--format=', '--sort='], positional: 'none-or-list-pattern' },
}

const SIMPLE = {
  ls: { flags: ['-l', '-a', '-la', '-al', '-lh', '-lah', '-1', '-R', '-t', '-h', '-d', '-A'] },
  cat: { flags: ['-n'] },
  head: { flags: ['-n', '-c'], valued: ['-n', '-c'] },
  tail: { flags: ['-n', '-c'], valued: ['-n', '-c'] },
  wc: { flags: ['-l', '-w', '-c', '-m'] },
}

// rg / grep: search options only. Anything that runs a program, reads a config file or writes is out.
const SEARCH_OK = new Set(['-n', '-i', '-l', '-c', '-w', '-v', '-F', '-E', '-r', '-R', '-s', '-H', '-h', '-o', '-x', '--line-number', '--ignore-case', '--files-with-matches', '--count', '--fixed-strings', '--word-regexp', '--invert-match', '--hidden', '--no-heading', '--with-filename', '--no-filename', '--only-matching', '-A', '-B', '-C', '-m', '--max-count', '-g', '--glob', '-t', '--type', '--no-config', '-e'])
const SEARCH_VALUED = new Set(['-A', '-B', '-C', '-m', '--max-count', '-g', '--glob', '-t', '--type', '-e'])

function flagAllowed(arg, allowed) {
  if (allowed.includes(arg)) return true
  const eq = arg.indexOf('=')
  return eq > 0 && allowed.includes(arg.slice(0, eq + 1))
}

function checkGit(argv) {
  let i = 1
  while (i < argv.length && argv[i].startsWith('-')) {
    if (!GIT_GLOBAL_OK.has(argv[i])) return { ok: false, why: `git option ${argv[i]} not allowed` }
    i++
  }
  const sub = argv[i]
  const spec = GIT[sub]
  if (!spec) return { ok: false, why: `git ${sub ?? ''} is not an observational form` }
  const rest = argv.slice(i + 1)
  const positionals = []
  let afterDashDash = false
  for (let j = 0; j < rest.length; j++) {
    const a = rest[j]
    if (afterDashDash) { positionals.push(a); continue }
    if (a === '--') { afterDashDash = true; continue }
    if (a.startsWith('-')) {
      if (!flagAllowed(a, spec.flags)) return { ok: false, why: `git ${sub} option ${a} not allowed` }
      if (a === '-n' || a === '--contains') j++ // takes a value
      continue
    }
    positionals.push(a)
  }
  if (spec.positional === 'none-or-list-pattern' && positionals.length > 0 && !rest.includes('--list')) {
    return { ok: false, why: 'git branch with a name would create, rename or delete a branch' }
  }
  if (spec.mustHave) {
    for (const m of spec.mustHave) if (!rest.includes(m)) return { ok: false, why: `git ${sub} needs ${spec.mustHave.join(' ')} so no external diff or textconv program runs` }
  }
  return { ok: true }
}

// `-rn` is `-r -n`: bundled single-letter flags are checked one by one; only the last may take a
// value. A bundle containing anything not allowed is refused whole.
function expandBundle(a) {
  return /^-[A-Za-z]{2,}$/.test(a) ? [...a.slice(1)].map((ch) => '-' + ch) : [a]
}

function checkSimple(argv) {
  const spec = SIMPLE[argv[0]]
  for (let j = 1; j < argv.length; j++) {
    const a = argv[j]
    if (a === '--') break
    if (a.startsWith('-') && a !== '-') {
      if (spec.flags.includes(a)) { if (spec.valued?.includes(a)) j++; continue }
      const parts = expandBundle(a)
      if (parts.length < 2 || !parts.every((f) => spec.flags.includes(f))) return { ok: false, why: `${argv[0]} option ${a} not allowed` }
      if (spec.valued?.includes(parts[parts.length - 1])) j++
    }
  }
  return { ok: true }
}

function checkSearch(argv, env) {
  if (argv[0] === 'rg') {
    if (!argv.includes('--no-config')) return { ok: false, why: 'rg needs --no-config so RIPGREP_CONFIG_PATH cannot add options' }
    if (env && Object.prototype.hasOwnProperty.call(env, 'RIPGREP_CONFIG_PATH')) return { ok: false, why: 'rg with RIPGREP_CONFIG_PATH set' }
  }
  for (let j = 1; j < argv.length; j++) {
    const a = argv[j]
    if (a === '--') break
    if (!a.startsWith('-') || a === '-') continue
    const name = a.includes('=') ? a.slice(0, a.indexOf('=')) : a
    if (SEARCH_OK.has(name)) { if (SEARCH_VALUED.has(name) && !a.includes('=')) j++; continue }
    const parts = expandBundle(a)
    if (parts.length < 2 || !parts.every((f) => SEARCH_OK.has(f))) return { ok: false, why: `${argv[0]} option ${a} not allowed` }
    if (SEARCH_VALUED.has(parts[parts.length - 1])) j++
  }
  return { ok: true }
}

export const ADAPTER_COMMANDS = ['git', 'ls', 'cat', 'head', 'tail', 'wc', 'rg', 'grep']

// argv: string[] already tokenized. env: inline assignments that preceded the command.
export function checkAdapter(argv, env = {}) {
  const cmd = argv[0]
  if (Object.keys(env).length > 0) return { ok: false, why: 'inline environment assignments are not classified' }
  if (cmd === 'git') return checkGit(argv)
  if (cmd in SIMPLE) return checkSimple(argv)
  if (cmd === 'rg' || cmd === 'grep') return checkSearch(argv, env)
  return { ok: false, why: `${cmd} has no adapter` }
}
