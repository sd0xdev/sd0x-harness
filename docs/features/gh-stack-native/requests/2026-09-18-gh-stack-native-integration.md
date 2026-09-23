# `/gh-stack`：把 github/gh-stack 納入授權工作流，`--stack` 改為原生優先

> **Doc class**: Request ticket (date-prefixed non-lifecycle — per `@rules/docs-numbering.md`). Per-task work breakdown unit for progress tracking.
> **Created**: 2026-09-18
> **Status**: Done
> **Note**: 完成的是 harness 契約層；首次實跑見 spec § 5 項目 7，仍為 ⏳。（`Status` 必須是裸 token——`test/skills/create-pr.test.js` 與 request-tracking 的解析器只吃 `CLOSED_REQUEST_STATUS ∪ OPEN_REQUEST_STATUS` 的字面值，加註記會讓兩支測試紅。）
> **Priority**: P1
> **Tech Spec**: [2-tech-spec.md](../2-tech-spec.md)
> **Anchor**: 本單含 Anchor Register #4 變更（新增第四個列舉工作流），依 `@rules/discretion.md` 需人工核准 + 同 commit 更新 pin 測試。核准者：maintainer，2026-09-18

## Background

`/create-pr --stack` 自建 chained-base PR 鏈：每層一個 PR、base 指向下一層。它**不會**產生 GitHub 的
Stack 物件，所以沒有 per-layer diff view、沒有 linked merges。原生能力來自官方 extension
`github/gh-stack`，但 `references/stack-mode.md` § Phase D 原本的政策是「就算裝了也走保守非原生路徑」，
理由寫在 `create-pr-stacked` tech spec § 7 Q2/Q5：**rollout 訊號未確認、查詢契約不存在**。

使用者 2026-09-18 裁示：`--stack` 要加偵測環節、沒裝就（問過後）裝、盡可能以原生出發，並另開 skill
整合 gh-stack。四項決策如下（使用者逐項回覆）：

| # | 決策 |
|---|------|
| 1 | `/gh-stack` 列進 Anchor #4 例外（而非每次靠 user-authorized execution） |
| 2 | 安裝一律**問過才裝** |
| 3 | `create-pr --stack` 的原生路徑**委派**給 `/gh-stack` 執行，不只印指令 |
| 4 | 手工 chained-base Multi-PR 保留為 fallback |

## 現地實測（2026-09-18）

| 項目 | 結果 |
|------|------|
| `gh --version` | 2.97.0 |
| `gh extension list` | 空——`github/gh-stack` 未安裝 |
| `gh stack`（未安裝時） | gh 內建回 `gh stack is available as an official extension`，可作為輔助訊號 |
| 本 repo `.git/hooks/` | 只有 sample，**pre-push gate 未安裝** → 此 repo 的 push 憑證就是 AskUserQuestion |
| `gh stack view --json` | README 記載為 JSON 輸出；exit code `0`–`8` 各有語意 |

**這組事實答掉了 Q5，也讓 Q2 變成可測。** Q5 當時量的是 `gh pr view --json` / `gh pr list --json`，
兩者都沒有 stack 欄位，所以「連怎麼問都不存在」。查詢契約其實存在，只是在 **extension 裡**：
`gh stack view --json` 是 (a) 查詢指令、其 JSON 是 (b) schema、exit `2`（不在 stack）/`4`（API 失敗）/
`6`（多重歸屬）/`7`（rebase 進行中）/`8`（被鎖）是 (c) 三種以上互不相同的失敗語意。Q2 則不再需要
「事前確認 rollout」：裝起來、在核准下送一次，GitHub 要嘛回 Stack 物件、要嘛回 exit 4——讀回應即可，
而任何讀不到的狀態一律 fallback。

## 授權面（本單的核心）

`gh stack` 的多數子命令底下是 git 寫入操作，直接命中 Anchor Register #4：

| 子命令 | 底層 | 處置 |
|--------|------|------|
| `view --json` | 唯讀 | 允許 |
| `link` / `push` / `submit --auto` | push 分支（`--force-with-lease`）、建 PR、建 Stack | **納入 `/gh-stack` 授權** |
| `rebase` / `sync` / `modify` | cascading rebase，改寫本地歷史 | 不授權——使用者自己跑 |
| `init` / `add` / `checkout` | 建分支、checkout、`add -Am` 會 commit | 不授權 |
| `merge` / `unstack` | 合併 / 解除 stack | 不授權 |

