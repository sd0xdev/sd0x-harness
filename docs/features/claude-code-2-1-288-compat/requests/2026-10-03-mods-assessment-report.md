# Mods assessment report — sd0x-gate-band spike

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Point-in-time record of the task 12 spike; it reports, it does not change sd0x-dev-flow.
> **Created**: 2026-10-03
> **Status**: Completed
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- § 3.4 Parallel, the five questions
> **Ticket**: [2026-10-03-t12-mods-assessment.md](./2026-10-03-t12-mods-assessment.md)

## Setup

- Host: Claude Code 2.1.288, macOS, measured 2026-10-03. Time box: this session (2026-10-03),
  chosen by the user.
- Companion repository: `~/Projects/sd0x-mods-spike/sd0x-gate-band/` — a plugin outside this repo.
  Files: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.js`,
  `hooks/summarize.js`, `tests/gate-band.test.ts`.
- What it does: draws one dim line above the prompt with the three gates from
  `review-state.js check --format=json` (`.claude/scripts/` first, then `scripts/`), and adds a
  `/gate` command that prints the same line. It refreshes at session start, every 15 s and at each
  turn end.
- In-session load: copied into this session's `~/.claude/dev-mods/<session-id>/` folder. UI
  observations were read from the session's own terminal (tmux) by a second agent and relayed by
  the user.

## The five questions

| # | Question | Result | Evidence |
|---|----------|--------|----------|
| 1 | Correctness across valid / stale / missing / failed state | **Pass** | `claude plugin test`: 8 pass, 0 fail. Valid reads `✅`; a verdict at an older digest reads `⏳ stale`; no verdict with a dirty tree reads `⏳ owed`; a failed verdict at the current digest reads `⛔ fail`; a missing slot reads `?`; non-JSON output, a nonzero exit and a process that cannot start all read `gates: unknown (…)`, never a pass |
| 2 | Presentation-only | **Pass** | `claude plugin validate` lists hooks `session.start`, `turn.complete`, `command.run{command=gate}`, `ui.render{component=AbovePrompt}` and calls `$.clock.every`, `$.clock.now`, `$.command.register`, `$.fs.exists`, `$.process.run`, `$.ui.invalidate`, `$.ui.resolve`. No `tool.call`, `prompt.submit` or `turn.step` hook; no `$.store` write, `$.prompt`, `$.model`, `$.tool`, `$.session.send` or `$.env.set` call. The band keeps other mods' band output beside its own |
| 3 | Lifecycle | **Partial** | Observed in the terminal: loaded from the session's mods folder; `/plugin` lists `sd0x-gate-band` 0.1.0 Enabled, `1 mod active`; the line survives `/clear`; disabling in `/plugin` removes it and re-enabling restores it; an edit to the loaded source (a `(v2)` marker) showed as `gates(v2) · …` after the turn ended — hot reload works. **Not tested**: a worktree change and a worker crash |
| 4 | Where no mod UI is drawn | **Partial** | `claude -p "/gate" --plugin-dir …` in this repo printed `sd0x-gate-band: gates · code ✅ · doc ✅ · precommit ✅ (check 83 ms)`; outside any repo it printed `gates: unknown (no review-state.js here)`. **Not observed**: the VS Code chat panel and a cloud session — the host documents that hooks run there and nothing draws, which this spike did not confirm |
| 5 | Cost | **Measured** | One `review-state.js check` takes about 83–100 ms (`time node scripts/review-state.js check --format=json`: 0.10 s real). The mod runs it at session start, every 15 s and once per turn end. A whole `claude -p "/gate"` run took 3.45 s wall. No baseline run without the mod was measured, so the mod's own start-up overhead is not isolated from the CLI's |

## Findings worth keeping

- **The facts are reproducible outside the session.** The band shows nothing a user cannot get
  from `review-state.js check`, so it adds visibility, not a new source of truth.
- **The hook layer cannot see a mod.** A mod runs ahead of plugin `PreToolUse` hooks and fails open
  (2.1.287), and its `$.process.run` runs outside the sandbox. Nothing in this spike changes the
  decision that a mod is never a credential or an enforcement layer (intent Non-goals).
- **A band is opt-in per user.** It loads only from a session's mods folder after approval, from
  `--plugin-dir`, or from an installed plugin. Shipping it would need its own decision.

## Recommendation

Do not incorporate the mod into sd0x-dev-flow now. The mods types still say the surface may change
without notice, and two lifecycle cases and two surfaces are unobserved. Keep the companion
repository as a reference; revisit only by a separate decision once the API is marked stable, and
then as an optional, separately installed plugin, never as part of the gate path.

## Acceptance Criteria

- [x] The five questions each have a result and the evidence behind it
- [x] Untested and unobserved cases are named as such, not assumed
- [x] `/codex-review-doc` ✅ Mergeable
