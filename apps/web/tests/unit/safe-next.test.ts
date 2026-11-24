import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGN_IN, safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/preferences")).toBe("/preferences");
    expect(safeNext("/story/123?from=digest")).toBe("/story/123?from=digest");
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "preferences",
    "/a\nb",
    "/a\\b",
    `/${"x".repeat(600)}`,
  ])("falls back for %j", (value) => {
    expect(safeNext(value)).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});