`sync` 是最像「順手」而其實最不能授權的一個：fetch → cascade rebase → force push → prune 一次做完，
核准一次 sync 等於核准一次沒人看過的歷史改寫。

另兩點寫進契約：`gh stack submit` 不加 `--auto` 會開全螢幕編輯器，agent 呼叫等於**握著已核准的
force push 卡住**；`--auto` 建立的新 PR 預設是 **draft**，除非 `--open`。

## Scope

| 項目 | 檔案 |
|------|------|
| Anchor #4 新增第四個工作流 | `rules/git-workflow.md` § Exception、`rules/discretion.md` § Anchor Register、`CLAUDE.md` / `CLAUDE.template.md` rule 4 |
| Push safety 三處工作流列舉補上 `/gh-stack` | `rules/git-workflow.md` § Push safety、`rules/discretion.md` § Efficacy Boundary |
| Pin 測試同 commit 更新 | `test/rules/discretion-tiers.test.js`、`test/rules/override-contract.test.js` |
| 新 skill | `skills/gh-stack/SKILL.md` + `test/skills/gh-stack.test.js` |
| Phase D 由「印指令」改為「偵測 → 安裝詢問 → 委派 → fallback」 | `skills/create-pr/references/stack-mode.md`、`skills/create-pr/SKILL.md`、`test/skills/create-pr.test.js` |
| 註冊 | `docs/skill-catalog.yml` → `README.md`（產生器） |
| **審查輪次中追加**（原始 Scope 沒有，由 fallback 審查找出的 carrier 漂移） | `skills/push-ci/SKILL.md`（授權區塊由「two authorized paths」改為三條）、`skills/smart-rebase/SKILL.md`（closed set 補第四個工作流）、`scripts/pre-push-gate.sh`（三處註解改為三個 caller，並記下 extension 路徑帶不了 `--receive-pack` 與 `SD0X_PUSH_DEST_DIGEST`），以及對應的 `test/skills/push-ci.test.js`、`test/skills/smart-rebase.test.js`、`test/scripts/pre-push-gate.test.js` |
| 上游 Q2/Q5 結案註記 | `docs/features/create-pr-stacked/2-tech-spec/2-tech-spec.md` § 7 |

**不在本單**：`gh skill install github/gh-stack`（上游給 agent 的 skill）不安裝也不抄——本 skill 只做
harness 層（授權閘、核准、fallback、attribution 驗證），CLI 用法由上游文件負責。

## Acceptance Criteria

- [x] **AC1** Anchor Register #4 列舉四個工作流，`/gh-stack` 的授權子命令為封閉三項，且 pin 測試在同一 commit 內更新
- [x] **AC2** 任何 mutating `gh stack` 呼叫都要 per-use AskUserQuestion；委派呼叫不構成核准
- [x] **AC3** unshared attestation 由 `/gh-stack` 自己、具名、在 force 核准之前提出；`ALLOW_PUSH_PROTECTED` / `ALLOW_FORCE_UNSHARED` 永不設定且每次執行前清除
- [x] **AC4** extension 偵測以 `github/gh-stack` 身分比對；未安裝時問過才裝；安裝以重新列舉驗證；偵測失敗一律視為 absent
- [x] **AC5** `create-pr --stack` 原生路徑委派 `/gh-stack`，本身仍不執行任何 `gh stack` 子命令；declined / failed / unreadable / GitHub 拒絕 → Multi-PR fallback，且報告明說走了哪條
- [x] **AC6** `submit` 永遠帶 `--auto`；`--auto` 產生的 PR 標題/內文經 `/create-pr` § 7b attribution 驗證（CLAUDE.md rule 3 為 Anchor）
- [x] **AC7** exit code `2/4/6/7/8` 各有處置，`4` 不得被讀成「沒有 stack」

## Outcome

