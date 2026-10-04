---
name: bump-version
description: "Bump package and plugin version in sync. Updates package.json, .claude-plugin/plugin.json, and install-state manifest to the same version. Use when: user says 'bump version', 'update version', '更新版本', '版本 +1', or /bump-version"
---

# Bump Version

Update `package.json`, `.claude-plugin/plugin.json`, and `.sd0x/install-state.json` versions in sync.

## Workflow

0. Choose the target (below) — the plugin, or the agentctl mod
1. Read current versions from all files
2. Determine new version (from argument or auto-increment)
3. Update all files to the same version
4. Report result

## Step 0: Choose the Target

| Invocation | Target | Steps |
|------------|--------|-------|
| `/bump-version agentctl [patch\|minor\|major\|<version>]` | the agentctl mod only | **Step 3b only** — the plugin's three files are not read or changed, so no plugin release is triggered |
| anything else | the plugin | Steps 1–4; Step 3b is not run |

Never bump both in one invocation: the plugin and the mod release separately, and a stray change to
`package.json` triggers the plugin's release workflow. When the plugin is bumped and
`node .github/scripts/agentctl-version.js check` reports that the mod changed too, say so and suggest
`/bump-version agentctl` as a separate run.

## Step 1: Read Current Versions

```bash
grep '"version"' package.json .claude-plugin/plugin.json
```

Also check manifest:

```bash
grep '"plugin_version"' .sd0x/install-state.json 2>/dev/null || echo "(no manifest)"
```

If versions are already out of sync, warn user before proceeding.

## Step 2: Determine New Version

| Input | Action |
|-------|--------|
| Explicit version (e.g., `1.9.0`) | Use as-is |
| `major` | Bump major: `1.8.1` → `2.0.0` |
| `minor` | Bump minor: `1.8.1` → `1.9.0` |
| `patch` (default) | Bump patch: `1.8.1` → `1.8.2` |
| No argument | Default to `patch` |

## Step 3: Update All Files

Use Edit tool to update version fields:

1. `package.json` — `"version"` field
2. `.claude-plugin/plugin.json` — `"version"` field
3. `.sd0x/install-state.json` — `"plugin_version"` field (if file exists)

All must be set to the **exact same version string**.

The manifest update prevents the SessionStart drift sentinel from firing false warnings after every version bump in the plugin source repo.

## Step 3b: The agentctl mod (`/bump-version agentctl`, only where `mods/agentctl/` exists)

The mod is versioned separately and released under `agentctl-v<version>` tags. This step runs **instead
of** Steps 1–3, never after them, and only where `mods/agentctl/.claude-plugin/plugin.json` exists:

1. Bump `"version"` in `mods/agentctl/.claude-plugin/plugin.json` by the Step 2 rules applied to the
   argument after `agentctl`, from **its own** current version — never to the plugin's version
2. Run `node .github/scripts/agentctl-version.js update` to record the new version and the mod's digest

Claude Code caches an installed plugin by version, so a mod change shipped under an unchanged version can
miss everyone who already installed it; CI fails until the lock is recorded.

## Step 4: Report

```
## Version Bump

| File | Field | Before | After |
|------|-------|--------|-------|
| package.json | version | x.y.z | a.b.c |
| .claude-plugin/plugin.json | version | x.y.z | a.b.c |
| .sd0x/install-state.json | plugin_version | x.y.z | a.b.c |
| mods/agentctl/.claude-plugin/plugin.json | version (only when bumped) | p.q.r | p.q.s |
```

## Prohibited

- Never set different versions across the plugin's three files (the agentctl mod keeps its own version)
- Never modify other fields in the version manifests (`package.json`, the plugin manifests, `.sd0x/install-state.json`); `mods/agentctl/release.json` is generated and is written only by `agentctl-version.js update`
