# T10 — Mod 0.2.0: deny-list, proposals, evidence by task

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-04
> **Status**: Completed
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 3.4, § 3.6, § 5 task 10
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-7, FR-25
> **Code location**: this repository — `mods/agentctl/`

## Background

Using 0.1.0 meant hand-written task JSON, and a bound task refused every command the classifier could
not parse. The user decided (2026-10-04) on a deny-list with the host's own permission flow or auto
mode for the rest, built-in high-risk classes refused even without a task, and a scope Claude drafts
and the person accepts. A brainstorm with Codex reached equilibrium on the shape: the file is an
untrusted submission channel, the preview binds, recognized direct pushes stay refused, scripts are
delegated and their blindness disclosed.

## Requirements

- Classifier: built-in classes refused with or without a task; task forbids and edit roots while bound; everything unclassifiable delegated to the host and recorded; executors before adapters
- Proposals: read at session start and main-turn end, validated, retained with a SHA-256 digest, previewed; bound only by a composer-origin `/agentctl accept`; stale and other-worktree proposals refused
- Evidence shown only for the bound task and policy version; every tree reading carries its time; partial coverage never verified; bare `/agentctl` bounded, `/agentctl last` for the hand-over
- Version 0.2.0 with its release lock

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 3.4 and § 3.6, § 5 task 10 |
| Out | Script inspection; a needs-user path for pushes; a snapshot bridge to the harness; live verification of 0.2.0 on a host |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `mods/agentctl/lib/policy.js` | Modify | Deny-list classifier |
| `mods/agentctl/lib/proposal.js` | New | Proposal reading, digest, preview |
| `mods/agentctl/hooks/register.js` | Modify | Delegation, proposal commands, evidence tagging, bounded status |
| `mods/agentctl/lib/handoff.js`, `lib/view.js`, `lib/reducer.js` | Modify | Reading times, partial coverage, band, cleared refusal notice |
| `mods/agentctl/tests/*.test.ts` | Modify | Policy, hook and flow cases |
| `mods/agentctl/.claude-plugin/plugin.json`, `release.json`, `README.md` | Modify | 0.2.0, lock, documentation |

## Acceptance Criteria

- [x] A direct `git push` or `gh pr merge` is refused with no task bound, and a production write as before
- [x] A script, a compound shell fence and an unknown tool pass to the host with its verdict unchanged, and are recorded as delegated; the mod never claims to have classified or approved them
- [x] A proposal binds only through `/agentctl accept` from the person's prompt; a file changed after the preview never changes what binds; a non-matching digest, a stale base, another worktree and a check overlapping a built-in class are refused
- [x] Evidence from another task or policy version is not shown; the hand-over states when the tree was read
- [x] Bare `/agentctl` does not print the hand-over; `/agentctl last` does
- [x] `claude plugin validate .` and `claude plugin test .` pass; the version lock reads 0.2.0
- [x] Pass /codex-review-fast
- [x] Pass /precommit
- [x] Pass /codex-review-doc

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | `/codex-brainstorm` equilibrium (2026-10-04); push policy decided by the user on the recommendation |
| Development | Done | Classifier, proposals, evidence partition, bounded status, README |
| Testing | Done | Mod `claude plugin test .` 161 pass; `npm test` 5130 pass |
| Acceptance | Done | 2026-10-04: `/codex-review-fast` (thorough, three rounds — five P1s fixed in round 1: helper digest without a base, same-id staleness, same-id evidence reuse, partial readings shown as verified, a malformed proposal aborting session start): ✅ Ready. `/precommit`: ✅ PASS. `/codex-review-doc` (three batches): ✅ Mergeable. Live verification of 0.2.0 on a host is out of scope here and listed under the mod README § Not verified |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Intent: [intent-agent-control-plane-mod.md](../intent-agent-control-plane-mod.md)
- Setup and workflow: [2026-10-04-t11-workflow-integration.md](2026-10-04-t11-workflow-integration.md)
