import { describe, expect, it } from "vitest";
import {
  buildDiffMap,
  commentLine,
  isDependencyInDiff,
  isInDiff,
  parsePatch,
  renderUnifiedDiff,
} from "../src/diff";

const patch = `@@ -1,4 +1,5 @@
 import os
-x = 1
+x = 2
+y = 3
 def f():
     pass
@@ -20,2 +21,3 @@ def g():
     a = 1
+    b = eval(a)
     return a
\\ No newline at end of file`;

describe("parsePatch", () => {
  it("tracks head-side added and commentable lines across hunks", () => {
    const { added, commentable } = parsePatch(patch);
    expect(added).toEqual([2, 3, 22]);
    expect(commentable).toEqual([1, 2, 3, 4, 5, 21, 22, 23]);
  });
});

describe("isInDiff / commentLine", () => {
  const map = buildDiffMap([
    { filename: "app.py", status: "modified", patch },
    { filename: "package-lock.json", status: "modified" },
    { filename: "gone.py", status: "removed", patch: "@@ -1 +0,0 @@\n-x" },
  ]);

  it("is line-level for files with a patch", () => {
    expect(isInDiff(map, "app.py", 22, null)).toBe(true);
    expect(isInDiff(map, "app.py", 4, 5)).toBe(false); // context only
    expect(isInDiff(map, "app.py", 1, 3)).toBe(true); // range overlaps
    expect(isInDiff(map, "other.py", 2, null)).toBe(false);
  });

  it("is file-level for findings without a line or files without a patch", () => {
    expect(isInDiff(map, "app.py", null, null)).toBe(true);
    expect(isInDiff(map, "package-lock.json", 900, null)).toBe(true);
    expect(map["gone.py"]).toBeUndefined();
    expect(isInDiff(null, "app.py", 2, null)).toBe(false);
  });

  it("anchors comments only on commentable lines", () => {
    expect(commentLine(map, "app.py", 22, null)).toEqual({ line: 22 });
    expect(commentLine(map, "app.py", 2, 3)).toEqual({ line: 3, startLine: 2 });
    expect(commentLine(map, "app.py", 5, 8)).toEqual({ line: 5 });
    expect(commentLine(map, "app.py", 10, 12)).toBeNull();
    expect(commentLine(map, "package-lock.json", 3, null)).toBeNull();
  });
});

describe("renderUnifiedDiff", () => {
  it("truncates past the byte budget but still lists every file", () => {
    const files = [
      { filename: "a.py", status: "modified", patch },
      { filename: "b.py", status: "added", patch: `@@ -0,0 +1 @@\n+${"x".repeat(500)}` },
    ];
    const { text, truncated } = renderUnifiedDiff(files, 400);
    expect(truncated).toBe(true);
    expect(text).toContain("b/a.py");
    expect(text).toContain("b/b.py");
    expect(text).toContain("omitted");
  });
});

describe("isDependencyInDiff", () => {
  const lockPatch = `@@ -10,6 +10,6 @@
     "node_modules/lodash": {
-      "version": "4.17.20",
+      "version": "4.17.21",
       "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"
     },
     "node_modules/minimist": {`;
  const map = buildDiffMap([{ filename: "package-lock.json", status: "modified", patch: lockPatch }]);

  it("ignores pre-existing dependencies in a changed lockfile", () => {
    expect(isDependencyInDiff(map, "package-lock.json", "minimist", "1.2.5")).toBe(false);
  });

  it("flags a dependency whose version line was added", () => {
    expect(isDependencyInDiff(map, "package-lock.json", "lodash", "4.17.21")).toBe(true);
  });

  it("falls back to file membership when there is no patch", () => {
    const noPatch = buildDiffMap([{ filename: "go.sum", status: "modified" }]);
    expect(isDependencyInDiff(noPatch, "go.sum", "x", "1")).toBe(true);
    expect(isDependencyInDiff(noPatch, "other.lock", "x", "1")).toBe(false);
  });
});
