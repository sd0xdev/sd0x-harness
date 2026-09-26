# 抽出推送授權契約（movement r3）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-25
> **Status**: Completed
> **Note**: tech spec task 1 與 task 2 的推送授權部分；Anchor 級搬移，常駐精簡文字已由 maintainer 於 2026-09-25 核准（INV-006）；在 stack 分支 `feat/rules-residency-v5-kernel` 上進行
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

Tech spec § 3.4 把推送授權拓撲（`git-workflow.md` § Push safety 那一行 7,493 字元、`discretion.md` § Efficacy Boundary 的敘述）與 § Proactive Offer / Goal mode 程序搬到 `skills/push-ci/references/authorization-contract.md`，由每個會動 git 的 skill 載入。三段都是 Anchor Register #4 的內容或引用它，所以搬移本身是 Anchor 級變更：maintainer 於 2026-09-25 核准搬移，並核准三段常駐精簡文字。

## Requirements

- 三段原文**逐字**搬到 `skills/push-ci/references/authorization-contract.md`；既有的 byte pin 改為驗證契約中的文字，以此證明逐字搬移
- 三個原標題保留在常駐層（全 repo 以 `§` 引用它們），內容換成核准過的精簡核心：各自寫明先讀契約、讀不到時停止
- `/push-ci`、`/smart-commit`、`/epic-merge`、`/gh-stack`、`/deploy-flow` 第一步讀取契約，讀不到就停止各自的動作
- 三段精簡核心以等值 pin 釘住；契約登記進 routing registry；三個常駐指標加入 `contract-read-failure.test.js`
- 不改任何授權範圍：Anchor Register #4 的列舉清單、各 skill 的核准步驟與可執行的指令都不變——唯一的例外是文件審查找到的 `/epic-merge` 既有缺陷修正：`--cleanup` 在 `--keep-backup-tags` 下略過 `git tag -d`（讓旗標做到它原本承諾的事，沒有新增任何 git 或 `gh` 指令形式）

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `/epic-merge` `--keep-backup-tags` 的既有缺陷修正（審查中找到，見 Related Files）；新契約檔；`rules/git-workflow.md` § Push safety 與 § Proactive Offer、`rules/discretion.md` § Efficacy Boundary 的精簡核心；五個 git skill 的第一步讀取；相關測試與兩個 skill 的 digest |
| Out | Anchor Register #4 本身的文字；常駐核心全面改寫與觸發表（task 3）；雙預算測試（task 4） |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `skills/push-ci/references/authorization-contract.md` | Create | 三段原文逐字搬入，加上載入條件與 tier 說明 |
| `rules/git-workflow.md` · `rules/discretion.md` | Modify | 三段換成核准的精簡核心 |
| `skills/push-ci/SKILL.md` · `skills/smart-commit/SKILL.md` · `skills/epic-merge/SKILL.md` · `skills/gh-stack/SKILL.md` · `skills/deploy-flow/SKILL.md` | Modify | 第一步讀取契約 |
| `test/rules/discretion-tiers.test.js` | Modify | byte pin 改驗證契約；精簡核心的等值 pin 與負控制 |
| `test/rules/goal-mode.test.js` | Modify | Goal mode 條款改在契約檢查 |
| `test/rules/contract-routing.test.js` · `test/rules/contract-read-failure.test.js` | Modify | 登記契約；釘住三個常駐指標的停止條件 |
| `test/rules/push-authorization-contract.test.js` | Create | 五個 git skill 的第一個指示整句釘住（讀取契約、讀不到就停止）；§ Proactive Offer 逐字搬移的 digest |
| `docs/features/rules-residency/review-log-fr6-probe.md` | Modify | § r3：十四次 headless probe 的結果與輸出；probe script 擴充 r3 案例，並把未追蹤檔案一併複製到外掛副本 |
| `test/skills/push-ci.test.js` · `test/skills/epic-merge.test.js` | Modify | 更新 SKILL_DIGEST（第一步讀取；`/epic-merge` 另含下一列的修正）；`--keep-backup-tags` 的 regression test |
| `skills/epic-merge/SKILL.md` § Post-Merge Cleanup | Modify | 文件審查找到的既有缺陷：`--keep-backup-tags` 承諾保留 backup tag，`--cleanup` 卻無條件刪除；改為依旗標略過 `git tag -d`（檔案在本票 baseline 內，且屬復原資料遺失，依 scope 規則為應修） |

## Acceptance Criteria

- [x] 三段原文在契約中逐字保留：Push safety 那一行與 Efficacy Boundary 整段的 byte pin 在契約上通過，Goal mode 各條款在契約上通過
- [x] 三段常駐精簡核心與核准文字一致（等值 pin），且各有先讀契約與讀不到時的停止條件
- [x] 五個 git skill 第一步讀取契約，讀不到就停止；契約在 routing registry 中登記這五個 skill 與兩條規則為啟用來源
- [x] Anchor Register #4 的列舉清單與各 skill 的指令、核准步驟不變（destructive-git validator 與兩個 skill digest 的審閱），`/epic-merge` 的 `--keep-backup-tags` 修正除外（regression test 兩個方向）
- [x] FR-6 probe（tech spec § 6）：兩個 ad-hoc 觸發與五個 git skill 各跑「契約存在」與「契約移除」兩個方向；移除時全部沒有任何會改動狀態的 git 或 `gh` 動作（`git status`、`git log` 這類唯讀查詢不算），並回報讀取失敗；每次 session 的工具呼叫記錄與結果記在 `review-log-fr6-probe.md` § r3
- [x] `git diff` 不含任何 `*-project.md`
- [x] 程式碼閘門（`thorough`）：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS
- [x] 文件閘門：`/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | maintainer 核准三段常駐精簡文字（2026-09-25）；程式碼審查指出 Push safety 第一句漏了 `/deploy-flow` 在 `Run Steps: execute` 下的宣告腳本路徑，同日重新核准補上這條路徑的版本；文件審查再指出「改寫歷史的 push 需要證實未共用」說過頭（原文只要求三個 push workflow 問，`/deploy-flow` 宣告腳本不受檢查），同日再核准限定範圍並寫明該風險的版本 |
| Development | Done | 常駐字元 98,817 → 84,313（`instruction-budget.js`，空 home） |
| Testing | Done | 全套測試通過；`/codex-test-review` ✅ Tests sufficient；Adequacy Gate ✅ Adequate；FR-6 probe 十四次 session（§ r3） |
| Acceptance | Done | 程式碼閘門（thorough）、Adequacy Gate 與文件閘門（六個批次）皆通過 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.2、§ 3.4、§ 7 開放問題 1
- 前一張：[r2](./2026-09-25-testing-docs-contracts-r2.md)、[r4](./2026-09-25-override-contract-r4.md)
