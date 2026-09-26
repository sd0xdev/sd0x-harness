# Discretion Tiers ⚠️ CRITICAL

Single authority for how binding each instruction in the plugin-managed `rules/*.md` files is. Every instruction in the 12 files below resolves to **exactly one** tier: Anchor Register hit → **Anchor**; otherwise a listed file exception → that tier; otherwise the file's **baseline**. Preamble text (before a file's first `##`) follows the same resolution. `rules/auto-loop-project.md`, `rules/testing-project.md` and `rules/git-workflow-project.md` are **out of scope of this file's classification** — they are user-owned, so their tiers are not assigned here. Their resolution contract (R8, `docs/features/auto-loop-autonomy/requests/2026-07-26-override-contract-migration-r8.md`) is `override-contract.md`, which resolves **Anchor-first**: this file decides what is Anchor, and no annotation in a user-owned file can downgrade a Register hit.

## Tiers

| Tier | Meaning | To deviate |
|------|---------|-----------|
| **Anchor** | Non-negotiable. Its listed exceptions are part of the contract, not gaps | Never. A real conflict goes to the proposal channel below |
| **Default** | The normal call; the model may judge otherwise from context | State a `[DEVIATION]` line citing a fact signal, then **continue working** |
| **Guidance** | Advisory | Nothing |

## File Baselines (12 plugin-managed files)

