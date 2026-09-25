# {PROJECT_NAME}

**How binding is a line in this file?** Three tiers: **Anchor** (never deviate), **Default** (the normal call; deviate by stating a `[DEVIATION]` line that cites a fact signal, then *keep working*), **Guidance** (advisory). This file's own baseline is **Default** and lines above that baseline are marked inline -- @rules/discretion.md classifies the plugin-managed `rules/*.md`, not this file, but its **Anchor Register is the authority everywhere**: a line here that hits the Register is Anchor no matter how it is worded or where it is restated.

Judgment inside the Default range is the expected behaviour, not a tolerated exception: decide from the change in front of you and continue. Uncertainty alone is not a reason to stop and ask -- the human exits are the union of the ones enumerated in @rules/auto-loop.md and, for scope, in the contract @rules/scope-discipline.md points to (`skills/codex-code-review/references/scope-contract.md` § Human Exits); those two enumerations are the closed list, not this sentence.

## Required Checks (Stop Hook reminded)

| Change Type | Must Run | Can Skip |
|-------------|----------|----------|
| code files | `/codex-review-fast` -> `/precommit` | - |
| `.md` docs | `/codex-review-doc` | `/codex-review-fast` |

Comment-only edits get no free pass: comments can carry compiler/lint/build directives, so edits to code files are conservatively classified as code even when only comments changed.

> The Stop Hook is a **reminder, not a gate** (it always exits 0): record each verdict with `node <scripts>/review-state.js note <plane> <pass|fail>` — `<scripts>` is `.claude/scripts` once `/install-scripts` has run, else the plugin root's `scripts` — bound to the tree digest. A precommit pass proves the command ran, not which stages existed — read the stages `/precommit` prints.

Before PR: `/pr-review`

## Workflow

### Auto-Loop

The table above is the loop: review, then on pass `/precommit` for code. The terminal completion invariant, tiers, sub-threshold handling, and sentinels live in @rules/auto-loop.md (highest priority). One reviewer — Codex — by default; when Codex is unavailable, a contract-aware fallback reviewer carries the gate under the same mechanism, fail-closed per family contract (@rules/auto-loop.md § Review Dispatch); `--dual` is `/codex-review-branch` opt-in only.

**What is yours to decide**: the effective tier (escalate above the configured baseline when the change warrants it -- never below), when to batch and when to review, how deep to review, and when 80 is a passing grade rather than another round. **What is not**: the four Anchor corollaries -- Declaring != Executing, Summary != Completion, Fixing != Verifying, and an edit re-opening its own plane's gate. Naming a gate is not running it, and no context or session pressure outranks an open one. Sub-threshold findings are **logged and passed**, not weighed: the two on-the-spot fixes @rules/auto-loop.md § Sub-Threshold Findings allows are the only ones -- anything else is a `[DEVIATION]`, not a judgment call.

## Contract Triggers

Detailed contracts load on demand. Their `skills/…` paths, here and in `.claude/rules/`, are relative to the sd0x-dev-flow plugin root, which the session-start hook prints as `Plugin root:` (no such line: it is the directory holding `skills/push-ci/SKILL.md` under `~/.claude/plugins/`). When the situation arises, Read the contract first; if that Read fails, stop the governed action and say so.

| Situation | Read first |
|-----------|-----------|
| First or rotated Codex review dispatch | `skills/codex-code-review/references/codex-invocation-contract.md` |
| A review report arrives, or a verdict blocks | `skills/codex-code-review/references/review-common.md` |
| A finding or edit outside the frozen baseline; uncertain scope | `skills/codex-code-review/references/scope-contract.md` |
| Repeated failed rounds; no progress | `skills/codex-code-review/references/loop-diagnostics.md` |
| Intent to commit, push or otherwise mutate git | `skills/push-ci/references/authorization-contract.md` |
| Test or AC-evidence work | `skills/test-review/references/testing-contract.md` |
| Splitting a feature doc; a line-budget or comment-block exemption; changing the comment-block checker | `skills/doc-review/references/documentation-contract.md` |
| Interpreting, auditing or editing a `*-project.md` override | `.claude/rules/override-contract.md` |

