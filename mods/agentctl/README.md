# agentctl — Agent Control Plane for one Claude Code session

Tested with **Claude Code 2.1.288** (headless) and **2.1.289** (interactive, after the host auto-updated) (`claude plugin validate .`, `claude plugin test .`: 194 tests); 0.2.x re-verified live on 2.1.289 (§ Verified live, 0.2.x).
The mods API is marked changeable between releases; the type declarations the host writes into
`.claude-plugin/types/` are the authority for the installed version. Run `claude plugin validate .`
after every Claude Code upgrade.

Design: `docs/features/agent-control-plane-mod/` in this repository (requirements, feasibility study,
tech spec, request tickets). This directory is not part of the sd0x-dev-flow plugin: installing the
plugin does not install the mod. To install it, run `/agentctl-setup` (it checks the host, installs
`agentctl@sd0xdev-marketplace` after you approve, and builds your first task line; `/agentctl-setup --task`
and the workflow skills draft a proposal for you to accept instead), or load it for one
session with `claude --plugin-dir mods/agentctl`.

## First run

Type what you are doing — you do not need any other command:

```text
/agentctl 測試一下這個新功能
```

1. The mod puts a request for Claude in your prompt box (it never sends it). Press **Enter**.
2. Claude reads the project and drafts a scope — what it may edit, which checks count as evidence,
   what "done" means — and writes it with the helper bundled in the mod (`bin/propose.mjs`). If
   something is unclear it asks you instead of inventing permissions.
3. At the end of that reply the mod shows the scope and offers `/agentctl accept <digest>` in the box:
   **Tab**, then **Enter**. Accepting binds the scope; it starts no work.
4. Ask Claude to begin. `/agentctl` shows where things stand and what to do next; `/agentctl help` lists
   the rest.

**First-run UX not yet verified by an uncoached user.** The flow above was walked end to end in a
scripted interactive session (§ Verified live, 0.3.0); nobody who has not read the design has tried it.

Sending the request is an ordinary Claude turn; the mod itself calls no model. Replies use Traditional
Chinese when your goal is written in Chinese, English otherwise — a simple heuristic, not locale
detection.

## What it does

| Function | How |
|---|---|
| Task scope | Claude drafts a proposal (`/agentctl-setup --task`, or `/feature-dev`, `/bug-fix`, `/refactor` when the mod is installed); the mod previews it and `/agentctl accept` typed at your own prompt binds exactly what was previewed — see § Proposals. `/agentctl task set <json>` typed at your prompt also binds a task to the worktree. Tool output, files and messages cannot change it — only a command you type. The binding is per worktree, so your own `task set` / `task clear` in another session on the same worktree does replace or clear it. Task records and hand-overs are kept per worktree, so the same task id in two worktrees names two separate tasks. A store error is reported as such, and the previous task keeps applying; a binding whose record is missing refuses everything but reads in the worktree |
| Refusal | A deny-list. Recognized direct production writes and remote git writes are refused **with or without a task**; while a task is bound, its own `forbid` entries and edits outside its roots are refused too. Everything the mod cannot classify — scripts, compound shell, unknown tools — goes to Claude Code's own permission prompt or auto mode, recorded as `delegated`. A downstream deny is never weakened and an allow is never created. **Best-effort**: the mod reads each tool call, never a script's contents or the commands it starts, so a push inside a script is the host's and that workflow's to authorize |
| Evidence | A Bash call authorized by a `check` executor is bracketed by Git-derived tree readings (executors are matched first, so a declared `git status` check is a check); a later edit shows the result stale within 30 s; a background check stays "completion unobserved" until a terminal result is seen. Evidence belongs to the task and policy version it was observed under, and a reading with partial coverage is never listed as verified |
| Panel | The band above the prompt is compact: task, runtime and its duration, what needs you, the gate reading with its age (and `stale` past 30 s), the last hand-over time. `/agentctl` is the detailed text: it adds context, the 5 h window and evidence; the gate, context and window lines name their source and age, or read `missing` / `unavailable`, and each evidence line its outcome, freshness, coverage and age |
| Hand-over | `/agentctl handoff` — eight answers from records, no model, no network, no process; logged in full on reopen (transcript only); bare `/agentctl` only points at it, `/agentctl last` prints it |
| Stop | `/agentctl stop` — saves the hand-over, requests cancellation of the current turn, lists tracked operations; never "all stopped" |

