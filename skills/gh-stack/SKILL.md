---
name: gh-stack
description: "Native stacked pull requests through the github/gh-stack extension. Detects the extension, installs it only after the user approves, resolves the branch chain, and executes `gh stack link` / `gh stack push` / `gh stack submit --auto` under a per-use AskUserQuestion gate. Use when: opening or refreshing a native stack of PRs, linking existing PRs into a stack on GitHub, pushing a stack's branches, or when /create-pr --stack delegates the native path here. Not for: a single PR (use /create-pr), pushing one branch (use /push-ci), merging a chain (use /epic-merge), or any history rewrite — `gh stack rebase` / `sync` / `modify` stay the user's to run. Output: stack table + per-command verdict + attribution verify."
allowed-tools: Bash(gh:*), Bash(git:*), Bash(bash:*), Bash(/bin/bash:*), Bash(mktemp:*), Bash(rm:*), Read, Write, Grep, Glob, AskUserQuestion
---

# GH Stack — Native Stacked PRs

**Read first**: `@skills/push-ci/references/authorization-contract.md` before any `gh stack` operation that pushes — § Push safety for the credential and the unshared attestation, § Efficacy Boundary for what the per-use approval authorizes. If that Read fails, stop and report it; run no pushing operation.


Wraps the `github/gh-stack` extension so a branch chain becomes a real **Stack** on GitHub — one PR per layer, chained bases, per-layer diff view, linked merges — instead of the hand-built chained-base PR set `/create-pr --stack` produces on its own.

## Authorization

```
⚠️ This skill is one of the four workflows Anchor Register #4 enumerates (@rules/discretion.md).
⚠️ It may execute exactly three subcommands of the extension — `gh stack link`, `gh stack push`,
   `gh stack submit --auto` — and nothing else from it, `gh stack view` included: `view` syncs PR
   metadata and writes it back into `.git/gh-stack`, so it is not a read. What this skill needs to
   read, it reads without the extension (the first row of the table below).
⚠️ All three push, and they do not push the same way. Read from the extension's source at v0.1.1
   (§ Force form): `link` runs a plain `git push --atomic`; `push` and `submit --auto` run a
   per-branch, value-bearing `git push --force-with-lease=refs/heads/<b>:<sha>`. The approval
   names the form the chosen subcommand uses.
⚠️ Every `gh stack` invocation REQUIRES explicit per-use user approval via AskUserQuestion
   — no flag, no earlier approval and no delegating skill substitutes for it.
⚠️ Every other subcommand is printed for the user to run, never executed.
```

| Operation | Executor | Authorization |
|-----------|----------|---------------|
| `gh --version`, `gh auth status` (exit status only), `gh extension list`, `gh pr list --json`, `gh pr view --json`, `gh api 'repos/{owner}/{repo}/stacks?pull_request=<n>'` (GET), `git rev-parse`, `git merge-base`, and the extension's tracking file `<git-dir>/gh-stack` read with the Read tool | this skill | read-only |
| `gh extension install github/gh-stack` | this skill | Phase 1 AskUserQuestion — **never** installed silently |
| `gh stack link`, `gh stack push`, `gh stack submit --auto` | this skill | Phase 3 per-use AskUserQuestion naming the push form and the branches |
| `gh stack view`, `gh stack rebase`, `gh stack sync`, `gh stack modify`, `gh stack merge`, `gh stack unstack`, `gh stack init`, `gh stack add`, `gh stack checkout` | **user only** — printed, never run | outside the grant |
| `gh pr edit` for an attribution remediation | this skill | `/create-pr` § 7b contract (CLAUDE.md rule 3, Anchor) |
| `git push` by any other route | `/push-ci` | its own workflow |

**Why that split, rather than "whatever the extension offers".** The three granted subcommands move
**remote refs and PR state**; the ungranted ones rewrite **local history** (`rebase`, `sync`,
`modify`), merge PRs (`merge`), or need a TUI no agent can drive (`modify`, `checkout` without an argument, and `submit` without `--auto`). `sync` is the one that reads like a convenience and is not: it fetches, cascade-rebases,
force-pushes and prunes in one call, so approving "a sync" approves a history rewrite nobody has
seen. It stays the user's. `view` is the one that reads like a query and is not: both its `--json`
and its default form sync PR metadata from GitHub and then call `SaveNonBlocking`, which rewrites
`.git/gh-stack` (`cmd/view.go`, v0.1.1). A read that persists state is a mutation of the
extension's own bookkeeping, and nothing in this skill needs it — the file can be read directly,
and the remote Stack has a REST endpoint of its own.

**`gh stack submit` is never run without `--auto`.** Interactively it opens a full-screen editor;
an agent invoking it hangs the session holding an approved force push. Readiness is the same for **both** publishing forms — `gh stack submit --auto` and
`gh stack link` alike create new PRs as **drafts** unless `--open` is passed, and `--open` is carried into the Phase 3 approval — a caller may propose it, this skill does not
execute it unless that approval affirms readiness.

### Push safety — the obligation this skill carries itself

Every granted subcommand pushes, two of them with force, and the `pre-push` hook is **opt-in**
(@rules/git-workflow.md § Push safety). So:

| Obligation | How this skill meets it |
|------------|-------------------------|
| The **unshared attestation** — *is anybody else working on the branches this push rewrites* | For `gh stack push` and `gh stack submit --auto`, Phase 3 asks it **by name and before the force approval**, listing the branches, and refuses the invocation when the answer is not the attestation. An installed hook may ask again over `/dev/tty`; that is defence in depth, never a reason to skip the question, because where the hook is absent nothing else asks. `gh stack link` rewrites nothing: its push carries no force, so a branch that diverged on the remote is refused by git itself and the run stops there (§ Force form) |
| `ALLOW_PUSH_PROTECTED` and `ALLOW_FORCE_UNSHARED` are developer-set only | Never set by this skill, and **cleared on every invocation it executes** — a value exported earlier in the shell answers the hook's question without anybody being asked now |
| `ALLOW_FORCE_WITH_LEASE` | Set **only** on the single approved `gh stack push` or `gh stack submit --auto` line, in the same phase that obtained the force-form approval — the same shape `/push-ci` uses — and **never on `gh stack link`**, which does not force. Without it the hook refuses the force-form push outright, which is a refusal, not an authorization of anything |
| Protected branches | A protected branch (`main`/`master`/`develop`/`release/*`, plus the project's additions — Phase 2's resolver) may be the stack's **base** and may never appear as a stack **layer**. Phase 2 hard-aborts if one does |

**Why this skill is model-invocable when `/push-ci` and `/epic-merge` are not.** Both set
`disable-model-invocation: true`; this one deliberately does not, because `/create-pr --stack`
reaches it through the `Skill` tool and that flag would block the delegation the routing depends on.
The trade is stated rather than silent, and it is a trade rather than an equivalence: the outer stop
those two get from the flag is **not available here**, and what stands in its place is Phase 3's two
questions — which § Efficacy Boundary's caching weakness still reaches, where the flag would not
have. What Phase 3 does hold absolutely is that no caller, flag or earlier turn substitutes for the
question being asked.

### Force form — read from the source, bound to v0.1.1

