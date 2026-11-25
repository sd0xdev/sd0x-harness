---
name: debug
description: "Interactive debugging workflow with hypothesis-driven probe loop. Use when: unknown bugs, script errors, silent failures, troubleshooting. Not for: known bugs (use bug-fix), GitHub issue analysis (use issue-analyze), code understanding (use code-explore). Output: debug report with probe journal + root cause + fix."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Skill, AskUserQuestion
---

# Debug Skill

## Trigger

- Keywords: debug, 除錯, troubleshoot, diagnose, 查問題, 找 bug, 為什麼不動, 為什麼不 work, something wrong, not working

## When NOT to Use

| Scenario | Alternative |
|----------|------------|
| GitHub Issue / PR thread 分析 | `/issue-analyze` |
| 已知根因、直接修復 | `/bug-fix` |
| 理解程式碼如何運作 | `/code-explore` |
| 需要雙視角確認邏輯 | `/code-investigate` |
| 部署後唯讀功能驗證 | `/feature-verify` |

## Prohibited Actions

```
❌ git add | git commit | git push — per @rules/git-workflow.md
```

This skill debugs and may fix code but does **not** commit. `/precommit` is a quality gate only. To commit, offer the menu per `rules/git-workflow.md` § Proactive Offer — a commit option on any real branch, a push option only where `review-state.js offer` allows one — and invoke `/smart-commit --execute` on selection; never print the command for the user to copy.

## Workflow

```
Phase 0    Phase 1     Phase 2          Phase 3           Phase 4        Phase 5
Intake  →  Classify →  Probe Loop   →   Root Cause    →   Fix +       →  Report
+ Repro    (Taxonomy)  (max 6)          Confirmation      Verify
  │          │           │                 │                │              │
  ▼          ▼           ▼                 ▼                ▼              ▼
Execute    refs/       Bash            /seek-verdict    Edit+test     --export
reproduce  failure-    tie-break probe /code-investigate /bug-fix      (optional)
           taxonomy    /codex-         (optional)
                       brainstorm
```

## Phase 0: Intake + Reproduce

| Step | Action | Output |
|------|--------|--------|
| 0a | 解析問題描述（症狀、範圍、環境） | 結構化問題描述 |
| 0b | 嘗試重現（執行命令/腳本） | 預期 vs 實際結果 |
| 0c | 重現成功？ | Yes → Phase 1 / No → `⚠️ Need Human` |

**Repro Contract**: 根因聲稱必須基於可重現的觀察，不可基於靜態推測。

## Phase 1: Classify

根據觀察到的失敗模式，使用 Failure Taxonomy 分類並選擇 first-probe 策略。

See `references/failure-taxonomy.md` for:
- 6 problem types + detection signals + first-probe commands
- Classification decision tree
- Escalation paths

## Phase 2: Probe Loop

假設驅動的互動式探測迴圈。See `references/probe-protocol.md` for full rules.

每個 probe 是一個假設測試：

```
1. 定義假設 H
2. 設計探測命令 C
3. 預測「若 H 成立 → 期望 O」
4. 執行 C → 觀察實際結果
5. 更新假設集合
6. 選下一個最具鑑別力的探測
```

### Termination

| Condition | Action |
|-----------|--------|
| 根因已定位 + ≥1 執行結果佐證 | **Stop** → Phase 3 |
| ≥2 競爭假設無法區分（tie） | **Tie-break probe first** → 便宜、安全、能分流下一步的觀察；找不到合適 probe 才 **Brainstorm** → `/codex-brainstorm` 設計實驗（見 § When Hypotheses Tie） |
| 連續 2 輪無新資訊 | **Escalate** → `⚠️ Need Human` |
| Max rounds (6) reached | **Escalate** → `⚠️ Need Human` |

### When Hypotheses Tie

When ≥2 equally credible hypotheses (競爭假設) remain, observe before debating. Full rules:
`references/probe-protocol.md` § Tie-Break.

