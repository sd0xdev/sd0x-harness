# agentctl in the sd0x-dev-flow workflow

Optional, on demand. Read this when a workflow skill (`/feature-dev`, `/bug-fix`, `/refactor`) or
`/agentctl-setup --task` offers agentctl. The mod is a **control and a display**: it never calls a
model, never writes a review-state verdict, and is never a gate, a credential or a security
boundary. Nothing here changes what `rules/auto-loop.md` requires.

## When to offer

`SETUP status` (`SETUP` as in `../SKILL.md`) prints one `line`. Act on its `state`:

| `state` | Do |
|---|---|
| `installed/enabled` | Offer a proposal once per task (one AskUserQuestion: **Draft a scope** · **Not now**). Never claim the mod is running — its own preview is what shows that |
| `installed/disabled`, `not installed`, `unknown` | Say nothing about agentctl. Ordinary work goes on unchanged |

## Drafting a proposal

1. Read the request ticket: Scope, **Related Files**, Acceptance Criteria; and the feature intent.
2. `New` / `Modify` rows of Related Files are candidate **edit** paths — the files, or their smallest
   directory when several sit together. Never widen a file to its top-level directory. Referenced
   material stays read-only.
3. Checks: the commands this project actually runs, found the way `/verify` finds them (runner first,
   then the manifest — `test:unit`, then `test`). Add the precommit runner exactly as `/precommit`
   invokes it, so its run is bracketed as evidence:
   `node .claude/scripts/precommit-runner.js` (or `node scripts/precommit-runner.js` in the plugin
   source). A check is a plain command — no `VAR=value` prefix, no shell operators.
4. Acceptance: the ticket's ACs, one per line.
5. Write the answers through `SETUP alloc` → Write → `SETUP propose --input <path>`, exactly as
   `../SKILL.md` step 4 does for a task line. **While a task is bound**, agentctl refuses that Write
   (the file is outside the task's edit roots): send the same JSON on stdin instead, through a
   **quoted** heredoc whose delimiter appears nowhere in the answers —
   `SETUP propose --stdin <<'AGENTCTL_ANSWERS_<8 random hex>'`, the JSON, then the delimiter on its
   own line. The quotes keep the shell from expanding anything inside; never use an unquoted
   delimiter, and never clear or widen the task to make the Write pass. On `ok: false`, fix the named
   answer and retry.
6. Show `preview` and say: the mod shows its own preview at the end of this turn, with the digest;
   **you** accept it by typing `/agentctl accept <first 8 of that digest>`, or `/agentctl discard`.
   `digest` is `null` unless a `base` was given — without one the mod fills in the task bound when it
   reads the file, so only its preview can name the digest. Do not type the accept for them — a
   command Claude runs is refused.

## How it sits beside the auto-loop

| Harness | agentctl | Relationship |
|---|---|---|
| `/codex-review-fast`, `/codex-review-doc` verdicts | — | Gate. agentctl never records or replaces one |
| `/precommit` → `## Overall:` + `review-state.js note` | Evidence record of the runner's run, with the tree reading before and after | Receipt beside the verdict. A runner that edits files reads `tree changed during the run` while its verdict still stands — two authorities, never merged |
| `review-state.js check` | The band's `gates` field (read-only) | Display of the harness's own state |
| `/push-ci`, `/smart-commit --execute` approvals | Recognized direct `git push` / `gh pr merge` refused; scripts and compound fences delegated to the host | The skills' approval contracts stay the credential. agentctl reads each tool call only, never a script's contents or the commands it starts |
| `/post-dev-recap`, `/next-step` | `/agentctl handoff` (records, no model) | Read the hand-over only when the user asks; it is not ingested automatically |

When reporting a gate, a `/precommit` pass is the verdict; agentctl evidence may be mentioned as
supporting context ("the runner's run is recorded against tree X"), never as the reason a gate passed.
