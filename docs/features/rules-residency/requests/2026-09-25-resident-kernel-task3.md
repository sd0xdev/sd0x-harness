# 精簡常駐核心、雙預算與 digest pin（tasks 3、4、6）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-25
> **Status**: Completed
> **Note**: tech spec task 3、4、6，一個審查單位；在 stacked 分支 `feat/rules-residency-v5-kernel` 上開發，task 8b 落地前不合併
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

r1–r4 把細節搬到 on-demand contract 之後，渲染後的全新安裝仍有約 58,000 字元的外掛常駐文字，目標是 50,000 以內（requirements § 9，2026-09-25 維護者決定）。tech spec § 3.2 列出常駐核心應有的內容：Anchor 與分級、auto-loop 核心、git/security Anchor、Codex 獨立研究核心、scope guard，以及一張情境觸發表。task 4 要讓預算與清單由測試守住，task 6 要把核心改用 digest pin，並留下 § 3.6 對抗實驗的最小重現。

## Requirements

- **task 3 — 精簡核心**
  - `fix-all-issues.md` 併入 `auto-loop.md` § Fix Obligation（精簡核心）與 `scope-contract.md` § Fix Obligation（完整內容逐字搬入）；刪除沒有使用者的 `framework.md`；`/install-rules` 的 retired 清單與 `/claude-health` 的 `RETIRED` 分類處理已安裝的副本
  - `auto-loop.md` 的 § Review Dispatch、§ Stall Detection and Diagnosis、§ Sub-Threshold Findings、§ Gate Sentinels、§ Enforcement 精簡成核心與讀取指標；`reason=` 標籤規則移到 `review-common.md` § Degradation Matrix；新增「讀不到 `review-common.md` 就不派 fallback、不輪替」的停止條款
  - 範本與本 repo 的 `CLAUDE.md` 加上 § Contract Triggers：八列情境對應 contract，外加一段 placement 規則
  - 本 repo 的 `CLAUDE.md` 不再 `@` import 任何 path-scoped 規則（`testing.md`、`testing-project.md`、`docs-writing.md`、`docs-numbering.md`），改以純文字列出並說明何時讀取
  - 其餘常駐規則只精簡 Default 內容；Anchor 文字逐字保留（INV-001），不搬移任何 Anchor
  - canary 暫時條款（task 8a）留在本 repo 的 `CLAUDE.md`，在 manifest 中標為暫時，由 task 8c 移除
  - 觸發表的 `skills/…` 路徑只存在於外掛安裝目錄：`namespace-hint` SessionStart hook 印出 `Plugin root:`（matcher 改為 `startup|clear|compact`），範本說明路徑以此解析，並給出找不到該行時的定位方式（code review 發現）
  - 已安裝的退役規則副本不在外掛 `rules/` 內，`/install-rules` 的列舉碰不到：新增每次執行都跑的 Phase 2.5 retired sweep，`/claude-health` 的盤點表加上退役清單（code review 發現）
- **task 4 — 雙預算與 manifest**
  - `test/rules/residency-budget.test.js`：以 `/project-setup` 的演算法渲染每一個生態系的範本，連同全部 `rules/*.md` 組成全新安裝，經 `instruction-budget.js` 量測；外掛常駐文字在最差的生態系下 ≤ 50,000 字元且 ≤ 600 行，使用者擁有的 `*-project.md` 只回報、不計入
  - `docs/features/rules-residency/residency-manifest.json`：每個常駐區塊的擁有者、分級、常駐理由、細節所在、機械載體；測試確認清單與磁碟一致、引用的路徑都存在
- **task 6 — digest pin 與重現**
  - `test/rules/kernel-digests.test.js`：每個外掛常駐規則的前言與每個 `##` 區段、整份範本、本 repo 的 § Contract Triggers，各一個 SHA-256 pin，以原始位元組計算
  - 兩個重現測試：換句話說加誘餌（片語檢查通過、digest 抓到）、fence 內等長修改（大小與 live-text 檢查通過、digest 抓到）
- 不修改任何 `*-project.md`（INV-002）

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `rules/*.md`（八個常駐規則與 `discretion.md`）；`CLAUDE.template.md`、`CLAUDE.md`；`skills/codex-code-review/references/`（`review-common.md`、`scope-contract.md`、`loop-diagnostics.md`）；規則清單與數量（`/project-setup`、`/claude-health`、`/install-rules`、README、`docs/rules.md`）；manifest 與相關測試 |
| Out | 任何 `*-project.md`；Anchor 的意思；機械 guard（`pre-push-gate.sh`、`commit-msg-guard.sh`）；canary cohort（task 8b/8c）；CHANGELOG（task 9） |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `rules/fix-all-issues.md` · `rules/framework.md` | Delete | 併入 / 無使用者 |
| `rules/auto-loop.md` | Modify | 精簡五個區段；新增 § Fix Obligation 核心與兩個讀取失敗停止條款 |
| `rules/discretion.md` · `scope-discipline.md` · `codex-invocation.md` · `context-management.md` · `self-improvement.md` · `git-workflow.md` | Modify | 只精簡 Default 內容；分級表 14 → 12 個檔 |
| `CLAUDE.template.md` · `CLAUDE.md` | Modify | § Contract Triggers 與 placement 規則；移除重複的 Auto-Loop 表格與流程範例；`CLAUDE.md` 移除 path-scoped `@` import |
| `skills/codex-code-review/references/review-common.md` · `scope-contract.md` · `loop-diagnostics.md` | Modify | 接收搬出的內容；`scope-contract.md` 新增 § Fix Obligation |
| `skills/install-rules/SKILL.md` · `skills/claude-health/SKILL.md` · `skills/project-setup/SKILL.md` · `README*.md`（六種語言）· `docs/rules.md` | Modify | retired 規則處理與數量（16 個規則、12 個外掛管理） |
| `docs/features/rules-residency/residency-manifest.json` | Create | 常駐區塊清單 |
| `scripts/namespace-hint.sh` · `hooks/hooks.json` · `docs/hooks.md` | Modify | 印出外掛根目錄；matcher 加上 `clear` |
| `test/rules/residency-budget.test.js` · `test/rules/kernel-digests.test.js` · `test/helpers/kernel-units.js` · `test/rules/rule-retirement.test.js` · `test/rules/kernel-moves.test.js` | Create | task 4、task 6、規則退役、搬移清單 |
| 既有測試（`auto-loop-behaviour`、`contract-read-failure`、`path-scoped-rules`、`override-contract`、`claude-md-coverage`、`testing-rules` 等） | Modify | 改指新位置，或登記搬移後的唯一載體 |