`ALLOW_FORCE_WITH_LEASE=1` on the executed line silences one refusal in `pre-push-gate.sh`: the
non-fast-forward `exit 1`. That gate's own comment records why the bypass is safe for the other two
workflows — *"Git hooks cannot distinguish `--force` from `--force-with-lease` (same ref data).
Callers … set `ALLOW_FORCE_WITH_LEASE=1` only when `--force-with-lease` is explicitly requested.
**Bare `--force` enforcement is at the caller level.**"* — and **here the caller does not compose
the flag**: the extension does. The push form is therefore a claim about somebody else's code, and
it is stated from that code, not from its README (which describes `link` as if it forced, and does
not):

| Subcommand | The push it issues — `github/gh-stack` v0.1.1 | Source |
|------------|-----------------------------------------------|--------|
| `gh stack link` | `git push <remote> --atomic refs/heads/<b>:refs/heads/<b> …` — **no force**, only the operands that name local branches | `cmd/link.go` `pushBranchArgs` → `git.Push(remote, branches, false, true)` |
| `gh stack push` | `git push <remote> --force-with-lease=refs/heads/<b>:<sha> … refs/heads/<b>:refs/heads/<b> …` — one lease per branch, `<sha>` read from `refs/remotes/<remote>/<b>`, and an empty value (`refs/heads/<b>:`, *must not exist*) for a branch the remote does not have yet. Not atomic | `cmd/push.go` → `internal/git/gitops.go` `Push` with force=true, atomic=false |
| `gh stack submit --auto` | the same form, one branch per `git push` | `cmd/submit.go` → the same `Push` |

Three consequences, each of them contract:

1. **That version issues no bare `--force`, and every refspec is fully qualified** — a branch named
   `+main` stays a ref name and never becomes a force modifier. This is what the grant covers.
2. **The lease is not a sharedness check.** Both forcing subcommands call `FetchBranches`
   immediately before the push, so `<sha>` is whatever the remote held a moment earlier: the lease
   stops a race between that fetch and the push, and nothing else. A collaborator's commits that
   were already on the remote pass it and are overwritten. That is why Phase 3 asks the unshared
   attestation for these two subcommands, and why a lease being present is never a reason to skip it.
3. **The reading is bound to the version it was read from.** Phase 0 records the installed version
   (`GH_STACK_VERSION`). On anything other than `v0.1.1` the push form is **unverified**, and an
   unverified push form cannot be approved: **every mutating run stops before Phase 3** and reports
   the version it found. A trace is no substitute — `GIT_TRACE=1` records a push that has already
   happened, so a bare `--force` it revealed would already be on the remote; and `GH_DEBUG` logs API
   traffic, not the subprocess argv. The way back is a maintainer reading that version's sources —
   the files the table above cites — and moving the pinned version here and in
   `test/skills/gh-stack.test.js` together. A bare `--force` or an unqualified refspec found in
   **any** version is outside the grant: this skill stops using that subcommand and reports to the
   maintainer — no per-use approval can cover it.

**The push is not the whole of what these subcommands change, and the approval has to cover all of
it.** Read from the same sources, the complete mutation surface of the three at v0.1.1:

| Subcommand | Changes beyond the push |
|------------|-------------------------|
| `gh stack link` | creates a PR for every branch operand without one (draft unless `--open`); **retargets the base** of an existing PR that is not on the expected one; marks existing drafts ready under `--open`; creates the Stack or appends to the one a PR already belongs to. It *refuses* merged, closed, queued and auto-merge PRs rather than changing them |
| `gh stack push` | fetches the stack's branches, then writes `.git/gh-stack`. Its own modify guard refuses only a modify that is `applying` or in `conflict` — a `pending_submit` state passes it, and so does a state file it cannot read (`internal/modify/state.go` `CheckStateGuard`); `push` does not unstack anything, so that state is no hazard to it |
| `gh stack submit --auto` | **resolves a pending `gh stack modify` first — non-interactively, by unstacking the Stack recorded in `<git-dir>/gh-stack-modify-state`, which need not be the one being submitted**; fetches; per layer pushes, then **disables auto-merge** on an existing PR, retargets its base when the stack is not yet on GitHub, marks drafts ready under `--open`, or creates the PR with generated text; creates or extends the Stack; writes `.git/gh-stack` |

Every row is a state change the approval names (Phase 3), except the pending-modify resolution,
which this skill refuses rather than approves (Phase 2): deleting a Stack is outside the grant. The
extension only **warns** when a base retarget, an auto-merge change or a ready-marking fails, and
still exits `0` — which is why Phase 4 reads every one of them back instead of trusting the exit.

`PUSH_GATE` detection (Phase 0) reports whether an executable `pre-push` hook *references*
`pre-push-gate.sh`. Reference is not invocation: it informs how the plan **describes** the
credential and never selects one. If the approval is given and no `/dev/tty` prompt appears, that
in-session approval was the only approval.

## Input

```
/gh-stack [--base <trunk>] [<branch>...]  # explicit chain, bottom first; resolve + report only
/gh-stack --link [--base <trunk>] <branch-or-pr>...  # a chain YOU name (bottom first): push it, create/chain the PRs, create the Stack
/gh-stack --submit                 # the stack the extension already tracks locally (.git/gh-stack); takes no operands
/gh-stack --push                   # push the tracked stack's branches, no PR changes
/gh-stack --open                   # with --link or --submit: mark new and existing PRs ready for review
/gh-stack --install                # detection + install offer only; already installed → report and stop
```

**`--link` and `--submit` are not two spellings of one operation, and picking the wrong one is how
an approved force push acts on branches nobody named.** `gh stack submit` takes **no operands**: it
publishes the stack `gh stack` tracks locally in `.git/gh-stack`, which is built by `gh stack init`
/ `add` — both outside this skill's grant. `gh stack link` is the one that takes a chain, and the
extension documents it for exactly this case ("users who manage branches with other tools locally"):
it pushes the named branches, reuses or creates each PR with the correct base chaining, and creates
or extends the Stack. So:

| The chain came from | Form | Why |
|---------------------|------|-----|
| An explicit argument — the user's, or `/create-pr --stack`'s validated chain | `--link` | operands exist, no local tracking is assumed or written |
| The extension's own local tracking — exactly one stack in `.git/gh-stack` containing the current branch | `--submit` | there is nothing to name; the tracked stack *is* the operand |
| Neither | STOP (Phase 2) | — |

A `--submit` run therefore never carries branch arguments, and its approval names **every layer of
the tracked stack Phase 2 selects** — the stack `submit` itself selects (`cmd/submit.go`:
`FindAllStacksForBranch`) — as an **upper bound**: the extension skips merged and queued layers at
run time, so it may push fewer and never others (§ Phase 2, Tracked stack). Not a list this skill
assembled, and not a prediction of which layers will move. **`--push` is the same shape**:
`gh stack push` pushes the tracked stack's branches and takes no operands either, so branch
arguments with `--push` are a parameter error — accepting them would let an attestation and a force
approval name branches while the execution moved whatever the extension happens to track.

