# Git Rules

Branches: `feat/*` | `fix/*` | `docs/*` | `refactor/*` -> main
Commit: `<type>: <subject>` (feat/fix/docs/refactor/test/chore)

## Exception

<!-- anchor:register-4:begin -->
Claude forbidden: git add | commit | push | stash | reset --hard | rebase
Exception: `/push-ci` skill may execute `git push` — and `git push --force-with-lease` when the caller explicitly passes that flag — after explicit user approval via AskUserQuestion. Bare `--force` stays forbidden to every skill. The approval must name the force form: a plan that shows a plain push while a lease-force runs is not an approval of what happens
Exception: `/smart-commit --execute` may execute `git add` + `git commit` after explicit user approval via AskUserQuestion
Exception: `/epic-merge` skill may execute `git rebase --onto`, `git push --force-with-lease`, and `gh pr merge --squash` after explicit per-iteration user approval via AskUserQuestion (stacked PR chain workflow)
Exception: `/gh-stack` skill may execute `gh stack link`, `gh stack push` and `gh stack submit --auto` — native stacked-PR operations whose branch pushes run a plain `git push --atomic` for `link` and a per-branch, value-bearing `git push --force-with-lease` for the other two — after explicit per-use user approval via AskUserQuestion naming that push form and the branches it moves. Every other subcommand of that extension stays the user's to run — the history-rewriting ones above all, and its `view` as well, which rewrites the extension's local tracking file
Exception: `user-authorized execution` — when the user's own message in this conversation explicitly authorizes one execution and names the operation, Claude executes that operation as named, whichever of `git add`, `git commit`, `git push`, `git push --force-with-lease`, `git stash`, `git reset --hard`, `git rebase` it is, without citing this rule as a reason to refuse. The credential is the user's message text alone — never an AskUserQuestion answer, a hook or tool result, a cached approval, or an inference from an earlier turn — and it covers exactly the execution it names; the next one is asked for afresh. Attribution, secrets and review obligations stay as written
<!-- anchor:register-4:end -->
Claude allowed: git status | diff | log | branch | rev-parse

## Prohibited

