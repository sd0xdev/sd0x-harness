# Mods assessment in a companion repository (task 12)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Archived
> **Note**: Closed by the user's decision on 2026-10-03: the unobserved cases (worktree change, worker crash, VS Code, cloud) will not be tested, so the two partial ACs stay unchecked rather than being marked met
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

- [x] Correctness: the band shows the right facts for a valid, stale, missing and failed state slot
- [x] Presentation-only: no verdict write, permission decision, approval control, prompt rewrite or model routing — shown from the mod's source
- [ ] Lifecycle: behaviour recorded for hot reload, disable, `/clear`, a worktree change and a worker crash
- [ ] Where no mod UI is drawn (VS Code, `-p`, cloud): behaviour recorded as observed, never assumed
- [x] Cost: the mod's measured launch and per-turn cost recorded
- [x] `/codex-review-doc` ✅ Mergeable on the report

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Parallel, § 4 risk "Mods spike grows into a migration" |
| Development | Done | Spike in `~/Projects/sd0x-mods-spike/sd0x-gate-band/`; time box set by the user to this session (2026-10-03) |
| Testing | In Progress | 8 tests pass; `-p` measured; terminal lifecycle observed (load, `/plugin`, `/clear`, disable/enable, hot reload). Not tested: worktree change, worker crash. Not observed: VS Code, cloud — see the report |
| Acceptance | In Progress | 4/6 ACs met and the report passed doc review. The lifecycle and no-UI-surface ACs stay unchecked: a worktree change, a worker crash, VS Code and cloud were not observed, and the user decided on 2026-10-03 not to test them |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4 Parallel, § 5 task 12
- Intent: [intent-claude-code-2-1-288-compat.md](../intent-claude-code-2-1-288-compat.md) Non-goals
