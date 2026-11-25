# Close Skills

Read when a request fits more than one skill, or when the user asks which skill to use. Suggest, never
redirect: give the one question that tells the group apart, then the names. Nothing here changes a skill's
description or who may invoke it.

| Asking for | Ask this first | Then |
|---|---|---|
| A review of code changes | A quick review of the uncommitted diff, one after lint and build, the whole branch, or a checklist for your own PR? | Quick → `/codex-review-fast` · with lint and build → `/codex-review` · whole branch → `/codex-review-branch` · checklist → `/pr-review` |
| A security check | The code, the packages it uses, or this machine? | Code → `/codex-security` · packages → `/dep-audit` · workstation → `/dev-security-audit` |
| A review of tests | Are the cases enough, which layers are covered, or how healthy is the whole suite over time? | Cases → `/codex-test-review` · layers → `/check-coverage` · suite and trend → `/test-health` |
| A document | Review it, shorten it, or bring it in line with the code? | Review → `/codex-review-doc` (a spec: `/review-spec`) · shorten → `/doc-refactor` · align → `/update-docs` |
| Cleanup of code | One finished change, or several targets? | One → `/simplify` · several → `/refactor` |
| Understanding code | A question, a path through the code, two independent readings, or an explanation of one piece? | Question → `/ask` · path → `/code-explore` · two readings → `/code-investigate` · one piece → `/codex-explain` |
| A problem | Is the cause known, unknown, or in a reported issue? | Known → `/bug-fix` · unknown → `/debug` · reported issue or review thread → `/issue-analyze` |
| Planning | The need, the options, the design, or one task to track? | Need → `/req-analyze` · options → `/feasibility-study` · design → `/tech-spec` · task → `/create-request` |

An alias reaches the same workflow as its parent, so either is right: `/codex-review-fast`,
`/codex-review` and `/codex-review-branch` → `codex-code-review` · `/codex-review-doc` → `doc-review` ·
`/codex-security` → `security-review` · `/codex-test-review` and `/codex-test-gen` → `test-review`.

No skill is right when the request can be answered or done directly, without the steps a skill adds (general
knowledge, a one-line edit); say so rather than suggesting one. A short question whose answer needs
repository evidence still has one. To see
how skills are listed here, and what that does and does not show: `/skill-health-check --discovery`.
