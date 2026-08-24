import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_MAX_LINES,
  FEATURE_MAX_LINES,
  inspectAppSource,
  inspectFeatureSource,
  lineCount,
} from "./check-renderer-architecture.mjs";

test("lineCount handles files with and without a trailing newline", () => {
  assert.equal(lineCount("one\ntwo\n"), 2);
  assert.equal(lineCount("one\ntwo"), 2);
  assert.equal(lineCount(""), 0);
});

test("App source accepts only the composition root within the line limit", () => {
  const source = "export default function App() {\n  return null;\n}\n";
  assert.deepEqual(inspectAppSource(source), []);
});

test("App source rejects oversized composition roots", () => {
  const source = Array.from({ length: APP_MAX_LINES + 1 }, () => "// line").join("\n");
  assert.match(inspectAppSource(source)[0] ?? "", /composition-root limit/);
});

test("App source rejects additional top-level components", () => {
  const source = [
    "export default function App() { return null; }",
    "function SettingsPanel() { return null; }",
    "const SessionRow = () => null;",
  ].join("\n");
  assert.match(inspectAppSource(source)[0] ?? "", /SettingsPanel, SessionRow/);
});

test("feature source rejects modules that exceed the business-component limit", () => {
  const source = Array.from({ length: FEATURE_MAX_LINES + 1 }, () => "// line").join("\n");
  assert.match(inspectFeatureSource(source, "features/example.tsx")[0] ?? "", /split by business responsibility/);
});