**Any run without `--install` and without a mutating flag is read-only**: detect, resolve, report — including the
`/gh-stack <layer>…` form `/create-pr --stack` delegates in dry-run, which carries arguments and no
flag. Nothing mutating happens without both a flag that names the operation **and** an approval:
Phase 3's for the three `gh stack` subcommands, Phase 1's own for `--install` — which is mutating
too (it writes an executable to disk) and is the one mutation Phase 3 does not gate.

## Workflow

```
Phase 0 detect → Phase 1 install (approval) → Phase 2 resolve chain → Phase 3 approve + execute → Phase 4 verify + report
```

### Phase 0 — Environment detection (read-only)

**Step 0a/0b first: the interpreter and the transport, before anything is read.** This skill
executes pushes through the extension, two of its subcommands with force-with-lease, so it carries the same two refusals
`/push-ci` § Phase 0 and `/epic-merge` carry, for the same measured reason
(`docs/features/push-gate-optin/4-implementation.md` § 4): a non-interactive bash **sources**
`$BASH_ENV` before line 1 of any fence below (zsh does the same with `$ENV` under sh emulation), and
a sourced file may *define* a function named `/usr/bin/env` — measured, the word resolved to the
function and the child never ran. Under that, the `-u ALLOW_PUSH_PROTECTED -u ALLOW_FORCE_UNSHARED`
clearing this skill promises would be whatever that function chose to do, and both hook prompts
would be silently skipped. Transport variables are refused rather than cleared for the reason
`/push-ci` § 0b gives: clearing one moves the push to a destination the plan did not describe.

```bash
# No command word in this block by design: `[[ ]]` is a keyword the parser resolves, so a function
# cannot outrank it; the rest is assignment and expansion. Set-ness, not emptiness (an exported
# empty value is still a file the parent named). Names are printed, never values.
SHELL_STARTUP_INHERITED=
[[ -n "${BASH_ENV+set}" ]] && SHELL_STARTUP_INHERITED=BASH_ENV
[[ -n "${ENV+set}" ]] && SHELL_STARTUP_INHERITED="${SHELL_STARTUP_INHERITED:+${SHELL_STARTUP_INHERITED}, }ENV"
if [[ -n "$SHELL_STARTUP_INHERITED" ]]; then
  # Name the detected variable through `echo`, not through the `${var:?word}` word: measured, zsh
  # (this platform's default shell) does NOT parameter-expand that word, so the refusal would read
  # a literal `${SHELL_STARTUP_INHERITED}` and tell the operator to unset something it never named.
  # Both shells still refuse with rc=1 — only the message degrades, which is why the transport
  # block below already echoes its own names.
  echo "⛔ shell startup file variables set in this environment: ${SHELL_STARTUP_INHERITED}" >&2
  # No apostrophe anywhere in the word below: inside `${var:?word}` bash reads one as an opening
  # quote even within double quotes, and that is a PARSE error — it would take the whole fence down
  # on every run, refusing and ordinary alike (measured, `/push-ci` § Phase 0 step 0a).
  SD0X_GH_STACK_REFUSED=
  : "${SD0X_GH_STACK_REFUSED:?refusing — ${SHELL_STARTUP_INHERITED} is set in this environment.
   That startup file is sourced before line 1 of every fence below and can redefine the commands
   they run, the absolute /usr/bin/env prefix included (measured). The bypass variables this skill
   promises to clear would then be cleared by whatever it chose. Unset it and re-run. Nothing is
   detected, planned, installed or pushed.}"
fi

# `gh`'s own destination variables sit beside git's here, because this skill's transport IS gh:
# `GH_REPO` retargets every `gh` call at another repository, so an approval naming this repo's
# branches would drive stack and PR creation somewhere else entirely; `GH_HOST` and `GH_CONFIG_DIR`
# move the host and the credentials the same way.
TRANSPORT_PRESENT=
[[ -n "${GH_REPO+set}" ]] && TRANSPORT_PRESENT=GH_REPO
[[ -n "${GH_HOST+set}" ]] && TRANSPORT_PRESENT="${TRANSPORT_PRESENT:+${TRANSPORT_PRESENT}, }GH_HOST"
[[ -n "${GH_CONFIG_DIR+set}" ]] && TRANSPORT_PRESENT="${TRANSPORT_PRESENT:+${TRANSPORT_PRESENT}, }GH_CONFIG_DIR"
[[ -n "${GIT_SSH_COMMAND+set}" ]] && TRANSPORT_PRESENT="${TRANSPORT_PRESENT:+${TRANSPORT_PRESENT}, }GIT_SSH_COMMAND"
[[ -n "${GIT_SSH+set}" ]] && TRANSPORT_PRESENT="${TRANSPORT_PRESENT:+${TRANSPORT_PRESENT}, }GIT_SSH"
[[ -n "${GIT_PROXY_COMMAND+set}" ]] && TRANSPORT_PRESENT="${TRANSPORT_PRESENT:+${TRANSPORT_PRESENT}, }GIT_PROXY_COMMAND"
[[ -n "${GIT_SSH_VARIANT+set}" ]] && TRANSPORT_PRESENT="${TRANSPORT_PRESENT:+${TRANSPORT_PRESENT}, }GIT_SSH_VARIANT"
if [[ -n "$TRANSPORT_PRESENT" ]]; then
  echo "⛔ transport variables set in this environment: ${TRANSPORT_PRESENT}" >&2
  echo "   Each one decides where a push lands, so neither honouring nor clearing them lets this" >&2
  echo "   run describe the destination the stack would reach." >&2
  echo "   ssh names (GIT_SSH*, GIT_PROXY_COMMAND): move the setting to ~/.ssh/config or" >&2
  echo "   'git config core.sshCommand'. gh names (GH_REPO, GH_HOST, GH_CONFIG_DIR): unset it and" >&2
  echo "   run from a checkout of the repository you mean. Then re-run." >&2
  SD0X_GH_STACK_REFUSED=
  : "${SD0X_GH_STACK_REFUSED:?refusing — transport variables set in this environment}"
fi
```

Then the readings — **each one behind the same prefix the Phase 3 execution carries**, written out
literally:

```bash
/usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT GIT_GRAFT_FILE=/dev/null GIT_NO_REPLACE_OBJECTS=1 gh --version
/usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT GIT_GRAFT_FILE=/dev/null GIT_NO_REPLACE_OBJECTS=1 gh extension list
/usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT GIT_GRAFT_FILE=/dev/null GIT_NO_REPLACE_OBJECTS=1 git rev-parse --show-toplevel
/usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT GIT_GRAFT_FILE=/dev/null GIT_NO_REPLACE_OBJECTS=1 git rev-parse --abbrev-ref HEAD
/usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT GIT_GRAFT_FILE=/dev/null GIT_NO_REPLACE_OBJECTS=1 gh auth status >/dev/null 2>&1 && echo GH_AUTH=ok || echo GH_AUTH=failed
/usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT GIT_GRAFT_FILE=/dev/null GIT_NO_REPLACE_OBJECTS=1 /bin/bash -c 'h=$(git rev-parse --git-path hooks/pre-push); [ -x "$h" ] && grep -q pre-push-gate.sh "$h" && echo referenced || echo absent'
```