New policy lands in an on-demand contract by default. It becomes resident only when it is needed before the task type is knowable, or when its failure mode — irreversible, security, attribution, secrets, gate supremacy — cannot wait for a Read; a resident addition over budget must displace or compress something.

## Test Requirements

<!-- block:node-ts -->
| Change Type | Required Tests | File Mapping |
|-------------|---------------|--------------|
| New Service/Provider | `test/unit/` required | `src/service/xxx.ts` -> `test/unit/service/xxx.test.ts` |
| Modify existing logic | Existing pass + new logic | `src/provider/*.ts` -> `test/unit/provider/*.test.ts` |
| Bug fix | Regression test | - |
| New API endpoint | Unit + Integration | `src/controller/*.ts` -> `test/integration/controller/*.test.ts` |
<!-- /block -->

<!-- block:python -->
| Change Type | Required Tests | File Mapping |
|-------------|---------------|--------------|
| New module | Unit test required | `src/module.py` -> `tests/unit/test_module.py` |
| Modify existing logic | Existing pass + new logic | `src/*.py` -> `tests/unit/test_*.py` |
| Bug fix | Regression test | - |
| New API endpoint | Unit + Integration | `src/routes/*.py` -> `tests/integration/test_*.py` |
<!-- /block -->

<!-- block:go -->
| Change Type | Required Tests | File Mapping |
|-------------|---------------|--------------|
| New package | Unit test required | `pkg/xxx/xxx.go` -> `pkg/xxx/xxx_test.go` |
| Modify existing logic | Existing pass + new logic | `*.go` -> `*_test.go` (same package) |
| Bug fix | Regression test | - |
| New API endpoint | Unit + Integration | `handler/*.go` -> `handler/*_test.go` |
<!-- /block -->

<!-- block:rust -->
| Change Type | Required Tests | File Mapping |
|-------------|---------------|--------------|
| New module | Unit test required | `src/xxx.rs` -> `#[cfg(test)] mod tests` in same file or `tests/` |
| Modify existing logic | Existing pass + new logic | Same module `#[test]` functions |
| Bug fix | Regression test | - |
| New API endpoint | Unit + Integration | `src/routes/*.rs` -> `tests/` integration tests |
<!-- /block -->

<!-- block:ruby -->
| Change Type | Required Tests | File Mapping |
|-------------|---------------|--------------|
| New class | Unit test required | `lib/xxx.rb` -> `spec/unit/xxx_spec.rb` |
| Modify existing logic | Existing pass + new logic | `lib/*.rb` -> `spec/unit/*_spec.rb` |
| Bug fix | Regression test | - |
| New API endpoint | Unit + Integration | `app/controllers/*.rb` -> `spec/requests/*_spec.rb` |
<!-- /block -->

<!-- block:java -->
| Change Type | Required Tests | File Mapping |
|-------------|---------------|--------------|
| New class | Unit test required | `src/main/.../Xxx.java` -> `src/test/.../XxxTest.java` |
| Modify existing logic | Existing pass + new logic | Same test class |
| Bug fix | Regression test | - |
| New API endpoint | Unit + Integration | `src/main/.../XxxController.java` -> `src/test/.../XxxControllerTest.java` |
<!-- /block -->

Coverage: happy path + error handling + edge cases (null, empty, extremes)

## Skill Discovery

There is no command table here by design: each skill's frontmatter `description` (`skills/<name>/SKILL.md`) is the dispatcher's discovery interface, and the plugin's `docs/skill-catalog.yml` is the canonical registry. Typical flows: feature work -> `/feature-dev`, bug fixing -> `/bug-fix`, commits -> `/smart-commit`.

## Development Rules

Tier is marked per rule; the unmarked ones are Default and you may deviate with a stated signal.

