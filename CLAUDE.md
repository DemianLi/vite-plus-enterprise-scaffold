# Claude Code 專案指引

本專案的 agent 規範**單一來源是 [AGENTS.md](AGENTS.md)**（Codex／Cursor／Copilot
等工具也讀同一份，見 [HANDOFF.md](HANDOFF.md) 的交接流程）。不要在這裡複製規則，
只在這裡放 Claude Code 專屬的東西。

⚠️ AGENTS.md 的 `<!--VITE PLUS START-->` … `<!--VITE PLUS END-->` 區塊由 `vp`
產生；`vp` 只重寫標記之間的內容。手寫內容一律加在 END 標記**之後**。

## ⚠️ 外掛 skill 會叫你造這棵樹已經裁掉的東西

`mattpocock-skills` 那一套（`domain-modeling`、`setup-matt-pocock-skills`）規定的
產出是 `CONTEXT.md` ＋ `docs/adr/` ＋ `docs/agents/*.md`，而**這棵樹裁過不造**
（C145 §二）—— 照它做之前先讀 `DECISIONS-2.md` 的 **C153 §三**，那張表逐項寫了
差在哪、為什麼。

⚠️ 這一句**沒有閘門在守**，同 [AGENTS.md](AGENTS.md) 規則四。

@AGENTS.md