**The auth probe prints its verdict, never its report.** `gh auth status` has no `--json` form and
writes host, account and token scopes to its output, which § Readings and § Prohibited Actions both
forbid printing — so both streams are discarded. But discarding them alone would make the reading
**unobservable**: it is one command among several in the fence, so its exit status is neither
captured nor left as the fence's. `&& echo GH_AUTH=ok || echo GH_AUTH=failed` is what turns the
status into the reading the table consumes, without letting a byte of the report out.

**Why a read-only probe is wrapped at all, since Phase 0 already refuses two classes.** Those
refusals cover the interpreter (`BASH_ENV`/`ENV`) and the transport (`GH_REPO`, `GH_HOST`,
`GH_CONFIG_DIR`, `GIT_SSH*`, `GIT_PROXY_COMMAND`) — not `GIT_DIR`, `GIT_WORK_TREE`,
`GIT_CONFIG_COUNT`, `GIT_GRAFT_FILE` or `GIT_REPLACE_REF_BASE`. Leave the reads bare and only the
push is stripped, which splits the run in two: with `GIT_DIR=/other/repo` exported, Phase 2 proves
the chain in repo B, Phase 3's approval names branches proven in repo B, and the executed line —
which *does* unset `GIT_DIR` — force-with-lease-pushes repo A. `GIT_GRAFT_FILE` splits it the same
way one level down: the ancestry test answers from a grafted graph while the push runs with grafts
neutralized. That is the approval/execution divergence § Phase 3 names as a defect, arrived at from
the other end. `/push-ci` wraps every probe from its first `git rev-parse` onward for this reason;
this skill does the same, and the two neutral values (`GIT_GRAFT_FILE=/dev/null`,
`GIT_NO_REPLACE_OBJECTS=1`) ride along so the validating reads see the same graph the push will.

Match the extension by its **identity** `github/gh-stack`, never by a loose `stack` substring — a
third-party extension whose name contains "stack" is not this one, and running `gh stack` against it
is running an unknown binary under an approved force push.

| Reading | Value |
|---------|-------|
| `GH_STACK` | `present` / `absent` |
| `GH_STACK_VERSION` | the version column `gh extension list` prints for `github/gh-stack` (e.g. `v0.1.1`), or `unknown`. Anything but `v0.1.1` stops every mutating run before its approval (§ Force form, consequence 3); read-only runs proceed — it does not make the extension absent |
| `GH_AUTH` | `ok` / `failed` — from the `gh auth status` **exit status only**; never print its output, which names hosts and token scopes (@rules/logging.md). `failed` **stops the run here**, before any approval is put to the user: an unauthenticated `gh` can neither resolve a stack nor publish one, so obtaining a force approval first would be asking about work that cannot happen |
| `PUSH_GATE` | `referenced` / `absent` — an executable `.git/hooks/pre-push` naming `pre-push-gate.sh` |
| `REPO_ROOT`, `BRANCH` | for the report |

**Detection failure degrades to `absent`, never to `present`.** An unreadable environment that is
treated as ready is how an unapproved install or a missing binary becomes a half-executed stack.

### Phase 1 — Install, only on approval

`GH_STACK=present` → skip this phase entirely — **except for an `--install` run, which reports
"already installed" and stops here**. `--install` never enters Phase 2: it names no chain, so Phase
2's "ask for an explicit chain" STOP would be the wrong report for what was asked.

**Which runs reach this phase.** The install offer is itself a mutation, so it is reachable only
from `--install` or a mutating flag (`--submit` / `--link` / `--push`). A **read-only run** —
`/gh-stack` with no flag, arguments or not, including the form `/create-pr --stack` delegates in
dry-run — never offers it: it reports `absent` and stops, which is what keeps § Input's
"nothing mutating without a flag **and** the approval" true of this phase too.

`GH_STACK=absent` **and the run carries `--install` or a mutating flag** → **AskUserQuestion**, and it is the whole credential for the install:

| Option | Effect |
|--------|--------|
| Install `github/gh-stack` | run `gh extension install github/gh-stack`, then re-run `gh extension list` and re-match the identity |
| Continue without it | report the non-native path and stop (the caller falls back — see § Delegation) |
| Abort | stop, nothing runs |

```bash
gh extension install github/gh-stack
```

Three properties of this step are contractual: the slug is the literal `github/gh-stack` and is
never taken from a variable, an argument or a search result; the install is **verified** by
re-listing rather than by the installer's exit status alone; and a failed install is reported as
`absent` and routed to the fallback, never retried with a different source. An install that cannot
be verified did not happen.

### Phase 2 — Chain resolution and validation (read-only)

Two sources, in this order:

| Source | When | Command |
|--------|------|---------|
| An explicit chain argument (bottom first) | the user or `/create-pr --stack` supplied one | — |
| The stack the extension already tracks | no argument | `git rev-parse --git-dir` (behind the prefix), then the Read tool on `<git-dir>/gh-stack` — the file the extension keeps, read directly (§ Tracked stack, below) |

Neither available → **STOP** and ask for an explicit chain. A branch does not record its intended
base, so guessing one is how the wrong base branch gets a PR.

Validation, all of it read-only, all of it fail-closed — and **every command in the two tables
below runs behind the Phase 0 prefix above**, for the reason given there: a chain validated in one
repository or one graph must not authorize a push in another. The rows name the commands, not their
prefix, so the prefix is not silently dropped when a row is edited:

| Check | Refusal |
|-------|---------|
| Every layer exists locally (`git rev-parse --verify --quiet 'refs/heads/<b>'`) | abort — a typo is not fixed by pushing |
| No layer is a protected branch — the fence below, once per layer. Exit 1 is the only "not protected" | abort — protected branches (the default set plus the project's `git-workflow-project.md` additions) are bases, never layers; an unknown answer aborts too |
| Linear ancestry between adjacent layers (`git merge-base --is-ancestor`) | abort — a stack is linear by definition; `is-ancestor` answers 0/1 and **anything else aborts**, so an unreadable graph never reads as "not an ancestor" |
| ≥ 2 layers | 1 layer → use `/create-pr`; 0 → error |
| `--link`: no branch operand parses as an integer (`^[+]?[0-9]+$` — a leading `+` included, since `git check-ref-format` accepts `+400` and Go's `strconv.Atoi` reads it as `400`) | abort — `link` tries a numeric operand as a Stack number in first position and as a PR number everywhere **before** it tries it as a branch (`cmd/link.go` `detectAddMode`, `findExistingPR`), so branch `400` would retarget, mark ready and stack whatever PR #400 is. Rename the branch, or pass PR URLs. (`submit` and `push` take no operands, so a numeric layer name is no hazard there) |
| The bottom layer's base | `--base '<trunk>'` when given — it must exist as `refs/remotes/origin/<trunk>` and must not itself be a layer; **without it the extension uses the repository's default branch**, which is why a caller whose target branch is not the default must pass it. `/create-pr --stack` resolves it as `--base` → `{TARGET_BRANCH}` → `main` and hands the resolved value over (§ Delegation) |

The protected-layer check, run once per layer with `<b>` written as one single-quoted word (an
apostrophe inside it written `'\''`). It is the same resolution block `/push-ci` and `/epic-merge`
carry, and it refuses on anything but exit 1:

```bash
layer='<b>'
# Protected-set resolution (git-autonomy R1): the default set plus the project's additions in
# git-workflow-project.md, answered by scripts/protected-branches.sh — 1 is the only "not
# protected"; 0 and 2 (unknown) both refuse. Without the resolver installed, an override file on
# disk means the answer is unknown; with none, the default set is the whole answer.
PB_ROOT=$(/usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT git rev-parse --show-toplevel) || PB_ROOT=
PB_SCRIPT="$PB_ROOT/.claude/scripts/protected-branches.sh"
[[ -r "$PB_SCRIPT" ]] || PB_SCRIPT="$PB_ROOT/scripts/protected-branches.sh"
if [[ -z "$PB_ROOT" ]]; then PB_STATUS=2
elif [[ -r "$PB_SCRIPT" ]]; then
  if /bin/bash -p -- "$PB_SCRIPT" --root "$PB_ROOT" -- "$layer"; then PB_STATUS=0; else PB_STATUS=$?; fi
elif [[ -e "$PB_ROOT/.claude/rules/git-workflow-project.md" || -L "$PB_ROOT/.claude/rules/git-workflow-project.md" \
   || -e "$PB_ROOT/rules/git-workflow-project.md" || -L "$PB_ROOT/rules/git-workflow-project.md" ]]; then PB_STATUS=2
else case "$layer" in main|master|develop|release/*) PB_STATUS=0 ;; *) PB_STATUS=1 ;; esac
fi
if [[ "$PB_STATUS" != 1 ]]; then
  echo "⛔ layer '$layer' is a protected branch (resolver status $PB_STATUS) — protected branches are bases, never layers" >&2
  SD0X_GH_STACK_REFUSED=
  : "${SD0X_GH_STACK_REFUSED:?refusing — a protected branch cannot be a stack layer}"
fi
echo "layer '$layer': not protected"
```

**Branch operands and PR operands validate through different sources, and the table above is the
branch column.** `--link` is the only form that accepts a PR number or PR URL (`gh stack link`
resolves and pushes through GitHub, so a PR operand has no local branch to check); every other form
is branches only, and a PR operand there is a parameter error.

| Operand | How it is validated |
|---------|---------------------|
| `<branch>` | the table above, in full |
| `<pr-number>` / PR URL | `gh pr view '<n>' --json number,state,headRefName,baseRefName,url` — the PR must exist and be **OPEN**, its `url` must name **this** repository (`gh repo view --json nameWithOwner`), its `headRefName` must not be a protected branch — checked by the protected-layer fence above with `layer` bound to that `headRefName`, so statuses 0 and 2 refuse exactly as they do for a branch operand, and adjacency is read over the chain's own fields: layer *n+1*'s `baseRefName` must equal layer *n*'s `headRefName`. **The executed line renders the operand as that `url`, never as the number**: `link` pushes every operand that names a local branch *before* it resolves PR numbers (`cmd/link.go` `pushBranchArgs`), so a local branch that happens to be called `400` would be published under an approval that named PR #400 — while a URL is always resolved as a PR and never as a branch. A head ref absent locally is therefore not a refusal: nothing local is pushed for a PR operand |
| any chain (`--link`, `--submit`) | one extra read per layer, **before** Phase 3 — `gh pr list --head '<b>' --state open --json number,url,isDraft,baseRefName,autoMergeRequest --limit 100` — because the approval must enumerate every change the subcommand makes to a PR that **already exists** (§ Force form, the mutation table): a base it retargets, auto-merge it disables (`submit`; `link` refuses such a PR instead), a draft it marks ready (`--open`). Nothing else in this skill reads that state |
| `--submit`: a pending `gh stack modify` | `<git-dir>/gh-stack-modify-state` exists → **STOP**. `submit` resolves it before pushing, and without a terminal it does so by unstacking the Stack that file records — any Stack, not necessarily this one (`cmd/submit.go` `handlePendingModify`, `internal/modify/state.go`). The user finishes or abandons the modify; checked again immediately before execution |
| a chain **mixing** the two | **refused in v1** — the extension itself accepts a mixed chain, but half the adjacency would come from git and half from the API, and a half-resolved chain is not a validated one. Give one form or the other |
| Shell safety | every branch is single-quote rendered (`'` → `'\''`) and `--` terminates options wherever the CLI accepts it — `git check-ref-format` admits `;`, `$( )` and quotes in branch names (@skills/create-pr/SKILL.md § Command Rendering) |

**Tracked stack.** The file is JSON — `schemaVersion`, `repository`, and `stacks[]`, each with a
`trunk` and an ordered `branches[]` of `{branch, pullRequest{number, merged}}`, bottom first
(`internal/stack/stack.go`, v0.1.1). Reading it with the Read tool writes nothing, which is the whole
reason not to ask the extension. **The file gives the topology, not the chain that will move**: the
table selects the stack, and which of its layers then move is the extension's own run-time decision
(below):

| Reading | Disposition |
|---------|-------------|
| No file | no tracked stack → the explicit-chain requirement above |
| Unreadable, not JSON, or `schemaVersion` greater than `1` | **STOP** and report — a file this skill cannot parse is not an empty one |
| The current branch is the trunk or a layer of **no** stack | no tracked stack → the explicit-chain requirement |
| … of **more than one** stack | **STOP** — the extension refuses the same case with exit 6; the user checks out a layer that belongs to one stack |
| … of exactly one | its `branches[]` in file order, bottom first, and its `trunk.branch` — the topology. Then the upper-bound rule below |

**The tracked stack is an upper bound, not a prediction.** Before it pushes, the extension refreshes
every layer's PR — including discovering PRs by head branch that the file never recorded — and skips
the layers whose PR is merged or queued; queued is never written to the file (`cmd/utils.go`
`syncStackPRs`, `internal/stack/stack.go` `ActiveBranches`, `ActiveBaseBranch`). This skill does
not re-implement that selection: every earlier attempt to mirror it here missed a branch of it. What
holds without mirroring anything is the direction of the difference — the extension pushes only
branches of the stack it resolved from the file, so it can push **fewer** than the file lists and
**never others**. So:

- the approval — and, for the forcing subcommands, the unshared attestation — names **every layer
  of the selected stack**, and says in so many words that the extension skips merged and queued
  layers at run time and bases each remaining layer on the nearest remaining layer below it;
- **immediately before execution the file is read again**; a different stack, or different layers,
  is re-approved, never adjusted into the approved one — that is the one way the set could grow;
- Phase 4 reports, per layer, what the command actually pushed.

The file is **local and can be stale** — it says what the extension will act on, not what GitHub
holds. What GitHub holds is Phase 4's question, asked of GitHub.

**Stacks availability** (`--link` and `--submit`, the two that create or update a Stack). One more
read, behind the prefix, after the chain is validated:

```bash
gh api 'repos/{owner}/{repo}/stacks?per_page=1'
```

HTTP 200 → continue. `404` → **STOP**, reported as *native unavailable*: Stacks is not enabled for
this repository or not visible to this token, and GitHub does not say which — either way the native
path cannot run, and nothing has been mutated yet, which is what makes the caller's fallback safe
here and only here. Any other failure → **STOP**. `link` makes this same call as its own first step
(`listStacksSafe`), so the probe asks nothing the extension would not; it only moves the answer to
before the approval instead of after the push.

### Phase 3 — Approval and execution

**For `--push` and `--submit`, two questions, in this order, and the first one is not a formality.
For `--link`, the second one alone** — its push carries no force (§ Force form), so there is no
rewrite to attest; the approval says so in those words rather than leaving the question out silently.

1. **Unshared attestation** (`--push`, `--submit`) — name the branches this invocation rewrites and
   ask whether anybody else is working on them. Anything other than the attestation ends the run.
   Approval of a force form is not evidence about who else holds a branch, and neither is the
   lease (§ Force form, consequence 2).
2. **Operation approval** — one AskUserQuestion carrying the exact command line, the branches
   bottom-to-top, **the bottom layer's base** (the resolved trunk, or the repository default when
   none was given — say which), the remote, **the push form of that subcommand** — plain
   `--atomic` for `link`, per-branch `--force-with-lease=refs/heads/<b>:<sha>` for `push` and
   `submit --auto` — **every change to an already-existing PR that Phase 2 read** (base retargets,
   auto-merge disabled, drafts marked ready), and for `--link` and `--submit` whether new
   PRs will be drafts (default) or ready for review (`--open`) — and, because `--open` marks new
   **and existing** PRs ready, the approval **enumerates every existing draft layer the flag would
   flip**. A draft somebody left deliberately is a state change of its own, not a side effect of
   the chain.

Then, and only then, the command — one invocation per approval, assembled from the approved values:

```bash
(
  set -- 0
  /usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT -u ALLOW_PUSH_PROTECTED -u ALLOW_FORCE_UNSHARED GIT_GRAFT_FILE=/dev/null GIT_NO_REPLACE_OBJECTS=1 \
    gh stack link --remote 'origin' --open -- 'feat/auth-schema' 'feat/auth-service' 'feat/auth-api' || set -- "$?"
  exit "$1"
)
```

The forcing form — here `--submit` with readiness approved — is the same block with
`ALLOW_FORCE_WITH_LEASE=1` added, because this is the push the lease approval covered:

```bash
(
  set -- 0
  /usr/bin/env -u BASH_ENV -u ENV -u GIT_EXEC_PATH -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE -u GIT_CEILING_DIRECTORIES -u GIT_GLOB_PATHSPECS -u GIT_ICASE_PATHSPECS -u GIT_NOGLOB_PATHSPECS -u GIT_LITERAL_PATHSPECS -u GIT_CONFIG -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_SHALLOW_FILE -u GIT_PREFIX -u GIT_REPLACE_REF_BASE -u GIT_EXTERNAL_DIFF -u GIT_SSH_COMMAND -u GIT_SSH -u GIT_PROXY_COMMAND -u GIT_SSH_VARIANT -u ALLOW_PUSH_PROTECTED -u ALLOW_FORCE_UNSHARED GIT_GRAFT_FILE=/dev/null GIT_NO_REPLACE_OBJECTS=1 ALLOW_FORCE_WITH_LEASE=1 \
    gh stack submit --auto --remote 'origin' --open || set -- "$?"
  exit "$1"
)
```

There is no variant of either line for another extension version: an unverified version never
reaches this block (§ Force form, consequence 3).

**The `GIT_*` portion of the `-u` list is `/push-ci` Phase 2's and `/epic-merge` Step 5's verbatim;
the two bypass variables are unset here rather than emptied as those two do (equivalent — the gate
tests `!= "1"`), and the destination binding they add (`SD0X_PUSH_DEST_DIGEST`,
`--receive-pack=git-receive-pack`) is not available through the extension, which issues the push
itself. The reason the list is that long is measured** (`docs/features/push-gate-optin/4-implementation.md` § 4.3): the config
channel is the one that removes the gate outright — an inherited `GIT_CONFIG_COUNT=1`
`GIT_CONFIG_KEY_0=core.hooksPath` `GIT_CONFIG_VALUE_0=/dev/null` deletes the `pre-push` hook this
skill's whole push-safety model defers to — while `GIT_GRAFT_FILE` and `GIT_NO_REPLACE_OBJECTS` make
the gate's own ancestry test answer the wrong question, which is why those two are **set** to
neutral values rather than unset. The hook cannot close any of them; only the caller can. Phase 0's
refusal covers the interpreter and the transport; this list covers the rest, and the two are not
substitutes. The four transport names appear in both — the `-u` list is `/push-ci` Phase 2's
verbatim, so the overlap is inherited rather than a second policy, and a run that reached here has
already been refused if any of them was set. The shape is `/create-pr` § Command Rendering's guarded block with this skill's single operation and
no cleanup operand: a bare invocation is unguarded, so a caller's `errexit` exits at the failing
`gh` before the status is ever reported. The `env` prefix is written **literally**, never through a
variable — zsh does not word-split an expansion used as a command prefix, so a variable holding the
prefix becomes one nonexistent command name.

**The remote is always on the line: `--remote 'origin'`**, the remote every Phase 2 check read
(`refs/remotes/origin/…`). Left out, the extension picks one itself — `branch.<name>.pushRemote`,
then `remote.pushDefault`, then `branch.<name>.remote`, then its own saved preference
(`internal/git/gitops.go` `ResolveRemote`) — which need not be the remote the chain was validated
on, and the lease values would come from that other remote's tracking refs. All three subcommands
accept the flag.

**The executed line renders exactly what the approval named — every operand and every flag.** Above
is the `--link` form for a three-layer chain with readiness approved: the layers bottom-to-top,
single-quote rendered per `/create-pr` § Command Rendering, after `--`, and `--open` present only
because the approval carried it (omit it and the new PRs are drafts). `--base '<trunk>'` is rendered whenever a base was
supplied — by the user or by a delegating caller — and its absence means the extension will use the
repository default, which the approval above has to have said out loud. The other two forms use the same block
with `gh stack submit --auto [--open]` — **no operands, by the extension's own contract** — and
`gh stack push`, both carrying `ALLOW_FORCE_WITH_LEASE=1`; `link` never does. A rendered line that carries fewer branches than the approval named, or drops an
approved `--open`, is approval/execution divergence on a force path: re-approve, do not adjust the
line.

**Partial success is a real outcome.** `gh stack push` is not atomic: branches whose leases pass
may update even when another is rejected. Report per branch, fix the rejected one, and re-run —
never widen the force form to get past a rejected lease. `link` pushes atomically, but its push is
only its first step: a non-zero exit after it — `4` from the API, `9` when the repository has no
Stacks — can come **after** branches were pushed and PRs created, with no Stack joining them
(`cmd/link.go` `createLink`).

Exit statuses of the executed subcommand are read as states, not as noise (`cmd/utils.go`, v0.1.1),
and **every one of them, zero or not, goes on to Phase 4** — only Phase 4 can say what exists
afterwards:

| Exit | Meaning | Disposition |
|------|---------|-------------|
| 0 | success | Phase 4 verifies |
| 1 | error already printed — for `link`, a rejected push among them | report verbatim; Phase 4 |
| 2 | not in a stack | should be unreachable after Phase 2 — report as a stale tracking file; Phase 4 |
| 3 | rebase conflict | report; the user resolves it |
| 4 | GitHub API failure — **never "no stack"** | report; Phase 4 establishes what the failure left behind |
| 5 | invalid arguments | a rendering defect in this skill — report it as one |
| 6 | multiple stacks, cannot auto-select | report |
| 7 | rebase in progress | report; the user finishes or aborts it |
| 8 | stack file locked by another process | report; another `gh stack` is running |
| 9 | Stacks not available for this repository | should be unreachable after Phase 2's availability probe — report; Phase 4 establishes whether PRs were created |

### Phase 4 — Verify and report

1. **Stack verification — asked of GitHub, bound to this chain's PRs, never through `gh stack view`.**
   `view` reads the *local* file for the *current* branch, and `link` writes no local tracking, so
   a freshly linked chain reads as "not in a stack" there while a different tracked stack reads as
   found. Two reads, behind the Phase 0 prefix:

   - **Each layer's PRs, in every state** — the numbers the command printed, the numbers the
     tracking file records, and `gh pr list --head '<b>' --state all --json number --limit 100`.
     Closed and merged PRs are included on purpose: a Stack keeps them as members (the extension's
     own decoder carries a merged member), so an open-only lookup would report a Stack whose layers
     have all merged as absent. A query that fails leaves that layer unknown.
   - **For each layer that has one**, the endpoint the extension itself uses
     (`internal/github/github.go`, v0.1.1):

   ```bash
   gh api 'repos/{owner}/{repo}/stacks?pull_request=<n>'
   ```

   `{owner}`/`{repo}` are `gh api`'s own placeholders, filled from the current repository — the one
   Phase 0's transport refusal pinned. The response is a list of stacks, each with a `number` and
   an ordered `pull_requests` array, bottom first, of `{number, draft, state, head: {ref}}`. Three
   outcomes, and only three — and each one is **about the Stack, not about the command**:

   | Outcome | Condition | What it establishes |
   |---------|-----------|---------------------|
   | **confirmed** | every read succeeded with HTTP 200, the non-empty answers all name one and the same stack, and the chain's PRs appear in it as one contiguous run in the approved order with each `head.ref` equal to the approved layer | a Stack holds this chain. PRs outside the run are listed in the report as members the approval did not name (`link` extends a stack a layer already belonged to, and never removes a member) |
   | **confirmed absent** | every read succeeded, and either **no layer has any PR, in any state** — a Stack is made of PRs, so none can hold this chain — or every per-PR answer is HTTP 200 with an empty list. **Not** after `link` exited `0`: it reports success only once the Stack exists, so an empty answer then is the contradiction in the row below | no Stack holds this chain |
   | **unverifiable** | any read failed — **a `404` included** — more than one stack, a run that differs from the approved chain, or `link` exit `0` with nothing found | nothing. Report what came back, verbatim |

   **A `404` is never an absence here.** GitHub answers `404` for a resource the token cannot see as
   well as for a feature that is not enabled, and the extension turns every `404` from this API
   into exit `9` without telling the two apart (`listStacksSafe`, `createLink`). Whether Stacks is
   available is therefore settled **before** anything runs (Phase 2), where a refusal costs
   nothing; after execution a `404` is only a failed read.

   **Then read every approved PR change back** — `gh pr view '<n>' --json isDraft,baseRefName,autoMergeRequest`
   for each PR the approval named a change to, and each PR the run created — because the extension
   only warns when a base retarget, an auto-merge change or a ready-marking fails, and exits `0`
   regardless (§ Force form, the mutation table).

   **Read the exit, the outcome and the read-back together** — a Stack that exists says nothing
   about whether this command did what was approved (a `link` whose atomic push was rejected leaves
   an earlier Stack intact and untouched):

   | Exit | Outcome | Result |
   |------|---------|--------|
   | `0` | `confirmed`, every read-back as approved | **native success** |
   | `0` | `confirmed`, a read-back differs from the approval | **partial** — the Stack holds the chain but an approved PR change did not land; report it per PR. No fallback |
   | `0` | `confirmed absent` | `--push`: pushed, and nothing on GitHub stacks these branches yet — say so. `submit`: **published without a Stack** — its Stack sync is best-effort and its exit does not check it (`cmd/submit.go` `runSubmit` / `syncStack`), so branches and PRs can land while the Stack does not; report it as incomplete, not as success. `link` returns an error whenever the Stack step fails, so for `link` this pairing is `unverifiable` (above) |
   | non-zero | `confirmed` | **failed against an existing Stack** — report the command's failure per layer; the Stack is not evidence the approved change landed. No fallback |
   | non-zero | `confirmed absent` | **no Stack** — for a delegated run, the one executed outcome a fallback may follow (the caller re-queries its PRs first: `link` pushes and creates PRs before it creates the Stack) |
   | any | `unverifiable` | **stop** — report and reconcile; no fallback |

   **Only `confirmed absent` is a fact about absence**, and `unverifiable` is never read as one: a
   caller that falls back on top of a Stack that does exist mutates every layer twice. A read-only
   run has nothing to verify — `—` in the report. The response shape is read from the extension's
   own decoder and has not been measured against a live repository; a response that does not have
   it is `unverifiable`, never `confirmed absent`.
2. **Attribution verify (Anchor, CLAUDE.md rule 3).** `--auto` generates PR titles and bodies from
   commit messages, so this skill did not author them and cannot vouch for them. Run
   `/create-pr` § 7b's verification cycle over **every PR the invocation created or updated**
   (`skills/create-pr/scripts/sanitize-pr-content.sh`, canonical patterns:
   `scripts/commit-msg-guard.sh`).

   **The remediation input has to be built here, and § 7b does not supply it.** That cycle
   remediates from `/create-pr` Step 4b's pre-sanitized snapshot; this flow has none, because
   `--auto` authored the text. So on a leak, for that PR, in this order — **the order is the
   contract, because the last step is what removes the directory the earlier ones write into**:

   | # | Step | Why here |
   |---|------|----------|
   | 1 | Allocate once, through `/create-pr` § 7b **Step 3a**'s fence (this skill defines no allocator of its own; the verification cycle's own directory is already torn down at V4) | Everything below needs a directory that exists, and § Command Rendering forbids inventing a path |
   | 2 | Capture **both halves separately** into it: `gh pr view '<n>' --json title --jq '.title'` → `pr-title.txt`, `gh pr view '<n>' --json body --jq '.body'` → `pr-body.md` | § 7b's V3 runs `scan` over a title+body *concatenation* and exits 4 for a hit anywhere in it, so it never says which half leaked. Never reuse that concatenation as a body — republished, it would put the title inside the body |
   | 3 | Run `title` mode over `pr-title.txt` (exit 3 = the title leaked) and `body-inplace` over `pr-body.md` | `title` is detection-only and never rewrites; `body-inplace` rewrites atomically |
   | 4 | If the title leaked: write a compliant replacement and publish it with `gh pr edit '<n>' --title '<new title>'` in its own guarded block | `gh pr edit` takes a title *string*, not a file — so this step needs no cleanup operand, and it runs **before** step 5 removes the directory |
   | 5 | Publish the body with `gh pr edit '<n>' --body-file '<dir>/pr-body.md'` inside the canonical guarded block (`/create-pr` § Command Rendering), whose cleanup operand is the **directory** | One teardown covers both captured files, on the success path and the failure path alike |
   | 6 | Re-run the verification cycle | Fixing is not verifying |

   One remediation attempt per PR; a second leak is reported as `⛔ leak`, not re-fixed. If step 4
   cannot produce a compliant title, the PR is reported as a leak rather than as remediated.

