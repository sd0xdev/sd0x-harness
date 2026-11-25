# Requirements: agentctl-background-status

> **Doc class**: Lifecycle — Phase 1 requirements (per `@rules/docs-numbering.md`). Feature-level problem-space analysis. **Not** a task tracking ticket; for per-task progress tracking see `requests/*.md` (created via `/create-request`).
> **Created**: 2026-11-25
> **Updated**: 2026-11-25
> **Tier**: standard
> **Intent**: [intent-agentctl-background-status.md](./intent-agentctl-background-status.md)
> **Tech Spec**: [2-tech-spec.md](./2-tech-spec.md)
> **Parent**: [agent-control-plane-mod requirements](../agent-control-plane-mod/1-requirements.md) and [its intent](../agent-control-plane-mod/intent-agent-control-plane-mod.md) stay authoritative; this document refines how their background-work rules read to a person

Baseline: agentctl 0.3.1 at `cce16f3`, an optional mod. **[V]** read in the source or a test; **[O]** seen
once; **[H]** hypothesis nobody has measured.

## 1. Problem Statement

A person using the mod reads its status to decide: wait, look closer, or step in. For background work
the status gives a count and identifiers, under a label that says more than the record knows.

**How a record lives today [V]** (`mods/agentctl/hooks/register.js`, `lib/reducer.js`, `lib/notices.js`,
`lib/view.js`)

| Step | Rule |
|---|---|
| Opens | A Bash call returns a background id → `started`. Any id in the host's list at `Stop` → `in-flight`, with the time of that list. Other kinds of work appear only through that list |
| Stays | Leaving the list closes nothing; records saved for a session are restored after a reload |
| Closes | A task notification whose status is `completed`, `failed`, `killed` or `cancelled`, or a `GetTask` result whose status is anything but `working` |
| Shown | `Background in flight: N (ids)` counts `started` and `in-flight` together, with no time, source or status. `--details` adds nothing to it. The hand-over shows status, and a time for listed items |

**Where that falls short of what is already required [V]**

| # | Finding | Against |
|---|---|---|
| G1 | The status line says "in flight" for work only known to have started, and gives no source or time | Parent `INV-001`, FR-3, and FR-6 ("without a terminal result it reads 'completion unobserved'") |
| G2 | One unclosed record suppresses the suspected-stall hint with no limit and no visible reason | Consistent with "never stuck from silence", but the reader cannot see why nothing is said |
| G3 | The two closing paths accept different words: an unlisted notification status is ignored, while an unlisted `GetTask` status closes the record | Parent FR-6 needs an observed terminal result |
| G4 | If a terminal result is seen before the start is recorded, the later start sets the record to `started` again | Same; whether the host ever delivers in that order is unknown **[H]** |
| G5 | An identifier alone does not tell a person which work it is, though a Bash record is linked to its command | Parent NFRs on sanitized display apply |
| G6 | A `Stop` event without the list field is handled as an empty list, and only listed ids get a time. The record shows that a later list left an item out only when another id in that list carries the later time; a list that was empty, or not sent, leaves no trace | Parent FR-3 (missing is not empty) |

**One observation [O]**: a status showed 14 items in flight. Nobody compared them with what was running.
They may have been running, finished without an observed end, or repeated. It is not evidence of a fault.

**What the mod cannot know.** Work it did not observe; whether a listed item is making progress; what
happened while it was not loaded. The parent already forbids filling such gaps.

### 5-Why Trace

1. Surface: make the background count understandable.
2. Why: a person cannot tell running work from work whose end was not seen.
3. Why: the display merges states the record keeps apart.
4. Why: earlier work settled when a record may close; how an unclosed one should read was left to a label.
5. Root: the status does not show what its evidence supports. Success is that a person picks wait, look
   or step in for a reason the evidence gives.

## 2. Goals / Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| Each item reads as what is known, from where, and as of when | Detecting progress, or guessing done or stuck |
| A person can choose wait, look in the host, or step in | Stopping, polling or scanning processes; any subprocess, network or model call |
| Delayed, missing, repeated or out-of-order end events leave a truthful reading | Closing a record by age or by absence |
| Keep the mod optional | Any dependency between the plugin and the mod; multi-session views |

**Only correcting the label, or doing nothing, were valid outcomes** of the prioritization in § 8. The
owner decided on 2026-11-25 to build FR-1 to FR-12 for agentctl 0.4.0 without waiting for those checks.

## 3. Stakeholders

| Stakeholder | Role | Key Concern |
|-------------|------|-------------|
| Person supervising one session | User | Whether waiting is supported by evidence |
| Person returning after a reload | User | Which items are from before |
| Claude reading the status reply | User | No claim stronger than the record |
| Mod maintainer | Developer | Any `lib/` or `hooks/` change is a mod release |
| Hand-over reader | Dependent | Same words in both places |
| Plugin users without the mod | Dependent | Nothing changes |

