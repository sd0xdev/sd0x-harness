# Intent — agentctl-background-status

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

The intent of `agent-control-plane-mod` stays in force; nothing here narrows or replaces it.

## North star

A person reading the optional mod's status can tell which background work the host listed, which has
no observed end, and what is not known — and choose to wait, look or step in for that reason.

## Non-goals

- No guess of done, failed, progressing or stuck.
- No kill control, polling, process scan, subprocess, network or model call.
- No closing or hiding by age or by absence from a list.
- No dependency of the plugin on the mod; no multi-session view.

## Invariants

- `INV-001`: Every open item carries what is known, its source and the time of its last evidence, or
  reads unknown.
- `INV-002`: "Listed by the host as of T" and "completion unobserved" never share a label that implies
  running.
- `INV-003`: Absence, age, silence and an unknown status word are never an end, and a list that was not
  supplied is not an empty list.
- `INV-004`: An observed end is not undone by a later or repeated record of the same run, and
  conflicting ends are shown as conflicting.
- `INV-005`: "Nothing observed" is never worded as "nothing is running".

## Acceptance sketch

One job is in the latest host list; another started three hours ago, was last listed two hours ago and
has no observed end. The status shows the first as listed at that time and the second as completion
unobserved with its age, its last sighting and its absence from the first one's list, by a recognizable
and sanitized name. If the later list was supplied empty, the second still reads absent from that list at its time; if no
list was supplied since its last sighting, later membership reads unknown.
Neither reads as finished or stuck, and the stall hint is shown as not evaluated while the second is
open. Feeding the second's end twice, or before its start, leaves it ended once.
