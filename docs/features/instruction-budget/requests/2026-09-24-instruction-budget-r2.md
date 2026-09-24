# R2 — Codex prompt contract on demand behind a resident core

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R1](./2026-09-24-instruction-budget-r1.md)

## Background

Tech spec § 3.2. The contract is read before a review dispatch, not on every launch.

## Requirements

- Full text moves to `skills/codex-code-review/references/codex-invocation.md`, registered in `CONTRACTS`
- `rules/codex-invocation.md` keeps the core prohibition, every cited heading with its one-line rule and a pointer, and the stop rule
- Tests that pin the contract's text read the reference

## Acceptance Criteria

- [x] `contract-routing.test.js` resolves every former section citation and pins the reference's headings
- [x] The resident file states the core prohibition and the stop rule (a missing reference dispatches nothing)
- [x] `codex-transport.test.js` and `review-loop-resilience.test.js` pin the same clauses in the reference
- [x] `npm test` green

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | The reference is named `codex-invocation-contract.md` so a `rules/codex-invocation.md` mention in the owning skill is not read as a bare reference |
| Development | Done  | Full text in `skills/codex-code-review/references/codex-invocation-contract.md`; `rules/codex-invocation.md` is a 2.5k-character core (was 10.4k) with the stop rule and every cited heading; `codex-code-review` names the reference |
| Testing    | Done   | `CONTRACTS` registers the reference; contract-pinning tests read it; `npm test` 4940/4940; `/precommit` ✅ PASS |
| Acceptance | Done   | Codex review ✅ Ready; `--verify-ac` not yet run, hence Candidate Complete |