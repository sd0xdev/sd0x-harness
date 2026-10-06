# Agent Control Plane Mod — Feasibility Study

> **Doc class**: Lifecycle — Phase 0 feasibility (per `@rules/docs-numbering.md`). Analysis only:
> nothing was implemented, installed or enabled, and no file outside this directory changed.
> **Created**: 2026-10-03
> **Input**: the user's "Agent Control Plane Mod：需求分析輸入稿" v0.1 (2026-10-03, delivered in full
> to the session after the requirements were written — called **the brief** below), plus
> [1-requirements.md](./1-requirements.md) (FR-1..FR-22, NFR-1..NFR-9) and
> [intent-agent-control-plane-mod.md](./intent-agent-control-plane-mod.md) (INV-001..INV-007)
> **Host facts checked against**: the Claude Code 2.1.288 type declarations written beside the
> task-12 spike mod — `~/Projects/sd0x-mods-spike/sd0x-gate-band/.claude-plugin/types/`
> (`claude-code/index.d.ts`, `claude-code-tools/index.d.ts`) — and the official permissions,
> hooks and status-line pages. A declaration states the API; it is not a runtime measurement.
> Items marked **to verify** have not been exercised.

## 0. Answers to the Brief's Five Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Most valuable user problem; what native features already solve | Supervising a delegated session without watching it: one place that says what the task is, what is running, what needs a person, and which results are backed by evidence on which tree. **Native already covers**: fixed deny/ask rules (`permissions` settings), context and rate-limit display (status-line command), task refusal by script (classic `PreToolUse` with exit 2 or a decision), session resume, user interruption. **Native does not combine** task scope, evidence freshness and unresolved work in one view, and has no model-free command inside Claude's command namespace (§ 4 Option 0) |
| 2 | How far one Mod goes; what really needs a resident service | One Mod covers the single-session MVP (§ 6). A service is needed only for monitoring after Claude Code exits, history beyond the 4 MiB store, or several sessions — all outside version one (§ 4 Option D) |
| 3 | Smallest complete v1 flow | Declare task → work under native hard rules + the Mod's task-scoped refusal → glance at the band or `/agentctl` → evidence recorded per declared check with freshness → `/agentctl handoff` (model-free) → reopen shows the last hand-over and re-reads repo, branch, tree and policy (§ 8) |
| 4 | Safety promises a Mod cannot give alone | Production read-only (credentials and target IAM/RBAC); a boundary around a program rather than a command text (native rules match text, § 4); enforcement when the Mod is not loaded, is disabled, or the host skips its hook; protection against another Mod that weakens a verdict; tamper-proof records; approval provenance (§ 7) |
| 5 | First isolated, side-effect-free verifications | V1–V10 in § 9, all on stubs, fixtures or a temporary workspace, in the order they unblock the architecture |

## 1. Problem Essence

| Layer | Content |
|-------|---------|
| Surface | 看得到、能介入、可交接 — a panel, policy refusal, controls and a hand-over for one long-running session |
| Underlying problem | The transcript is the only record: a claimed pass is not bound to a tree, a started job reads like a finished one, and nothing records what the task was allowed to do |
| Success criteria | The brief's § 12 acceptance table, mapped in § 10 below |

The question this study answers: **is a Mod worth more than native features plus a few hooks, and
if so, which minimal part?**

## 2. Constraints

| Type | Constraint | Source | Flexibility |
|------|-----------|--------|-------------|
| Business | Single interactive session in version one; macOS-, CLI-, local-first; no new model API token, Slack crawler, web dashboard, queue, Kubernetes controller or multi-machine scheduling | Brief § 2, § 10 | None |
| Business | Never a gate, credential or verdict writer; reads `review-state.js`, never writes it | Anchor Register #4; intent Non-goals | None |
| Business | Task-policy refusal is best-effort scope control, not a gate; production read-only is the credential's job | Intent Non-goals; brief § 8 | None |
| Business | No auto-approval where no dialog can be shown; a forbidden operation is never upgradable by an approve button | Brief § 3 C, § 4 F4 | None |
| Compatibility | Not shipped inside sd0x-dev-flow while the mods API is marked changeable | Intent Non-goals; types header | None |
| Technical | A failing hook is skipped; per-dispatch budget 10 000 ms of the hook's own time (waits on `next` and most `$` calls do not count); a `.catch` handler gets a fresh 1 000 ms grace on throw, misreturn or overrun | Host types — `EngineEventOf` comment, `HookBudget`, `CatchHandler`, `Caught` | None |
| Technical | Managed-settings hooks run before every hooks module and their deny is the call's result | Host types — `ClassicEventOf` and `tool.call` comments | None |
| Technical | A `tool.check` hook may replace the downstream verdict in either direction | Host types — `tool.check`, `ToolCheckResult` | None |
| Technical | No Node APIs in the hooks module; `$.store` shared machine-wide, 4 MiB, get-then-set not atomic | Official create and interface pages; host types — `store` | Low |
| Resource | Mods are not sandboxed; anything the Mod runs executes as the user | Official overview | None |

