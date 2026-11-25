# Requirements: skill-discoverability

> **Doc class**: Lifecycle — Phase 1 requirements (per `@rules/docs-numbering.md`). Feature-level problem-space analysis. **Not** a task tracking ticket; for per-task progress tracking see `requests/*.md` (created via `/create-request`).
> **Created**: 2026-11-25
> **Updated**: 2026-11-25
> **Tier**: standard
> **Intent**: [intent-skill-discoverability.md](./intent-skill-discoverability.md)
> **Tech Spec**: [2-tech-spec.md](./2-tech-spec.md)

Baseline: sd0x-dev-flow 5.2.1 at `cce16f3`. **[V]** read in the source; **[O]** seen once, in one
session; **[H]** hypothesis nobody has measured.

## 1. Problem Statement

A user describes a task in plain words and expects the right installed skill, or none, to be used.
Whether that works depends on separate layers, and today a statement about one is easily read as a
statement about the next.

| Layer | Question | Known today |
|---|---|---|
| Installed | Is the skill on disk for this project? | 102 skills; 3 set `disable-model-invocation` (`epic-merge`, `repo-intake`, `safe-remove`) **[V]** |
| Listed | Is its name offered to the model? | 99 can be, by frontmatter **[V]** |
| Described | Is its description offered too? | 71 of 99 plugin entries were name-only in one session **[O]** |
| Selected | Is the right skill chosen for a phrase? | No test, fixture or measurement exists **[V: none found]** |

**The one observation is not a normal install.** It came from the source checkout, where an untracked
local symlink (`.claude/skills` → `../skills`, under a gitignored directory) exposes the same folder as
project skills beside the plugin **[V]**. A fresh clone or a plugin install has no such link. Whether an
ordinary install also loses descriptions is unknown **[H]**.

**Length alone does not explain it.** All descriptions together are about 30,000 characters, and the
longest is under 800 **[V]**, below the 1,536-character per-entry cap in the host changelog (2.1.105).
The host also applies a total budget. Its size is not settled here: the changelog said 2 % of context
(2.1.32), and a machine summary of the current skills page said 1 %.

**The repository assumes descriptions are always present.** The routing guide calls the description
"the **only** information Claude sees at Level 1 (always in context)"
(`skills/skill-health-check/references/routing-signature-guide.md` § Problem). "When NOT to use"
sections are in the skill body, which is read after a skill is chosen **[inferred]**.

**Even with every description visible, some pairs are hard to tell apart [V]**: `security-review` and
`codex-security`, and parents beside their aliases (`doc-review` / `codex-review-doc`,
`test-review` / `codex-test-review`, the code-review group). The aliases are deliberate
(`docs/features/commands-to-skills-migration/2-tech-spec.md`, the "B1 thin" rows).

### 5-Why Trace

1. Surface: make skills easier to find by describing a task.
2. Why: a user who does not know 99 names depends on the model's choice.
3. Why: the choice rests on what the host lists, which the plugin does not control and has not observed
   in an ordinary install.
4. Why: the only number at hand mixes a source-checkout effect with a possible real one.
5. Root: there is no agreed way to say which layer failed. Success is knowing that before changing any
   description.

## 2. Goals / Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| Separate listing, description, selection and explicit use in every claim | A router, a routing skill, a hook trigger, or natural-language detection by hooks (out of scope in `proactive-suggestion`; a hidden routing skill is out in `plugin-namespace`) |
| A light, optional observation of an ordinary install, made by the user in their own project | Installing anything for the user, collecting data, or a paid model evaluation now |
| A like-for-like comparison design, with controls, ready if the observation justifies it | Rewriting descriptions in bulk, or editing the user's host settings |
| Protect explicit invocation and the flows that need model invocation | Removing aliases or changing `disable-model-invocation` |

**Doing nothing is a valid outcome**: § 8 says which results end the feature.

## 3. Stakeholders

| Stakeholder | Role | Key Concern |
|-------------|------|-------------|
| User who knows the task, not the name | User | Right skill, or none, without learning 99 names |
| User who types `/name` | User | Unchanged behavior |
| Plugin maintainer | Developer | Not spending a shared budget on an unproven problem |
| Contributor in the source checkout | Developer | Knowing a duplicated list is local |
| Commit, push and review flows; `/remind` | Dependent | They rely on model invocation |
| Other installed plugins | Dependent | May share the host's listing budget **[H]** |

