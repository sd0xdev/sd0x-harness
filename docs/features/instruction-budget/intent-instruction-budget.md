# Intent — instruction-budget

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

## North star

A project that installs the plugin launches Claude Code without the instruction-size warning, and
keeps real room for its own instructions. Every rule is still in context when its work is in play.

## Non-goals

- Rewording a rule's content. This feature changes where and when a rule loads, not what it says.
- Leaving any Anchor rule without an always-loaded statement of it. Register #3's testing rows
  may path-scope with `testing.md` because `discretion.md` Register #3 states their rule.
- Making `/claude-health` enforce the limit, edit files, or delete a user's lessons log.
- Re-doing `rules-residency`'s kernel rewrite, canary cohort or Anchor compaction.

## Invariants

- `INV-001`: No failure lets governed work run without its rule. Ignored `paths:` loads the rule
  always; a missing Codex reference leaves the resident core and stops the dispatch.
- `INV-002`: A path-scoped rule is never also `@`-imported from a `CLAUDE.md` the plugin ships or
  backfills. An import makes it load at launch, which was measured on 2.1.281.
- `INV-003`: Each path-scoped rule's globs cover every place its instructions bind today.
- `INV-004`: Every citation of `rules/codex-invocation.md`, by path or by section, still resolves
  after the move.
- `INV-005`: `/claude-health` and the ceiling test use one accounting, and it matches Claude Code's:
  memory-file types, `@` follow, path-scoped skip, per-file over-limit excluded from the sum.

## Acceptance sketch

In a fresh project on 2.1.281, a headless marker probe shows none of the four path-scoped rules and
no Codex prompt contract at launch. Touching a test file brings `testing.md` in. Starting a review
dispatch brings the contract in. `/claude-health` prints the same total Claude Code would, with the
plugin's share at or under the ceiling. It also flags a `.claude/rules/lessons.md` with the move to
make.
