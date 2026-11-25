# Execution Policy（v1 report-only）

## Backend 選擇

| 條件 | Backend | 並行上限 |
|------|---------|---------|
| `Workflow` 工具可用且未指定 `--backend agent` | Dynamic Workflows（read-only fanout worker） | budget `max_workers` |
| 使用者明確指定 `--backend dw`，但 `Workflow` 工具不可用 | **不靜默切換**：在 preview 說明，由使用者選擇改用 `Agent` 或中止；派發前必須有答案 | — |
| 其餘 | background `Agent`（單訊息平行派發） | min(3, `max_workers`)——沿 deep-explore 既有模式 |

**Admission 與後端無關**：兩種 backend 用同一 `admission-allowlist.json`（deny-by-default）——避免「DW 不可用退回 Agent 時派出 mutating agent」。

## Fanout 是否值得（optional — 交易成本）

Fanout 是**選項**，不是預設：budget 的 `max_workers` 是上限，不是目標。把一步拆給多個 worker 之前，planner（寫進該步的 `why`）與主 session（preview 時）都先比較拆與不拆的成本。

| 交易成本 | 內容 |
|----------|------|
| Context duplication | 每個 worker 各自重讀共用脈絡（brief、共用檔案、repo 結構）；N 個 worker ≈ N 份 |
| Waiting | 整個 group 等最慢的 worker；加上派發與回收的固定開銷 |
| Merging | 結果要去重、對齊格式、調和互相矛盾的 finding，再過濾成 context packet |

| 情況 | 決定 |
|------|------|
| Shard 彼此獨立（不共用要讀的材料、不需要彼此的結果），且每個 shard 自己的工作量明顯大於它分攤到的 duplication + waiting + merging | Fanout |
| Shard 很小、共用同一批材料，或結果需要互相參照才有意義 | 不 fanout：單一 worker 循序做完 |
| 判斷不出來 | 不 fanout。循序是可逆的預設——之後仍可拆；已派出的 worker 成本收不回來 |

**不可被成本推理改動的事**（成本只在這些界線之內做選擇）：

| 界線 | 規則 |
|------|------|
| 使用者的明確選擇 | 意圖或 flag 明說要平行／不要平行、`--backend`、`--budget`：照做，不以成本為由覆寫；若認為不划算，在 preview 說明，由使用者決定 |
| Admission | `admission-allowlist.json` deny-by-default 不變：成本再低也不放行名單外的 worker |
| B1 上限 | 單一 `parallel_group` ≤ `max_workers`、`converge.max_rounds` ≤ `max_waves`：成本再划算也不超過 |
| Baseline 時序、人核 | snapshot 先於任何派發、兩次 compare、AskUserQuestion 核可——與 fanout 與否無關 |

**估計就標示為估計。** `why` 裡的 token／時間數字若不是量到的，寫明「估計」與依據；只有實際量到的數字才能說「較快」「較省」。沒有量測就不宣稱 speedup。

## 波次與收斂（FR-5）

| 形狀 | 實作 |
|------|------|
| 循序 | `depends_on` 拓撲序執行 |
| 平行 | 同 `parallel_group` 單訊息派發；結果以 context packet 過濾彙整（傳事實不傳結論，沿 deep-explore 模式） |
| 收斂 | `converge.max_rounds`（≤ budget `max_waves`）；每輪後評 `done_criteria`，未滿足且有殘餘 round → 下一輪 |

## Fail-closed 矩陣

| 事件 | 處置 | run status |
|------|------|-----------|
| `plan-context.js` exit 1（缺檔/超量/allowlist 失效） | 停，回報原因 | （未建 run） |
| planning 後 compare drift | 停，不進 preview | `failed` |
| `validate-plan.js` 違規 | 帶規則代碼重規劃 ≤1 次；仍敗 → 停 | `needs_human` |
| 使用者拒絕 preview | 停（plan 留存於輸出供手動採用） | `aborted` |
| 高信度 secret 於意圖/完成定義 | 不寫入 run-state，提示改寫 | `needs_human` |
| worker 失敗 | 重規劃 ≤1 次（FR-9）；仍敗 → 停 | `needs_human` |
| execute 後 compare drift | 停，**不寫報告、不自動回復**（回復本身是 mutation） | `failed` |
| 報告 doc review 回 blocked/degraded/無法判定 | 停，報告不得視為完成交付 | `needs_human` |
| 報告 doc review 回 Mergeable | 完成 | `done` |
| `--resume` 時原 baseline compare drift | 停（中斷期間變化無法歸因；不得重拍 baseline） | `needs_human` |

## 觀測性（NFR-2）

每步執行時輸出一行操作狀態（step id + target + why 摘要）；run 結束輸出 `## Orchestrate Run Summary`（步驟 / 理由 / 證據 refs / 報告路徑）+ `[ORCHESTRATE_RUN] run_id=… status=…`。
