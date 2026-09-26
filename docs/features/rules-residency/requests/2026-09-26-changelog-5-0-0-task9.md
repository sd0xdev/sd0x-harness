# 5.0.0 CHANGELOG 與 migration guide（task 9）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-26
> **Status**: Completed
> **Note**: 依賴 8c（已由 2026-09-26 的收尾決定完成）；版本號與實際發布不在本單
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

5.0 把常駐規則的細節搬到 on-demand contract，已安裝的專案會看到規則位置改變，所以 5.0.0 要附 migration guide（FR-13，沿用 3.0.0 的先例）。目前 `CHANGELOG.md` 不在 npm 套件內，release workflow 也只用 commit subject 產生 release body，guide 送不到任何一個發布管道。

## Requirements

- `CHANGELOG.md` 新增 5.0.0 段落：
  - (a) 4.x → 5.0 對照表：每個離開常駐層的區塊、它的新位置、何時讀取
  - (b) 不需要修改任何 `*-project.md`
  - (c) 建議模型為 Claude Opus 5.5 或更新
  - (d) 3.x 標為 deprecated，只適用 Claude Opus 4.8 之前的模型；3.0.0 歷史段落保留同樣標記
  - (f) 沒有載入外掛時安裝的規則：觸發條件的 Read 會失敗、受管動作停止，這個情況只在 guide 中說明
  - 已安裝專案的升級步驟：`/install-rules --all`、補上 § Contract Triggers
- (e) 發布管道：
  - `package.json` 的 `files` 加入 `CHANGELOG.md`
  - 新增 `.github/scripts/changelog-section.js`，輸出某版本在 `CHANGELOG.md` 的段落；沒有段落時不輸出
  - release workflow 在產生 release notes 之後、建立 release 之前，把該版本的段落附加到 release body
  - 腳本放在 `.github/`，不進 npm 套件，也不計入 README 的 script 數量
- 不改版本號、不打 tag、不發布；5.0.0 何時發布由維護者決定

## Scope

| Scope | Description |
| ----- | ----------- |
| In | `CHANGELOG.md`；`package.json` `files`；`.github/workflows/release.yml`；`.github/scripts/changelog-section.js`（新增）；`test/scripts/changelog-section.test.js`（新增） |
| Out | 版本號（`package.json`、`plugin.json`）與實際發布；已發布 release 頁面的內容（發布時才產生） |

## Related Files

| File | Action | Description |
| ---- | ------ | ----------- |
| `CHANGELOG.md` | Modify | 前言、5.0.0 段落、3.0.0 的 deprecated 標記 |
| `package.json` | Modify | `files` 加入 `CHANGELOG.md` |
| `.github/workflows/release.yml` | Modify | 新增 "Append the migration guide" 步驟 |
| `.github/scripts/changelog-section.js` | Create | 依版本擷取段落 |
| `test/scripts/changelog-section.test.js` | Create | 擷取邏輯、CLI、guide 內容、workflow 接線、npm 套件內容 |

## Acceptance Criteria

- [x] `CHANGELOG.md` 的 5.0.0 段落包含建議模型、4.x → 5.0 對照表（每個搬移的區塊都有新位置）、不需修改 `*-project.md`、3.x deprecated 說明，以及未載入外掛時的情況（`changelog-section.test.js`）
- [x] 3.0.0 歷史段落帶有 deprecated 標記（`changelog-section.test.js`）
- [x] `changelog-section.js` 輸出指定版本的段落；沒有段落、版本只是前綴、版本含 regex 字元時輸出空字串；沒有版本參數時 exit 2，讀不到檔案時 exit 1（`changelog-section.test.js`）
- [x] release workflow 在產生 notes 與建立 release 之間附加該版本段落，release body 用的正是被附加的檔案（`changelog-section.test.js`）
- [x] `npm pack --dry-run` 列出 `CHANGELOG.md`（`changelog-section.test.js`）
- [x] 程式碼閘門：`/codex-review-fast` ✅ Ready → `/precommit` ✅ PASS
- [x] 文件閘門：`/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | Done | tech spec task 9、FR-13 |
| Development | Done | v4.7.0 渲染後量測 78,378 字元（代入代表性 placeholder 值），現在 49,614 |
| Testing | Done | `/codex-test-review` ✅ Tests sufficient（4 輪）；workflow 的附加步驟在測試中實際執行；全套測試通過 |
| Acceptance | Done | `/codex-review-fast` ✅ Ready（2 輪，修正 `+` 版本邊界）→ `/precommit` ✅ PASS；Adequacy Gate ✅ Adequate；`/codex-review-doc` ✅ Mergeable。發布後 release 頁面是否帶有 guide，要到實際發布時才能確認 |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 5 task 9
- Requirements: [1-requirements.md](../1-requirements.md) FR-13
