# `/gh-stack` 原生 stacked PR 整合 — Technical Spec

> **Doc class**: Lifecycle 2 — technical spec
> **Doc role**: Current authority
> `scripts/lib/doc-metadata.js` 讀的是 `Doc role` 這個鍵，而且值必須是裸的角色名——括號註記寫在值裡會讓 `parseDocRoleState` 判為 invalid。程式碼落地後由 `/update-docs` 同步。
> **Created**: 2026-09-18
> **Request**: [2026-09-18-gh-stack-native-integration.md](./requests/2026-09-18-gh-stack-native-integration.md)
> **Anchor**: 含 Anchor Register #4 變更，已由 maintainer 於 2026-09-18 核准

## 1. Requirement Summary

把官方 extension `github/gh-stack` 納入 harness，使 stacked PR 能產生真正的 GitHub **Stack** 物件
（per-layer diff view、linked merges），而非僅止於手工 chained-base PR 鏈。四項使用者決策見 request
單 § Background。

| FR | 內容 |
|----|------|
| FR-1 | 新 skill `/gh-stack`，為 Anchor Register #4 第四個列舉工作流，授權**封閉為三個子命令** `link` / `push` / `submit --auto`，**不含** `gh stack view`——它會回寫 `.git/gh-stack`，不是唯讀（2026-09-23 更正；原本誤列為唯讀授權）。skill 需要讀的，直接讀檔與 Stacks REST API（§ 3.4、§ 3.5）。`test/rules/discretion-tiers.test.js` 的 `AUTHORIZED_GRANTS` 另含 `git push --atomic` 與 `git push --force-with-lease`——那兩筆是從 grant 句子的指令 span 逐字取出的底層 push 形式（§ 3.3） |
| FR-2 | 偵測 → 未安裝則**詢問後**安裝 → 解析 chain → per-use 核准 → 執行 → 驗證 |
| FR-3 | `/create-pr --stack` Phase D 改為原生優先，原生路徑**委派**給 `/gh-stack` |
| FR-4 | 手工 chained-base Multi-PR 保留為 fallback，且報告須分辨兩者 |

| NFR | 內容 |
|-----|------|
| NFR-1 | 任何讀不到的環境狀態一律退化為 `absent`（fail-closed），不得讀成可用 |
| NFR-2 | 不得輸出 `gh auth status` 內容（host / token scope），依 `@rules/logging.md` |
| NFR-3 | `--auto` 產生的 PR 標題與內文須過 attribution 掃描（CLAUDE.md rule 3 為 Anchor） |

## 2. Existing Code Analysis

| 既有元件 | 與本案的關係 |
|----------|--------------|
| `skills/create-pr/references/stack-mode.md` § Phase A–C | 同步分類、祖先驗證、existing-PR policy——**功能不變**，仍是委派前把 chain 講成真的唯一依據。但本案確實動了其中兩處，寫在這裡以免被讀成沒動：**Phase B** 的 auto-detection 來源由「既有 PR base 關係，或 native stack metadata」**收窄為單一來源**（第二來源在 phase 順序中沒有讀取者，移除待同步票）；**Phase C** 的 dry-run invariant 段改指向 D0 與唯讀委派 |
| 同檔 § Authorization Boundary | 操作表重新分割為 delegated（三個 mutating 子命令交給 `/gh-stack`）與 user-only（其餘） |
| 同檔 § Phase D | 原政策「裝了也走保守非原生」。本案改寫為偵測 → 安裝詢問 → 委派 → fallback |
| `skills/push-ci/SKILL.md` § Defense in Depth: Push Safety | 本 skill 的 push 安全模型直接沿用：L1 opt-in hook、L2 AskUserQuestion、probe 不選憑證 |
| `skills/create-pr/SKILL.md` § 4b / § 7b + `skills/create-pr/scripts/sanitize-pr-content.sh` | attribution 掃描與補救循環，本 skill 以引用方式重用，不另寫一套 |
| `test/rules/discretion-tiers.test.js` | Anchor #4 的三面 byte pin，本案新增第四條 grant 必須同 commit 更新 |

## 3. Technical Solution

### 3.1 授權模型

