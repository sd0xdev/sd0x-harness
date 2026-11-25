# Intent — hook-reminder-value

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

## North star

The user and the model get the reminder they need when they need it, and nobody is pushed. A reminder
is kept, trimmed or fixed because of what it does for the reader, not because of how often it prints.

## Non-goals

- No enforcement, no blocking, no output that continues a turn, no louder reminder.
- No telemetry, stored usage, transcript analysis or scheduled collection.
- No change to the two protective guards.
- Formatter delay is not a reminder question.

## Invariants

- `INV-001`: Needed, emitted, delivered and used are separate; each may be unknown, and none is
  inferred from the one before.
- `INV-002`: "Unused" is never concluded from missing evidence of use.
- `INV-003`: Fewer repeats never buys a missed needed reminder.
- `INV-004`: State that cannot be read is said to be unknown, or nothing is said; it is never shown as
  clean or as already shown.
- `INV-005`: Reminders stay reminders: exit 0, no new question, no added per-turn text or process.

## Acceptance sketch

For an owed gate across several unrelated turns, the owner reads the lines printed today beside the
same session without them, and says which they want. Each verdict lists needed, emitted, delivered and
used, with unknowns left as unknown. A proposal that would silence the repeats also shows that the gate
is still known at the end and after a compaction; otherwise it is dropped.
