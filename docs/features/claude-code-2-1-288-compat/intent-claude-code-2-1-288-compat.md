# Intent — claude-code-2-1-288-compat

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

## North star

Claude Code 2.1.277–2.1.288 changed what the host does around the plugin — it reads `AGENTS.md`
natively, tells Claude to run a skill named `verify` before commits, lets Mods run ahead of plugin
hooks, times out dangerous `rm`, and backgrounds running tools on send-now. The plugin stays
correct under every one of those changes without weakening a rule, adding resident text, or
adopting a feature because it exists.

## Non-goals

- Using a Mod as a credential or an enforcement layer for git operations, review verdicts or
  gates — Register #4 names the credentials, and the review layer is reminder-only by maintainer
  decision (2026-08-13).
- Wiring "You should know" into review dispatch; it is a user-controlled advisory, not a reviewer.
- Any gate agent on a model other than the pinned `opus` / `high`.
- Any addition to the resident launch core (386 characters of headroom at 5.0.0).
- Copying the on-demand contracts into `.sd0x/` for Codex-only projects.
- Disabling or routing around the host's dangerous-`rm` safeguard.
- Changing the blocking guards' documented fail-open on a missing `jq` / `node`.
- Shipping a Mod inside sd0x-dev-flow while the mods API is marked as changeable without notice.

## Invariants

- `INV-001`: Every Anchor the generated `AGENTS.md` carries is a byte-exact copy of its canonical
  source in the plugin's `rules/`, extracted at generation time; generation fails rather than
  falling back to handwritten Anchor text.
- `INV-002`: A paraphrase that restates an Anchor is Anchor; Default-tier prose in the kernel
  never restates one.
- `INV-003`: `/verify` itself emits no precommit sentinel and writes no verdict note: it may report
  that `review-state.js check` shows `precommit.passed === true` at the current digest, and otherwise
  delegates to `/precommit`, whose own evidence contract applies.
- `INV-004`: A procedure the host cannot read stops the action it governs; a workflow grant in
  `AGENTS.md` is not evidence that the workflow is installed.
- `INV-005`: A backgrounded push is reconciled against the remote before any retry; a new user
  message never mints a push credential.
- `INV-006`: Run-owned cleanup removes only a path the same run derived and validated; where the
  host classifies the removal shape as a critical path, the operand is a literal re-read across tool
  calls; no env opt-out, tool substitution or retry loop evades the host's `rm` check.
- `INV-007`: Host behaviour that this repository cannot exercise (fail-closed matching, `rm`
  classification, wrap-up allowance) is documented as documented, never claimed as tested.

## Acceptance sketch

`/codex-setup init` on a fixture project writes an `AGENTS.md` under 24 KiB whose Anchor
Register, Register #4 block, `security.md`, "Never log" line and redaction line equal the plugin's
`rules/` bytes; `/codex-setup doctor` reports when `CLAUDE.md` and `AGENTS.md` coexist and which
native loading mode applies. `node scripts/verify-runner.js` prints `## Verify:` and no
`## Overall:`; with a passed precommit slot at the current digest, `/verify` in commit context
reports the existing pass and runs nothing. The `/epic-merge` cleanup fence's removal shape is
measured against the host's critical-path table and recorded. `/claude-health` names
`/doctor prompt-audit [path]` as a manual step. The resident budget test and every Anchor pin
pass unchanged.
