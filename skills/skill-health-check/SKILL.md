---
name: skill-health-check
description: "Validate skill quality against routing, progressive loading, and verification criteria. Use when: auditing skills, checking skill health, reviewing skill design. Not for: code review (use codex-code-review) or doc review (use doc-review). Output: health report with per-skill ratings + Gate."
allowed-tools: Read, Grep, Glob, Bash(node:*)
context: fork
---

# Skill Health Check

## Trigger

- Keywords: skill health, skill audit, skill lint, check skills, skill quality, validate skills, skill discovery, skill not found, 找不到 skill

## When NOT to Use

- Code review (use `/codex-review-fast`)
- Document review (use `/codex-review-doc`)
- Creating new skills (use `skill-creator` plugin, external)
- .claude directory structure check (use `/claude-health`)

## Core Principle

Skills are **on-demand context packages**. Their value comes from routing precision (right skill triggers at right time) and context efficiency (minimum tokens for maximum capability). A poorly routed skill wastes context on every mismatch; a well-routed skill transforms a generalist into a specialist at exactly the right moment.

## Workflow

```
Run automated lint → Review manual dimensions → Produce integrated report → Gate
```

### Step 1: Automated Lint

```bash
node skills/skill-health-check/scripts/skill-lint.js --fix-hint
```

**Script I/O contract:**

| Parameter | Description |
|-----------|-------------|
| `--skills-dir <path>` | Skills directory (default: `./skills`) |
| `--agents-dir <path>` | Agents directory (default: `./agents`) |
| `--json` | Output JSON instead of markdown |
| `--fix-hint` | Include fix suggestions |
| Exit 0 | All pass |
| Exit 1 | Warnings only (P2) |
| Exit 2 | Errors found (P0/P1) |

**Per-skill checks (11 items):**

| # | Check | Severity | Criteria |
|---|-------|----------|----------|
| 1 | Frontmatter exists | P0 | `name` + `description` required |
| 2 | Routing signature | P1 | Description has at least 2 of 3 routing cues (Use/Avoid/Output); 0 cues = P1, 1 cue = P2 |
| 3 | When NOT section | P1 | Body has "When NOT to Use" heading |
| 4 | Output section | P2 | Body defines expected deliverable |
| 5 | Verification section | P2 | Body has verification checklist |
| 6 | References routing | P2 | Each reference file mentioned in body |
| 7 | Scripts contract | P2 | Each script filename referenced in SKILL.md body |
| 8 | Line count | P2 | Warning >150, flag >250 |
| 9 | Agent entitlement | P2 | Body describes `Agent()` dispatch but `allowed-tools` lacks Agent |
| 10 | Task entitlement | P2 | Body describes `Task()` dispatch but `allowed-tools` lacks Task |
| 11 | Cross-skill ref path | P1 | Bare ref paths not found locally but existing in another skill → must use `@skills/<parent>/` prefix |

**Cross-skill checks (3 items):**

| # | Check | Severity | Criteria |
|---|-------|----------|----------|
| 12 | Description overlap | P2 | Jaccard similarity >60% flagged |
| 13 | Agent ref validity | P1 | `subagent_type` references in skills must exist in `agents/` |
| 14 | Agent tools syntax | P2 | Agent `.md` tools field uses canonical format (ToolName or `Bash(<prefix>:*)`) |

### Step 2: Manual Review (when comprehensive audit requested)

Read flagged skills and evaluate:

| Dimension | Question | Rating |
|-----------|----------|--------|
| **Why > What** | Does skill explain underlying principles, not just steps? | ⭐1-5 |
| **Scope fitness** | Is the skill focused? Could it be split? | ⭐1-5 |
| **Progressive loading** | Is heavy content in references/, not inline? | ⭐1-5 |
| **Routing precision** | Would a user's request unambiguously trigger this skill? | ⭐1-5 |