2026-09-18 完成。測試（量法：`node --test <檔案>`，數字取該次輸出的 `# pass` / `# tests`）：
`test/rules/discretion-tiers.test.js` + `test/rules/override-contract.test.js` 71/71、
`test/skills/create-pr.test.js` + `create-pr-sanitization` 130 pass / 131 tests（1 個條件式
skip：`.claude/CLAUDE.md` 不存在時跳過的鏡像檢查）、新增 `test/skills/gh-stack.test.js` 18/18、
`test/scripts/pre-push-gate.test.js` 86/86、全套 `npm test` 4754 pass / 4762 tests / 0 fail
（以上為**審查收斂後**的最終量測；修正輪次中新增的 pin 讓 gh-stack 那支從 14 長到 18，全套總數同步變動）。
README 由產生器更新為 100 public / 100 bundled。

**審查**：Codex 因額度用罄無法派送，maintainer 當日明確授權改用 fallback carrier，逐 plane 各記一筆：

```
[REVIEWER_FALLBACK] plane=code_review from=codex to=contract-neutral-reviewer reason=quota | 2026-09-18T04:05:00Z
[REVIEWER_FALLBACK] plane=doc_review from=codex to=contract-neutral-reviewer reason=quota | 2026-09-18T04:05:00Z
```

改由
contract-neutral fallback reviewer 承載 code_review 與 doc_review 兩個 plane，doc 依
`resolve-review-profile.js` 切成 4 個 batch。第一輪四個 ⛔（doc b0/b1/b3、code），修掉的真缺陷包含：
§ 3.1 流程圖偵測分支畫反、Q5 結案句越權開放 A0.1 第二來源、「只執行三個子命令」與自身 Phase 2/4 跑
`gh stack view` 矛盾（rule 與 pin 一併收窄為 mutating + 唯讀 view）、`create-pr` 委派未帶模式（dry-run
會觸發安裝與 push）、`smart-rebase` 仍宣稱 closed set 是三個工作流、PR 編號鏈在 Phase 2 必然中止、
§ 7b 補救缺輸入來源。第二輪再修：原生路徑預設 draft 卻被描述成只差 Stack 物件（委派改帶 `--open`）、
auto-detection 第二來源在 phase 順序中無人可讀（移除，待同步票）、Phase 3 fence 缺 `/push-ci` 的
Step 0a/0b 攔截（`$BASH_ENV` 可重定義 `/usr/bin/env` 而讓 `ALLOW_*` 清除失效——已補，並把
`test/scripts/pre-push-gate.test.js` 的 caller-layer pin 擴到第三個工作流）、原生失敗回退讀的是
Phase B 在原生變更**之前**的快照（改為重查）。

**尚未實測的部分，明寫在這裡**：`gh stack link` / `push` / `submit --auto` 的**執行**路徑本單未實跑
——extension 在本機仍未安裝，而安裝與執行都須經使用者核准（AC2/AC4 就是這條規定本身）。首次實跑時要
確認的三件事（第三項為 2026-09-22 code review 第九輪補入）：GitHub 是否真的回 Stack 物件（Q2 的最終答案），`--auto` 產生的 PR 內文是否會帶
commit 訊息裡的 AI trailer（AC6 的驗證步驟就是為此存在），以及**那次 push 的實際 force form**——
本單 § 授權面把 `--force-with-lease` 當成既有行為寫（見上表 `link` / `push` 那兩列），但那是 extension
README 的說法，本 repo 沒有量過，而 `ALLOW_FORCE_WITH_LEASE=1` 正是靠這前提才設的。量法：對一個已授權
的子命令跑 `GIT_TRACE=1`（或 `GH_DEBUG=api`）並把結果記在主張旁；若量出 bare `--force`，那就落在 grant
之外，停用該子命令並回報 maintainer（`skills/gh-stack/SKILL.md` § Force form）。

### 2026-09-23 — Codex 第二意見與修正

Codex 額度恢復後，對同一份未提交的改動重跑兩個 plane（code 1 次、doc 依 `resolve-review-profile.js`
以 thorough 切成 8 個 batch），9 份報告中 8 份 ⛔。與 fallback 那 14 輪不同的是，這一輪的缺陷**全部來自讀
extension 的原始碼**，而本單與初版 skill 都是照 README 寫的。以下**取代**本單前文的對應敘述（前文保留為
當時的記錄，不改寫）：

