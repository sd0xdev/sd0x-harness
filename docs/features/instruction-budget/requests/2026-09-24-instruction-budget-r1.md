# R1 — Path-scope four rules and stop importing them

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

Tech spec § 3.1. A path-scoped rule is not loaded at launch, unless a `CLAUDE.md` `@`-imports it.

## Requirements

- `docs-numbering.md`, `docs-writing.md`, `testing.md`, `testing-project.md` gain the § 3.1 `paths:` frontmatter
- `CLAUDE.template.md` `## Rules` references them as plain text; root `CLAUDE.md` keeps its `@` lines
- `/claude-health` S2.5 #3 accepts a plain reference for a path-scoped template and reports an `@` import of one (P2)
- `/project-setup` counts read "13 `@rules/` imports + 4 path-scoped references"

## Acceptance Criteria

- [x] Each of the four rules starts with the § 3.1 frontmatter, pinned by a test
- [x] `CLAUDE.template.md` contains no `@rules/` line for the four, and names each in plain text
- [x] `/claude-health` S2.5 #3 accepts the plain reference and flags an `@` import of a path-scoped template
- [x] `/install-rules` copies the frontmatter unchanged (a test over the copy)
- [x] `npm test` green

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | Globs per tech spec § 3.1; root `CLAUDE.md` keeps its `@` lines (this repo has no `.claude/rules/`) |
| Development | Done  | Four rules carry `paths:`; `CLAUDE.template.md` names them in plain text; `/claude-health` S2.5 #3 accepts that and flags an `@` import of a path-scoped template (P2); `/project-setup` counts and backfill use the plain form and rewrite a legacy `@` line |
| Testing    | Done   | `test/rules/path-scoped-rules.test.js` (globs, no `@` import, resident rules unscoped); install fixture keeps the frontmatter; carrier and count tests accept plain references; `npm test` 4939/4939; `/precommit` ✅ PASS |
| Acceptance | Done   | Codex review ✅ Ready (backfill P2 fixed on the spot); `--verify-ac` 2026-09-25: 5/5 Complete; AC 4 at Medium-High (the frontmatter copy is tested for `testing-project.md`, the one path-scoped rule that goes through the override-template path), hence Candidate Complete |