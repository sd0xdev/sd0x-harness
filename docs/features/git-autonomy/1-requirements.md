# Requirements: git-autonomy

> **Doc class**: Lifecycle — Phase 1 requirements (per `@rules/docs-numbering.md`). Feature-level problem-space analysis. **Not** a task tracking ticket; for per-task progress tracking see `requests/*.md` (created via `/create-request`).
> **Created**: 2026-09-23
> **Updated**: 2026-09-24 (maintainer decisions on § 9 Q1, Q2, Q6, run steps, FR-16)
> **Tier**: standard
> **Intent**: [intent-git-autonomy.md](./intent-git-autonomy.md)
> **Tech Spec**: [2-tech-spec.md](./2-tech-spec.md)

## 1. Problem Statement

The harness treats every `git add` / `commit` / `push` as an operation the user must reach for by
hand: the model may not run them outside four enumerated workflows, may not invoke `/push-ci` at
all (`disable-model-invocation: true`), and the out-of-workflow credential is a sentence the user
has to type — "the credential is the message text". On a **feature branch**, where a bad commit
costs a `reset` and a bad push costs a force-with-lease — one that affects nobody else *when the
branch is unshared*, which the harness attests by asking and never assumes (`git-workflow.md`
§ Push safety) — that ceremony is friction out of proportion to the risk: the user finishes a reviewed change and then has to type two
slash commands and answer the same questions they would have answered from a menu.

The maintainer's direction (2026-09-23): inside a bounded fault-tolerance space — feature
branches — give the model room to **offer** commit and push proactively, let the user **choose from
a menu** rather than paste text, allow `/push-ci` to be run as often as the work needs, and let a
project **write its own git rules** in a user-owned override file, the way `auto-loop-project.md`
and `testing-project.md` already do for their parents. What does **not** loosen: the
no-AI-attribution checks, the protected-branch prompts, and the Anchor Register's exception list as
the closed set of who may push.

### 5-Why Trace

1. Surface: pop an AskUserQuestion offering `/smart-commit --execute` and `/push-ci`; let
   `/push-ci` be called repeatedly; add `rules/git-workflow-project.md`; authorize by selection.
2. Why: after a change passes every gate, the remaining steps are mechanical, yet each one waits
   for the user to type a command or a sentence. The harness pays for that caution on `main`,
   where it is right, and on `feat/x`, where — once the branch is attested unshared — nothing shared is at stake.
3. Root: the git rules were written as one uniform ceiling. The success criterion is a **two-tier
   ceiling** — feature branches get proactive, menu-driven commit/push under the same per-use
   approval and the same attribution guard; protected branches and out-of-workflow operations keep
   today's credentials — plus a **project-owned override** so teams with their own deploy flow
   (merge + pipeline scripts) can describe it once instead of fighting the defaults.

## 2. Goals / Non-Goals