## Proposals

Claude writes `~/.claude/agentctl/proposals/<URI-encoded worktree>.json` (outside the worktree) through
the mod's bundled `bin/propose.mjs` (the `/agentctl <goal>` path) or sd0x-dev-flow's
`agentctl-setup.js propose` (setup and workflow skills); both apply the mod's own validation first. At session start and at the
end of each main turn the mod reads it once, validates it again, and keeps the **effective** object:
the worktree comes from the session, a proposal naming another worktree, drafted against a task that
is no longer bound, or overlapping a built-in class is refused (the reason is logged). The preview
lists every permission being accepted with a SHA-256 digest (24 hex) in the transcript and the band.

| Command | Who | Does |
|---|---|---|
| `/agentctl proposal` | anyone | Prints the waiting preview |
| `/agentctl accept [digest prefix]` | **your prompt only** | Binds the retained object — never the file re-read — if the bound task has not changed since the preview |
| `/agentctl discard` | anyone | Drops the waiting proposal; the bound task stays |

Changing the file later produces a new preview and digest; an older digest no longer matches.
Concurrent sessions on one worktree share one binding and one store, which is not atomic across
sessions: accept in the session that showed the preview.

## Task JSON

```json
{
  "goal": "investigate the quiz service timeout",
  "allow": ["edit"],
  "editRoots": ["src", "tests"],
  "forbid": ["terraform apply"],
  "executors": [{ "argv": ["npm", "test"], "check": true }],
  "needsUser": [["npm", "publish"]],
  "tools": ["mcp__docs__search"],
  "acceptance": ["unit tests pass on the final tree"]
}
```

Built-in forbidden classes apply with or without a task, on top of a task's own: production writes (`kubectl apply|delete|patch|rollout|scale|edit|replace`,
`helm install|upgrade|uninstall|rollback`, `gcloud … deploy|delete|update`) and remote git writes
(`git push`, `gh pr merge`). Secrets never belong in a task: a credential-like value in a policy field
is refused.

`needsUser` asks only where a person was seen answering: the interactive terminal under the
`default` (manual), `acceptEdits` and `auto` permission modes (`lib/verdict.js`). The mode is read
from the classic hook inputs at each prompt and tool end; until one has been seen, and on every other
surface or mode — `-p`, `dontAsk`, `plan`, `bypassPermissions`, Desktop, VS Code, mobile — a
`needsUser` call is refused. A mode switched in the middle of a turn is seen at the next tool end.

## What it is not

- **Not an isolation boundary.** It runs with your permissions. Production read-only is the job of
  your credentials and the target's IAM/RBAC.
- **Not the only line.** If the host skips its hook (mod disabled, worker crash) nothing here refuses.
  Keep named dangerous commands in your own `permissions.deny`, for example:

  ```json
  { "permissions": { "deny": ["Bash(kubectl delete:*)", "Bash(kubectl rollout:*)", "Bash(helm upgrade:*)"] } }
  ```

  Those rules match command text, not programs (`git -C . push` is a different text), which is why
  both layers exist. `Bash(git push:*)` is left out on purpose: sd0x-dev-flow's `/push-ci` runs it.
- Another mod can change a verdict at `tool.check`; this mod discloses that in `/agentctl policy`.
- Authorized executors (e.g. `npm test`) run with their effects unclassified.

## Develop

```bash
cd mods/agentctl            # from the repository root
claude plugin validate .   # hooks and $ calls: no $.model.*, $.http.*, $.tool.register, $.prompt.submit (fill/suggest/read allowed)
claude plugin test .       # every *.test.ts under tests/
```

## Release

The mod is versioned on its own and released under `agentctl-v<version>` tags
(`.github/workflows/release-agentctl.yml`), separate from sd0x-dev-flow's releases. Claude Code caches an
installed plugin by version, so a change to anything but this README or `tests/` needs a version bump:
raise `"version"` in `.claude-plugin/plugin.json`, then run `node .github/scripts/agentctl-version.js update`
from the repository root (or `/bump-version agentctl`). CI's version lock fails until both are done, and
CI also runs `claude plugin validate` and `claude plugin test` here.

