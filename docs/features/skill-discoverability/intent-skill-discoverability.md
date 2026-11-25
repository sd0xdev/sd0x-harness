# Intent — skill-discoverability

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

## North star

A user who describes a task reaches the right installed skill, or correctly none — and when that
fails, it is known whether the skill was not listed, not described, or not chosen.

## Non-goals

- No router, routing skill, hook trigger, natural-language detection or resident skill list.
- No bulk description rewrite, alias removal or `disable-model-invocation` change.
- No edit of a user's host settings, no data collection, no paid evaluation without consent.

## Invariants

- `INV-001`: Listed, described, selected and explicitly invoked are separate facts; none is inferred
  from another.
- `INV-002`: A count from a source checkout never stands for an ordinary install.
- `INV-003`: No description changes before a like-for-like comparison with explicit and no-skill
  controls.
- `INV-004`: Missed, wrong and unwanted use are reported separately, over the whole list.
- `INV-005`: Explicit invocation and the flows that need model invocation behave as they do without
  this feature.

## Acceptance sketch

In an ordinary install the user writes down how many plugin entries are listed, described and
duplicated, and how they could tell. If every entry is described, the truncation line ends there. If
not, and only with consent, a fixed phrase set runs in both conditions beside no-skill phrases and
explicit names; a description changes only if missed use falls and unwanted use does not rise.
