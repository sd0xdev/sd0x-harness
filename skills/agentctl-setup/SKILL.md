---
name: agentctl-setup
description: "Install and set up the optional agentctl mod (task scope, refusal before execution, evidence that goes stale, model-free hand-over) — checks the environment, installs after approval, builds the first task line, optional deny rules, uninstall"
allowed-tools: Read, Write, AskUserQuestion, Bash(node:*), Bash(claude:*)
model: sonnet
---

# agentctl Setup

## Trigger

- Keywords: agentctl, agent control plane, install the mod, set up agentctl, agentctl task, uninstall agentctl

## When NOT to Use

- Reviewing or gating a change (use `/codex-review-fast`, `/precommit`) — the mod is a control and a display, never a gate
- Installing sd0x-dev-flow's own rules, hooks or scripts (use `/install-rules`, `/install-hooks`, `/install-scripts`)

## What the mod is — say this first, in the user's language

Hand a task to Claude and leave; when you come back, three questions:

| Question | What the mod does |
|---|---|
| Did it stay in scope? | You declare the task once (what may be edited, which test command may run). A call outside it — `git push`, `kubectl rollout`, an edit outside the allowed directories — is refused **before it runs**, with the rule named. Only a line you type changes the scope |
| Is "tests pass" true? | A test run is recorded with a Git-derived fingerprint of the tree; a later change to a tracked or untracked file reads **stale** within 30 s, not "passed" (ignored files, submodule contents and the environment are outside it) |
| Where is it, do I need to step in? | A one-line band above the prompt; `/agentctl` for detail; `/agentctl handoff` writes a hand-over from records with no model call |

It is **not** a security boundary: production stays protected by credentials. It ships in this
repository under `mods/agentctl/` and is **never** installed by installing sd0x-dev-flow — this skill
is the opt-in.

## Modes

| Invocation | Does |
|---|---|
| `/agentctl-setup` | Steps 1 → 5, in order |
| `/agentctl-setup --task` | Step 4 only, then stop |
| `/agentctl-setup --status` | Step 2's `doctor` report only — no install, enable or task question — then stop |
| `/agentctl-setup --uninstall` | Step 6 only, then stop |

Dispatch on the flag **before** step 1: each flagged mode runs only its row and returns.

`SETUP` below is `node "${CLAUDE_PLUGIN_ROOT}/skills/agentctl-setup/scripts/agentctl-setup.js"`. Every
subcommand prints one JSON document; read `ok`, `problems` / `errors` from it, never guess.

## Workflow

### 1. Explain and ask

Show the table above in a few lines, then one AskUserQuestion: **Install** · **Not now**. On
`Not now`, stop.

### 2. Check

Run `SETUP doctor`. Report `claudeVersion`, `installed`, and every entry of `problems` in plain words:

| Field | Meaning | Response |
|---|---|---|
| `problems` non-empty | Mods cannot run here | Say why (old Claude Code, no git, `disableAllHooks`), how to fix it, and stop |
| `installed.enabled` is `true` | Installed and on | Skip to step 4 |
| `installed.enabled` is `false` | Installed but disabled — `/agentctl` does not exist until it is enabled | Say so; one AskUserQuestion naming `claude plugin enable <installed.id>`; run it after approval, then step 4. It takes effect in the **next** session |
| `installed: false` | Not installed | Step 3 |
| `installed: null` | `claude plugin list` could not be read | Say so; step 3 is still safe — installing an installed plugin changes nothing |

### 3. Install (after approval)

One AskUserQuestion naming the exact command, then run it:

```bash
claude plugin install agentctl@sd0xdev-marketplace
```

On failure (for example sd0x-dev-flow was loaded with `--plugin-dir` and the marketplace was never
added), report the error and offer the per-session alternative, which changes no setting:
`claude --plugin-dir "${CLAUDE_PLUGIN_ROOT}/mods/agentctl"`. The mod loads in the **next** Claude Code
session; say so.

### 4. First task

Ask with AskUserQuestion (free text through "Other" where noted):

| Question | Becomes |
|---|---|
| What is the task? (free text) | `--goal` |
| Which directories may be edited? `src,tests` · none (read-only) · other | `--edit` |
| Which test or check command may run? `npm test` · none · other | `--check` |
| Anything else to forbid? none · other | `--forbid` |

The answers are free text, so they **never go on a command line** — a shell would expand `$(…)`,
backticks or `$VAR` inside them before the helper could refuse them. Instead:

1. `SETUP alloc` → prints `input`, a fresh file in a private temporary directory
2. Write the answers to that path with the **Write** tool, as one JSON object of strings:
   `{"goal": "…", "edit": "src,tests", "check": "npm test", "forbid": "terraform apply"}` (omit a key the user answered "none")
3. `SETUP task-line --input <that path>` — it reads the file once and deletes it

On `ok: false`, show `errors` and ask again for that answer — `task-line` runs each command through the
mod's own classifier, so a form the mod would refuse (an inline `VAR=value`, a wildcard, shell
operators) is caught here, not after the user has left. On `ok: true`, show `line` in a fenced block
and say:

> Send this line yourself in the session where the mod runs. The mod accepts a task only from a
> line **you** type — a command run by Claude is refused, so nothing Claude reads can widen the scope.

Do not send the line yourself, and do not paraphrase it: the user copies it as printed.

### 5. Second layer (optional)

The mod refuses only while it runs. Offer native `permissions.deny` rules as a second layer:
AskUserQuestion, multiSelect, over the rules `SETUP deny-rules --settings <path>` lists as `missing`,
plus where to write: **this project, personal** (`.claude/settings.local.json`) · **every project**
(`~/.claude/settings.json`) · **Skip**. After the choice, run
`SETUP deny-rules --settings <path> --rules "<chosen,comma-separated>" --write` and report `written`.
`git push` is not offered: `/push-ci` runs it, and a native deny would block that workflow.

### 6. Uninstall (`--uninstall`)

AskUserQuestion naming `claude plugin uninstall agentctl@sd0xdev-marketplace`; run it after approval.
Then say the mod's own data stays in `~/.claude/plugins/store/agentctl_*.json` until deleted, and that
deny rules added in step 5 stay in the settings file they were written to.

## Prohibited

- Putting any free-text answer on a command line — answers go through `alloc` + Write + `--input`

- Installing, uninstalling or writing settings without that step's AskUserQuestion approval
- Sending `/agentctl task set` on the user's behalf, or editing the printed line
- Describing the mod as a security boundary, a gate, or an approval
- Offering `Bash(git push:*)` as a deny rule

## Verification

- [ ] The flag chose the steps: a flagged mode ran only its own row
- [ ] Default mode: the user saw what the mod does before any install question
- [ ] `doctor` ran (default and `--status`), and every `problems` entry was reported
- [ ] Install, deny-rule writes and uninstall each had their own approval
- [ ] The task line came from `task-line --input` with `ok: true`, and the user was told to send it themselves

## Examples

```
Input: /agentctl-setup
Action: explain → doctor (ok, not installed) → approve → claude plugin install → four questions →
        task-line → "send this line yourself" → deny rules for this project → written
```

```
Input: /agentctl-setup --task
Action: four questions → task-line → line printed for the user to send
```