## Verified live (2026-10-04, scratch repository: headless `claude -p --plugin-dir` on 2.1.288, interactive tmux on 2.1.289)

These rows record version 0.1.0. Since 0.2.0 an unclassified call is delegated to the host instead
of refused, and the proposal commands exist; the 0.2.x rows follow the table.

| Check | Result |
|---|---|
| Load and `/agentctl` under `-p` | Loads for the session only; replies in ~3.7 s with no model turn |
| `task set` from a `-p` prompt | Refused: a `-p` prompt is not stamped `composer`. Headless runs cannot set a task; set it from an interactive prompt |
| Forbidden and unclassified Bash calls | Refused before running, rule named (`task-forbid: …`, `unclassified: python3 has no adapter`) |
| An allowed read (`git status`) | Went to the host's own permission path and ran |
| A check exiting non-zero (`sh check.sh` → exit 1) | Recorded as `error`: a non-zero Bash exit reaches the mod as `isError` |
| Evidence bracket | Before/after readings recorded, coverage `git-hybrid` |
| Two concurrent sessions | Both session records written; the task record kept |
| Leftover processes after exit | None |
| Tree reading cost | ~90 ms with 500 changed/untracked files; ~75 ms on a clean 974-file repository |
| 5 h window after a model turn (V7) | `1% (resets …)` read from the host, with its source and age |
| Background check (V5, background half) | Closed from the host's task notification (`<task-id>`, `<status>`) as `error` — no polling needed. `TaskGet` is the todo-list tool; `GetTask` reads background tasks |
| Subagent tool calls (V4) | A subagent's `danger-cmd` was refused by the same rule |
| `ask` under `-p` (V3, `-p` only) | With a probe copy answering `ask`, neither tested headless configuration (with and without an allow rule for Bash) ran the command on 2.1.288 — the probe's `ask` was not auto-approved |
| `/agentctl stop` under `-p` stream input (V6) | The input was processed after the turn ended, so `immediate` does not apply there; the reply said no running turn was observed — never "stopped" |
| MCP tool calls (V4) | A probe MCP tool was refused as unclassified until the task named it, then ran |
| Interactive terminal in tmux (V10) | The band renders CJK goal text correctly at 80 and 50 columns, wrapping to two and three lines |
| `/agentctl stop` during a running foreground tool, interactive (V6) | Ran at once (`immediate`); the turn was cancelled; the host moved the running command to the background, where it kept running — the reply listed it as running and never said "stopped"; when it finished, the host's notification closed its evidence |
| `ask` on the interactive terminal in manual mode (V3) | With a probe copy answering `ask`, the host showed its own approval dialog with the mod's reason (Yes / No, no "don't ask again"); declining interrupted the call; re-run with the shipped code (manual: dialog; `dontAsk`: refused by the mod), and with a probe copy under `acceptEdits` and `auto` (dialog) and `dontAsk` (refused). The strings the host sends were read from a plain classic `UserPromptSubmit` hook (2.1.289): `default`, `acceptEdits`, `auto`, `plan` and `dontAsk` each arrive verbatim; on a model without auto mode (Haiku) `--permission-mode auto` falls back to `default` |
| Interactive start (found live) | `session.start` and the first band render arrive together; two concurrent context builds left the band on an orphaned context (`gates missing`). Fixed: one shared build |
| Install, disable, uninstall (Signal 12) | Installed from a local marketplace, ran, disabled (`/agentctl` gone), uninstalled: no mod process left, the `permissions` settings byte-identical. The host itself left an empty `extraKnownMarketplaces` key, a plugin cache directory and an empty `installed_plugins.json`; the mod leaves only its own store file. All were restored and verified byte-identical afterwards |

Removal: `--plugin-dir` installs nothing and changes no setting. The mod's own data stays in
`~/.claude/plugins/store/agentctl_*.json` (sessions, tasks, checkpoints), and drafted proposals in
`~/.claude/agentctl/proposals/`; delete them to remove it.