## 4. Use Cases

| # | Actor | Action | Expected Outcome |
|---|-------|--------|-----------------|
| UC-1 | User | Describes a task whose skill is listed with its description | That skill, or an accepted equivalent, is used |
| UC-2 | User | Describes a task whose skill is listed by name only | Outcome recorded as its own condition; not assumed to fail |
| UC-3 | User | Describes a task that a parent and its alias both serve | Either counts as right if it reaches the same workflow |
| UC-4 | User | Asks something no skill should handle ("what does this regex match?") | No skill is used |
| UC-5 | User | Types the plugin-qualified command, for example `/sd0x-dev-flow:doc-review` | Runs the plugin's copy in every condition (control). An unqualified name may reach a project copy and is recorded apart |
| UC-6 | User | Describes a task served only by a skill the model may not invoke | Not selected, by design; not counted as a miss |
| UC-7 | Contributor | Sees the same skill twice in a source checkout | Understood as a local duplicate, not a property of the plugin |
| UC-8 | User | Describes the task in Traditional Chinese | Recorded as its own condition |

### Before / after

| Path | Today | Should be able to say |
|---|---|---|
| "71 of 99 lack descriptions" | Read as "users cannot find skills" | "In one source checkout listing each skill twice, 71 plugin entries were name-only. An ordinary install was not observed, and selection was not tested." |
| A user reports the wrong skill was used | Descriptions are suspected at once | "Listed: yes. Described: yes. The phrase fits two skills that nothing tells apart." The layer that failed is named |

## 5. Functional Requirements

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| FR-1 | Every claim names its layer and its evidence; no layer is inferred from another | Must | The root confusion |
| FR-2 | The ordinary-install observation covers listing and description only, is optional, and is made by the user in a project they chose | Must | User: will install elsewhere themselves |
| FR-3 | Counts are kept per source (plugin, project, other); a source-checkout count never stands for an ordinary install | Must | The symlink effect |
| FR-4 | No description changes before a like-for-like comparison: the same phrases, described against name-only, answers fixed first, with explicit, no-skill and equivalent-skill controls | Must | Separates truncation from selection |
| FR-5 | Wrong skill, missed skill and skill-used-when-none-fits are reported separately, never as one accuracy figure | Must | Most prompts need no skill, so one figure can improve while unwanted use grows |
| FR-6 | A change is judged over the whole list, not only the edited skill | Must | Under a shared budget, longer text for one entry may remove another's |
| FR-7 | Explicit invocation, and the flows that rely on model invocation, behave as today | Must | Commit and push menus, review gates, `/remind` |
| FR-8 | Equivalent skills are declared before a comparison | Should | Aliases are deliberate |
| FR-9 | A user who cannot find a skill can learn of one existing place to look; whether that place is reachable is checked first | Should | `/ask`, the catalog and the cookbook exist; `/ask` must itself be found |
| FR-10 | Language is recorded as a condition | Could | Descriptions are mostly English; phrases may not be |
| FR-11 | Router, hook trigger, resident skill list, alias removal, automatic host-setting edits | Won't | Prior decisions; resident budget |

**First scenario**: UC-1 and UC-2 in one ordinary install — is there a described/name-only split at all?

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Usability | The observation is light | One sitting, one project, no new tool |
| NFR-2 | Security | It records counts, versions and, optionally, this plugin's own skill names | 0 project content, prompts, paths or other plugins' names |
| NFR-3 | Maintainability | No always-loaded text | 0 characters added |
| NFR-4 | Cost | No model spend without consent | 0 paid runs before the owner agrees |
| NFR-5 | Reliability | A comparison is repeatable | Same host version, model, install method, phrase list and order rule recorded |

## 7. Constraints & Assumptions

| Type | Description | Source |
|------|-------------|--------|
| Constraint | `SKILL.md` is authoritative for `description` | `readme-catalog-sync` spec |
| Constraint | Host behavior that cannot be exercised is written as documented, never as tested | `claude-code-2-1-288-compat` intent `INV-007` |
| Constraint | No addition to the resident launch core | same intent, Non-goals |
| Constraint | Aliases stay | `test/skills/alias-skills.test.js` |
| Assumption | The user can see a listing summary in the host (`/doctor`, `/context`) | Changelog 2.1.144 for `/doctor`; not tried here **[H]** |
| Assumption | What the host reports matches what the model receives | **[H]**; a model's own account of its list is self-report |
| Assumption | Missing descriptions lower selection quality | **[H]** |

