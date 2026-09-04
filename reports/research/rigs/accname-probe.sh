#!/usr/bin/env bash
# 探針：happy-dom 底下用 dom-accessibility-api 算可及名稱，量得到 C89 §三 那組
# 「缺陷與非缺陷紅同一組」分不分得開。屬於
# ../test-boundary-minimal-packages-2026-09-02.md。
#
# ⚠️ 它不是閘門、不是測試，跑完就把自己寫進 platform/ui/tests 的那支檔案刪掉
# （中斷也刪）。刻意 100644，用 `bash` 起（同 mutation-loo.sh 的理由）。
#
# ⚠️ dom-accessibility-api 不在 platform/ui 的 devDependencies 裡，所以這裡
# 直接指到 .pnpm 存放區那一份 —— 這是探針走的路，不是交付線該走的路。
#
# 對照組：第一條「現行形狀」三個讀數都要等於 LABEL；任何一條紅就不要拿數字下判斷。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DAA="$(ls -d "$ROOT"/node_modules/.pnpm/dom-accessibility-api@*/node_modules/dom-accessibility-api | head -1)/dist/index.mjs"
TARGET="$ROOT/platform/ui/tests/accname-probe.test.ts"
OUT="$(mktemp)"
trap 'rm -f "$TARGET" "$OUT"' EXIT

cat > "$TARGET" <<TS
// @vitest-environment happy-dom
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { nextTick, type Component } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { appendFileSync } from "node:fs";
import { computeAccessibleDescription, computeAccessibleName } from "${DAA}";
import UiDropdownMenu from "../src/components/UiDropdownMenu.vue";
import UiAlertDialog from "../src/components/UiAlertDialog.vue";

enableAutoUnmount(afterEach);

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const LABEL = "訂單 #1024 的操作";
const Menu = UiDropdownMenu as Component;
const Dialog = UiAlertDialog as Component;

function q(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  expect(element, \`找不到 \${selector}\`).not.toBeNull();
  return element as HTMLElement;
}
const trigger = (): HTMLElement => q('[data-slot="dropdown-menu-trigger"]');
const menu = (): HTMLElement => q('[data-slot="dropdown-menu"]');
const srOnly = (): HTMLElement => {
  const span = trigger().querySelector("span.sr-only");
  expect(span, "觸發器裡沒有 span.sr-only").not.toBeNull();
  return span as HTMLElement;
};

/** 樹上 ⭐ 那條走的代理：aria-labelledby → 元素 → textContent。 */
function proxyName(element: Element): string {
  const id = element.getAttribute("aria-labelledby") ?? "";
  return (document.getElementById(id)?.textContent ?? "").trim();
}

async function mountMenu(): Promise<void> {
  mount(Menu, {
    props: { label: LABEL, items: [{ value: "edit", label: "編輯" }], open: true },
    attachTo: document.body,
  });
  await settle();
}

function row(label: string, values: Record<string, string>): void {
  const cells = Object.entries(values).map(([key, value]) => \`\${key}=\${JSON.stringify(value)}\`);
  // ⚠️ 不走 console.log —— \`vp test\` 的預設 reporter 不印它，讀數會安靜地消失。
  appendFileSync(process.env["ACCNAME_PROBE_OUT"] as string, \`PROBE|\${label}|\${cells.join("|")}\n\`);
}

describe("accname 探針", () => {
  it("對照組：現行形狀 —— 代理與 accname 都讀得到名字", async () => {
    await mountMenu();
    const values = {
      accname_trigger: computeAccessibleName(trigger()),
      accname_menu: computeAccessibleName(menu()),
      proxy_menu: proxyName(menu()),
    };
    row("現行形狀", values);
    expect(values.accname_trigger).toBe(LABEL);
    expect(values.accname_menu).toBe(LABEL);
    expect(values.proxy_menu).toBe(LABEL);
  });

  it("M2b 換過去（拿掉 span ＋ aria-label）—— 非缺陷", async () => {
    await mountMenu();
    srOnly().remove();
    trigger().setAttribute("aria-label", LABEL);
    await settle();
    const values = { accname_menu: computeAccessibleName(menu()), proxy_menu: proxyName(menu()) };
    row("M2b", values);
    expect(values.accname_menu).toBe(LABEL);
    expect(values.proxy_menu).toBe("");
  });

  it("M1 拿掉 span（真缺陷）", async () => {
    await mountMenu();
    srOnly().remove();
    await settle();
    const values = { accname_menu: computeAccessibleName(menu()), proxy_menu: proxyName(menu()) };
    row("M1", values);
    expect(values.accname_menu).toBe("");
    expect(values.proxy_menu).toBe("");
  });

  it("M11 名字的載體 display:none（真缺陷）", async () => {
    await mountMenu();
    srOnly().style.display = "none";
    await settle();
    const values = { accname_menu: computeAccessibleName(menu()), proxy_menu: proxyName(menu()) };
    row("M11", values);
    expect(values.accname_menu).toBe("");
    expect(values.proxy_menu).toBe(LABEL);
  });

  it("UiAlertDialog：名字與描述", async () => {
    mount(Dialog, {
      props: { open: true, title: "刪除訂單", description: "訂單 #1024 會被永久刪除", confirmLabel: "刪除" },
      attachTo: document.body,
    });
    await settle();
    const content = q('[data-slot="alert-dialog"]');
    const values = {
      name: computeAccessibleName(content),
      description: computeAccessibleDescription(content),
    };
    row("alertdialog", values);
    expect(values.name).toBe("刪除訂單");
    expect(values.description).toBe("訂單 #1024 會被永久刪除");
  });
});
TS

echo "probe → $TARGET"
echo "dom-accessibility-api → $DAA"
ACCNAME_PROBE_OUT="$OUT" "$ROOT/node_modules/.bin/vp" -C "$ROOT/platform/ui" test tests/accname-probe.test.ts
echo "── 讀數（每列一個變異；對照組要三格都等於 LABEL）──"
cat "$OUT"
