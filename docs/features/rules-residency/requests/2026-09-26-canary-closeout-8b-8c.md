# Canary 收尾：kernel 落地與記錄匯入（tasks 8b、8c）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-26
> **Status**: Completed
> **Note**: 維護者決定 2026-09-26：canary 不再需要 20 筆 baseline，用現有紀錄收尾，不跑候選 cohort，也不再當 5.0.0 的發布閘門
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

原設計是 kernel 落地前先記 20 個 baseline 變更，落地後再記 20 個候選變更，以 non-inferiority 比較決定能否發布 5.0.0（tech spec § 6、FR-10）。記錄職責由 task 8a 裝上後記到 6 筆。後續的紀錄只能來自之後的真實變更，本分支的其他需求單都已完成，只剩這個前置條件擋住 8b、8c 與 task 9。維護者因此決定不再要求 20 筆：以現有紀錄收尾，8c 不做候選 cohort 比較，canary 不再當 5.0.0 的發布閘門。

## Requirements

- **8b**：kernel 已提交在 stacked 分支 `feat/rules-residency-v5-kernel`（`e9beebb`…`228f2e5`）。合併到 `feat/rules-residency-v5` 與 `main` 是 PR 的步驟，不在本單以 git 操作完成
- **8c**：把 out-of-tree staging log 的 6 筆紀錄匯入 `docs/features/rules-residency/canary-log.jsonl`，沿用 tech spec § 6 的九欄 schema；匯入時修正三筆已知的錯誤計數（見下表）
- **8c**：移除記錄職責——本 repo `CLAUDE.md` 的暫時條款、`scripts/dev/canary-stage.js` 及其測試、manifest 的暫時區塊與 budget 測試中處理暫時區塊的程式碼
- tech spec § 6 改寫為收尾後的現況，§ 5 更新 8a–8c 與 task 9 的依賴；需求文件 § 9 附加這次決定，FR-10 註明發布閘門撤回
- 新增 `test/rules/canary-log.test.js`：匯入檔每行是一筆九欄紀錄、id 不重複、三筆修正值、沒有 hard incident，以及記錄職責已移除

## 匯入的紀錄

| change_id | 修正 | `resident_chars` | 量測時所在的層 |
| --------- | ---- | ---------------- | -------------- |
| `f45bb5f-r4-override-contract` | — | 103,212 | 現行層（r1–r4 搬移進行中） |
| `36605a1-r2-testing-docs-contracts` | — | 98,373 | 現行層（r1–r4 搬移進行中） |
| `task5-procedure-hint` | `review_rounds` 3 → 4 | 98,373 | 現行層 |
| `fr6-contract-refusal-probe` | `review_rounds` 7 → 6 | 98,817 | 現行層 |
| `6532cfe-r3-push-authorization-contract` | `review_rounds` 16 → 11、`deviations` 3 → 2 | 84,629 | kernel 分支，精簡前 |
| `228f2e5-resident-kernel-tasks-3-4-6` | — | 57,733 | 候選層（已精簡的 kernel） |

計數規則：`review_rounds` 是程式碼審查輪數加文件審查計畫輪數。三筆錯誤是記錄當下算錯，staging log 只能附加、不能改，所以在匯入時修正。`resident_chars` 是記錄當下本 checkout 常駐集合的實測值，照原樣保留。6 筆都沒有 hard incident。

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `canary-log.jsonl`（新增）；`CLAUDE.md` 暫時條款；`scripts/dev/canary-stage.js` 與 `test/scripts/canary-stage.test.js`（刪除）；`residency-manifest.json` 與 `residency-budget.test.js`；`claude-md-coverage.test.js`；tech spec、需求文件、8a ticket |
| Out | 合併 stacked 分支（PR 步驟）；task 9 的 CHANGELOG（另一張 ticket）；out-of-tree staging log 本身（留在原處，不再寫入） |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `docs/features/rules-residency/canary-log.jsonl` | Create | 匯入的 6 筆紀錄 |
| `scripts/dev/canary-stage.js` · `test/scripts/canary-stage.test.js` | Delete | 記錄職責結束 |
| `CLAUDE.md` | Modify | 移除暫時條款 |
| `docs/features/rules-residency/residency-manifest.json` · `test/rules/residency-budget.test.js` | Modify | 移除暫時區塊及其檢查 |
| `test/rules/canary-log.test.js` | Create | 匯入檔形狀、修正值、hard incident、職責已移除 |
| `test/skills/claude-md-coverage.test.js` | Modify | 移除已刪測試的登記，登記新測試 |
| `docs/features/rules-residency/2-tech-spec.md` · `1-requirements.md` · `requests/2026-09-25-canary-staging-8a.md` | Modify | 記錄決定與收尾現況 |

## Acceptance Criteria

- [x] `canary-log.jsonl` 每行是一筆九欄紀錄、change id 不重複，含三筆修正值，沒有 hard incident（`canary-log.test.js`，含負向對照）
- [x] `CLAUDE.md` 不再有記錄職責，`scripts/dev/canary-stage.js` 已刪除（`canary-log.test.js`）
- [x] manifest 與常駐集合一致，不含暫時區塊（`residency-budget.test.js`）
- [x] tech spec § 5、§ 6 與需求文件 § 9 記錄 2026-09-26 的決定，FR-10 註明發布閘門撤回
- [x] 程式碼閘門：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS
- [x] 文件閘門：`/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | 維護者決定 2026-09-26 |
| Development | Done | |
| Testing | Done | `/codex-test-review` ✅ Tests sufficient（4 輪）；全套測試通過（`security-redact.test.js` 的隨機值測試偶發失敗，與本變更無關，已記錄延後） |
| Acceptance | Done | `/codex-review-fast` ✅ Ready（2 輪）→ `/precommit` ✅ PASS；Adequacy Gate ✅ Adequate（第 2 輪，補上決定紀錄的測試後）；`/codex-review-doc` ✅ Mergeable |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 5、§ 6
- Requirements: [1-requirements.md](../1-requirements.md) FR-10、§ 9
- 8a ticket: [2026-09-25-canary-staging-8a.md](./2026-09-25-canary-staging-8a.md)
