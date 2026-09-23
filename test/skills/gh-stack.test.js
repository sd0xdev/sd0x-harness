'use strict';
// `/gh-stack` is the fourth workflow Anchor Register #4 enumerates, and the only one whose grant is
// spelled in another tool's vocabulary: it runs `gh stack …`, and the extension runs `git push`
// underneath — plain and atomic for `link`, per-branch value-bearing `--force-with-lease` for `push`
// and `submit` (read from the extension's source at v0.1.1). Two things therefore have to hold in
// the skill itself, because the rule file can only name them: the executed set is closed to the
// three granted subcommands, and the push-safety obligations the rule places on this workflow are
// actually carried here (attestation asked by name, bypass variables never set, push form in the
// approval).
//
// Contract: rules/git-workflow.md § Exception, rules/discretion.md § Anchor Register #4,
// docs/features/gh-stack-native/2-tech-spec.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const skill = readFileSync(resolve(root, 'skills/gh-stack/SKILL.md'), 'utf8');
const frontmatter = skill.slice(0, skill.indexOf('---', 3));
const body = skill.slice(skill.indexOf('---', 3));

const GRANTED = ['link', 'push', 'submit'];
// `view` is ungranted, not read-only: it syncs PR metadata and rewrites .git/gh-stack
// (`SaveNonBlocking`, cmd/view.go at v0.1.1). The skill reads the file and the Stacks API instead.
const UNGRANTED = ['view', 'rebase', 'sync', 'modify', 'merge', 'unstack', 'init', 'add', 'checkout'];

// What the skill would actually RUN: `gh stack <sub>` inside a shell fence. Prose and tables name
// the ungranted subcommands on purpose — that is how the boundary is documented — so scanning the
// whole document would report the documentation as the violation.
//
// Fences are tracked line by line, open → close, rather than paired by one regex: a fence indented
// inside a list item closes with an indented ``` that a `/```\n…```/g` pairing reads as the NEXT
// opening, which shifts every later pair and scans the prose between fences as if it ran.
function executedStackSubcommands(md) {
  const subs = new Set();
  let inShell = false;
  let inFence = false;
  for (const line of md.split('\n')) {
    const fence = line.match(/^\s*```(\S*)\s*$/);
    if (fence) {
      if (inFence) { inFence = false; inShell = false; } else { inFence = true; inShell = ['bash', 'sh'].includes(fence[1]); }
      continue;
    }
    if (!inShell) continue;
    for (const c of line.matchAll(/\bgh stack ([a-z]+)/g)) subs.add(c[1]);
  }
  return subs;
}

test('frontmatter when read → declares the approval tool and routes away from the ungranted work', () => {
  assert.match(frontmatter, /^name: gh-stack$/m);
  assert.match(frontmatter, /allowed-tools:.*AskUserQuestion/,
    'the per-use gate needs AskUserQuestion pre-approved, as in /push-ci');
  assert.match(frontmatter, /allowed-tools:.*Bash\(gh:\*\)/, 'the extension is driven through gh');
  assert.match(frontmatter, /gh stack link` \/ `gh stack push` \/ `gh stack submit --auto/,
    'the description should surface exactly what this skill may execute');
  assert.match(frontmatter, /rebase` \/ `sync` \/ `modify` stay the user's/,
    'the description should route history rewrites away before the skill is ever loaded');
});

test('the executed set when extracted from shell fences → is closed to the granted subcommands', () => {
  const subs = [...executedStackSubcommands(skill)].sort();
  for (const s of subs) {
    assert.ok(GRANTED.includes(s),
      `an ungranted subcommand appears in an executable fence: gh stack ${s}`);
  }
  assert.ok(subs.length > 0, 'the skill must show at least one executable invocation');
});

