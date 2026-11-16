---
name: jira
description: "Jira integration — view issues, generate branches, create tickets, transition status. Use when: user mentions Jira ticket key (XX-123), says /jira, wants to create branch from ticket, create a new ticket, or update Jira status. Not for: GitHub issues (use issue-analyze)."
allowed-tools: mcp__claude_ai_Atlassian_MCP__getAccessibleAtlassianResources, mcp__claude_ai_Atlassian_MCP__atlassianUserInfo, mcp__claude_ai_Atlassian_MCP__getJiraIssue, mcp__claude_ai_Atlassian_MCP__createJiraIssue, mcp__claude_ai_Atlassian_MCP__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian_MCP__transitionJiraIssue, Bash(node:*), mcp__claude_ai_Atlassian__getAccessibleAtlassianResources, mcp__claude_ai_Atlassian__getJiraIssue, mcp__claude_ai_Atlassian__getTransitionsForJiraIssue, mcp__claude_ai_Atlassian__transitionJiraIssue, mcp__claude_ai_Atlassian__addCommentToJiraIssue, mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql, mcp__claude_ai_Atlassian__createJiraIssue, mcp__claude_ai_Atlassian__getJiraProjectIssueTypesMetadata, Bash(git:*), AskUserQuestion
---

# Jira Skill

View Jira issues, generate branch names from tickets, transition issue status — all via Atlassian MCP.

## Tool routing — by capability, never by server name

The Atlassian MCP server has shipped under more than one name, and `allowed-tools` above lists the
known spellings only as pre-approvals. Which tool to call is decided from the **runtime tool list**:
pass its names to `node <scripts>/jira-entry.js capability` (stdin, JSON array) and call the tool it
reports for each operation — `resources` (`getAccessibleAtlassianResources`), `identity`
(`atlassianUserInfo`), `getIssue`, `createIssue`, `issueTypes`, and `search`
(`searchJiraIssuesUsingJql`, the readback after an unclear create). The routing covers these
operations — what the task-start entry and `create` need; `transition` still names its tools directly
and needs a re-check if the server's spelling changes. A missing operation is a missing capability — report it; never guess a name.

## Task-start entry

When a task starts, the Jira question, the create+branch plan, the readback after an unclear create
and the branch from the base are `@skills/smart-commit/references/task-contract.md` § Jira entry and
§ Task branch. A selection made there ("Create the Task and its branch") is the approval of that
exact plan: run `create` and the branch without asking again here.

## Trigger

- Keywords: jira, ticket, issue key (`[A-Z][A-Z0-9]+-\d+`), branch from ticket, transition status, start work, pr opened, pr merged
- User says `/jira`

## When NOT to Use

- GitHub Issues → use `/issue-analyze`
- Searching Jira issues → v1.1 (deferred)
- Generic project management

## Input Parsing

Extract `issueKey` and optional `host` from user input:

| Input Format | Example | Extraction |
|-------------|---------|------------|
| Bare key | `OK-51513` | key=`OK-51513` |
| Full URL | `https://foo.atlassian.net/browse/OK-51513` | key=`OK-51513`, host=`foo.atlassian.net` |
| Software URL | `https://foo.atlassian.net/jira/software/.../OK-51513` | key=`OK-51513`, host=`foo.atlassian.net` |
| Branch context | (auto from `git branch --show-current`) | key via `{TICKET_PATTERN}` regex |

**Regex**:
- Issue key: `([A-Z][A-Z0-9]+-\d+)`
- Host: `https?://([^/]+\.atlassian\.net)`

## CloudId Resolution

```
1. Call getAccessibleAtlassianResources()
2. 0 results → error: "Atlassian MCP not configured or unauthorized"
3. 1 result  → use its cloudId automatically
4. N results →
     Host provided and matches?    → use matching cloudId
     Host provided but no match?   → warn: "Host '<host>' not found. Available: ..." → AskUserQuestion to select or abort
     No host?                      → AskUserQuestion to choose instance
```

Do NOT persist cloudId. Resolve at runtime each time; Claude context naturally caches within a session.

## Subcommand: `view`

| Step | Action |
|------|--------|
| 1 | Parse input → issueKey (+ host if URL) |
| 2 | Resolve cloudId |
| 3 | `getJiraIssue(cloudId, issueKey)` |
| 4 | Format output |

**Output format**:

```markdown
## KEY: Summary

| Field | Value |
|-------|-------|
| Status | ... |
| Assignee | ... |
| Priority | ... |
| Type | ... |
| Created | ... |

### Description
(first 500 chars, truncated if longer)
```

## Subcommand: `branch`

| Step | Action |
|------|--------|
| 1 | Parse input → issueKey |
| 2 | Resolve cloudId |
| 3 | `getJiraIssue` → get summary + issuetype |
| 4 | Map issue type → branch prefix (see `references/branch-policy.md`) |
| 5 | Apply `--type` override if provided |
| 6 | Generate slug from summary |
| 7 | Assemble branch name: `${prefix}/${issueKey}-${slug}` |
| 8 | Check collision (local + remote) |
| 9 | Plan mode: output branch name + command. Execute mode: `node <scripts>/review-state.js task branch <branch>` — from the freshly fetched `origin/<base>` (`main` unless `## Base Branch` names another), `--no-track`, refusing a dirty tree; never from the current HEAD |