```
使用者訊息 / /create-pr 委派
        │
        ▼
Phase 0 偵測（唯讀）
        │
        ├─ absent ─► Phase 1 安裝（AskUserQuestion；唯讀／dry-run 不進這格，只回報）
        │                  │
        │                  ├─ 拒絕 / 失敗 / 偵測不可讀 ─► 回報 absent → 呼叫端 Multi-PR fallback
        │                  │                                （直接呼叫則報告後停止）
        │                  │
        │                  └─ 已安裝並重新列舉驗證 ─┐
        │                                          │
        └─ present ───────────────────────────────►┤
                                                   ▼
                          Phase 2 chain 驗證（唯讀，fail-closed）
                                                   │
                                                   ▼
                          Phase 3 ① unshared attestation（具名；僅 push / submit）
                                 ② operation approval（含該子命令的 push 形式）
                                                   │
                                                   ▼
                          gh stack link | push | submit --auto
                                （guarded block，單一命令作用域的 env）
                                                   │
                                                   ▼
                          Phase 4 Stacks API 驗證（三態）+ attribution verify + 報告
```

`--install` 是第三個入口，不在上圖的主路徑上：它只做偵測與安裝詢問，已安裝就回報並停止，**不會進入 Phase 2**（`skills/gh-stack/SKILL.md` § Input / Phase 1）。

**授權的兩個軸，缺一不可**：委派來源不是核准（Phase 3 每次都重問），旗標也不是核准（`--submit`
只說要做什麼，不說誰同意）。

### 3.2 為什麼 mutating 只授權三個

| 類別 | 子命令 | 不授權的理由 |
|------|--------|--------------|
| 改寫本地歷史 | `rebase`、`sync`、`modify` | cascading rebase；`sync` 一次做完 fetch → rebase → force push → prune，核准一次等於核准沒人看過的歷史改寫 |
| 需要 TUI | `modify`、無引數的 `checkout`、不帶 `--auto` 的 `submit` | agent 無法驅動；`submit` 更糟——會握著已核准的 force push 卡住 |
| 改變 PR 生命週期 | `merge`、`unstack` | 合併與解除 stack 是人的決定 |
| 會產生 commit | `add -Am` | commit 屬 Anchor #4 的另一條授權面（`/smart-commit --execute`） |

**三個授權子命令不可互換**：`gh stack link` 吃 chain（運算元 bottom-first），`gh stack submit` **不吃運算元**、發佈的是本地追蹤的 stack，`gh stack push` 只推分支。委派的**發佈**路徑永遠用 `--link`，因為它手上有的是一條驗證過的 chain 而不是本地追蹤狀態；dry-run 的委派不帶任何 mutating 旗標（見 § 3.6）。

### 3.3 Push safety 的落點

三個授權子命令**推的方式不同**。以下讀自 extension v0.1.1 原始碼，不是 README——README 的描述會讓人以為 `link` 也 force，實際上沒有：

| 子命令 | 實際發出的 push | 出處 |
|--------|-----------------|------|
| `gh stack link` | `git push <remote> --atomic refs/heads/<b>:refs/heads/<b> …`——**不 force** | `cmd/link.go` `pushBranchArgs` → `git.Push(remote, branches, false, true)` |
| `gh stack push` | 每個分支一條 `--force-with-lease=refs/heads/<b>:<sha>`，`<sha>` 取自 `refs/remotes/<remote>/<b>`；remote 沒有的分支用空值（必須不存在）；非原子 | `cmd/push.go` → `internal/git/gitops.go` `Push` |
| `gh stack submit --auto` | 同上，一次推一個分支 | `cmd/submit.go` → 同一個 `Push` |

所有 refspec 都是完整的 `refs/heads/<b>:refs/heads/<b>`，所以名為 `+main` 的分支不會被讀成 force。兩個 force 子命令在 push 前都先 `FetchBranches`，因此 lease 的期望值就是「剛剛 fetch 到的 remote 狀態」——它只擋得住 fetch 與 push 之間的競態，擋不住覆蓋掉 remote 上本來就有的別人的 commit。**lease 不是 sharedness 檢查**，這是 unshared attestation 對這兩個子命令仍然必要的原因。

這份讀法**綁定版本**：Phase 0 讀取 `GH_STACK_VERSION`，不是 `v0.1.1` 時 push 形式即為「未驗證」，而未驗證的 push 形式無從核准——**每個 mutating run 在 Phase 3 之前就停**，並回報讀到的版本。`GIT_TRACE=1` 記錄的是已經發生的 push，不能當閘門：它揭露出 bare `--force` 時，那次 push 早已到了 remote；`GH_DEBUG` 記的是 API 流量，不是子行程 argv。回復的途徑是 maintainer 讀過該版本的原始碼，把釘選的版本號在 skill 與測試中一起更新。任何版本的原始碼中出現 bare `--force` 或未完整限定的 refspec，都落在 grant 之外。

