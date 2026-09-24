# R5 — `/deploy-flow` and its Register #4 entry

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md` (created via `/req-analyze`).
> **Created**: 2026-09-24
> **Status**: Pending
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale
> **Depends On**: [R1](./2026-09-24-git-autonomy-r1.md), [R2](./2026-09-24-git-autonomy-r2.md)

## Background

Maintainer decision 2026-09-24: a project may declare its deploy workflow and the model may run it through a new Register #4 entry, `/deploy-flow`; `run` scripts only under `Run Steps: execute`. Anchor-level — reviewed at `thorough`. Tech spec § 3.2–§ 3.4.

## Requirements

- `rules/git-workflow.md` grant block and `rules/discretion.md` Register #4 gain the `/deploy-flow` entry (tech spec § 3.4 wording); pins (`CANONICAL_AUTHORIZATION_BLOCK`, `AUTHORIZED_GRANTS`, `CANONICAL_ANCHOR_REGISTER`) updated together; `Claude forbidden:` unchanged
- `CLAUDE.md` / `CLAUDE.template.md` rule 4 exception list names `/deploy-flow`
- `skills/deploy-flow/SKILL.md`: step grammar, pattern binding by user pick, per-step approval naming both OIDs, OID re-check, fenced env, `--no-edit` + `GIT_MERGE_AUTOEDIT=no`, pre- and post-merge `commit-msg-guard.sh`, `--ff-only` path, `run` steps per `Run Steps`, never pushes
- Branch names and `run` tokens reach git / the script as separate argv entries, never a shell string
- Registered in `docs/skill-catalog.yml`; generated READMEs re-verified
- FR-16 for `/deploy-flow`: any suggestion of it (e.g. the user asks to release) is an AskUserQuestion option that invokes the skill, never copy-text; `rules/git-workflow.md` § Proactive Offer names it beside the other two

## Scope

| Scope | Description |
| ----- | ----------- |
| In    | Anchor edits and pins, the skill, its tests, catalog |
| Out   | `/push-ci`'s Authorization table (R3); the override scaffold (R2) |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/deploy-flow/SKILL.md` | New | The workflow |
| `test/skills/deploy-flow.test.js` | New | Skill + temp-repo integration |
| `rules/git-workflow.md`, `rules/discretion.md` | Modify | Register #4 entry |
| `test/rules/discretion-tiers.test.js`, `test/rules/override-contract.test.js` | Modify | Pins |
| `CLAUDE.md`, `CLAUDE.template.md` | Modify | Rule 4 |
| `docs/skill-catalog.yml` | Modify | Registration |

## Acceptance Criteria

- [ ] `validateDestructiveContract` accepts the new `Exception:` line and `AUTHORIZED_GRANTS` lists `/deploy-flow` in order; Register and grant pins updated in one change citing the maintainer decision
- [ ] Merge happy path, conflict → `--abort`, dirty tree refused, undeclared step never offered, source or target moved after approval → abort with nothing merged
- [ ] `release/*` binds only to a user-picked existing branch; a valid branch name containing `$(…)` merges without shell evaluation
- [ ] Post-merge read-back ignores a replace ref and an inherited `ALLOW_AI_COAUTHOR`; a `commit-msg` hook appending an AI trailer is caught and the flow stops naming the OID
- [ ] `--ff-only` verifies HEAD == SRC_OID with TGT_OID as ancestor and checks no message
- [ ] `Run Steps`: default `print` executes nothing; `execute` runs a step only after its approval; invalid value is a parse error; tokens outside `^[A-Za-z0-9._/@:=+,-]+$`, or a script path resolving outside the repository, are a parse error
- [ ] Each `execute` question states the run-script risk verbatim from tech spec § 3.3 step 3
- [ ] `/deploy-flow` appears in `docs/skill-catalog.yml` and the generated README catalog, and a suggested release reaches the user as an option that invokes it, never as copy-text

## Progress

| Phase      | Status | Note |
| ---------- | ------ | ---- |
| Analysis   | -      |      |
| Development | -     |      |
| Testing    | -      |      |
| Acceptance | -      |      |
