/**
 * `tools/api-surface` 反向測試用的假 platform 套件。
 *
 * ⚠️ **這個檔案存在的唯一理由，是它可以被改壞。**
 *
 * 有一整類問題只能靠真的動原始碼來回答：「這個重構**不該**讓形狀漂移」。
 * 屬性對調、interface 換成 type、加一行 JSDoc、改名一個私有型別 ——
 * 在基準檔的副本裡動手腳問不出來，那些改的是「記錄」，不是「來源」。
 *
 * 而在 `platform/*` 上做這件事正是既有測試明講要避開的：跑到一半被中斷，
 * repo 就安靜地壞著。所以測試會把整個 fixture 目錄複製到暫存區再改，
 * 這裡的檔案本身一個位元組都不會被動到。
 *
 * 內容刻意涵蓋每一種被記錄的形狀：具名屬性（必填與選填）、索引簽章、
 * 函式、class、純資料常數，以及一個**沒有出現在公開簽章裡**的私有型別。
 */

export { default as SampleWidget } from "./SampleWidget.vue";

/** 沒有出現在任何公開簽章裡 —— 改名不該讓任何形狀漂移。 */
interface InternalOnly {
  readonly scratch: string;
}

export interface SampleOptions {
  /** 必填 */
  readonly id: string;
  readonly retries?: number;
  readonly tags: readonly string[];
}

export interface SampleTable {
  readonly [key: string]: number;
}

export class SampleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "SampleError";
    this.code = code;
  }
}

export const SAMPLE_LIMIT = 10;

/**
 * 匿名物件形態的常數。它**不是**純資料：拿掉一個欄位，每個讀那個欄位的
 * 消費端都編不過。所以它記的是成員，不是一個型別字串（見 objectMembers）。
 */
export const SAMPLE_DEFAULTS = {
  retries: 3,
  label: "sample",
} as const;

export function makeSample(options: SampleOptions): SampleTable {
  const scratch: InternalOnly = { scratch: options.id };
  return { [scratch.scratch]: options.retries ?? SAMPLE_LIMIT };
}
