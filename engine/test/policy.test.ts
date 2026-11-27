import { matchesPath, parsePrCommand } from "@openvscan/core";
import { describe, expect, it } from "vitest";

describe("parsePrCommand", () => {
  it("answers only a mention of this App", () => {
    expect(parsePrCommand("@openvscan review", "openvscan")).toBe("review");
    expect(parsePrCommand("@openvscan dance", "openvscan")).toBe("help");
    expect(parsePrCommand("@openvscan-dev review", "openvscan")).toBeNull();
    expect(parsePrCommand("me@openvscan review", "openvscan")).toBeNull();
  });
});

describe("matchesPath", () => {
  it("follows .gitignore-style globs", () => {
    expect(matchesPath("a/b/package-lock.json", ["package-lock.json"])).toBe(true);
    expect(matchesPath("vendor/x/y.go", ["vendor/**"])).toBe(true);
    expect(matchesPath("src/vendor/y.go", ["vendor/**"])).toBe(false);
    expect(matchesPath("axb.txt", ["a.b.txt"])).toBe(false);
  });
});
