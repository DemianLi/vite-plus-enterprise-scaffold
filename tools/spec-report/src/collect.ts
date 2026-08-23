import { loadFeatureFromText } from "@amiceli/vitest-cucumber";

/**
 * 把 `.feature` 解析成**場景的執行實例**清單 —— 完成率的分母就是它的長度。
 *
 * 分母的定義（使用者定的計數規則，C110 §三驗過）：
 * 一個「場景:」算 1，一個「場景大綱:」按「例子:」的每一列各算 1。不加權。
 *
 * ⚠️ 這一層**只讀規格，不碰測試結果**。分出來的是「有哪些事該做」與
 * 「其中哪些標了待辦」；「做到了沒有」是 match.ts 的事。分開的理由是
 * 一份沒有執行結果的報表**說不出「完成」** —— 見 cli.ts 檔頭。
 */

/** 規格檔的原文與它屬於哪個切片。 */
export interface SpecFile {
  readonly slice: string;
  readonly path: string;
  readonly text: string;
}

/** 場景的一個執行實例。`key` 是 CLI 與報表檔之間唯一的對照鍵。 */
export interface SpecInstance {
  /** `<切片>/<功能>#<場景>[<例子>]` —— 格式固定，兩份輸出都用它當主鍵。 */
  readonly key: string;
  readonly slice: string;
  readonly feature: string;
  readonly scenario: string;
  /** 場景大綱的那一列（各欄的值以逗號相接）；一般場景是 null。 */
  readonly example: string | null;
  readonly todo: boolean;
  /**
   * 這個實例的每一個步驟標題，**與 vitest 報出來的 test 名稱逐字相同**。
   *
   * ⚠️ 場景大綱走的是 parser 自己的 `getStepTitle(step, example)`，
   * 不是我們重現一份 Gherkin 的參數替換 —— 重現就是漂移的開始，
   * 而且那條規則屬於上游。
   */
  readonly stepTitles: readonly string[];
}

/** `@待辦` —— 三態裡「有定義、還沒做」的那一態。 */
export const TODO_TAG = "待辦";

/** 規格的語言。⚠️ 模板生成的就是這個；換語言要連 slice-gen 的模板一起換。 */
export const SPEC_LANGUAGE = "zh-TW";

interface ParsedStep {
  readonly type: string;
  readonly details: string;
  readonly title: string;
}

interface ParsedScenario {
  readonly description: string;
  readonly steps: readonly ParsedStep[];
  readonly examples?: readonly Record<string, unknown>[];
  matchTags(filters: string[]): boolean;
  getStepTitle?(step: ParsedStep, example: Record<string, unknown>): string;
}

/** 一般場景的步驟標題就是「關鍵字 空格 內容」，與 parser 對場景大綱做的一致。 */
function plainStepTitle(step: ParsedStep): string {
  return `${step.title} ${step.details}`;
}

function exampleLabel(example: Record<string, unknown>): string {
  return Object.values(example)
    .map((value) => String(value))
    .join(",");
}

export function collectInstances(specs: readonly SpecFile[]): SpecInstance[] {
  const instances: SpecInstance[] = [];

  for (const spec of specs) {
    const feature = loadFeatureFromText(spec.text, { language: SPEC_LANGUAGE });

    for (const raw of feature.scenarii) {
      const scenario = raw as unknown as ParsedScenario;
      // ⚠️ 標籤不在 `.tags` 上（那是 `{}`），要用 matchTags —— 實測結論（C110 §三）。
      const todo = scenario.matchTags([TODO_TAG]);
      const base = {
        slice: spec.slice,
        feature: feature.name,
        scenario: scenario.description,
        todo,
      };

      const stepTitleOf = scenario.getStepTitle;
      if (Array.isArray(scenario.examples) && stepTitleOf !== undefined) {
        for (const example of scenario.examples) {
          const label = exampleLabel(example);
          instances.push({
            ...base,
            example: label,
            key: `${spec.slice}/${feature.name}#${scenario.description}[${label}]`,
            stepTitles: scenario.steps.map((step) => stepTitleOf.call(scenario, step, example)),
          });
        }
        continue;
      }

      instances.push({
        ...base,
        example: null,
        key: `${spec.slice}/${feature.name}#${scenario.description}`,
        stepTitles: scenario.steps.map(plainStepTitle),
      });
    }
  }

  return instances;
}