| 前文敘述 | 實際（`github/gh-stack` v0.1.1 原始碼） | 取代後 |
|----------|------------------------------------------|--------|
| § 現地實測、§ 授權面：`gh stack view --json` 是唯讀查詢、是 Q5 的查詢契約 | `view` 依**目前分支**讀本地 tracking，讀完以 `SaveNonBlocking` 回寫 `.git/gh-stack`（`cmd/view.go`）——不是唯讀；而 `link` 不寫本地 tracking，所以 `view` 驗證不了 `link` 建的 Stack | `view` 移出授權。本地 tracking 直接讀檔；遠端 Stack 以 `GET repos/{owner}/{repo}/stacks?pull_request=<n>` 驗證，結果三態：`confirmed` / `confirmed absent` / `unverifiable` |
| § 現地實測：「任何讀不到的狀態一律 fallback」 | 讀不到 ≠ 確認不存在。`link` 在建 Stack 之前已推分支、逐一建 PR，`4`/`9` 可能出現在那之後；在一個存在的 Stack 上 fallback 會讓每層被改兩次 | 只有 `confirmed absent` 走 fallback；`unverifiable` 是 STOP |
| § 授權面：`link` / `push` / `submit --auto` 都以 `--force-with-lease` 推 | `link` 是 `git push --atomic`，**不 force**；`push`/`submit` 是逐分支帶值的 `--force-with-lease=refs/heads/<b>:<sha>`，refspec 完整限定，無 bare `--force`（`cmd/link.go`、`internal/git/gitops.go`） | Anchor Register #4 與 `rules/git-workflow.md` § Exception 依子命令分寫 push 形式（pin 測試同批更新）；`link` 不帶 `ALLOW_FORCE_WITH_LEASE`、不問 unshared attestation |
| § Outcome 尚未實測段：量 force form 用 `GIT_TRACE=1`（或 `GH_DEBUG=api`） | `GH_DEBUG` 記的是 API 流量，不是子行程 argv | push 形式改以原始碼為據並**綁定 v0.1.1**；其他版本才回到未驗證，且只認 `GIT_TRACE=1` 的 argv |
| AC7：exit `2/4/6/7/8` | 還有 `9`（此 repository 未開放 Stacks）與 `10`（`cmd/utils.go`） | 執行後的 exit 表加入 `9`，且**所有** exit 都進 Phase 4 驗證 |

同批修掉的其餘缺陷：readiness 報告的 `Draft` 欄要從 `view --json` 取，但該 JSON 沒有 draft 欄位（改為執行後
從 Stacks API 的 `draft` 或 `gh pr view --json isDraft` 讀回）；`stack-mode.md` 的補救指令
`git push origin -- '<b>'` 在分支名為 `+main` 時會被 git 讀成 force refspec（改為完整的
`refs/heads/<b>:refs/heads/<b>`）；`smart-rebase` 三處仍寫「有 user approval 也絕不執行」，與同檔
§ Permissions 承認的 `user-authorized execution` 矛盾；`create-pr-stacked` spec § 7 Q2 的降級條件過寬、
Q5 的結案依據錯（兩處加 2026-09-23 更正）。另，`test/skills/gh-stack.test.js` 的 fence 抽取器改為逐行
追蹤——縮排在清單項目裡的 fence 會讓原本的單一 regex 配對錯位。

**未修、另開單**（pre-existing，與本單 hunk 無因果關係，依 `rules/scope-discipline.md` 延後）：

