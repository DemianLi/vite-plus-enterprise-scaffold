<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { UiButton } from "@org/ui";
import { config } from "@org/config";

/**
 * 本機 session 的建立入口（**只在 dev 存在**）。
 *
 * ── 為什麼需要它 ────────────────────────────────────────────────────
 *
 * 跑起來的應用沒有登入畫面，而 mock 的所有資料端點都要 session ——
 * 於是預設狀態下**連腳手架自己的示範切片都是錯誤分支**（#95 的阻斷級 ②c）。
 * 採用演練花了將近一半的時間在這一格。
 *
 * ── 為什麼刻意不是一個登入畫面 ──────────────────────────────────────
 *
 * `platform/bff-mock` 的檔頭寫著它為什麼停在參考實作：
 * 「腳手架裡一個**看起來很完整**的認證服務，會被複製到 production。」
 * 一個有帳號密碼欄位的登入頁正是那個形狀。所以這裡只有一顆按鈕，
 * 而且它自己說明白：**production 的登入由組織的 gateway 處理，
 * 那裡不會有這個畫面。**
 *
 * ── 為什麼不讓 mock 自動建 session ──────────────────────────────────
 *
 * 那樣的話 D8 那條路徑（登入 → 帶 cookie → 被 CSRF 擋 → 補標頭 → 通過）
 * 在本機**永遠走不到** —— 而它走得通正是這整套東西存在的理由。
 * 按一下按鈕，那條路徑就真的被走了一次。
 *
 * ── 為什麼字串留在這個元件裡 ────────────────────────────────────────
 *
 * 用 vue-i18n 的 local scope，而不是 `main.ts` 的 `SHELL_MESSAGES`：
 * 這個元件在 production 建置裡整個消失（見 `App.vue` 的動態 import），
 * 字串放進全域訊息表的話會留在每一個 locale 的產物裡。
 */

const { t } = useI18n({
  useScope: "local",
  messages: {
    "zh-TW": {
      checking: "正在檢查本機 session…",
      anonymous: "尚未建立本機 session —— 資料端點會回 401，畫面停在錯誤分支。",
      create: "建立本機 session",
      authenticated: "本機 session 已建立（{user}）。權限：{permissions}",
      unreachable: "連不上 BFF（{origin}）。先在另一個終端機跑 `./node_modules/.bin/vpr bff`。",
      notProduction:
        "這一格只在 dev 存在。production 的登入由組織的 gateway 處理，那裡不會有這個畫面。",
    },
    en: {
      checking: "Checking local session…",
      anonymous:
        "No local session yet — data endpoints return 401 and views stay on the error branch.",
      create: "Create a local session",
      authenticated: "Local session ready ({user}). Permissions: {permissions}",
      unreachable: "Cannot reach the BFF ({origin}). Run `./node_modules/.bin/vpr bff` first.",
      notProduction:
        "Dev only. In production the organisation's gateway handles sign-in; this panel does not exist there.",
    },
  },
});

type State = "checking" | "anonymous" | "authenticated" | "unreachable";

const state = ref<State>("checking");
const user = ref("");
const permissions = ref<readonly string[]>([]);

const sessionUrl = `${config.apiBasePath}/session`;

async function refresh(): Promise<void> {
  try {
    const response = await fetch(sessionUrl);
    if (response.status === 401) {
      state.value = "anonymous";
      return;
    }
    const payload = (await response.json()) as { user?: string; permissions?: string[] };
    user.value = payload.user ?? "";
    permissions.value = payload.permissions ?? [];
    state.value = "authenticated";
  } catch {
    // fetch 只有在連不上時才 reject —— 401 是一個成功的回應。
    // 這兩種要分開講：一個是「沒登入」，另一個是「BFF 沒跑」。
    state.value = "unreachable";
  }
}

async function createSession(): Promise<void> {
  // 登入是 CSRF 的例外（拿到 session 之前不可能有 token），
  // 所以這裡不帶 X-XSRF-TOKEN —— 契約的 csrf-required 驗的是其他方法。
  await fetch(sessionUrl, { method: "POST" });
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <aside class="dev-session" :aria-label="t('notProduction')">
    <p v-if="state === 'checking'">{{ t("checking") }}</p>

    <template v-else-if="state === 'authenticated'">
      <p>{{ t("authenticated", { user, permissions: permissions.join("、") }) }}</p>
    </template>

    <template v-else-if="state === 'unreachable'">
      <p>{{ t("unreachable", { origin: sessionUrl }) }}</p>
    </template>

    <template v-else>
      <p>{{ t("anonymous") }}</p>
      <UiButton variant="primary" size="sm" @click="createSession">{{ t("create") }}</UiButton>
    </template>

    <p class="dev-session__note">{{ t("notProduction") }}</p>
  </aside>
</template>

<style scoped>
/*
 * 代幣而不是原始顏色 —— `tools/theme-verify` 的引用檢查會抓指向不存在
 * 代幣的 var()，而各案換配色時這一格要跟著走。
 */
.dev-session {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background-color: var(--color-surface-hover);
  color: var(--color-fg);
  border-bottom: var(--border-width-control) solid var(--color-line);
}

.dev-session__note {
  color: var(--color-fg-muted);
  font-size: 0.75rem;
}
</style>
