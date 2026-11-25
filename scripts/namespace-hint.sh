#!/usr/bin/env bash
# SessionStart hook: inject namespace guidance + drift sentinel into Claude context
echo "Plugin sd0x-dev-flow: invoke its skills as /sd0x-dev-flow:<skill>; host commands keep their names"

# Plugin root: the resident contract triggers name contracts as skills/… paths, which exist only
# inside the plugin install — this line is how a session in any project resolves them.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)}"
echo "Plugin root: $PLUGIN_ROOT"
echo "Contract paths (skills/…) named in CLAUDE.md and .claude/rules/ resolve under it"

# The runner is printed as a runnable, single-quoted path: a project that installed the plugin has no
# scripts/run-skill.sh of its own, and an install path may hold a space or a quote.
RUNNER=$(printf '%s' "$PLUGIN_ROOT/scripts/run-skill.sh" | sed "s/'/'\\\\''/g")
echo "Plugin scripts: bash '$RUNNER' <skill> <script> [args]"
echo "Where a skill says scripts/run-skill.sh, use that path and keep the interpreter the skill names"

# --- Drift sentinel (< 50ms budget) ---
# Detects plugin version mismatch with installed manifest and warns user.
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
MANIFEST="$REPO_ROOT/.sd0x/install-state.json"

# Skip if no manifest (first-time user or plugin source repo without local install)
[ -f "$MANIFEST" ] || exit 0

# Extract manifest plugin_version (no jq dependency — use grep+sed)
MANIFEST_VER=$(grep -o '"plugin_version"[[:space:]]*:[[:space:]]*"[^"]*"' "$MANIFEST" 2>/dev/null \
  | sed 's/.*"plugin_version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
[ -z "$MANIFEST_VER" ] && exit 0

# Resolve current plugin version from plugin root (not CWD) — PLUGIN_ROOT is set above.
CURRENT_VER=""
PLUGIN_JSON="$PLUGIN_ROOT/.claude-plugin/plugin.json"
PKG_JSON="$PLUGIN_ROOT/package.json"

if [ -f "$PLUGIN_JSON" ]; then
  CURRENT_VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGIN_JSON" \
    | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
elif [ -f "$PKG_JSON" ]; then
  CURRENT_VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PKG_JSON" \
    | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
fi

[ -z "$CURRENT_VER" ] && exit 0
[ "$MANIFEST_VER" = "$CURRENT_VER" ] && exit 0

# Version mismatch — emit warning
echo ""
echo "SessionStart hook additional context: ⚠️ Plugin updated ($MANIFEST_VER → $CURRENT_VER). Installed rules/hooks may be outdated. Run \`/sd0x-dev-flow:claude-health --scope sync\` to check."