## 3. Existing Capability Inventory

| Capability | Source | What it establishes |
|-----------|--------|---------------------|
| Above-prompt band + text command | Spike mod `hooks/register.js`; task-12 report | Terminal draw, `/clear` survival, hot reload, `-p` text reply — **verified locally**; zero model requests on that path not independently metered |
| Gate verdict reading | `scripts/review-state.js` — `check --format=json` | Three gate planes with `digest_match`; a **gate** fact, never an execution fact |
| Runner records | `scripts/precommit-runner.js`, `scripts/verify-runner.js` — `summary.json` | No content digest; a repo-key + short-SHA directory is reused across runs, so attribution to one run is weak |
| Verdict producer | `scripts/precommit-runner.js` notes `review-state.js note precommit` | The Mod must never **start** a producer |
| Tool outcome | Tool types — `Bash` record; host types — `tool.call` result | Error/non-error via `isError`; the Bash record has `stdout`, `stderr`, `interrupted`, `backgroundTaskId`, `returnCodeInterpretation` and **no numeric exit code** |
| Background work | Tool types — `GetTask`; host types — `StopHookInput.background_tasks` | `GetTask` reports `working` / `completed` / `failed` / `cancelled` (**to verify** for Bash ids); the Stop list is in-flight work only |
| Permission decision | Host types — `tool.check`, `$.tool.check` | Verdict `allow` / `ask` / `deny` with `reason` and the deciding `rule`; `$.tool.check` asks without running anything |
| Usage | Host types — `$.session.usage()`, `session.measure` | `rateLimits` is an array of windows keyed by `kind` (e.g. `five_hour`), each with `percentUsed` and an optional `resetsAt`; `session.measure` pushes changes after each main-thread turn |
| Built-in tool inventory | Tool types | `Read` is declared; `Grep` and `Glob` are **not** declared as built-in tools in this build — runtime inventory via `$.tool.list()` **to verify** |
| Command namespace | `grep -rln agentctl` over `~/.claude/{plugins,commands,skills}` and this repo's `skills/` (0 hits; the same probe finds `smart-commit` in 24 files); no `agentctl` on `PATH` | No collision found locally; organisation-installed plugins not checked |

## 4. Options

Effort bands: green < 3 person-days, yellow 3–10, red > 10 — architectural judgements, not
measurements.

### Option 0 — Native baseline: permission rules + status line + classic hooks

**Core idea**: no Mod. `permissions.deny` / `ask` rules (and managed settings where present) carry
the named dangerous invocations; a status-line command shows context and rate limits; classic
`PreToolUse` reads a local task file and refuses out-of-scope calls with exit 2 or a decision;
`PostToolUse` / `PostToolUseFailure` append evidence records; a plain terminal script formats the
hand-over.

| MVP function | Native baseline | What a Mod adds |
|---|---|---|
| Context and rate limits | Status-line command receives them | Pushed updates and a composed band; no exclusive capability |
| Fixed deny/ask rules | Native permission settings, enforced by core independent of any hook's health — **for invocations the rule's text matches** | Nothing |
| Task-scoped refusal | Classic `PreToolUse` reading a task file | In-process integration and the `.catch` contract; not uniquely possible |
| Task record | Local file | `$.store`; not uniquely possible |
| Evidence records | Classic pre/post hooks carry call ids, responses, errors, duration | One adapter around `next(e)` that also updates the panel |
| Hand-over | Terminal script, no model | Model-free `/agentctl handoff` **inside Claude's command namespace** (a skill or slash command spends a model turn) |
| Stop | Native interruption | `$.turn.abort` with task-specific reporting |
| Panel | One status line | A composed band and pane |

