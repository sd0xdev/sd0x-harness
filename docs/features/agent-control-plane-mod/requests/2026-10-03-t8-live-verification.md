# T8 — Live verification, README and removal check

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: In Progress
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 5 task 8
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-26, NFR-4, NFR-7
> **Code location**: `~/Projects/agentctl-mod` (outside sd0x-dev-flow, per the intent's Non-goals)

## Background

Stub tests cannot establish surface behaviour, abort semantics or removal; these need a scratch repository and a dev-mod load, never production.

## Requirements

- Run feasibility V3–V10 in a scratch repository with the mod loaded as a dev mod; record results in this ticket
- README names the tested Claude Code version and the native `permissions.deny` rules the user should keep
- Removal check after disable and uninstall

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 5 task 8 |
| Out | Other § 5 tasks; anything in tech spec § 1 Out |

## Related Files

| File (in `~/Projects/agentctl-mod`) | Action | Description |
| ---- | ------ | ----------- |
| `README.md` | New | Install, limits, tested version |
| `docs/features/agent-control-plane-mod/requests/ (this ticket)` | Modify | Verification results |

## Acceptance Criteria

- [ ] V3 result recorded per surface and mode; the verified-surface list is updated only from a recorded dialog
- [ ] V5 and V6 results recorded and reflected in FR-6 / FR-12 behaviour
- [ ] V7 usage window and V8 fingerprint latency recorded; NFR-4 targets fixed from the measurement
- [ ] Signal 12: after disable and uninstall no mod process runs and permission settings are byte-identical
- [x] README states the tested version and the non-isolation boundary
- [ ] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | In Progress | README written in agentctl-mod; live results recorded there. A live run found task-less sessions escaping the per-task retention cap — fixed with a regression test |
| Testing | - | |
| Acceptance | In Progress | 2026-10-04 live, headless (`claude -p --plugin-dir`, stream-json for multi-turn), scratch repo. Passed: load and model-free `/agentctl`; refusal before execution; host path for allowed reads; non-zero exit as `isError` and a backgrounded check closed from the host's task notification (V5); subagent tool calls refused by the same rule (V4, agents); 5 h window `1%` with reset after a model turn (V7); two concurrent sessions (V9); no leftover process (V10, process half); tree reading ~90 ms / 500 changed paths (V8). Under `-p`, an `ask` was not auto-approved (V3, `-p` only) and stream input waits for the turn, so `immediate` stop could not be exercised (V6). Found and fixed: task-less session retention, `ToolSearch` refused, background completion missed without polling. Still owed, interactive only: V3 on terminal/Desktop/VS Code/mobile, V6, V4 for MCP, V10 display |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
