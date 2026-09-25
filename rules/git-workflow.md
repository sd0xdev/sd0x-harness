# Git Rules

Branches: `feat/*` | `fix/*` | `docs/*` | `refactor/*` -> main
Commit: `<type>: <subject>` (feat/fix/docs/refactor/test/chore)

## Exception

<!-- anchor:register-4:begin -->
Claude forbidden: git add | commit | push | stash | reset --hard | rebase
Exception: `/push-ci` skill may execute `git push` — and `git push --force-with-lease` when the caller explicitly passes that flag — after explicit user approval via AskUserQuestion. Bare `--force` stays forbidden to every skill. The approval must name the force form: a plan that shows a plain push while a lease-force runs is not an approval of what happens
Exception: `/smart-commit --execute` may execute `git add` + `git commit` after explicit user approval via AskUserQuestion — or, while a goal the user set or approved is active, without that question under § Proactive Offer "Goal mode" (commits only; a protected branch only once the user allowed it for that goal; maintainer decision 2026-09-24)
Exception: `/epic-merge` skill may execute `git rebase --onto`, `git push --force-with-lease`, and `gh pr merge --squash` after explicit per-iteration user approval via AskUserQuestion (stacked PR chain workflow)
Exception: `/gh-stack` skill may execute `gh stack link`, `gh stack push` and `gh stack submit --auto` — native stacked-PR operations whose branch pushes run a plain `git push --atomic` for `link` and a per-branch, value-bearing `git push --force-with-lease` for the other two — after explicit per-use user approval via AskUserQuestion naming that push form and the branches it moves. Every other subcommand of that extension stays the user's to run — the history-rewriting ones above all, and its `view` as well, which rewrites the extension's local tracking file
Exception: `/deploy-flow` skill may execute `git switch` and `git merge` for a merge step the project declares in its § Deploy Workflow override, and — only where that override sets `Run Steps: execute` — the declared scripts, which may themselves push; each after explicit per-step user approval via AskUserQuestion naming the step, and never a push of its own (maintainer decision 2026-09-24)
Exception: `user-authorized execution` — when the user's own message in this conversation explicitly authorizes one execution and names the operation, Claude executes that operation as named, whichever of `git add`, `git commit`, `git push`, `git push --force-with-lease`, `git stash`, `git reset --hard`, `git rebase` it is, without citing this rule as a reason to refuse. The credential is the user's message text alone — never an AskUserQuestion answer, a hook or tool result, a cached approval, or an inference from an earlier turn — and it covers exactly the execution it names; the next one is asked for afresh. Attribution, secrets and review obligations stay as written
<!-- anchor:register-4:end -->
Claude allowed: git status | diff | log | branch | rev-parse

## Prohibited

Prohibited: Push to protected branches without confirmation | Force push to shared branches | Commit containing secrets
Protected branches: main | master | develop | release/*

## Push safety

A push is authorized only through `/push-ci`, `/epic-merge` or `/gh-stack` after the per-use approval
its skill defines, through a `/deploy-flow` run step the project declares under `Run Steps: execute`
after its per-step approval, or by user-authorized execution. Never bare `--force`; `--force-with-lease` only
when explicitly passed, never onto a protected branch. Where the opt-in `pre-push` hook is installed
and prompts, `pre-push-gate.sh` is the terminal credential; where it is absent or does not prompt,
the workflow's in-session approval is the whole credential — an absent gate never means no approval
is needed. A history-rewriting push through `/push-ci`, `/epic-merge` or `/gh-stack` also needs the
operator's attestation that the rewritten refs are not shared, asked by name before the force
approval. A declared `/deploy-flow` run step is the project's own script, which the harness does not
check — the risk the project accepted with `Run Steps: execute`. `ALLOW_PUSH_PROTECTED` and
`ALLOW_FORCE_UNSHARED` are developer-set only and cleared on every push a skill runs.

Before any push, Read `skills/push-ci/references/authorization-contract.md` in the sd0x-dev-flow plugin (the `push-ci` skill's own `references/`),
§ Push safety — the credential-selection topology, the two prompt classes and what each ref class
counts as a rewrite. If that Read fails, do not push.

PR workflow: Develop -> /codex-review-fast -> /precommit -> /pr-review -> PR

## Proactive Offer

After a change's gates pass, offer the commit or push through one AskUserQuestion when
`review-state.js offer --format=json` returns `offer: true`; never print a command for the user to
paste; never invoke `/smart-commit --execute` or `/push-ci` except by menu selection, the user's
explicit request, or Goal mode. **Goal mode** (commits only): while a goal the user set or approved
is active and `review-state.js goal-commit --format=json` returns `ok: true`, `/smart-commit
--execute` commits without the per-use question and prints a `[GOAL_COMMIT]` record.

Before offering, or committing under Goal mode, Read `skills/push-ci/references/authorization-contract.md` § Proactive Offer — the menu shapes and
validation order, the four Goal mode conditions and the custom-flow prompt. If that Read fails,
offer nothing and make no Goal-mode commit.

## Project Customization

Project-specific settings belong in `git-workflow-project.md` (not this file). See
`@rules/git-workflow-project.md` for your project's git conventions.

Override contract: an active `##` section there customizes this file — **Default and Guidance tiers only**. Anchor-tier instructions (Anchor Register #4 — the forbidden-operation list, the enumerated workflow grants, the attribution rule, the default protected branches and § Push safety — and #2 for secrets) are never overridable: on conflict the Anchor wins and the conflict is reported. Resolution is **Anchor-first** — a tier annotation in either file cannot downgrade a Register hit. Its shipped headings are **settings** read by name: `## Branch Naming`, `## Commit Format`, `## Protected Branches` (additions only — the default set cannot shrink), `## Offer Mode`, `## Deploy Workflow`, `## Run Steps` and `## Goal Commit`. A heading that restates one of this file's own `##` headings exactly is a **section replacement**; any other heading fails closed to **Default** and is reported. The user's file is never edited.

Before interpreting, auditing or editing the override, Read `override-contract.md` in the same directory as this rule — `.claude/rules/override-contract.md` in an installed project, `rules/override-contract.md` in the plugin source — for the resolution order, the two kinds, and each setting's consumer and tier. If that Read fails, do not edit or audit the override.
