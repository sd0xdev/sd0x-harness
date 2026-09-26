# 安裝 canary baseline 記錄職責（task 8a）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-25
> **Status**: Completed
> **Note**: 安裝本身已完成；20 個 baseline 變更要靠之後的實際工作累積，累積滿之前本單不結案。2026-09-26 維護者決定不再要求 20 筆：記到 6 筆時結束，由 8c 匯入並移除記錄職責（[2026-09-26-canary-closeout-8b-8c.md](./2026-09-26-canary-closeout-8b-8c.md)）
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

5.0.0 以 canary 為發版門檻（FR-10）：kernel 變更落地前，要先在現行規則層記下 20 個已完成變更當 baseline，落地後再記 20 個 candidate 比較。baseline 只能往前記，沒有回溯資料（tech spec § 6），所以記錄職責要最先裝上。本票裝上職責與記錄工具，並開始累積 baseline。

## Requirements

- 記錄寫在 repo 之外、只能附加的檔案，寫入不改變 tree digest，也就不會重新打開它量測的 gate
- 記錄目錄和 `review-state.js` 的狀態目錄相同；工具自帶同一段 repo-key 推導，由測試確認兩者寫進同一個目錄。`review-state.js` 會以單檔安裝到使用者專案，所以不為這個暫時工具改動它
- 每筆記錄包含 spec § 6 的欄位；常駐字元數由工具實測，token 數沒量到就記 `null`
- 同一個變更不能記兩次；記錄檔裡有不是九個欄位完整記錄的行、空白行、重複的 id，或最後一筆缺結尾換行時，工具拒絕讀寫。工具只能檢查格式，無法判斷一行格式正確的記錄是誰寫的
- 本 repo 的 `CLAUDE.md` 加一行暫時職責，指名工具與記錄路徑，由 8c 移除

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `scripts/dev/canary-stage.js`（新增，暫時性；放在 `dev/` 子目錄，不計入 README 的 script 數量，8c 移除時也不必改回）；`CLAUDE.md` 暫時職責一行；測試；spec § 6 的記錄欄位與工具說明 |
| Out | 20 個 baseline 變更本身（靠之後的實際工作累積）；匯入 `canary-log.jsonl`（cohort 滿後另一個變更）；8b、8c、task 9 |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `scripts/dev/canary-stage.js` | Create | `record` 與 `count` 兩個子指令 |
| `test/scripts/canary-stage.test.js` | Create | 13 個 CLI 測試 |
| `test/skills/claude-md-coverage.test.js` | Modify | 新測試寫入 fixture `CLAUDE.md`，依該測試的規則登記 |
| `CLAUDE.md` | Modify | 暫時職責一行 |
| `docs/features/rules-residency/2-tech-spec.md` | Modify | § 6 記錄欄位加 `resident_chars`，寫明工具 |

## Acceptance Criteria

- [x] `canary-stage.js record` 寫入一筆欄位完整的記錄，`resident_chars` 為實測值，`resident_tokens` 未提供時為 `null`
- [x] 記錄後 repo 工作樹仍然乾淨，記錄檔和 `review-state.js` 的狀態檔在同一目錄
- [x] 重複的 change id、缺欄位、非整數、空白 id 都被拒絕，且不寫入任何東西
- [x] 記錄檔有格式不符的行（不完整、多出欄位、空白行、重複 id、缺結尾換行）時，`record` 與 `count` 都拒絕，檔案不被附加
- [x] 工具和 `review-state.js` 把狀態寫進同一個目錄（測試直接比對），`review-state.js` 本身不改
- [x] 程式碼閘門：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS
- [x] 文件閘門：`/codex-review-doc` ✅ Mergeable（2026-09-26，與 8c 收尾的文件一起審查）
- [x] ~~baseline cohort 累積滿 20 筆（`node scripts/dev/canary-stage.js count`）~~ 2026-09-26 維護者決定取消此條件；記到 6 筆時結束

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | 依 tech spec § 6 與 task 8a |
| Development | Done | 程式碼審查 4 輪，修掉記錄檔完整性的 4 個漏洞：格式檢查太寬、超大整數寫成 `null`、並發重複記錄、缺結尾換行的記錄被接著寫。原本把 repo-key 推導抽成 `scripts/lib/state-dir.js`，precommit 發現它弄壞 `review-state.js` 的安裝副本，改為工具自帶推導並移到 `scripts/dev/` |
| Testing | Done | `test/scripts/canary-stage.test.js` 13 個測試；測試充分度審查 4 輪後 ✅ Tests sufficient；全套 4972 pass、0 fail |
| Acceptance | Done | 程式碼閘門通過，文件閘門進行中；baseline 累積中（0/20），滿 20 筆才結案。2026-09-26：取消 20 筆條件，記錄在 6 筆時結束並由 8c 匯入 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 6、task 8a
