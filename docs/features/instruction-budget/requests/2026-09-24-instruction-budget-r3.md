# R3 — Measure the always-loaded total and flag lessons files in rules

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Pending
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R1](./2026-09-24-instruction-budget-r1.md), [R2](./2026-09-24-instruction-budget-r2.md)

## Background

Tech spec § 3.3. The user should learn about an over-limit setup from the harness, with the plugin's share separated out.

## Requirements

- `scripts/instruction-budget.js` reproduces the launch accounting (§ 3.3 steps 1–5)
- `/claude-health` gains `### Instruction Budget Module` after `### Fix Tiers`
- A ceiling test pins the plugin's always-loaded share at 80,000 characters

## Acceptance Criteria

- [ ] Fixtures: a path-scoped rule is excluded, `paths: "**"` is included, an `@` import is followed once, an over-limit file is reported and left out of the sum
- [ ] A `.claude/rules/lessons.md` fixture yields one finding naming the move
- [ ] The fresh-install ceiling test passes at ≤ 80,000 and fails when a resident rule grows by enough to exceed the ceiling by one character (the gap is measured, not assumed)
- [ ] `npm test` green

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | -      |      |
| Development | -     |      |
| Testing    | -      |      |
| Acceptance | -      |      |
