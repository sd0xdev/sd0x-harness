# R3 — Measure the always-loaded total and flag lessons files in rules

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R1](./2026-09-24-instruction-budget-r1.md), [R2](./2026-09-24-instruction-budget-r2.md)

## Background

Tech spec § 3.3. The user should learn about an over-limit setup from the harness, with the plugin's share separated out.

## Requirements

- `scripts/instruction-budget.js` reproduces the launch accounting (§ 3.3 steps 1–5)
- `/claude-health` gains `### Instruction Budget Module` after `### Fix Tiers`
- A ceiling test pins the fresh-install always-loaded total at 90,000 characters (measured 89,472; tech spec § 3.3)

## Acceptance Criteria

- [x] Fixtures: a path-scoped rule is excluded, `paths: "**"` is included, an `@` import is followed once, an over-limit file is reported and left out of the sum
- [x] A `.claude/rules/lessons.md` fixture yields one finding naming the move
- [x] The fresh-install ceiling test passes at ≤ 90,000 and fails when a resident rule grows by enough to exceed the ceiling by one character (the gap is measured, not assumed)
- [x] `npm test` green

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | The fresh-install total is 89,472 (the first ~75,000 estimate left out the CLAUDE template), so the ceiling is 90,000 |
| Development | Done  | `scripts/instruction-budget.js` (paths test, breadth-first imports, per-file exclusion, derived total, provenance share, lessons flag); `/claude-health` Instruction Budget Module running the plugin install's copy only; README script counts |
| Testing    | Done   | `test/scripts/instruction-budget.test.js` (10, incl. ceiling and its measured-gap negative control); health module test; `npm test` 4951/4951; `/precommit` ✅ PASS |
| Acceptance | Done   | Codex review ✅ Ready (repo-copy execution, template left out of the share, depth-first import skip — all fixed); `--verify-ac` not yet run, hence Candidate Complete |