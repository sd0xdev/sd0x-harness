#!/bin/bash
# deploy-flow.sh — the executable half of /deploy-flow (git-autonomy R5). The skill owns every
# question; this script owns every git call, so each step's approval binds to exactly what runs.
# Contract: docs/features/git-autonomy/2-tech-spec.md § 3.2 (step grammar) and § 3.3 (/deploy-flow).
#
#   deploy-flow.sh parse   --root <repo>                  steps, one per line (TSV), then `mode\t<m>`
#   deploy-flow.sh candidates --root <repo> <prefix>/*    local branches a pattern may bind to
#   deploy-flow.sh resolve --root <repo> <branch>         the branch's current OID
#   deploy-flow.sh merge   --root <repo> <src> <tgt> <src-oid> <tgt-oid> <--no-ff|--ff-only>
#   deploy-flow.sh run-plan --root <repo> <path> [args…]  `head\t<oid>` and `blob\t<hash>` the run approval names
#   deploy-flow.sh run     --root <repo> --expect-head <oid> --expect-blob <hash> <path> [args…]
#                                                         only a declared step, only under execute, only at those values
#   deploy-flow.sh clean   --root <repo>                  exit 0 when the worktree is clean, 3 otherwise
#
# Exit: 0 ok · 2 parse/usage error · 3 refused (dirty tree, moved ref, undeclared step, print mode)
#       4 attribution guard rejected the message (nothing merged, or the merge commit is named)
#       5 merge conflict (aborted, nothing merged) · 6 read-back mismatch · other = the step's own

set -u
# Every git call reads the repository this invocation names, never one an inherited variable
# selects; ALLOW_AI_COAUTHOR never reaches the guard from the environment.
for _v in $(env | sed -n 's/^\(GIT_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$_v"; done
unset ALLOW_AI_COAUTHOR BASH_ENV ENV

die() { printf 'deploy-flow: %s\n' "$1" >&2; exit "${2:-2}"; }

[ "${1:-}" ] || die "usage: deploy-flow.sh <parse|candidates|resolve|merge|run-plan|run|clean> --root <repo> …"
CMD=$1; shift
[ "${1:-}" = --root ] && [ -n "${2:-}" ] || die "missing --root <repo>"
ROOT=$2; shift 2
ROOT=$(cd "$ROOT" 2>/dev/null && pwd -P) || die "unreadable root"
g() { git -C "$ROOT" "$@"; }

TOKEN_RE='^[A-Za-z0-9._/@:=+,-]+$'
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)

# The guard, the way /smart-commit resolves it: the operator's installed copy, then the project's own
# checkout (the plugin repository itself), then the plugin. A path relative to this script is used
# only when this script sits in the plugin's own tree — an installed copy lives in .claude/scripts/,
# where `../../../scripts` would name a directory outside the project.
guard_path() {
  local p cands=("$ROOT/.claude/scripts/commit-msg-guard.sh" "$ROOT/scripts/commit-msg-guard.sh")
  [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && cands+=("$CLAUDE_PLUGIN_ROOT/scripts/commit-msg-guard.sh")
  case "$HERE" in */skills/deploy-flow/scripts) cands+=("${HERE%/skills/deploy-flow/scripts}/scripts/commit-msg-guard.sh") ;; esac
  for p in "${cands[@]}"; do
    [ -r "$p" ] && [ -f "$p" ] && { printf '%s' "$p"; return 0; }
  done
  return 1
}

override_file() {
  local f
  for f in "$ROOT/.claude/rules/git-workflow-project.md" "$ROOT/rules/git-workflow-project.md"; do
    if [ -e "$f" ] || [ -L "$f" ]; then printf '%s' "$f"; return 0; fi
  done
  return 1
}

