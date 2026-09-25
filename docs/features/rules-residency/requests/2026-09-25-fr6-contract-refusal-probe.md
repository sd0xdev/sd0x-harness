# 契約讀不到時的拒絕示範（FR-6 probe）

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking. **Not** a feature-level requirements doc — for that see `../1-requirements.md`.
> **Created**: 2026-09-25
> **Status**: Pending
> **Note**: tech spec task 2 的 FR-6 部分，涵蓋 r1、r2、r4 搬出的全部契約
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md) <- Technical detail (primary source)
> **Requirements**: [1-requirements.md](../1-requirements.md) <- Feature-level problem-space rationale

## Background

Tech spec § 6 要求：每個受治理的 workflow，都要有測試把契約移除，並顯示該 workflow 在動手前拒絕。沒有 skill 的情境（ad-hoc session 遇到觸發條件而契約不在）則用隔離 repo 裡的 headless `claude -p` probe 示範，報告成觀察到的行為，而不是 hook 提供的保證。

r1、r2、r4 各自只釘住了「規則與 skill 寫明先讀契約、讀不到就停止」的文字。文字本身證明不了行為；node 單元測試也無法讓 skill 的散文 workflow 真的執行。這個 probe 需要一套共用的工具（隔離 repo、移除契約的外掛副本、headless 執行與判讀），所以一次做完，覆蓋每個搬出的契約，而不是每張搬移票各做一份。

## Requirements

- 一個可重跑的 probe：在隔離 repo 中載入移除了目標契約的外掛副本，以 headless `claude -p` 觸發對應 workflow 或觸發條件
- 覆蓋的契約：`scope-contract.md`、`loop-diagnostics.md`（r1）、`testing-contract.md`、`documentation-contract.md`（r2）、`rules/override-contract.md`（r4）
- 每個契約兩個方向：契約存在時照常執行；契約移除時，在產生審查結論或動手之前回報讀取失敗
- 結果記成觀察到的行為（含 Claude Code 版本與日期），不寫成保證

## Acceptance Criteria

- [ ] probe 可重跑，涵蓋上列五個契約
- [ ] 每個契約都有「契約存在」與「契約移除」兩個方向的觀察結果
- [ ] 結果記錄在 feature docs，標明版本與日期
- [ ] 文件閘門：`/codex-review-doc` ✅ Mergeable

## Progress

| Phase | Status | Note |
| ----- | ------ | ---- |
| Analysis | - | |
| Development | - | |
| Testing | - | |
| Acceptance | - | |

## References

- Tech Spec: [2-tech-spec.md](../2-tech-spec.md) § 5 task 2、§ 6
- 搬移票：[r1](./2026-08-29-extract-on-demand-contracts-r1.md)、[r2](./2026-09-25-testing-docs-contracts-r2.md)、[r4](./2026-09-25-override-contract-r4.md)
