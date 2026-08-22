import { describe, expect, it } from "vitest";
import { applyColorScheme } from "./color-scheme";

describe("applyColorScheme", () => {
  it("uses no override when following the system", () => {
    const root = { dataset: { colorScheme: "dark" } } as unknown as HTMLElement;
    applyColorScheme("system", root);
    expect(root.dataset.colorScheme).toBeUndefined();
  });

  it("sets explicit light and dark overrides", () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    applyColorScheme("light", root);
    expect(root.dataset.colorScheme).toBe("light");
    applyColorScheme("dark", root);
    expect(root.dataset.colorScheme).toBe("dark");
  });
});