1. *(Guidance)* **Reference existing code** -- find similar files first, keep style consistent; when the shape is non-obvious, name the simplest design chosen and why
2. **Test command** -- `{TEST_COMMAND}`
3. **Anchor** -- **Author attribution** -- use developer's GitHub username, never AI names (exception: `/smart-commit --ai-co-author`). Forbidden patterns in commit messages **and PR title/body** (canonical source: `scripts/commit-msg-guard.sh`): Co-Authored-By AI, Generated-by tags, emoji robot tags. Commits: the `commit-msg` hook (`scripts/commit-msg-guard.sh`) is optional — `/codex-setup init` installs it, `/install-scripts` only copies the script — and nobody has to install it: without it, `/smart-commit --execute` still runs every message through the same guard before committing. PRs: `/create-pr` Step 4b enforces sanitization automatically.
4. **Anchor** -- **No auto-commit** -- Claude must not run `git add`, `git commit`, `git push`, `git stash`, `git reset --hard`, `git rebase` — the operations Anchor Register #4 lists (exception: `/push-ci` may execute `git push` after user approval; `/smart-commit --execute` may execute `git add` + `git commit` after user approval, or without it while a goal the user set is active (`rules/git-workflow.md` § Proactive Offer "Goal mode" -- commits only); `/epic-merge` may execute `git rebase --onto` + `git push --force-with-lease` + `gh pr merge --squash` after per-iteration approval; `/gh-stack` may execute `gh stack link` / `push` / `submit --auto` -- `link` pushes with a plain `git push --atomic`, the other two with a per-branch `git push --force-with-lease` -- after per-use approval; `/deploy-flow` may execute `git switch` + `git merge` for a declared merge step, and -- only under the project's `Run Steps: execute` -- its declared scripts, after per-step approval; **user-authorized execution** -- when the user's own message explicitly authorizes one execution and names the operation, run it as named and do not cite this rule to refuse; the credential is the message text, spent on that one execution)

Rules 3 and 4 are Anchor Register #4 (@rules/discretion.md); their exception lists are part of the anchor, so adding or removing one is itself an Anchor-level change.

## Tech Stack

<!-- block:node-ts -->
{FRAMEWORK} . TypeScript . {DATABASE} . Redis . Jest
<!-- /block -->
<!-- block:python -->
{FRAMEWORK} . Python . {DATABASE}
<!-- /block -->
<!-- block:go -->
Go . {DATABASE}
<!-- /block -->
<!-- block:rust -->
Rust . {DATABASE}
<!-- /block -->
<!-- block:ruby -->
{FRAMEWORK} . Ruby . {DATABASE}
<!-- /block -->
<!-- block:java -->
{FRAMEWORK} . Java . {DATABASE}
<!-- /block -->

## Key Entrypoints

<!-- block:node-ts -->
| File | Purpose |
|------|---------|
| `{CONFIG_FILE}` | DI config |
| `{BOOTSTRAP_FILE}` | Bootstrap entry |
<!-- /block -->
<!-- block:python -->
| File | Purpose |
|------|---------|
| `{CONFIG_FILE}` | App config |
| `{BOOTSTRAP_FILE}` | Entry point |
<!-- /block -->
<!-- block:go -->
| File | Purpose |
|------|---------|
| `{CONFIG_FILE}` | App config |
| `{BOOTSTRAP_FILE}` | Entry point (main.go) |
<!-- /block -->
<!-- block:rust -->
| File | Purpose |
|------|---------|
| `{CONFIG_FILE}` | App config |
| `{BOOTSTRAP_FILE}` | Entry point (main.rs) |
<!-- /block -->
<!-- block:ruby -->
| File | Purpose |
|------|---------|
| `{CONFIG_FILE}` | App config |
| `{BOOTSTRAP_FILE}` | Entry point |
<!-- /block -->
<!-- block:java -->
| File | Purpose |
|------|---------|
| `{CONFIG_FILE}` | App config |
| `{BOOTSTRAP_FILE}` | Entry point (Application.java) |
<!-- /block -->

