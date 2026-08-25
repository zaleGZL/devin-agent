import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop window configuration", () => {
  it("does not impose an application-level minimum window size", () => {
    const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

    expect(mainSource).not.toMatch(/\b(?:minWidth|minHeight|setMinimumSize)\b/);
  });
});