3. Stack status table:

| Column | Value |
|--------|-------|
| `#` | layer position, 1 = bottom |
| `Head` / `Base` | the layer and the layer below it (trunk for layer 1) |
| `PR` | `#<number>` once known, `—` otherwise |
| `Draft` | `yes` / `no` — **read back after execution** from step 1's per-PR read-back. Never derived from the flag, and never from Phase 2's pre-execution read, which only describes what the run was about to change |
| `Changed` | each approved change to an existing PR — base, auto-merge, readiness — with its read-back: `✓` landed, `✗` did not |
| `State` | `pushed` / `created` / `updated` / `unchanged` / `failed` / `pending` |
| `Stack` | the step 1 outcome — `confirmed #<number>` / `confirmed absent` / `unverifiable` / `—` |
| `Attribution` | `clean` / `remediated` / `⛔ leak` |

CI afterwards: `/watch-ci`. Merging the chain: `/epic-merge`, or the GitHub stack UI.

## Delegation

`/create-pr --stack` calls this skill for the native path after its own Phase D detection, **passing
the chain it validated and the base it resolved — in both modes**, since a preview reporting a
different base from the one the approved run will use would be describing another chain (`--base` → `{TARGET_BRANCH}` → `main`) — a
delegation that dropped the base would chain layer 1 onto the repository default instead of the
branch Phases A/B validated against. The call is not an approval: Phase 1 and Phase 3 run here exactly as they would for a direct
invocation. It hands control back in four classes, and the caller has a route for each: `absent` (extension
missing, install declined, install failed, or detection unreadable); a **Phase 2 STOP** (a chain it
cannot validate — a layer with no local branch, a protected layer, non-linear ancestry, or a
tracking file it cannot parse or that names more than one stack, or Stacks unavailable to the
availability probe), where nothing was mutated; an
**executed** command, whatever its exit, reported with the per-layer outcome **and the Phase 4
verification outcome**; and nothing else. In the first two the caller falls back to its hand-built
chained-base Multi-PR mode, which produces chained bases but **no GitHub Stack object**: no
per-layer diff view and no linked merges. Say which of the two happened; the two results are not
equivalent. After an executed command the exit and the verification outcome decide together
(Phase 4, step 1): exit `0` with `confirmed` and every approved PR change read back is native
success; the same with a read-back that differs is **partial**, and a non-zero exit with
`confirmed` is a failure against an existing Stack — neither is followed by a fallback; `confirmed absent` is the one
executed outcome a fallback may follow; `unverifiable` is a stop — the caller reports and does not
fall back.