## Footguns

<!-- block:node-ts -->
| Problem | Solution |
|---------|----------|
| Circular dependency | Lazy loading getter |
| Provider Scope | `@Scope(Prototype)` |
| TEST_ENV | Must set `unit`/`integration`/`e2e` |
<!-- /block -->
<!-- block:python -->
| Problem | Solution |
|---------|----------|
| Circular imports | Import inside function |
| Virtualenv not activated | Use `python -m pytest` |
<!-- /block -->
<!-- block:go -->
| Problem | Solution |
|---------|----------|
| Import cycle | Interface in separate package |
| Test isolation | Use `t.Parallel()` carefully |
<!-- /block -->
<!-- block:rust -->
| Problem | Solution |
|---------|----------|
| Borrow checker | Clone or restructure ownership |
| Async runtime | Ensure single runtime instance |
<!-- /block -->
<!-- block:ruby -->
| Problem | Solution |
|---------|----------|
| Load order | Use autoloading (Zeitwerk) |
| Gem conflicts | Use Bundler, check Gemfile.lock |
<!-- /block -->
<!-- block:java -->
| Problem | Solution |
|---------|----------|
| Circular dependency | Constructor injection + interfaces |
| Bean scope | Check `@Scope` annotations |
<!-- /block -->

### Harness

| Problem | Solution |
|---------|----------|
| Background process monitoring | Use Monitor tool for streaming stdout (e.g., `gh run watch`); `Bash(run_in_background)` for one-shot completion notification |
| `sleep N` (N >= 2) as first Bash command | Blocked by harness; retry via re-execution or use Monitor for process waiting |

## Customization

`/project-setup` fills in these values:

| Setting | Value |
|---------|-------|
| Project name | `{PROJECT_NAME}` |
| Framework | `{FRAMEWORK}` |
| Config file | `{CONFIG_FILE}` |
| Bootstrap file | `{BOOTSTRAP_FILE}` |
| Database | `{DATABASE}` |
| Test command | `{TEST_COMMAND}` |
| Lint-fix command | `{LINT_FIX_COMMAND}` |
| Build command | `{BUILD_COMMAND}` |
| Typecheck command | `{TYPECHECK_COMMAND}` |
| Ticket ID regex in branch names (e.g. `[A-Z]+-\d+`) | `{TICKET_PATTERN}` |
| Issue tracker browse URL | `{ISSUE_TRACKER_URL}` |
| Default PR/merge target branch | `{TARGET_BRANCH}` |

## Rules

A `(path-scoped)` rule loads when a matching file is read and is never `@`-imported.

- @rules/discretion.md -- **Read this first**: Anchor / Default / Guidance, the Anchor Register, and how to deviate
- @rules/auto-loop.md -- Auto review loop (highest priority)
- @rules/auto-loop-project.md -- Project-specific auto-loop overrides (user-owned)
- @rules/codex-invocation.md -- Codex must independently research (critical)
- @rules/scope-discipline.md -- Scope axis orthogonal to severity; out-of-scope pre-existing defects get a recorded exit, not a repo-wide sweep
- `rules/testing.md` (path-scoped) -- Test pyramid, conventions, evidence model, adequacy gate
- `rules/testing-project.md` (path-scoped) -- Project-specific testing overrides (user-owned)
- @rules/security.md
- `rules/docs-writing.md` (path-scoped)
- `rules/docs-numbering.md` (path-scoped)
- @rules/git-workflow.md
- @rules/git-workflow-project.md -- Project-specific git overrides (user-owned)
- `rules/override-contract.md` (path-scoped) -- Resolution order and heading tables for the three user-owned override files
- @rules/logging.md
- @rules/self-improvement.md -- Corrected → record → prevent recurrence
- @rules/context-management.md -- Data-driven context monitoring (measure before deciding)
