# Plugin Directory preflight checklist and README disclosure (task 10)

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see the tech spec.
> **Created**: 2026-10-03
> **Status**: Candidate Complete
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)

## Background

Anthropic's plugin directory validates a submission against a published pre-submission checklist
and runs a security scan that looks for undisclosed behaviour. Before a submission is considered,
this repository's standing against each check should be measured and written down, and the README
should say what the plugin runs, sends and fetches.

## Requirements

- `docs/features/claude-code-2-1-288-compat/checklist-directory.md`: every automated check, its
  result class, this repository's measured state with the command that measured it
- The over-limit file count and the files over 256 KiB are accepted holds — nothing is pruned
  to pass review
- README § Rules & Hooks, in all six languages: the review skills shell out to the Codex CLI, the
  git and CI skills reach GitHub through `gh`, research skills fetch web pages, and hooks download
  nothing

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `checklist-directory.md` (new), `README*.md` |
| Out | Submitting; pruning files; changing hooks |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `docs/features/claude-code-2-1-288-compat/checklist-directory.md` | New | Measured preflight |
| `README.md`, `README.{zh-TW,zh-CN,ja,ko,es}.md` | Modify | Disclosure paragraph |

## Acceptance Criteria

- [x] Each checklist row names the check, its result class and the measured value with its command
- [x] Holds are stated as accepted, with the reason, and no file is removed
- [x] All six READMEs carry the disclosure paragraph
- [x] `/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.4 Batch 3; claude.com pre-submission checklist |
| Development | Done | `checklist-directory.md` measured at 100fe3e, with a command beside every value. Holds accepted: 956 files, 3 non-image files over 256 KiB. `claude plugin validate --strict` warns on 8 unquoted hook commands, recorded as an out-of-scope follow-up |
| Testing | Done | Link check clean; `claude plugin validate skills` and `agents` pass |
| Acceptance | Done | `/codex-review-doc` ✅ Mergeable (3 rounds) |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4, § 5 task 10
- Source: claude.com/docs/plugins/pre-submission-checklist
