# T1 — Scaffold the mod, reducer, sanitizer and store chain

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-03
> **Status**: Completed
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 5 task 1
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-3, FR-4, NFR-1, NFR-9
> **Code location**: `~/Projects/agentctl-mod` (outside sd0x-dev-flow, per the intent's Non-goals)

## Background

The mod needs a home outside sd0x-dev-flow and the pure core every later task builds on: the four-dimension state reducer, the sanitizer, and the per-session serialized store writer.

## Requirements

- Create the separate repository `~/Projects/agentctl-mod` (git), with `.claude-plugin/plugin.json`, `hooks/hooks.json`, `tsconfig.json` and the host type declarations
- `lib/reducer.js`: pure `reduce(state, observation)` over work phase, runtime state, intervention reasons and task result (tech spec § 3.4 State)
- `lib/sanitize.js`: the NFR-9 redactions and the text-field caps (tech spec § 3.2, § 3.4 Sanitize)
- `lib/store.js`: one write chain per session, session-keyed records, retention at session start, `health: store-error` on a failed write

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 5 task 1 |
| Out | Other § 5 tasks; anything in tech spec § 1 Out |

## Related Files

| File (in `~/Projects/agentctl-mod`) | Action | Description |
| ---- | ------ | ----------- |
| `lib/reducer.js` | New | Four-dimension reducer |
| `lib/sanitize.js` | New | Redaction and caps |
| `lib/store.js` | New | Serialized per-session writes, retention |
| `tests/reducer.test.ts, tests/sanitize.test.ts, tests/store.test.ts` | New | Unit tests |

## Acceptance Criteria

- [x] Every reducer transition in tech spec § 3.4 State has a test, including concurrent facts (a permission request beside a background job)
- [x] Suspected stall is reported only under all three conditions and always labelled unconfirmed
- [x] Sanitizer tests cover a token in an argument, a credential in a URL, a `KEY=value` secret and a bearer header, and the text caps
- [x] Two sessions writing concurrently never overwrite each other's records; retention deletes beyond 7 days and beyond 5 per task
- [x] A failed store write surfaces as `store-error` health
- [x] `claude plugin test` passes
- [x] Pass /codex-review-fast

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3–§ 5 |
| Development | Done | agentctl-mod `0c6a29b` |
| Testing | Done | `claude plugin test .` 124 pass and `claude plugin validate .` passes on the working tree after the AC-verification fixes (agentctl-mod, 2026-10-04) |
| Acceptance | Done | reducer, sanitize, store tests; Codex code review ✅ Ready (thorough, round 3). Verified live — see T8. `/codex-review-fast` (thorough): ✅ Ready on every round touching this task, latest on the AC-verification fixes. `--verify-ac` (2026-10-04): every AC Complete at High, accounted one result per AC |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Feasibility: [0-feasibility-study.md](../0-feasibility-study.md)
