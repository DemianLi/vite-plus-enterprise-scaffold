// @ts-nocheck —— 這份檔只給 ESLint 剖析，不給型別檢查：`platform/eslint-config` 沒有 JSX 的
// 型別與編譯設定，也不該有（它不是一個畫面 package）。少了這一行，`vp check` 對每一個
// JSX 元素報一次 TS17004／TS7026（實測 113 個）。
/**
 * ⚠️ **故意寫壞的，而且必須壞著** —— `tests/a11y.test.ts` 靠它證明 `.tsx` 那一軌
 * 每一條啟用的規則都真的會開火。閘門由 `src/a11y.js` 的 `ignores` 排除這一個檔。
 *
 * 型別註記（`Props`、`: void`、`as const`）是刻意的：它們讓 `.tsx` 那一軌的剖析器
 * 被真的走到。換成一個不認得 TS 語法的剖析器，整個檔剖析失敗，所有規則一起安靜，
 * 而那與「沒有問題」在 CI 上長得一模一樣（同 `.vue` 那份 fixture 的 `<script setup>`）。
 *
 * 不 import 任何東西：`platform/eslint-config` 沒有宣告 react，import 它會是一筆
 * 幽靈相依（conformance 會紅），而這份檔案只需要被剖析，不需要被執行。
 */
type Props = { readonly label?: string };

export function Violations({ label }: Props) {
  const noop = (): void => undefined;
  const level = 3 as const;
  return (
    <html>
      <div title={label}>
        <img src="/a.png" />
        <img src="/b.png" alt="image of a photo" />
        <a href="#">x</a>
        <a>no href</a>
        <a href="/x"></a>
        <a href="/y">click here</a>
        <div onClick={noop}>click</div>
        <div role="button">no tabindex</div>
        <div role="button" onClick={noop}>
          interactive no focus
        </div>
        <div role="foo">bad role</div>
        <div aria-foo="x">bad aria prop</div>
        <div aria-hidden="maybe">bad aria value</div>
        {/* 必須是字面值：`tabindex-no-positive` 不評估表達式，`tabIndex={level}` 不會紅。 */}
        <span tabIndex={3} data-level={level}>
          positive
        </span>
        <input autoFocus />
        <label>orphan</label>
        <h1></h1>
        <iframe src="/f" />
        <video src="/v.mp4" />
        <audio src="/a.mp3" />
        <marquee>old</marquee>
        <div onMouseOver={noop}>hover</div>
        <button accessKey="s">k</button>
        <ul role="button">interactive-to-noninteractive</ul>
        <li role="listitem">redundant</li>
        <li onClick={noop}>noninteractive handler</li>
        <button role="presentation">p</button>
        <button aria-hidden="true">hidden focusable</button>
        <div role="checkbox">missing aria-checked</div>
        <input type="text" />
        <meta aria-hidden="true" />
        <th scope="col"></th>
        <td scope="row">bad scope</td>
        <main tabIndex={0}>focusable non-interactive</main>
        <div aria-activedescendant="x">no tabindex</div>
        <a href="/z" aria-checked="true">
          unsupported aria prop
        </a>
        <input autoComplete="nope" />
        <img src="/c.png" alt="" role="img" />
        <div role="link">link no tabindex</div>
        <html lang="foo"></html>
      </div>
    </html>
  );
}
