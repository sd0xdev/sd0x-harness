# 抽出 override resolution contract（r4）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-25
> **Status**: Completed
> **Note**: tech spec task 1 與 task 2 中 override contract 的部分；可行性研究 Q2-F
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

`auto-loop.md` § Override Contract、`testing.md` 與 `git-workflow.md` 的 § Project Customization 共約 8,000 字元，其中兩段常駐。這些文字只有在解讀、稽核或編輯使用者的 `*-project.md` 時才需要，但每個 session 都載入。可行性研究（[0-feasibility-study.md](../0-feasibility-study.md) § 7，Q2-F）決定：表格集中到一個 path-scoped 的 `rules/override-contract.md`，三個父檔案各留一段精簡核心和讀取指標。

## Requirements

- 新增 `rules/override-contract.md`，`paths: [".claude/rules/*-project.md"]`，承載解析順序、兩種 override 的區分，以及三個 override 檔的標題表格；它是這些內容唯一的正本
- 三個父檔案保留原本的標題（使用者檔案的連結指向這些標題，不能失效），內容改成精簡核心：Anchor 優先、已知標題的封閉清單、未知標題回 Default 並回報、不改使用者檔案，以及「先讀與本檔同目錄的 `override-contract.md`（安裝後是 `.claude/rules/override-contract.md`，外掛原始碼是 `rules/override-contract.md`），讀不到就不要編輯或稽核 override」
- `discretion.md` 的檔案分級表納入新檔；範本與本 repo 的 `CLAUDE.md` 以純文字列出新檔，不用 `@` import
- `/project-setup` 的固定規則表與 `/claude-health` 的規則清單納入新檔；`/install-rules` 以列舉 `*.md` 自動帶到新檔
- 既有測試改指新位置，保留原本每一項檢查；新檔登記進 `contract-routing.test.js`
- 不改任何 `*-project.md`（INV-002），不改任何 Anchor 的意思

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `rules/override-contract.md`（新增）；`rules/auto-loop.md`、`rules/testing.md`、`rules/git-workflow.md` 的 override 段落；`rules/discretion.md` 分級表；`CLAUDE.template.md` 與 `CLAUDE.md` 規則清單；`skills/project-setup/SKILL.md`、`skills/claude-health/SKILL.md`；相關測試 |
| Out | 其他 contract 的搬移（r2、r3）；常駐核心的全面改寫（task 3）；本 repo `CLAUDE.md` 移除 path-scoped `@` import（task 3） |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `rules/override-contract.md` | Create | 解析順序、兩種 override、三張標題表格 |
| `rules/auto-loop.md` · `rules/testing.md` · `rules/git-workflow.md` | Modify | override 段落改為精簡核心與讀取指標 |
| `rules/discretion.md` | Modify | 分級表 13 → 14 個檔 |
| `CLAUDE.template.md` · `CLAUDE.md` | Modify | 規則清單加上純文字條目 |
| `skills/project-setup/SKILL.md` · `skills/claude-health/SKILL.md` | Modify | 規則清單加上新檔；`/claude-health` S2 清單補上先前漏列的 `discretion.md`、`scope-discipline.md`，元件數改為 31 |
| `skills/project-setup/SKILL.md` · `README*.md`（六種語言）· `skills/codex-code-review/references/loop-diagnostics.md` | Modify | 規則數量改為從磁碟推導的值：15 個 managed、共 18 個、5 個 path-scoped；`discretion.md` 分級表 14 個檔 |
| `test/rules/override-contract.test.js` | Modify | 讀取點改指新檔；逐字基準值重新產生；新增精簡核心、新檔引言、單一一級標題、表格只在新檔，以及三個 `*-project.md` 位元組摘要（INV-002）的檢查 |
| `test/scripts/instruction-budget.test.js` | Modify | path-scoped 規則數改為從磁碟推導 |
| `test/skills/claude-health.test.js` | Modify | S2 規則清單改為與磁碟上的 managed 規則逐一比對 |
| `test/rules/discretion-tiers.test.js` · `test/rules/path-scoped-rules.test.js` · `test/rules/contract-routing.test.js` · `test/rules/review-loop-resilience.test.js` · `test/rules/goal-mode.test.js` · `test/skills/codex-transport.test.js` | Modify | 納入新檔或改指新位置；`## Goal Commit` 設定列改在新檔檢查 |

## Acceptance Criteria

- [x] `rules/override-contract.md` 為 path-scoped，路徑為 `.claude/rules/*-project.md`，且沒有任何 `CLAUDE` 檔 `@` import 它
- [x] 三張標題表格與解析順序只存在於新檔；父檔案的精簡核心列出全部 16 個設定與 1 個區段替換標題
- [x] 三個父檔案的精簡核心都寫明讀取指標，以及讀不到時不要編輯或稽核 override
- [x] `override-contract.test.js` 保留原本的每一項檢查（解析順序、兩種區分、表格完整性、Anchor 優先、逐字基準值與突變測試），改指新位置
- [x] `git diff` 不含任何 `*-project.md`
- [x] 程式碼閘門：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS
- [x] 文件閘門：`/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | 可行性研究 Q2-F |
| Development | Done | |
| Testing | Done | 全套 4,988 項測試通過；`/codex-test-review` ✅ Tests sufficient；Adequacy Gate ✅ Adequate |
| Acceptance | Done | 程式碼閘門、Adequacy Gate 與文件閘門（四個批次）皆通過 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.4、task 1、task 2
- Feasibility study: [0-feasibility-study.md](../0-feasibility-study.md) § 7
