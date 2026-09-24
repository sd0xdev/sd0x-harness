# R1 — Single protected-branch resolver, read by every mutating workflow

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Candidate Complete
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

- [x] Defaults are protected with no override file; exact and `prefix/*` additions are protected; an additions list omitting a default leaves the default protected
- [x] A removal attempt, an unreadable file, and an unparseable file each exit 2; a lower-precedence file is never consulted when the higher one exists
- [x] Parity test: `protected-branches.sh` and the hook's inlined function agree on one fixture corpus; mutating either breaks the test
- [x] `pre-push-gate.sh`, `/push-ci`, `/epic-merge`, `/gh-stack` all treat a project-added `rel/*` branch as protected, and all four treat every branch as protected when the resolver exits 2 (end-to-end in temp repos)
- [x] Existing pre-push-gate, push-ci, epic-merge and gh-stack suites pass unchanged in behaviour

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | Done   | Resolver shape per tech spec § 3.3; one function block inlined in the hook |
| Development | Done  | `scripts/protected-branches.sh`; hook block byte-identical; push-ci Phase 0 reports `PROTECTED`, Phase 2 and both epic-merge push sites refuse on anything but exit 1; gh-stack gained an executable per-layer fence |
| Testing    | Done   | `test/scripts/protected-branches.test.js` (22: behaviour, precedence, fail-closed incl. unclosed comment, `$(…)` names, parity, mutation, hook end-to-end, all five guards through refusal); push-ci/epic-merge pins and digests re-recorded after full-diff review; `npm test` 4864/4864; `/precommit` ✅ PASS |
| Acceptance | Done   | Codex thorough review ✅ Ready (round 2), AC Coverage 5/5; `--verify-ac` 2026-09-25: 5/5 Complete; AC 3 at Medium (parity is byte equality of the inlined block rather than one fixture corpus run through both — stricter in effect, but not the AC's wording), hence Candidate Complete. Carried to R2: install `protected-branches.sh` with the override scaffold, or every branch reads as unknown |
