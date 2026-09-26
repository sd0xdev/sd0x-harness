# Rules Reference

| Rule | Description |
|------|-------------|
| `auto-loop` | Fix -> re-review -> fix -> ... -> Pass (auto cycle) |
| `auto-loop-project` | Project-specific auto-loop overrides (user-owned, not plugin-managed) |
| `codex-invocation` | Codex must independently research, never feed conclusions |
| `discretion` | Instruction tiers: Anchor / Default / Guidance (single authority) |
| `scope-discipline` | Scope axis orthogonal to severity; out-of-scope pre-existing defects get a recorded exit |
| `self-improvement` | Corrected → record lesson → prevent recurrence |
| `testing` | Unit/Integration/E2E isolation |
| `security` | OWASP Top 10 checklist |
| `git-workflow` | Branch naming, commit conventions |
| `docs-writing` | Tables > paragraphs, Mermaid > text |
| `docs-numbering` | Document prefix convention (0-feasibility, 2-spec) |
| `logging` | Structured JSON, no secrets |
| `context-management` | Data-driven context monitoring (measure before deciding) |
| `testing-project` | Project-specific testing overrides (user-owned) |
| `git-workflow-project` | Project-specific git settings: branch naming, commit format, protected-branch additions, offer mode, deploy workflow (user-owned) |

> **Customization**: Edit `auto-loop-project.md` to override auto-loop behavior per project. Plugin updates won't conflict — see [Rule Override Pattern](../docs/features/rule-override-pattern/2-tech-spec.md).
