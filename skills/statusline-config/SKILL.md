---
name: statusline-config
description: "Customize Claude Code statusline. Use when: user says 'statusline', 'status line', 'customize statusline', 'modify statusline', 'statusline settings', 'statusline theme', 'change theme', 'color scheme', wants to add/remove/change segments (cost, git, model, context), switch color themes (catppuccin, dracula, nord), or asks what can be shown in the statusline."
---

# StatusLine Config

Customize `~/.claude/statusline-command.sh` — segments, themes, and colors.

## When NOT to Use

| Scenario | Use Instead |
|----------|-------------|
| Setting statusline for the first time (no customization needed) | Built-in `statusline-setup` agent (Claude Code agent type) — applies defaults automatically |
| Editing `settings.json` directly | Manual edit — this skill manages `statusline-command.sh`, not `settings.json` |
| Debugging Claude Code startup issues | `/claude-health` — config health check |

## Segments

| Segment     | JSON Field                            | Default          | Notes                                 |
| ----------- | ------------------------------------- | ---------------- | ------------------------------------- |
| Directory   | `workspace.current_dir`               | ON               | Truncate deep paths: `~/.../last-dir` |
| Git branch  | shell `git`                           | ON               | `--no-optional-locks`, cache 5s       |
| Agent       | `agent.name`                          | ON (conditional) | Show when present; color: `C_MODEL`   |
| Model       | `model.display_name` + `context_window.context_window_size` | ON | Smart tier suffix: `Opus 4.6 (1M)` — auto-skip if display_name already contains context info |
| Context %   | `context_window.remaining_percentage` + `context_window_size` | ON | `ctx 60% left (600k/1M)` — Green >40%, Yellow 20-40%, Red <=20% |
| Token Usage | `context_window.total_input_tokens` + `total_output_tokens` | ON (conditional) | `{in}k/{out}k` session cumulative; color: `C_COST` |
| Cost        | `cost.total_cost_usd`                 | ON               | Show when >= $0.005, `est $X.XX`      |
| Rate Limits | `rate_limits.five_hour.used_percentage` + `seven_day.used_percentage` | ON (conditional) | `5h: 85% left · 7d: 82% left` — displays remaining (100 - used); color thresholds match context %: Green >40%, Yellow 20-40%, Red <=20%; OAuth users only |
| Worktree    | `worktree.name` + `worktree.branch`   | ON (conditional) | `[WT:{name}] {branch}` or `[WT:{name}]` if branch absent; **replaces** Directory + Git branch when present; color: `C_BRANCH` |

For full JSON schema, see [json-schema.md](references/json-schema.md).

## Themes

| Theme              | Type      | Default | Notes                                 |
| ------------------ | --------- | ------- | ------------------------------------- |
| `ansi-default`     | ANSI 16   | ✅      | Safe fallback, works everywhere       |
| `catppuccin-mocha` | TrueColor | —       | Recommended — pastel, WCAG AA >=4.5:1 |
| `dracula`          | TrueColor | —       | Vibrant purple/pink accents           |
| `nord`             | TrueColor | —       | Arctic blue, muted tones              |
| `none`             | —         | —       | No colors (`NO_COLOR` auto-triggers)  |

Switch via: `export CLAUDE_STATUSLINE_THEME=catppuccin-mocha`

For complete token→hex mappings, see [themes.md](references/themes.md).

## Semantic Tokens

Scripts use semantic tokens instead of hardcoded colors:

| Token        | Role                 | Example             |
| ------------ | -------------------- | ------------------- |
| `C_CWD`      | Directory path       | blue / sapphire     |
| `C_BRANCH`   | Git branch name      | magenta / mauve     |
| `C_MODEL`    | Model display name   | cyan / teal         |
| `C_CTX_OK`   | Context >= 41%       | green               |
| `C_CTX_WARN` | Context 21-40%       | yellow              |
| `C_CTX_BAD`  | Context <= 20%       | red                 |
| `C_COST`     | Cost display         | muted text          |
| `C_ALERT`    | >200k token warning (legacy, segment removed) | orange/peach + bold |
| `C_SEP`      | Pipe separator `\|`  | dim/overlay         |
| `C_MUTED`    | Secondary info       | subtext             |
| `C_TEXT`     | General text         | foreground          |
| `C_RESET`    | Reset all formatting | `\033[0m`           |

## Workflow

**No args** → Apply best-practice defaults (all ON segments + `ansi-default` theme). Go to step 4.

**Theme change** (e.g. "use catppuccin-mocha", "switch to dracula") → Read [themes.md](references/themes.md), apply requested theme. Go to step 4. Aliases: `catppuccin` → `catppuccin-mocha`.

