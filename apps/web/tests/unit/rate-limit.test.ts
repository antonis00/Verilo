import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { allow } = await import("@/lib/rate-limit");

describe("allow", () => {
  it("lets a key act `limit` times in the window, then refuses until it passes", () => {
    const t = 1_000_000;
    expect([1, 2, 3].map((i) => allow("email:a", 3, 60_000, t + i))).toEqual([true, true, true]);
    expect(allow("email:a", 3, 60_000, t + 10)).toBe(false);
    expect(allow("email:b", 3, 60_000, t + 10)).toBe(true); // other keys are separate
    expect(allow("email:a", 3, 60_000, t + 60_002)).toBe(true); // the window has moved on
  });
});