test('an unlabelled fence when present → holds no command-shaped line', () => {
  // The extractor above reads `bash`/`sh` fences only, because the skill's bare fences are text
  // boxes that name the ungranted subcommands on purpose. That exemption must not become a hiding
  // place: a bare fence whose line starts with a command is an executable block without its label.
  const bareFenceCommands = (md) => {
    let lang = null;
    const offenders = [];
    for (const line of md.split('\n')) {
      const fence = line.match(/^\s*```(\S*)\s*$/);
      if (fence) { lang = lang === null ? fence[1] : null; continue; }
      if (lang === '' && /^\s*(?:\/usr\/bin\/env |gh |git |\(\s*$)/.test(line)) offenders.push(line);
    }
    return offenders;
  };
  assert.deepEqual(bareFenceCommands(skill), [], 'label these fences bash, or move the commands out of them');
  // Control: the same guard on a document that hides a command in a bare fence must report it.
  assert.deepEqual(bareFenceCommands('prose\n```\ngh stack sync\n```\n'), ['gh stack sync'],
    'the guard must see a command in an unlabelled fence');
});

test('the extractor when a history-rewriting subcommand is put in a fence → reports it', () => {
  // The control for the test above: without it, an extractor that returned an empty set would pass
  // on any document at all, including one that force-rebases the stack in its first fence.
  const mutated = skill.replace(/^ {4}gh stack link --remote 'origin' --open .*$/m, '    gh stack sync || set -- "$?"');
  assert.notEqual(mutated, skill, 'fixture stale — the execution fence no longer matches');
  assert.ok(executedStackSubcommands(mutated).has('sync'),
    'a fenced `gh stack sync` must be visible to the extractor');
});

test('authorization when stated → per-use approval, the closed grant, and no inherited credential', () => {
  assert.match(body, /Every `gh stack` invocation REQUIRES explicit per-use user approval via AskUserQuestion/,
    'the approval sentence is the one rules/discretion.md pins this workflow on');
  assert.match(body, /no flag, no earlier approval and no delegating skill substitutes for it/,
    'a delegating caller must not be read as the approval');
  assert.match(body, /It may execute exactly three subcommands of the extension — `gh stack link`, `gh stack push`,\s+`gh stack submit --auto` — and nothing else from it, `gh stack view` included/,
    'the granted set must be spelled, not implied — and view, which writes, is outside it');
  for (const sub of UNGRANTED) {
    assert.ok(body.includes(`gh stack ${sub}`) || body.includes(`\`${sub}\``),
      `the boundary must name gh stack ${sub} rather than leaving it unmentioned`);
  }
});

test('a PR-number chain when linked → validates through the API, and a mixed chain is refused', () => {
  // `--link` takes PR numbers, which have no local branch — so the branch table cannot be the whole
  // validation, and saying nothing would leave the documented `/gh-stack --link 400 401` example
  // aborting on its first row.
  assert.match(body, /the PR must exist and be \*\*OPEN\*\*/, 'a closed or merged PR is not a layer');
  assert.match(body, /layer \*n\+1\*'s `baseRefName` must equal layer \*n\*'s `headRefName`/,
    'adjacency for PR operands is read from the chain fields, not from local ancestry');
  assert.match(body, /a chain \*\*mixing\*\* the two \| \*\*refused in v1\*\*/,
    'half-git half-API validation is not a validated chain');
  // `link` pushes every operand that names a local branch before resolving PR numbers, so a bare
  // `400` publishes a local branch called `400`. A URL is never resolved as a branch.
  assert.match(body, /\*\*The executed line renders the operand as that `url`, never as the number\*\*/,
    'PR operands must be rendered as URLs');
  assert.match(body, /its `url` must name \*\*this\*\* repository/, 'a URL from another repository is not this chain');
  const examples = body.slice(body.indexOf('## Examples'));
  assert.ok(!/gh stack link 400 401/.test(examples) && /'<url-400>' '<url-401>'/.test(examples),
    'the example must show the rendered URLs, not the bare numbers');
});

test('an attribution leak when remediated → the replacement body has a named source', () => {
  // § 7b remediates from Step 4b's pre-sanitized snapshot, which this flow never produces: --auto
  // authored the text. Without a stated input the cycle detects a leak it cannot fix.
  assert.match(body, /\*\*the order is the\s+contract, because the last step is what removes the directory the earlier ones write into\*\*/,
    'the remediation must state its ordering, or the title capture has no directory left');
  assert.match(body, /Allocate once, through `\/create-pr` § 7b \*\*Step 3a\*\*'s fence/,
    'the one allocator must be named — § Command Rendering forbids inventing a path');
  assert.match(body, /Capture \*\*both halves separately\*\* into it/,
    'both files are captured before either publish step runs');
  assert.match(body, /Never reuse that concatenation as a body/,
    'republishing the scanned file as a body would put the title inside it');
  // The title publish takes a string and needs no cleanup operand, so it must precede the body
  // block whose cleanup operand is the directory both files live in.
  assert.match(body, /it runs \*\*before\*\* step 5 removes the directory/,
    'the title publish must be ordered before the teardown');
  assert.match(body, /One remediation attempt per PR/, 'the remediation is bounded');
});