**Custom requests** (e.g. "add cost", "remove git", "no colors") → Interactive flow:

1. Read current script: `cat ~/.claude/statusline-command.sh`
2. Ask segments to enable/disable (AskUserQuestion multiSelect)
3. Ask theme preference (AskUserQuestion with theme options)
4. Generate script following Script Rules + selected theme from [themes.md](references/themes.md)
5. Write to `~/.claude/statusline-command.sh`
6. Verify: `echo '{"model":{"display_name":"Opus 4.6"},"workspace":{"current_dir":"/tmp/test"},"context_window":{"remaining_percentage":55},"cost":{"total_cost_usd":0.42},"exceeds_200k_tokens":false}' | ~/.claude/statusline-command.sh`

## Script Rules

- Shebang: `#!/bin/sh` (POSIX)
- Read stdin: `input=$(cat)`
- Parse JSON: `jq -r '.field // fallback'`
- Normalize Windows path separators: when extracting `workspace.current_dir` (or the `cwd` fallback), apply `gsub("\\\\"; "/")` before the value reaches truncation, `git -C`, or `printf "%b"`.
- Theme from env: `theme="${CLAUDE_STATUSLINE_THEME:-ansi-default}"`
- NO_COLOR: `[ -n "${NO_COLOR:-}" ] && theme="none"`
- Theme aliases: `catppuccin` → `catppuccin-mocha`
- Invalid theme: fallback to `ansi-default`
- Color output: `printf "%b"` for ANSI/TrueColor, `printf "%s"` for none
- TrueColor format: `\033[38;2;R;G;Bm` (24-bit foreground)
- Git: `git --no-optional-locks -C "$dir"`
- Git cache: `/tmp/claude-statusline-git-cache-$(id -u)`, 5s TTL, `stat -f %m` (macOS) / `stat -c %Y` (Linux)
- CWD truncation: depth >2 → `~/.../basename`
- Cost: only when `>= 0.005`, format `est $X.XX`
- Alert style: `C_ALERT` + bold (`\033[1m`) to distinguish from `C_CTX_BAD`
- Token format: `%.1fk` via awk (e.g. 8500 → `8.5k`); values < 1000 show raw number
- Tier format: `>=1M → (1M)`, `>=1000 → ({N}k)`, else raw; used for model suffix + context absolute
- Model tier suffix: append `(1M)` or `(200k)` from `context_window_size`; **skip if `display_name` already contains** `context`, `1M`, or `200k`
- Context absolute: `ctx 60% left (600k/1M)` — remaining tokens calculated from `remaining_percentage * context_window_size / 100`
- Sanitize free-text: strip control chars (`tr -d '[:cntrl:]'`) + truncate 30 chars for `agent.name`, `worktree.name`, `worktree.branch`
- Worktree replace: when `worktree.name` present, replace Directory + Git branch with `[WT:{name}] {branch}` (or `[WT:{name}]` if `worktree.branch` absent — hook-based worktrees)
- Rate limits: show when `rate_limits` present; display remaining % (`100 - used_percentage`) with "left" suffix; format `5h: {rem}% left · 7d: {rem}% left`; color by worst remaining — Green >40% (`C_CTX_OK`), Yellow 20-40% (`C_CTX_WARN`), Red <=20% (`C_CTX_BAD`); thresholds match context %; OAuth users only
- Rate limits `resets_at`: extracted but not displayed in v1 (too verbose for statusline)
- Render order (normal): `Directory | Git branch | Agent? | Model (tier) | Context % (abs) · Token Usage? · Cost? · Rate Limits?`
- Render order (worktree): `[WT:name] branch | Agent? | Model (tier) | Context % (abs) · Token Usage? · Cost? · Rate Limits?`

## Script Structure

```sh
#!/bin/sh
input=$(cat)
# Normalize Windows separators before truncation, git lookups, or colored output.
dir=$(printf '%s' "$input" | jq -r '(.workspace.current_dir // .cwd // "") | gsub("\\\\"; "/")')
# ... extract JSON fields ...

theme="${CLAUDE_STATUSLINE_THEME:-ansi-default}"
[ -n "${NO_COLOR:-}" ] && theme="none"

case "$theme" in
  catppuccin|catppuccin-mocha) # set C_* tokens with TrueColor values ;;
  dracula)          # ... ;;
  nord)             # ... ;;
  none)             # all C_* = "" ;;
  *)                # ansi-default: ANSI 16 colors ;;
esac

# ... build output using C_* tokens ...
if [ "$theme" = "none" ]; then
  printf "%s" "$out"
else
  printf "%b" "$out"
fi
```