Only run Step 2 when user explicitly requests deep audit. Default: Step 1 only.

### Discovery (`--discovery`, instead of Steps 1–2)

Use when a user could not find a skill, the wrong one was used, or they want to note how an install lists
this plugin. It observes; it changes no description, setting or skill, and runs no model.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-health-check/scripts/skill-discovery.js" observe
```

1. Run it once and show its table as printed. *Listed* and *described* read `unknown` until the user gives
   numbers; offer, once, that they may read them in the host (`/doctor`, `/context`) and pass
   `--listed N --described N --method doctor|context`, and ask how the plugin was installed
   (`--install ordinary|checkout`, the user's answer; without it there is no ordinary-install verdict). Numbers taken from your own skill list are
   `--method self-report`, and from a forked run they describe the fork.
2. Optional: `--name-only a,b` (this plugin's skills that showed no description) and
   `--reached a=explicit,b=described` (the user's answer, never yours). The last line is the verdict;
   do not restate it more strongly. A count never shows which skill would be chosen.
3. "Which skill should I use?" → `@skills/ask/references/close-skills.md`.
4. A comparison needs the user's explicit consent, because it costs model runs: `worksheet` prints the fixed
   phrases without answers, and `score --answers <file>` counts missed, wrong and unwanted use apart. The file is
   `{"answers":[{"id":"t07","condition":"described","chosen":"doc-refactor"},{"id":"n04","condition":"described","chosen":null}]}`:
   `condition` is `described` or `name-only` as read in the host for the target skill; a no-skill control and
   an explicit control take the condition of the run they belong to. `chosen` is what was used, a skill name
   or `null` for none, whichever was expected. Never
   run it on your own initiative, and never change a description on an observation alone.

In the plugin's source checkout without the plugin loaded, the path is
`skills/skill-health-check/scripts/skill-discovery.js`.

## Output

Default and `--deep` (`--discovery` prints the reader's own table instead):

```markdown
# Skill Health Check Report

## Summary

| Metric | Value |
|--------|-------|
| Skills scanned | N |
| Checks passed | N |
| P0 (Must Fix) | N |
| P1 (Should Fix) | N |
| P2 (Suggestion) | N |

## Per-Skill Results

| Skill | Routing | When-NOT | Output | Verification | Refs | AgEnt | TskEnt | Lines | Status |
|-------|---------|----------|--------|--------------|------|-------|--------|-------|--------|
| name  | ✅/🟡/⚪ | ...    | ...    | ...          | ...  | ✅/⚪ | ✅/⚪  | N     | ✅/🟡/⚪/🔴 |

## P0 (Must Fix)
- **skill-name**: Issue → Fix recommendation

## P1 (Should Fix)
- **skill-name**: Issue → Fix recommendation

## P2 (Suggestion)
- **skill-name**: Issue → Fix recommendation

## Gate: ✅ All Pass / ⛔ N issues need fixing
```

## Verification

Default and `--deep`:

- [ ] Automated lint executed (exit code checked)
- [ ] All P0/P1 findings have fix recommendations
- [ ] Per-skill table includes all scanned skills
- [ ] Gate sentinel present for hook parsing

`--discovery` (no lint report, no gate):

- [ ] Layer table and the reader's verdict line shown as printed

## References

- `references/routing-signature-guide.md` — How to write effective routing signatures (read when fixing P1 routing issues)
- `references/discovery-phrases.json` — Fixed phrases and answers for a consented comparison (read by `skill-discovery.js`)

## Examples

```
Input: /skill-health-check
Action: Run skill-lint.js → Output markdown report + Gate

Input: /skill-health-check --deep
Action: Run skill-lint.js → Manual review of flagged skills → Integrated report

Input: /skill-health-check --discovery
Action: Run skill-discovery.js observe → Layered table + verdict; nothing changed, no model run

Input: Are my skills well-designed?
Action: Trigger health check → Report + improvement suggestions
```