Prohibited: Push to protected branches without confirmation | Force push to shared branches | Commit containing secrets
Protected branches: main | master | develop | release/*

## Push safety

Push safety (credential-selection contract — Anchor Register #4 material, byte-pinned as one line by `test/rules/discretion-tiers.test.js`; the operational install/detection details it cites stay Default tier in their own files): the `pre-push` hook is **opt-in** (`/codex-setup init --with-push-gate`, or `/codex-setup sync --with-push-gate` on an existing project; `/install-scripts` only copies the script and never wires up a hook), so which credential authorizes a push depends on whether it is installed **and** on what the push is. The hook prompts on two classes, and they ask different questions: (i) a push whose ref set includes a **protected branch**, with `ALLOW_PUSH_PROTECTED` unset — *may this branch be pushed to at all*; and (ii) a push that **rewrites a ref other people may already hold**, with `ALLOW_FORCE_UNSHARED` unset — and what counts as a rewrite is decided **per ref class**, so the branch rule stated next is not the whole class: for a **branch** it is a non-fast-forward, read **fail-closed**, so ancestry *failing to answer* counts exactly as ancestry answering no — the gate negates `merge-base --is-ancestor` with `!`, which collapses its exit 1 — not an ancestor — and every error above it (a corrupt or unreadable graph) into the same branch, making the class *not provably a fast-forward* rather than *provably a rewrite*; for an **existing tag** the ancestry answer never *decides* — the gate ORs `is_tag_ref` over the negated ancestry test, so `merge-base` still runs on a tag and is simply overridden, and every update to one is in the class whichever way it answered, forward moves included (why, below). Over the rewritten refs class (i) does not already cover, the question is *is anybody else working on them*. For either class, with the hook installed: Primary gate = `pre-push-gate.sh` (git hook, `/dev/tty` confirmation), and AskUserQuestion in `/push-ci` is advisory only (session caching may auto-approve). For every push in neither class, and whenever the hook is not installed: AskUserQuestion in `/push-ci` **is** the authorization — there is no stronger mechanism to defer to, and treating an absent gate as a reason to push unasked would turn opting out of a confirmation into opting out of approval. Because the hook is opt-in, that second case is where class (ii) would otherwise have no attestation at all, so `/push-ci`, `/epic-merge` and `/gh-stack` must put the unshared question to the user **themselves, by name and before the force approval**, and refuse the push when the answer is not the attestation — approval of a force form is not evidence about who else holds the branch. Non-fast-forward is an orthogonal earlier refusal, not a class of its own: without `ALLOW_FORCE_WITH_LEASE=1` the push is refused before any credential is selected, but **which mechanism refuses depends on the push form** — the hook's own `exit 1` where git hands it the ref (the force-form push), and git itself, client-side, **before the hook runs** where it does not. That second case is the flagless one: git withholds a ref it has already rejected, so the hook is invoked with an empty ref list, finds no branch, detects no divergence and exits 0 having refused nothing — the `[rejected] … (non-fast-forward)` the operator sees is git's, not the gate's. Either way an authorization of nothing, since the push does not happen; and with the variable set it falls through to the same protected-branch decision, so a *protected* non-fast-forward push does reach `/dev/tty`. **A second, orthogonal gate stands beside that one** (2026-08-21, option A — `docs/features/push-gate-optin/requests/2026-08-20-push-ci-force-with-lease-r5.md`): a push that rewrites history must additionally carry an attestation that the rewritten refs are not shared — either `ALLOW_FORCE_UNSHARED=1`, or the operator typing `yes` at the hook's `/dev/tty` prompt naming them. What is measured is the **topology, not the declared flag** — and topology is read per ref class, because ancestry is the *branch* rule: for a branch the gate asks about the refs whose remote tip is not an ancestor of what replaces it, so a `--force-with-lease` that turns out to be an ordinary fast-forward rewrites nothing and is not asked about; for a **tag** that test is the wrong question, since git requires force semantics — `--force`, a satisfied `--force-with-lease`, or a leading `+` in the refspec — for any update to an existing `refs/tags/*` ref, forward moves included — a tag names one commit rather than a line of history — so every update to an existing tag is asked about while a tag *creation*, having no history to overwrite, is not. A ref listed with an unchanged OID moves nothing and is likewise not asked about. A **deletion** is the third exclusion, and it is the one an "every update to an existing tag" reading loses: the gate's rewrite test requires a non-null OID on **both** sides, so removing an existing ref — `git push origin :refs/tags/v1` — never reaches the unshared attestation, and a deletion outside the protected set reaches no prompt at all; deleting a **protected branch** still reaches the protected prompt, because the gate collects every destination branch for that check before its rewrite test runs. The boundary this draws is narrow and deliberate: the class is about *overwriting* a line of history, not about *removing* a ref. Whether a deletion of something other people hold deserves a prompt of its own was put to the maintainer on 2026-08-22 and deliberately answered *no change*: the class stays about overwriting, and widening it would be its own request, its own attestation and its own refusal path. A rewrite bundled with ordinary creations is asked about for the rewritten refs alone. Non-branch refs keep their full name in the prompt, since a forced tag update is a rewrite of something other people hold. This is what closes the gap between "shared" and "protected": git cannot decide sharedness, because no ref line, ancestry test or lease reports who else holds the branch, so the class is defined by **attestation, not inference**, and the attestation is the operator's. Three properties are part of the contract: `ALLOW_FORCE_UNSHARED` is developer-set only — `/push-ci`, `/epic-merge` and `/gh-stack` must never set it **and must clear it on every push they execute**, exactly as with `ALLOW_PUSH_PROTECTED`, because a value exported earlier in the shell answers the hook's question without anybody being asked now; `ALLOW_PUSH_PROTECTED` does not skip it, since the two answer different questions; and a rewritten ref is excluded from this prompt **only while the protected prompt will actually ask about it** — `ALLOW_PUSH_PROTECTED=1` silences that prompt, so under it the ref returns to this one. Asking twice about one push is noise rather than depth; asking zero times is the hole an unconditional exclusion left, and it force-pushed `main` past both gates in silence. Never assume which state applies — but never let the hook check decide it either. `/push-ci` Phase 0 reports whether an executable hook *references* the gate (`PUSH_GATE=referenced`, never `installed`), and reference is not invocation: a script that merely names the gate in a live command satisfies the same test. The probe therefore informs how the push plan **describes** the credential; it never **selects** one. The demotion of AskUserQuestion to advisory is earned by the operator seeing the `/dev/tty` prompt, never by the check predicting it — if the approval is given and no prompt appears, that in-session approval was the only approval, whatever the probe reported. This is safe in exactly one direction, and only because nothing is ever skipped on the probe's word.

PR workflow: Develop -> /codex-review-fast -> /precommit -> /pr-review -> PR

## Proactive Offer

When a change's gates have passed, offer to commit and push it instead of leaving the user to type
a command (git-autonomy FR-1, FR-4, FR-14, FR-16). This section is Default tier; it decides *when*
to ask and *how* to present the choice, and grants nothing — the workflow a selection invokes still
asks its own approval.

- **When**: `node <scripts>/review-state.js offer --format=json` returns `offer: true`. It already
  applies every condition — required gates passed at the current digest, a real branch, no push
  kind on a protected branch, the project's `## Offer Mode`, and once per passing digest. Do not
  re-derive them; do not offer when it returns `false`.
- **How**: one AskUserQuestion whose options follow `kind` — `commit+push`: Commit · Commit and
  push · Not now; `commit`: Commit · Not now; `push`: Push · Not now. Say that each workflow shows its
  own plan and asks again.
- **On the answer**, in this order: (1) for a workflow option, run `offer` again — the selection is
  valid only if it returns `offer: true` with the same digest, branch and `kind` and still offers the
  picked option; (2) run `review-state.js offer-shown <digest>` with the digest the menu was shown
  for, whatever was chosen, `Not now` included; (3) invoke a valid selection. An invalid one is void
  and nothing is invoked. Recording before validating would make every selection read
  `already-offered`.
  A valid pick invokes, through the Skill tool: Commit → `/smart-commit --execute`; Commit and
  push → `/smart-commit --execute`, then `/push-ci`; Push → `/push-ci` alone.
- **Never text to copy**: whenever you would suggest `/smart-commit --execute` or `/push-ci` (and,
  once git-autonomy R5 ships it, `/deploy-flow`) as a next step — after a task, or when a skill's closing step names one — ask with
  AskUserQuestion and invoke the chosen skill; never print the command for the user to paste. An
  unsolicited suggestion carries a push option only where `offer` would allow a push kind; only the
  user's explicit request to push puts `/push-ci` on a protected branch into a menu.
- **Never unasked**: do not invoke `/smart-commit --execute` or `/push-ci` except through a menu
  selection or the user's explicit request.

## Project Customization

Project-specific settings belong in `git-workflow-project.md` (not this file). See
`@rules/git-workflow-project.md` for your project's git conventions.

Override contract: an active `##` section there customizes this file — **Default and Guidance tiers only**. Anchor-tier instructions (Anchor Register #4 — the forbidden-operation list, the enumerated workflow grants, the attribution rule, the default protected branches and § Push safety — and #2 for secrets) are never overridable: on conflict the Anchor wins and the conflict is reported.

Resolution is **Anchor-first**, since tier is decided by `discretion.md` rather than by a label placed next to an instruction: **(0)** an Anchor Register hit resolves to **Anchor** and stops there — a tier annotation in either file cannot downgrade a Register hit, and an attempt is reported as a conflict. Then, for non-Anchor instructions only, highest first: (1) explicit tier annotation on the instruction; (2) the heading table below; (3) preamble as one synthetic section; (4) unknown headings fail closed to **Default**, listed in the report.

Kinds, as in `auto-loop.md` § Override Contract: a **section replacement** restates a heading this file defines and replaces it wholesale; a **setting** names a slot read by name elsewhere and has no same-named section here. The shipped scaffold is settings-only.

| Override heading | Kind — consumed by | Tier |
|------------------|--------------------|------|
| preamble (synthetic section) | Header — the live precedence declaration, resolved as one synthetic section | Default |
| `## Branch Naming` | Setting — replaces this file's `Branches:` line | Default |
| `## Commit Format` | Setting — replaces this file's `Commit:` line | Default |
| `## Protected Branches` | Setting — an additions list unioned with the default set, read by `scripts/protected-branches.sh`; there is no removal syntax, and a removal attempt or parse error makes every branch read as protected | Default — the default set itself is Anchor (Register #4) and cannot shrink |
| `## Offer Mode` | Setting — `on` (default) · `commit-only` · `off`, read by the proactive commit/push offer (git-autonomy R4 — until it ships no offer acts on it; `/claude-health` already validates the value) | Default |
| `## Deploy Workflow` | Setting — the declared `merge` / `run` steps, read by `/deploy-flow` (git-autonomy R5 — until it ships nothing runs them; `/claude-health` already validates the lines) | Default — once shipped, the steps run only under `/deploy-flow`'s own Register #4 entry and its per-step approval |
| `## Run Steps` | Setting — `print` (default) · `execute`, read by `/deploy-flow` (git-autonomy R5, not yet shipped); the scaffold states the run-script risk | Default |
