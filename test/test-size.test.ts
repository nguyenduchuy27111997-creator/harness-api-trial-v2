import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

// Golden principle 6: each feature gets its own small test. A single test(...) block longer
// than MAX_LINES means steps were appended to another feature's test; split it instead.
const MAX_LINES = 80;

test("no single test is longer than 80 lines", () => {
  const tooLong: string[] = [];
  for (const file of readdirSync("test").filter((f) => f.endsWith(".test.ts"))) {
    const lines = readFileSync(`test/${file}`, "utf8").split("\n");
    let start = -1;
    lines.forEach((line, i) => {
      if (/^(test|it)(\.\w+)?\(/.test(line)) start = i;
      else if (start >= 0 && /^\}\)/.test(line)) {
        if (i - start + 1 > MAX_LINES) tooLong.push(`test/${file}:${start + 1} (${i - start + 1} lines)`);
        start = -1;
      }
    });
  }
  expect(tooLong, `split these tests (principle 6): ${tooLong.join(", ")}`).toEqual([]);
});