```
[OPPORTUNISTIC_DEFERRED] key=skills/epic-merge/SKILL.md|bundled-approval-omits-remote-tip | severity=P1 | class=closed | reason=closed | relation=independent | source=codex | hunks=skills/epic-merge/SKILL.md:@@-2552+2552 | 2026-09-22T17:17:45Z
[OPPORTUNISTIC_DEFERRED] key=skills/epic-merge/SKILL.md|force-if-includes-vs-explicit-lease-claim | severity=P2 | class=closed | reason=closed | relation=independent | source=codex | hunks=skills/epic-merge/SKILL.md:@@-2552+2552 | 2026-09-22T17:17:45Z
[OPPORTUNISTIC_DEFERRED] key=skills/epic-merge/SKILL.md|deleted-head-recovery-row-retired-mechanism | severity=P2 | class=closed | reason=closed | relation=independent | source=codex | hunks=skills/epic-merge/SKILL.md:@@-2552+2552 | 2026-09-22T17:17:45Z
[OPPORTUNISTIC_DEFERRED] key=skills/push-ci/SKILL.md|nonzero-exit-may-be-partial-multi-url-publish | severity=P1 | class=closed | reason=closed | relation=independent | source=codex | hunks=skills/push-ci/SKILL.md:@@-15,2+15,5,skills/push-ci/SKILL.md:@@-22,6+25,6 | 2026-09-22T17:17:45Z
[OPPORTUNISTIC_DEFERRED] key=skills/push-ci/SKILL.md|protected-branch-deletion-still-prompts | severity=P2 | class=closed | reason=closed | relation=independent | source=codex | hunks=skills/push-ci/SKILL.md:@@-15,2+15,5,skills/push-ci/SKILL.md:@@-22,6+25,6 | 2026-09-22T17:17:45Z
[OPPORTUNISTIC_DEFERRED] key=skills/push-ci/SKILL.md|plan-cites-phase0-step8-for-classifier-output | severity=P1 | class=closed | reason=closed | relation=independent | source=codex | hunks=skills/push-ci/SKILL.md:@@-15,2+15,5,skills/push-ci/SKILL.md:@@-22,6+25,6 | 2026-09-22T17:17:45Z
[OPPORTUNISTIC_DEFERRED] key=skills/smart-rebase/SKILL.md|step2-rerun-drops-target | severity=P1 | class=closed | reason=closed | relation=independent | source=codex | hunks=skills/smart-rebase/SKILL.md:@@-35,4+36,7,skills/smart-rebase/SKILL.md:@@-518,2+524,4 | 2026-09-22T17:17:45Z
[OPPORTUNISTIC_DEFERRED] key=README.md|commit-msg-guard-default-install-overstated | severity=P2 | class=closed | reason=closed | relation=independent | source=codex | hunks=README.md:@@-48,2+48,2,README.md:@@-162+162 | 2026-09-22T17:17:45Z
```

首次實跑仍為 ⏳（spec § 5 項目 7），要確認的事改為：Stacks API 的實際回應形狀、GitHub 是否真的建立
Stack 物件、`--auto` 產生的 PR 內文是否帶 AI trailer。push 形式已不在這份清單上——除非安裝到的版本不是
v0.1.1。

**同日第二輪**（上表修正後，Codex 在原 thread 續審；code 1 份、doc 7 份，batch 6 未改動沿用前一份）：
上表把 `404` 一律歸為 `unverifiable` 是錯的——未開放 Stacks 時 `link` 在任何 push 之前就以 `9` 結束，
這個最常見的情境因此永遠走不到 AC5 要求的 fallback。改為：exit `9` 佐證的 `404` 算 `confirmed absent`。
另兩條：`confirmed` 只說明 Stack 存在，不說明這次指令成功，所以 exit 與驗證結果改為兩軸一起讀（非 0 且
`confirmed` 是對既有 Stack 執行失敗，STOP）；以及 `.git/gh-stack` 只給拓撲——extension 推之前會同步
PR 狀態並跳過 merged 與 queued 的層，而 queued 從不寫進檔案，所以有效層改以唯讀 GraphQL
（`mergeQueueEntry`）即時查詢，執行前再查一次、不同就重新核准。`stack-mode.md` 留著的
「每個讀不到或被拒的狀態一律退回」也收窄為**執行之前**的狀態。

