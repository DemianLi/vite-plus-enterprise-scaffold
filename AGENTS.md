<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

---

## 這個腳手架對 agent 的契約

> ⚠️ **這一節在標記之外，`vp` 重新產生上面那段時不會動到它。**
> 加這一節的舉證責任寫在 `DECISIONS.md` 的 **C109 §七** —— 動它之前先讀那一則，
> 以及它引的 **C93**（上一次標記外的手寫內容被撤回的經過）。

**給拉 v1 去做案子的團隊：這一節是給你們的 agent 讀的。** 它擋下的事情發生在
你們的樹上，痛的也是你們。

### 四條規則

1. **任務結束前跑 `vpr ready`，全綠才算完成。**
   = `vp check` ＋ 全套測試 ＋ 建置 ＋ `vpr gate`。

2. **不得修改設定或門檻來達成綠燈。**
   閘門紅了，要改的是程式碼。⚠️ 這一條是前一條的前提 —— 一個可以被受檢者
   自己調鬆的門檻，量到的只是它自己。**如果你判斷某個門檻確實訂錯了，
   停下來告訴人，不要自己改。**

3. **「完成」的定義在驗收規格裡，不在 diff 裡。**
   一個功能做完了沒有，看它的規格場景綠了幾條 —— 不看寫了多少行、
   也不看單元測試的覆蓋率。⚠️ 規格是人寫給你讀的需求；通過率是你交回給人的
   進度。**人審的是「什麼叫做對」，不是「它怎麼寫的」。**

4. **不得修改 `specs/` 底下的任何檔案。**
   `.feature` 是需求，由人寫。⚠️ **包括不得自己加上 `@待辦`** ——
   那個標籤的意思是「有定義、還沒做」，跳過執行、不擋 CI。做不出來時
   自己標一個上去，就把一條失敗的驗收變成了一條綠燈。
   做不到就停下來說做不到，不要動規格。

### 為什麼是這四條

前兩條讓「人不逐行讀 agent 寫的程式碼」這件事有依據 —— 依據不是信任，
是一組不能被繞過的機械檢查。第三條決定人把省下來的注意力放在哪裡：
**放在規格上。**

第四條是第三條的前提，而且**它沒有機制在守** —— 沒有任何閘門看得出
`@待辦` 是人標的還是 agent 標的。擋它的只有這一句話，以及人讀規格的 diff。
這件事寫在這裡，是為了讓你知道它是敞著的：**這一條靠的是你。**

完整的層級模型（哪一層守什麼、哪一層下發不了、哪一層是你們自己的責任）
見 [TESTING.md](TESTING.md)。