## Prohibited Actions

```
❌ Executing any `gh stack` subcommand outside the three granted ones — `gh stack view` included, which writes `.git/gh-stack`
❌ Running `gh stack submit` without `--auto` (interactive TUI — hangs the agent mid-approval)
❌ Installing the extension without the Phase 1 approval, or from any slug but `github/gh-stack`
❌ Setting `ALLOW_PUSH_PROTECTED` or `ALLOW_FORCE_UNSHARED`, or leaving an inherited one in place
❌ Setting `ALLOW_FORCE_WITH_LEASE` anywhere but the single approved `push` / `submit --auto` line — never on `link`, which does not force
❌ Treating a delegating skill's call, a cached approval, or an earlier turn as the per-use approval
❌ Treating `PUSH_GATE=referenced` as proof a terminal prompt will appear
❌ Reading a detection failure, an unparseable tracking file, or exit 4, 6, 7, 8 or 9 as "no stack" and continuing
❌ Printing `gh auth status` output (host and token scopes) into the report
❌ Reporting a stack as created without the Stacks API confirming this chain, or reading `unverifiable` as `confirmed absent`
❌ Reporting native success from `confirmed` alone — a non-zero exit against an existing Stack is a failure, and an exit `0` whose PR read-back differs from the approval is partial
❌ Rendering a PR operand as a bare number — `link` pushes any operand that names a local branch before it resolves PRs
❌ Running a mutating subcommand on an extension version other than the one § Force form was read from
❌ Presenting the tracked stack's layers as exactly what will move — they are the upper bound; the extension skips merged and queued layers at run time
❌ Reading a `404` from the Stacks API as an absence — before execution it stops the run, after it is a failed read
❌ Taking `GH_DEBUG` output as evidence of the push form
```

