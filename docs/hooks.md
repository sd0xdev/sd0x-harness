# Hooks Reference

Since hook-lightweighting (2026-08-13) every review-layer hook is a **reminder**: markdown out,
exit 0 on every path, nothing blocks. Two exceptions still block with exit 2, and neither is
workflow enforcement: `pre-edit-guard` — a security guard (sensitive paths) — and
`pre-bash-codex-launch-guard` — a transport-contract guard on how a Codex dispatch is launched.
Verdict state is one slot per plane under `~/.cache/sd0x-dev-flow/state/`,
written only by `node scripts/review-state.js note <plane> <pass|fail>` (the model after a review
ran; the precommit runner on its own conclusive outcome) and read by the state-aware hooks via
`node scripts/review-state.js check` (installed projects resolve `.claude/scripts/review-state.js`
first).

| Hook | Trigger | Purpose |
|------|---------|---------|
| `namespace-hint` | SessionStart (`startup\|clear\|compact`) | Inject plugin command namespace guidance, and the plugin root (`Plugin root:`) that resident contract paths resolve against, into Claude context |
| `pre-edit-guard` | Before Edit/Write | Block sensitive-path edits (.env/.git) — security guard, still exits 2. **Requires `jq`**: without it the path cannot be extracted and the guard silently does not fire (fail-open, pinned by `test/hooks/pre-edit-guard.test.js`) |
| `pre-bash-codex-launch-guard` | Before Bash | Block a `codex-exec.js start`/`resume` launch that is not `run_in_background: true`, or that redirects or pipes stdout/stderr (anywhere on that simple command), wraps in `nohup`/`setsid`, or backgrounds with a trailing `&` — those cut a long review off or hide the adapter's live progress from the task panel. Judged per top-level simple command by a quote-aware lexer (the command word must be `node` running a `…codex-exec.js` path — written literally, or through a variable this same tool input assigns; every such launch is checked), so a quoted mention in a `grep` pattern or a comment passes (`codex-transport.md` § Progress step 1); exits 2 with the correct launch shape on stderr. `alloc`/`cleanup` and every non-Codex command pass. **Boundary, by design**: a launch hidden inside `bash -c '…'`, `eval`, `$(…)` or backticks is a quoted word to the lexer and passes, and so does a locator held in a variable that an earlier tool call assigned — the guard targets the launch shapes that were measured, not arbitrary shell. **Requires `jq` and `node`**: without either the command cannot be judged and the guard does not fire (fail-open, pinned by `test/hooks/pre-bash-codex-launch-guard.test.js`) |
| `post-edit-format` | After Edit/Write | Auto prettier; the digest change is what re-opens the plane's reminder |
| `post-skill-auto-loop` | After Skill tool | Print the static gate-order reminder (review → precommit → doc-sync) — deliberately state-blind, it reads nothing |
| `stop-guard` | Before stop | Print owed-gate reminders from the state (git fallback when the checker is absent) — never blocks |
| `post-compact-auto-loop` | SessionStart (compact) | Re-inject git baseline (branch + uncommitted files) and the same owed-gate reminders |
| `user-prompt-review-guard` | Before each prompt | Print the `[AUTO_LOOP_STATE]` fact line plus a rule pointer (owed-gate lines are rendered by `stop-guard` and `post-compact-auto-loop`) |

Customization:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOOK_BYPASS` | (unset) | Any non-empty value silences the four reminder hooks (`stop-guard`, `user-prompt-review-guard`, `post-skill-auto-loop`, `post-compact-auto-loop`); `pre-edit-guard`, `pre-bash-codex-launch-guard`, `post-edit-format` and `namespace-hint` do not read it |
| `HOOK_NO_FORMAT` | (unset) | Set `1` to disable auto-formatting |
| `GUARD_EXTRA_PATTERNS` | (unset) | Regex patterns for extra protected paths (e.g. `src/locales/.*\.json$`) |
| `AUTO_LOOP_CHECK_TIMEOUT` | `10` | Seconds allowed for the `review-state.js check` call inside a hook |

Retired settings: `STOP_GUARD_MODE`, `REVIEW_GUARD_COOLDOWN`, `HOOK_DEBUG` — dead config since
hook-lightweighting; the migration (`scripts/migrate-hook-lightweighting.js`) removes
`STOP_GUARD_MODE` from settings and `/claude-health` flags a leftover as P2.

**Dependencies**: reminder rendering needs `node` (for `review-state.js`; hooks fall back to plain
git facts without it, claiming no verdict). Auto-format requires `prettier`. `pre-edit-guard`
requires `jq`, and `pre-bash-codex-launch-guard` requires `jq` and `node` — without them each guard is **disabled**, not degraded. Other missing
dependencies degrade gracefully — a reminder hook never fails the tool call it rides on.