## Verified live, 0.2.x (2026-10-05, scratch clone with a scratch bare remote, 2.1.289, Haiku)

| Check | Result |
|---|---|
| Direct `git push` with no task bound (`-p`) | Refused `remote-git-write` before running; the remote stayed empty |
| Unclassified `python3 -c …` and a script that pushes (`/bin/bash -p push.sh`, `-p`) | Both passed to the host and ran; the script's push reached git (rejected by the scratch remote itself, not by the mod) — the disclosed script blindness |
| Proposal written by `agentctl-setup.js propose`, interactive start | The preview was logged at session start with the helper's digest, and the band named the waiting proposal |
| `/agentctl accept <digest>` typed at the prompt | Bound the previewed scope as a new task; without a `base` the helper printed no digest, the mod filled the bound task in and its own digest was accepted |
| A declared check, an unclassified call, an edit outside the roots, a direct push (bound task) | Check recorded as `current` evidence; `python3` delegated and listed as such by `/agentctl events`; the edit refused `edit outside the allowed roots`; the push refused `remote-git-write` |
| An untracked file added from outside | The check read `stale (tree changed since)` within 32 s |
| `/agentctl handoff`, reopen, `/agentctl`, `/agentctl last` | Hand-over states when the tree was read and lists the stale check under Not verified; on reopen the transcript shows it, bare `/agentctl` prints one pointer line, `/agentctl last` the whole of it |
| Found live and fixed in 0.2.1 | An accepted proposal file was read again by the next session as a stale draft (now remembered per worktree); the built-in refusal said "the task's scope", and Claude then proposed widening the task (now: "a built-in class no task can lift"); transcript lines read `agentctl: agentctl:` |
| Cost of the two `-p` probes | 2–3 turns each, ≈ $0.06 each on Haiku; the mod's own replies, previews and band call no model |
| Independent adversarial test (Codex, 2026-10-05), fixed in 0.2.2 | An absolute or upper-case program path (`/usr/bin/git push`, `GIT push`) slipped past the built-in classes; an edit root such as `../other` authorized writes outside the worktree; the proposal cap counted characters, not UTF-8 bytes; with no task bound, delegated calls were not recorded in `/agentctl events`. Digest agreement, prototype keys, other-worktree refusal, evidence partitioning and partial coverage held |

## Verified live, 0.3.0 (2026-10-07, scratch clone with a scratch remote, interactive tmux, Haiku)

Signal 13, walked on 2.1.289 (steps 1–3) and again from the start on 2.1.292:

| Step | Result |
|---|---|
| `/agentctl 幫 …/README 加一行測試說明` | The request filled the empty box in Traditional Chinese with the helper path from `$.plugin.root`; nothing was sent or bound |
| Enter | Claude ran the helper's `--help`, read the project, found the file missing and **asked** instead of inventing scope; after the answer it wrote the proposal through the helper |
| Preview | Shown at the turn's end with its digest and "binds the scope only; starts no work"; the band named the waiting proposal |
| Tab + Enter | Accepted from the suggestion; the reply named the next step |
| "start the work" | The edit inside the accepted root went to the host's own permission prompt; the declared check was recorded as current evidence |
| `/agentctl`, `handoff`, reopen, `last` | Status led with the next step; the hand-over listed the check as verified with its reading time; reopening pointed at it, `last` printed it |
| A second goal with the task bound | The helper delivered under the bound task; the preview said "Replaces: task …"; Tab + Enter replaced it |

Found and fixed during the walk: on 2.1.292 the host's own next-prompt guess ("確認") took the box, so
Tab + Enter would have sent that word to Claude — the mod now replaces the host's guess with the accept
line while a proposal waits, and offers it again at each turn's end; the accept reply's last line stayed
English in a Chinese session; with a task bound, the fill reply said "nothing is bound". Hesitations
recorded: Claude once tried to read the mod's own files outside the worktree (declined at the host
prompt); the copy language resets with each new session.

## Not verified

V3 on Desktop, VS Code and mobile, and under `plan` and `bypassPermissions` (accepting the
bypass-mode warning is the operator's own decision, so it was not exercised): `needsUser` stays
refused there. The band was checked in tmux, not over SSH.
