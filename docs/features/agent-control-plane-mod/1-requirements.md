# Requirements: Agent Control Plane Mod

> **Doc class**: Lifecycle — Phase 1 requirements (per `@rules/docs-numbering.md`). Feature-level problem-space analysis. **Not** a task tracking ticket; for per-task progress tracking see `requests/*.md` (created via `/create-request`).
> **Created**: 2026-10-03
> **Updated**: 2026-10-03
> **Tier**: standard
> **Input**: the user's "Agent Control Plane Mod 需求分析輸入稿" as pasted into the session on 2026-10-03 — the attached file did not reach the session, so the pasted concept text is the whole input
> **Host facts checked against**: Claude Code 2.1.288 — the official Mods pages (overview, interface, api, events, test, create) and the type declarations the host wrote for that version into `.claude-plugin/types/claude-code/index.d.ts` beside the task-12 spike mod (`~/Projects/sd0x-mods-spike/sd0x-gate-band/`)

## 1. Problem Statement

A person who hands Claude Code a task cannot leave it running without losing three things: knowing
what it is doing right now, knowing when it needs them, and knowing whether what it hands back is
backed by evidence. Today those answers come from reading the transcript, which does not survive a
session reopen, does not bind a claimed test pass to the tree it ran on, and does not say which
operations the task was never allowed to perform.

### 5-Why Trace

1. **Surface**: a panel above the prompt that shows task, state, policy, context use, last event,
   changes, checks and whether attention is needed — and lets the user pause, stop, resume and hand
   over.
2. **Why**: a transcript is the only record of a long-running task, and it is unstructured. "Tests
   pass" in it is Claude's sentence, not a bound result; a backgrounded job's start is
   indistinguishable from its success; nothing records what the task was allowed to do.
3. **Root**: the user wants to supervise rather than watch — intervene only when needed, and trust
   the hand-back without re-verifying it by hand. Success means a single Claude session becomes
   manageable from outside its transcript: its state is structured, its evidence is bound to a
   tree, its scope is refused where the host lets a mod refuse, and its hand-over needs no
   re-briefing.