**同日第三輪**：第二輪的兩個修法本身又被推翻，而且推翻它們的是彼此。「exit `9` + `404` 算
`confirmed absent`」不成立——extension 把**任何** `404` 都轉成 `9`，而 GitHub 對「token 看不到」也回
`404`；但若一律 `unverifiable`，`link` 在建任何 PR 之前就退出的「未開放」情境又永遠走不到 fallback。
解法是把問題挪到答案不重要的時間點：**Stacks 可用性改在執行前探測**，`404` 即停、什麼都還沒動，
fallback 在那裡恆為安全；執行後的 `404` 一律 `unverifiable`，而「沒有任何一層有 PR」本身就是
`confirmed absent`（Stack 由 PR 組成）。同輪另一條——extension 同步時還會依 head branch 找回檔案沒記錄
的 PR——讓「預測哪些層會被推」第三次漏掉一支；改為不預測：核准以整個 stack 為**上界**（extension 只會
少推、不會推別的），執行前重讀檔案、不同就重核。三輪的 finding 都出在同一個動作——在 skill 裡重新
實作 extension 的內部邏輯——這一輪的修正方向是把那些重新實作拿掉，而不是補齊。

**同日第四輪**：code plane `✅ Ready`。doc 兩個 batch 指出第三輪的「沒有 PR 即 `confirmed absent`」只查了
open PR——Stack 會保留 closed 與 merged 的 PR 當成員，一個各層都已合併的 Stack 會被報成不存在。改為
PR 探索不限狀態（`--state all`，加上指令輸出與 tracking 檔記錄的號碼）。

**同日第五輪**（code 與 doc batch 2、7 的 thread 達 R-a 門檻，改為新 thread 的 first-dispatch）：
fresh reviewer 又找到三個 extension 內部的 mutation——`link` 在解析 PR 號碼前就 push 所有與本地分支同名的
運算元；`submit` 會先以 unstack 處理任何殘留的 `gh stack modify`；`submit` 會停用既有 PR 的 auto-merge。
連續五輪「多挖出一個」之後，這一輪改由我自己把三個授權子命令的**完整 mutation 面**一次讀完
（`cmd/link.go`、`cmd/push.go`、`cmd/submit.go` 對 `client.*`、`git.*`、`stack.Save`、`modify.*` 的每個
呼叫），寫成 skill § Force form 的 mutation 表，再逐項處置：PR 運算元一律渲染成本 repository 的 PR URL；
既有 PR 的 base 改動、auto-merge 停用、draft 轉 ready 全部在 Phase 2 讀取、列進核准、Phase 4 讀回
（extension 對這三者失敗只警告、仍回 `0`，所以讀回不符判為 partial）；有 `gh-stack-modify-state` 時
`--submit` 直接 STOP；非 v0.1.1 版本的 mutating run 在核准前即停（trace 只能事後記錄，不是閘門）。
`--update` 走 Phase C 的理由也更正為「兩個原生形式都不改既有 PR 的文字」。

**同日第六輪**：batch 1、4 `✅ Mergeable`；上輪的 PR 號碼、pending modify、PR 狀態讀回三條經 code plane
確認已修好。新找到三條，皆屬第五輪盤點表上「會做什麼」之外的**運算元解析與目的地選擇**：全數字的分支名會
被 `link` 當成 PR 或 Stack 號碼解析（改為 `--link` 拒絕、`create-pr` 導向 Phase C）；extension 會依
`pushRemote`／`pushDefault` 等設定自選 push remote（改為執行列一律帶 `--remote 'origin'`）；`submit` 的
Stack 同步是 best-effort、exit 不檢查（exit `0` 加 `confirmed absent` 改判為「已發佈但沒有 Stack」，
「Stack 失敗必回錯誤」只保留給 `link`）。

**同日第七輪**：`--remote 'origin'` 與 `submit` 的「已發佈但沒有 Stack」經 code plane 確認無誤。全數字的
判斷漏了前導 `+`——`git check-ref-format` 接受 `+400`，Go 的 `strconv.Atoi` 把它讀成 `400`——pattern 改為
`^[+]?[0-9]+$`，skill 與 `create-pr` 共用同一個，測試改為從文件取出 pattern 實際比對（`400`／`+400`／
`+0400` 必擋，`feat-400` 必放），並以把 pattern 改回舊版的反向驗證確認兩支測試都會紅。另更正 `push` 的
modify guard：它只擋 `applying` 與 `conflict`，不擋 `pending_submit`（`push` 本身不 unstack，所以無害）。