**push 不是這三個子命令的全部變動**，核准必須涵蓋全部。同樣讀自 v0.1.1：`link` 會替沒有 PR 的分支建 PR、**改既有 PR 的 base**、`--open` 時把既有 draft 轉 ready、建立或擴充 Stack（它會拒絕 merged、closed、queued 與開了 auto-merge 的 PR，而不是改它們）；`push` 會 fetch、寫 `.git/gh-stack`；它自己的 modify guard 只擋 `applying` 或 `conflict` 狀態——`pending_submit` 與讀不了的 state 檔都會放行（`internal/modify/state.go` `CheckStateGuard`），但 `push` 不會 unstack 任何東西，所以那個狀態對它無害；`submit --auto` 會**先處理未完成的 `gh stack modify`——非互動時直接 unstack `<git-dir>/gh-stack-modify-state` 記錄的那個 Stack，不一定是正在 submit 的這個**，然後逐層 push，並對既有 PR **停用 auto-merge**、在 stack 尚未上 GitHub 時改 base、`--open` 時轉 ready，或以生成的文字建新 PR，最後建立或擴充 Stack、寫 `.git/gh-stack`。除了 pending modify 的處理（刪 Stack 在授權之外，本 skill 直接拒絕）之外，每一項都列進核准；而 extension 在改 base、改 auto-merge、轉 ready 失敗時只**警告**、仍以 `0` 結束，所以 Phase 4 逐項讀回，不信 exit。

`pre-push` hook 是 **opt-in**，所以：

| 機制 | 由誰負責 |
|------|----------|
| unshared attestation（這些分支還有別人在動嗎） | `push` 與 `submit --auto`：**本 skill 自己問**，具名、在 force 核准之前。hook 裝了會再問一次是縱深防禦，不是免問的理由。`link` 不 force，remote 上分叉的分支會被 git 直接拒絕，沒有改寫可以 attest——核准會把這點講出來，而不是默默跳過 |
| `ALLOW_PUSH_PROTECTED` / `ALLOW_FORCE_UNSHARED` | 永不設定，且每次執行前清除——上游 shell 匯出的值會在沒人被問的情況下回答 hook |
| `ALLOW_FORCE_WITH_LEASE` | 只出現在**那一條已核准的 `push` / `submit --auto` 命令列**上，與 `/push-ci` 同形；**`link` 永不帶**。不設的話 hook 會直接拒絕 force-form push，而拒絕不是授權 |
| protected branch | 可以是 stack 的 **base**，不可以是 **layer**；Phase 2 硬中止 |
| 直譯器與傳輸 | Phase 0 的 **Step 0a/0b 在任何偵測之前先拒絕**：`$BASH_ENV`／`$ENV` 有設就停（啟動檔可以定義一個叫 `/usr/bin/env` 的函式，讓上面那行 `ALLOW_*` 清除失效），`GH_REPO`／`GH_HOST`／`GH_CONFIG_DIR`／`GIT_SSH*`／`GIT_PROXY_COMMAND` 有設就停（它們決定這次 push 與 `gh` 呼叫落在哪個 repo）。全文見 `skills/gh-stack/SKILL.md` § Phase 0 |

`PUSH_GATE` 偵測只回報 hook 是否**引用**了 gate，`referenced` 永遠不等於「會出現 `/dev/tty` 提示」。
它影響計畫怎麼**描述**憑證，不影響**選擇**憑證。

### 3.4 Chain 來源與失敗語意

兩個來源，依序：明確的 chain 引數（bottom first）、extension 的本地 tracking。兩者皆無 → STOP。

本地 tracking **直接讀檔**：`git rev-parse --git-dir` 之後用 Read tool 讀 `<git-dir>/gh-stack`。不用 `gh stack view --json`，因為它會先向 GitHub 同步 PR metadata、再以 `SaveNonBlocking` 回寫這個檔（`cmd/view.go`）——會寫入狀態的讀取不是讀取，所以 `view` 在授權之外。檔案是 JSON（`schemaVersion`、`repository`、`stacks[]`，每個 stack 有 `trunk` 與依序、bottom first 的 `branches[]`；`internal/stack/stack.go`）。**檔案給的是拓撲，不是會被推的 chain**——先照 `FindAllStacksForBranch(currentBranch)` 選 stack：

