# T12 — First run: `/agentctl <what you are doing>`, a drafted scope, Tab to accept

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-07
> **Status**: Completed
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 3.7, § 5 task 12
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-19, FR-23, FR-25, NFR-10, Signal 13
> **Code location**: this repository — `mods/agentctl/`

## Background

The user installed 0.2.2 and tried, in order: `/agentctl 測試一下這個新功能` (usage grammar),
`/agentctl task 測試…` (usage), `/agentctl task set 測試…` ("must be JSON"), bare `/agentctl`
("observing only", no next step), `/agentctl proposal set 測試…` (silently "no proposal") and
`/agentctl last` ("for the bound task" with none bound). Verdict: "I completely don't know how to use
it." The release had skipped walking the first run. A `/codex-brainstorm` reached equilibrium on the
flow in tech spec § 3.7; the user re-decided FR-19 / Signal 9 to allow `$.prompt.fill` and
`$.prompt.suggest`, never `submit`.

## Requirements

- Free text after `/agentctl` from the composer prepares a drafting request in an empty prompt box (copyable otherwise); nothing is sent or bound
- A helper bundled in the mod delivers Claude's draft as a proposal, standalone, with its own `--help`
- The preview ends with a copyable accept line and offers it as a suggestion; accepting says work has not started
- Bare status leads with the next step; labels and empty states say what they mean; no doubled prefix
- Verbs are parsed strictly: typos get corrections, extra arguments are refused
- English / Traditional Chinese copy by a limited heuristic

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 3.7; requirements FR-19, FR-23, FR-25, NFR-10, Signal 13; intent INV-008, INV-009 |
| Out | A model-free wizard (dropped in the brainstorm); full locale detection; changes to the deny-list classifier |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `mods/agentctl/hooks/register.js` | Modify | Command parsing, goal fill, suggestion, next steps |
| `mods/agentctl/lib/firstrun.js` | New | Pure parsing, request text, copy and language |
| `mods/agentctl/lib/view.js` | Modify | Status leading with the next step, labels |
| `mods/agentctl/bin/propose.mjs` | New | Bundled proposal helper |
| `mods/agentctl/tests/*.test.ts` | Modify | The six reported attempts and the journey |
| `mods/agentctl/README.md`, `.claude-plugin/plugin.json`, `release.json` | Modify | First run, 0.3.0, lock |

## Acceptance Criteria

- [x] Each of the six reported attempts ends in a valid action or a specific next step; none silently ignores input
- [x] `/agentctl <goal>` from the composer fills an empty box and sends nothing; text already in the box is never overwritten; another origin gets a copyable request only
- [x] The drafting request carries goal, worktree, base, a shell-quoted helper invocation and the rules; its fixed overhead is ≤ 150 tokens
- [x] `bin/propose.mjs` validates with `readProposal`, writes only the worktree's proposal file, and prints its fields on `--help`
- [x] The preview ends with a copyable accept line, a suggestion is offered when the box is empty, and accepting says work has not started
- [x] Bare status leads with the state's next step; `last` with no task, `proposal set`, typos and extra arguments each get their own message; no reply carries its own `agentctl:` prefix
- [x] A goal with Han characters switches the copy to Traditional Chinese for the session
- [x] No `$.prompt.submit` or model call: `claude plugin validate` lists only `prompt.fill`, `prompt.suggest` and `prompt.read` among prompt APIs
- [x] Signal 13: scripted interactive journey, standalone, including replacing a bound task; uncoached run or the README disclosure with the owner's walkthrough
- [x] Pass /codex-review-fast
- [x] Pass /precommit
- [x] Pass /codex-review-doc

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | User's first-run transcript; `/codex-brainstorm` equilibrium (2026-10-07); FR-19 re-decided by the user |
| Development | Done | First-run module, bundled helper, goal fill (append + read-back), accept suggestion (and the host's own guess replaced while a proposal waits), next-step status, strict parsing, en/zh copy |
| Testing | Done | Mod `claude plugin test .` 194 pass; `test/scripts/agentctl-propose.test.js` 9 pass; `/codex-test-review` ✅ Tests sufficient (round 2). Signal 13 walked live on 2.1.289 and 2.1.292 (mod README § Verified live, 0.3.0); no uncoached run yet — the README carries the disclosure |
| Acceptance | Done | 2026-10-07: `/codex-review-fast` (thorough, three rounds — two P1 in round 1: a read/fill interleaving that could overwrite typed text, and `task show|clear` ignoring stray words; round 3 covered the live-walk fixes): ✅ Ready. `/precommit`: ✅ PASS. Signal 13: walked live, no uncoached run yet, disclosure in the mod README. `/codex-review-doc` (three batches): ✅ Mergeable — round 1 sent the tech spec back for § 3.7 and § 6 lagging the code (prompt API allowance, command-shaped typos, best-effort suggestion), fixed. The README disclosure is removed once someone who has not read the design completes the first run |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Intent: [intent-agent-control-plane-mod.md](../intent-agent-control-plane-mod.md)
- Previous: [2026-10-04-t10-mod-deny-list-proposals.md](2026-10-04-t10-mod-deny-list-proposals.md)
