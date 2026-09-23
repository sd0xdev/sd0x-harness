#!/usr/bin/env bash
# PreToolUse hook (Bash): Guard the launch shape of a Codex dispatch
# Exit code 2 = reject the tool call
#
# `codex-transport.md` § Progress step 1: a `start`/`resume` dispatch is launched with
# `Bash(run_in_background: true)` and NOTHING redirected — stderr left attached is what the
# task panel shows, so the adapter's 60 s `[CODEX_EXEC_PROGRESS]` lines appear there live.
# A launch that redirects or pipes (`> log 2>&1`, `| tail`), wraps in `nohup`/`setsid`, or
# backgrounds with a trailing `&` leaves the panel reading "No output yet" for the whole run
# — and a foreground launch (`run_in_background` unset) meets the tool ceiling (measured
# 2026-09-05, repeated 2026-09-22 — lessons L19). The adapter cannot tell a harness task
# file from a caller's redirection (fd1 and fd2 are the same regular file either way,
# measured), so the guard sits on the launch command, where the shape is still visible.
#
# Only `start` and `resume` are guarded: `alloc` and `cleanup` are short and may be piped
# or redirected freely, and any command that does not name the adapter passes untouched.

set -euo pipefail

# === Plugin-defers-to-local arbitration ===
# When running as a plugin hook, detect if identical local hook is installed
# and registered in project settings — if so, exit 0 to avoid double-fire.
# Dev-mode bypass: hooks/hooks.json at project root = plugin source repo (skip arbitration).
# Origin, not path identity, decides deferral — the rationale is written once, in
# hooks/pre-edit-guard.sh, and this block is the same block.
_SELF_NAME="$(basename "$0")"
_SELF_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P)" || _SELF_DIR=""
_LOCAL_DIR="$(cd "${CLAUDE_PROJECT_DIR:-/nonexistent}/.claude/hooks" 2>/dev/null && pwd -P)" || _LOCAL_DIR=""
_IS_PLUGIN_COPY=false
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
  case "$(dirname "$0")/" in "${CLAUDE_PLUGIN_ROOT%/}"/hooks/) _IS_PLUGIN_COPY=true ;; esac
elif [[ -n "$_SELF_DIR" && -n "$_LOCAL_DIR" && "$_SELF_DIR" != "$_LOCAL_DIR" ]]; then
  _IS_PLUGIN_COPY=true
fi
if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]] \
   && [[ ! -f "${CLAUDE_PROJECT_DIR}/hooks/hooks.json" ]] \
   && [[ "$_IS_PLUGIN_COPY" == "true" ]] \
   && [[ -x "${_LOCAL_DIR}/${_SELF_NAME}" ]]; then
  _SETTINGS_MATCH=false
  for _sf in "${CLAUDE_PROJECT_DIR}/.claude/settings.json" \
             "${CLAUDE_PROJECT_DIR}/.claude/settings.local.json"; do
    if [[ -f "$_sf" ]]; then
      if command -v jq &>/dev/null; then
        jq -e '.hooks // {} | .. | strings | select(contains(".claude/hooks/'"${_SELF_NAME}"'"))' "$_sf" >/dev/null 2>&1 \
          && _SETTINGS_MATCH=true && break
      else
        grep -q "\.claude/hooks/${_SELF_NAME}" "$_sf" 2>/dev/null \
          && _SETTINGS_MATCH=true && break
      fi
    fi
  done
  if [[ "$_SETTINGS_MATCH" == "true" ]]; then
    exit 0  # Defer to local hook
  fi
fi

# Read stdin once and store it
stdin_data=$(cat)

