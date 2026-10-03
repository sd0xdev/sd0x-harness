# Plugin Directory Preflight — sd0x-dev-flow

> **Doc class**: Checklist (ancillary — point-in-time record). Measured 2026-10-03 at commit
> `100fe3e` (branch `feat/cc288-b3-maintenance` before task 10) with Claude Code 2.1.288 on macOS.
> A later commit changes the counts; re-run the commands rather than trusting the numbers.
> **Source**: claude.com/docs/plugins/pre-submission-checklist (the portal's automated checks) and
> code.claude.com/docs/en/plugins/publish § Submit to Anthropic's directory.
> **Tech Spec**: [2-tech-spec.md](./2-tech-spec.md) § 3.4 Batch 3, task 10

The plugin folder is the repository root (`.claude-plugin/plugin.json`), so everything tracked is in
the submission. The checks the source applies only to a plugin in a subfolder are listed as N/A.
Nothing below was changed to pass a check: a **Held** row is an accepted hold that a reviewer reads,
not a defect to prune away. Every command runs from the repository root; `stat -f` is the macOS
form (`stat -c` on Linux).

## Local validation

| Command | Result |
|---------|--------|
| `claude plugin validate --strict .claude-plugin/plugin.json` | Fails `--strict` on 9 warnings. Eight: every hook command in `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}` without quotes — recorded as a follow-up, not fixed here (this task does not change hooks). One: the root `CLAUDE.md` is not loaded as plugin context — intended, since it is this repository's own development instructions and the plugin ships its rules through `/install-rules`. Neither is a portal check |
| `claude plugin validate --strict .` (reads `marketplace.json`) | Fails `--strict` on 1 warning: no marketplace `description` |

## Repository and folder layout

| Check | Result if failed | Measured | Command | State |
|-------|------------------|----------|---------|-------|
| A folder containing `.claude-plugin/plugin.json` | Blocks | Present at the root | `ls .claude-plugin/` | ✅ |
| One plugin per submission | Blocks | 1 plugin | `node -e "console.log(require('./.claude-plugin/marketplace.json').plugins.length)"` | ✅ |
| Hook and script files inside the plugin folder | Blocks | 8 hook commands, each `${CLAUDE_PLUGIN_ROOT}/…` | `node -e "const h=require('./hooks/hooks.json').hooks;for(const e in h)for(const m of h[e])for(const k of m.hooks)console.log(k.command)"` | ✅ |
| No symlinks or submodules | Blocks where loaded | 0 | `git ls-files -s \| awk '$1==120000\|\|$1==160000' \| wc -l` | ✅ |
| No Git LFS pointer files | Blocks where loaded | 0 | `git grep -l -I '^version https://git-lfs' -- . \| wc -l` | ✅ |
| No `.DS_Store`, `Thumbs.db`, `desktop.ini`, `__MACOSX` | Blocks | 0 | `git ls-files \| grep -c -E '(^\|/)(\.DS_Store\|Thumbs\.db\|desktop\.ini\|__MACOSX)'` | ✅ |
| Names portable to Windows and macOS: no colon, trailing dot or space, device name | Validation stops | 0 | `git ls-files \| awk -F/ '{for(i=1;i<=NF;i++)print $i}' \| sort -u \| grep -c -E ':\|[. ]$\|^(con\|prn\|aux\|nul\|com[0-9]\|lpt[0-9])(\.\|$)'` | ✅ |
| No two names differing only by case | Validation stops | 0 files, 0 folders | `git ls-files \| tr 'A-Z' 'a-z' \| sort \| uniq -d \| wc -l`; the same over `xargs -n1 dirname \| sort -u` | ✅ |
| Folders on the path to the plugin use letters, digits, `.`, `-`, `_` | Validation stops | N/A — the plugin is the root | — | N/A |
| No `export-ignore` / `export-subst` / content filters in `.gitattributes` | Validation stops | No `.gitattributes` tracked | `git ls-files \| grep -c gitattributes` | ✅ |
| Archive under 50 MiB | Validation stops | 7,650,434 B | `git archive --format=tar.gz HEAD \| wc -c` | ✅ |
| Under 256 MiB unpacked | Validation stops | 18,142,764 B (sum of tracked file sizes) | `git ls-files -z \| xargs -0 stat -f '%z' \| awk '{s+=$1} END{print s}'` | ✅ |
| Fewer than 10,000 files and folders | Validation stops | 956 files + 421 folders = 1,377 | `git ls-files \| wc -l`; `git ls-files \| xargs -n1 dirname \| sort -u \| grep -v '^\.$' \| awk -F/ '{p="";for(i=1;i<=NF;i++){p=p (i>1?"/":"") $i;print p}}' \| sort -u \| wc -l` (every ancestor folder of a tracked path, once) | ✅ |
| Every file under 5 MiB | Validation stops | Largest 2,853,209 B (`banner.jpg`) | `git ls-files -z \| xargs -0 stat -f '%z %N' \| sort -n \| tail -1` | ✅ |

## Manifest, README and license

| Check | Result if failed | Measured | Command | State |
|-------|------------------|----------|---------|-------|
| `name` lowercase letters, digits, hyphens, ≤ 64, not a reserved word | Blocks / Warning | `sd0x-dev-flow` | `node -e "console.log(require('./.claude-plugin/plugin.json').name)"` | ✅ |
| `description`, `author`, `version` set | Warning | All set; `version` 5.0.0 | `node -e "const p=require('./.claude-plugin/plugin.json');console.log(!!p.description,!!p.author,p.version)"` | ✅ |
| README of at least 40 words outside code blocks | Blocks | 5,737 words | `awk '/^```/{f=!f;next} !f' README.md \| wc -w` | ✅ |
| `LICENSE` file or `license` field | Blocks | Both: `LICENSE`, `"license": "MIT"` | `ls LICENSE`; `node -e "console.log(require('./.claude-plugin/plugin.json').license)"` | ✅ |
| Name not used by another organization's plugin, case and punctuation ignored | Blocks / Held | Not measurable locally — the portal checks its own catalogue | — | Portal |
| Name, `displayName`, `author.name` not confusable with another publisher or brand | Held | Not measurable locally — the portal decides | — | Portal |
| A fork carries a name of its own | Held | N/A — this repository is the upstream | — | N/A |
| `displayName` and `author.name` in one writing system, no look-alike or invisible characters | Blocks | No `displayName`; `author.name` `sd0xdev` is printable ASCII | `node -e "const p=require('./.claude-plugin/plugin.json');console.log(p.displayName,/^[\x20-\x7E]+$/.test(p.author.name))"` | ✅ |
| Component keys spelled as the manifest reference does, none inside `experimental` | Blocks | Keys: `name`, `description`, `version`, `author`, `license`, `keywords` — no component key and no `experimental` | `node -e "console.log(Object.keys(require('./.claude-plugin/plugin.json')))"` | ✅ |

## Files in the plugin folder

| Check | Result if failed | Measured | Command | State |
|-------|------------------|----------|---------|-------|
| Every file that is not an image or font under 256 KiB | Held | 3 over: `docs/features/push-gate-optin/review-log-push-gate-optin.md` (306,851 B), `test/skills/epic-merge.test.js` (331,580 B), `test/skills/push-ci.test.js` (352,656 B). `banner.jpg` is an image and exempt | `git ls-files -z \| xargs -0 stat -f '%z %N' \| awk '$1>262144' \| grep -v -i -E '\.(png\|jpe?g\|gif\|webp\|svg\|woff2?\|ttf\|otf)$'` | **Held — accepted** |
| 512 files or fewer | Held | 956 tracked files | `git ls-files \| wc -l` | **Held — accepted** |
| Only text, complete PNG/JPEG/GIF/WebP images and fonts | Held | No other binary | `git ls-files \| grep -c -i -E '\.(ico\|pdf\|zip\|exe\|bin\|mcpb\|dxt)$'` | ✅ |
| A bundled image shown only through Markdown image syntax | Held | `banner.jpg` appears only as `![…](…/banner.jpg)` in the six READMEs | `git grep -n 'banner\.jpg' -- '*.md' '*.sh' '*.js' '*.json'` | ✅ |
| MCP servers declared by `command`/`args` or `url`, not a `.mcpb` / `.dxt` bundle | Held / Blocks | No MCP server (see below) | — | N/A |

**Why the two holds are accepted.** The two oversized test files are authorization-bearing suites
(`/epic-merge` and `/push-ci` carry Anchor Register #4 grants, and their tests pin each skill's
digest). The review log is a record, and records are never rewritten. Splitting or pruning any of
them to fit a size limit would trade a guarantee for a listing. The file count is the repository:
docs, tests and records are part of what a reviewer reads, and the plugin has no subfolder to
submit instead. A reviewer reads a held version; a hold is not a rejection.

## What the plugin runs and connects to

| Check | Result if failed | Measured | Command | State |
|-------|------------------|----------|---------|-------|
| Launchers pinned to an exact version | Blocks | No launcher runs from a hook; the one match is a comment | `grep -rn -E '\b(npx\|bunx\|uvx\|pipx run\|uv run\|pnpm dlx\|yarn dlx)\b' hooks/` | ✅ |
| No `.npmrc`, `bunfig.toml`, `uv.toml` with a launcher or install | Blocks / Held | None tracked | `git ls-files \| grep -c -E '(^\|/)(\.npmrc\|bunfig\.toml\|uv\.toml)$'` | ✅ |
| No lockfile install at the plugin root | Held | `package.json` without a lockfile | `ls package-lock.json npm-shrinkwrap.json bun.lock bun.lockb` | ✅ |
| MCP servers valid and pinned | Blocks / Held | No `.mcp.json` and no `mcpServers` | `git ls-files \| grep -c -E '(^\|/)\.mcp\.json$'` | N/A |
| Credentials only through `userConfig` with `sensitive: true` | Blocks | No `userConfig`; no credential is requested | `node -e "console.log(!!require('./.claude-plugin/plugin.json').userConfig)"` | N/A |
| No real credentials in any file | Blocks | Not measured here — the portal's security scan decides it | — | Portal |
| No credential read from the user's environment and sent to a server | Held / Blocks | No hook or script reads `GITHUB_TOKEN`, `GH_TOKEN`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`; `gh` and the Codex CLI use their own sign-in | `grep -rln -E '\$\{?(GITHUB_TOKEN\|GH_TOKEN\|ANTHROPIC_API_KEY\|OPENAI_API_KEY)\b\|process\.env\.(GITHUB_TOKEN\|GH_TOKEN\|ANTHROPIC_API_KEY\|OPENAI_API_KEY)' hooks scripts \| wc -l` → 0 | ✅ |
| Readable source, not compiled, packed or minified | Held (security scan) | No `.min.js` / `.min.css`; every script is committed source | `git ls-files \| grep -c -E '\.min\.(js\|css)$'` | ✅ |
| Hook and MCP command paths written in full from `${CLAUDE_PLUGIN_ROOT}` | Blocks in a subfolder | N/A at the root; every command is a full `${CLAUDE_PLUGIN_ROOT}/…` path anyway | hook-command listing above | N/A |
| Hook scripts free of launchers, and of other variables and file calls in a subfolder | Held | N/A at the root for the subfolder half; no launcher (above) | — | N/A |

## Hooks, skills, commands and agents

| Check | Result if failed | Measured | Command | State |
|-------|------------------|----------|---------|-------|
| `hooks/hooks.json` valid, known events, no `modules` | Blocks | Valid; `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit`; no `modules` | `node -e "const h=require('./hooks/hooks.json');console.log(Object.keys(h.hooks),h.modules)"` | ✅ |
| `hooks/hooks.json` not repeated in `plugin.json` `hooks` | Warning | No `hooks` field | `node -e "console.log(require('./.claude-plugin/plugin.json').hooks)"` | ✅ |
| Skill, command and agent front matter parses, `description` is text | Blocks | `✔ Validation passed` for both directories; there is no `commands/` | `claude plugin validate skills`; `claude plugin validate agents` | ✅ |
| Component folders and files spelled as Claude Code expects | Blocks | `agents/`, `hooks/`, `skills/`; 101 `skills/*/SKILL.md`, 0 other spellings | `git ls-files 'skills/*/*' \| grep -i -E '/skill\.md$' \| grep -c -v '/SKILL\.md$'` | ✅ |

## Security scan: disclosure

The scan looks for behaviour a plugin does not disclose. The README's § Rules & Hooks, in all six
languages, now states what the plugin runs, sends and fetches:

- Review skills shell out to the Codex CLI, which sends review prompts and the files Codex reads to
  OpenAI under the user's Codex configuration
- Git and CI skills reach GitHub through `gh`, and a push runs only after the user's per-use approval
- Research skills fetch web pages
- Hooks run the plugin's own scripts locally and download nothing. The post-edit formatter runs
  `prettier` only when the project has it in `node_modules/.bin`, or has a Prettier config file and
  a `prettier` on `PATH` (`hooks/post-edit-format.sh`)

A complete README does not make a behaviour allowed; the Anthropic Software Directory Policy decides
that.