## Acceptance Criteria

- [x] 全新安裝在最差的生態系下，外掛常駐文字 ≤ 50,000 字元且 ≤ 600 行；使用者擁有的檔案另行回報（`residency-budget.test.js`，含負向對照）
- [x] manifest 列出每個常駐區塊一次，欄位完整、引用存在；canary 條款標為暫時、由 task 8c 移除（`residency-budget.test.js`，含負向對照）
- [x] 範本與 `CLAUDE.md` 都有八列 § Contract Triggers 與 placement 規則，每列指向存在的 contract，兩份清單一致（`residency-budget.test.js`，含負向對照；文字由 `kernel-digests.test.js` 釘住）
- [x] `fix-all-issues.md` 與 `framework.md` 已退役：沒有 `CLAUDE` 檔 import、分級表不再列出、`/install-rules` 與 `/claude-health` 會處理已安裝的副本（`rule-retirement.test.js`）
- [x] `CLAUDE.md` 與範本都沒有 `@` import 任何 path-scoped 規則（`path-scoped-rules.test.js`，含負向對照）
- [x] task 3 搬出的每條陳述（清單在 `kernel-moves.test.js`）都在唯一的目的地、且已離開原處；每個新的常駐讀取指標都寫明先 Read、讀不到就停止（靜態檢查：`contract-read-failure.test.js`；行為面沿用 FR-6 probe 的紀錄）
- [x] 常駐核心每個單元有 digest pin，兩個對抗重現測試通過（`kernel-digests.test.js`）
- [x] Anchor Register、`security.md`、`logging.md`，以及 `git-workflow.md` 的 § Exception、§ Prohibited、§ Push safety、§ Proactive Offer 與 HEAD 逐字相同；`git diff` 不含任何 `*-project.md`
- [x] 程式碼閘門：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS
- [x] 文件閘門：`/codex-review-doc` ✅ Mergeable

## Pruned, not moved

下列文字判定為已死或重複，直接刪除（其餘搬出的內容見 `kernel-moves.test.js` 的清單）：

| 原處 | 內容 | 為何是死文字 |
| ---- | ---- | ------------ |
| `CLAUDE.template.md` § Workflow | Feature / Bug fix 流程範例 | 與 `/feature-dev`、`/bug-fix` 的 SKILL.md 重複 |
| `CLAUDE.template.md` § Auto-Loop | 第二張 code/doc 路由表 | 與 § Required Checks 的表格相同 |
| `CLAUDE.template.md` § Required Checks | 「這張表約束的是終態」段落 | 與 `auto-loop.md` 終態不變量重複 |
| `CLAUDE.template.md` § Required Checks | 「`/precommit` 依 manifest 解析 lint / build / test」 | `/precommit` SKILL.md 的階段表已載明；範本保留「讀 `/precommit` 印出的階段」 |
| `CLAUDE.template.md` § Customization | 各 placeholder 的框架範例值 | 範例，不是規則；表格改為設定名稱與值 |
| `rules/auto-loop.md` § Gate Sentinels | 「hook 已不再解析這些 sentinel」的沿革說明 | 歷史，已記錄於 hook-lightweighting spec |
| `rules/discretion.md` 前言 | override 檔三個父檔精簡核心的位置列舉 | 與 `override-contract.md` 重複 |
| `rules/codex-invocation.md` | 各節的 `Details:` 指標、「沒有 contract 的審查不算審查」 | 由一句「各節對應 contract 的同名節」取代；後者為修辭 |

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec § 3.2、§ 3.5、§ 3.6 |
| Development | Done | 常駐外掛文字 58,477 → 49,614 字元（最差生態系 node-ts，代入代表性 placeholder 值，582 行） |
| Testing | Done | 全套 5,043 項測試通過；`/codex-test-review` ✅ Tests sufficient（4 輪） |
| Acceptance | Done | `/codex-review-fast`（thorough）✅ Ready：舊 thread 3 輪後依 R-a 輪替，新 thread 第 2、3 輪通過；`/precommit` ✅ PASS（一次因文件引用檢查失敗後重跑）；Adequacy Gate ✅ Adequate（第 2 輪）；`/codex-review-doc` ✅ Mergeable（5 個批次，3 個批次第 2 輪通過） |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.2、§ 3.5、§ 3.6、task 3、4、6
- Intent: [intent-rules-residency.md](../intent-rules-residency.md) INV-001–INV-006
