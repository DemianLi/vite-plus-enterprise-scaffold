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

<!-- 以下為手寫內容，刻意放在 VITE PLUS END 標記之後 —— `vp` 只重寫標記之間。 -->

## Agent skills

這一節設定 [mattpocock/skills](https://github.com/mattpocock/skills) 那套工程技能
（`/triage`、`/to-tickets`、`/to-spec`、`/wayfinder` 等）在本 repo 的接線。
細節在 `docs/agents/` 底下，這裡只放一句話與指路。

### Issue tracker

Issue 住在本 repo 的 GitHub Issues，一律用 `gh` CLI 操作。見 `docs/agents/issue-tracker.md`。

### Triage labels

沿用五個標準名稱（`needs-triage`／`needs-info`／`ready-for-agent`／`ready-for-human`／`wontfix`），
不另立對映。見 `docs/agents/triage-labels.md`。

### Domain docs

單一 context（根層 `CONTEXT.md` + `docs/adr/`）。⚠️ **兩者今天只有骨架，內容未遷** ——
決策紀錄的 439KB 全部還在 `DECISIONS.md`，探索時要讀的是那一份。遷移是長期工作，
見 `docs/agents/domain.md` 與 [ADR-0001](docs/adr/0001-migrate-decisions-to-adr.md)。

⚠️ **這段 ⚠️ 文字在遷移完成時要一併刪除** —— 它是 ADR-0001 驗收條件的第三個對象。
