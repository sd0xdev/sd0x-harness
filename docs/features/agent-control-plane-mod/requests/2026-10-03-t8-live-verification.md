# T8 — Live verification, README and removal check

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: Completed
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

- [x] V3 result recorded per surface and mode; the verified-surface list is updated only from a recorded dialog
- [x] V5 and V6 results recorded and reflected in FR-6 / FR-12 behaviour
- [x] V7 usage window and V8 fingerprint latency recorded; NFR-4 targets fixed from the measurement
- [x] Signal 12: after disable and uninstall no mod process runs and permission settings are byte-identical
- [x] README states the tested version and the non-isolation boundary
- [x] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | Done | README written in agentctl-mod; live results recorded there. A live run found task-less sessions escaping the per-task retention cap — fixed with a regression test |
| Testing | Done | `claude plugin test .` 133 pass and `claude plugin validate .` passes on the working tree after the AC-verification fixes (agentctl-mod, 2026-10-04); 137 pass after the V3 test split below |
| Acceptance | Done | 2026-10-04, live in a scratch repository — headless (`claude -p --plugin-dir`, stream-json) on 2.1.288 and interactive in tmux on 2.1.289. Passed: load and model-free `/agentctl`; refusal before execution; host path for allowed calls; non-zero exit as `isError`; background completion from the host's notification (V5); subagent and MCP tool calls through the same policy (V4); 5 h window after a model turn (V7); ~90 ms tree reading (V8, within NFR-4); concurrent sessions (V9); Signal 12 by a real install from a local marketplace, disable and uninstall: no mod process left and the `permissions` settings byte-identical (the host itself left an empty `extraKnownMarketplaces` key and a plugin cache, which were restored); NFR-4 targets fixed in `1-requirements.md` from these measurements; band with CJK at 80 and 50 columns (V10); immediate stop cancelled a running turn and reported the command the host moved to the background (V6); `ask` showed the host's own dialog on the interactive terminal in manual mode and was not auto-approved under `-p` (V3). Found and fixed: task-less retention, `ToolSearch` refused, background completion missed, a concurrent context build on interactive start. Not verified at that point: `needsUser` on Desktop, VS Code, mobile and the other permission modes; SSH (the modes were extended below). `/codex-review-fast` (thorough): ✅ Ready on the race fix and on the AC-verification fixes. V3 extended on the terminal: `acceptEdits` and `auto` showed the host dialog, `dontAsk` refused; the verified list now enables `needsUser` only for the interactive terminal in `default`/`acceptEdits`/`auto`, re-run live with the shipped code (manual: dialog; `dontAsk`: refused). Not exercised: Desktop, VS Code and mobile (GUI surfaces not drivable here), `plan`, and `bypassPermissions` (its warning is the operator's to accept) — all refuse `needsUser`. AC re-verification found two V3 test titles claiming more than they asserted (`dontAsk`; a non-interactive terminal); split into separate tests that also cover VS Code and mobile. `/codex-review-fast` (thorough) on the V3 mode extension and that test split: ✅ Ready. `/create-request --update --verify-ac` (2026-10-04): every AC Complete at High, accounted one result per AC. Residual (not blocking): the live runs show `permission_mode` read from classic inputs for `default` and `dontAsk`; the exact `acceptEdits`/`auto` strings were not observed through the shipped code — a different spelling refuses rather than asks. Residual closed the same day: a plain classic `UserPromptSubmit` hook on 2.1.289 received `default`, `acceptEdits`, `auto`, `plan` and `dontAsk` verbatim (on Haiku, which lacks auto mode, `--permission-mode auto` arrives as `default`, which is also verified) |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
