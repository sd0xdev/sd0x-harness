# Probe Protocol

## Probe Loop Structure

每個 probe 是一個假設測試：

```
┌─ 1. 定義假設 H
│  2. 設計探測命令 C
│  3. 預測「若 H 成立 → 期望 O」
│  4. 執行 C → 觀察實際結果
│  5. 比對預期 vs 實際 → 更新假設集合
└─ 6. 選下一個最具鑑別力的探測
```

## Probe Journal Format

每輪記錄：

```markdown
### Probe R<N>
- **Hypothesis**: <假設內容>
- **Command**: `<探測命令>`
- **Expected**: <預期結果>
- **Actual**: <實際結果>
- **Conclusion**: Confirmed / Refuted / Inconclusive — <簡述>
```

Tie-break probe（見 § Tie-Break）在執行前多填一欄：

```markdown
- **Outcome → Next action**: <結果 1> → <下一步 A>；<結果 2> → <下一步 B>
```

## Termination Criteria

| Condition | Action |
|-----------|--------|
| 根因已定位 + ≥1 個執行結果佐證 | **Stop** — 進入 Phase 3 |
| 多個競爭假設（≥2 同等可信） | **Tie-break probe first**（§ Tie-Break）；沒有合適的 probe 才 **Brainstorm** — `/codex-brainstorm` 設計實驗 |
| 連續 2 輪無新資訊（stagnation） | **Escalate** — `⚠️ Need Human` |
| 達到 max rounds | **Escalate** — `⚠️ Need Human`，輸出已知資訊 |

## Config

| Key | Default | Override |
|-----|---------|----------|
| `debug.max_probe_rounds` | 6 | SKILL.md `## Config` section |

## Tie-Break

當 probe loop 產生 ≥2 個同等可信的根因假設，先觀察，再辯論。

| Step | Rule |
|------|------|
| 1. 找觀察 | 一個**便宜且安全**的觀察：唯讀、符合 SKILL.md § Probe Safety Rules、一個命令就能完成。例：讀取 effective config、比對實際載入的版本、看一筆既有的 log |
| 2. 先寫分流 | 執行前寫下「每個可能結果 → 下一步動作」。不同結果必須導向**不同的下一步**；若所有結果都導向同一個下一步，這個觀察沒有鑑別力，換一個 |
| 3. 執行並記錄 | 當作一般 probe round：填 Probe Journal（含 Outcome → Next action），計入 `debug.max_probe_rounds` |
| 4. 沒有合適的 probe | 找不到安全、便宜或在此環境可執行的觀察 → § `/codex-brainstorm` Integration |

「合適」的判準是三個都成立：安全（不改狀態）、便宜（成本遠低於辯論）、能分流（結果會改變下一步）。
需要 `[WRITE_PROBE]` 的觀察不算安全的 tie-break probe。

## `/codex-brainstorm` Integration

只在 § Tie-Break 第 4 步進入：

1. 暫停 probe loop
2. 調度 `/codex-brainstorm`，topic = **設計一個能區分各假設的實驗**（觀察什麼、哪個結果指向哪個假設），不是「哪個假設才對」
3. 辯論的產出是待執行的實驗，或優先驗證的假設——它仍然只是假設
4. 回到 probe loop 執行

**共識不能確立因果。** 辯論雙方意見一致，或辯論因沒有新的反對意見而停止，都不是關於系統的證據。
假設要成為根因，仍須符合 § Termination Criteria 第一列：已定位，且有 ≥1 個執行結果佐證，再進 Phase 3。
上限也不變：辯論不增加 probe rounds；連續 2 輪無新資訊或達到 max rounds 仍然 `⚠️ Need Human`。

## Probe Selection Strategy

選擇下一個 probe 時，優先選擇**最具鑑別力**的探測：

| Priority | Strategy | Description |
|----------|----------|-------------|
| 1 | Binary elimination | 一個探測可排除 ≥50% 假設 |
| 2 | Direct verification | 直接驗證最可能的假設 |
| 3 | Error path tracing | 追蹤 error → catch → fallback 路徑 |
| 4 | Differential | 比較 working vs broken 狀態 |

## Anti-Patterns

| Anti-Pattern | Correct Alternative |
|-------------|-------------------|
| 假設打平就直接辯論 | 先找便宜、安全、能分流的觀察（§ Tie-Break） |
| 把辯論共識當成根因 | 共識只是假設；要有執行結果佐證 |
| Shotgun probing（隨機嘗試） | 先排序假設，選最具鑑別力的 probe |
| 重複同一個 probe | 若結果不變，換不同角度探測 |
| 忽略矛盾結果 | 矛盾 = 假設有誤，重新分析 |
| 未記錄 probe 結果 | 每輪必填 Probe Journal |
