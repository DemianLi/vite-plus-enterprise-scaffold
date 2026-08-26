import type { SpecInstance } from "./collect.ts";

/**
 * 把 vitest 的執行結果對到規格的每一個場景實例上。
 *
 * ⚠️ **這支工具不跑測試。** TESTING.md 明講「不養第二套 runner」，而理由不只是
 * 省事：跨套件測試在這條線上已經有排程相依（C87 用 dependsOn 讓開），
 * 自己 spawn 一次 vitest 就是在 `vpr gate` 已經跑過的地方再撞一次同一個問題。
 * 結果檔由呼叫者提供。
 */

/** vitest `--reporter=json` 的輸出裡，這支工具用得到的那一小塊。 */
export interface VitestResults {
  readonly testResults: readonly {
    readonly name: string;
    readonly assertionResults: readonly {
      readonly ancestorTitles: readonly string[];
      readonly title: string;
      readonly status: string;
    }[];
  }[];
}

/**
 * 四態。
 *
 * ⚠️ **「未執行」不是湊數的第四態，它是這份設計最重要的一格。**
 * 接線檔的副檔名取錯（C114 §二）、規格檔改名、整個檔案 collect 失敗 ——
 * 這些的共同症狀是**測試全綠而場景一條都沒跑**。把「找不到對應結果」算成
 * 完成或直接忽略，就是把那個洞原樣重建在報表裡，而報表正是拿去對外報進度的東西。
 */
export type SpecStatus = "完成" | "擋下" | "待辦" | "未執行";

export interface ResolvedInstance {
  readonly instance: SpecInstance;
  readonly status: SpecStatus;
  /** 失敗的步驟標題。⚠️ 只給 CLI 用 —— 報表檔刻意不寫原因，原因會過期。 */
  readonly failedSteps: readonly string[];
}

interface StepOutcome {
  readonly title: string;
  readonly status: string;
}

/**
 * 這個場景的 describe 底下有哪些步驟跑過。
 *
 * ⚠️ 比對的是「最後一層 ancestorTitle 是不是這個場景」，而**不比對關鍵字前綴**
 * （`場景: `／`場景大綱: `）。前綴是語言表的一部分，換一種語言就變 ——
 * 而場景名是規格作者寫的，那才是穩定的那一半。
 */
function stepsUnder(results: VitestResults, scenario: string): StepOutcome[] {
  const outcomes: StepOutcome[] = [];

  for (const file of results.testResults) {
    for (const assertion of file.assertionResults) {
      const last = assertion.ancestorTitles.at(-1);
      if (last === undefined) continue;
      if (last !== scenario && !last.endsWith(`: ${scenario}`)) continue;
      outcomes.push({ title: assertion.title, status: assertion.status });
    }
  }

  return outcomes;
}

export function resolve(
  instances: readonly SpecInstance[],
  results: VitestResults,
): ResolvedInstance[] {
  return instances.map((instance) => {
    if (instance.todo) {
      return { instance, status: "待辦" as const, failedSteps: [] };
    }

    const outcomes = stepsUnder(results, instance.scenario);
    const failedSteps: string[] = [];
    let missing = false;

    for (const stepTitle of instance.stepTitles) {
      // ⚠️ 場景大綱的每一列產生不同的步驟標題（值被代進去了），所以同一個
      // describe 底下不同列分得開。兩列的值完全相同時分不開 —— 那時它們跑的
      // 本來就是同一組輸入，狀態相同是對的。
      const matched = outcomes.filter((outcome) => outcome.title === stepTitle);
      if (matched.length === 0) {
        missing = true;
        continue;
      }
      if (matched.some((outcome) => outcome.status !== "passed")) {
        failedSteps.push(stepTitle);
      }
    }

    // ⚠️ 順序有意義：**先判未執行**。一個場景可能既有失敗的步驟、又有沒跑到的
    // 步驟（斷言炸掉之後剩下的不會跑），而那種情況該報的是「沒跑完」，
    // 不是「跑了但錯」—— 後者會讓人以為規格至少被執行過一遍。
    if (missing) return { instance, status: "未執行" as const, failedSteps };
    if (failedSteps.length > 0) return { instance, status: "擋下" as const, failedSteps };
    return { instance, status: "完成" as const, failedSteps: [] };
  });
}