| Dimension | Rating | Notes |
|-----------|:------:|-------|
| Technical feasibility | 🟢 | All documented, stable surfaces |
| Effort | 🟢 2–4 d | Scripts and settings |
| Risk | 🟢 | No changeable API; but deny rules match text — `Bash(git push *)` misses `git -C . push` and a package script that pushes ([permissions — what a Bash rule doesn't match](https://code.claude.com/docs/en/permissions)) |
| Extensibility | 🟡 | Several processes and files to keep consistent |
| Maintenance | 🟢 | No Mod API drift |

### Option A — Layered: Option 0 + one Mod (recommended)

**Core idea**: Option 0 keeps the hard rules and the status line; one separately distributed Mod
adds the integrated task/evidence band, model-free `/agentctl` commands, task-scoped refusal with
the four-outcome policy of § 6, bracketed evidence, and turn cancellation.

```mermaid
sequenceDiagram
    participant H as Host
    participant P as Mod policy hook (tool.call)
    participant E as Mod evidence hook (tool.call)
    participant C as Core (permission + tool)
    participant K as Mod tool.check hook
    H->>P: tool.call(e)
    P->>P: classify (pure, before next)
    alt forbidden / unknown / classifier failed
        P-->>H: { deny: rule }
    else permitted
        P->>E: next(e)
        E->>E: fingerprint before delegation (bounded, timeout → partial)
        E->>C: next(e) → hooks beneath, then core
        C->>K: tool.check(e)
        K->>K: next(e) → engine verdict; never weaken deny (§ 6)
        K-->>C: { decision, reason?, rule? }
        C->>C: settle any ask; run or refuse the tool
        C-->>E: ToolCallResult (error / non-error / backgrounded)
        E->>E: fingerprint after result; record keyed by tool_use_id
        E-->>P: result unchanged
        P-->>H: result unchanged
    end
```

| Dimension | Rating | Notes |
|-----------|:------:|-------|
| Technical feasibility | 🟡 | Every primitive declared; adapter grammar and fingerprint are new code |
| Effort | 🟡 6–10 d | For one verified interactive surface/mode; `needs-user` on other surfaces is denied until verified, and broader approval behaviour needs its own estimate |
| Risk | 🟡 | Classifier coverage; host-level skips; API drift; another Mod weakening verdicts |
| Extensibility | 🟢 | Producer receipts and multi-session aggregation attach later |
| Maintenance | 🟡 | Adapter grammar version-pinned to the CLIs it parses |

### Option B — One Mod with a full event journal

Option A plus an append-only journal over every lifecycle event. 🟡 feasibility (coverage under
reload **to verify**), 🟡 6–10 d over A, 🟡 risk of stale "active" entries. History earns no v1
acceptance row.

### Option C — Receipt-centred companion

Selected runners write per-run receipts (unique run id, command, exit, tree coverage) for the Mod to
read. 🟡 feasibility, 🟡 5–9 d for a limited producer set, two release trains. Best evidence where
producers exist; requires changing `precommit-runner.js` and `verify-runner.js` first.

### Option D — Mod + local collector / runner service

Needed only for cross-session history, monitoring after exit, or reliable process management.
🔴 12–20 d; IPC permissions, message authentication, replay protection and orphan handling on
macOS; a daemon under the same OS user is not tamper-proof (brief § 6 B). Deferred.

### Option E — Multi-machine, multi-runtime

Claude Code and Codex adapters, a queue, Web UI, cross-machine kill/resume. Explicitly a later
project (brief § 6 C, § 10). Not rated.

## 5. Codex Discussion Record

Independent research first, then four adversarial rounds on one thread.

| Round | Topic | Codex position | Outcome |
|-------|-------|----------------|---------|
| 0 | Independent analysis | Choose B; **cut** active refusal as incompatible with "never a gate" | Divergent from Claude's single-Mod position |
| 1 | Deny-only refusal; fail-closed; journal | Conceded: `{ deny }` only narrows; `.catch` covers throw/misreturn/overrun; journal unnecessary. New attacks: classifier semantics, unbound runner records, "ran" overclaims, stop ≠ hand-over | Ranking flipped to a single Mod |
| 2 | Mod-produced evidence; default-pass classifier | Error/non-error observable, numeric exit not; HEAD + status is not a content fingerprint; `GetTask` declared; default-pass violates INV-004 | Evidence fields renamed; default-pass rejected |
| 3 | Fixed adapters; hybrid fingerprint; v1 scope | Adapters validate options, not names; hybrid fingerprint misses `assume-unchanged`; Stop list is in-flight only | Equilibrium on the Mod design |
| 4 | The brief: native baseline, layering, `needs-user` | Native rules match command text, not programs; classic hooks can refuse (exit 2); an unconditional `ask` at `tool.check` **weakens a downstream deny**; `ask` goes to the mode's decider, not necessarily a dialog | Option 0 added as the baseline; "never weaken deny" table (§ 6); `needs-user` only on a verified surface/mode |

| Viewpoint | Claude (first position) | Codex | Adopted |
|-----------|-------------------------|-------|---------|
| Refusal | Keep, fail-closed via `.catch` | Cut, then conceded | Keep — deny-only, classified before `next` |
| Hard boundaries | In the Mod | Native rules + credentials | Native rules for matched invocations; credentials for production; the Mod for task scope |
| Evidence | Read runner `summary.json` | Unbound and weakly attributed | The Mod brackets declared checks itself |
| Classifier | Forbidden list + opaque syntax | Semantic default-deny | Default-deny + argument-aware adapters + authorized opaque executors |
| `needs-user` | `ask` at `tool.check` | Unsafe unconditionally | `ask` only over a downstream allow/ask, on a verified surface/mode |
| Is a Mod worth it? | Yes | Only for the integrated view and in-Claude commands | Layered (Option A); Option 0 is the fallback |

## 6. Equilibrium — Design Rules

| Rule | Why |
|------|-----|
| Classification completes before `next(e)`; the policy registration's `.catch` returns `{ deny }` **only when `next` was not called** (`Caught.called === false`) and otherwise returns `next(e)`, which replays the settled downstream result | A catch after delegation cannot undo an executed call and must not replace its outcome |
| Evidence is recorded in a separate registration beneath the policy hook; its failures yield partial or unavailable evidence, never a refusal | A broken fingerprint read must not refuse a permitted check |
| Adapters validate argv against a per-command allow grammar, reject unknown options, and never insert flags | `git branch -D`, `git diff --output=…`, `rg --pre=…` need no shell operator |
| Ambient execution channels are declared per adapter (`core.fsmonitor`, external diff/textconv, `RIPGREP_CONFIG_PATH`) | Configuration can run programs the argv never names |
| An authorized opaque executor (e.g. `npm test`) is shown as "authorized, effects unclassified" | Naming a check is a policy decision, not a classification |
| Fingerprint = HEAD + `ls-files -s -z` + Git-reported changes + raw (`--no-filters`) contents of changed/untracked paths; `assume-unchanged` / `skip-worktree`, conflicts, submodules, unreadable paths or a timeout mark it partial; each subprocess carries an explicit timeout | Closes the re-edit-a-dirty-file case; the hook budget does not bound subprocess wall time |
| Evidence names the requested command, the host-reported error/non-error outcome, and two endpoint fingerprints with coverage | `e.command` may be rewritten beneath; endpoint agreement is not interval proof |
| Only a terminal `GetTask` result closes a background record; a Stop list updates "in flight as of T" | Disappearing from the list is not completion |
| Snapshot writes are serialized per session; in-flight records survive a reload as unresolved | Concurrent saves overwrite |
| Command, URL, path and error text are sanitized before persistence **and** before display — band, `/agentctl`, refusal reasons, hand-over | An allowlisted field can still carry a token in an argument or URL |
| Stop requests cancellation of the current turn; the hand-over is exported whether or not cancellation succeeded | `$.turn.abort` rejects on a stale turn id; Bash may be backgrounded by the abort |

**The four policy outcomes, at `tool.check` — never weaken a deny**

| Downstream verdict (`next(e)`) | Task outcome | Mod result |
|---|---|---|
| any | hard deny, or unknown | `deny` |
| `deny` | any other | `deny`, unchanged |
| `allow` / `ask` | pass-through | downstream verdict, unchanged |
| `allow` / `ask` | needs-user, on a verified interactive surface/mode | `ask` |
| `allow` / `ask` | needs-user, on an unverified or non-interactive surface | `deny`, recorded |

The Mod never creates an `allow` — it passes a downstream `allow` through unchanged on a pass-through call and never upgrades any verdict — holds no approvals of its own, and has no Approval record in v1:
approval is the host's, for the attempted call. A recorded `ask` followed by execution is not proof
that a person approved — `ask` goes to the mode's decider.

## 7. Threat and Failure Matrix

| Threat / failure | Effect | Mitigation | Residual |
|---|---|---|---|
| Mod not loaded, disabled, or its hook skipped | Task-scoped refusal absent | Native rules for named invocations; credentials for production; band shows "policy layer inactive" when the Mod can observe it | Silent when the Mod cannot run at all |
| Classifier throws or overruns before delegation | — | `.catch` → `deny` | Host-level skip (worker crash) |
| Command text evades a native rule (`git -C . push`, script, SDK) | Native rule misses it | Mod default-deny for unclassified invocations; credentials | Authorized opaque executors run with effects unclassified |
| Another Mod weakens a verdict at `tool.check` | A deny becomes allow/ask | Out of this Mod's control; managed-settings hooks run first | Disclosed in the policy field |
| Prompt injection via repo files, logs, tool output | Agent asks for wider scope | Scope changes only through the user's own `/agentctl task`; tool text is data | — |
| Secret in a command, URL, error | Leak into store, band, hand-over | Sanitize before persistence and display; no raw stdout/stderr or environment stored | Unknown secret formats |
| Concurrent sessions on one machine | Store overwrite | Per-session keys; serialized writes; task record per task id | Shared task edited from two sessions (deferred with multi-session) |
| Reload, crash, `/clear`, resume | Lost post-call observation | In-flight records kept as unresolved; SessionStart re-reads repo, branch, tree, policy | Exact recovery **to verify** |
| Duplicate or out-of-order events | Double counting | Records keyed by `tool_use_id` / task id; idempotent updates | — |
| No dialog surface (headless, phone) | `ask` auto-settled by mode | `needs-user` denied off verified surfaces | — |
| Store full (4 MiB) | Writes fail | Bounded records, compact checkpoints, explicit retention | — |

## 8. Minimal Data Model (no database assumed)

| Entity | Key | Holds | v1 |
|---|---|---|---|
| Task | task id (not the session id) | goal, repo/worktree, allowed scope, forbidden classes, authorized executors, acceptance conditions, result, policy version | ✅ |
| Session | session id + parent/lineage | surface, repo, branch, capabilities, last activity | ✅ |
| Operation | `tool_use_id` | requested command (sanitized), start/end, outcome, background id | ✅ |
| Evidence | operation + declared check | outcome, endpoint fingerprints, coverage, freshness | ✅ |
| PolicyDecision | operation | rule, version, outcome, reason | ✅ |
| Checkpoint | task + time | snapshot for hand-over | ✅ |
| Approval | — | The host owns approval in v1 | ❌ |

Sources of truth are kept apart: user-confirmed scope, Claude's proposed plan, and tool-observed
facts never overwrite one another (brief § 4 F1).

## 9. Verification Plan (isolated, side-effect-free; in unblock order)

Every item runs under `claude plugin test` stubs, fixtures, or a temporary workspace — never
against production or a real remote.

| # | Verification | Unblocks |
|---|---|---|
| V1 | The installed version loads a Mod and the organisation's managed settings allow it; managed hooks' precedence over modules | Whether Option A exists at all; otherwise Option 0 |
| V2 | A constant `.catch` returning `{ deny }` refuses a forbidden call end to end; with `called === true` the replayed result stands | FR-7 / FR-10 |
| V3 | `tool.check` returning `ask` on each surface/mode (interactive terminal, `-p`, Remote Control): dialog, auto-settle, or refusal | `needs-user` scope |
| V4 | `tool.call` coverage of main agent, subagent, MCP tools; runtime tool inventory (`$.tool.list()`) | Adapter set |
| V5 | Foreground Bash non-zero exit, timeout and interrupt mapping onto `isError`; `GetTask` with a Bash `backgroundTaskId` | FR-5 / FR-6 |
| V6 | `$.turn.abort` with a running and a backgrounded command; what ends and what survives | FR-12 |
| V7 | `(await $.session.usage()).rateLimits.find(w => w.kind === 'five_hour')` on this account; `session.measure` timing | FR-2 usage field |
| V8 | Fingerprint latency on a representative dirty tree, with per-subprocess timeouts | NFR-4; evidence cost |
| V9 | Store under two concurrent sessions and a mid-write crash | Snapshot design |
| V10 | Band under SSH/tmux, a narrow terminal, CJK wide characters, and after reload; disable/uninstall leaves no process or setting behind | UI acceptance; removal row |

## 10. Brief § 12 Acceptance Mapping

| Brief scenario | Met by |
|---|---|
| Ordinary local read adds no approval | Pass-through preserves the downstream verdict |
| Write outside the allowed directory refused | Mod default-deny with the rule named |
| Production restart/deploy: no one-click approval | Native rule (matched text) + credentials; Mod hard deny; never `ask` |
| Guard throw/timeout fails closed | `.catch` before delegation (V2); native rules independent of the Mod |
| Native deny never becomes allow | § 6 table — this Mod never weakens a deny; other Mods disclosed |
| Unparseable sensitive script not passed | Unclassifiable → deny |
| Approval needed with no interactive surface | `needs-user` → deny, recorded |
| Long silent test | "tool running since T", never "stalled" from silence alone |
| Background job started | "started, completion unobserved" until a terminal result |
| Model says all tests pass | Unverified unless an evidence record exists |
| Code changed after a test | Evidence shown stale against the new fingerprint |
| Session reopened | Hand-over shown; repo, branch, tree, policy re-read; no Mod-held approval exists to carry over |
| Usage field missing | `unavailable`, never `0%` |
| Duplicate events / notifications | Keyed records; one notice per blocking reason, re-notified on change |
| Rate limit reached | Model-free snapshot and hand-over |
| Disable / uninstall | No resident process, no permission change (V10) |

## 11. Requirements Gaps Against the Brief

`1-requirements.md` was written before the full brief reached the session. Items to bring in with
`/req-analyze --update` (a re-decision for INV items, per the intent's own header):

| Gap | Brief source |
|---|---|
| The four-outcome policy (pass-through / deny / needs-user / unknown) and "never weaken a deny" | § 4 F4 |
| Separate domain states: work phase, runtime state, intervention reason, task result | § 4 F2 |
| Local notices with de-duplication, cool-down and severity; external channels pluggable and deferred | § 4 F7 |
| Usage: plan windows of one account are never summed across sessions; no cost projection | § 4 F8 |
| `/agentctl` command namespace and its subcommands | § 5 |
| Minimal data model and source-of-truth separation | § 4 F1, § 9 |
| Acceptance rows: native deny never becomes allow; disable/uninstall leaves nothing behind; latency and write-volume baselines | § 12 |
| Rewordings from the earlier rounds: FR-5/INV-002 (error/non-error + fingerprints), FR-6/INV-003 (terminal result), FR-11/FR-14 (no pause in v1), FR-12/FR-18/INV-006 (tracked tasks only), FR-3/INV-001 (missing vs failed vs stale), NFR-9/INV-007 (sanitize before persistence and display) | § 6 above |

## 12. Recommendation

**Recommended: Option A (layered)** — Option 0's native rules, credentials and status line carry
every boundary they can; one Mod earns its cost only for the integrated task/evidence band,
model-free `/agentctl` status and hand-over, task-scoped refusal under § 6, and turn cancellation.
6–10 person-days for one verified interactive surface/mode.

**Fallback: Option 0 alone**, if V1 shows Mods are not allowed or the Mod API changes under the
design. What is kept then: the task file, classic-hook refusal and evidence records, the status
line, and a terminal hand-over script.

**Not for v1**: B (no acceptance row needs history), C (runner changes first, as their own change),
D and E (deferred by the brief).

## 13. Next Steps

- `/req-analyze --update` — § 11
- V1–V3 as a verification spike in the separate spike repository; they decide between A and 0
- `/tech-spec` — design Option A against § 6 once V1–V3 pass
