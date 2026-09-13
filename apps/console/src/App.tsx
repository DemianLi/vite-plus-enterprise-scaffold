import { lazy, Suspense, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";

import type { MenuLink } from "./router.ts";

/**
 * 本機 session 的建立入口。
 *
 * ⚠️ **這個三元式的形狀是刻意的，不是風格。** `import.meta.env.DEV` 在
 * production 建置期被替換成字面的 `false`，於是整條 `import()` 連同
 * `DevSession.tsx` 一起被搖掉 —— 一個「看起來很完整」的登入相關畫面
 * 不會躺在 production 的產物裡。
 *
 * 寫成 `{isDev && <DevSession />}` 加靜態 import 的話畫面行為一樣，但程式碼會照樣進 bundle。
 */
const DevSession = import.meta.env.DEV ? lazy(() => import("./DevSession.tsx")) : undefined;

export function App({ links }: { readonly links: readonly MenuLink[] }): ReactNode {
  const { t } = useTranslation();

  return (
    <>
      {DevSession === undefined ? null : (
        <Suspense fallback={null}>
          <DevSession />
        </Suspense>
      )}

      <div className="grid min-h-screen grid-cols-[12rem_1fr] gap-6">
        {/*
          略過導覽（WCAG 2.4.1 的常見做法）。平時是 sr-only，拿到焦點才現形。
          沒有它的話，鍵盤使用者每換一頁都要先 Tab 過整條側邊欄才碰得到內容 ——
          而側邊欄的長度會隨切片數成長，所以這件事只會愈來愈糟。

          ⚠️ 這一段與下面的 aria-label，無障礙的 lint 規則一個都看不到：那些規則
          比對的是原生元素與屬性，「這個頁面缺一個略過導覽的連結」不是任何一個
          元素的屬性問題。
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-surface focus:px-4 focus:py-2 focus:text-fg"
        >
          {t("shell.skipToContent")}
        </a>

        {/*
          aria-label 而不是不寫：一個頁面出現第二個 <nav> 的那天（頁尾、麵包屑），
          輔具的地標清單上會是兩個都叫「navigation」的項目，而那時沒有人會想到
          要回來改這裡。字串走 i18n，理由見 main.tsx 的 SHELL_MESSAGES。
        */}
        <nav aria-label={t("shell.nav")}>
          {/* 側邊欄由各切片自己宣告的 menu 組成。apps/ 不知道任何一個切片的內部細節。 */}
          <ul className="m-0 list-none p-4">
            {links.map((link) => (
              <li key={link.routeName}>
                <NavLink to={link.path}>{t(link.labelKey)}</NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          tabIndex={-1} 是必要的，不是裝飾：少了它，`#main` 只會捲動畫面，
          焦點仍留在略過連結上 —— 於是下一次 Tab 又回到導覽的第一項，
          整個略過連結等於沒有作用。這個行為在 Chrome 與 Safari 上都會發生。
        */}
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
