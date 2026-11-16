# Branch Policy — Jira Issue to Branch Name

## Issue Type to Branch Prefix

| Jira Issue Type | Branch Prefix | Notes |
|----------------|---------------|-------|
| Bug | `fix` | |
| Story | `feat` | |
| Task | `feat` | |
| Sub-task | `feat` | |
| Documentation | `docs` | |
| (other) | `feat` | Fallback |

> **Note**: Prefix values do NOT include trailing `/`. The format string `${prefix}/${issueKey}-${slug}` adds the separator.

## `--type` Override

Only these values are accepted (aligned with `rules/git-workflow.md`):

| Value | Valid |
|-------|-------|
| `feat` | Yes |
| `fix` | Yes |
| `docs` | Yes |
| `refactor` | Yes |
| (anything else) | Error: "Invalid type '<value>'. Allowed: feat, fix, docs, refactor" |

When `--type` is provided, it overrides the issue-type-based prefix.

## Slug Generation

```
1. slug = summary.toLowerCase()
2.          .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanumeric
3.          .trim()
4.          .replace(/\s+/g, '-')            // spaces to hyphens
5.          .slice(0, 40)                    // max 40 chars
```

## Branch Name Format

```
${prefix}/${issueKey}-${slug}
```

Example: `feat/OK-51513-add-user-profile-page`

## Collision Detection

```bash
# Check local
git branch --list "${branch}"

# Check remote (skip if no remote configured)
git remote get-url origin >/dev/null 2>&1 && git ls-remote --heads origin "${branch}"
```

> **Fallback**: If `origin` is not configured (`git remote get-url` fails), skip remote check entirely. If `origin` is configured but `git ls-remote` fails (network error), warn and continue with local-only collision detection.

If branch exists locally or remotely, append `-2`, `-3`, etc.:

```
feat/OK-51513-add-user-profile-page      # first attempt
feat/OK-51513-add-user-profile-page-2    # if collision
feat/OK-51513-add-user-profile-page-3    # if still collision
```

## Plan vs Execute

| Mode | Behavior |
|------|----------|
| Plan (default) | Output branch name + the `review-state.js task branch <branch>` command |
| Execute (`--execute`) | Run `review-state.js task branch <branch>`: from the freshly fetched `origin/<base>` (`main` unless `## Base Branch` names another), `--no-track`; a dirty tree, an existing branch or a failed fetch refuses (`skills/smart-commit/references/task-contract.md` § Task branch) |
