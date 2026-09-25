# 抽出測試契約與文件契約（movement r2）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-25
> **Status**: Completed
> **Note**: tech spec task 1 與 task 2 中測試與文件的部分；接續 r1（review 平面）與 r4（override contract）
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

r1 只搬 review 平面，把測試與文件契約留給本票（[r1 ticket](./2026-08-29-extract-on-demand-contracts-r1.md) 的拆票理由）。§ 3.2 的觸發表把兩者稱為 testing contract 與 documentation contract。本票落地後，tech spec § 3.4 的目的地表已同步為實際的範圍：證據優先序、例外閘門與上限、Adequacy Gate sentinel、pre-PR 執行搬到 `skills/test-review/references/testing-contract.md`；切分程序、功能性文件豁免的理由、註解區塊的計數與豁免搬到 `skills/doc-review/references/documentation-contract.md`。測試金字塔、conventions（含命名）、三條 Anchor 列，以及文件的編號表、行數預算核心與註解門檻，都留在常駐規則。

三條規則被引用得很廣：`testing.md` 約 68 個檔、`docs-numbering.md` 約 68 個、`docs-writing.md` 約 34 個。被引用的 `##` 標題全部保留，內容改為精簡核心與讀取指標，所以既有的 `§` 引用都不會失效。

## Requirements

- 新增 `skills/test-review/references/testing-contract.md`：證據優先序表、三道例外閘門、例外上限表、Adequacy Gate sentinel 表、pre-PR 執行指令
- 新增 `skills/doc-review/references/documentation-contract.md`：行數預算的理由、切分程序（資料夾形狀、三個 parser 限制、雙向修連結、在主導段落切分）、功能性文件豁免表、註解區塊的計數方式、豁免清單與 checker 接線
- `rules/testing.md` 保留 `## Test Pyramid`（`testing-project.md` 的區段替換目標）、`## Conventions`（含 Guards，被引用 24 次以上）、`## Evidence Model` 精簡核心與三條 Anchor 列（Register #3），以及 `## Project Customization`
- `rules/docs-numbering.md` 的 `## Size Limit` 保留範圍、判斷原則、prune/merge/split 次序與表格、紀錄豁免、行數閾值與 `wc -l`；`rules/docs-writing.md` 的 `## Code Comments` 保留門檻表、指標格式與 move-or-dedupe（兩條 Default 例外）
- 每個精簡核心都寫明契約路徑（在外掛的 skill `references/` 內），以及讀不到時停止該項工作；`/test-review` 與 `/doc-review` 第一步讀自己的契約
- 搬移而非複製：搬走的文字只存在於契約；Anchor 列只留在常駐核心，契約只指向它
- `docs/features/pre-pr-audit/2-tech-spec.md` 與 `/pre-pr-audit` 的 Hard-Fail Overrides 表：指向例外規則的五列改指新位置；`/pre-pr-audit` 在四項例外檢查前讀取測試契約，讀不到就停止這些檢查
- `/test-review` 不再複述例外閘門、上限與 sentinel 意義，改指契約；保留它自己的 raw → public sentinel 對應

## Scope

| Scope | Description |
| ----- | ----------- |
| In | 兩個新契約檔；三條規則的精簡核心；兩個 skill 的第一步讀取；`pre-pr-audit` tech spec 的指標；相關測試 |
| Out | FR-6 的拒絕示範（契約移除後 workflow 在動手前拒絕）——需要隔離 repo 與 headless `claude -p` 的共用 probe，一次涵蓋 r1、r2、r4 的全部契約，另立 [FR-6 probe 票](./2026-09-25-fr6-contract-refusal-probe.md)；`## Conventions` 的搬移（被大量引用，且是寫測試時的核心規則，留在常駐層）；推送授權契約（r3，Anchor 級，需核准）；常駐核心全面改寫與觸發表（task 3）；hook `procedure_hint`（task 5） |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/test-review/references/testing-contract.md` | Create | 測試契約 |
| `skills/doc-review/references/documentation-contract.md` | Create | 文件契約 |
| `rules/testing.md` · `rules/docs-numbering.md` · `rules/docs-writing.md` | Modify | 精簡核心與讀取指標 |
| `skills/test-review/SKILL.md` · `skills/doc-review/SKILL.md` | Modify | 第一步讀取契約，讀不到就停止；`/test-review` Step 5–6 改指契約 |
| `scripts/lib/fc-parsers/test-review.js` | Modify | 註解中的 sentinel 出處改指契約 |
| `docs/features/pre-pr-audit/2-tech-spec.md` · `skills/pre-pr-audit/SKILL.md` | Modify | 例外規則的指標改指新位置；`/pre-pr-audit` 先讀測試契約 |
| `test/skills/pre-pr-audit.test.js` | Modify | 五列出處與先讀契約 |
| `test/rules/testing-docs-contracts.test.js` | Create | 搬移而非複製、Anchor 列留在常駐層、讀取指標與停止條件、skill 第一步讀取 |
| `test/rules/contract-routing.test.js` | Modify | 登記兩個契約與其啟用來源 |
| `test/skills/testing-rules.test.js` · `test/rules/review-loop-resilience.test.js` | Modify | 搬走的內容改在契約檢查 |

## Acceptance Criteria

- [x] 兩個契約檔存在，且在 `contract-routing.test.js` 登記標題與啟用來源（規則與 skill 都指向它）
- [x] 搬走的文字只存在於契約，三條規則都不再複述：契約中每一行 40 字元以上的內容（空白正規化後比對，含 code fence 內的行）都不出現在它離開的規則裡；短於 40 字元的行（標題、短語）不列入比對
- [x] 三條 Anchor 列（security、data-integrity、regression 不得例外）在 `rules/testing.md` 各出現一次，兩個契約與兩條文件規則都不複述
- [x] 三條規則的精簡核心都寫明契約路徑與讀不到時的停止條件；兩個 skill 第一步讀取契約
- [x] 三條規則原有的 `##` 標題全部保留，順序不變（repo 以標題名稱 `§` 引用這些段落）
- [x] `git diff` 不含任何 `*-project.md`（`override-contract.test.js` 釘住三個檔的位元組摘要）
- [x] 程式碼閘門：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS
- [x] 文件閘門：`/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | 引用盤點：被引用的標題全數保留 |
| Development | Done | 三條規則合計約減少 5,800 字元 |
| Testing | Done | 全套測試通過；`/codex-test-review` ✅ Tests sufficient；Adequacy Gate ✅ Adequate |
| Acceptance | Done | 程式碼閘門、Adequacy Gate 與文件閘門皆通過 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.2、§ 3.4、task 1、task 2
- 前一張：[r1](./2026-08-29-extract-on-demand-contracts-r1.md)、[r4](./2026-09-25-override-contract-r4.md)
