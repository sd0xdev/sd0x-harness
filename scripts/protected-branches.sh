#!/usr/bin/env bash
# protected-branches.sh - Is a branch protected? Default set ∪ the project's ## Protected Branches.
#
# Usage: protected-branches.sh [--root <repo-root>] [--] <branch>
#        protected-branches.sh [--root <repo-root>] --list
# Exit:  0 protected · 1 not protected · 2 unknown (override unreadable/unparseable, or no repo
#        root) — every caller reads 2 as protected · 64 usage.
# Contract: docs/features/git-autonomy/2-tech-spec.md § 3.3. The function block below is
# byte-identical to the one in scripts/pre-push-gate.sh; test/scripts/protected-branches.test.js
# compares the two.
set -u

# BEGIN protected-set — keep byte-identical with scripts/pre-push-gate.sh
# The default set is fixed; a project may only ADD names or `<prefix>/*` patterns under
# `## Protected Branches` in the first EXISTING of .claude/rules/git-workflow-project.md and
# rules/git-workflow-project.md. A selected file that cannot be read or parsed answers 2 with no
# fallback to the other path — falling back could drop its additions. HTML comments are ignored;
# any other line in the section that is not `- <name>` or `- <prefix>/*` (a `- !main` removal
# attempt included) is a parse error. Pure bash 3.2: no awk, no associative arrays.
sd0x_protected_patterns() {
  local root="$1" f="" cand line in_c=0 in_sec=0 seen=0 name
  [ -n "$root" ] || return 2
  printf '%s\n' main master develop 'release/*'
  for cand in "$root/.claude/rules/git-workflow-project.md" "$root/rules/git-workflow-project.md"; do
    if [ -e "$cand" ] || [ -L "$cand" ]; then f="$cand"; break; fi
  done
  [ -n "$f" ] || return 0
  if [ ! -f "$f" ] || [ ! -r "$f" ]; then return 2; fi
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    if [ "$in_c" = 1 ]; then
      case "$line" in *'-->'*) in_c=0; line=${line#*-->} ;; *) continue ;; esac
    fi
    while :; do
      case "$line" in
        *'<!--'*)
          case "${line#*<!--}" in
            *'-->'*) line="${line%%<!--*}${line#*-->}" ;;
            *) line=${line%%<!--*}; in_c=1; break ;;
          esac ;;
        *) break ;;
      esac
    done
    if [[ "$line" =~ ^##[[:space:]] ]]; then
      if [[ "$line" =~ ^##[[:space:]]+Protected[[:space:]]+Branches[[:space:]]*$ ]]; then
        [ "$seen" = 0 ] || return 2
        seen=1; in_sec=1
      else
        in_sec=0
      fi
      continue
    fi
    [ "$in_sec" = 1 ] || continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^-[[:space:]]+([A-Za-z0-9_][A-Za-z0-9._/-]*)(/\*)?[[:space:]]*$ ]]; then
      name=${BASH_REMATCH[1]}
      if [ -n "${BASH_REMATCH[2]}" ]; then
        git check-ref-format --branch "$name/x" >/dev/null 2>&1 || return 2
        printf '%s/*\n' "$name"
      else
        git check-ref-format --branch "$name" >/dev/null 2>&1 || return 2
        printf '%s\n' "$name"
      fi
    else
      return 2
    fi
  done < "$f" || return 2
  # An HTML comment still open at EOF hides whatever followed it — refuse rather than read on.
  [ "$in_c" = 0 ] || return 2
  return 0
}
sd0x_protected_status() {
  local branch="$1" root="$2" pats p rc=0
  pats=$(sd0x_protected_patterns "$root") || rc=$?
  [ "$rc" = 0 ] || return 2
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    case "$p" in
      */\*) case "$branch" in "${p%/\*}"/*) return 0 ;; esac ;;
      *) [ "$branch" = "$p" ] && return 0 ;;
    esac
  done <<SD0X_PB_EOF
$pats
SD0X_PB_EOF
  return 1
}
# END protected-set

usage() { echo "usage: protected-branches.sh [--root <repo-root>] (--list | [--] <branch>)" >&2; exit 64; }
root="" list=0 branch="" have_branch=0
while [ $# -gt 0 ]; do
  case "$1" in
    --root) [ $# -ge 2 ] || usage; root="$2"; shift 2 ;;
    --list) list=1; shift ;;
    --) shift; [ $# -eq 1 ] || usage; branch="$1"; have_branch=1; shift ;;
    -*) usage ;;
    *) [ "$have_branch" = 0 ] || usage; branch="$1"; have_branch=1; shift ;;
  esac
done
if [ -z "$root" ]; then root=$(git rev-parse --show-toplevel 2>/dev/null) || root=""; fi
if [ "$list" = 1 ]; then
  [ "$have_branch" = 0 ] || usage
  rc=0; out=$(sd0x_protected_patterns "$root") || rc=$?
  [ "$rc" = 0 ] || exit 2
  printf '%s\n' "$out"; exit 0
fi
[ "$have_branch" = 1 ] && [ -n "$branch" ] || usage
rc=0; sd0x_protected_status "$branch" "$root" || rc=$?
exit "$rc"