test('the two publishing forms when distinguished → link takes the chain, submit takes none', () => {
  // The extension's own contract: `gh stack submit` has no operands and publishes the stack it
  // tracks in .git/gh-stack (built by init/add, both outside the grant), while `gh stack link`
  // takes the chain. Delegating a validated chain to `--submit` would run an approved force push
  // against whatever stack `gh` considered active — approval/execution divergence.
  assert.match(body, /`gh stack submit` takes \*\*no operands\*\*/,
    'the operand contract must be stated, not left to the reader');
  assert.match(body, /`gh stack link` is the one that takes a chain/,
    'the chain-taking form must be named');
  assert.match(body, /A `--submit` run therefore never carries branch arguments/,
    'the consequence for this skill must be explicit');
  // And the executed line must render what the approval named.
  const fence = body.slice(body.indexOf('```bash\n(\n  set -- 0'));
  assert.match(fence, /gh stack link --remote 'origin' --open -- '[^']+' '[^']+' '[^']+'/,
    'the executed line renders the operands and the approved readiness flag');
  assert.match(body, /is approval\/execution divergence on a force path/,
    'dropping an operand or a flag must be named as the defect it is');
  // The Examples block is prose the prose pins above do not reach — round 5 found the contract
  // stated correctly four times and contradicted once, in an example an operator would copy.
  const examples = body.slice(body.indexOf('## Examples'));
  assert.ok(examples.length > 0, 'the skill must ship examples');
  for (const line of examples.split('\n')) {
    for (const form of ['--submit', '--push']) {
      assert.ok(!new RegExp(`\\${form}\\s+[^-\\s]`).test(line),
        `an example shows ${form} with an operand, which the extension does not accept: ${line}`);
    }
  }
  // The caller delegates the form that exists.
  const stackMode = readFileSync(resolve(root, 'skills/create-pr/references/stack-mode.md'), 'utf8');
  assert.match(stackMode, /delegates `\/gh-stack --link --open --base '<resolved target branch>' <layer>…`/,
    'create-pr must delegate --link with the base it resolved');
});

test('the resolved base travels with a delegated chain', () => {
  // Phases A and B validate every layer against the caller's resolved target branch; `gh stack link`
  // without `--base` chains layer 1 onto the repository default instead. Dropping it produces a
  // wrong-base PR behind an already-approved force push.
  assert.match(body, /`--base '<trunk>'` is rendered whenever a base was\s+supplied/,
    'the executed line must carry the base whenever one exists');
  assert.match(body, /\*\*the bottom layer's base\*\* \(the resolved trunk, or the repository default when\s+none was given — say which\)/,
    'the approval must state which base the run will use');
  assert.match(body, /\*\*passing\s+the chain it validated and the base it resolved — in both modes\*\*/,
    'the delegation contract must name the base as handed over in dry-run and execute alike');
  // A preview that reported layer 1 on the repository default while the approved run builds it on
  // the resolved target branch would be describing a different chain from the one approved.
  assert.match(body, /\/gh-stack \[--base <trunk>\] \[<branch>\.\.\.\]/,
    'the read-only form must have a --base slot for the dry-run delegation to render');
  const stackMode = readFileSync(resolve(root, 'skills/create-pr/references/stack-mode.md'), 'utf8');
  assert.match(stackMode, /--link --open --base '<resolved target branch>'/,
    'the caller must render the base into the delegated command');
});

test('the install is classified as the mutation it is', () => {
  // "Any run without a mutating flag is read-only" covered `--install`, which writes an executable
  // and is gated by Phase 1 rather than Phase 3 — a false classification on an authorization surface.
  assert.match(body, /\*\*Any run without `--install` and without a mutating flag is read-only\*\*/,
    'the read-only class must exclude the install');
  assert.match(body, /Phase 1's own for `--install` — which is mutating/,
    'the install must be named as mutating, with its own gate');
});

test('submit when invoked → always --auto, and readiness is a decision the approval carries', () => {
  assert.match(body, /`gh stack submit` is never run without `--auto`/,
    'the interactive editor would hang the agent holding an approved force push');
  assert.match(body, /`gh stack submit --auto` and\s+`gh stack link` alike create new PRs as \*\*drafts\*\* unless `--open` is passed/,
    'draft-by-default governs both publishing forms, not only the one the delegation never uses');
});