## 4. Use Cases

| # | Situation | Should read as | Supports |
|---|-----------|----------------|----------|
| UC-1 | A test started two minutes ago and is in the latest host list | Listed by the host as of T | Wait |
| UC-2 | Its end was observed | Not among open items; outcome in the evidence | Go on |
| UC-3 | Started, no list since | Started at T, completion unobserved | Wait or look |
| UC-4 | Was listed at T1; the host supplied a later list at T2 without it; no end seen | Not in the list of T2; completion unobserved. Needs evidence that a list was supplied at T2, for example another id listed then | Look in the host |
| UC-5 | Was listed at T1; the later event carried no list, or nothing shows that it did | Last listed at T1; later membership unknown | Look in the host |
| UC-6 | The same end arrives twice | Same reading as once | Go on |
| UC-7 | Two different ends arrive for one item | Conflicting results, both with times | Look |
| UC-8 | End seen before start | The end stands | Go on |
| UC-9 | The host reports a status word the mod does not know | Unknown status, word shown safely; not ended | Look |
| UC-10 | Session reloaded with open items | From before the reload, unconfirmed since T | Look |
| UC-11 | No items, no tool running | Nothing observed; untracked work cannot be confirmed | Decide elsewhere |
| UC-12 | An old open item and a quiet session, no failure seen | Item and its age shown; stall not evaluated because of it | Look, then decide |
| UC-13 | The same quiet session, and a declared check's failure was observed | The failure with its time, apart from the open item | Step in |

### Before / after

Wording is illustrative. It fixes what must be distinguishable, not the phrasing.

| Path | Today [V] | Should be able to tell |
|---|---|---|
| UC-1 beside UC-4 | `Background in flight: 2 (b1, b2)` | "Listed by the host 20 s ago: `npm test` (b1). Completion unobserved: `npm run build` (b2), started 3 h ago, last listed 2 h ago, not in the list of 20 s ago." |
| UC-5 | `Background in flight: 1 (b2)` | "Completion unobserved: `npm run build` (b2), started 3 h ago, last listed 2 h ago; whether it was listed since is unknown." |
| UC-12 | The same line; no stall hint and no reason | "1 item with completion unobserved for 3 h. Stall not evaluated while it is open. Neither finished nor stuck is known." |
| UC-11 | No background line | "Nothing observed in the background." Not "nothing is running" |

## 5. Functional Requirements

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| FR-1 | Each open item states what is known about it, the source, and the time of the last evidence, or reads unknown | Must | G1; already a parent Must |
| FR-2 | Work listed by the host and work with completion unobserved are never counted under one label that implies running | Must | G1 |
| FR-3 | Absence from a list, age, or silence never reads as finished, failed or stuck | Must | Parent FR-6 |
| FR-4 | An open item is never hidden or closed because it is old; its age is visible | Must | Hiding it would look like an end |
| FR-5 | The reading lets a person tell which of wait, look in the host or step in the evidence supports, and recommends nothing it does not support | Must | The decision this serves |
| FR-6 | "Nothing observed" is distinct from "nothing is running" | Must | Parent: untracked work cannot be confirmed |
| FR-7 | A missing host list is not an empty one: exclusion at a time is stated only when a list was supplied then; otherwise the last positive sighting is stated and later membership is unknown | Must | G6 |
| FR-8 | Both closing paths treat the same status word the same way; an unknown word is unknown, not an end | Should | G3 |
| FR-9 | When an open item keeps the stall hint from being evaluated, that is visible | Should | G2 |
| FR-10 | An item can be recognized by its sanitized command or kind where the mod has it | Should | G5 |
| FR-11 | Items from before a reload say so | Could | UC-10 |
| FR-12 | Repeated end events change nothing; an observed end is not undone by a later start record for the same run; conflicting ends are shown as conflicting | Should | G4; order and duplication by the host are unknown |
| FR-13 | Auto-close by timeout, process scans, polling, kill controls, multi-session totals | Won't | Parent Non-goals, `INV-006`, `INV-007` |

**First scenario**: UC-1 beside UC-4, one listed and one unclosed item in the same status; then UC-5 alone.

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Reliability | Truthful in every use case | 0 readings that say finished, failed, running now or stuck without evidence |
| NFR-2 | Performance | Same evidence, no new reading | 0 added subprocesses, polls, network or model calls |
| NFR-3 | Security | Sanitized display | Parent sanitizing rules; 0 raw command or status text |
| NFR-4 | Usability | Compact | The compact status grows by at most 2 lines |
| NFR-5 | Compatibility | Optional | 0 plugin files depend on the mod |

## 7. Constraints & Assumptions