See `references/branch-policy.md` for full mapping table, slug algorithm, and collision detection.

**Plan output** (default):

```
Branch: feat/OK-51513-add-user-profile-page
From: OK-51513 "Add user profile page" (Story)

To create: node <scripts>/review-state.js task branch feat/OK-51513-add-user-profile-page   # from origin/main, --no-track
```

**Execute mode** (`--execute`): run `review-state.js task branch <branch>` (an active task is required; `task start` first). A dirty tree, an existing branch or a failed fetch is reported, never worked around.

## Subcommand: `transition`

| Step | Action |
|------|--------|
| 1 | Parse input → issueKey + `--event` value |
| 2 | Resolve cloudId |
| 3 | `getJiraIssue` → current status |
| 4 | `getTransitionsForJiraIssue` → available transitions |
| 5 | Match event → target transition (see `references/transition-mapping.md`) |
| 6 | Plan mode: show plan. Execute mode: AskUserQuestion → `transitionJiraIssue` |

See `references/transition-mapping.md` for event vocabulary, regex patterns, and resolution algorithm.

**Plan output** (default):

```markdown
## Transition Plan

- Issue: OK-51513 "Add user profile page"
- Current: To Do
- Event: start_work
- Target: In Progress (transition id: 21)

Execute? /jira transition OK-51513 --event start_work --execute
```

## Subcommand: `create`

| Step | Action |
|------|--------|
| 1 | Extract project key from input (bare key like `OK`, or from issue key prefix) |
| 2 | Resolve cloudId |
| 3 | `getJiraProjectIssueTypesMetadata(cloudId, projectKey)` → list available types |
| 4 | Validate issue type against available types (case-insensitive match) |
| 5 | Format description as markdown (see `references/create-policy.md`) |
| 6 | Plan mode: display creation plan. Execute mode: AskUserQuestion → `createJiraIssue` — unless the task-start entry already showed this exact plan and the user selected it (task contract § Jira entry): then create without asking again |
| 7 | A timeout or unclear answer is `unknown`, not a failure. A create from the task-start entry carries a readback token: read back with `jira-entry.js jql` and the search tool. A standalone create carries none: search the project for the summary created since the call. Either way, never create a second time on an `unknown` |

**Input sources** (both supported):
- `--summary` and `--description` flags: explicit values
- Context inference: extract summary and description from user's prompt (structured content like Background, Items, etc.)

**MCP call** (`createJiraIssue`):

| Parameter | Source |
|-----------|--------|
| `cloudId` | Resolved via step 2 |
| `projectKey` | From input |
| `issueTypeName` | Validated against available types |
| `summary` | From `--summary` or context |
| `description` | Formatted markdown from `--description` or context |
| `contentFormat` | Always `"markdown"` |

**Plan output** (default):

```markdown
## Create Issue Plan

- Project: OK
- Type: Task
- Summary: P1 Hardening — Quote state machine + Recovery Worker
- Description: (preview first 200 chars...)

Execute? /jira create OK --summary "..." --type Task --execute
```

**Execute output**:

```
✅ Created: OK-51514
https://yourorg.atlassian.net/browse/OK-51514
```

See `references/create-policy.md` for description format guidelines, project key extraction, and issue type validation.

## Graceful Degradation

| Failure | Message |
|---------|---------|
| MCP tools not available | "Atlassian MCP not connected. Enable Atlassian integration in claude.ai settings." |
| OAuth expired | "Atlassian authorization expired. Please re-authorize." |
| Issue not found | "Issue `<KEY>` not found. Verify the key and your access permissions." |
| Transition not available | "Cannot execute `<event>` from current status `<status>`. Available transitions: ..." |
| Network error | "Atlassian API unreachable. Please retry later." |
| Create timed out | "Create outcome unknown — reading back before anything else." Never a blind retry |
| Project not found | "Project '<KEY>' not accessible. Check key and permissions." |
| Issue type not available | "Type '<type>' not in project '<KEY>'. Available: [list from metadata]" |

## Examples

```
/jira view OK-51513
→ Displays issue details (summary, status, assignee, priority, type, description)

/jira branch OK-51513
→ Plan: feat/OK-51513-add-user-profile-page

/jira branch OK-51513 --type fix --execute
→ Executes: git checkout -b fix/OK-51513-add-user-profile-page

/jira transition OK-51513 --event start_work
→ Plan: To Do → In Progress

/jira transition OK-51513 --event pr_merged --execute --comment "Merged via PR #42"
→ Executes transition + adds comment

/jira create OK --summary "Fix login timeout" --type Bug
→ Plan: Create Bug in OK

/jira create OK --summary "Add user dashboard" --type Story --description "## Background\nDashboard needed for..." --execute
→ ✅ Created: OK-51515
```