# Live section body: HTML comments removed (multi-line included), then the lines under `## <name>`
# up to the next `## `. A second heading with the same name is a parse error.
section() {
  awk -v want="$2" '
    BEGIN { inc = 0; ins = 0; n = 0 }
    {
      line = $0; out = ""
      while (length(line) > 0) {
        if (inc) { i = index(line, "-->"); if (i == 0) { line = "" } else { line = substr(line, i + 3); inc = 0 } }
        else { i = index(line, "<!--"); if (i == 0) { out = out line; line = "" } else { out = out substr(line, 1, i - 1); line = substr(line, i + 4); inc = 1 } }
      }
      if (out ~ /^##[ \t]/) {
        h = out; sub(/^##[ \t]+/, "", h); sub(/[ \t]+$/, "", h)
        if (h == want) { n++; ins = 1; next } else { ins = 0 }
      }
      if (ins) print out
    }
    END { if (n > 1) exit 3; if (inc) exit 4 }
  ' "$1"
}

# The whole worktree, untracked files included (ignored files are not work): a step approved against
# one tree must run against that tree, and a modified or added script is not the one that was declared.
require_clean() {
  local st
  st=$(g status --porcelain --untracked-files=all) || die "cannot read the worktree status" 3
  [ -z "$st" ] || { printf '%s\n' "$st" >&2; die "the worktree is not clean — commit or stash first; nothing was run" 3; }
}

valid_branch() { git check-ref-format --branch "$1" >/dev/null 2>&1; }
valid_ref_spec() { # concrete branch, or <prefix>/*
  case "$1" in
    */\*) valid_branch "${1%/\*}/x" ;;
    *\**) return 1 ;;
    *) valid_branch "$1" ;;
  esac
}

do_parse() {
  local f body mode rc line in_fence=0 seen_fence=0 out="" n=0
  if ! f=$(override_file); then printf 'mode\tprint\n'; return 0; fi
  [ -r "$f" ] || die "override unreadable: $f"
  body=$(section "$f" 'Run Steps'); rc=$?
  [ $rc -eq 0 ] || die "Run Steps: duplicate heading or unclosed comment"
  # Exactly one live value, or none (the default): `execute` followed by a stray line is not execute.
  local nvals; nvals=$(printf '%s\n' "$body" | awk 'NF' | wc -l | tr -d ' ')
  [ "$nvals" -le 1 ] || die "Run Steps: expected one value, found $nvals lines"
  mode=$(printf '%s\n' "$body" | awk 'NF { gsub(/^[ \t]+|[ \t]+$/, ""); print; exit }')
  [ -n "$mode" ] || mode=print
  case "$mode" in print|execute) ;; *) die "Run Steps: invalid value '$mode' (print|execute)" ;; esac
  body=$(section "$f" 'Deploy Workflow'); rc=$?
  [ $rc -eq 0 ] || die "Deploy Workflow: duplicate heading or unclosed comment"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '```'*) if [ $in_fence -eq 0 ]; then in_fence=1; seen_fence=1; else in_fence=0; fi; continue ;;
    esac
    [ $in_fence -eq 1 ] || { case "$line" in *[![:space:]]*) die "Deploy Workflow: text outside the fenced block: $line" ;; esac; continue; }
    case "$line" in ''|*[![:print:]]*) [ -z "$line" ] && continue; die "Deploy Workflow: non-printable line" ;; esac
    # Single spaces only: split and re-join must reproduce the line exactly.
    local -a t; read -r -a t <<< "$line"
    [ "$(IFS=' '; printf '%s' "${t[*]}")" = "$line" ] || die "Deploy Workflow: tokens must be separated by single spaces: $line"
    case "${t[0]}" in
      merge)
        { [ ${#t[@]} -eq 4 ] || [ ${#t[@]} -eq 5 ]; } && [ "${t[2]}" = '->' ] || die "Deploy Workflow: bad merge line: $line"
        valid_ref_spec "${t[1]}" && valid_ref_spec "${t[3]}" || die "Deploy Workflow: bad branch name or pattern: $line"
        local form=--no-ff
        if [ ${#t[@]} -eq 5 ]; then case "${t[4]}" in --no-ff|--ff-only) form=${t[4]} ;; *) die "Deploy Workflow: bad merge form: $line" ;; esac; fi
        out+=$(printf 'merge\t%s\t%s\t%s' "${t[1]}" "${t[3]}" "$form")$'\n'; n=$((n + 1)) ;;
      run)
        [ ${#t[@]} -ge 2 ] || die "Deploy Workflow: run needs a path: $line"
        local tok; for tok in "${t[@]:1}"; do [[ $tok =~ $TOKEN_RE ]] || die "Deploy Workflow: token outside ^[A-Za-z0-9._/@:=+,-]+\$: $tok"; done
        case "${t[1]}" in /*) die "Deploy Workflow: run path must be repo-relative: ${t[1]}" ;; esac
        # Every directory component is resolved physically; the file itself must not be a symlink,
        # so what runs is the file inside the repository the step names.
        local dir real
        dir=$(cd "$ROOT" 2>/dev/null && cd -- "$(dirname -- "${t[1]}")" 2>/dev/null && pwd -P) || die "Deploy Workflow: run path does not exist: ${t[1]}"
        real="$dir/$(basename -- "${t[1]}")"
        case "$real" in "$ROOT"/*) ;; *) die "Deploy Workflow: run path resolves outside the repository: ${t[1]}" ;; esac
        [ ! -L "$real" ] && [ -f "$real" ] || die "Deploy Workflow: run path is not a regular file: ${t[1]}"
        # Tracked, so the clean-tree check can see a change to it: an ignored or untracked script
        # could be replaced without the worktree ever reading dirty.
        g ls-files --error-unmatch -- "${t[1]}" >/dev/null 2>&1 || die "Deploy Workflow: run path is not tracked by git: ${t[1]}"
        out+=$(IFS=$'\t'; printf 'run\t%s' "${t[*]:1}")$'\n'; n=$((n + 1)) ;;
      *) die "Deploy Workflow: unknown step: $line" ;;
    esac
  done <<< "$body"
  [ $in_fence -eq 0 ] || die "Deploy Workflow: unclosed fenced block"
  printf '%s' "$out"
  printf 'mode\t%s\n' "$mode"
}

do_candidates() {
  local pat=${1:?pattern} prefix
  case "$pat" in */\*) prefix=${pat%\*} ;; *) die "not a pattern: $pat" ;; esac
  valid_ref_spec "$pat" || die "bad pattern: $pat"
  g for-each-ref --format='%(refname:short)' -- "refs/heads/$prefix" | while IFS= read -r b; do
    case "$b" in "$prefix"*) valid_branch "$b" && printf '%s\n' "$b" ;; esac
  done
}

do_resolve() {
  local b=${1:?branch}
  valid_branch "$b" || die "not a branch name: $b"
  g rev-parse -q --verify "refs/heads/$b^{commit}" || die "no such local branch: $b" 3
}

# The declared-step check: the pair (and form) must be a declared merge, a pattern binding only to
# a concrete branch that matches it.
declared_merge() {
  local src=$1 tgt=$2 form=$3 kind a b f
  while IFS=$'\t' read -r kind a b f; do
    [ "$kind" = merge ] || continue
    [ "$f" = "$form" ] || continue
    matches "$src" "$a" && matches "$tgt" "$b" && return 0
  done < <(do_parse)
  return 1
}
matches() { case "$2" in */\*) case "$1" in "${2%\*}"?*) return 0 ;; esac; return 1 ;; *) [ "$1" = "$2" ] ;; esac; }