test('push safety when carried → the attestation is asked here, by name, before the force approval', () => {
  assert.match(body, /unshared attestation/, 'the question the opt-in hook may never ask must be asked here');
  assert.match(body, /by name and before the force approval/,
    'order matters: a force approval is not evidence about who else holds the branch');
  assert.match(body, /Never set by this skill, and \*\*cleared on every invocation it executes\*\*/,
    'an inherited ALLOW_* answers the hook without anybody being asked now');
  assert.match(body, /Set \*\*only\*\* on the single approved `gh stack push` or `gh stack submit --auto` line/,
    'ALLOW_FORCE_WITH_LEASE is scoped to the approved forcing command, never exported');
  assert.match(body, /\*\*never on `gh stack link`\*\*, which does not force/,
    'link issues no force, so it must not carry the lease bypass');
  assert.match(body, /Reference is not invocation/,
    'PUSH_GATE detection informs the description of the credential, never selects one');
  assert.match(body, /may never appear as a stack \*\*layer\*\*/,
    'a protected branch is a base, never a layer');
});

test('the reads that decide the push carry the same prefix the push does', () => {
  // Wrapping only the executed line splits the run: with GIT_DIR exported, Phase 2 proves the chain
  // in one repository and the stripped push moves another. GIT_GRAFT_FILE splits it one level down,
  // between the ancestry test and the push. Both are approval/execution divergence on a force path.
  const phase0 = body.slice(body.indexOf('### Phase 0'), body.indexOf('### Phase 1'));
  const reads = phase0.split('\n').filter((l) => /^\/usr\/bin\/env .*\b(gh|git) /.test(l));
  assert.ok(reads.length >= 4, `Phase 0's readings must each carry the prefix; found ${reads.length}`);
  for (const line of reads) {
    assert.match(line, /-u GIT_DIR -u GIT_WORK_TREE /, `a deciding read must strip GIT_DIR: ${line}`);
    assert.match(line, /GIT_GRAFT_FILE=\/dev\/null GIT_NO_REPLACE_OBJECTS=1/,
      `a deciding read must see the same graph the push will: ${line}`);
  }
  assert.match(body, /\*\*every command in the two tables\s+below runs behind the Phase 0 prefix above\*\*/,
    'Phase 2 validation must be bound to the same prefix, stated where the commands are named');
  // A reading the table consumes has to be derivable from the command that produces it. Discarding
  // both streams silences the report (which must never print) AND the verdict (which must) — the
  // echo is what separates the two.
  assert.match(phase0, /gh auth status >\/dev\/null 2>&1 && echo GH_AUTH=ok \|\| echo GH_AUTH=failed/,
    'the auth probe must emit its verdict while discarding its report');
});

// Every guarded execution block, by its opening; each is one fence.
function executionFences(md) {
  return [...md.matchAll(/```bash\n\(\n  set -- 0\n([\s\S]*?)```/g)].map((m) => m[1]);
}

test('the execution fence when shown → is the guarded block with a literal env prefix', () => {
  const fences = executionFences(body);
  assert.equal(fences.length, 2, 'one non-forcing (link) and one forcing (submit) example');
  const [link, forcing] = fences;
  assert.match(link, /gh stack link /, 'the first block is the link form');
  assert.match(forcing, /gh stack submit --auto/, 'the second block is a forcing form');
  for (const fence of fences) {
    assert.match(fence, /\|\| set -- "\$\?"/, 'the operation is guarded so a caller errexit cannot skip the report');
    assert.match(fence, /-u ALLOW_PUSH_PROTECTED -u ALLOW_FORCE_UNSHARED /,
      'both hook bypass variables are cleared on every executed line');
  }
  // link's push is `--atomic` without force (cmd/link.go `git.Push(remote, branches, false, true)`):
  // the lease bypass on it would silence a refusal nobody approved a force for.
  assert.ok(!link.includes('ALLOW_FORCE_WITH_LEASE'), 'link must not carry the lease bypass');
  assert.match(forcing, /GIT_GRAFT_FILE=\/dev\/null GIT_NO_REPLACE_OBJECTS=1 ALLOW_FORCE_WITH_LEASE=1/,
    'the forcing line neutralizes the ancestry vectors and scopes the lease flag to itself');
  // The remote is pinned on every executed line: left to the extension it is chosen from
  // pushRemote / pushDefault / branch remote / a saved preference, not from what Phase 2 validated.
  for (const f of fences) assert.match(f, /--remote 'origin'/, 'every executed line must name the validated remote');
  const fence = link;
  // The config channel is the one that removes the gate outright (core.hooksPath=/dev/null),
  // so it is unset on the executed line exactly as /push-ci and /epic-merge unset it.
  for (const name of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_GLOBAL', 'GIT_EXEC_PATH']) {
    assert.ok(fence.includes(`-u ${name} `), `the executed line must unset ${name}`);
  }
  assert.match(body, /written \*\*literally\*\*, never through a\nvariable/,
    'zsh does not word-split an expansion used as a command prefix');
});

