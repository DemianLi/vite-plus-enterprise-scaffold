import { describe, expect, it } from "vitest";

import {
  MISSING,
  compareStamp,
  digest,
  formatStamp,
  isProtected,
  isScaffoldScript,
  parseStamp,
  type Side,
  type Stamp,
} from "../src/stamp.ts";

const READY_FORK = "vp check && vp run --filter './tools/*' --fail-if-no-match test";

const BASE: Stamp = {
  files: new Map([
    ["tools/a/src/a.ts", "aaa"],
    ["platform/b/index.ts", "bbb"],
    ["vite.scaffold.ts", "ccc"],
    [".github/workflows/tier1.yml", "ddd"],
  ]),
  scripts: new Map([
    ["gate", "vp run --no-cache gate:select"],
    ["ready:fork", READY_FORK],
  ]),
};

function edited(change: (files: Map<string, string>, scripts: Map<string, string>) => void): Stamp {
  const files = new Map(BASE.files);
  const scripts = new Map(BASE.scripts);
  change(files, scripts);
  return { files, scripts };
}

const kinds = (current: Stamp, side: Side): string[] =>
  compareStamp(BASE, current, side).map((problem) => problem.kind);

describe("雜湊", () => {
  it("CRLF 與 LF 是同一份 —— Windows 的 autocrlf 不得讀成「整個腳手架被改過」", () => {
    expect(digest(Buffer.from("a\r\nb\r\n"))).toBe(digest(Buffer.from("a\nb\n")));
  });

  it("內容不同，雜湊不同", () => {
    expect(digest(Buffer.from("a\n"))).not.toBe(digest(Buffer.from("b\n")));
  });
});

describe("射程", () => {
  it.each([
    ["tools/x/src/cli.ts", true],
    ["platform/ui/src/Button.vue", true],
    ["vite.scaffold.ts", true],
    [".github/workflows/tier1-quality.yml", true],
    ["vite.config.ts", false],
    ["features/order/src/api.ts", false],
    ["team-tools/x/src/cli.ts", false],
  ])("%s → %s", (path, expected) => {
    expect(isProtected(path)).toBe(expected);
  });

  it.each([
    ["gate", "vp run --no-cache gate:select", true],
    ["ready:fork", "vp check", true],
    ["conformance", "node tools/conformance/src/cli.ts", true],
    ["dev", "vp run console#dev", false],
    ["bff", "BFF_MOCK_ROUTES=apps/console/bff-routes.ts node platform/bff-mock/src/cli.ts", false],
    ["gateway", "node gateway.ts", false],
  ])("script %s → %s", (key, value, expected) => {
    expect(isScaffoldScript(key, value)).toBe(expected);
  });
});

describe("章的格式", () => {
  it("寫出去再讀回來是同一份", () => {
    const back = parseStamp(formatStamp(BASE));
    expect(back.files).toEqual(BASE.files);
    expect(back.scripts).toEqual(BASE.scripts);
  });

  it("照字典序，一行一筆 —— 兩支 PR 改到不同的檔，不會撞在同一行", () => {
    const lines = formatStamp(BASE)
      .split("\n")
      .filter((line) => line.startsWith("file\t"));
    expect(lines.map((line) => line.split("\t")[2])).toEqual([
      ".github/workflows/tier1.yml",
      "platform/b/index.ts",
      "tools/a/src/a.ts",
      "vite.scaffold.ts",
    ]);
  });

  it("讀不懂的行直接紅，不略過", () => {
    expect(() => parseStamp("file\tonly-two\n")).toThrow("第 1 行讀不懂");
  });
});

describe("兩端都紅的", () => {
  it.each(["upstream", "fork"] as const)("原樣 → 綠（%s）", (side) => {
    expect(kinds(BASE, side)).toEqual([]);
  });

  it.each(["upstream", "fork"] as const)("🔴 改了一個檔（%s）", (side) => {
    const current = edited((files) => files.set("tools/a/src/a.ts", "zzz"));
    expect(kinds(current, side)).toEqual(["腳手架的檔被改了"]);
  });

  it.each(["upstream", "fork"] as const)("🔴 版控裡還在、磁碟上刪了（%s）", (side) => {
    const current = edited((files) => files.set("vite.scaffold.ts", MISSING));
    expect(kinds(current, side)).toEqual(["腳手架的檔不見了"]);
  });

  it.each(["upstream", "fork"] as const)("🔴 關閉的目錄多一個檔（%s）", (side) => {
    // C218 §四 R2 那支 `tools/x`：C220 之前在 fork 上是綠的。
    const current = edited((files) => files.set("tools/x/package.json", "eee"));
    expect(kinds(current, side)).toEqual(["章裡沒有這個檔"]);
  });

  it.each(["upstream", "fork"] as const)("🔴 腳手架的 script 被改了（%s）", (side) => {
    const current = edited((_, scripts) => scripts.set("gate", "node tools/x/src/cli.ts"));
    expect(kinds(current, side)).toEqual(["腳手架的 script 被改了"]);
  });

  it("🔴 章是空的 —— 每一行比對都會「通過」，所以當成壞了", () => {
    const empty: Stamp = { files: new Map(), scripts: new Map() };
    const broken = compareStamp(empty, BASE, "fork").filter((problem) => problem.kind === "章壞了");
    expect(broken.map((problem) => problem.detail)).toEqual([
      "章裡沒有任何 tools/ 底下的檔 —— 列舉本身壞了，不是「沒有東西被改」",
      "章裡沒有任何 platform/ 底下的檔 —— 列舉本身壞了，不是「沒有東西被改」",
      "章裡沒有 vite.scaffold.ts",
    ]);
  });
});

describe("只有上游紅的 —— fork 加自己的東西是合法的", () => {
  const cases: ReadonlyArray<readonly [string, Stamp]> = [
    ["加一支自己的 workflow", edited((files) => files.set(".github/workflows/team.yml", "fff"))],
    ["加一條跑 tools/ 的 script", edited((_, s) => s.set("lint-x", "node tools/a/src/a.ts"))],
    [
      "ready:fork 後面接團隊工具的測試",
      edited((_, s) =>
        s.set("ready:fork", `${READY_FORK} && vp run --filter './team-tools/*' test`),
      ),
    ],
  ];

  it.each(cases)("%s：fork 綠", (_, current) => {
    expect(kinds(current, "fork")).toEqual([]);
  });

  it.each(cases)("%s：上游紅 —— 章要與樹相等", (_, current) => {
    expect(kinds(current, "upstream")).not.toEqual([]);
  });

  it("🔴 ready:fork 往後接可以，改掉上游那一串不行", () => {
    const current = edited((_, s) => s.set("ready:fork", READY_FORK.replace("vp check && ", "")));
    expect(kinds(current, "fork")).toEqual(["腳手架的 script 被改了"]);
  });
});