# Without jq the command cannot be extracted: fail-open, exactly as pre-edit-guard does,
# and docs/hooks.md says so.
command_text=$(printf '%s' "$stdin_data" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
background=$(printf '%s' "$stdin_data" | jq -r '.tool_input.run_in_background // false' 2>/dev/null || true)

if [[ -z "$command_text" ]]; then
  exit 0
fi

# Cheap pre-filter: a command that never names the adapter has nothing to guard.
[[ "$command_text" == *codex-exec.js* ]] || exit 0

# The judgement runs in node — the runtime every dispatcher already needs for the adapter itself —
# because the unit judged is a SIMPLE COMMAND, and finding one needs a lexer that respects quotes:
# a review measured a bash-regex form both blocking `grep 'example; node …codex-exec.js start 2>&1'`
# (the `;` inside quotes split it) and passing `2> err node …` (spaced prefix redirect). The lexer
# below handles single/double quotes, backslashes, `#` comments, the list operators (`&&`, `||`,
# `;`, newline), pipes, a trailing `&`, subshell parens and redirection words (`>`, `>>`, `<`,
# `2>`, `2>&1`, `&>`, `<<`). Every top-level simple command whose command word is `node` running a
# path ending in `codex-exec.js` with a standalone `start` or `resume` word is a launch, and every
# launch is checked — not only the first, and a script word written through a shell variable is
# resolved from the assignments this same input makes. Known boundary, stated in docs/hooks.md: a
# launch hidden inside `bash -c '…'`, `eval`, `$(…)` or a backtick is a quoted word to this lexer
# and passes, and so does a locator held in a variable that an EARLIER tool call assigned; the
# guard is aimed at the launch shapes that were measured, not at parsing arbitrary shell.
# Without node the command cannot be judged: fail-open, like the jq case above.
GUARD_JS='
const src = require("fs").readFileSync(0, "utf8");
const background = process.argv[1] === "true";
// Every simple command records its own output handling and the GROUP it sits in: a redirect,
// pipe or `&` written after a closing `)` / `}` applies to every command inside that group, so a
// launch inherits its ancestors flags (a review measured `(node … start) 2>err` slipping past a
// per-command read). Operators inside quotes stay text; quoted command words still count, since
// bash runs `"node" "scripts/codex-exec.js" start` exactly like the bare spelling.
const cmds = [];
const root = { parent: null, redirect: false, pipe: false, bg: false };
const stack = [root];
let cur = null, word = "", inWord = false, quoted = false, closed = null;
const fresh = () => ({ words: [], redirect: false, pipe: false, bg: false, group: stack[stack.length - 1] });
const push = () => { if (inWord) { cur.words.push({ text: word, quoted }); word = ""; inWord = false; quoted = false; } };
const end = () => { push(); if (cur.words.length) { cmds.push(cur); closed = null; } cur = fresh(); };
const target = () => (cur.words.length === 0 && closed) ? closed : cur;   // a `) 2>x` belongs to the group
cur = fresh();
let i = 0;
while (i < src.length) {
  const c = src[i], n = src[i + 1];
  if (!inWord && c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
  if (c === "\x27") { let j = i + 1; while (j < src.length && src[j] !== "\x27") j++; word += src.slice(i + 1, j); inWord = true; quoted = true; i = j + 1; continue; }
  if (c === "\"") { let j = i + 1; while (j < src.length && src[j] !== "\"") { if (src[j] === "\\" && j + 1 < src.length) j++; j++; } word += src.slice(i + 1, j); inWord = true; quoted = true; i = j + 1; continue; }
  if (c === "\\" && n !== undefined) { word += n; inWord = true; i += 2; continue; }
  if (c === "&" && n === "&") { end(); closed = null; i += 2; continue; }
  if (c === "|" && n === "|") { end(); closed = null; i += 2; continue; }
  if (c === ";" || c === "\n") { end(); closed = null; i++; continue; }
  if (c === "|") { push(); target().pipe = true; end(); cur.pipe = true; closed = null; i++; continue; }
  if (c === "&" && n === ">") { i++; continue; }   // `&>target` — the `>` branch below consumes the target
  if (c === "&") { push(); target().bg = true; end(); closed = null; i++; continue; }
  if (c === "(" || (c === "{" && !inWord && /^\s|^$/.test(src.slice(i + 1, i + 2)))) {
    const g = { parent: stack[stack.length - 1], redirect: false, pipe: cur.pipe, bg: false };
    end(); stack.push(g); cur = fresh(); closed = null; i++; continue;
  }
  if (c === ")" || (c === "}" && !inWord)) {
    end(); if (stack.length > 1) closed = stack.pop(); cur = fresh(); i++; continue;
  }
  if (c === ">" || c === "<") {
    if (inWord && /^[0-9]+$/.test(word) && !quoted) { word = ""; inWord = false; } else push();
    target().redirect = true;
    while (i < src.length && (src[i] === ">" || src[i] === "<" || src[i] === "&")) i++;
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i++;
    while (i < src.length && !/[\s;|&()<>]/.test(src[i])) { if (src[i] === "\x27" || src[i] === "\"") { const q = src[i]; let j = i + 1; while (j < src.length && src[j] !== q) j++; i = j + 1; } else i++; }
    continue;
  }
  if (c === " " || c === "\t") { push(); i++; continue; }
  word += c; inWord = true; i++;
}
end();
const WRAP = new Set(["nohup", "setsid", "time", "env"]);
// Shell variables are resolved from the assignments THIS tool input makes, in order — prefix
// assignments (`ADAPTER=x node …`), bare assignment commands (`ADAPTER=x;`), `export`/`local`
// forms — and a script word is expanded through that map before it is compared with the adapter
// path. A prefix assignment on an external command is scoped to that process alone — the words
// of the command were already expanded, and the earlier value is restored afterwards — so only
// bare assignment commands and export/local forms persist (two reviews measured the other readings). `node "$ADAPTER" … start` is a launch when ADAPTER was assigned `…codex-exec.js` here, and
// `node "$SCRIPT" start` is not, whatever else the input mentions (two reviews measured the
// name-anywhere shortcut both blocking an unrelated script and missing `"scripts/$ADAPTER"`).
const vars = new Map();
const isAssign = (t) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(t);
const assign = (t) => { const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(t); if (m) vars.set(m[1], expand(m[2])); return !!m; };
const expand = (t) => t.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (all, a, b) => vars.has(a || b) ? vars.get(a || b) : all);
const inherited = (cmd, flag) => { for (let g = cmd.group; g; g = g.parent) if (g[flag]) return true; return cmd[flag]; };
let reason = "";
for (const cmd of cmds) {
  const w = cmd.words; let k = 0; let wrapped = false; const prefix = [];
  if (w.length && !w[0].quoted && (w[0].text === "export" || w[0].text === "local")) { for (const t of w.slice(1)) assign(t.text); continue; }
  for (;;) {
    while (k < w.length && !w[k].quoted && isAssign(w[k].text)) prefix.push(w[k++].text);
    if (k < w.length && WRAP.has(w[k].text)) { if (w[k].text === "nohup" || w[k].text === "setsid") wrapped = true; k++; continue; }
    break;
  }
  // a bare assignment command (`ADAPTER=x;`) has no command word: it takes effect now
  if (k >= w.length) { for (const t of prefix) assign(t); continue; }
  // a prefix assignment on an external command (`X=1 node …`) is temporary: bash exports it to that
  // process only and restores the earlier value afterwards, so it never enters the map — neither
  // for this command (its words were expanded first) nor for later ones (a review measured the
  // persisted form missing a later redirected launch)
  const resolved = w.map((t) => expand(t.text));
  if (!(w[k].text === "node")) continue;
  // node options (`--no-warnings`, `-r mod`, `--max-old-space-size=…`) may sit before the script path
  let p = k + 1; while (p < w.length && w[p].text.startsWith("-")) { if (/^(-r|--require|--import|--loader|--experimental-loader|--env-file|-C|--conditions|--stack-trace-limit|--title|--input-type)$/.test(w[p].text)) p++; p++; }
  // the script word, after expanding the variables this input assigned, must be the adapter path
  if (!(p < w.length && /(^|\/)codex-exec\.js$/.test(resolved[p]))) continue;
  if (!w.slice(p + 1).some((t) => t.text === "start" || t.text === "resume")) continue;
  if (!background) reason = "not launched with run_in_background: true (the foreground tool ceiling would cut a long review off)";
  else if (wrapped) reason = "wrapped in nohup/setsid";
  else if (inherited(cmd, "redirect")) reason = "stdout/stderr redirected (>, 2>, 2>&1, <) on the launch command or its enclosing group";
  else if (inherited(cmd, "pipe")) reason = "piped — the control record and the live stderr must reach the task panel unfiltered";
  else if (inherited(cmd, "bg")) reason = "backgrounded with a trailing &";
  if (reason) break;
}
if (reason) { process.stdout.write(reason); process.exit(2); }
'
reason=$(printf '%s' "$command_text" | node -e "$GUARD_JS" "$background" 2>/dev/null) || rc=$?
if [[ "${rc:-0}" -eq 2 && -n "$reason" ]]; then
  printf '[Codex Launch Guard] Blocked: a codex-exec.js start/resume launch is %s.\n' "$reason" >&2
  cat >&2 <<'EOF'
Launch it with Bash(run_in_background: true) and redirect nothing — stderr left attached is the
task panel's live 60 s progress view, and stdout stays the one control record the task ends with.
Then arm the persistent Monitor watcher on the adapter's own progress.json (state changes only).
Contract: skills/codex-code-review/references/codex-transport.md § Progress, steps 1–3.
EOF
  exit 2
fi

exit 0