| Type | Description | Source |
|------|-------------|--------|
| Constraint | Every field names its source and time or reads unknown | Parent `INV-001` |
| Constraint | Only an observed exit marks a job passed or failed | Parent `INV-003`, FR-6 |
| Constraint | Reports only what was observed to be affected | Parent `INV-006` |
| Constraint | Hand-over uses records only | Parent `INV-007` |
| Constraint | A runtime change needs its own version and release | `mods/agentctl/release.json`, `.github/scripts/agentctl-version.js` |
| Assumption | The host delivers an end event for every background item, and in order | **[H]** |
| Assumption | A notification that arrives in the middle of a turn reaches the same event as one between turns | **[H]**; the tests cover the prompt event only |
| Assumption | The host list is complete when it is sent | **[H]** |
| Assumption | The host's own task view is a fair comparator | **[H]** |

### Cost of being wrong

| Error | Cost |
|---|---|
| Reads running, already ended | Needless waiting; the stall hint stays quiet |
| Reads ended, still running | Acting on unfinished results, or starting a clashing job |
| Reads stuck, merely slow | Interrupting good work |
| Says unknown when it could know | One look at the host |

Saying unknown is the cheapest error, so a doubtful case resolves to unknown and not to either end.

**Counterexample**: close items once they leave the list. It tidies the count, and marks a job finished
that the host merely did not list.

## 8. Acceptance Signals

The two checks and their table are the original prioritization exercise, kept as written; they no longer
decide whether to build. The release scope is FR-1 to FR-12. Check 1 stays as an optional usability look.

**Check 1 — one look (opt-in, the user's own session).** With at least one background job open, read
`/agentctl status --details` and the host's own task view at the same moment. Record only: how many items
each shows, how many match, and what you would have done from the status alone. No commands, paths or
output. One look cannot show how often a mismatch happens.

**Check 2 — paper.** Read today's and the proposed text for UC-1 to UC-13 and choose wait, look or step
in. Expected choices are fixed beforehand.

| Result | Consequence |
|---|---|
| The compared items match and the choices are right | Lowers the urgency of G1 for those items; a wording correction can wait until the mod next has a reason to release. Says nothing about G2 to G6 |
| An item does not match, and the status alone led to a worse choice | Advance to a tech spec |
| An item does not match, and the choice was the same | Record it; no advance on this look alone |
| The host view cannot be compared | Unknown; do not advance on it |
| The proposed text leads to more wrong choices than today's | Stop |

G1 and G6 are gaps against existing requirements and need no field case to be real; a field case decides
urgency. G3 and G4 stay open for their own scenarios (UC-8, UC-9): one matching snapshot exercises
neither an unknown status word nor an end before its start.

| Signal | Verifies |
|---|---|
| Each use case yields its expected reading | FR-1 to FR-6, NFR-1 |
| A supplied list and an omitted field yield UC-4 and UC-5 | FR-7 |
| Repeated, conflicting, reordered and unknown-word inputs yield UC-6 to UC-9 | FR-8, FR-12 |
| A quiet session with and without an observed failure leads to different choices (UC-12, UC-13) | FR-5 |
| A quiet session with an open item shows why no stall is reported | FR-9 |
| Removing the mod changes nothing in the plugin | NFR-5 |

## 9. Open Questions

- [ ] **Owner**: will you do check 1 once, next time a background job is open?
- [ ] **Owner**: did the 14 items ever make you wait or act?
- [ ] Host fact: which status words and orders does the host deliver, and does its list carry more than an id?
- [ ] Host fact: does a notification delivered inside a turn raise the same event?
- [ ] Solution concern: how to tell two runs apart if an id is ever reused — suggest `/feasibility-study`
- [ ] Solution concern: whether an open item should keep blocking the stall hint, or only be named — parent reducer test pins today's rule — suggest `/feasibility-study`

## 10. References

- Source: `mods/agentctl/hooks/register.js` (`closeBackground`, the `classic.Stop`, `prompt.submit` and `GetTask` handlers), `mods/agentctl/lib/reducer.js` (`tool.end`, `background.inflight`, `background.terminal`, `evaluateStall`), `mods/agentctl/lib/notices.js` (`parseTaskNotification`), `mods/agentctl/lib/view.js` (`statusText`), `mods/agentctl/lib/handoff.js`
- Tests: `mods/agentctl/tests/reducer.test.ts`, `mods/agentctl/tests/flows.test.ts` — "Signal 4", "a task notification closes the backgrounded check", "a prompt that merely looks like a notification", "T6", "suspected stall needs idle time"
- Parent: [requirements](../agent-control-plane-mod/1-requirements.md), [feasibility](../agent-control-plane-mod/0-feasibility-study.md), [spec](../agent-control-plane-mod/2-tech-spec.md), [intent](../agent-control-plane-mod/intent-agent-control-plane-mod.md); `mods/agentctl/README.md`