| Goals | Non-Goals |
|-------|-----------|
| After a change's gates pass on a feature branch, the model offers `/smart-commit --execute` and `/push-ci` through a single AskUserQuestion menu — the user picks, never pastes | Weakening the attribution guard: `commit-msg-guard.sh`'s patterns, the one-line `--ai-co-author` whitelist, `/create-pr` Step 4b sanitization all stay exactly as they are |
| `/push-ci` may be invoked by the model and re-invoked as often as the branch has new commits, each push under its own per-use approval | Pushing to protected branches (`main`/`master`/`develop`/`release/*`) without the protected-branch prompt, or any force-form push to them |
| A user-owned `rules/git-workflow-project.md` that overrides Default-tier git rules (branch naming, commit format, the project's deploy workflow; allowed read-only ops **deferred** — no read-only command is forbidden, see the tech spec § 3.2) under the same Anchor-first contract as the two existing override files | Overriding Anchor Register #4 items through the project file: the forbidden-operation list, the enumerated workflow set, the attribution whitelist, and *removing* a default protected branch (adding one is allowed, FR-7) |
| The model may proactively ask whether the user wants such an override file when it detects a custom git flow (a merge-based release script, a pipeline trigger, a branch convention the defaults reject) | Executing anything an override does **not** declare, or running a declared deploy step without its per-use approval — the override names the steps, the approval authorizes each run |
| The out-of-workflow "user-authorized execution" credential stays available for what the menus do not cover | Removing the `/dev/tty` pre-push gate where it is installed, or the `ALLOW_*` attestation contract |

## 3. Stakeholders

| Stakeholder | Role | Key Concern |
|-------------|------|-------------|
| Maintainer (sd0x) | Developer / decision-maker | The Anchor Register's exception list is part of the anchor; loosening must be expressed as a change to *who may invoke* a workflow, never to *what credential authorizes* it |
| Plugin users on feature branches | User | Fewer typed commands; a menu at the moment the work is done; no surprise pushes |
| Plugin users on `main` / release branches | User | Push stays as today — the protected prompt, the hook, the abort on force; they gain a commit-only menu |
| Teams with a bespoke deploy flow | User / Operator | A place to write "we merge `develop` into `release/*` and run `scripts/deploy.sh`" that the harness respects instead of flagging |
| `/smart-commit`, `/push-ci` skills | Dependent | Their approval shapes are the credential; a proactive offer must land in *their* AskUserQuestion, not a new one |
| `/feature-dev`, `/bug-fix`, `/debug`, `/test-deep` | Dependent | Each says "the user must invoke `/smart-commit --execute` separately" — those sentences become false |
| `/post-dev-recap` | Dependent | Read-only by its own contract (AS-6 mutation ban, pinned by its test) — unaffected, and must stay so |
| `/install-rules`, `/claude-health`, `/project-setup`, README generator | Dependent | The override-file list is hard-coded in ~15 places (§ 7); a third file must be registered everywhere the first two are |
| `test/rules/discretion-tiers.test.js`, `test/rules/override-contract.test.js`, `test/skills/push-ci.test.js` | Dependent | Byte-pins on the register, the grant block, the push-safety line, the efficacy section and "no exceptions" — every Anchor-adjacent sentence that changes changes a pin |

## 4. Use Cases

| # | Actor | Action | Expected Outcome |
|---|-------|--------|-----------------|
| UC-1 | User on `feat/x`, all gates pass | Finishes a change | The model asks once: commit (`/smart-commit --execute`), commit + push (`/push-ci` after), or not now. Picking an option runs that workflow, which still shows its own plan and asks its own approval |
| UC-2 | User on `feat/x` | Makes a second round of commits after the first push | The model may offer `/push-ci` again; Phase 0 finds N commits ahead and the push proceeds under a fresh approval |
| UC-3 | User on `main` | Finishes a change | A commit-only menu (a local commit publishes nothing); no unsolicited push offer. If the user asks to push, `/push-ci` is offered as an option and its protected pre-approval applies |
| UC-4 | User whose repo releases by `git merge develop` + `scripts/deploy.sh` | The model notices the flow (a script, a CI file, a rejected branch name) | The model asks whether to create `rules/git-workflow-project.md` describing it; on yes, `/install-rules --customize git-workflow` scaffolds the file |
| UC-4b | Same user, override in place | Asks the model to release | The model runs the declared merge step(s) after a per-use AskUserQuestion naming each step, source and target; a push the **harness** issues afterwards goes through `/push-ci` and its protected-branch prompt. If the project set `Run Steps: execute`, a declared script runs only after its own per-step approval that states the risk — and what that script does is the run-script risk (tech spec § 3.3 step 3), by the project's choice |
| UC-5 | User with an override that adds `rel/*` to the protected set | Runs `/push-ci` on `rel/2026.09` | The project-declared name is honoured as protected; the default set is neither narrowed nor silently widened elsewhere |
| UC-6 | User | Picks "commit" from the menu, and the message the model drafted contains an AI trailer | `smart-commit-execute.sh commit` rejects it (exit 4) exactly as today; the menu changed how the workflow was reached, not what it enforces |
| UC-7 | User | Wants an operation no workflow covers (`git stash`, `reset --hard`, a `rebase` outside `/epic-merge`'s `rebase --onto`) | Still authorized only by their own message naming it — the menu never offers it |

## 5. Functional Requirements

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| FR-1 | On a **feature branch** (a real branch name, not in the protected set), once every gate that the published content's change classes require (`auto-loop.md`: code → `code_review` + `precommit`; `.md` → `doc_review`) reads `pass` at the current digest — so a doc-only change needs `doc_review` alone — the model **offers** commit and push through one AskUserQuestion with options at least `commit`, `commit and push`, `not now` | Must | The offer arrives at the last step of the banking sequence (`auto-loop.md` § Stall Detection: adjustment → gate pass → note → user-approved commit) |
| FR-2 | Choosing an option **invokes the enumerated workflow** (`/smart-commit --execute`, then `/push-ci`); the workflow's own plan and AskUserQuestion remain the per-use credential. The menu choice is never itself the approval for `git add`/`commit`/`push` | Must | `discretion.md` § Efficacy Boundary: inside an enumerated workflow the per-use AskUserQuestion is required and sufficient; a menu that skipped it would be a credential the anchor does not list |
| FR-3 | `/push-ci` becomes model-invocable (`disable-model-invocation` removed) and may be invoked any number of times per session; each invocation runs Phase 0 afresh and aborts on "0 commits ahead" | Must | No cooldown or counter exists today; the only restriction is the frontmatter flag and the "Auto-triggering this skill" line in § Prohibited |
| FR-4 | No unsolicited **push** offer on a protected branch, and no offer at all on a detached HEAD; a commit-only menu is allowed on any real branch. `/push-ci`'s protected prompts are unchanged | Must | The fault-tolerance argument is about publishing: a local commit on `main` overwrites nothing shared (maintainer 2026-09-24) |
| FR-5 | The no-AI-attribution invariant is untouched. Every commit the **harness** creates on a menu path is guarded (a commit made *inside* an opted-in `run` script falls under the run-script risk, tech spec § 3.3 step 3): a `/smart-commit` commit passes through `smart-commit-execute.sh commit` → `commit-msg-guard.sh`, and a `/deploy-flow` merge commit carries only a fixed template message that the same guard checks before the merge; `ALLOW_AI_COAUTHOR` never comes from the environment; the whitelist stays exactly one line; PR text still passes `/create-pr` Step 4b. A commit made under the user-authorized-execution route (a direct `git commit` the user's message named) keeps today's enforcement: the `commit-msg` hook where `/codex-setup init` installed it, and CLAUDE.md rule 3 — an Anchor — where it did not; this feature adds no third path | Must | Maintainer's explicit carve-out; Register #4 names the whitelist as part of the anchor; rule 3 says the hook is optional, so the helper's guarantee is stated only for the path that runs the helper |
| FR-6 | A third user-owned override file `rules/git-workflow-project.md` exists, scaffolded by `/install-rules` with the same `Precedence:` preamble and `Based on: git-workflow.md @ <hash>` stamp as the two existing files, and resolved **Anchor-first** under a § Project Customization section added to `rules/git-workflow.md` | Must | Same contract as R8; a third file that resolved differently would be a second override mechanism |
| FR-7 | The override file can set, at minimum: branch-naming convention, commit-subject convention, additional protected branches (union with the default set — never removal — and honoured by **every** mutating workflow: `pre-push-gate.sh`, `/push-ci`, `/epic-merge`, `/gh-stack`), the project's deploy-workflow description, and whether proactive commit/push offers are on / off / commit-only | Should | These are the Default-tier lines in `git-workflow.md` (L3–4, L16) plus the two switches this feature introduces |
| FR-8 | An override heading that names an Anchor item (the forbidden-operation list, the workflow grants, the attribution rule, removal of a default protected branch) is **reported as a conflict and ignored**, never honoured | Must | R8 Anchor-first step 0; `discretion.md`: "no annotation in a user-owned file can downgrade a Register hit" |
| FR-9 | When the model detects a custom git flow — a merge-based release script, a CI trigger script, a branch name the default convention rejects — and no override file exists, it may **ask** the user once whether to create one; it never creates or edits the file unasked | Should | Points 4 and 6 of the maintainer's direction: "proactively ask", not "proactively write" |
| FR-10 | An override declaring a deploy workflow (e.g. `git merge develop` into `release/*` + `scripts/deploy.sh`) makes the harness **recognise** the flow (`/claude-health` reports it; the model stops proposing the default convention against it) **and** lets the model **execute the declared `git merge` step(s)** — and, where the project opts in and is told the risk, its declared scripts — through a new enumerated workflow added to Anchor Register #4 — each run after a per-use AskUserQuestion naming the step, source and target branch; only steps the override declares. A push the **harness** issues after the flow goes through `/push-ci`; a push performed **inside** an opted-in script does not, and the per-step question says so | Must | Maintainer decisions 2026-09-24 (§ 9 Q6 and the pipeline-trigger item): authorize the merge step, and let the project opt its scripts in with the risk stated — one Anchor-level new exception. The exception list is part of the anchor, so this is a Register #4 change with its pins |
| FR-11 | Every place that lists the two override files registers the third: `discretion.md` L3, `install-rules` copy contract, `claude-health` S2.5 #1/#3, `project-setup` counts, `CLAUDE.md`/`CLAUDE.template.md` `## Rules`, `rule-override-pattern` §3.3/§3.4 `override_templates`, README rule counts, and the tests that pin each | Must | The survey found the list hard-coded in ~15 places; partial registration is a `claude-health` P1 on every consuming project |
| FR-12 | The skills that say "the user must invoke `/smart-commit --execute` separately" (`feature-dev`, `bug-fix`, `debug`, `test-deep`) are reworded to the menu rule and their pins updated. `post-dev-recap` is **not** changed: its AS-6 mutation ban and `test/skills/post-dev-recap.test.js` stay, and it has no closing commit/push suggestion to convert | Must | Otherwise two instruction surfaces disagree about the same act |
| FR-13 | The out-of-workflow **user-authorized execution** credential (message text naming the operation) is unchanged and remains the only route for operations neither a menu nor an enumerated workflow covers | Must | The menu covers commit and push; `stash`, `reset --hard` and a `rebase` outside `/epic-merge` stay text-authorized |
| FR-14 | The offer is **suppressed** after the user answers `not now` for the current digest, and re-offered only after a new gate pass at a new digest | Should | An offer repeated every turn is nagging — the UX failure the feature exists to remove |
| FR-15 | The same menu is reachable by a one-word request ("commit", "ship it") | Could | Cheap once FR-1 exists; not required for the goal |
| FR-16 | Whenever the model or a skill suggests `/smart-commit --execute`, `/push-ci` or `/deploy-flow` as a next step, it is presented as an AskUserQuestion option that invokes the skill on selection — never as a command for the user to copy. An unsolicited suggestion still obeys FR-4 (no push option on a protected branch); only the user's explicit request to push puts `/push-ci` there | Must | The root pain (maintainer 2026-09-24): after a task the model asks "run `/smart-commit --execute`?" in prose, and on a phone the user must copy and paste it |

Priority: Must / Should / Could / Won't (MoSCoW)

## 6. Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-1 | Security | No new credential: after this feature the set of things that authorize a mutating git operation is **exactly** {workflow AskUserQuestion, `/dev/tty` hook where installed, user message naming the op} — unchanged | `discretion.md` § Efficacy Boundary byte-pin unchanged, or changed only to *name* proactive invocation without adding a credential |
| NFR-2 | Security | Attribution-guard coverage is 100 % of commits the harness creates on a menu path (opted-in `run` scripts fall under the run-script risk, tech spec § 3.3 step 3); PR titles and bodies keep their 100 % coverage through `/create-pr` Step 4b (the menu creates no PRs); commits made under user-authorized execution keep today's coverage (hook where installed, rule 3 always) | `test/scripts/commit-msg-guard.test.js`, `smart-commit-execute` tests and `create-pr` sanitization tests pass unchanged; a new test proves the menu path reaches `smart-commit-execute.sh commit` |
| NFR-3 | Usability | Zero pasted text on the feature-branch happy path: from "gates pass" to "pushed" the user makes ≤ 3 selections (offer, commit plan, push plan) | Counted in the acceptance walkthrough |
| NFR-4 | Usability | No unsolicited push offer on protected branches; no repeated offer at the same digest; no printed slash command where an option could be offered | Test: 0 push offers on `main`; 1 menu per new passing digest; the reworded skills contain no "run `/smart-commit --execute`" copy-text |
| NFR-5 | Maintainability | Every surface that states how many override files ship, or which, agrees with disk — no consumer can drift on its own | A test fails when any carrier (install-rules, claude-health, project-setup counts, README counts, CLAUDE.md `## Rules`) disagrees with `rules/*-project.md` on disk; how the single source is realised is the tech spec's call |
| NFR-6 | Maintainability | Override resolution for the third file is the same algorithm as the first two (Anchor-first, steps 0–4) | The § Project Customization section in `git-workflow.md` cites the same four steps; `override-contract.test.js` pins it like the other two |
| NFR-7 | Reliability | A malformed or Anchor-violating override never disables git safety: the conflict is reported and the default stands | Test: an override with a removal attempt (e.g. a negated `main` entry) → `main` still protected in `pre-push-gate.sh`, `/push-ci`, `/epic-merge` and `/gh-stack`, conflict line printed |

## 7. Constraints & Assumptions

| Type | Description | Source |
|------|-------------|--------|
| Constraint | Anchor Register #4's exception list is closed: `/push-ci`, `/smart-commit --execute`, `/epic-merge`, `/gh-stack`, user-authorized execution. This feature adds **exactly one** entry — `/deploy-flow`, which runs the declared merge steps and, where the project opts in, its declared scripts (FR-10, maintainer decisions 2026-09-24) — and otherwise changes only who may *invoke* two existing workflows and adds a menu that *reaches* them | `rules/discretion.md` § Anchor Register #4; the grant block in `rules/git-workflow.md` L8–15 is byte-pinned |
| Constraint | An AskUserQuestion answer may be auto-approved by session caching, so it is sufficient **only inside** an enumerated workflow. The offer menu is therefore a router, never an approval | `rules/discretion.md` § Efficacy Boundary (byte-pinned); `push-gate-optin` §2.3 |
| Constraint | Any text change in `discretion.md` § Anchor Register or § Efficacy Boundary, `git-workflow.md` L8–15 / L20–21 / L25, or `push-ci`'s "no exceptions" changes a byte-pin and is an Anchor-tier edit requiring the maintainer's explicit decision | `test/rules/discretion-tiers.test.js`, `test/rules/override-contract.test.js`, `test/skills/push-ci.test.js` |
| Constraint | Protected set is `main | master | develop | release/*`, read by `pre-push-gate.sh` `is_protected()`, and the `case` arms in `push-ci` and `epic-merge`; two other detectors (`next-step/scripts/analyze.js` L556, `remind` L210) check only `main`/`master` | Survey § 6 |
| Constraint | The attribution guard is one script (`scripts/commit-msg-guard.sh`) invoked by `smart-commit-execute.sh` in the same process as the commit; `ALLOW_AI_COAUTHOR` is stripped from the environment and re-added only when `--ai-co-author` was passed | `smart-commit-hardening` §3.6 |
| Constraint | Existing overrides are settings-only scaffolds with a live `Precedence:` preamble; `/install-rules` copies them once and never rewrites (except `--customize --reset`) | `rules/auto-loop-project.md`, `rules/testing-project.md`, `install-rules` § Override Template Copy Contract |
| Decision | "Feature branch" = any real branch name (not detached HEAD) not in the (default ∪ project-added) protected set; no prefix is required | Maintainer, 2026-09-24 (§ 9 Q1) |
| Assumption | The maintainer's "解除 /push-ci 的連續調用限制" refers to `disable-model-invocation: true` plus the "Auto-triggering" prohibition; no other repeat-call limit exists | Survey § 2 (no cooldown, counter or once-per-session rule found) |
| Assumption | `git merge` is **not** in the forbidden list today; it stays off (decision 2026-09-24). The new Register #4 entry exists because an opted-in `run` script can push, which the anchor otherwise reserves to enumerated workflows | `rules/git-workflow.md` L9 (forbidden list); maintainer decision 2026-09-24 |
| Assumption | Users read the menu as "this will run a workflow that will ask again", not as the final approval; the workflow's plan/approval screens are what make the second question meaningful | UX assumption; validate in the acceptance walkthrough |

## 8. Acceptance Signals

- Signal 1 (FR-1/FR-2/NFR-3): on `feat/x` with all planes `pass`, the transcript shows exactly one offer menu; choosing "commit and push" runs `/smart-commit --execute` (its plan + approval), then `/push-ci` (its plan + approval), then `/watch-ci`; the user typed nothing.
- Signal 2 (FR-3): `/push-ci` is invoked by the model twice in one session on the same branch, the second after new commits, each with its own Phase 0/1 and approval; `skills/push-ci/SKILL.md` no longer carries `disable-model-invocation: true` or the "Auto-triggering" prohibition, and `test/skills/push-ci.test.js` still passes its "no exceptions" pin.
- Signal 3 (FR-4/NFR-4): on `main` with all planes `pass`, only a commit-only menu is emitted; `/push-ci`, when the user asks for it, still shows the protected-branch pre-approval.
- Signal 3b (FR-16): after any task, a suggested commit/push reaches the user as options; on a phone the user taps, never pastes.
- Signal 4 (FR-5/NFR-2/UC-6): a commit drafted through the menu with `Co-Authored-By: Claude …` in its body is rejected by `smart-commit-execute.sh commit` with exit 4 and nothing is committed; all existing guard tests pass unchanged.
- Signal 5 (FR-6/FR-11/NFR-5): `/install-rules` on a fresh project produces three override files; `/claude-health` S2.5 reports drift/missing for all three; `/project-setup` counts say "3 override templates"; README rule counts match disk; `override-contract.test.js` pins the new § Project Customization section of `git-workflow.md`.
- Signal 6 (FR-7/FR-8/NFR-7): an override that adds `rel/*` → `pre-push-gate.sh`, `/push-ci`, `/epic-merge` (PR-head validation) and `/gh-stack` (layer refusal) all treat `rel/2026.09` as protected; an override that merely omits `main` changes nothing, and one that tries to remove it (a negated entry) → `/claude-health` reports a conflict and all four still treat `main` as protected.
- Signal 7 (FR-9/FR-10): a repo with `scripts/deploy.sh` running `git merge develop` and no override → the model asks once whether to scaffold `git-workflow-project.md`; after the user declares the flow there, `/claude-health` reports it as recognised, the model runs the declared merge only after a per-use approval naming source and target, an undeclared merge is not offered, a merge into a protected branch still meets the protected prompt when the harness pushes it, and under `Run Steps: execute` the script's per-step question names the command and states the run-script risk (tech spec § 3.3 step 3).
- Signal 8 (FR-12): `grep -rn "must invoke \`/smart-commit --execute\` separately" skills/` returns nothing; the replacement sentence states the two-tier rule.
- Signal 9 (FR-13): no menu offers `git stash`; "run git stash now" typed by the user still works as today.

## 9. Open Questions

- [x] **Feature-branch definition** — resolved 2026-09-24: not in the protected set (and not detached) is enough; no prefix required.
- [x] **Anchor wording** — resolved 2026-09-24: removing `disable-model-invocation` from `/push-ci` is approved. The credential (per-use AskUserQuestion) is unchanged and `push-ci.test.js` L612/L617 keep "no exceptions".
- [x] **Offer placement** — answered by the tech spec § 3.3: the model asks when `review-state.js offer` says so; the Stop hook only prints a reminder line; skill closings follow FR-16.
- [x] **Override heading table** — answered by the tech spec § 3.2: settings only, protected set is an additions list.
- [x] **`/smart-commit --execute` invocability** — resolved 2026-09-24: the pain is copy-pasting it; FR-16 makes every suggestion an option. Proactive path: the model does not invoke `/smart-commit --execute` or `/push-ci` unasked — it reaches them through the menu (gated offer or FR-16 suggestion) or the user's explicit request; tech spec § 3.4 carries this as rule text.
- [x] **Deploy flow and `git merge`** — resolved 2026-09-24: the override may authorize running the declared merge step(s), as an Anchor-level new Register #4 exception (FR-10).
- [x] **Pipeline trigger** — resolved 2026-09-24: the project decides (`## Run Steps: print|execute`); the harness states the run-script risk (tech spec § 3.3 step 3). `git merge` stays off the forbidden list.
- [x] **Session-caching caveat** — answered by the tech spec § 3.3/§ 4: the menu text states that each workflow asks again. Neither workflow's approval screen shows a caching caveat today — `/push-ci` documents the weakness in its § Defense in Depth (L2), not in its plan — and none is added in v1: the controls are each workflow's per-use approval, the `/dev/tty` gate where installed, and the attribution guard.

## 10. References

- Tech Spec: [2-tech-spec.md](./2-tech-spec.md) — downstream design
- `rules/discretion.md` § Anchor Register #4, § Efficacy Boundary — the closed exception list and the credential rule
- `rules/git-workflow.md` L8–15 (grant block), L20–21 (protected), L25 (push safety) — byte-pinned by `test/rules/discretion-tiers.test.js`
- `rules/auto-loop.md` § Override Contract; `rules/testing.md` § Project Customization — the override mechanism to replicate
- `docs/features/rule-override-pattern/2-tech-spec.md` §3.3–§3.4 — `override_templates`
- `skills/push-ci/SKILL.md` L4 (`disable-model-invocation: true`), § Authorization, § Prohibited
- `skills/smart-commit/SKILL.md` Step 5c; `skills/smart-commit/scripts/smart-commit-execute.sh`; `scripts/commit-msg-guard.sh` L134, L228–231
- `skills/feature-dev/SKILL.md` L23–26, `skills/bug-fix/SKILL.md` L22–25, `skills/post-dev-recap/SKILL.md` L50/L212 — AS-6 ban, to stay unchanged
- `skills/next-step/scripts/analyze.js` L233 (`ready_to_commit`), L556 (`main`/`master`-only detector)
- `docs/features/push-gate-optin/2-tech-spec.md` §2.3; `docs/features/smart-commit-hardening/2-tech-spec.md` §3.6; `docs/features/auto-loop-autonomy/2-tech-spec.md` L36–44
