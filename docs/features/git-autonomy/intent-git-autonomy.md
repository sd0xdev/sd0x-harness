# Intent — git-autonomy

> **Doc class**: Intent (ancillary — Design record). Written by the planner, checked by the
> implementer. Work that contradicts an Invariant or Non-goal stops and asks — amending this
> file is a re-decision, not a sync.

## North star

On a feature branch, once a change has passed its gates, the model offers commit and push from a
menu and the user picks — no typed or copy-pasted commands, which on a phone is the whole pain — while every
credential that authorizes a mutating git operation stays what it is today, plus one: a goal the user
set lets the model commit on a feature branch (`INV-008`). Projects that
release their own way get a user-owned `rules/git-workflow-project.md` to say so.

## Non-goals

- Adding any Register #4 workflow other than `/deploy-flow`, or any credential other than the
  goal-mode commit one (`INV-008`) — maintainer decisions 2026-09-24.
- Any loosening on protected branches for pushes the **harness** issues (`main`, `master`,
  `develop`, `release/*`, plus project additions): pre-approval, `/dev/tty` gate, force-form abort.
  The one boundary the project may cross is its own opted-in `run` script — allowed only under
  `Run Steps: execute`, per step, with the run-script risk (tech spec § 3.3 step 3) stated.
- Weakening the attribution guard, the one-line `--ai-co-author` whitelist, or PR sanitization.
- Letting an override *remove* a default protected branch, or grant anything other than running
  its declared deploy steps — scripts only where it opts in (maintainer decision 2026-09-24).
- Running a declared step without its own per-use approval, or any step the override does not declare.
- Offering `stash`, `reset --hard`, a rebase outside `/epic-merge`, or any other operation from a menu.

## Invariants

- `INV-001`: A menu selection routes to `/smart-commit --execute`, `/push-ci` or `/deploy-flow`; the
  workflow's own plan and AskUserQuestion remain the per-use approval (sole exception: `INV-008`).
- `INV-002`: Every commit the **harness** creates on a menu path is guarded: `/smart-commit` via
  `smart-commit-execute.sh commit`; `/deploy-flow` merges carry a fixed template message checked
  by the same `commit-msg-guard.sh` first. A commit made inside an opted-in `run` script falls under
  the run-script risk (tech spec § 3.3 step 3). `ALLOW_AI_COAUTHOR` never comes from the environment.
- `INV-003`: No unsolicited push offer on a protected branch; no offer on a detached HEAD. A
  suggested git workflow is always an option to pick, never text to copy.
- `INV-004`: `git-workflow-project.md` resolves Anchor-first under the same four steps as the two
  existing override files; an Anchor-hitting heading is reported as a conflict and ignored. The
  one grant it can carry — the declared deploy steps — exists only as a Register #4 entry, and
  each run needs a per-use approval naming the step.
- `INV-005`: A project-declared protected set can only widen the default set, and every mutating
  workflow (`pre-push-gate.sh`, `/push-ci`, `/epic-merge`, `/gh-stack`) reads the widened set.
- `INV-006`: Removing `disable-model-invocation` from `/push-ci` changes who may invoke it, not
  what authorizes the push — "Push REQUIRES explicit user approval via AskUserQuestion — no
  exceptions" stays pinned.
- `INV-007`: One offer per passing digest; `not now` silences it until a new gate pass.
- `INV-008`: While a goal the **user** set or approved is active, `/smart-commit --execute` on a
  feature branch may run unasked once the gates pass, through the same guarded commit path. Commit
  only — push, `/deploy-flow`, protected branches and model-set goals keep today's approvals.

## Acceptance sketch

On `feat/x` with all planes `pass`: one offer menu → "commit and push" → `/smart-commit --execute`
shows its plan and asks → commits pass the guard → `/push-ci` shows its plan and asks → push →
`/watch-ci`. The user typed nothing. Repeat after new commits: a second `/push-ci`, fresh approval.
Same session on `main`: a commit-only menu; `/push-ci` still asks the protected pre-approval. A
commit body carrying `Co-Authored-By: Claude …` is rejected with exit 4 on the menu path. Under a
user-typed `/goal` on `feat/x` the commit runs unasked through the same guard; push still asks.