| 讀到 | 處置 |
|------|------|
| 沒有檔案 | 沒有追蹤中的 stack → 需要明確 chain |
| 讀不了、不是 JSON、或 `schemaVersion` > 1 | **STOP**——解析不了的檔案不等於空檔案 |
| `--submit` 且 `<git-dir>/gh-stack-modify-state` 存在 | **STOP**——`submit` 會先以 unstack 處理它，而被 unstack 的可能是任何 Stack；使用者完成或放棄該 modify 後再來，執行前再查一次 |
| 目前分支不屬於任何 stack（trunk 或 layer 皆算） | 沒有追蹤中的 stack → 需要明確 chain |
| 屬於**多個** stack | **STOP**——extension 自己遇到這種情況會回 exit 6 |
| 恰好一個 | 取它的 `branches[]`（依檔案順序、bottom first）與 `trunk.branch`——拓撲；再套下面的上界規則 |

**上界，不是預測。** extension 在 push 前會重新同步每層的 PR——包括依 head branch 找回檔案沒記錄的 PR——並跳過 merged 或 queued 的層；queued 從不寫進檔案（`cmd/utils.go` `syncStackPRs`、`internal/stack/stack.go` `ActiveBranches`、`ActiveBaseBranch`）。本 skill **不重新實作**這套選擇：先前每一次在這裡模仿它，都漏掉其中一支。不必模仿就成立的，是差異的方向——extension 只推它從檔案解析出的那個 stack 的分支，所以只會**少推**、**不會推別的**。因此核准（以及 force 子命令的 unshared attestation）列出**所選 stack 的每一層**，並明講 extension 會在執行時跳過 merged 與 queued 的層、每個剩下的層接在下方最近的剩下層上；**執行前立刻重讀檔案**，stack 或層不同就重新核准、不就地調整——這是集合唯一可能變大的途徑；Phase 4 逐層回報實際推了什麼。

**`--link` 的分支運算元不得能被解析成整數**（`^[+]?[0-9]+$`——包括前導 `+`：`git check-ref-format` 接受 `+400`，而 Go 的 `strconv.Atoi` 會把它讀成 `400`）：`link` 會先把數字運算元當成 Stack 號碼（第一個位置）與 PR 號碼解析，最後才當分支（`cmd/link.go` `detectAddMode`、`findExistingPR`），分支 `400` 會去動 PR #400——不論那是誰的。Phase 2 直接拒絕；`/create-pr` 在 D1 就把這種 chain 導向 Phase C。

**每條執行列都帶 `--remote 'origin'`**，也就是 Phase 2 所有檢查讀的那個 remote。不帶的話 extension 會自己挑——`branch.<name>.pushRemote`、`remote.pushDefault`、`branch.<name>.remote`、它自己存的偏好（`internal/git/gitops.go` `ResolveRemote`）——那不一定是驗證 chain 時用的 remote，lease 的期望值也會改讀那個 remote 的 tracking ref。三個子命令都接受這個旗標。

**PR 運算元一律以本 repository 的 PR URL 渲染，不用裸號碼**：`link` 會在解析 PR 號碼**之前**，先 push 所有與本地分支同名的運算元（`cmd/link.go` `pushBranchArgs`），所以一個剛好叫 `400` 的本地分支會在一份只寫著 PR #400 的核准下被推上去；URL 則永遠被當成 PR 解析、不會被當成分支。

**執行之後的 exit status**（`cmd/utils.go`）照狀態讀，而且**不論是否為 0 都進 Phase 4 驗證**——`link` 是先推分支、逐一建 PR，最後才建 Stack，所以 `4`（API 失敗）或 `9`（此 repository 未開放 Stacks）可能出現在 PR 已經建好之後：

| exit | 意義 |
|------|------|
| 0 | 成功 |
| 1 | 錯誤已印出（`link` 的 push 被拒也在此） |
| 2 | 不在 stack（Phase 2 之後不該出現——視為 tracking 檔過期） |
| 3 / 5 | rebase 衝突 / 引數錯誤（後者是本 skill 的渲染缺陷） |
| 4 | GitHub API 失敗——**絕不讀成「沒有 stack」** |
| 6 / 7 / 8 | 多重歸屬 / rebase 進行中 / 被鎖 |
| 9 | 此 repository 未開放 Stacks |

### 3.5 Stack 驗證（Phase 4）與可用性探測（Phase 2）

**可用性在執行前確認。** `--link` 與 `--submit` 在 chain 驗證完之後、核准之前，先打一次 `gh api 'repos/{owner}/{repo}/stacks?per_page=1'`：200 繼續；`404` → **STOP**，回報為 *native unavailable*——可能是未開放 Stacks，也可能是這個 token 看不到，GitHub 不說是哪一個，但兩者都讓原生路徑跑不了，而這時什麼都還沒動，所以呼叫端在這裡 fallback 是安全的，也**只有**在這裡安全。其他錯誤也是 STOP。`link` 自己的第一步就是這個呼叫（`listStacksSafe`），探測只是把答案挪到核准之前、而不是 push 之後。