| Step | Action |
|------|--------|
| 1 | Look for a **cheap, safe observation** (read-only, inside § Probe Safety Rules) whose possible outcomes lead to **different next actions** — e.g. read the effective config: value X → follow H1's next probe, value Y → follow H2's |
| 2 | Before running it, write each possible outcome and the next action it leads to. If every outcome leads to the same next action, the observation does not discriminate — pick another |
| 3 | Run it as a normal probe round: it is journaled and counts toward `debug.max_probe_rounds` |
| 4 | Only when no suitable probe is available (none is safe, cheap or reachable from here) → `/codex-brainstorm` |

### `/codex-brainstorm` Integration

Reached from step 4 above — never as the first response to a tie:

1. Pause probe loop
2. Invoke `/codex-brainstorm` via Skill tool — topic = **design an experiment** that would separate
   the hypotheses (what to observe, and which outcome points to which hypothesis), not "which
   hypothesis is right"
3. Take the debate's output as an experiment to run, or as the hypothesis to test first. It is
   still a hypothesis
4. Resume probe loop and run it

**Consensus alone cannot establish cause.** Two debaters agreeing — or a debate that stops with no
new objections — is not evidence about the system. A hypothesis becomes the root cause only through
the § Termination row above: located, with ≥1 execution result supporting it, then Phase 3. The
bounds do not move either: the debate adds no probe rounds, and 2 rounds without new information or
`debug.max_probe_rounds` still escalate to `⚠️ Need Human`.

## Phase 3: Root Cause Confirmation

| Step | Action | Required |
|------|--------|----------|
| 3a | 總結根因（What + Why + Impact + Evidence） | ✅ |
| 3b | `/seek-verdict --intent confirm` — Codex 獨立驗證 | ✅ Mandatory |
| 3c | `/code-investigate` 雙視角深入驗證 | Optional |
| 3d | `/git-investigate` 追蹤引入點（若 regression） | Conditional |

### `/seek-verdict` Integration (Step 3b — Mandatory)

Invoke `/seek-verdict --intent confirm` for independent root cause verification.

**Anti-anchoring contract** (per `@skills/seek-verdict/SKILL.md`):
- **Fresh thread**: a new § Start dispatch, never a § Resume onto an existing thread
- **No Claude conclusions**: prompt must not contain Claude's probe findings or root cause judgment
- **Finding packet only**: provide symptoms, files, observed behavior — let Codex judge independently

**Result routing**:

| Result | Action |
|--------|--------|
| ACTIONABLE (confirm) | → Phase 4 |
| NON_ACTIONABLE (high confidence) | Re-enter Phase 2 or `⚠️ Need Human` |
| UNCERTAIN | → Phase 4 (conservative), note low confidence |

## Phase 4: Fix + Verify

| Condition | Path |
|-----------|------|
| Simple fix (≤3 lines) | Edit + regression test + verify |
| Complex fix (multi-file) | Delegate to `/bug-fix` |
| Architecture-level change | `⛔ Need Human` — report root cause + recommendation |

**All fix paths require regression test** per `@rules/testing.md` evidence model. Bug type → test level mapping per `@skills/bug-fix/SKILL.md`.

Simple fix path:
1. Edit fix
2. Write regression test
3. Re-execute Phase 0 repro command (verify fix)
4. If code file changed → enter review loop (auto-loop)

## Phase 5: Debug Report

Output format: see `references/report-template.md`.

Default: conversation-only output. With `--export [path]`, write to file (with redaction per Probe Safety Rules).

## Probe Safety Rules

| Rule | Description |
|------|-------------|
| Read-first default | 預設探測為唯讀：`cat`, `curl -s`, `grep`, `ls`, `git log` |
| Write-probe gate | 可能修改狀態的探測標記 `[WRITE_PROBE]`，非 sandbox 環境需用戶確認 |
| Timeout | 每個探測命令 timeout ≤ 30 秒 |
| Output budget | 單次探測輸出 ≤ 500 行（超出 truncate） |
| Redaction | 禁止記錄 API keys, tokens, passwords（per `@rules/security.md`），以 `[REDACTED]` 取代 |
| Deny list | 禁止：`rm`, `drop`, `delete`, `truncate`, 任何 destructive 操作 |

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `debug.max_probe_rounds` | 6 | Maximum probe loop iterations |

