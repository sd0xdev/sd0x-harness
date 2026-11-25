# Requirements: hook-reminder-value

> **Doc class**: Lifecycle — Phase 1 requirements (per `@rules/docs-numbering.md`). Feature-level problem-space analysis. **Not** a task tracking ticket; for per-task progress tracking see `requests/*.md` (created via `/create-request`).
> **Created**: 2026-11-25
> **Updated**: 2026-11-25
> **Tier**: standard
> **Intent**: [intent-hook-reminder-value.md](./intent-hook-reminder-value.md)
> **Tech Spec**: [2-tech-spec.md](./2-tech-spec.md)

Baseline: sd0x-dev-flow 5.2.1 at `cce16f3`. **[V]** read in the source or a test; **[O]** measured in one
earlier session (Claude Code 2.1.332); **[H]** hypothesis nobody has measured.

## 1. Problem Statement

The user's goal for these hooks is to remind, not to enforce. A reminder is worth its cost when a
needed one arrives, is understood and helps. Today only the first link, "a hook printed a line", can be
observed, and it is easily read as the whole chain.

| Stage | Meaning | Observable today |
|---|---|---|
| **Needed** | The situation calls for it | By definition, per scenario |
| **Emitted** | The hook printed it | Yes |
| **Delivered** | It reached the model, or the user saw it | Partly (below) |
| **Used** | It contributed to what was done | No; a later action also has rules, skills and the user as possible causes |

**What each reminder does [V]**

| Reminder (event) | Emits | Repeats |
|---|---|---|
| Fact line (`UserPromptSubmit`) | State line plus a pointer line on every prompt, even when nothing changed; silent when bypassed, deferred to a local copy, or no source can be read | Yes |
| Owed gates `📋` (`Stop`) | One line per owed plane | Every Stop while owed |
| Offer `🟢` (`Stop`) | One line when the offer is open | Until the model records the menu as shown |
| Custom flow `🧭` (`Stop`) | One line | Once per session, marked when **printed** |
| Gate order (after a Skill) | One fixed line, blind to which skill ran | Every Skill |
| Post-compaction baseline, namespace hint (`SessionStart`) | Branch and status; plugin root and runner | Each matching start |