**執行後的驗證問 GitHub，綁定這次 chain 的 PR，不經 `gh stack view`**：`view` 依目前分支讀本地檔，而 `link` 不寫本地檔——剛 link 成功的 chain 在那裡會讀成「不在 stack」，而另一個被 checkout 的 stack 會被讀成這一個。兩種讀取：每層**所有狀態**的 PR（指令輸出的、tracking 檔記錄的，以及 `gh pr list --head '<b>' --state all --json number`——closed 與 merged 刻意包含在內：Stack 會保留它們當成員，只查 open 會把一個各層都已合併的 Stack 報成不存在），以及對每個有 PR 的層打 extension 自己用的端點：

```
gh api 'repos/{owner}/{repo}/stacks?pull_request=<n>'
```

回應是 stack 清單，每個有 `number` 與依序（bottom first）的 `pull_requests`，每筆含 `number`、`draft`、`state`、`head.ref`（`internal/github/github.go` 的 `RemoteStack`）。結果只有三種，而且三種都是**關於 Stack，不是關於指令**：

| 結果 | 條件 | 代表什麼 |
|------|------|----------|
| **confirmed** | 每次讀取都是 HTTP 200，非空的回答都指向同一個 stack，且 chain 的 PR 以核准的順序連續出現、每個 `head.ref` 等於核准的層 | 有 Stack 持有這條 chain。run 之外的成員列在報告裡（`link` 會擴充某層原本所屬的 stack，且從不移除成員） |
| **confirmed absent** | 每次讀取都成功，且**沒有任何一層有任何狀態的 PR**（Stack 由 PR 組成，沒有 PR 就沒有 Stack 能持有這條 chain），或每個 per-PR 回答都是 HTTP 200 空清單。**`link` 以 `0` 結束後不適用**——它只在 Stack 建好後才回報成功，這時查得空清單是下一列的矛盾 | 沒有 Stack 持有這條 chain |
| **unverifiable** | 任何讀取失敗——**`404` 也算**——多個 stack、run 與核准的 chain 不符、或 `link` 以 `0` 結束卻什麼都沒查到 | 什麼都沒確立 |

**執行後的 `404` 永遠不是「不存在」。** GitHub 對 token 看不到的資源與未開放的功能都回 `404`，而 extension 把這個 API 的每一個 `404` 都轉成 exit `9`，不分辨兩者（`listStacksSafe`、`createLink`）。所以可用性在執行前就定案；執行後的 `404` 只是一次失敗的讀取。

**exit 與結果要一起讀**——Stack 存在不代表這次指令做完了被核准的事（`link` 的 atomic push 被拒時，先前的 Stack 原封不動）：

| exit | 結果 | 判定 |
|------|------|------|
| `0` | `confirmed`，且每項核准的 PR 變更都讀回如核准 | **原生成功** |
| `0` | `confirmed`，但有讀回與核准不符 | **partial**——Stack 持有 chain，但某項核准的 PR 變更沒有落地；逐 PR 回報，不 fallback |
| `0` | `confirmed absent` | `--push`：已推，GitHub 上尚無 Stack 包含這些分支。`submit`：**已發佈但沒有 Stack**——它的 Stack 同步是 best-effort，exit 不檢查它（`cmd/submit.go` `runSubmit`／`syncStack`），回報為 incomplete、不是成功。`link` 在 Stack 步驟失敗時一律回錯誤，所以對 `link` 這組合是 `unverifiable` |
| 非 0 | `confirmed` | **對既有 Stack 執行失敗**——逐層回報失敗，Stack 的存在不是變更已生效的證據；不 fallback |
| 非 0 | `confirmed absent` | **沒有 Stack**——委派時唯一可以接 fallback 的已執行結果（呼叫端先重查 PR：`link` 在建 Stack 之前就已推分支、建 PR） |
| 任意 | `unverifiable` | **停止**——回報、對帳，不 fallback |

**只有 `confirmed absent` 是關於「不存在」的事實**，`unverifiable` 永遠不得讀成它。readiness 也從這裡讀：`Draft` 欄取 `confirmed` 回應裡的 `draft`，否則逐一 `gh pr view --json isDraft`——執行後讀回，不從旗標推導。回應形狀是從 extension 的 decoder 讀出的，**尚未對實際 repository 實測**；形狀不符一律算 `unverifiable`。