## Review Loop

**MUST re-review after fix until PASS** (per @rules/auto-loop.md)

```
Fix → Review → Issues found → Fix again → ... → ✅ Pass → Next step
```

## Doc Sync

Doc Sync is governed by `@rules/auto-loop.md` (behavior-layer rule). After precommit pass, triggers conditionally when changes map to `docs/features/`.

## Output

```markdown
## Debug Report: <title>
- **Type**: <classification>
- **Root Cause**: <what + why>
- **Fix**: <change description>
- **Verdict**: <seek-verdict result>
- **Probe Rounds**: <N>
```

## Verification

- [ ] Phase 0 reproduced the issue
- [ ] Problem classified using failure taxonomy
- [ ] Probe journal recorded for each round
- [ ] `/seek-verdict --intent confirm` executed (Phase 3)
- [ ] Root cause has ≥1 execution evidence — a debate consensus is not one
- [ ] A hypothesis tie went to a tie-break probe first; `/codex-brainstorm` only when none was available
- [ ] Regression test written (if fix applied)
- [ ] Review loop completed (if code changed)
- [ ] No `git add/commit/push` executed

## References

| File | Purpose | When to Read |
|------|---------|--------------|
| `references/failure-taxonomy.md` | Problem classification + first-probe routing | Phase 1 |
| `references/probe-protocol.md` | Probe Loop rules + termination criteria | Phase 2 |
| `references/report-template.md` | Debug Report template + export format | Phase 5 |

## Examples

### Script Bug

```
Input: /debug bash scripts/deploy.sh 回傳 exit code 1
Phase 0: 執行 bash scripts/deploy.sh → 確認失敗
Phase 1: Script Bug
Phase 2: R1: bash -x trace → 發現 line 42 curl 失敗
         R2: 直接 curl endpoint → 404
         R3: 檢查 URL → 路徑缺少 /api prefix → Stop
Phase 3: /seek-verdict confirm → ACTIONABLE
Phase 4: Edit line 42 + regression test
Phase 5: Debug Report
```

### API Error

```
Input: /debug API 回傳空陣列但資料庫有資料
Phase 0: curl API endpoint → 確認回傳 []
Phase 1: Silent Failure（表面正常但結果錯誤）
Phase 2: R1: 檢查 query filter → 發現 status 欄位名稱不符
         R2: 直接 DB query → 有資料 → Stop
Phase 3: /seek-verdict confirm → ACTIONABLE
Phase 4: 修正 field name + unit test
Phase 5: Debug Report
```

### Hypothesis Tie

```
Input: /debug 服務啟動後 request 全部 timeout
Phase 2: R1: 重現 → timeout；H1 = timeout 設定被環境變數覆寫，H2 = 上游 DNS 解析慢（同等可信）
         R2: tie-break probe — 讀取 effective config（唯讀）
             outcome: timeout=5ms → 走 H1，查覆寫來源 / timeout=30s（預設）→ 走 H2，量 DNS
             actual: timeout=5ms → H1
         R3: 查環境變數來源 → 部署檔寫錯單位 → Stop（有執行結果佐證）
Phase 3: /seek-verdict confirm → ACTIONABLE
```

### Silent Failure

```
Input: /debug ks-status.sh 回傳 ready:false 但 deployment 已就緒
Phase 0: 執行 bash ks-status.sh → ready:false, 缺少 replicas 欄位
Phase 1: Silent Failure（404 被 fallback 吞掉）
Phase 2: R1: 直接 curl API → invalid JSON → R2: 原始回應 → 404
         R3: 改用 apps/v1 路徑 → 200 + 完整資料 → Stop
Phase 3: /seek-verdict confirm → ACTIONABLE
Phase 4: api/v1 → apps/v1（1 word fix）+ test
Phase 5: Debug Report
```
