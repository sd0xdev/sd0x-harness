# Intent — review-coverage-visibility

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

## North star

A maintainer who is about to publish code can tell which of it an identified review was asked about,
which lies outside that review, and what cannot be known — and then decides for themselves. A truer
answer is the goal; more reviews are not.

## Non-goals

- No gate, question, reminder, hook output or enforcement, and no review started or urged.
- No change to what a verdict records or to any eligibility result.
- No coverage metadata, ledger, per-commit or scoped verdict.
- No proof of what a reviewer read. "Not asked about" never becomes "not reviewed".
- No detection of edits during a review, no doc-plane rule change, no agentctl dependency.

## Invariants

- `INV-001`: "Asked about" needs an identified review whose requested scope contained the change;
  "covered" also needs evidence that the published change matches what it read. A recorded pass, an
  overlapping range or a silent conversation is never enough.
- `INV-002`: Missing, partial or lost evidence reads "unknown"; "outside" needs an identified review
  whose requested scope excluded the change; "unreviewed" is derived from neither.
- `INV-003`: Coverage and automated eligibility are separate statements, and eligibility results stay
  what they are without this feature.
- `INV-004`: It speaks only at a decision the owner already faces, adds no question, and does not
  repeat itself for the same content and range.
- `INV-005`: Zero always-loaded characters and zero hook entries.
- `INV-006`: Nothing new is stored; a verdict stays a whole-change verdict in one slot per plane.

## Acceptance sketch

One unprotected branch, two commits ahead of the destination, every plane the range requires passed at
the current digest, and the two commits established as what the push publishes. If this conversation
holds reviews for both, the maintainer reads that reviews were asked about both. If it holds only the
second, they read that the first is outside that review and its earlier status is unknown. In a new
conversation they read that a pass is recorded and its review scope is unknown. In all three the same
existing push decision is reached, with its own approval and no added prompt, the offer's result is
what it is without the feature, and nothing calls the first commit unreviewed.