test('failure states when classified → an unreadable answer is never an empty answer', () => {
  for (const [code, word] of [['2', 'not in a stack'], ['4', 'GitHub API failure'], ['6', 'multiple stacks'], ['7', 'rebase in progress'], ['8', 'locked by another process'], ['9', 'Stacks not available for this repository']]) {
    assert.ok(body.includes(`| ${code} |`), `exit code ${code} must have a disposition`);
    assert.ok(body.includes(word), `exit code ${code}'s meaning must be stated: ${word}`);
  }
  assert.match(body, /\| 4 \| GitHub API failure — \*\*never "no stack"\*\*/,
    'exit 4 must never read as "no stack"');
  assert.match(body, /\*\*every one of them, zero or not, goes on to Phase 4\*\*/,
    'a non-zero exit can follow a completed push and PR creation, so only verification says what exists');
  assert.match(body, /a file this skill cannot parse is not an empty one/,
    'an unreadable tracking file must stop rather than read as "no tracked stack"');
  assert.match(body, /Detection failure degrades to `absent`, never to `present`/,
    'the detection default must fail closed');
});

test('install when offered → approved, literal, and verified by re-listing', () => {
  assert.match(body, /the slug is the literal `github\/gh-stack` and is\nnever taken from a variable, an argument or a search result/,
    'an installed extension is an executable; its source must not be data');
  assert.match(body, /verified\*\* by\nre-listing rather than by the installer's exit status alone/,
    'an install that cannot be verified did not happen');
  assert.match(body, /never by a loose `stack` substring/,
    'identity matching, not substring — another extension named "stack" is not this one');
});

test('attribution when the extension authors the PR text → verified against the Anchor rule', () => {
  assert.match(body, /Attribution verify \(Anchor, CLAUDE\.md rule 3\)/,
    '--auto generates titles and bodies this skill did not write');
  assert.match(body, /skills\/create-pr\/scripts\/sanitize-pr-content\.sh/, 'the scanner must be named');
  assert.ok(existsSync(resolve(root, 'skills/create-pr/scripts/sanitize-pr-content.sh')),
    'the referenced scanner must exist');
  assert.ok(existsSync(resolve(root, 'scripts/commit-msg-guard.sh')),
    'the canonical pattern source must exist');
});

test('delegation when documented → the caller falls back and the two results are distinguished', () => {
  assert.match(body, /`\/create-pr --stack` calls this skill for the native path/,
    'the caller relationship must be stated where the gates are defined');
  assert.match(body, /The call is not an approval/, 'no gate is inherited across a delegation');
  assert.match(body, /no GitHub Stack object/, 'the fallback must name what it does not deliver');
});

test('the skill is registered where the dispatcher and the installers look', () => {
  const catalog = readFileSync(resolve(root, 'docs/skill-catalog.yml'), 'utf8');
  assert.match(catalog, /- command: \/gh-stack/, 'catalog entry missing — the README generator reads this file');
});

