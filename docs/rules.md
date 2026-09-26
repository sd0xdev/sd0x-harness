# Rules Reference

Instructions reach the model in three ways — two for the rule files, and one for the contracts that hold the detailed procedures ([README § Why v5](../README.md#why-v5)):

| Load mode | When it loads |
|-----------|---------------|
| Launch core | Every session: `CLAUDE.md` `@`-imports it |
| Path-scoped | When Claude reads or edits a file matching the rule's `paths:` frontmatter |
| Contract | When its situation arises and the file is Read — `CLAUDE.md` § Contract Triggers is the index; a failed Read stops the action the contract governs |

## Plugin-managed rules

| Rule | Load mode | What it holds | Detailed contract |
|------|-----------|---------------|-------------------|
| `discretion` | Launch core | Instruction tiers: Anchor / Default / Guidance and the Anchor Register (single authority) | `skills/push-ci/references/authorization-contract.md` § Efficacy Boundary |
| `auto-loop` | Launch core | Terminal completion invariant, tiers, gate sentinels, review dispatch | `skills/codex-code-review/references/review-common.md`, `loop-diagnostics.md` |
| `codex-invocation` | Launch core | Codex must independently research, never feed conclusions | `skills/codex-code-review/references/codex-invocation-contract.md` |
| `scope-discipline` | Launch core | Scope axis orthogonal to severity; out-of-scope pre-existing defects get a recorded exit | `skills/codex-code-review/references/scope-contract.md` |
| `git-workflow` | Launch core | Branch naming, commit conventions, forbidden git operations and the push-safety core | `skills/push-ci/references/authorization-contract.md` |
| `security` | Launch core | OWASP Top 10 checklist (Anchor, whole file) | — |
| `logging` | Launch core | Structured JSON, no secrets | — |
| `self-improvement` | Launch core | Corrected → record lesson → prevent recurrence | — |
| `context-management` | Launch core | Data-driven context monitoring (measure before deciding) | — |
| `testing` | Path-scoped | Unit/Integration/E2E isolation and test conventions | `skills/test-review/references/testing-contract.md` |
| `docs-writing` | Path-scoped | Tables > paragraphs, Mermaid > text, comment-block thresholds | `skills/doc-review/references/documentation-contract.md` |
| `docs-numbering` | Path-scoped | Document prefix convention (0-feasibility, 2-spec) and the size signal | `skills/doc-review/references/documentation-contract.md` |
| `override-contract` | Path-scoped | Resolution order and heading tables for the three override files | — (this rule is the contract) |

## User-owned overrides

| Rule | Load mode | What it holds |
|------|-----------|---------------|
| `auto-loop-project` | Launch core | Project-specific auto-loop overrides (user-owned, not plugin-managed) |
| `git-workflow-project` | Launch core | Project-specific git settings: branch naming, commit format, protected-branch additions, offer mode, deploy workflow (user-owned) |
| `testing-project` | Path-scoped | Project-specific testing overrides (user-owned) |

Overrides customize Default- and Guidance-tier behavior only and resolve Anchor-first; a plugin upgrade never rewrites them (`rules/override-contract.md`).

> **Customization**: Edit `auto-loop-project.md` to override auto-loop behavior per project. Plugin updates won't conflict — see [Rule Override Pattern](../docs/features/rule-override-pattern/2-tech-spec.md).