## Example Output

```
Normal mode (1M context):
~/.../my-project | feat/auth | Opus 4.6 (1M) | ctx 60% left (600k/1M) · 85.0k/12.0k · est $18.12

Normal mode (200k context):
~/.../my-project | main | Sonnet 4.6 (200k) | ctx 30% left (60k/200k) · 120.0k/8.0k · est $3.50

With agent:
~/.../my-project | feat/auth | security-reviewer | Opus 4.6 (1M) | ctx 48% left (480k/1M) · est $0.12

Worktree mode:
[WT:fix-123] bugfix/issue-123 | Opus 4.6 (1M) | ctx 22% left (220k/1M) · 42.0k/8.0k · est $1.23

With rate limits (OAuth user, green):
~/.../my-project | feat/auth | Opus 4.6 (1M) | ctx 60% left (600k/1M) · 85.0k/12.0k · est $18.12 · 5h: 58% left · 7d: 82% left

Rate limits warning (yellow):
~/.../my-project | main | Opus 4.6 (1M) | ctx 30% left (300k/1M) · 5h: 25% left · 7d: 35% left

Rate limits critical (red):
~/.../my-project | main | Opus 4.6 (1M) | ctx 30% left (300k/1M) · 5h: 8% left · 7d: 55% left

display_name already has context info (no duplicate suffix):
~/.../my-project | main | Opus 4.6 (1M context) | ctx 60% left (600k/1M) · est $18.12
```

## Output

| Artifact | Path | Description |
|----------|------|-------------|
| StatusLine script | `~/.claude/statusline-command.sh` | POSIX shell script consuming JSON stdin |

## Verification

After generating the script, verify:

- [ ] `~/.claude/statusline-command.sh` exists and is executable (`chmod +x`)
- [ ] v2 test passes: `echo '{"model":{"display_name":"Opus 4.6"},"cwd":"/tmp/test","workspace":{"current_dir":"/tmp/test","project_dir":"/tmp/test"},"context_window":{"remaining_percentage":55,"used_percentage":45,"context_window_size":200000,"total_input_tokens":85000,"total_output_tokens":12000,"current_usage":{"input_tokens":8500,"output_tokens":1200,"cache_creation_input_tokens":5000,"cache_read_input_tokens":2000}},"cost":{"total_cost_usd":0.42},"exceeds_200k_tokens":false,"session_id":"test","version":"2.1.80","output_style":{"name":"default"},"rate_limits":{"five_hour":{"used_percentage":42.5,"resets_at":"2026-03-21T14:30:00Z"},"seven_day":{"used_percentage":18.2,"resets_at":"2026-03-25T00:00:00Z"}}}' | ~/.claude/statusline-command.sh`
- [ ] Output contains expected segments (directory, model, context %, token usage `8.5k/1.2k`)
- [ ] Agent test: `echo '{"model":{"display_name":"Opus 4.6"},"workspace":{"current_dir":"/tmp/test"},"context_window":{"remaining_percentage":55},"cost":{"total_cost_usd":0.42},"exceeds_200k_tokens":false,"agent":{"name":"security-reviewer"}}' | ~/.claude/statusline-command.sh` shows `security-reviewer` segment
- [ ] Worktree test: `echo '{"model":{"display_name":"Opus 4.6"},"worktree":{"name":"fix-123","branch":"bugfix/issue-123"},"context_window":{"remaining_percentage":55},"cost":{"total_cost_usd":0.42},"exceeds_200k_tokens":false}' | ~/.claude/statusline-command.sh` shows `[WT:fix-123] bugfix/issue-123` replacing directory/branch
- [ ] Rate limits test: output contains `5h: 58% left · 7d: 82% left` with green color
- [ ] Rate limits absent: `echo '{"model":{"display_name":"Opus 4.6"},"workspace":{"current_dir":"/tmp/test"},"context_window":{"remaining_percentage":55},"cost":{"total_cost_usd":0.42},"exceeds_200k_tokens":false}' | ~/.claude/statusline-command.sh` produces valid output without rate limits segment (no errors)
- [ ] v1 backward compat: `echo '{"model":{"display_name":"Opus 4.6"},"workspace":{"current_dir":"/tmp/test"},"context_window":{"remaining_percentage":55},"cost":{"total_cost_usd":0.42},"exceeds_200k_tokens":false}' | ~/.claude/statusline-command.sh` produces valid output without errors
- [ ] Theme matches user selection (check color codes in script)
- [ ] `NO_COLOR=1` produces uncolored output