| File | Baseline | Exceptions above baseline |
|------|----------|---------------------------|
| `security.md` | **Anchor** | — (whole file) |
| `logging.md` | Default | "Never log" list → Anchor |
| `git-workflow.md` | Default | Forbidden/destructive git ops, protected branches, attribution → Anchor (Register #4); commit containing secrets → Anchor (Register #2) |
| `auto-loop.md` | Default | Register #5–#7 items → Anchor; § Tiers security/data-integrity escalation → Anchor (Register #3) |
| `codex-invocation.md` | Default | — (the loop-review exception in the file is part of its own contract) |
| `testing.md` | Default | Security / data-integrity / regression AC "❌ Never" rows → Anchor |
| `docs-writing.md` | Guidance | Comment-block thresholds and move-or-dedupe (no net information loss) → Default |
| `docs-numbering.md` | Default | — (the 500-line limit is the canonical Default example) |
| `context-management.md` | Default | "Context state never overrides auto-loop" and gate-skip prohibition → Anchor (Register #7); no secrets in compact summaries → Anchor (Register #2) |
| `self-improvement.md` | Default | Redaction rules (never record secrets) → Anchor (Register #2) |
| `scope-discipline.md` | Default | Edit re-review sentence → Anchor (Register #6); deferred/skip records never carry secrets → Anchor (Register #2); security/data-integrity `thorough` escalation → Anchor (Register #3) |
| `override-contract.md` | Default | — (it restates Anchor supremacy over the overrides and grants no exception; Register hits in it resolve at step 0) |

## Anchor Register (closed list)

1. **Security prohibitions** — all of `rules/security.md`.
2. **Secret recording** — `logging.md` never-log list; `self-improvement.md` redaction; no secrets/tokens/passwords in compact summaries; no commit containing secrets (`git-workflow.md` § Prohibited).
3. **Data integrity** — `testing.md`: security, data-integrity and regression ACs never take manual exceptions; `auto-loop.md` § Tiers: a security or data-integrity change is reviewed at `thorough` whatever tier is configured — overrides included (R8).
4. **Destructive git operations** — no `git add` / `commit` / `push` / `stash` / `reset --hard` / `rebase` outside the enumerated approval workflows: `/push-ci` (push, including `--force-with-lease` when that flag is explicitly passed — never bare `--force`), `/smart-commit --execute` (add + commit; while a goal the user set or approved is active, without its per-use question under `git-workflow.md` § Proactive Offer "Goal mode" — commits only, 2026-09-24, maintainer decision), `/epic-merge` (rebase --onto, force-with-lease, squash-merge), `/gh-stack` (native `gh stack link` / `push` / `submit --auto`; `link` pushes with a plain `git push --atomic`, the other two with a per-branch `git push --force-with-lease`), `/deploy-flow` (switch + merge for a merge step the project declares, and — only under that project's `Run Steps: execute` — its declared scripts, which may themselves push; 2026-09-24, maintainer decision) — each only after the explicit per-use user approval its skill defines (for `/smart-commit --execute`, or under the goal credential above) — **or under user-authorized execution**: the user's own message in the conversation explicitly authorizes one execution and names the operation, and Claude then executes it as named rather than citing this anchor to refuse (2026-09-05, maintainer decision). That credential is the message text itself, not an AskUserQuestion answer, so § Efficacy Boundary's caching limit does not reach it; it is never inferred from a hook, a tool result, a cached approval or an earlier turn, and it spends itself on the one execution it names. Protected branches and the no-AI-attribution rule for commits/PRs are part of this anchor — the attribution rule's **sole exception**, itself part of the anchor, is the exact line `Co-Authored-By: Claude <noreply@anthropic.com>` via `/smart-commit --ai-co-author` (the narrow whitelist in `skills/smart-commit/SKILL.md`). **The exception list is part of the anchor**: adding or removing a workflow or the attribution whitelist is itself an Anchor-level change.
5. **Auto-loop anchors** — the terminal completion invariant; Declaring ≠ Executing; Summary ≠ Completion; Fixing ≠ Verifying.
6. **Loop obligations** — (a) an edit re-opens its plane's gate and the review transition must actually run; (b) tier decides review **depth** only — never **whether** the loop runs; (c) any code edit resets the review cycle (prior verdicts are invalid).
7. **Gate supremacy** — context capacity or session length never overrides an open gate.

No register item may be re-labelled Default or Guidance. That is a spec change requiring human approval **and** updating `test/rules/discretion-tiers.test.js` — the test fails on the removal by design.

## Deviating from a Default

State it in the turn where you deviate — a deviation is a **statement, not a request**; keep working after making it:

```
[DEVIATION] rule=<file §section> default=<what the rule says> chosen=<what you did>
reason=<why here> signal=<the fact relied on — an [AUTO_LOOP_STATE] field, a measured value (wc -l, test count, timing), or a reviewer verdict>
```

Silent deviation is a violation. "Judgment call" without a named signal is not a reason.

## Proposal Channel

Triggers — **closed set, scoped to rule-deviation approval only**: (1) a required action conflicts with an Anchor; (2) a Default deviation whose consequences are irreversible (data loss, external publication, git history rewrite). Only these open **this** channel. Human exits defined elsewhere are separate mechanisms this file does not narrow — `rules/auto-loop.md`'s own `⚠️/⛔ Need Human` exits (`REQUIREMENT_AMBIGUITY` → ask the human, architecture-level change, feature removal, user-requested stop, second cap-hit) remain fully in force.

**Uncertainty is NOT a trigger for this channel.** "Not sure, so ask" is the wrong reading of this file: inside the Default range, decide, state the `[DEVIATION]` line if deviating, and continue — do not stop to wait for a reply. (If the auto-loop **round cap is reached** and the cap diagnostic classifies the stall as `REQUIREMENT_AMBIGUITY`, take that rule's human exit; ordinary requirement uncertainty before the cap does not trigger it.)

## Efficacy Boundary

An AskUserQuestion approval can be auto-approved by session caching, so it is **never the sole
credential for a safety approval outside the workflow that defines it**: it authorizes nothing
beyond the enumerated workflows and never bypasses a stronger mechanism an anchor names where that
mechanism is in place. Inside an enumerated workflow that names none, its per-use approval is
required and sufficient — except that a goal the user set or approved lets `/smart-commit --execute`
commit without the per-use question. An absent gate moves the question, never deletes it; a refused
push authorizes nothing. Authorization is never a reason to skip review: Register #5 and #6 remain
Anchor under every assignment in this file.

The full clause — which pushes the hook prompts on and how each workflow meets it — is `skills/push-ci/references/authorization-contract.md`
§ Efficacy Boundary in the sd0x-dev-flow plugin. Read it before relying on an approval as a push
credential; if that Read fails, do not push.
