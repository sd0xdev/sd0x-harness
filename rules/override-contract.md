---
paths:
  - ".claude/rules/*-project.md"
---

# Override Contract

The canonical resolution contract for the three user-owned override files — `auto-loop-project.md`,
`testing-project.md` and `git-workflow-project.md`. Each parent rule keeps a compact core in its own
section (`auto-loop.md` § Override Contract, `testing.md` § Project Customization,
`git-workflow.md` § Project Customization) and points here; this file carries the resolution order,
the two kinds and the heading tables. Read it before interpreting, auditing or editing an override.
It restates Anchor supremacy; it grants no exception to it.

## Resolution

An active (non-comment) `##` section in an override file customizes its parent rule — **Default and Guidance tiers only**. Anchor-tier instructions (`rules/discretion.md` § Anchor Register) are never overridable: on conflict the Anchor wins and the conflict is reported, not silently resolved.

Resolution is **Anchor-first**, because an instruction's tier is decided by `discretion.md`, never by a label written next to it: **(0)** an Anchor Register hit resolves to **Anchor** and stops there — a tier annotation in either file cannot downgrade a Register hit, and one that tries is reported as a conflict rather than honoured. Only for non-Anchor instructions does the rest apply, highest first: (1) an explicit tier annotation on the instruction itself; (2) the heading table below for that file; (3) preamble text before the first `##` resolves as one synthetic section; (4) an unknown heading fails closed to **Default** and is listed in the report, never silently dropped.

## Kinds

Two override kinds, and the distinction is load-bearing: a **section replacement** restates a `##` heading the parent rule actually defines and replaces that section wholesale; a **setting** names a configuration slot that the parent rule's prose or a hook reads by name. Settings have no same-named section in the parent, so "full replacement" never describes them — every setting below names its consumer.

## auto-loop-project.md → auto-loop.md

Anchor instructions here are Anchor Register #3, #5, #6 and #7 material in `auto-loop.md`.

| Override heading | Kind — consumed by | Tier |
|------------------|--------------------|------|
| preamble (synthetic section) | Header — the live precedence declaration, resolved as one synthetic section | Default |
| `## Tier` | Setting — `auto-loop.md` § Tiers, "the configured tier … baseline, not a ceiling" | Default — the security/data-integrity escalation sentence in § Tiers is Anchor-tier (Anchor Register #3 hit, resolved at step 0) and stays binding whatever tier is configured |
| `## Max Rounds` | Setting — `auto-loop.md` § Tiers cap sentence; the model tracks rounds against it | Default |
| `## Plan Review` | Setting — `/plan-review` self-invocation in plan mode | Default |
| `## Plan Review Max Rounds` | Setting — `/plan-review` loop bookkeeping, counted in conversation | Default |
| `## Git Memory` | Setting — post-compact git-context nudge (printed by default since hook-lightweighting; heading kept for compatibility) | Default |
| `## Think Harder` | Setting — the diagnosis protocol after a compaction, read by the model (no hook injects it); `auto-loop.md` § Stall Detection and Diagnosis routes to `loop-diagnostics.md` § Cap Diagnostic Protocol, which carries the checklist | Default |
| `## Review Thread Rotation` | Setting — the R-a rotation threshold (2–6, unset = 3) read behaviourally by `review-common.md` § Review Loop; counted in conversation, no hook reads it | Default |
| `## Codex Profile` | Setting — the Codex profile every dispatch carries, read by `skills/codex-code-review/references/codex-transport.md` § Profile; unset means Codex's own default configuration, and selection is not tier-dependent in v1 | Default |

No row is a section replacement: `## Tier` is deliberately **not** `auto-loop.md`'s `## Tiers`, and
the other seven name no section at all. A user who does want a section replacement restates that
section's exact heading — the mechanism is available, the scaffold just does not ship one.

## testing-project.md → testing.md

Anchor-tier rows in `testing.md` are the security / data-integrity / regression "❌ Never" rows
(Anchor Register #3).

| Override heading | Kind — consumed by | Tier |
|------------------|--------------------|------|
| preamble (synthetic section) | Header — the live precedence declaration, resolved as one synthetic section | Default |
| `## Test Pyramid` | Section replacement — `testing.md`'s `## Test Pyramid` | Default |
| `## Adequacy Mode (project-only extension — not in testing.md core)` | Setting — `auto-loop.md` § Tiers gate sequence reads the Adequacy Gate mode from it | Default — project-only extension with no parent section; permitted as a documented extension, resolved by this table (exact template heading) rather than parent-heading match |

## git-workflow-project.md → git-workflow.md

Anchor-tier instructions in `git-workflow.md` are Anchor Register #4 — the forbidden-operation
list, the enumerated workflow grants, the attribution rule, the default protected branches and
§ Push safety — and #2 for secrets. The shipped scaffold is settings-only.

| Override heading | Kind — consumed by | Tier |
|------------------|--------------------|------|
| preamble (synthetic section) | Header — the live precedence declaration, resolved as one synthetic section | Default |
| `## Branch Naming` | Setting — replaces `git-workflow.md`'s `Branches:` line | Default |
| `## Commit Format` | Setting — replaces `git-workflow.md`'s `Commit:` line | Default |
| `## Protected Branches` | Setting — an additions list unioned with the default set, read by `scripts/protected-branches.sh`; there is no removal syntax, and a removal attempt or parse error makes every branch read as protected | Default — the default set itself is Anchor (Register #4) and cannot shrink |
| `## Offer Mode` | Setting — `on` (default) · `commit-only` · `off`, read by `review-state.js offer` (`git-workflow.md` § Proactive Offer); `/claude-health` validates the value | Default |
| `## Deploy Workflow` | Setting — the declared `merge` / `run` steps, read by `/deploy-flow`; `/claude-health` validates the lines | Default — the steps run only under `/deploy-flow`'s own Register #4 entry and its per-step approval |
| `## Run Steps` | Setting — `print` (default) · `execute`, read by `/deploy-flow`; the scaffold states the run-script risk | Default |
| `## Goal Commit` | Setting — `on` (default) · `off`, read by `review-state.js goal-commit` (`git-workflow.md` § Proactive Offer, "Goal mode"); `off` only narrows | Default |
