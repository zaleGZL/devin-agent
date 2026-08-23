import { describe, expect, it } from "vitest";
import { initialElicitationValues, parseElicitationFormSchema, parseSafeElicitationUrl, validateElicitationValues } from "./interactions";

describe("ACP elicitation form", () => {
  const parsed = parseElicitationFormSchema({
    type: "object",
    title: "Clarify",
    required: ["language", "count", "confirmed"],
    properties: {
      language: { type: "string", oneOf: [{ const: "zh", title: "中文" }, { const: "en", title: "English" }], default: "zh" },
      count: { type: "integer", minimum: 1, maximum: 3 },
      confirmed: { type: "boolean" },
      tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, minItems: 1 },
    },
  });

  it("parses primitives, choices and defaults", () => {
    expect(parsed).toMatchObject({ ok: true, form: { title: "Clarify" } });
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.form.fields[0]).toMatchObject({ name: "language", defaultValue: "zh" });
    expect(initialElicitationValues(parsed.form)).toEqual({ language: "zh", confirmed: false });
  });

  it("validates required fields, bounds and output allowlist", () => {
    if (!parsed.ok) throw new Error(parsed.reason);
    const invalid = validateElicitationValues(parsed.form, { language: "fr", count: 4, unknown: "drop" });
    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toMatchObject({ language: expect.any(String), count: expect.any(String), confirmed: expect.any(String) });
    expect(invalid.content).not.toHaveProperty("unknown");

    expect(validateElicitationValues(parsed.form, { language: "en", count: 2, confirmed: false, tags: ["a"] })).toEqual({
      ok: true,
      content: { language: "en", count: 2, confirmed: false, tags: ["a"] },
      errors: {},
    });
  });

  it("rejects unknown fields and contradictory constraints", () => {
    expect(parseElicitationFormSchema({ type: "object", properties: { nested: { type: "object" } } })).toMatchObject({ ok: false });
    expect(parseElicitationFormSchema({ type: "object", properties: { count: { type: "number", minimum: 2, maximum: 1 } } })).toMatchObject({ ok: false });
    expect(parseElicitationFormSchema({ type: "object", required: ["missing"], properties: {} })).toMatchObject({ ok: false });
  });
});

describe("ACP URL elicitation", () => {
  it("accepts only HTTPS URLs without userinfo", () => {
    expect(parseSafeElicitationUrl("https://example.com/authorize?state=1")).toEqual({ url: "https://example.com/authorize?state=1", origin: "https://example.com" });
    expect(parseSafeElicitationUrl("http://127.0.0.1/callback")).toBeUndefined();
    expect(parseSafeElicitationUrl("file:///tmp/token")).toBeUndefined();
    expect(parseSafeElicitationUrl("https://user:secret@example.com")).toBeUndefined();
  });
});