### 3.6 Phase D 路由（`/create-pr --stack`）

| 偵測結果 | 動作 |
|----------|------|
| **`--update`（任何偵測結果）** | **一律 Phase C**。`--update` 的定義是逐層刷新標題與內文，而兩個原生發佈形式**都不改既有 PR 的標題或內文**：`gh stack link` 推分支、重接 PR（`cmd/link.go`），`gh stack submit --auto` 只替它**新建**的 PR 生成文字（`cmd/submit.go` `ensurePR`／`createPR`）。委派在這裡，只會推了一次卻一個字都沒刷新 |
| **任一層只存在於 remote**（Phase A 的 remote-only 列也判 `IN_SYNC`） | **Phase C**，這列排在偵測列之前。`/gh-stack` Phase 2 要求每個分支運算元都存在於本地，否則中止——委派這種鏈的結果是一個 PR 都沒建；Phase C 反而處理得了，它的每層內容本來就取自 fetch 後的 remote refs |
| 任一層的名稱**能被解析成整數**（`^[+]?[0-9]+$`，含前導 `+`） | **Phase C**，排在偵測列之前。`gh stack link` 會先把數字運算元當 PR（第一個位置時先當 Stack）號碼解析，原生路徑會去動 PR #400 而不是分支 `400`；`/gh-stack` Phase 2 本來就會拒絕，先在這裡導走，報告才不會是那個拒絕 |
| present（無 `--update`，且每層都有本地分支） | 提供原生路徑並**委派** `/gh-stack`，且委派**帶著本次的模式**：dry-run 送 `/gh-stack --base '<解析後的 target branch>' <layer>…`（唯讀），`--execute` 送 `/gh-stack --link --open --base '<解析後的 target branch>' …`——**解析後的 base 必須跟著 chain 一起過去**：Phase A/B 是拿它驗證每一層的，而 `gh stack link` 少了 `--base` 會把最底層接到 repository 預設分支，正是 § Phase B 一再警告的錯 base，只是這次發生在一次已核准的 push 背後——**是 `--link` 不是 `--submit`**：`gh stack submit` 不吃運算元，它發佈的是 extension 在 `.git/gh-stack` 自己追蹤的 stack，而那要靠 `init`/`add`（皆不在授權內）才會存在；`gh stack link` 才是吃 chain 的那個。`--open` 也不是裝飾，少了它新 PR 會是 draft，而它取代的 Phase C 建的是 review-ready。create-pr 本身仍不執行任何 `gh stack` 子命令 |
| absent | **依模式而定**。`--execute`：提供安裝（即 `/gh-stack` Phase 1 的 AskUserQuestion，絕不靜默安裝）；拒絕或失敗 → Multi-PR。**dry-run：不提供安裝、也不安裝**——只回報缺少 extension 並走 Multi-PR，因為留下軟體的預覽不是預覽（`/gh-stack` Phase 1 同此：唯讀 run 只回報 absent） |
| 偵測本身失敗 | 視為 absent → Multi-PR |
| `/gh-stack` 在**它自己的 Phase 2** 拒絕（執行任何東西之前的 STOP——可用性探測回 `404` 的 *native unavailable* 也在這列：未開放 Stacks、或這個 token 看不到的 repository，在任何變動之前就被攔下） | 回報它說了什麼，然後走 **Phase C**——什麼都沒被變動，所以 Phase B 的快照仍然是現況，**不需要重查** |
| 已執行、exit `0`，驗證為 **`confirmed`**，且每項核准的 PR 變更都讀回如核准 | 原生成功，回報 `/gh-stack` 的表。不跑 Phase C |
| 已執行、exit `0`，**`confirmed`**，但有 PR 讀回與核准不符 | **STOP**，回報為 partial——extension 改 base、改 auto-merge、轉 ready 失敗時只警告。各層已在 Stack 裡，不跑 Phase C |
| 已執行、exit **非 0**，驗證為 **`confirmed`** | **STOP**——Stack 持有這條 chain，但被核准的那個指令失敗了。逐層回報；各層已在 Stack 裡，不跑 Phase C |
| 已執行、exit **非 0**，驗證為 **`confirmed absent`**（沒有 Stack 持有任何一層的 PR，或根本沒有任何一層有 PR——`link` 在建 PR 之前就失敗） | 回報實況 → **重跑 Phase B 的 existing-PR 查詢**再讓 Phase C 依新結果路由：`link` 在建 Stack 之前已經推了分支、逐一建了 PR，那些層只存在於重查結果裡，讀舊快照會對已有 PR 的 head 再 `gh pr create` |
| 已執行，驗證為 **`unverifiable`** | **STOP**，回報、不路由。GitHub 沒確認的 Stack 仍可能存在，在它上面跑 Phase C 會讓每層被改第二次。使用者對帳後重跑，流程可重入 |

