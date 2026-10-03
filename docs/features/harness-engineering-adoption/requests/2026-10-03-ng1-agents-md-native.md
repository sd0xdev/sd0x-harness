# NG-1 premise superseded: Claude Code reads AGENTS.md natively

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Point-in-time record; it supersedes one premise of this feature's tech spec without editing it.
> **Created**: 2026-10-03
> **Status**: Completed
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- the record whose premise this supersedes

## Background

[2-tech-spec.md](../2-tech-spec.md) § 1.3 Non-Goals row NG-1 rejected `AGENTS.md` as a primary agent entry point
because the official memory documentation then said Claude Code **only reads `CLAUDE.md`**, and kept
the `AGENTS.md` generator as a Codex-interop by-product. Claude Code 2.1.277 (2026-09) changed that:
in a project with no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`, it reads `AGENTS.md`
instead, and the `claude-md-and-agents-md` setting loads both.

## Decision

- NG-1's premise no longer holds from Claude Code 2.1.277 on. The generated `AGENTS.md` is a
  first-class instruction file that Claude may load, alone or beside `CLAUDE.md`.
- The tech spec row stays as written — it was true when written, and this record is what supersedes it.
- The remedy — a kernel whose Anchors are copied verbatim from the plugin's `rules/`, and `doctor`
  rows that report which instruction files load — is specified in
  [claude-code-2-1-288-compat](../../claude-code-2-1-288-compat/2-tech-spec.md) § 3.2–3.3.

## Acceptance Criteria

- [x] This record names NG-1 and Claude Code 2.1.277 and links the remedy's tech spec
- [x] `2-tech-spec.md` of this feature is unchanged
- [x] `/codex-review-doc` ✅ Mergeable

## References

- Superseded premise: [2-tech-spec.md](../2-tech-spec.md) § 1.3, NG-1
- Remedy: [claude-code-2-1-288-compat/2-tech-spec.md](../../claude-code-2-1-288-compat/2-tech-spec.md)
- Host behaviour: code.claude.com/docs/en/memory § AGENTS.md
