import { useCallback, useEffect, useState, type ReactNode } from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { UiButton } from "@org/ui";
import { config } from "@org/config";

/**
 * 本機 session 的建立入口（**只在 dev 存在**）。
 *
 * ── 為什麼需要它 ────────────────────────────────────────────────────
 *
 * 跑起來的應用沒有登入畫面，而 mock 的所有資料端點都要 session ——
 * 於是預設狀態下**連示範切片都停在錯誤分支**。
 *
 * ── 為什麼刻意不是一個登入畫面 ──────────────────────────────────────
 *
 * 一個**看起來很完整**的認證服務，會被複製到 production。
 * 一個有帳號密碼欄位的登入頁正是那個形狀。所以這裡只有一顆按鈕，
 * 而且它自己說明白：**production 的登入由組織的 gateway 處理，
 * 那裡不會有這個畫面。**
 *
 * ── 為什麼不讓 mock 自動建 session ──────────────────────────────────
 *
 * 那樣的話「登入 → 帶 cookie → 被 CSRF 擋 → 補標頭 → 通過」這條路徑
 * 在本機**永遠走不到** —— 而它走得通正是這整套東西存在的理由。
 * 按一下按鈕，那條路徑就真的被走了一次。
 *
 * ── 為什麼字串留在這支、而且在載入時才登記 ──────────────────────────
 *
 * 用自己的 i18next 命名空間、在這個模組載入時才加進去，而不是放進 `main.tsx` 的
 * `SHELL_MESSAGES`：這個元件在 production 建置裡整個消失（見 `App.tsx` 的動態
 * import），字串放進全域訊息表的話會留在每一個 locale 的產物裡。
 */
const NAMESPACE = "devSession";

i18next.addResourceBundle("zh-TW", NAMESPACE, {
  checking: "正在檢查本機 session…",
  anonymous: "尚未建立本機 session —— 資料端點會回 401，畫面停在錯誤分支。",
  create: "建立本機 session",
  authenticated: "本機 session 已建立（{{user}}）。權限：{{permissions}}",
  unreachable: "連不上 BFF（{{origin}}）。確認本機的 BFF 已經啟動（位址由 BFF_ORIGIN 設定）。",
  notProduction:
    "這一格只在 dev 存在。production 的登入由組織的 gateway 處理，那裡不會有這個畫面。",
});
i18next.addResourceBundle("en", NAMESPACE, {
  checking: "Checking local session…",
  anonymous: "No local session yet — data endpoints return 401 and views stay on the error branch.",
  create: "Create a local session",
  authenticated: "Local session ready ({{user}}). Permissions: {{permissions}}",
  unreachable:
    "Cannot reach the BFF ({{origin}}). Make sure a local BFF is running (address set by BFF_ORIGIN).",
  notProduction:
    "Dev only. In production the organisation's gateway handles sign-in; this panel does not exist there.",
});

type State = "checking" | "anonymous" | "authenticated" | "unreachable";

interface Session {
  readonly user: string;
  readonly permissions: readonly string[];
}

const sessionUrl = `${config.apiBasePath}/session`;

export default function DevSession(): ReactNode {
  const { t } = useTranslation(NAMESPACE);
  const [state, setState] = useState<State>("checking");
  const [session, setSession] = useState<Session>({ user: "", permissions: [] });

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(sessionUrl);
      if (response.status === 401) {
        setState("anonymous");
        return;
      }
      const payload = (await response.json()) as { user?: string; permissions?: string[] };
      setSession({ user: payload.user ?? "", permissions: payload.permissions ?? [] });
      setState("authenticated");
    } catch {
      // fetch 只有在連不上時才 reject —— 401 是一個成功的回應。
      // 這兩種要分開講：一個是「沒登入」，另一個是「BFF 沒跑」。
      setState("unreachable");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createSession(): Promise<void> {
    // 登入是 CSRF 的例外（拿到 session 之前不可能有 token），
    // 所以這裡不帶 X-XSRF-TOKEN —— 契約的 csrf-required 驗的是其他方法。
    await fetch(sessionUrl, { method: "POST" });
    await refresh();
  }

  // 代幣而不是原始顏色 —— 各案換配色時這一格要跟著走。
  return (
    <aside
      className="dev-session flex flex-wrap items-center gap-3 border-b border-line bg-surface-hover px-4 py-2 text-fg"
      aria-label={t("notProduction")}
    >
      {state === "checking" ? <p>{t("checking")}</p> : null}
      {state === "authenticated" ? (
        <p>
          {t("authenticated", { user: session.user, permissions: session.permissions.join("、") })}
        </p>
      ) : null}
      {state === "unreachable" ? <p>{t("unreachable", { origin: sessionUrl })}</p> : null}
      {state === "anonymous" ? (
        <>
          <p>{t("anonymous")}</p>
          <UiButton variant="primary" size="sm" onClick={() => void createSession()}>
            {t("create")}
          </UiButton>
        </>
      ) : null}

      <p className="text-xs text-fg-muted">{t("notProduction")}</p>
    </aside>
  );
}
