---
name: deploy-flow
description: "Run the release flow a project declares in rules/git-workflow-project.md § Deploy Workflow: its git merge steps, and — only where § Run Steps is execute — its scripts, each after its own approval. Use when: the user asks to release, deploy, promote a branch, or run the project's deploy workflow. Not for: pushing (use /push-ci), committing (use /smart-commit), stacked PRs (use /epic-merge or /gh-stack)."
allowed-tools: Bash(/bin/bash:*), Bash(git:*), Read, Grep, Glob, AskUserQuestion
---

# Deploy Flow

**Read first**: `@skills/push-ci/references/authorization-contract.md` before executing a declared merge or run step — § Efficacy Boundary for what the per-step approval authorizes, § Push safety for any step that pushes. If that Read fails, stop and report it; execute no step.


Run the steps a project declares for its own release — nothing it does not declare, and nothing
without a per-step approval.

## Authorization

```
⚠️ This skill is the Anchor Register #4 workflow for a project's declared deploy steps. It may run
⚠️ git switch + git merge for a declared merge step, and — only where the project sets
⚠️ Run Steps: execute — a declared script, each after an AskUserQuestion approval naming that step.
⚠️ It never runs git push. A declared script may push on its own; that is the run-script risk
⚠️ below, which the project opted into and every execute question states.
⚠️ An approval covers the one step it names, at the values it names — both OIDs for a merge, the
⚠️ HEAD commit and the script's blob hash for a run; nothing else.
```

## Trigger

- Keywords: deploy, release, promote, deploy workflow, run the release flow, 部署, 發佈

## When NOT to Use

| Scenario | Use instead |
|----------|-------------|
| Push a branch | `/push-ci` |
| Commit changes | `/smart-commit --execute` |
| Merge a stacked PR chain | `/epic-merge`, `/gh-stack` |
| The project declares no `## Deploy Workflow` | Say so, and offer to scaffold one with `/install-rules --customize git-workflow` |

## The executable half

Every git call and every script run goes through one checked-in script, so what a step's approval
names is exactly what runs.

**Pin the helper once, before any step.** A merge switches branches, and the branch it switches to
may track its own copy of the helper; re-locating it for the next step would run that copy before
the next approval. So Phase 0 resolves the helper a single time and copies it to a private file,
and **every later fence runs that copy by its literal path**: each fence is its own shell, so
nothing carries over except the path you paste.

```bash
REPO_ROOT=$(git rev-parse --show-toplevel) || exit 1
SRC="$REPO_ROOT/.claude/scripts/deploy-flow.sh"
[ -r "$SRC" ] || SRC="$REPO_ROOT/skills/deploy-flow/scripts/deploy-flow.sh"
[ -r "$SRC" ] || SRC="${CLAUDE_PLUGIN_ROOT:-/nonexistent}/skills/deploy-flow/scripts/deploy-flow.sh"
[ -r "$SRC" ] || { echo "deploy-flow.sh not found — run /install-scripts --skill deploy-flow" >&2; exit 1; }
DF=$(mktemp "${TMPDIR:-/tmp}/deploy-flow.XXXXXX") && cat -- "$SRC" > "$DF" && echo "DF=$DF"
/bin/bash -p -- "$DF" clean --root "$REPO_ROOT" && /bin/bash -p -- "$DF" parse --root "$REPO_ROOT"
```

Every later call is `/bin/bash -p -- '<the DF path printed above>' <subcommand> --root '<repo root>' …`
— never the locator again. Remove the copy when the flow ends, whatever its outcome.

| Subcommand | Does | Exit |
|------------|------|------|
| `parse` | Prints the declared steps (`merge⇥src⇥tgt⇥form`, `run⇥path⇥args…`), then `mode⇥print\|execute` | 2 on any parse error — the whole block is ignored |
| `candidates <prefix>/*` | Local branches a pattern may bind to | 2 on a bad pattern |
| `resolve <branch>` | The branch's current OID | 3 when absent |
| `merge <src> <tgt> <src-oid> <tgt-oid> <form>` | Refuses an undeclared step or a dirty tree (untracked files included); re-checks both OIDs; switches to `<tgt>`; merges the approved **object** | 3 refused · 4 attribution guard · 5 conflict (aborted) · 6 read-back mismatch |
| `run-plan <path> [args…]` | For a declared step on a clean worktree, prints `head⇥<oid>` and `blob⇥<hash>` — the values its approval names | 3 undeclared or dirty tree |
| `run --expect-head <oid> --expect-blob <hash> <path> [args…]` | Runs a declared step, only under `execute`, only on a clean worktree at the approved `HEAD` and script content, arguments as separate argv entries | 3 undeclared, `print` mode, dirty tree, or `HEAD`/script changed; otherwise the script's own |
| `clean` | Checks the whole worktree, untracked files included | 3 when anything is uncommitted |