**Delivery is documented for the model and unknown for the person.** The host page's exit-code section
names the events whose plain stdout becomes context: `SessionStart` and `UserPromptSubmit` are among
them, `Stop` and `PostToolUse` are not (the `SessionStart` sentence was read verbatim; the list came from
two separate readers, and what one session's model could see agrees **[O]**). This is documented, not
tested here, and may differ by host version. On `Stop`, `additionalContext` continues the
conversation, so using it would change a reminder into a push. Whether the user sees `Stop` lines is
unknown **[H]**.

**One session's numbers [O]**: the fact line fired 75 times (14,014 characters), 49 of them identical to
the one before; `Stop` 31 times (6,999 characters); the Skill line 11 times (814). Median times: prompt
137 ms, `Stop` 385 ms, Skill line 25 ms. They show cost and repetition, not waste: an unchanged fact is
also how the state returns after compaction.

**Two opposite errors.** A missing reminder that was needed, and a repeated one that adds nothing.
Removing repetition can create a miss. One state already blurs them **[V]**: `🧭` counts as shown when it is
printed, delivered or not. (An unreadable plane does not: the offer always requires it and answers
`gates-open`.)

**The formatter is a different cost.** It runs synchronously after an edit, only when prettier is
available, with no timeout of its own. Its time with prettier was never measured, and its behavior test
has no prettier **[V]**. It is not a reminder.

### 5-Why Trace

1. Surface: make reminders worth their per-turn cost.
2. Why: repeated lines cost attention, and it is unclear who reads some of them.
3. Why: only emission is observable, so "printed often" and "useful" cannot be told apart.
4. Why: usage records and transcript analysis were deliberately not built (no history, no telemetry).
5. Root: there is no agreed way to judge a reminder without such records. Success is a way to decide
   keep, trim or fix per reminder from constructed cases and the owner's own view.

## 2. Goals / Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| Judge each reminder by need, emission, delivery and use, with "unknown" allowed at each stage | Any hook, rule or registration change in this phase |
| Put a missed needed reminder before a repeated one | Enforcement, blocking, or output that keeps a turn going |
| Examples and a comparator that need no live data | Telemetry, stored usage, transcript scans, scheduled collection |
| Keep formatter delay separate | The two protective guards (`pre-edit-guard`, `pre-bash-codex-launch-guard`) |

**Keeping every reminder as it is is a valid outcome.** `outcome-metrics` (Pending) plans delivery
metrics, not reminder value; this document does not take over its scope.

## 3. Stakeholders

| Stakeholder | Role | Key Concern |
|-------------|------|-------------|
| User | User | Told once when it matters; not nagged |
| Model | User | A true, current fact, especially after compaction |
| Plugin maintainer | Developer | Pinned texts, tests, cost per turn |
| Offer, custom-flow setup, `/remind` | Dependent | Read the same facts |
| Projects with hooks installed locally | Dependent | Same behavior, no double firing |

## 4. Use Cases

| # | Situation | Needed? | Good outcome | Miss | Repeat |
|---|-----------|---------|--------------|------|--------|
| UC-1 | Code edited after its review passed | Yes | Model learns the gate is open again | No fact before the next claim of "done" | Same fact with nothing changed |
| UC-2 | Nothing owed; a plain question | No | Nothing the reader must act on | — | Fact line repeated |
| UC-3 | Owed gate, five turns spent on questions | Once, then after changes | Known, not pressed | Forgotten at the end | `📋` five times |
| UC-4 | Conversation compacted with a gate open | Yes | State returns | Open gate lost | — |
| UC-5 | User answered "not now" to the offer | No, until the content changes | Silence | — | Offered again unchanged |
| UC-6 | `🧭` printed but seen by nobody | Yes, once | Known as not delivered | Chance consumed | — |
| UC-7 | State cannot be read | Yes: "unknown" | Silence is not read as all clear | False "clean" | — |
| UC-8 | User set `HOOK_BYPASS` | No, by choice, for the four review reminders | Those four are silent, not counted as a miss. The namespace hint does not read the variable and still prints on a matching start | — | — |
| UC-9 | Edit in a project with prettier | Not a reminder | Delay reported as its own cost | — | — |

### Before / after

| Path | Today | Should be able to say |
|---|---|---|
| "49 of 75 fact lines repeated" | Read as 49 wasted | "Emitted 75, 49 identical to the previous. Delivered: yes in that session. Used: unknown. One role, restoring state after compaction, needs repetition." |
| "Nobody reads the Stop lines" | Assumed, or denied | "Emitted. Delivered to the model: documented as no, untested here. Seen by the user: ask. Not the same as unused." |

## 5. Functional Requirements

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| FR-1 | Each judgement states the four stages as yes, no or unknown; no stage is inferred from an earlier one | Must | Emitted is not delivered is not used |
| FR-2 | "Unused" needs a case where the reminder was needed and delivered, and an equal case without it ended the same. Otherwise the use is unknown | Must | An action after a reminder may have another cause |
| FR-3 | Misses and repeats are reported separately. A change that lowers repeats is rejected if it adds a miss in any use case | Must | The costs are unequal, and one turns into the other |
| FR-4 | A repeated line is examined for what the repetition restores before it is called redundant | Must | UC-4 |
| FR-5 | Silence is never presented as "nothing owed" when state could not be read | Must | UC-7 |
| FR-6 | Non-enforcement holds: exit 0, no output that continues a turn, no new question | Must | User's goal |
| FR-7 | Formatter delay is measured and discussed apart, and never argues for or against a reminder | Must | Different cost, different remedy |
| FR-8 | Any comparison includes the on-demand route (`review-state.js check`, `/remind`, `/next-step`) as "no hook" | Should | A reminder is worth only what the reader would otherwise lack |
| FR-9 | A "shown" mark distinguishes printed from shown to a person or model; an unknown state is not reported as already shown | Should | The blurred state in § 1 |
| FR-10 | The open question on the Skill line (`hook-lightweighting` spec § 7) is answered with its evidence, or stays open | Could | No outcome recorded |
| FR-11 | Usage logs, telemetry, transcript analysis, new hooks, louder reminders | Won't | Prior decisions |

**First scenario**: UC-3, the owed gate across several unrelated turns. It holds both errors at once.

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Usability | No per-turn growth | 0 characters and 0 lines added per turn |
| NFR-2 | Performance | No new per-turn process | 0 hook entries, 0 processes |
| NFR-3 | Security | Nothing collected | 0 stored usage records; 0 transcript reads |
| NFR-4 | Reliability | Guards untouched | Guard source and tests unchanged |
| NFR-5 | Maintainability | No always-loaded text | 0 characters |

## 7. Constraints & Assumptions

| Type | Description | Source |
|------|-------------|--------|
| Constraint | Hooks remind and never enforce | User, 2026-11-25; `hook-lightweighting` spec |
| Constraint | No history, no ledger; one slot per plane | `hook-lightweighting` spec |
| Constraint | One offer per passing digest; "not now" silences it | `git-autonomy` intent `INV-007` |
| Constraint | Hooks own facts, the model owns decisions | `auto-loop-autonomy` r2 |
| Constraint | Transcript analysis is deferred | `remind` spec |
| Assumption | `Stop` and Skill output does not reach the model | Documented by the host; not tested here |
| Assumption | Repetition costs attention | **[H]**; only characters and time were measured |
| Assumption | One session represents others | **[H]** |

### Cost of being wrong

| Error | Cost |
|---|---|
| Trim a needed reminder | An open gate is forgotten; seen only later, if at all |
| Keep a useless one | Small, every turn, for everyone; readers learn to skip the channel |
| Treat unknown as unused | The first error, with a number to justify it |

**Counterexample**: suppress unchanged fact lines, then compact. The line that looked redundant was the
one that would have carried the state across.

## 8. Acceptance Signals

**Check 1 — paper walk (no model, no data).** For UC-1 to UC-8, show the owner the exact lines printed
today beside an imagined session without them. Ask: would you want this line here, and what would you do
without it? Expected need is fixed beforehand; answers only are recorded.

**Check 2 — one look.** The next time a turn ends with a gate owed, does the owner see the `📋` line, and
where? Record yes, no or did not notice.

**Check 3 — formatter, separately.** Time the hook on synthetic files in a throwaway project with
prettier. Local, no model. Its result changes nothing about reminders.

| Result | Consequence |
|---|---|
| A needed reminder is missing in a use case | First priority, before any trimming |
| Lines wanted and seen, no complaint | Stop; keep as is |
| A line is unwanted in every use case, and its on-demand route exists | Candidate for a separate design; not removed here |
| The owner does not see `Stop` lines and names no reader | Delivery question first, not removal |
| Answers differ case by case | Keep; a single rule does not fit |

| Signal | Verifies |
|---|---|
| Each verdict carries four stage values | FR-1, FR-2 |
| The use-case table shows miss and repeat columns for any proposal | FR-3, FR-4 |
| Any proposal leaves exit codes, questions and guards as they are | FR-6, NFR-4 |
| Formatter figures appear in no reminder argument | FR-7 |

## 9. Open Questions

- [ ] **Owner**: do you see the `Stop` lines, and have you acted on one?
- [ ] **Owner**: in UC-3, is once enough, or do you want it at each stop?
- [ ] **Owner**: is there any moment you wished for a reminder and got none?
- [ ] Host fact: does the documented event list hold on the host versions users run?
- [ ] Solution concern: whether `🧭` should reach the reader another way — the earlier options differ in timing and cost — suggest `/feasibility-study`
- [ ] Solution concern: formatter timing or background execution, as its own topic

## 10. References

- Source: `hooks/hooks.json`, `hooks/{user-prompt-review-guard,stop-guard,post-skill-auto-loop,post-compact-auto-loop,post-edit-format}.sh`, `scripts/namespace-hint.sh`, `scripts/review-state.js` (`check`, `computeOffer`, `offerShown`, `flowDetect`)
- Tests: `test/hooks/reminder-hooks.test.js`, `test/hooks/hooks-json-registry.test.js`, `test/scripts/review-state.test.js`
- Prior decisions: [`hook-lightweighting` spec](../hook-lightweighting/2-tech-spec.md), [`git-autonomy` intent](../git-autonomy/intent-git-autonomy.md), [`outcome-metrics` request](../outcome-metrics/requests/2026-03-21-delivery-outcome-dashboard.md), [`review-coverage-visibility`](../review-coverage-visibility/1-requirements.md)
- Host: [Hooks page](https://code.claude.com/docs/en/hooks), read in part 2026-11-25 (`SessionStart` stdout, `additionalContext` and timeouts verbatim; the exit-code event list through two readers)
