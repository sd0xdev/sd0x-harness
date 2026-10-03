# Mods assessment in a companion repository (task 12)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Pending
> **Note**: Not started — the spike runs in a separate repository the user has not yet created, and its observations need a person at the terminal, VS Code and a cloud session
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

Claude Code 2.1.287 ships Mods, which run ahead of plugin `PreToolUse` hooks and fail open. The
mods API is marked as changeable without notice, so sd0x-dev-flow does not ship one (intent
Non-goals). The tech spec asks for a time-boxed, isolated assessment instead (§ 3.4 Parallel).

## Requirements

- A presentation-only companion mod, loaded with `--plugin-dir` from a separate repository, that
  shows `review-state.js check --format=json` through `$.process.run`
- The mod writes no verdict, makes no permission decision, offers no approval control, rewrites no
  prompt and routes no model (intent Non-goals; Anchor Register #4 names the credentials)
- When the time box ends, a report in this `requests/` directory answers the five questions below;
  nothing from the spike is incorporated without a separate decision

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Companion repository, the mod, the five-question report |
| Out | Any mod in this repository; any change to hooks, gates or credentials |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `docs/features/claude-code-2-1-288-compat/requests/<date>-mods-assessment-report.md` | New | The report, written when the time box ends |

## Acceptance Criteria

- [ ] Correctness: the band shows the right facts for a valid, stale, missing and failed state slot
- [ ] Presentation-only: no verdict write, permission decision, approval control, prompt rewrite or model routing — shown from the mod's source
- [ ] Lifecycle: behaviour recorded for hot reload, disable, `/clear`, a worktree change and a worker crash
- [ ] Where no mod UI is drawn (VS Code, `-p`, cloud): behaviour recorded as observed, never assumed
- [ ] Cost: the mod's measured launch and per-turn cost recorded
- [ ] `/codex-review-doc` ✅ Mergeable on the report

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Parallel, § 4 risk "Mods spike grows into a migration" |
| Development | - | |
| Testing | - | |
| Acceptance | - | |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4 Parallel, § 5 task 12
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) Non-goals
