# Hook `procedure_hint`（task 5）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-25
> **Status**: Completed
> **Note**: tech spec task 5；§ 7 開放問題 3（欄位形狀）在本票決定
> **Priority**: P2
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

契約搬出常駐層後，ad-hoc session 靠常駐的觸發條件與 skill 的第一步讀取找到契約。Tech spec § 3.3 第三條路徑是 hook：`[AUTO_LOOP_STATE]` 事實行加一個只由機械事實推導的 `procedure_hint=`，提醒哪個契約此刻相關。hook 不診斷、不分類、不解讀判決。

## Requirements

- 欄位形狀：同一行的選用欄位，放在 `intent_hint=` 之後（不另開第二行）；值是外掛內的契約相對路徑，排序、去重
- 三個機械事實：
  - 任一平面的 slot 記錄 ≥ 3 次失敗 → `skills/codex-code-review/references/review-common.md` 與 `loop-diagnostics.md`
  - 有變更的 `*-project.md` → `rules/override-contract.md`
  - `docs/features/` 下有變更的文件（request ticket 除外）超過 500 行 → `skills/doc-review/references/documentation-contract.md`
- 沒有事實成立時不輸出欄位；讀不到檔案視為沒有提示
- 更新 tech spec § 3.3 與 § 7 開放問題 3；`intent-artifact` tech spec 中「尚未落地」的依賴列改寫

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `scripts/review-state.js` 的 `check --format=fact`；對應測試；兩份 tech spec |
| Out | hook 拒絕工具呼叫（契約檔缺失時的 deny）——屬 FR-6 與 PreToolUse 守衛的範圍；常駐觸發表（task 3） |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `scripts/review-state.js` | Modify | `procedureHints()` 與事實行欄位 |
| `test/scripts/review-state.test.js` | Modify | 三個事實各自的兩個方向、多事實時排序去重 |
| `docs/features/rules-residency/2-tech-spec.md` | Modify | § 3.3 欄位形狀與事實、§ 7 開放問題 3 |
| `docs/features/intent-artifact/2-tech-spec.md` | Modify | 依賴列改為已落地 |

## Acceptance Criteria

- [x] 失敗次數 3 次時輸出兩個 loop 契約，2 次時不輸出；`pass` 之後提示消失
- [x] 變更的 `*-project.md`（`rules/` 或 `.claude/rules/`）輸出 override 契約；變更的父規則不輸出
- [x] `docs/features/` 下超過 500 行的變更文件輸出文件契約；剛好 500 行或 request ticket 不輸出
- [x] 多個事實同時成立時只有一個欄位，值排序且去重
- [x] 程式碼閘門：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS
- [x] 文件閘門：`/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | 開放問題 3：單行選用欄位 |
| Development | Done | |
| Testing | Done | 全套測試通過；`/codex-test-review` ✅ Tests sufficient；Adequacy Gate ✅ Adequate。審查另補：override 路徑只認 `rules/` 與 `.claude/rules/`；非 ASCII 檔名以 git 的原始位元組讀取 |
| Acceptance | Done | 程式碼閘門、Adequacy Gate 與文件閘門皆通過 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 3.3、§ 5 task 5、§ 7