test('the push form when stated → read per subcommand from the source, and bound to its version', () => {
  // The extension composes the git flags, so the caller-level `--force` enforcement pre-push-gate.sh
  // relies on is absent here. What stands in for it is a reading of the extension's code — and a
  // reading is only as good as the version it was taken from.
  const force = body.slice(body.indexOf('### Force form'), body.indexOf('## Input'));
  assert.match(force, /\| `gh stack link` \| `git push <remote> --atomic refs\/heads\/<b>:refs\/heads\/<b> …` — \*\*no force\*\*/,
    'link pushes without force — the README implies otherwise, the code does not');
  assert.match(force, /--force-with-lease=refs\/heads\/<b>:<sha>/, 'push and submit carry a value-bearing lease per branch');
  assert.match(force, /\*\*The lease is not a sharedness check\.\*\*/,
    'a lease taken right after a fetch overwrites what the remote already held');
  assert.match(body, /\| `GH_STACK_VERSION` \|/, 'Phase 0 must record the version the reading is bound to');
  // A trace records a push that already happened; it cannot gate one. So an unverified version
  // stops mutating runs before the approval instead of being traced through them.
  assert.match(force, /\*\*every mutating run stops before Phase 3\*\*/,
    'an unverified extension version must stop before any approval is put');
  assert.match(force, /`GIT_TRACE=1` records a push that has already\s+happened/,
    'the trace must not be presented as a gate');
  assert.ok(!/GIT_TRACE=1` joins the assignments/.test(body), 'the retired traced-run variant must not return');
  // The push is not the whole grant: the mutation table names what else each subcommand changes.
  assert.match(force, /\*\*disables auto-merge\*\* on an existing PR/, 'submit\'s auto-merge change must be named');
  assert.match(force, /by unstacking the Stack recorded in `<git-dir>\/gh-stack-modify-state`/,
    'submit\'s pending-modify unstack must be named');
  assert.match(force, /\*\*retargets the base\*\* of an existing PR/, 'link\'s base retarget must be named');
});

test('the tracked stack when resolved → read from the file directly, with the extension\'s own selection', () => {
  // `gh stack view --json` would answer this, but it writes the file it reads. The Read tool does not.
  assert.match(body, /the Read tool on `<git-dir>\/gh-stack`/, 'the tracked stack is read without the extension');
  assert.match(body, /\| Unreadable, not JSON, or `schemaVersion` greater than `1` \| \*\*STOP\*\*/,
    'a file the skill cannot parse must stop the run');
  assert.match(body, /\| … of \*\*more than one\*\* stack \| \*\*STOP\*\*/,
    'the extension refuses the ambiguous case with exit 6; so must the skill');
  // The file is topology only. The extension re-syncs PR state (discovering PRs by head branch too)
  // and skips merged AND queued layers — so the skill does not predict the moving set; it approves
  // the stack as an upper bound, which holds because the extension can only push fewer, never others.
  assert.match(body, /\*\*The file gives the topology, not the chain that will move\*\*/,
    'the file must not be presented as the executed chain');
  assert.match(body, /\*\*The tracked stack is an upper bound, not a prediction\.\*\*/,
    'the approval must be framed as a bound on what can move');
  assert.match(body, /it can push \*\*fewer\*\* than the file lists and\s+\*\*never others\*\*/,
    'the soundness argument for the bound must be stated');
  assert.match(body, /\*\*immediately before execution the file is read again\*\*; a different stack, or different layers,\s+is re-approved/,
    'the one way the set could grow — the file changing — must re-open the approval');
  assert.ok(!/gh api graphql/.test(body), 'the retired prediction of active layers must not come back');
  // link tries a numeric operand as a Stack or PR number before a branch (strconv.Atoi, which also
  // accepts a leading `+`), so branch `400` or `+400` would act on PR #400. The pattern is pulled
  // out of the skill and exercised, so what is pinned is the guard's behaviour, not its spelling.
  const row = body.match(/\| `--link`: no branch operand parses as an integer \(`([^`]+)`/);
  assert.ok(row, 'the numeric-operand refusal row must exist and carry its pattern');
  const numeric = new RegExp(row[1]);
  for (const name of ['400', '+400', '+0400', '0400']) {
    assert.ok(numeric.test(name), `a name Atoi reads as an integer must be refused: ${name}`);
  }
  for (const name of ['feat-400', '400-fix', 'v400', 'feat/+400']) {
    assert.ok(!numeric.test(name), `an ordinary branch name must pass: ${name}`);
  }
  // submit resolves a pending modify by unstacking whichever Stack the state file names.
  assert.match(body, /\| `--submit`: a pending `gh stack modify` \| `<git-dir>\/gh-stack-modify-state` exists → \*\*STOP\*\*/,
    'a pending modify must stop submit before it can unstack another Stack');
  // Every change to an existing PR is part of what the approval names.
  assert.match(body, /\*\*every change to an already-existing PR that Phase 2 read\*\* \(base retargets,\s+auto-merge disabled, drafts marked ready\)/,
    'the approval must name every change the subcommand makes to existing PRs');
});

test('the stack when verified → asked of GitHub by PR, with absence and ignorance kept apart', () => {
  // `view` answers for the current branch from local state; `link` writes no local state. Verifying
  // a link through `view` reports "no stack" after a successful link, and some other stack as this
  // one when another is checked out — the first sends the caller into a second mutation per layer.
  const phase4 = body.slice(body.indexOf('### Phase 4'), body.indexOf('## Delegation'));
  assert.match(phase4, /```bash\n\s*gh api 'repos\/\{owner\}\/\{repo\}\/stacks\?pull_request=<n>'\n\s*```/,
    'verification must query the Stacks API for this chain');
  assert.ok(!/gh stack view/.test(phase4.replace(/never through `gh stack view`/, '')),
    'Phase 4 must not verify through view');
  for (const outcome of ['confirmed', 'confirmed absent', 'unverifiable']) {
    assert.ok(phase4.includes(`| **${outcome}** |`), `verification outcome must be defined: ${outcome}`);
  }
  assert.match(phase4, /\*\*Only `confirmed absent` is a fact about absence\*\*/,
    'an error or an uncorroborated 404 must never be read as "no Stack"');
  // A 404 cannot tell "not enabled" from "not visible to this token", and the extension turns every
  // 404 into exit 9 — so availability is settled before execution, where a refusal costs nothing.
  assert.match(phase4, /\*\*A `404` is never an absence here\.\*\*/, 'a post-execution 404 is a failed read');
  const probe = body.slice(body.indexOf('**Stacks availability**'), body.indexOf('### Phase 3'));
  assert.match(probe, /```bash\ngh api 'repos\/\{owner\}\/\{repo\}\/stacks\?per_page=1'\n```/,
    'availability must be probed before the approval');
  assert.match(probe, /`404` → \*\*STOP\*\*, reported as \*native unavailable\*/,
    'an unavailable repository stops before anything is mutated, so the caller may fall back');
  // With no PR on any layer, no Stack can hold the chain — the case where `link` failed before
  // creating anything, which left no PR number to verify with.
  assert.match(phase4, /either \*\*no layer has any PR, in any state\*\* — a Stack is made of PRs/,
    'a chain with no PRs must be a confirmed absence, not an unverifiable one');
  // A Stack keeps closed and merged PRs as members, so absence must be read over every state:
  // an open-only lookup reports a Stack whose layers have all merged as absent.
  assert.match(phase4, /`gh pr list --head '<b>' --state all --json number --limit 100`/,
    'PR discovery for verification must include closed and merged PRs');
  assert.ok(!/--state open --json number --limit 100`\.\s+A query that fails/.test(phase4),
    'the open-only discovery must not return');
  assert.match(phase4, /\*\*Not\*\* after `link` exited `0`/,
    'the empty-answer and link-success contradiction must be excluded from confirmed absent');
  // The outcome is about the Stack, not the command: an earlier Stack survives a rejected push.
  assert.match(phase4, /\| non-zero \| `confirmed` \| \*\*failed against an existing Stack\*\*/,
    'a non-zero exit with a confirmed Stack must not read as native success');
  assert.match(phase4, /\| `0` \| `confirmed`, every read-back as approved \| \*\*native success\*\* \|/,
    'native success needs a clean exit, a confirmed Stack and every approved PR change read back');
  // The extension only warns when a retarget, auto-merge change or ready-marking fails, and exits 0.
  assert.match(phase4, /\| `0` \| `confirmed`, a read-back differs from the approval \| \*\*partial\*\*/,
    'an approved PR change that did not land must not read as success');
  // submit's Stack sync is best-effort and its exit ignores it; only link fails when the Stack does.
  assert.match(phase4, /`submit`: \*\*published without a Stack\*\*/,
    'submit exiting 0 with no Stack must be reported as incomplete, not as a contradiction');
  assert.match(phase4, /\*\*read back after execution\*\* from step 1's per-PR read-back/,
    'readiness is read from GitHub after the run, not derived from the flag');
  const delegation = body.slice(body.indexOf('## Delegation'), body.indexOf('## Prohibited Actions'));
  assert.match(delegation, /`unverifiable` is a stop — the caller reports and does not\s+fall back/,
    'the caller contract must forbid falling back on an unverified outcome');
});