## Workflow

### Phase 0: Read the declaration

Run `clean`, then `parse`. A dirty worktree → say so and stop: every step is approved against the
committed tree. Exit 2 from `parse` → report the error line and stop: a malformed block is never
partly run. No steps → say the project declares none and stop. Otherwise show the steps and the `Run Steps` mode.

### Phase 1: Each step, in declaration order

Steps run one at a time in the order `parse` printed them — a `run` declared before a `merge` runs
before it. Before each step, run `parse` again: output that differs from Phase 0's means the
declaration changed under the flow (a merge brought a different override), and the flow stops. Any step that is refused, declined, or ends with a nonzero exit stops the flow: report
which step and its exit status, and run nothing after it.

#### A `merge` step

1. **Bind a pattern by the user's pick.** A `<prefix>/*` source or target lists `candidates`; the
   user picks one from an AskUserQuestion (options, never typed). No candidate → the step is refused;
   a branch is never created.
2. **Resolve** both concrete branches to OIDs with `resolve`.
3. **Ask**: one AskUserQuestion naming the step, source, target, form and both full OIDs. Only
   "Merge" proceeds.
4. **Run** `merge <src> <tgt> <src-oid> <tgt-oid> <form>`:
   - `--no-ff` (default): the message is the fixed template `Merge branch '<src>' into <tgt>`, never
     model-authored. `commit-msg-guard.sh` checks it before the merge and checks the recorded
     commit after it, read back with replace refs and grafts disabled, and the parents are asserted
     to be exactly `<tgt-oid> <src-oid>`. `--no-edit` and `GIT_MERGE_AUTOEDIT=no` keep an editor out.
   - `--ff-only`: creates no commit, so there is no message to check. It verifies the new `HEAD` is
     `<src-oid>` and `<tgt-oid>` is its ancestor.
5. **Report** the outcome by exit status. Exit 4 names the OID and stops the flow: nothing is
   amended — that is the developer's call. Exit 5: the merge was aborted, nothing merged.

#### A `run` step

- **`Run Steps: print`** (default): print the exact command for the user. Nothing runs.
- **`Run Steps: execute`**: run `run-plan <path> [args…]` first; it prints the `HEAD` commit and the
  script's blob hash. Then one AskUserQuestion naming the exact command, both values, and stating
  the **run-script risk** verbatim:

  > The script runs with your credentials and can commit, push, merge, publish or deploy. It
  > bypasses the harness's own checks — `/smart-commit`'s guaranteed attribution check and
  > `/push-ci`'s approval and protected pre-approval. Git hooks still run for its ordinary
  > `git commit` and `git push` where they are installed (`commit-msg-guard.sh`,
  > `pre-push-gate.sh`), but the script can skip hooks (e.g. `--no-verify`) or run where none is
  > installed, and the harness cannot tell which.

  Only "Run" proceeds to `run --expect-head <oid> --expect-blob <hash> <path> [args…]` with the
  values the question named; the script refuses with exit 3 and runs nothing if `HEAD` or the script
  changed after approval.

### Phase 2: After the flow

This skill issues no push and offers none itself. What follows is `rules/git-workflow.md`
§ Proactive Offer: the menu appears only when `review-state.js offer` returns true. A protected
target gets no push menu; `/push-ci`, on request, still meets its protected pre-approval.

## Prohibited

- Running any step the declaration does not contain, or any step without its own approval
- Merging by branch name after approving OIDs — the script merges the approved object
- Authoring or editing the merge message, amending a merge commit, or passing `--ai-co-author`
- Running `git push`, or offering to
- Running a `run` step under `Run Steps: print`, or passing a step's arguments through a shell string
- Printing a deploy command for the user to copy when they asked to run the flow — ask, then run

## Verification

- [ ] Every executed step had its own AskUserQuestion approval naming it
- [ ] Every merge commit passed `commit-msg-guard.sh` on its recorded message
- [ ] No `git push` executed by this skill
