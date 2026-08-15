import { describe, expect, it } from "vitest";
import { findStaticCspViolations, formatStaticCspViolations } from "../src/static-csp.ts";

/**
 * 這組測試釘住的不是「程式碼有沒有跑」，是 R6 的成本前提：
 * 建置產物沒有 inline script → CSP 可以是靜態標頭 → 任何反向代理都設得出來。
 *
 * 因此**偽陽性與偽陰性一樣嚴重**：
 * 偽陰性會讓前提靜默失效；偽陽性會讓人把這個外掛關掉，結果一樣。
 * 所以下面有一半的斷言是在驗證它**不會**誤報。
 */

// apps/console 實際的建置產物形狀（外部 module script + 外部樣式表）。
const REAL_BUILD_OUTPUT = `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <title>Console</title>
    <script type="module" crossorigin src="/assets/index-Ccyj3anq.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-gRiq-Xch.css">
  </head>
  <body><div id="app"></div></body>
</html>`;

describe("findStaticCspViolations", () => {
  it("實際的建置產物沒有任何違規（R6 的前提）", () => {
    expect(findStaticCspViolations(REAL_BUILD_OUTPUT)).toEqual([]);
  });

  it("抓到 inline script —— 這是逼出 nonce 的頭號原因", () => {
    const html = `${REAL_BUILD_OUTPUT}<script>window.__ANALYTICS__ = true;</script>`;
    const violations = findStaticCspViolations(html);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe("inline-script");
  });

  it("有 src 的 script 不算違規", () => {
    const html = `<script src="/a.js"></script><script type="module" src="/b.js"></script>`;
    expect(findStaticCspViolations(html)).toEqual([]);
  });

  it("抓到 inline <style> 區塊", () => {
    const violations = findStaticCspViolations(`<style>body{margin:0}</style>`);
    expect(violations.map((v) => v.kind)).toEqual(["inline-style-block"]);
  });

  it("style **屬性**不算違規（style-src-attr 已明確放行）", () => {
    // 這是刻意保留的例外：Vue 的 :style 產生的就是這個形狀。
    // 若這裡誤報，所有動態樣式都會被判違規，沒有人會忍受這個外掛。
    expect(findStaticCspViolations(`<div style="width: 10px"></div>`)).toEqual([]);
  });

  it("抓到 inline 事件處理屬性", () => {
    const violations = findStaticCspViolations(`<button onclick="doThing()">x</button>`);
    expect(violations.map((v) => v.kind)).toEqual(["inline-event-handler"]);
  });

  it("抓到 javascript: URL", () => {
    const violations = findStaticCspViolations(`<a href="javascript:alert(1)">x</a>`);
    expect(violations.map((v) => v.kind)).toEqual(["javascript-url"]);
  });

  it("不把一般屬性誤判成事件處理器", () => {
    // `only`、`on` 開頭的資料屬性等等。誤報一次，這個外掛就會被關掉。
    const html = `<div data-online="1" data-only="x" class="one"></div>`;
    expect(findStaticCspViolations(html)).toEqual([]);
  });

  it("不把文字裡的 javascript 一詞誤判成 javascript: URL", () => {
    expect(findStaticCspViolations(`<p>我們用 javascript 寫的</p>`)).toEqual([]);
  });

  it("同一份 HTML 的多個問題會一次全部回報", () => {
    // 一次只報一條會讓修的人來回建置很多次，然後開始討厭這個檢查。
    const html = `<script>a</script><style>b</style><button onclick="c()"></button>`;
    expect(findStaticCspViolations(html)).toHaveLength(3);
  });
});

describe("formatStaticCspViolations", () => {
  it("訊息說明的是組織端成本的變化，不只是「這裡有 inline script」", () => {
    const violations = findStaticCspViolations(`<script>x</script>`);
    const message = formatStaticCspViolations("index.html", violations);

    // 這條訊息的價值全在這裡：讀的人要知道修不掉的話會多花什麼。
    expect(message).toContain("nonce");
    expect(message).toContain("CDN");
    expect(message).toContain("R6");
  });
});