**D0（偵測）跑在 Phase C 之前，D1（路由）決定由誰發佈。** Phase C 與原生路徑是**互斥**的：Phase C
自己會逐層建 chained-base PR，先跑它再把同一批分支委派給 `gh stack link`，等於每層被動兩
次。委派發生在 **Phase B 驗證之後**，並以驗證過的 chain 作為引數：validate 不了的 chain 不交給會
push 的 skill。

## 4. Risks and Dependencies

| 風險 | 處置 |
|------|------|
| extension 是外部可執行檔，且會被授權執行 force push | slug 為字面值 `github/gh-stack`（不取自變數、引數或搜尋結果）；以身分比對而非 `stack` 子字串；安裝後以重新列舉驗證 |
| `--auto` 的 PR 內文由 commit 訊息生成，可能夾帶 AI trailer | Phase 4 對每個新建/更新的 PR 跑 `/create-pr` § 7b 驗證循環，發現即以 `gh pr edit` 補救一次並重驗 |
| `gh stack push` 非原子 | 逐分支回報，修好被拒的那支再跑；**不得**為了越過被拒的 lease 而加大 force 形式 |
| **push 形式由 extension 組成**——`pre-push-gate.sh` 註解說 bare `--force` 的把關「在呼叫端」，但本工作流組 flag 的是 extension 不是呼叫端，那層把關結構性缺席 | 以 extension v0.1.1 **原始碼**確認（§ 3.3）：`link` 不 force，`push`/`submit` 為逐分支帶值的 lease，refspec 完整限定，無 bare `--force`。讀法綁定版本：其他版本的 mutating run 在核准前即停（trace 只能事後記錄，不是閘門）。任何版本的原始碼出現 bare `--force` 即停用該子命令、回報 maintainer（`skills/gh-stack/SKILL.md` § Force form） |
| **Stacks REST API 的回應形狀未實測**——§ 3.5 的欄位是從 extension 的 Go decoder 讀出的 | 形狀不符一律 `unverifiable`，而 `unverifiable` 是 STOP、不走 fallback；首次實跑時記錄實際回應 |
| upstream CLI 介面變動 | 三個授權子命令與 exit code 表寫進 skill 與測試；upstream 改變時測試不會自己變綠，但會在首次實跑時暴露 |

依賴：`gh` ≥ 2.0（實測 2.97.0）、`github/gh-stack` extension、GitHub Stacked PR preview。

## 5. Work Breakdown

| # | 項目 | 狀態 |
|---|------|------|
| 1 | Anchor #4 四個工作流 + Push safety / Efficacy Boundary 列舉 | ✅ |
| 2 | 兩支 pin 測試同 commit 更新 | ✅ |
| 3 | `skills/gh-stack/SKILL.md` | ✅ |
| 4 | `test/skills/gh-stack.test.js` | ✅ |
| 5 | Phase D 改寫（含 D0/D1 拆分）、Phase B 來源收窄、Phase C dry-run 段改寫、§ Authorization Boundary 重新分割、§ Update Flow 的授權邊界（`gh stack rebase --upstack` 仍在所有 grant 之外，push 半段改走 `/gh-stack --push`）+ create-pr 測試更新 | ✅ |
| 6 | catalog / README（含五個在地化版本） | ✅ |
| 6b | 其他 carrier 同步：`skills/push-ci/SKILL.md`、`skills/smart-rebase/SKILL.md`、`scripts/pre-push-gate.sh` 註解、以及三者的 pin 測試 | ✅ |
| 7 | 首次實跑（安裝 + `link`/`submit`），以 Stacks API 確認 Stack 物件與回應形狀、確認 attribution。push 形式與完整 mutation 面已由 v0.1.1 原始碼確認；其他版本在核准前即停 | ⏳ 待使用者核准後執行 |
| 8 | 2026-09-23 Codex 第二意見修正：`view` 移出授權（會寫檔）；Phase 2 讀 `.git/gh-stack` 取拓撲、核准以整個 stack 為上界（不預測 extension 會跳過哪些層），並在執行前探測 Stacks 可用性（`404` 即 STOP、可 fallback）；Phase 4 改以 Stacks API 三態驗證並與 exit 兩軸一起讀，執行後的 `404` 一律 `unverifiable`、沒有任何 PR 即 `confirmed absent`；push 形式依原始碼逐子命令陳述並綁定版本；`link` 不帶 `ALLOW_FORCE_WITH_LEASE`、不問 attestation；Draft 欄執行後讀回；`stack-mode.md` 補救指令改完整 refspec；`smart-rebase` 三處禁令與 § Permissions 對齊 | ✅ |