### Cost of being wrong

| Error | Cost |
|---|---|
| Shorten or rewrite descriptions with no real truncation | Cues lost and routing changed for a problem that was not there |
| Ignore a real truncation | Users keep missing skills, silently |
| Add cues that fire too often | Unwanted skill runs, the costlier error where a skill starts long reviews |

**Counterexample**: an ordinary install with every description present, where two overlapping skills are
still confused. The truncation number would have pointed at the wrong fix.

## 8. Acceptance Signals

**Step 1 — ordinary-install observation (optional, the user's own project, no paid run).** Record: host
version, model, install method, number of other plugins, plugin entries listed, entries with and without
a description, duplicates by source, and how each number was read. Optionally, the names of this plugin's
name-only entries: counts alone cannot say which skills are affected. "Could not tell" is a valid entry.

**Step 2 — comparison (only with consent).** Use a fixed set of phrases with answers written first:
described targets, name-only targets, equivalent groups, and at least as many no-skill phrases as
targets. Run both conditions with order shuffled, and report FR-5's counts separately. Example: in one session the
host shows `doc-refactor` with its description, in another only its name; the operator read that per skill
from the host each time, and labels the answers `described` and `name-only`. A total listing size cannot
show one skill's state; where either state was not read, leave that pair unscored.

| Result | Consequence |
|---|---|
| Step 1: every entry described | Stop the truncation line; selection stays unknown and needs its own reason |
| Step 1: name-only entries, counts only | Impact on task-based discovery stays unknown; the observation may end there |
| Step 1: name-only entries identified by name, and the owner confirms every one is reached only by explicit invocation or a gate | Stop; nothing to fix |
| Step 1: name-only entries identified, and the owner reaches at least one by describing a task, whatever else reaches it | Ask for consent to step 2 |
| Step 1: name-only entries identified, task-based use unknown for any, and none confirmed | Impact stays unknown; the observation may end there |
| Step 2: name-only is chosen as well as described | Stop; truncation does not matter here |
| Step 2: described is clearly better, and no-skill phrases stay quiet | Proceed to a tech spec |
| Step 2: unwanted use rises | Stop, whatever the hit rate did |

| Signal | Verifies |
|---|---|
| Each recorded claim names layer, source and method | FR-1, FR-3 |
| A no-skill and an explicit control sit beside every target set | FR-4, FR-5, FR-7 |
| A proposed edit is accompanied by the whole-list result | FR-6 |

## 9. Open Questions

- [ ] **Owner**: will you note step 1's counts when you install elsewhere? Optional; not needed for anything else
- [ ] **Owner**: which skills do you reach by describing rather than naming?
- [ ] **Owner**: do `proactive-suggestion`'s exclusions (natural-language detection, no frontmatter edits) still bind outside hooks? Its request is Pending
- [ ] Solution concern: overlapping descriptions (for example `security-review` / `codex-security`) can be told apart without any truncation finding — suggest `/feasibility-study`
- [ ] Solution concern: a host setting may let the user enlarge or trim the list without a plugin change; seen only in a page summary — verify first
- [ ] Adjacent: the routing guide's "always in context" wording may be inaccurate; decide after step 1

## 10. References

- Source: `skills/*/SKILL.md` frontmatter; `test/skills/skills-schema.test.js`; `skills/skill-health-check/references/routing-signature-guide.md`; `skills/ask/references/routing-table.md`; `docs/skill-catalog.yml`
- Prior decisions: [`commands-to-skills-migration`](../commands-to-skills-migration/2-tech-spec.md), [`readme-catalog-sync`](../readme-catalog-sync/2-tech-spec.md), [`plugin-namespace`](../plugin-namespace/requests/2026-02-13-command-namespace-resolution.md), [`proactive-suggestion`](../proactive-suggestion/requests/2026-03-21-hook-based-event-dispatcher.md), [`claude-code-2-1-288-compat` intent](../claude-code-2-1-288-compat/intent-claude-code-2-1-288-compat.md)
- Host changelog, read locally 2026-11-25: 2.1.32, 2.1.105, 2.1.144. [Skills page](https://code.claude.com/docs/en/skills): its budget section was available only as a machine summary and supports no requirement here
