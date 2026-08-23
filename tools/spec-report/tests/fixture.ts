/**
 * 測試用的規格原文。
 *
 * ⚠️ **這份 fixture 的形狀必須跟著 `tools/slice-gen` 的模板走** —— 中文關鍵字、
 * 背景資料表、場景大綱＋例子、`@待辦` 標籤，四樣都要在。模板改了形狀而這裡
 * 沒跟上的話，這支工具會在自己的測試裡全綠，然後在真的切片上對不上。
 *
 * ⚠️ 刻意**不** import `@org/slice-gen` 來拿模板：那會讓兩支工具直接耦合，
 * 而 slice-gen 的 README 明講產生器與檢查器之間只准經由契約溝通。
 * 代價是這份 fixture 會漂移，而擋它的只有這段話 —— 記在 C115 §七。
 */
export const FEATURE = `# language: zh-TW
功能: 訂單查詢

  給人讀的業務說明。

  背景:
    假設 系統裡有下列資料:
      | 編號  |
      | A-001 |
      | A-002 |
      | B-001 |

  場景: 不帶條件時列出全部
    當 查詢資料
    那麼 應該列出 3 筆

  場景大綱: 以關鍵字篩選
    當 以關鍵字 "<關鍵字>" 查詢資料
    那麼 應該列出 <筆數> 筆

    例子:
      | 關鍵字 | 筆數 |
      | A     | 2    |
      | B-001 | 1    |

  @待辦
  場景: 依金額區間篩選
    當 查詢資料
    那麼 應該列出 1 筆
`;

/** 產生一份 vitest `--reporter=json` 形狀的結果。 */
export function results(entries: readonly { scenario: string; title: string; status: string }[]): {
  testResults: {
    name: string;
    assertionResults: { ancestorTitles: string[]; title: string; status: string }[];
  }[];
} {
  return {
    testResults: [
      {
        name: "features/order/tests/specs/order.spec.ts",
        assertionResults: entries.map((entry) => ({
          ancestorTitles: ["功能: 訂單查詢", entry.scenario],
          title: entry.title,
          status: entry.status,
        })),
      },
    ],
  };
}

/** 讓所有非待辦的場景都綠 —— 「全部做完」那個基準狀態。 */
export const ALL_GREEN = results([
  { scenario: "場景: 不帶條件時列出全部", title: "當 查詢資料", status: "passed" },
  { scenario: "場景: 不帶條件時列出全部", title: "那麼 應該列出 3 筆", status: "passed" },
  { scenario: "場景大綱: 以關鍵字篩選", title: '當 以關鍵字 "A" 查詢資料', status: "passed" },
  { scenario: "場景大綱: 以關鍵字篩選", title: "那麼 應該列出 2 筆", status: "passed" },
  { scenario: "場景大綱: 以關鍵字篩選", title: '當 以關鍵字 "B-001" 查詢資料', status: "passed" },
  { scenario: "場景大綱: 以關鍵字篩選", title: "那麼 應該列出 1 筆", status: "passed" },
]);
