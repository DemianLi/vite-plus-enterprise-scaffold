import {
  BANNED_DIRECT_DEPENDENCIES,
  ALLOWED_VERSION_PROTOCOLS,
  slicePackageName,
} from "@org/slice-kit/contract";

import { collect, type Finding } from "../finding.ts";

/**
 * 宣告出來的相依：跨切片依賴（D4）、HTTP 客戶端（D8）、版本治理（D6）。
 *
 * ⚠️ **三條規則刻意住在同一個迴圈裡，不要拆成三支。**
 * 拆開的話輸出順序會從「逐個相依」變成「逐條規則」——
 * 一個宣告了 `"@org/feature-shipment": "1.0.0"` 的切片，
 * 現在印的是〔跨切片、版本〕，拆開之後會變成〔跨切片〕…〔版本〕，
 * 中間夾著別的相依的訊息。報告的排序是使用者看得到的東西，
 * 而這次拆解唯一的驗收標準就是輸出一字不差。
 */
export function checkSliceDependencies(
  pkg: Record<string, unknown>,
  dir: string,
  slice: string,
  sliceNames: ReadonlySet<string>,
): Finding[] {
  return collect((fail) => {
    const expectedName = slicePackageName(dir);

    // 展開 undefined 在物件字面值裡是 no-op，因此不需要 `?? {}` 後備值。
    const allDeps: Record<string, string> = {
      ...(pkg["dependencies"] as Record<string, string> | undefined),
      ...(pkg["devDependencies"] as Record<string, string> | undefined),
      ...(pkg["peerDependencies"] as Record<string, string> | undefined),
    };

    for (const [depName, depVersion] of Object.entries(allDeps)) {
      if (depName === expectedName) continue;

      // 以 features/ 目錄的**實際內容**判定，而非用正則猜測套件名是不是切片。
      // 正則會有偽陽性（platform/ 裡剛好同前綴的套件會被誤判），目錄清單不會。
      if (sliceNames.has(depName)) {
        fail(
          slice,
          "跨切片依賴",
          `依賴了另一個切片 "${depName}"`,
          "切片之間禁止互相依賴（D4）。改走兩條合法路徑之一：" +
            "往上到 apps/ 層組裝，或往下把共用契約抽到 platform/",
        );
      }

      if ((BANNED_DIRECT_DEPENDENCIES as readonly string[]).includes(depName)) {
        fail(
          slice,
          "HTTP 客戶端",
          `直接依賴 "${depName}"`,
          "一律走 @org/http-client（D8）。直接用會讓 CSRF 標頭與錯誤處理每片各做一套，" +
            "稽核時無從證明一致性",
        );
      }

      // ── D6：版本必須走 catalog ────────────────────────────────────────
      const usesAllowedProtocol = ALLOWED_VERSION_PROTOCOLS.some((p) => depVersion.startsWith(p));
      if (!usesAllowedProtocol) {
        fail(
          slice,
          "版本治理",
          `"${depName}": "${depVersion}" 寫死了版本`,
          "改用 catalog:（D6）。共用 lockfile 下，寫死版本會讓 CVE 同步升級出現漏網",
        );
      }
    }
  });
}