do_merge() {
  [ $# -eq 5 ] || die "usage: merge --root <repo> <src> <tgt> <src-oid> <tgt-oid> <form>"
  local src=$1 tgt=$2 soid=$3 toid=$4 form=$5 guard="" msgf="" now_s now_t parents body rc
  valid_branch "$src" && valid_branch "$tgt" || die "not a branch name"
  case "$form" in --no-ff|--ff-only) ;; *) die "bad form: $form" ;; esac
  declared_merge "$src" "$tgt" "$form" || die "not a declared step: merge $src -> $tgt $form" 3
  require_clean
  now_s=$(do_resolve "$src") && now_t=$(do_resolve "$tgt") || die "a branch disappeared" 3
  [ "$now_s" = "$soid" ] && [ "$now_t" = "$toid" ] || die "a branch moved after approval ($src $now_s, $tgt $now_t) — nothing merged" 3
  # The guard is resolved, and the fixed message checked, on the tree the step was approved from —
  # before switching, so a target branch cannot supply its own copy of the guard.
  if [ "$form" = --no-ff ]; then
    local src_guard; src_guard=$(guard_path) || die "commit-msg-guard.sh not found — run /install-scripts" 3
    # A private copy: both checks run these bytes even when the switch replaces a tracked copy.
    guard=$(mktemp) || die "mktemp failed" 3
    cat -- "$src_guard" > "$guard" || { rm -f "$guard"; die "cannot copy the guard" 3; }
    trap "rm -f -- $(printf '%q' "$guard")" EXIT  # expanded now: the local is gone when the trap runs
    msgf=$(mktemp) || die "mktemp failed" 3
    printf "Merge branch '%s' into %s\n" "$src" "$tgt" > "$msgf"
    /bin/bash -p -- "$guard" "$msgf" >/dev/null 2>&1; rc=$?
    [ $rc -eq 0 ] || { rm -f "$msgf"; die "attribution guard refused the merge message (exit $rc) — nothing merged" 4; }
  fi
  g switch -q -- "$tgt" || { rm -f "${msgf:-}"; die "cannot switch to $tgt" 3; }
  [ "$(g rev-parse HEAD)" = "$toid" ] || { rm -f "${msgf:-}"; die "HEAD is not the approved target OID" 3; }
  if [ "$form" = --ff-only ]; then
    GIT_MERGE_AUTOEDIT=no g merge -q --ff-only "$soid" || die "fast-forward refused — nothing merged" 5
    [ "$(g rev-parse HEAD)" = "$soid" ] && g merge-base --is-ancestor "$toid" HEAD || die "fast-forward read-back mismatch" 6
    printf 'merged\t%s\t%s\t%s\n' "$tgt" "$(g rev-parse HEAD)" ff-only; return 0
  fi
  if ! GIT_MERGE_AUTOEDIT=no g merge -q --no-ff --no-edit -F "$msgf" "$soid"; then
    rm -f "$msgf"; g merge --abort >/dev/null 2>&1
    die "merge conflict — aborted, nothing merged" 5
  fi
  rm -f "$msgf"
  local new; new=$(g rev-parse HEAD)
  parents=$(GIT_GRAFT_FILE=/dev/null git -C "$ROOT" -c advice.graftFileDeprecated=false --no-replace-objects log -1 --format=%P "$new")
  [ "$parents" = "$toid $soid" ] || die "merge commit $new has parents '$parents', expected '$toid $soid'" 6
  msgf=$(mktemp) || die "mktemp failed" 3
  GIT_GRAFT_FILE=/dev/null git -C "$ROOT" -c advice.graftFileDeprecated=false --no-replace-objects log -1 --format=%B "$new" > "$msgf"
  /bin/bash -p -- "$guard" "$msgf" >/dev/null 2>&1; rc=$?
  rm -f "$msgf"
  [ $rc -eq 0 ] || die "merge commit $new carries a message the attribution guard rejects (exit $rc) — stop; nothing is amended" 4
  printf 'merged\t%s\t%s\t%s\n' "$tgt" "$new" no-ff
}

