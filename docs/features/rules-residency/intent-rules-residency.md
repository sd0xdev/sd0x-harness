# Intent — rules-residency

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

## North star

A session carries resident only what must hold before its task is known — the Anchors and the gate
invariants — and loads everything else when its situation arises, so the plugin leaves room for the
project's own instructions without weakening a single safety rule.

## Non-goals

- Changing what any Anchor prohibits or authorizes, or any gate's semantics.
- Modifying user-owned `*-project.md` files — they are the plugin user's customization space. This
  supersedes tech spec task 7; the spec is reconciled before migration work starts.
- Reducing volume by deleting live information.
- Changing mechanical guards (`pre-push-gate.sh`, `commit-msg-guard.sh`).
- Per-model rule variants.

## Invariants

- `INV-001`: Every Anchor Register item, its exception list and the attribution whitelist stay in
  force from a session's first turn, meaning unchanged.
- `INV-002`: The plugin's migration never modifies, strips or re-heads a `*-project.md` file.
- `INV-003`: Content that leaves residency has exactly one canonical home and a trigger that loads
  it — move, never copy, never silently drop.
- `INV-004`: When a governing contract cannot be read, the action it governs does not proceed.
- `INV-005`: The resident budget is measured on what an installed project actually loads.
- `INV-006`: An Anchor-level move lands only after the maintainer approves the old and new text.

## Acceptance sketch

On a fresh install rendered by `/project-setup`, the plugin-managed resident measure (template plus
plugin rules, no `*-project.md`) is at or below the 5.0 target; the Anchor and gate pins pass unchanged in meaning; a 4.7 project
upgraded with `/install-rules` keeps its `*-project.md` bytes; and a session with the push contract
removed refuses to push.
