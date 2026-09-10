import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 這個檔存在＝這棵樹是 fork（C217 §三）。
 *
 * ⚠️ **只看存在，不看內容**（C217 §十）：內容一旦參與判定，辨別子就變成兩個，
 * 而兩個辨別子分岔的時候兩邊都是綠的。
 *
 * ⚠️ 由 fork 放，上游永遠沒有 —— 所以團隊合併上游時它不會衝突（C217 §二）。
 * 上游誤放的那個方向是安靜的，守它的是 tier1 那一步「上游不得有 fork 標記」。
 */
export const FORK_MARKER = ".scaffold-fork";

export type Side = "upstream" | "fork";

export function sideOf(root: string): Side {
  return existsSync(join(root, FORK_MARKER)) ? "fork" : "upstream";
}

/**
 * 經過選擇器的 script。每一個都要有 `<名字>:upstream` 與 `<名字>:fork` 兩條，
 * 兩條的內容由 `gate-roster` 從名冊推導、逐字比對（C217 §四）。
 */
export const SELECTABLE = ["gate", "ready"] as const;
export type Selectable = (typeof SELECTABLE)[number];

export function isSelectable(name: string): name is Selectable {
  return (SELECTABLE as readonly string[]).includes(name);
}

export function targetScript(name: Selectable, side: Side): string {
  return `${name}:${side}`;
}
