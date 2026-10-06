# T9 — `/agentctl-setup`: opt-in install and first task for plugin users

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-10-04
> **Status**: Completed
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) — § 3.5, § 5 task 9
> **Requirements**: [1-requirements.md](../1-requirements.md) — FR-26, NFR-7
> **Code location**: this repository — `skills/agentctl-setup/`, `mods/agentctl/`, `.claude-plugin/marketplace.json`

## Background

The mod moved into this repository under `mods/agentctl/` (user decision, 2026-10-04) and the plugin
never installs it. Using it meant `--plugin-dir` and a hand-written task JSON. Plugin users need one
friendly path: understand what it does, check the host, install after approval, and get a first task
line they can send.

## Requirements

- An `agentctl` entry in the marketplace (relative source `./mods/agentctl`) so the mod installs as a separate, optional plugin
- `/agentctl-setup`: explain → check → install → first task → optional deny rules; `--task`, `--status`, `--uninstall`
- A helper with `doctor`, `task-line` and `deny-rules`, each printing one JSON document
- Every install, enable, settings write and uninstall is asked first; the task line is the user's to send

## Scope

| Scope | Description |
| ----- | ----------- |
| In | Tech spec § 3.5 and § 5 task 9 |
| Out | Changes to the mod's behaviour beyond declaring its module format; CI for the mod's own tests |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/agentctl-setup/SKILL.md` | New | The setup workflow |
| `skills/agentctl-setup/scripts/agentctl-setup.js` | New | `doctor`, `task-line`, `deny-rules` |
| `test/skills/agentctl-setup.test.js` | New | Skill and helper tests |
| `.claude-plugin/marketplace.json` | Modify | `agentctl` entry |
| `mods/agentctl/package.json` | New | ES-module declaration |
| `docs/skill-catalog.yml`, `README*.md` | Modify | Catalog entry and counts |

## Acceptance Criteria

- [x] `doctor` reports the Claude Code version against 2.1.288, `git`, the mod manifest, `disableAllHooks` in user or project settings, and install state as not installed, unreadable or `{ id, enabled }`
- [x] The marketplace lists `agentctl` from `./mods/agentctl`; a real install from it loads the mod in a new session, and uninstalling leaves the settings and plugin records byte-identical once the host's own leftovers are removed
- [x] An installed but disabled mod is reported and enabled only after approval, before any task is built
- [x] `task-line` prints only a line the mod accepts: it runs the mod's `validateTask`, refuses checks the mod's `classify` would not pass and needs-user commands that would not ask, and loads without Node's syntax detection
- [x] The skill never sends `/agentctl task set` itself and tells the user why the line is theirs to send
- [x] `deny-rules` keeps every other setting, is idempotent, leaves invalid or oddly shaped files untouched, and never offers `git push`
- [x] `--uninstall` asks first and names the mod's data file
- [x] The skill is in the catalog and every README count and catalog block; the global skill, catalog and manifest tests pass
- [x] Pass /codex-review-fast
- [x] Pass /precommit
- [x] Pass /codex-review-doc

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | Tech spec § 3.5; marketplace relative sources and the plugin CLI checked against the docs and `claude plugin --help` (2.1.289) |
| Development | Done | Skill, helper, marketplace entry, catalog and six READMEs; review fixes: ES-module declaration, classifier check of each command, disabled-install branch, settings files that are not a JSON object left untouched, free-text answers passed through an allocated file instead of a command line, mode dispatch before step 1 |
| Testing | Done | `test/skills/agentctl-setup.test.js` 28 pass (AC3, AC4 and AC7 evidence tests included); `npm test` 5111 pass, 0 fail, covering the global skill, catalog and manifest tests; mod `claude plugin test .` 145 pass |
| Acceptance | Done | 2026-10-04 live: local marketplace add → `claude plugin install agentctl@sd0xdev-marketplace` → `/agentctl` answered in a new `claude -p` session → `doctor` read `{ id, enabled: true }` → uninstall and marketplace remove; the host left an empty `extraKnownMarketplaces`, a plugin cache and `installed_plugins.json`, which were removed, and `~/.claude/settings.json` and the plugin records were byte-identical to the backup. `/codex-review-fast` (thorough, four rounds): ✅ Ready. `/precommit`: ✅ PASS. `/codex-review-doc` over the skill, tech spec, this ticket, the mod README and the six READMEs (three batches): ✅ Mergeable. `/create-request --update --verify-ac` (2026-10-04): every AC Complete at High, accounted one result per AC |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md)
- Intent: [intent-agent-control-plane-mod.md](../intent-agent-control-plane-mod.md)
