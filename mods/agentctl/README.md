# agentctl — Agent Control Plane for one Claude Code session

Tested with **Claude Code 2.1.288** (headless) and **2.1.289** (interactive, after the host auto-updated) (`claude plugin validate .`, `claude plugin test .`: 145 tests).
The mods API is marked changeable between releases; the type declarations the host writes into
`.claude-plugin/types/` are the authority for the installed version. Run `claude plugin validate .`
after every Claude Code upgrade.

Design: `docs/features/agent-control-plane-mod/` in this repository (requirements, feasibility study,
tech spec, request tickets). This directory is not part of the sd0x-dev-flow plugin: installing the
plugin does not install the mod. To install it, run `/agentctl-setup` (it checks the host, installs
`agentctl@sd0xdev-marketplace` after you approve, and builds your first task line), or load it for one
session with `claude --plugin-dir mods/agentctl`.

## What it does

| Function | How |
|---|---|
| Task scope | `/agentctl task set <json>` typed at your own prompt binds a task to the worktree. Tool output, files and messages cannot change it — only a command you type. The binding is per worktree, so your own `task set` / `task clear` in another session on the same worktree does replace or clear it. Task records and hand-overs are kept per worktree, so the same task id in two worktrees names two separate tasks. A store error is reported as such, and the previous task keeps applying; a binding whose record is missing refuses everything but reads in the worktree |
| Refusal | **While a task is bound**, every tool call is classified before it runs: forbidden or unclassifiable → refused with the rule named; allowed → the host's own permission path, unchanged. A downstream deny is never weakened and an allow is never created. **With no task bound** (before `task set`, after `task clear`) the mod observes only and refuses nothing |
| Evidence | A Bash call matching a `check` executor is bracketed by Git-derived tree readings; a later edit shows the result stale within 30 s; a background check stays "completion unobserved" until a terminal result is seen |
| Panel | The band above the prompt is compact: task, runtime and its duration, what needs you, the gate reading with its age (and `stale` past 30 s), the last hand-over time. `/agentctl` is the detailed text: it adds context, the 5 h window and evidence; the gate, context and window lines name their source and age, or read `missing` / `unavailable`, and each evidence line its outcome, freshness, coverage and age |
| Hand-over | `/agentctl handoff` — eight answers from records, no model, no network, no process; shown in full on reopen |
| Stop | `/agentctl stop` — saves the hand-over, requests cancellation of the current turn, lists tracked operations; never "all stopped" |

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

While a task is bound, built-in forbidden classes always apply on top of its own: production writes (`kubectl apply|delete|patch|rollout|scale|edit|replace`,
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
  { "permissions": { "deny": ["Bash(kubectl delete:*)", "Bash(kubectl rollout:*)", "Bash(helm upgrade:*)", "Bash(git push:*)"] } }
  ```

  Those rules match command text, not programs (`git -C . push` is a different text), which is why
  both layers exist.
- Another mod can change a verdict at `tool.check`; this mod discloses that in `/agentctl policy`.
- Authorized executors (e.g. `npm test`) run with their effects unclassified.

## Develop

```bash
cd mods/agentctl            # from the repository root
claude plugin validate .   # hooks and $ calls: no $.model.*, $.http.*, $.tool.register, prompt writes
claude plugin test .       # every *.test.ts under tests/
```

## Verified live (2026-10-04, scratch repository: headless `claude -p --plugin-dir` on 2.1.288, interactive tmux on 2.1.289)

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
`~/.claude/plugins/store/agentctl_*.json` (sessions, tasks, checkpoints); delete that file to remove it.

## Not verified

V3 on Desktop, VS Code and mobile, and under `plan` and `bypassPermissions` (accepting the
bypass-mode warning is the operator's own decision, so it was not exercised): `needsUser` stays
refused there. The band was checked in tmux, not over SSH.
