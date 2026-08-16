<script setup lang="ts">
/**
 * 這個檔案是**故意寫壞的**。它不會被建置、不會被 import，存在的唯一目的是
 * 讓「那 23 條無障礙規則到底有沒有在檢查」變成一個可執行的問題。
 *
 * 與 `.semgrep/rules.ts` 是同一個處理，理由也一樣：**一組壞掉的規則掃出
 * 零個發現，看起來與「沒有問題」一模一樣**，而本 repo 對這個 repo 的
 * `.vue` 檔實測的結果正好就是零個發現（見 `src/a11y.js` 的檔頭）。
 * 沒有這個檔案，那個零就沒有任何東西能區分它是哪一種零。
 *
 * ⚠️ 下面每一段都恰好對應一條規則，而測試斷言的是**規則 ID 的集合**
 * 等於 plugin 匯出的規則集合。升級 plugin 多出一條規則時，測試會紅，
 * 修法是在這裡加一段（或把它具名寫進測試的 UNCOVERED 並附理由）。
 *
 * ⚠️ 這個 `<script setup lang="ts">` 區塊本身也是 fixture 的一部分：
 * `src/a11y.js` 設了 `parserOptions.parser: false`（不剖析腳本），
 * 而下面這行 TS 專屬語法就是用來確認那一行還在生效的 —— 少了它，
 * 有人把設定改回 TS 剖析器時不會有任何東西變紅。
 */
const tone: "quiet" | "loud" = "quiet";
function go(): void {
  void tone;
}
</script>

<template>
  <div>
    <!-- alt-text -->
    <img src="/logo.png" />

    <!-- anchor-has-content -->
    <a href="/x"></a>

    <!-- heading-has-content -->
    <h2></h2>

    <!-- click-events-have-key-events ＋ no-static-element-interactions -->
    <div @click="go()">按我</div>

    <!-- form-control-has-label -->
    <input type="text" />

    <!-- label-has-for -->
    <label>姓名</label>

    <!-- no-aria-hidden-on-focusable -->
    <span aria-hidden="true" tabindex="0">x</span>

    <!-- tabindex-no-positive -->
    <div tabindex="3">正整數 tabindex</div>

    <!-- no-distracting-elements -->
    <marquee>跑馬燈</marquee>

    <!-- no-autofocus -->
    <input autofocus />

    <!-- iframe-has-title -->
    <iframe src="/y"></iframe>

    <!-- media-has-caption -->
    <video><source src="/v.mp4" /></video>

    <!-- no-onchange -->
    <select @change="go()">
      <option>a</option>
    </select>

    <!-- no-access-key -->
    <button accesskey="k">熱鍵</button>

    <!-- aria-props -->
    <div aria-labelledbyy="x">拼錯的 aria 屬性</div>

    <!-- aria-role -->
    <div role="lolwut">不存在的 role</div>

    <!-- role-has-required-aria-props -->
    <div role="checkbox">缺 aria-checked</div>

    <!-- no-role-presentation-on-focusable -->
    <ul role="presentation" tabindex="0">
      <li>x</li>
    </ul>

    <!-- no-redundant-roles -->
    <button role="button">冗餘 role</button>

    <!-- aria-unsupported-elements -->
    <meta aria-hidden="true" />

    <!-- mouse-events-have-key-events -->
    <div @mouseover="go()">只有滑鼠事件</div>

    <!-- interactive-supports-focus：有 role、有鍵盤與滑鼠處理器，但不可聚焦 -->
    <div role="button" @click="go()" @keydown="go()">看起來像按鈕</div>
  </div>
</template>