## Verification

- [ ] Phase 0 matched the extension by `github/gh-stack` identity, not a substring
- [ ] Install happened only after its own AskUserQuestion, and was verified by re-listing
- [ ] Chain validated: every layer exists, none is protected, adjacent ancestry linear, ≥ 2 layers
- [ ] For `push` / `submit --auto`: unshared attestation asked **by name** before the force approval, and honoured
- [ ] Per-use approval named the exact command, the branches, and that subcommand's push form
- [ ] `ALLOW_PUSH_PROTECTED` / `ALLOW_FORCE_UNSHARED` cleared on the executed command line
- [ ] Only `gh stack link` / `push` / `submit --auto` executed; everything else printed
- [ ] Every created or updated PR passed the § 7b attribution verify
- [ ] Report states the verification outcome — `confirmed` / `confirmed absent` / `unverifiable` — and the per-branch outcome
- [ ] `GH_STACK_VERSION` recorded; on anything but `v0.1.1`, no mutating run reached Phase 3
- [ ] The approval named every change to an existing PR (base, auto-merge, readiness), and Phase 4 read each one back
- [ ] PR operands rendered as this repository's PR URLs, never as bare numbers
- [ ] `--submit` refused while `<git-dir>/gh-stack-modify-state` existed

## Examples

```
Input: /gh-stack
Action: detect → (installed) → resolve the active stack from `.git/gh-stack` → report only

Input: /gh-stack --link --open feat/auth-schema feat/auth-service feat/auth-api
Action: detect → install offer if absent → validate the 3-layer chain → read each layer's existing
        PR draft state → approval naming `gh stack link --open`, the three branches and the push
        form (plain `--atomic`, no force — so no attestation) → execute → verify the Stack via
        the Stacks API → verify PRs → report

Input: /gh-stack --submit
Action: the extension already tracks a stack locally → Phase 2 reads its layers back from
        `.git/gh-stack` → attestation → approval naming those layers and the lease form →
        `gh stack submit --auto`, no operands. A chain given as arguments never routes here (§ Input)

Input: /gh-stack --link 400 401
Action: detect → PR-number chain needs no local branches → each number resolved to this
        repository's PR URL → approval → `gh stack link '<url-400>' '<url-401>'` — URLs, so a
        local branch that happens to be named `400` is never pushed

Input: /create-pr --stack (native path available)
Action: create-pr Phase D delegates here; this skill runs its own Phase 1 and Phase 3 gates
```