## 2. Goals / Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| Make one session's state readable without the transcript: what it does, for which task, since when, and whether it needs a person | A second supervising agent, a Slack crawler, a web dashboard, a message queue, or multi-machine scheduling (the input rules all five out for the first version) |
| Bind every claim the panel shows to a source and a time; show `unknown` where no source answers | Being a security or isolation boundary: a mod runs with the user's permissions and the official pages say it is not sandboxed; production read-only is the credential's and the target's job |
| Keep test, lint and build evidence tied to the tree state it ran on, so a later edit cannot be shown as still verified | Treating a background job's start as its success |
| Refuse, at the tool-call event, operations the task's policy forbids, and never rewrite a command's target silently. This is a best-effort task-scope refusal, not a boundary — a mod can be disabled, skipped on failure, or bypassed by a push made outside the session | Auto-correcting a command (`--context`, namespace) toward a safer target — the input explicitly removes this from version one |
| Produce a hand-over from structured records, with no model call, that answers the eight questions in § 4 UC-6 | A model-written summary in version one; the optional later form spends the user's own plan or API quota |
| Give the user pause / stop / resume whose meaning is stated and whose limits are shown; degrade to "stop this turn, save a hand-over, resume by hand" where a reliable pause cannot be shown | A panel-only mobile story — the official page says a mod's drawing appears in the local terminal, not on the phone |
| Keep the mod outside every gate and credential: it reads `review-state.js`, writes no verdict, approves no tool call, and is not a git credential (Anchor Register #4) | Any authority over review verdicts, precommit, or git operations |

## 3. Stakeholders

| Stakeholder | Role | Key Concern |
|-------------|------|-------------|
| The developer who delegates a task and walks away | User | Knowing when to come back, and trusting the hand-back without re-running every check |
| The same developer on a phone through Remote Control | User | A text answer they can read there; nothing draws on the phone |
| sd0x-dev-flow maintainer | Developer / Dependent | The mod must not become a second credential or verdict writer: Anchor Register #4 names the credentials and `review-state.js` is the only verdict store; 22 skills and hooks already read it |
| The host's permission system and `pre-push-gate.sh` | Dependent | A mod runs ahead of plugin `PreToolUse` hooks; a guard that fails must not approve what the hook would have blocked |
| Production systems the task may read | Operator | Read-only must hold even when the mod is broken: enforced by credentials and the target's own permissions, not by the panel |
| Future multi-session operator (Mac Studio, several sessions) | Operator | Explicitly deferred; their needs must not shape version one |

## 4. Use Cases

| # | Actor | Action | Expected Outcome |
|---|-------|--------|-----------------|
| UC-1 | Developer | Declares a task before starting: goal, working directory, allowed operations, forbidden operations, completion conditions | The task record exists apart from the session and survives a session reopen |
| UC-2 | Developer | Glances at the panel while Claude works | Sees task, repo, branch, state, policy, context %, 5h usage %, last event with its time, changed-file count, check counts, and whether attention is needed — each field with a source or `unknown` |
| UC-3 | Developer | Returns after Claude has been idle or has asked something | Can tell "running a tool since 14:02" from "waiting for your decision about X" from "refused by policy rule R" from "rate-limit reached, resets at T" from "no activity for 9 min, unconfirmed" |
| UC-4 | Developer | Reads "tests pass" in Claude's reply | Can expand to the command, start time, exit code, report path and the tree state it ran against; a pass recorded against an older tree state is shown as stale, and a started background job is shown as started, not passed |
| UC-5 | Claude (tool call) | Attempts `kubectl rollout restart` under a read-only investigation task | The call is refused with the rule named; no "Allow" button is offered for a forbidden operation; an operation the mod cannot classify is not allowed through for lacking a dangerous keyword |
| UC-6 | Developer | Leaves, or the 5-hour limit hits | A hand-over document answers eight questions: (1) the goal; (2) the allowed and forbidden scope; (3) what changed; (4) what is verified; (5) what is only Claude's judgement; (6) what is still running; (7) the next step; (8) what is still not allowed |
| UC-7 | Developer | Reopens Claude on the same task | Sees the last hand-over first ("data layer done, integration tests not run, uncommitted changes present"); the earlier session's approvals are not treated as still standing; no command is replayed automatically |
| UC-8 | Developer | Presses pause / stop / resume | Each does what § 5 FR-11..13 state, and the panel keeps showing background processes that the action did not touch |

## 5. Functional Requirements

Each requirement carries a **host status** against Claude Code 2.1.288, with the source that justifies it:

| Label | Meaning |
|-------|---------|
| **documented** | An official Mods page states it, or the local type declarations declare it. A declaration is a statement of the API, not a measurement |
| **verified locally** | Measured on 2.1.288 in this repository or by the task-12 spike (`docs/features/claude-code-2-1-288-compat/requests/2026-10-03-mods-assessment-report.md`) |
| **to verify** | Plausible from the pages or the declarations, not yet exercised; listed in § 9 |
| **needs external component** | Not achievable inside one mod on the installed host |
| **unsupported** | The host provides no path |

The verdicts are facts about 2.1.288; the types file's own first line says events and methods can change between releases.

| ID | Requirement | Priority | Rationale | Host status |
|----|-------------|----------|-----------|-------------|
| FR-1 | A task record holds goal, working directory, allowed operations, forbidden operations and completion conditions, keyed separately from any session id, and survives a session reopen | Must | UC-1, UC-7 | **documented**: `$.store` persists JSON per plugin across sessions (interface page); `$.state` is reset by `/clear`, `/resume`, `/branch`. **to verify**: the spike did not exercise `$.store`; the page states get-then-set is not atomic across sessions |
| FR-2 | The panel shows task, repo, branch, state, policy summary, context %, rate-limit %, last event with timestamp, changed-file count and check counts | Must | UC-2 | **verified locally** (spike): a band line draws above the prompt in the terminal and survives `/clear`. **documented**: `$.session.usage()` returns `context` and `rateLimits` (`five_hour`, `seven_day`), `rateLimits` empty off a subscription (api page; local `SessionUsage` type). **to verify**: the `rateLimits` reading on this account |
| FR-3 | Every panel field names its source and time, or reads `unknown`; no field is ever guessed | Must | The input's own rule; a wrong panel is worse than none | **verified locally** (spike): a failed, non-JSON or missing gate reading renders as `unknown`, 8 tests |
| FR-4 | The state model distinguishes: running a tool (which, since when, still active); waiting for the user (what, with context); refused by policy (operation, rule); rate-limited (reading, reset time); suspected stall (idle duration, basis, unconfirmed); delivered (verified / unverified / needs review) | Must | UC-3; "5 minutes silent" is not "stuck" and "Claude says done" is not "accepted" | **documented**: `tool.call`, `turn.start`, `turn.step`, `turn.complete`, `turn.abort`, `classic.Stop`, `classic.PermissionRequest` are declared events; `$.clock.now()` gives times. **to verify**: whether "waiting for the user" is observable as an event or only inferable; whether `classic.PermissionRequest` carries what is being decided |
| FR-5 | A check result (test, lint, build) is recorded as execution evidence — command, start time, exit code, report location, and the tree state at run time — and a result whose tree state no longer matches is shown as stale, never as current. **Gate verdicts and execution evidence are distinct**: a gate pass is shown as a gate pass, never as an observed test pass | Must | UC-4; the input names staleness as the easiest requirement to miss | **verified locally** (repo): `review-state.js check --format=json` reports three gate slots with `digest_match`, which satisfies the *gate* half; it stores `{digest, verdict, rounds, time}` at note time and records no command, exit code or report path, so it cannot be the *execution* evidence. **to verify**: how a mod observes a test command's exit — the `tool.call` hook's `next()` result, the precommit/verify runners' own `summary.json`, or `$.process.spawn`'s `{code, signal}` — see § 9 |
| FR-6 | A background job that started is recorded as started; only an observed exit marks it passed or failed | Must | UC-4 | **documented**: `$.process.spawn` resolves with `{ code, signal }`; a Bash `tool.call` with `run_in_background` yields a task id, not a result. **to verify**: whether the host exposes a backgrounded Bash task's completion to a mod |
| FR-7 | A policy per task lists allowed and forbidden operation classes; at `tool.call` the mod refuses a forbidden one by name, passes an allowed one to the host's own permission path unchanged, and refuses one it cannot classify | Must | UC-5; the input's "no dangerous keyword" is not permission | **documented**: `tool.call` can observe, rewrite or answer, covers subagent and MCP tools, and `{ deny: reason }` is the refusal shape (events page; local types). **to verify**: the refusal end to end under `claude plugin test` |
| FR-8 | The mod never rewrites a command's target (cluster, namespace, context); it shows the target and refuses or lets the host decide | Must | The input removes silent redirection from version one | **documented**: rewriting is possible at `tool.call`, so this is a constraint the mod imposes on itself, checked by source inspection |
| FR-9 | No approval control is drawn for an operation the task's policy forbids | Must | UC-5 | **documented**: a mod draws its own elements. The host's own permission prompt cannot be redrawn by a mod (interface page), which is the correct direction here |
| FR-10 | The task-policy refusal (FR-7) fails closed: an internal error in the mod's own classification results in a refusal, and the mod never answers `allow` on a path it did not evaluate. Where the installed host skips the hook itself (budget overrun, malformed answer) and lets the call continue, that is a limitation the mod cannot close; it is stated in the panel's policy field and in the hand-over, and it is the reason FR-7 is a best-effort refusal and not a boundary (§ 2 Non-Goals) | Must | A broken guard must not approve | **documented** (local types, 2.1.288 `EngineEventOf` comment): "a hook that fails (throws, overruns its budget, answers a wrong shape) is skipped: the hooks beneath and core run in its place" — the host default is fail-open. **to verify**: whether a catch-all inside the hook covers every thrown error and whether a budget overrun can be pre-empted by an internal timeout that returns `{ deny }` first |
| FR-11 | Pause means: start no new work after the next verified safe boundary; running tests, background processes and remote operations are not frozen, and the panel keeps showing them | Should | UC-8; the input's definition | **to verify**: a mod can refuse new `tool.call`s and `prompt.submit`s after a flag is set; no declared primitive holds a model turn at a boundary without aborting it — FR-14 applies if none is found |
| FR-12 | Stop means: abort the current model turn and report the model's result and each subprocess's result separately; "all work stopped" is never shown until each is confirmed | Must | UC-8 | **documented** (types): `$.turn.abort({ turnId })` cancels the running turn and stops its running tools; `process.spawn` resolves with `signal` when killed. **to verify**: whether a Bash tool's backgrounded process survives `turn.abort`, and how the mod learns its final state |
| FR-13 | Resume means: re-read working directory, tree state, policy and the state of running processes, then continue; no command with side effects is replayed automatically | Must | UC-7, UC-8 | **documented**: `classic.SessionStart` fires after `/clear`, `/resume`, `/branch` with `e.source`; `$.store` holds the task. "No replay" is a constraint on the mod's own behaviour |
| FR-14 | If a reliable pause (FR-11) cannot be shown on the installed host, the control is not offered; the panel offers "stop this turn, save hand-over, resume by hand" instead | Must | The input: no cosmetically useful pause | Decision rule, not a host capability |
| FR-15 | A hand-over document is produced from the structured records with no model call and no network, as Markdown, answering the eight questions of UC-6 | Must | UC-6 | **verified locally** (spike): a command's text reply works under `claude -p`. **documented**: `$.command.register`, `$.fs.write`, `$.store` |
| FR-16 | On reopen, the last hand-over is shown before any work; approvals given in an earlier session are not treated as standing — a forbidden operation is refused again and an allowed one goes to the host's permission path again | Must | UC-7 | **documented**: `classic.SessionStart` `source: resume`. The mod holds no approvals of its own; **to verify**: whether the host's own permission grants persist across a resume, since that decides whether "not standing" is observable or only the mod's half of it |
| FR-17 | A text form of the panel is available on request (a `/command`) for surfaces that draw nothing: VS Code chat, `-p`, cloud, Remote Control from a phone | Must | The input's mobile constraint | **verified locally** (spike): the command's text reply under `claude -p`. **documented**: the overview says those surfaces run hooks and draw nothing; the local types also declare `'mobile'` and `'vscode'` as `RenderSurface` values — **to verify** whether 2.1.288 draws anything there. FR-17 stands either way |
| FR-18 | Every control (pause, stop, resume, refuse) states what it did and did not affect, as observed, never as intended | Must | UC-8 | Decision rule |
| FR-19 | The mod writes no gate verdict, approves no tool call, rewrites no prompt and routes no model; it reads `review-state.js` and never writes it | Must | Anchor Register #4; the maintainer's standing decision (2026-08-13) that the review layer is reminder-only; the `claude-code-2-1-288-compat` intent Non-goals | Checked by **source inspection and behavioural tests**: `claude plugin validate` lists the events hooked and the API methods called, which rules out `$.model.*` and `$.tool.register`, but a `$.process.run` line does not say whether its arguments are `check` or `note` — that is read from the source and asserted by a test on the `process.run` stub's `argv` |
| FR-20 | Multi-session aggregation (which of several sessions on this machine need me) | Won't (v1) | The input defers it until the question is real | **to verify** whether a mod alone can do it: `$.store` is shared by every session on the machine but get-then-set is not atomic (interface page), so a shared record needs a conflict strategy; whether that needs a component outside the mod is a solution question (§ 9) |
| FR-21 | Notifications off the machine (phone push, Slack) | Won't (v1) | The input defers it | Deferred by the input; the host documents `$.http.fetch`, so the delivery mechanism is a later solution question, not a settled external dependency |
| FR-22 | A model-written hand-over summary | Could | Optional later; costs the user's quota | **documented**: `$.model.complete` exists and uses the plan or API key |

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Reliability | A panel field is never populated by inference when its source failed | For every field, each failure of its source renders `unknown`; a test covers each failure path |
| NFR-2 | Security | The mod is a control and a display, not an isolation boundary; production read-only is enforced by credentials and the target's permissions, and the panel and hand-over say so | Both carry the line "this mod does not isolate; see credential scope" |
| NFR-3 | Security | Policy refusal fails closed where the mod can act (FR-10); where the host skips the hook, the limitation is disclosed, never silent | A test forcing an internal error asserts refusal; the disclosed limitation names the host version it was measured on |
| NFR-4 | Performance | Reading state does not slow the session noticeably | A state read completes within 200 ms (one `review-state.js check` measured at ~83–100 ms); a stale panel is refreshed within 30 s of a change |
| NFR-5 | Reliability | Hand-over generation needs no network and no model, including through subprocesses | The hand-over path makes no `$.model.*` or `$.http.*` call (validation inventory) and starts no process (source inspection and a `process.run` stub that fails the test if called) |
| NFR-6 | Maintainability | The mod is testable without a session | `claude plugin test` covers each state in FR-4, each control, the fail-closed refusal, and `unknown` rendering |
| NFR-7 | Compatibility | Capabilities are checked against the installed host's type declarations, not against this document | The mod's README names the Claude Code version it was tested with; a version mismatch is reported, not assumed away |
| NFR-8 | Usability | Every state in FR-4 is distinguishable by a reader who has not seen the transcript | Each state has its own label, time field and "what is unconfirmed" field |
| NFR-9 | Security | Records and hand-overs never carry a secret, wherever it appears — environment values, command arguments, inline assignments, authenticated URLs, paths | Recorded command text, URLs and paths are sanitized before persistence or display; acceptance examples include a token in an argument and a credential in a URL; `rules/security.md` and `rules/logging.md` apply |

## 7. Constraints & Assumptions

| Type | Description | Source |
|------|-------------|--------|
| Constraint | A mod runs with the user's permissions, outside the Bash sandbox; it reads files, starts processes and makes network requests as the user | Official Mods overview § What a mod can reach |
| Constraint | A mod runs ahead of the plugin's `PreToolUse` settings hooks and can approve what a `deny` rule or a hook would have blocked | Official overview; `claude-code-2-1-288-compat` intent Non-goals |
| Constraint | A hook that throws, overruns its budget or answers a wrong shape is skipped; the call continues | Local types for 2.1.288, `EngineEventOf` comment |
| Constraint | A mod cannot redraw the host's permission prompt | Official interface page |
| Constraint | A mod's drawing appears only in the terminal and the Desktop app; VS Code, `-p`, cloud and Remote Control draw nothing (the local types also name `'mobile'` and `'vscode'` surfaces — unverified) | Official overview § Where mods run; local types |
| Constraint | `$.store` is shared by every session on the machine and get-then-set is not atomic | Official interface page § Save from more than one session |
| Constraint | The hooks module has no Node.js APIs; files, processes and network go through the mods API, and static analysis forbids dynamic import, `$` aliasing and non-literal event names | Official create page § Check what Claude Code reads from your mod |
| Constraint | The mods API is marked as changeable between releases; the types the host writes beside the mod are the authority for the installed version | Official create page; types header |
| Constraint | The mod must not ship inside sd0x-dev-flow while that holds, and never as a credential, verdict writer or gate | `claude-code-2-1-288-compat` intent Non-goals; Anchor Register #4; maintainer decision 2026-08-13 |
| Constraint | No model API tokens, Slack crawler, web dashboard, message queue or multi-machine scheduling in version one | The input's instruction |
| Assumption | `$.session.usage().rateLimits` returns the 5-hour window on this account | Official api page and local types; **to verify** |
| Assumption | A `tool.call` hook can see a Bash command's full text | Local types: `e.command` for Bash |
| Assumption | A single session is the right unit for version one | The input's architecture section |

## 8. Acceptance Signals

- **Signal 1 (FR-1, FR-16)**: declare a task, close the session, reopen it; the panel shows the task and the last hand-over before any tool runs, and a forbidden operation is refused again on the new session.
- **Signal 2 (FR-3, NFR-1)**: with the gate reader removed, with it returning non-JSON, and with it exiting non-zero, the panel shows `unknown` for the gate fields and nothing else changes; `claude plugin test` covers all three.
- **Signal 3 (FR-5)**: run the tests, then edit one source file; the panel shows the previous pass as stale within 30 s, and the hand-over lists it under "not verified". Gate state and execution evidence are shown as two different things.
- **Signal 4 (FR-6)**: start a background test; the panel shows "started", not "passed", until an exit is observed.
- **Signal 5 (FR-7, FR-9)**: under a read-only investigation policy, a `kubectl rollout restart` tool call is refused with the rule named and no Allow control appears; a read of logs reaches the host's own permission prompt unchanged.
- **Signal 6 (FR-10, NFR-3)**: a test forces the mod's classification to throw; the tool call is refused. A second test models the host skipping the hook; the panel's policy field and the hand-over carry the disclosed limitation.
- **Signal 7 (FR-12)**: during a turn with a running tool, stop; the panel reports the turn aborted and lists each process with its own observed end state; "all stopped" appears only when every row has one.
- **Signal 8 (FR-15, FR-17)**: `/handover` under `claude -p` prints the eight answers; the test's `model.complete`, `http.fetch` and `process.run` stubs each fail the test if called on that path.
- **Signal 9 (FR-19)**: `claude plugin validate` lists no `$.tool.register`, `$.prompt.*` write or `$.model.*` call; source inspection shows every `$.process.run` on the gate path passes `check`, never `note`; a test asserts the stub's `argv`.

## 9. Open Questions

Technical verifications, in the order they unblock the rest:

- [ ] Does a catch-all inside the `tool.call` hook cover every error path, and can an internal timeout return `{ deny }` before the host's hook budget expires? This decides how much of FR-10 the mod can honour and what FR-10's disclosed limitation says.
- [ ] How does a mod observe a test command's exit and the tree state at that moment — the `tool.call` hook's `next()` result, the runners' own records, or `$.process.spawn`? This decides FR-5's execution evidence and is a solution concern — suggest `/feasibility-study`.
- [ ] How does a mod learn that a Bash tool's backgrounded process has exited, and does `$.turn.abort` end it? This decides FR-6 and FR-12.
- [ ] Is "waiting for the user" observable as an event, or only inferable from a completed turn whose answer ends in a question? This decides how FR-4's second row is populated.
- [ ] Do the host's own permission grants persist across a resume? This decides whether FR-16's "not standing" is observable or only the mod's half.
- [ ] Do the `'mobile'` and `'vscode'` render surfaces in the 2.1.288 types draw anything, or are they placeholders? FR-17 stands either way.
- [ ] Does `$.session.usage().rateLimits` carry `five_hour` on this account? If empty, FR-2's usage field reads `unknown` by FR-3.
- [ ] Should pause exist in version one, given no declared primitive holds a turn at a boundary? The input prefers an honest "stop + hand-over"; confirm before `/tech-spec`.

Solution concerns, for `/feasibility-study` or `/tech-spec`:

- [ ] Where the task record and the hand-over live and how they are keyed so two sessions on one machine do not overwrite each other.
- [ ] Single mod versus mod + local service for history longer than one session and for stall detection while a session is not running.
- [ ] How often and on which events the panel refreshes, and how the state model is encoded.
- [ ] What to cut: the input's six modules map onto FR-1..FR-19; the candidates to delay are the pause control (FR-11), the model summary (FR-22), and any panel field whose source is unverified on this account.

## 10. References

- Request tickets: none yet — `/create-request` after `/tech-spec`
- Official: code.claude.com/docs/en/plugins/mods/overview — where mods run, what a mod can reach, built-in mods
- Official: code.claude.com/docs/en/plugins/mods/interface — `AbovePrompt`, `Pane`, `$.state` vs `$.store`, store races
- Official: code.claude.com/docs/en/plugins/mods/api — `$.session.usage()`, `$.process.run`/`spawn`, `$.http.fetch`, `$.model.*` costs
- Official: code.claude.com/docs/en/plugins/mods/events — observe / rewrite / answer at `tool.call`
- Official: code.claude.com/docs/en/plugins/mods/test — `claude plugin test`, stubs, policy-mod tests
- Official: code.claude.com/docs/en/plugins/mods/create — static-analysis rules, hot reload, types written beside the mod
- Local: `~/Projects/sd0x-mods-spike/sd0x-gate-band/.claude-plugin/types/claude-code/index.d.ts` (written by Claude Code 2.1.288): event list, `$.turn.abort`, `SessionUsage`, `ProcessSpawnResult`, hook-skip semantics, `RenderSurface`
- Local: `docs/features/claude-code-2-1-288-compat/requests/2026-10-03-mods-assessment-report.md` — the task-12 spike's measured results
- Local: `scripts/review-state.js` and `scripts/lib/tree-digest.js` — the digest-bound gate verdict model FR-5 reads for its gate half
- Local: `rules/discretion.md` Anchor Register #4; `docs/features/claude-code-2-1-288-compat/intent-claude-code-2-1-288-compat.md` Non-goals
