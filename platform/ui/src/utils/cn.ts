import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合併 Tailwind class，後者覆蓋前者。
 *
 * ── 為什麼需要 twMerge 而不是字串串接 ──────────────────────────────
 *
 * Tailwind 的 class 之間沒有優先順序概念，`"p-2 p-4"` 的結果取決於
 * **產生的 CSS 裡誰排在後面**，不是誰寫在後面。於是「元件預設 p-2、
 * 使用端傳 p-4 想覆蓋」這件事會**看情況成功或失敗** —— 而且失敗時沒有錯誤，
 * 只是間距不對。
 *
 * `twMerge` 認得 Tailwind 的類別族，同族只留最後一個。這不是便利工具，
 * 它是「使用端能不能覆蓋元件樣式」這條契約成立的前提。
 *
 * ── 為什麼不裝 class-variance-authority ────────────────────────────
 *
 * 變體用純物件查表就夠（見 Button.vue）。少一個相依就是少一筆 SCA 範圍、
 * 少一筆鏡像清單、少一次 --capture —— 與 D2 當初不裝 YAML parser 的同一條理由。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
