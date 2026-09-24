# R1 — Single protected-branch resolver, read by every mutating workflow

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Pending
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

The protected set is hard-coded four times (`pre-push-gate.sh`, `/push-ci`, `/epic-merge`, `/gh-stack`), and a project cannot widen it. Tech spec § 3.3 `protected-branches.sh`; security-bearing, reviewed at `thorough`.

## Requirements

- `scripts/protected-branches.sh <branch>`: default `main master develop release/*` ∪ `## Protected Branches` of the first **existing** of `.claude/rules/git-workflow-project.md`, `rules/git-workflow-project.md`; exit 0 / 1 / 2; `--list`
- An unreadable or unparseable selected file → exit 2 with no fallback; every caller treats 2 as protected
- Additions only: `- <name>` or `- <prefix>/*`; a removal attempt (`- !main`) is a parse error
- `pre-push-gate.sh` inlines the same function with a `# keep in step with scripts/protected-branches.sh` marker
- `/push-ci`, `/epic-merge`, `/gh-stack` replace their `case main|master|develop|release/*` arms with the resolver

## Scope

| Scope | Description |
| ----- | ----------- |
| In    | Resolver, hook inline copy, the three skills' protected checks, tests |
| Out   | The override file's scaffold and registration (R2); `next-step`/`remind` detectors |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `scripts/protected-branches.sh` | New | Resolver |
| `test/scripts/protected-branches.test.js` | New | Unit + parity |
| `scripts/pre-push-gate.sh` | Modify | Inline copy of the resolver |
| `skills/push-ci/SKILL.md` | Modify | Protected check via resolver; `SKILL_DIGEST` re-recorded |
| `skills/epic-merge/SKILL.md` | Modify | PR-head protected validation via resolver |
| `skills/gh-stack/SKILL.md` | Modify | Layer refusal via resolver |

## Acceptance Criteria

- [ ] Defaults are protected with no override file; exact and `prefix/*` additions are protected; an additions list omitting a default leaves the default protected
- [ ] A removal attempt, an unreadable file, and an unparseable file each exit 2; a lower-precedence file is never consulted when the higher one exists
- [ ] Parity test: `protected-branches.sh` and the hook's inlined function agree on one fixture corpus; mutating either breaks the test
- [ ] `pre-push-gate.sh`, `/push-ci`, `/epic-merge`, `/gh-stack` all treat a project-added `rel/*` branch as protected, and all four treat every branch as protected when the resolver exits 2 (end-to-end in temp repos)
- [ ] Existing pre-push-gate, push-ci, epic-merge and gh-stack suites pass unchanged in behaviour

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | -      |      |
| Development | -     |      |
| Testing    | -      |      |
| Acceptance | -      |      |
