# review-state.js 讀不到 git override 時改為 fail-closed

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-25
> **Status**: Completed
> **Note**: 與常駐減量無關的獨立缺陷，依維護者 2026-09-25 決定在本分支一併修正（tech spec task 10）
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

`scripts/review-state.js` 的 `overrideSetting` 讀 `git-workflow-project.md` 的設定值（`## Offer Mode`、`## Goal Commit`）。檔案存在卻讀不到時，它會退回預設值 `on`，所以使用者設的 `off` 會被當成 `on`：Proactive Offer 照樣跳選單，Goal mode 照樣免問直接 commit。這兩個設定的用途只有收窄，退回預設就是 fail-open。同一個檔案，`scripts/protected-branches.sh` 讀不到時回答 2（unknown，當作受保護），兩者對同一狀態給出相反的態度。可行性研究（[0-feasibility-study.md](../0-feasibility-study.md) § 3.3）記錄了這個缺陷。

## Requirements

- 候選順序與「選中後不往下一順位退」的規則與 `protected-branches.sh` 一致：依序檢查 `.claude/rules/git-workflow-project.md`、`rules/git-workflow-project.md`，第一個存在的檔案就是被選中的檔案，**不往下一順位退**；存在與否以 `lstat` 判斷，所以懸空 symlink 也算存在
- 只有 `ENOENT`、`ENOTDIR` 代表「不存在」；其他 `lstat` 錯誤（例如目錄無法進入的 `EACCES`）代表無法判斷存不存在，同樣回答收窄值，不往下一順位退（程式碼審查第 1 輪指出）。這一點**只在 `review-state.js`**：shell 端的 `[ -e ] || [ -L ]` 會把這種情況當成不存在，見 Scope 與下方延後記錄
- 被選中的檔案讀不到（權限不足、是目錄、懸空 symlink 等任何讀取錯誤）時，每個設定回答自己最收窄的值：`Offer Mode` → `off`、`Goal Commit` → `off`
- 兩個候選檔案都不存在時，行為不變：回答預設值
- 檔案讀得到時，現有行為一律不變：沒有該標題或沒有值 → 預設值；註解中的值不算數；無法辨識的值 → 預設值（由 `/claude-health` check #7 回報）

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `scripts/review-state.js` 的共用選檔函式 `selectOverride`、`overrideSetting` 與其兩個呼叫點（`offerMode`、`goal-commit`），以及同檔案 `protectedStatus` 在沒有 resolver 時的後備判斷；`test/scripts/review-state.test.js` 的回歸測試 |
| Out | 無法辨識的設定值仍回預設值，這是現有的文件化行為，不在本票；`*-project.md` 使用者檔案不動（INV-002）；`protected-branches.sh` 與 `pre-push-gate.sh` 在「檔案讀不到」時已經 fail-closed，但判斷「存在」用的是 `[ -e ] \|\| [ -L ]`，上層目錄無法進入時會誤判為不存在而退到低順位檔。intent 的非目標明訂這次不改機械防線，兩者的 protected-set 區塊又要求逐位元組一致，故延後（見下方記錄） |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `scripts/review-state.js` | Modify | 新增 `selectOverride`（lstat 選檔，只把 `ENOENT`/`ENOTDIR` 當不存在）；`overrideSetting` 讀取失敗或存在與否不明時回答呼叫端給的收窄值；`protectedStatus` 後備判斷改用同一個函式 |
| `test/scripts/review-state.test.js` | Modify | 三個回歸測試：選中的檔讀不到 → `off`，可讀時照常解析；懸空的高順位 symlink 不退到低順位；高順位目錄無法進入 → `off`（以 root 執行時略過） |

## Acceptance Criteria

- [x] 被選中的 override 檔讀不到時，`offer` 回報 `offer: false, reason: disabled`；同樣情況下 `goal-commit` 回報 `reason: disabled`
- [x] `.claude/rules/git-workflow-project.md` 是懸空 symlink、`rules/git-workflow-project.md` 可讀且寫著 `on` 時，結果是收窄值，不是低順位檔的值
- [x] 兩個候選檔都不存在時，`offer` 與 `goal-commit` 行為與修正前相同
- [x] 回歸測試走實際的 `review-state.js` CLI 路徑，雙向驗證：刪掉修正後測試轉紅，同樣的檔案內容在可讀時照常解析
- [x] 品質閘門：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | 缺陷由可行性研究 § 3.3 與 Codex 辯論第 0 輪指出，2026-09-25 查證屬實 |
| Development | Done | 第 1 輪審查另指出 `lstat` 的 `EACCES` 會被當成不存在，改由 `selectOverride` 區分 |
| Testing | Done | 三個新測試在修正前皆失敗、修正後通過；`npm run test:ci` 4959 pass、0 fail、8 skipped |
| Acceptance | Done | `/codex-review-fast` 第 2 輪 ✅ Ready；`/precommit` ✅ PASS |

範圍外、非阻擋，延後處理：

[OUT_OF_SCOPE_DEFERRED] scripts/protected-branches.sh:25 | the protected-set block selects the override with `[ -e ] \|\| [ -L ]`, so an untraversable `.claude/rules/` reads as absent and the lower file is used; the same block is byte-identical in scripts/pre-push-gate.sh | suggested-ticket: distinguish "absent" from "cannot tell" in the shared protected-set block of both scripts, a mechanical-guard change outside this migration's non-goals | 2026-09-25T06:15:00Z

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) task 10
- Feasibility study: [0-feasibility-study.md](../0-feasibility-study.md) § 3.3、§ 8
- Precedent: `scripts/protected-branches.sh` 的選檔與 fail-closed 規則
