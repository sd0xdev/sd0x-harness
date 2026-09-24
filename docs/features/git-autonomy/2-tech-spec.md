# git-autonomy Technical Spec

> **Doc class**: Lifecycle — Phase 2 technical spec (current authority for this feature's design).
> **Created**: 2026-09-24
> **Requirements**: [1-requirements.md](./1-requirements.md) · **Intent**: [intent-git-autonomy.md](./intent-git-autonomy.md)

## 1. Requirement Summary

- **Problem**: every mutating git step waits for a typed command or a typed authorization sentence,
  on `main` and on `feat/x` alike. The caution is right for protected branches and out of proportion
  on an attested-unshared feature branch.
- **Goals** (FR-1…FR-17; FR-15's one-word trigger is a `Could`, deferred with no work item in v1): a menu offer of commit/push on feature branches once gates pass; `/push-ci`
  model-invocable and repeatable; a third user-owned override `rules/git-workflow-project.md`; a
  declared deploy workflow the model may run under per-step approval; attribution checks
  unchanged; **no suggested command left for the user to copy** (FR-16).
- **Maintainer decisions (2026-09-24)**: feature branch = real branch not in the protected set (no
  prefix rule); `/push-ci` loses `disable-model-invocation`; `/deploy-flow` is a **new Anchor
  Register #4 exception**; `run` steps are the project's choice, with the risk stated; `git merge`
  stays **off** the forbidden list; the pain to remove is the copy-paste of a suggested
  `/smart-commit --execute` on a phone (FR-16); while a goal the user set is active, the model
  commits without a per-use question — on a protected branch only once the user allowed it (FR-17, § 3.5).
- **Scope**: rules, skills, one script, one hook line, tests. No change to `commit-msg-guard.sh`,
  `smart-commit-execute.sh`, `/create-pr` sanitization, or the `ALLOW_*` contract.

## 2. Existing Code Analysis

| Area | Today | Consequence for this feature |
|------|-------|------------------------------|
| Grant block `rules/git-workflow.md` § Exception | Byte-pinned (`discretion-tiers.test.js` `CANONICAL_AUTHORIZATION_BLOCK`, `AUTHORIZED_GRANTS`, `validateDestructiveContract`) | The `/deploy-flow` grant is an Anchor edit: constants and `AUTHORIZED_GRANTS` change together. The forbidden list itself is unchanged |
| Register #4 `rules/discretion.md` | Pinned whole (`override-contract.test.js` `CANONICAL_ANCHOR_REGISTER`) | Same edit, mirrored |
| § Efficacy Boundary | Pinned whole; its generic clause covers "an enumerated workflow that names no stronger mechanism" | Not edited for `/deploy-flow` — it names no stronger mechanism and falls under the generic clause as written. **Edited in R7** for the goal-mode commit credential (§ 3.5) |
| `skills/push-ci/SKILL.md` L4 | `disable-model-invocation: true`; § Prohibited "Auto-triggering this skill"; `test/skills/push-ci.test.js` `SKILL_DIGEST` pins the **whole file** | Removed / reworded; the pinned "no exceptions" line stays; R3 reviews the full skill diff and re-records `SKILL_DIGEST` |
| Protected set | Hard-coded four times: `pre-push-gate.sh` `is_protected()` (L322), `push-ci` and `epic-merge` `case` arms, `gh-stack` Phase 2 refusal | Needs one resolver that also reads the project additions |
| Override files | Two, list hard-coded in ~15 places (requirements § 3) | Third file registered in all of them |
| `scripts/review-state.js` | `note` / `check`; owns repo-key, digest, state dir | Gains `offer` / `offer-shown` — reuses digest and state dir |
| `hooks/stop-guard.sh` | Prints owed-gate lines, exit 0 | Gains one reminder line when an offer is owed |
| `git merge` | **Not** on the forbidden list; `/merge-prep` only *prints* merge commands (Step 4, "for manual execution") | Stays off it (decision 2026-09-24). `/deploy-flow`'s Register #4 entry exists for its `run` steps, which can push |

## 3. Technical Solution

### 3.1 Flow

```mermaid
sequenceDiagram
    participant M as Model
    participant RS as review-state.js offer
    participant PB as protected-branches.sh
    participant U as User
    participant SC as /smart-commit --execute
    participant PC as /push-ci
    M->>RS: all gates noted pass?
    RS->>PB: is <branch> protected?
    PB-->>RS: exit 0 protected / 1 not / 2 unreadable (→ protected)
    RS-->>M: {offer:true|false, reason, kind}
    alt offer:true
        M->>U: AskUserQuestion — commit / commit and push / not now
        U-->>M: selection (router, never the credential)
        opt a workflow was picked
            M->>RS: offer again — same digest, branch, kind; option still offered?
            alt yes
                M->>RS: offer-shown <digest>
                M->>SC: invoke if a commit option was picked → its own plan + approval
                opt commit and push, or push
                    M->>PC: invoke → its own plan + approval
                end
            else no
                M->>RS: offer-shown <digest> — selection void, nothing invoked
            end
        end
        opt not now
            M->>RS: offer-shown <digest>
        end
    end
```

### 3.2 `rules/git-workflow-project.md` (user-owned, settings only)

Same header shape as the two existing overrides: a live `Precedence:` paragraph before the first
`##`, then `<!-- Based on: git-workflow.md @ <blob> (<date>) -->` and `<!-- Generated by: /install-rules -->`.

| Heading | Kind | Value | Tier / resolution |
|---------|------|-------|-------------------|
| `## Branch Naming` | Setting — replaces `git-workflow.md` L3 | free text | Default |
| `## Commit Format` | Setting — replaces L4 | free text | Default |
| `## Protected Branches` | Setting — an **additions list**, unioned with the default set | bullets `- <name>` or `- <prefix>/*` | Default. Omitting a default name is normal and changes nothing; there is no removal syntax, and a line that tries one (`- !main`, `- -main`) is a parse error → the resolver exits 2 → every branch reads protected, and `/claude-health` reports the conflict (step 0) |
| `## Offer Mode` | Setting — read by § Proactive Offer | `on` (default) · `commit-only` · `off` | Default |
| `## Deploy Workflow` | Setting — read by `/deploy-flow` | fenced `text` block, one step per line (below) | Default; the steps are only ever run by `/deploy-flow` under its Register #4 entry |
| `## Run Steps` | Setting — read by `/deploy-flow` | `print` (default) · `execute` | Default. The scaffold's comment states the risk verbatim (§ 3.3 `/deploy-flow` step 3); choosing `execute` is the project's decision |
| `## Goal Commit` | Setting — read by § 3.5 | `on` (default) · `off` | Default. `off` only narrows: every commit goes back to the menu |

No heading restates a parent `##` heading, so the file carries **settings only** — no section
replacement is offered (a same-named heading would replace the parent section wholesale under the
existing contract). The requirements' "allowed read-only ops" goal needs no setting: the parent's
`Claude allowed:` line is illustrative, the forbidden list is what binds, and no read-only command
is forbidden — deferred with that reason rather than built.

Deploy-workflow step grammar (one per line, anything else is a parse error and the whole block is ignored with a reported conflict):

```text
merge <source> -> <target> [--no-ff|--ff-only]
run <repo-relative-path> [args…]
```

Tokens are separated by single spaces and there is **no quoting or escaping**: every token of a
`run` line must match `^[A-Za-z0-9._/@:=+,-]+$`, so the displayed command and the executed argv are
the same list by construction. A path or argument that needs a space or a shell character belongs
in a wrapper script the line names instead.

`merge` is executable by `/deploy-flow`; `run` is executed only under `## Run Steps: execute`, else printed for the user. A path
must resolve inside the repository. `<source>` and `<target>` are each a **concrete branch** or a
**`<prefix>/*` pattern** (e.g. `release/*`) — the only pattern form. A concrete name must pass
`git check-ref-format --branch`; a pattern must pass it for `<prefix>/x`. A pattern binds to a
concrete branch at run time only: `/deploy-flow` lists the existing local branches that match and
the user picks one (AskUserQuestion options, never typed); that concrete name — re-checked with
`check-ref-format --branch` and against the pattern — is what the step's approval names and what
the merge uses. No match → the step is refused, never created.

### 3.3 Interfaces

**`scripts/protected-branches.sh <branch>`** (new, installed by `/install-scripts`)
- Set = `main master develop release/*` ∪ `## Protected Branches` of the **first existing** of
  `.claude/rules/git-workflow-project.md`, `rules/git-workflow-project.md` (selected by existence
  and precedence — a dangling symlink counts as existing). If the selected file cannot be read or
  parsed the answer is exit 2, **with no fallback** to the lower-precedence path: falling back could
  drop the higher file's additions and read a protected branch as unprotected.
- Exit 0 protected · 1 not protected · 2 the override exists but could not be read or parsed.
  **Every caller treats 2 as protected** (fail-closed; widening-only means an unread override can
  only ever make the answer too strict, never too loose).
- `--list` prints the resolved set; used by `/claude-health` and tests.
- `pre-push-gate.sh` **inlines** the same function (it runs as a single copied hook file and
  re-execs under `bash -p`); a parity test runs both over one fixture corpus.

**`review-state.js offer [--format=json]`** → `{offer, kind, reason, branch, digest}`
- `kind`: `commit` (uncommitted changes), `commit+push`, `push` (clean tree, commits ahead of
  upstream), or `none`.
- `offer:true` only when: a real branch (detached → `none`); the push kinds require
  `protected-branches.sh` to exit 1 — on a protected branch (exit 0 or 2) `commit+push` becomes a
  commit-only menu and `push` becomes `none`, because a local commit publishes nothing; every plane whose change class
  appears in what the offer would publish — uncommitted changes ∪ commits ahead of the upstream
  (or of the default branch's merge-base when there is none) — is **passed** at the current digest
  (`noted ∧ digest_match ∧ verdict pass`, not merely "not owed": a clean plane is never owed, so
  owed-ness cannot vouch for a clean-tree push); the project's
  `## Offer Mode` is not `off` (`commit-only` turns `commit+push` into a commit-only menu and
  `push` into `none`); the menu has **not already been shown** at this digest.
- `reason` for `false`: `detached` · `protected` (push-only work on a protected branch) ·
  `protected-unknown` (exit 2, same) · `gates-open` · `already-offered` · `disabled` ·
  `nothing-to-do`. A commit-only menu on a protected branch carries `push_dropped: protected`.

**On selection**, the model re-runs `offer` and proceeds only if it returns `offer:true` with the
**same digest, branch and `kind`** it showed the menu for, and the picked option is still in the
recomputed option set. An edit, a branch switch, or a narrowed `kind` (e.g. a switch to a protected
branch turning `commit+push` into commit-only) voids the selection and invokes nothing.

**`review-state.js offer-shown <digest>`** — called whenever the menu is shown, **whatever is selected** —
`not now`, an option whose workflow approval the user then rejects, or one that completes. Records
`{digest}` in `offer.json` beside the plane slots. The offer re-arms only at a **different digest
with a new gate pass** (FR-14, INV-007). Committing the reviewed tree does not change the digest,
so the push of the same content is not re-offered either; `/push-ci` stays one command away.

**The offer menu** (AskUserQuestion, one question):

| `kind` | Options |
|--------|---------|
| `commit+push` | "Commit (`/smart-commit --execute`)" · "Commit and push (`/smart-commit --execute` → `/push-ci`)" · "Not now" |
| `commit` — including `commit+push` converted on a protected branch or by `commit-only` | "Commit (`/smart-commit --execute`)" · "Not now" — **no push option** |
| `push` | "Push (`/push-ci`)" · "Not now" |

The question text states that each workflow will show its own plan and ask again. Picking an option
**invokes** the workflow; the workflow's AskUserQuestion is the credential (INV-001). The menu is
never offered for `stash`, `reset --hard` or `rebase` (FR-13).

**Suggested next command → option, never text (FR-16).** Wherever the model or a skill would end a
turn by suggesting `/smart-commit --execute`, `/push-ci` or `/deploy-flow` — including outside the
gated offer above, e.g. when the user asks "what now?" or a skill's closing step names one — it asks
with AskUserQuestion and invokes the chosen skill through the Skill tool. A slash command printed
for the user to copy is the defect this feature removes. The gated offer decides *when* to ask
unprompted; this rule decides *how* any suggestion is presented. **Eligibility still applies**: a
skill's closing suggestion is unsolicited, so a `/push-ci` option appears in it only where
`review-state.js offer` would allow a push kind — never on a protected branch. Only an **explicit
user request** to push ("push it") puts `/push-ci` on a protected branch into a menu, where its
protected pre-approval then applies.

**`/deploy-flow`** (new skill, `disable-model-invocation` **not** set, `AskUserQuestion` in
`allowed-tools`)
1. Parse `## Deploy Workflow`; refuse on parse error or dirty tree.
2. For each `merge` step: resolve `SRC_OID`/`TGT_OID` (`git rev-parse --verify refs/heads/<name>`)
   and ask one AskUserQuestion naming source, target, form and both full OIDs. On approval,
   re-resolve both and **abort if either moved**; `git switch <target>`, assert `HEAD == TGT_OID`,
   (every branch name reaches git as its own argv entry after `--` where git accepts one — never
   interpolated into a shell string; a test uses a valid name containing `$(…)`)
   then `git merge <form> -m "Merge branch '<source>' into <target>" <SRC_OID>` — the approved
   object, never the name (default `--no-ff`). The message is that **fixed template**, never
   model-authored, run through `commit-msg-guard.sh` before the merge (a rejection refuses the
   step). The merge runs with `--no-edit` and `GIT_MERGE_AUTOEDIT=no`, so no editor can change it.
   A `commit-msg` hook still can, so the check that **establishes** INV-002 comes after, under the
   same environment fence as `smart-commit-execute.sh` (every git call behind its `env -u GIT_*`
   list, `ALLOW_AI_COAUTHOR` unset for the guard): read back the created commit's message and
   parents with `git --no-replace-objects log -1 --format=%P%n%B <new HEAD>` (`GIT_GRAFT_FILE=/dev/null`),
   assert the parents are exactly `TGT_OID SRC_OID`, and run the same guard on the recorded text.
   **`--ff-only` takes a separate path**: it creates no commit, so there is no message to check;
   verify instead that the new `HEAD` equals `SRC_OID` and `TGT_OID` is its ancestor. A rejection stops the flow and names the
   OID; nothing is amended (amending is the developer's call). On conflict: `git merge --abort`, report, stop.
3. `run` steps: under `## Run Steps: print` (default), print the command for the user. Under
   `execute`, one AskUserQuestion per step naming the exact command and stating the **run-script
   risk** — the one canonical statement of it; every other passage in these three documents points
   here: *the script runs with your credentials and can commit, push, merge, publish or deploy. It
   bypasses the harness's own checks — `/smart-commit`'s guaranteed attribution check and `/push-ci`'s
   approval and protected pre-approval. Git hooks still run for its ordinary `git commit` and
   `git push` where they are installed (`commit-msg-guard.sh`, `pre-push-gate.sh`), but the script
   can skip hooks (e.g. `--no-verify`) or run where none is installed, and the harness cannot tell
   which*. The script is invoked with its arguments as separate argv entries (no shell string).
4. The harness issues no push and offers none itself — an opted-in `run` script may push on its own,
   outside `/push-ci` — the run-script risk (step 3). What follows is decided by `review-state.js offer`
   like any other change: the menu appears only when it returns true (unprotected target, required
   gates passed at the new digest). A protected target gets no push menu (INV-003); `/push-ci`
   offered on request still meets its protected pre-approval and the hook.

### 3.4 Rule and skill edits

| File | Edit | Tier |
|------|------|------|
| `rules/git-workflow.md` § Exception (pinned block) | New `Exception: /deploy-flow skill may run the steps the project's git-workflow-project.md declares — git switch + git merge, and, only where that file sets Run Steps: execute, the declared scripts, which may themselves push — each after explicit per-step user approval via AskUserQuestion naming the step`. `Claude forbidden:` and the `user-authorized execution` line are unchanged | **Anchor** — maintainer-approved 2026-09-24 |
| `rules/discretion.md` Register #4 | Same workflow added to the enumerated list and to the "exception list is part of the anchor" sentence | **Anchor** |
| `rules/git-workflow.md` new `## Proactive Offer` | FR-1/FR-4/FR-14/FR-16 as rule text: when `review-state.js offer` says true, ask the menu once; any suggested git workflow is an option, never copy-text; the model never invokes `/smart-commit --execute` or `/push-ci` unasked — only through a menu selection or the user's explicit request, the one exception being `/smart-commit --execute` under a counting goal (§ 3.5, added in R7); the selection routes, the workflow approves | Default |
| `rules/git-workflow.md` new `## Project Customization` | Override contract for § 3.2, Anchor-first steps 0–4 copied from `auto-loop.md` § Override Contract | Default (pinned as a section, like the other two) |
| `rules/git-workflow-project.md` | New scaffold, all headings present and empty | user-owned |
| `CLAUDE.md`, `CLAUDE.template.md` rule 4 | Exception list gains `/deploy-flow`; "No auto-commit" becomes "No unapproved commit" with the feature-branch offer named | Anchor restatement |
| `skills/push-ci/SKILL.md` | Drop `disable-model-invocation`; § Prohibited "Auto-triggering this skill" → "Pushing without this invocation's own AskUserQuestion approval"; § Authorization block gains a `/deploy-flow` line and its table (workflows as columns) a `/deploy-flow` column, with the "All Other Skills" column note narrowed to exclude it: it never runs `git push` itself, and a declared `run` script under `Run Steps: execute` may push outside this skill — the project's opted-in, stated risk. "Push REQUIRES explicit user approval via AskUserQuestion — no exceptions" stays; whole-file `SKILL_DIGEST` re-recorded after review of the full diff | Default |
| `feature-dev`, `bug-fix`, `debug`, `test-deep` | "user must invoke `/smart-commit --execute` separately" → "offer the menu per `rules/git-workflow.md` § Proactive Offer: a commit option on any real branch, a push option only where `review-state.js offer` allows one; never print the command for the user to copy" | Default |
| `post-dev-recap` | **No change.** Its AS-6 mutation ban and its test stay; it has no closing commit/push suggestion to convert | — |
| `hooks/stop-guard.sh` | One reminder line when `offer` is true (reminder-only, exit 0) | — |
| Override registration (FR-11) | `discretion.md` L3 · `rule-override-pattern` §3.3 (the two-file descriptions) and §3.4 `override_templates` · `install-rules` copy contract · the installed-script sets (`/install-scripts`, `/project-setup`, `claude-health`'s managed inventory) gain `protected-branches.sh` — without it an installed override makes every branch read as unknown (R1's skill fallback) · `claude-health` S2.5 #1/#3 (+ conflict check for `## Protected Branches` removal attempts or parse errors — never for omissions — and `## Deploy Workflow` parse errors) · `project-setup` counts · `CLAUDE*.md` `## Rules` · README rule counts | Default |
| `pre-push-gate.sh`, `push-ci`, `epic-merge`, `gh-stack` | Protected test reads the resolver (hook: inlined copy). Skill fences call it with `--root`, and fall back to the default set only when it is not installed **and** no override exists (an override without the resolver reads as unknown → protected); `gh-stack`'s layer check is an executable fence | Default — but security-bearing; reviewed at `thorough` |

### 3.5 Goal-mode commit (FR-17)

**What the model observes.** Claude Code 2.1.281 sets a goal by registering a session-scoped Stop
prompt hook and appending a `goal_status` attachment; the model reads it as
`A session-scoped Stop hook is now active with condition: "<condition>"`. Nothing reaches a hook or
script: hook input carries `permission_mode` but no goal field, so the credential is read at the
behaviour layer only, like the per-use approval it stands in for.

**When it counts** — all four, checked at each commit, not once per goal:

1. The goal is **user-originated**: the user's own `/goal <condition>` message, or a `ProposeGoal`
   the user approved (the model receives the kickoff after approval). A proposal that set itself
   without a dialog (`askUser: false`, origin `proposal_direct`) never counts, and neither does a
   goal mentioned in a tool result, a hook's output or a file.
2. The goal is **affirmatively active**: the set notice for it is in the current conversation, and
   nothing after it reports the goal ended — met, impossible, cleared by `/goal clear`, cleared by an
   error, or superseded by another goal. `/clear` or a compaction that drops the set notice removes
   the evidence, and missing evidence reads as *no goal* (fail-closed). A new user goal re-arms it.
3. The branch is a **feature branch** (`protected-branches.sh` exit 1), **or** a protected branch
   (exit 0 or 2) the user allowed for this goal. The first goal-mode commit on a protected branch
   asks one AskUserQuestion recommending a feature branch (`git switch -c <suggested name>`, then
   commit there); if the user declines, a second question asks whether commits on this branch may
   proceed for this goal. Yes → this and later commits of the same goal on that branch run unasked;
   no → the ordinary menu. The allowance is held in conversation and ends with the goal. A detached
   HEAD always falls back to the menu.
4. `review-state.js check` reads `pass` for every plane the change classes require at the current
   digest, and the project has not set `## Goal Commit: off` (§ 3.2).

**What changes in `/smart-commit --execute`.** Only the one plan approval (Step 5, "show the full
commit plan … and get approval once"): under a counting goal the plan is printed with a `[GOAL_COMMIT] goal=<sha256 of the condition, first 12 hex> | branch=<b> | digest=<d> | <ISO8601>`
record and execution proceeds. The goal text itself is never printed, since a user may have put a
secret in it. Every validation still runs, and every *judgement* prompt still asks —
identity conflict, unresolved grouping, a sensitive-file exclusion to confirm. `--ai-co-author` is
never passed on this path, so the attribution whitelist cannot be reached without the user. Every
other approval or confirmation directive in the skill names the same exception, or the skill
contradicts itself — found by searching the skill for "approval", "confirm" and "ask", not by a
fixed list. Today that is the frontmatter `description`, the workflow diagram, Step 1a's
execute-mode paragraph and mode table, Step 4's grouping confirmation, § Prohibited "No silent
execution", and the `--execute` row of § Examples.

**Anchor edits (R7, maintainer decision 2026-09-24).** Register #4 and the `git-workflow.md` grant
block gain the credential with its four conditions; § Efficacy Boundary gains one clause saying the
per-use AskUserQuestion inside `/smart-commit --execute` is replaced — not bypassed — by an active
user-set goal (on a protected branch, one the user allowed for that goal); CLAUDE.md rule 4 names it. Each pin is re-recorded in the same
reviewed change.

## 4. Risks and Dependencies

| Risk | Mitigation |
|------|-----------|
| Session caching auto-approves the menu | The menu is not a credential; each workflow asks again (INV-001, NFR-1). Stated in the menu text |
| Resolver drift between hook and script | Parity test over one fixture corpus; the hook copy carries a `# keep in step with scripts/protected-branches.sh` marker the test checks |
| Unreadable override silently narrows protection | Impossible by construction: exit 2 ⇒ protected; defaults are never removed |
| The run-script risk (§ 3.3 step 3) | Default `print`; `execute` is a per-project opt-in whose scaffold comment and per-step question state the risk; argv invocation, no shell string; the step names the exact command before it runs |
| A declared merge targets a protected branch | Allowed locally under per-step approval (it is the user's release flow); a push the harness issues goes through `/push-ci`'s protected pre-approval and the hook — unchanged. A push inside an opted-in `run` script is the run-script risk (§ 3.3 step 3) |
| Offer nags | One per digest; `not now` silences until a new gate pass at a new digest; `## Offer Mode: off` |
| Goal credential forged or stale | Behaviour-layer only, so the four § 3.5 conditions are rule text re-read at every commit; a model-set goal never counts; the `[GOAL_COMMIT]` record makes each unasked commit auditable; push stays behind `/push-ci`'s own approval, so a wrong local commit costs a `reset` |
| Anchor pins churn | Register #4 and grant-block pins change in R5 (`/deploy-flow`) and R7 (goal-mode commit, which also edits § Efficacy Boundary) only, each citing the maintainer's decision; R3 separately re-records `push-ci`'s whole-file `SKILL_DIGEST` |

Dependencies: `jq`/`node` already required by the hooks; `git check-ref-format`.

## 5. Work Breakdown

| # | Request | FRs | Tier |
|---|---------|-----|------|
| R1 | `protected-branches.sh` + inlined hook copy + parity test; `push-ci`, `epic-merge`, `gh-stack` read it | FR-7 (protected), NFR-7 | thorough (security) |
| R2 | `git-workflow-project.md` scaffold, § Project Customization, registration in every carrier, `claude-health` conflict checks | FR-6, FR-8, FR-11, NFR-5, NFR-6 | standard |
| R3 | `/push-ci` model-invocable | FR-3 | standard |
| R4 | `review-state.js offer`/`offer-shown`, § Proactive Offer, `stop-guard` line, skill rewording to option-not-text | FR-1, FR-2, FR-4, FR-12, FR-14, FR-16 | standard |
| R5 | Register #4 + grant block + `CLAUDE*.md` rule 4 + `/deploy-flow` skill, registered in `docs/skill-catalog.yml` with the generated READMEs re-verified | FR-10, FR-13 | thorough (Anchor) |
| R6 | Detect a custom flow and ask once to scaffold the override | FR-9 | standard |
| R7 | Goal-mode commit: § 3.5 rule text, `/smart-commit` Step 5 branch, `## Goal Commit` setting, Register #4 / grant block / § Efficacy Boundary / rule 4 and their pins | FR-17, NFR-1 | thorough (Anchor) |

Order: R1 → R2 (R2's protected heading needs R1) → R3 ∥ R4 → R5 → R6; R7 after R2 and R5 (it shares their setting and their pins).

## 6. Testing Strategy

| Layer | What |
|-------|------|
| Unit | `protected-branches.sh`: defaults, exact and `prefix/*` additions, an additions list omitting a default (defaults still protected, no conflict), a removal attempt (`- !main` → exit 2), unreadable/unparseable file (exit 2), path resolution order. Parity with the hook's inlined function over the same corpus |
| Unit | `review-state.js offer`: a selection after an edit (digest changed) or a switch to a protected branch at the same digest (kind narrowed) is void and invokes nothing; every `reason` value; on `main` no push kind is ever returned (a skill-closing suggestion cannot add one); `commit-only`; a shown menu (any selection, incl. a rejected workflow approval) silences it at that digest; an edit keeps it silenced until the new digest has a new gate pass |
| Integration | Real temp repos: `/deploy-flow` step parser; merge happy path, conflict → `--abort`, refusal on dirty tree, undeclared step never offered, source or target moved after approval → abort with nothing merged, `release/*` pattern binds only to a user-picked existing branch; `--ff-only` verifies HEAD == SRC_OID with TGT_OID as ancestor and checks no message; the merge read-back ignores a replace ref and an inherited `ALLOW_AI_COAUTHOR`; `Run Steps`: default `print` executes nothing, `execute` runs a step only after its approval and never after a refusal, an invalid mode value is a parse error, arguments arrive as separate argv entries |
| Contract | `discretion-tiers` and `override-contract` pins updated with the new grant; `validateDestructiveContract` accepts the new `Exception:` line; `push-ci.test.js` "no exceptions" still green and `SKILL_DIGEST` re-recorded after the full-diff review; a new test asserts `push-ci` frontmatter has no `disable-model-invocation` |
| Guard (both directions) | Menu path reaches `smart-commit-execute.sh commit` (AI trailer → exit 4); `/deploy-flow`'s pre-merge `commit-msg-guard.sh` check passes the fixed template and refuses the step when the guard rejects (mutation proof on that call); a `commit-msg` hook that appends an AI trailer during the merge is caught by the post-merge read-back and stops the flow naming the OID; override omitting `main` → `main` still protected in all four workflows |
| Goal-mode commit | Contract tests on the rule text for each § 3.5 condition in both directions (user goal on a feature branch → no question; a protected branch the user allowed for the goal → no question after the first-commit pair; a protected branch not yet allowed or declined, model-set goal, `/goal clear`, open gate, `Goal Commit: off` → the ordinary approval); the goal path still reaches `smart-commit-execute.sh commit` (AI trailer → exit 4) and never passes `--ai-co-author` |
| Carriers | Override count/list agrees with `rules/*-project.md` on disk in every carrier (NFR-5) |

## 7. Open Questions

- [x] **Q1 `run` steps** — resolved 2026-09-24: the project decides (`## Run Steps: print|execute`),
  and the harness states the risk in the scaffold and in every per-step question.
- [x] **Q2 `merge` on the forbidden list** — resolved 2026-09-24: not added. `/deploy-flow` is
  still enumerated in Register #4 because its `run` steps can push.
- [x] **Q3 proactive path** — resolved 2026-09-24: the problem is copy-pasting a suggested
  `/smart-commit --execute`, worst on a phone. FR-16: any suggested git workflow is an
  AskUserQuestion option that invokes the skill; commit menus are allowed on protected branches
  too (a local commit publishes nothing), push kinds are not.
- [x] **Q4 goal-mode commit on protected branches** — resolved 2026-09-24: allowed after the
  first-commit questions in § 3.5 condition 3 (feature branch recommended first).