# The values a run approval binds to: the commit the declaration was read from and the script's
# own content. A switch or a new commit between approval and execution changes one of them.
script_blob() { g hash-object --no-filters -- "$1" 2>/dev/null || die "cannot hash $1" 3; }

do_run_plan() {
  [ $# -ge 1 ] || die "usage: run-plan --root <repo> <path> [args…]"
  declared_run "$@" || die "not a declared step: run $*" 3
  require_clean
  printf 'head\t%s\nblob\t%s\n' "$(g rev-parse HEAD)" "$(script_blob "$1")"
}

declared_run() {
  local want kind rest found=1
  want=$(IFS=$'\t'; printf '%s' "$*")
  while IFS=$'\t' read -r kind rest; do
    [ "$kind" = run ] && [ "$rest" = "$want" ] && found=0
  done < <(do_parse)
  return $found
}

do_run() {
  local eh="" eb=""
  while :; do
    case "${1:-}" in
      --expect-head) eh=${2:-}; shift 2 ;;
      --expect-blob) eb=${2:-}; shift 2 ;;
      *) break ;;
    esac
  done
  [ -n "$eh" ] && [ -n "$eb" ] || die "run needs --expect-head and --expect-blob from run-plan — the approval must name them"
  [ $# -ge 1 ] || die "usage: run --root <repo> --expect-head <oid> --expect-blob <hash> <path> [args…]"
  local want kind rest mode=print found=0
  want=$(IFS=$'\t'; printf '%s' "$*")
  while IFS=$'\t' read -r kind rest; do
    case "$kind" in
      mode) mode=$rest ;;
      run) [ "$rest" = "$want" ] && found=1 ;;
    esac
  done < <(do_parse)
  [ $found -eq 1 ] || die "not a declared step: run $*" 3
  [ "$mode" = execute ] || die "Run Steps is print — this step is printed for you, never run" 3
  require_clean
  [ "$(g rev-parse HEAD)" = "$eh" ] || die "HEAD moved after approval — nothing was run" 3
  [ "$(script_blob "$1")" = "$eb" ] || die "the script changed after approval — nothing was run" 3
  local path=$1; shift
  (cd "$ROOT" && exec "./$path" "$@")
}

case "$CMD" in
  parse) do_parse ;;
  candidates) do_candidates "$@" ;;
  resolve) do_resolve "$@" ;;
  merge) do_merge "$@" ;;
  run) do_run "$@" ;;
  run-plan) do_run_plan "$@" ;;
  clean) require_clean ;;
  *) die "unknown subcommand: $CMD" ;;
esac
