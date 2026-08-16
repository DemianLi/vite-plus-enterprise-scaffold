/**
 * 探針：**只**出現在這份 `.ts` 裡的類別。
 *
 * ── 這證明什麼 ──────────────────────────────────────────────────────
 *
 * `createUiTheme()` 收的是 class 字串，而各案會把它寫在 composition root
 * （`apps/*\/src/main.ts`）裡。那些字串能不能變成真的 CSS，取決於
 * `platform/ui` 的 `@source` 掃不掃得到 `.ts`。
 *
 * 掃不到的症狀是本 repo 已經踩過一次的那一種：**建置成功、CSS 還變大、
 * 但那些類別一個都不存在**，按鈕變成沒有樣式的方塊而沒有任何閘門說話。
 *
 * 所以這裡刻意挑一個**整個 repo 其他地方都沒用過**的類別。用一個
 * 元件裡已經有的（例如 `bg-surface-hover`）會讓這條斷言恆真 ——
 * 產物裡有它，但那是 UiButton.vue 帶進來的，不是這份 .ts。
 */
export const TS_ONLY_PROBE = ["ring-focus"];