## 6. Testing Strategy

| 層級 | 檔案 | claim |
|------|------|-------|
| Rules pin | `test/rules/discretion-tiers.test.js` | 授權區塊 byte pin 含第四條 grant；`AUTHORIZED_GRANTS` 逐指令比對；新增兩個 widening fixture（加 `gh stack sync`、拔掉核准憑證）必須被偵測 |
| Rules pin | `test/rules/override-contract.test.js` | Anchor Register 全文 pin |
| Skill | `test/skills/gh-stack.test.js` | 由 `bash`/`sh` fence 抽出實際會執行的子命令，斷言封閉於三個授權子命令（`GRANTED`；`view` 列在 `UNGRANTED`）；fence 逐行追蹤開合，因為縮排在清單項目裡的 fence 會讓單一 regex 配對錯位、把散文當成指令掃進去；附**負向控制**（把 fence 內換成 `gh stack sync` 必須被抽取器看見），以及「未標語言的 fence 不得含指令形狀的行」這條防偷渡斷言與其負向控制。另 pin：Force form 的逐子命令表與版本綁定、直接讀檔的狀態表、Stacks API 三態驗證與「`unverifiable` 不 fallback」 |
| Skill | `test/skills/create-pr.test.js` | Phase D 路由、委派不等於執行、fallback 方向、mutating-command allowlist |
| Carrier pin | `test/skills/push-ci.test.js`、`test/skills/smart-rebase.test.js`、`test/scripts/pre-push-gate.test.js` | 三處重述面的 pin：push-ci 授權區塊的 SKILL_DIGEST（授權文件變更必須有人看過）、smart-rebase closed set 的逐行 byte pin、以及 pre-push-gate 的 caller-layer pin——最後這支原本硬寫兩個 skill 且選擇器只認 `git push`，本案擴到第三個工作流並改以 `gh stack` 命令形狀辨識 |

驗證器的一處調整值得記錄：`COMMAND_SPAN` 會把 `/gh-stack` 這個**名字**當成指令 span 捕捉（它含獨立的
`gh`），而前三個工作流剛好不會。名字本來就另由 `expectedNames` 比對，所以在 position 0 且等於名字時丟
棄——只丟那一個位置、只在等於名字時丟，其餘 span 一律保留。

## 7. Open Questions

- [ ] **Q1**：首次實跑後，`gh stack submit --auto` 是否在本 repo 真的產生 Stack 物件（`create-pr-stacked`
  spec § 7 Q2 的最終答案）。本 spec 的立場是：不需要事前 rollout 訊號，送出後以 Stacks API 驗證即可；只有 `confirmed absent` 走 fallback，`unverifiable` 是 STOP（§ 3.5、§ 3.6）。
- [ ] **Q2**：`--auto` 生成的 PR 內文是否會帶 commit 訊息中的 AI trailer。若會，Phase 4 的補救循環是否
  足夠，或需要在 submit 前就改寫 commit 訊息（那會落到另一條授權面）。
- [ ] **Q3**：`gh stack sync` 是否值得以「逐步拆解 + 每步核准」的形式納入。目前答案是不——它把 fetch、
  rebase、push、prune 綁成一次核准。

## References

- [Request ticket](./requests/2026-09-18-gh-stack-native-integration.md)
- `skills/gh-stack/SKILL.md`、`skills/create-pr/references/stack-mode.md` § Phase D
- `rules/discretion.md` § Anchor Register #4、§ Efficacy Boundary；`rules/git-workflow.md` § Exception、§ Push safety
- [`github/gh-stack` README](https://github.com/github/gh-stack) — 子命令與 local tracking 於 `.git/gh-stack`。**行為以原始碼為準**（v0.1.1）：`cmd/link.go`、`cmd/push.go`、`cmd/submit.go`、`cmd/view.go`、`cmd/utils.go`（exit 0–10）、`internal/git/gitops.go`、`internal/github/github.go`、`internal/stack/stack.go`
- [GitHub Changelog — Stacked pull requests public preview](https://github.blog/changelog/2026-07-30-stacked-pull-requests-are-now-in-public-preview/)
