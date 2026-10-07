# T13 — Uncoached-run findings: next step from the checks, checks named at accept

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-07
> **Status**: Completed
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 3.7, § 5 task 13
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-15, FR-23, FR-25, Signal 13
> **Code location**: this repository — `mods/agentctl/`

## Background

After 0.3.0 was released, Codex ran the first run as a user who had not read the design. It had only `/agentctl <what you are doing>` and used a disposable clone in an interactive tmux session.

- **Onboarding passed.** It went describe → Enter → preview → Tab + Enter → "start the work" → `/agentctl` → `/agentctl handoff` in six steps with no outside help.
- **Work and hand-over passed with defects.**
  - The hand-over said "Edits observed: 0" beside a changed README. Claude had edited it through Bash.
  - Claude ran the tests piped through `grep`. That run is not the declared check, so the hand-over called the check stale while Claude reported it passing.
  - With the work done, `/agentctl` still said "ask Claude to start the work".
  - A Write outside the edit roots was refused, and Claude then wrote the same file with a Bash heredoc.
  - Claude asked a question and wrote a proposal in the same turn.

## Requirements

- After a task is bound, the next step depends on where its declared checks stand:
  - none run yet → work, then run them;
  - some not current on this tree → re-run those;
  - all current → `/agentctl handoff`.
- The accept reply names each declared check as a line that matches it, where one exists.
- The hand-over says what its edit count measures. A file changed through Bash shows in the tree line.
- A task refusal tells Claude not to reach the same result another way. The README states that edit roots bind the edit tools only.
- The drafting request tells Claude to wait for the answer before writing a proposal.
- The README's "not yet verified by an uncoached user" line is replaced by the record of this run.

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 3.7 items 3, 5, 6, 8; mod 0.3.1 |
| Out | Classifying shell redirects as edits (the deny-list stays as decided, INV-004). Shortening the clone's own review loop, which is a repository rule, not the mod's |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `mods/agentctl/lib/policy.js` | Modify | `renderArgv`, the tokenizer's inverse for one segment |
| `mods/agentctl/lib/view.js` | Modify | `checkKey`, `evidenceCurrent`, `checkProgress` |
| `mods/agentctl/lib/firstrun.js` | Modify | `checkLine`, `checkArgv`, `nextForTask`, copy, drafting wording |
| `mods/agentctl/lib/handoff.js` | Modify | Edit-tool count label; the shared currency rule |
| `mods/agentctl/hooks/register.js` | Modify | Accept reply, status next step, refusal wording |
| `mods/agentctl/tests/*.test.ts` | Modify | One test per finding and per review finding |
| `mods/agentctl/README.md`, `.claude-plugin/plugin.json`, `release.json` | Modify | Uncoached run, 0.3.1, lock |

## Acceptance Criteria

- [x] `/agentctl` with a bound task leads with one of four next steps, chosen from its declared checks: work and run them, re-run the stale ones, hand over, or — when no check is declared — the plain step
- [x] A piped run of a declared check leaves the next step unchanged
- [x] The accept reply lists only the `check` executors, each as a line that reads back as its argv (quoted, never shortened), or as its JSON words when the formatter cannot quote a word in one piece
- [x] The hand-over's edit line names edit-tool calls and points at the tree line for Bash changes
- [x] A task refusal says not to reach the same result another way, and the built-in refusal is unchanged
- [x] The drafting request in both languages says to wait for the answer before writing, and stays ≤ 150 tokens
- [x] README: § Uncoached run replaces the disclosure; edit roots and check matching are stated
- [x] Pass /codex-review-fast
- [x] Pass /precommit
- [x] Pass /codex-review-doc

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Codex uncoached run, 2026-10-07; each finding was traced to the code |
| Development | Done | The six requirement items; mod 0.3.1 |
| Testing | Done | Mod `claude plugin test .`: 203 pass; repo `npm test`: 5140 pass |
| Acceptance | Done | 2026-10-07: `/codex-review-fast` (thorough, two rounds): round 1 ⛔ Blocked — a P1 (checks shown joined with spaces and cut at 160 characters, so a spaced path or long command no longer matched its executor) and a P2 (the reply promised exact matching, while executors match by prefix); both fixed. Round 2 ✅ Ready, one Nit deferred (the `renderArgv` comment overstates when quoting is impossible). `/precommit`: ✅ PASS after escaping a table pipe in the README. `/codex-review-doc` (one batch: tech spec, mod README, this ticket; three rounds): round 1 ⛔ Needs revision — the check-line fallback was not documented, the preview's 160-character cut contradicted "lists every permission", the docs sent readers to bare `/agentctl` for fields only `status --details` shows, and this ticket read Completed with a gate open; round 2 sent back the fallback wording as too strong; round 3 ✅ Mergeable |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Previous: [2026-10-07-t12-first-run-ux.md](2026-10-07-t12-first-run-ux.md)
