// semgrep 的測試 fixture。`ruleid:` 標記說「下一行應該命中這條規則」，
// `ok:` 說「不該命中」。`semgrep --test` 會驗這兩件事都成立 ——
// 也就是說這份檔案就是這套規則的**反向測試**。
//
// 這支檔案不會被建置，也不在 tsconfig 的 include 裡。

declare const useRoute: () => { query: Record<string, string>; params: Record<string, string> };
declare const el: HTMLElement;

export function redirectFromQuery(): void {
  const route = useRoute();
  const target = route.query["next"] as string;
  // ruleid: tainted-route-input-to-dom-sink
  location.href = target;
}

export function renderFromParams(): void {
  const route = useRoute();
  const raw = route.params["html"] as string;
  const wrapped = `<div>${raw}</div>`;
  // 跨了一個函式邊界仍然追得到 —— 這正是 lint 做不到的那一半。
  // ruleid: tainted-route-input-to-dom-sink
  el.innerHTML = wrapped;
}

export function safeRedirect(): void {
  const route = useRoute();
  const next = route.query["next"];
  const allowed: Record<string, string> = { orders: "/order", shipments: "/shipment" };
  const target = allowed[next ?? ""] ?? "/";
  // ok: tainted-route-input-to-dom-sink
  location.href = target;
}

export function staticText(): void {
  // ok: tainted-route-input-to-dom-sink
  el.innerHTML = "<b>固定字串</b>";
}

export function buildAtRuntime(source: string): unknown {
  // ruleid: runtime-code-construction
  return new Function(source);
}

export function delayedString(): void {
  // ruleid: runtime-code-construction
  setTimeout("doSomething()", 100);
}

export function delayedFunction(fn: () => void): void {
  // ok: runtime-code-construction
  setTimeout(fn, 100);
}
