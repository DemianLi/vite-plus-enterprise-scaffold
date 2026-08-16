// `generated-pii.yml` 的 fixture。欄位名跟著 features/*/src/index.ts 的
// personalData 走 —— 那份宣告改了，這裡也要改，而 semgrep --test 會說。

declare const logger: { info: (...args: unknown[]) => void };
declare function maskName(value: string): string;

interface Order {
  readonly id: string;
  readonly customerName: string;
  readonly totalCents: number;
}

export function logOrder(order: Order): void {
  // ruleid: personal-data-leaves-the-screen
  console.log("order", order.customerName);
}

export function rememberCustomer(order: Order): void {
  // ruleid: personal-data-leaves-the-screen
  localStorage.setItem("lastCustomer", order.customerName);
}

export function buildSearchUrl(order: Order): string {
  const params = new URLSearchParams();
  // ruleid: personal-data-leaves-the-screen
  params.set("q", order.customerName);
  return `/search?${params.toString()}`;
}

export function logMasked(order: Order): void {
  // ok: personal-data-leaves-the-screen
  console.log("order", maskName(order.customerName));
}

export function logNonPersonal(order: Order): void {
  // ok: personal-data-leaves-the-screen
  console.log("order", order.id, order.totalCents);
}

export function logViaLogger(order: Order): void {
  // 目前的規則只認 console.*，logger 這種包裝抓不到 ——
  // 這一條把「抓不到」釘成一個看得見的事實，而不是一個沒有人知道的洞。
  // ok: personal-data-leaves-the-screen
  logger.info("order", order.customerName);
}
