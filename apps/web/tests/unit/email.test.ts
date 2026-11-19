import { describe, expect, it } from "vitest";
import { validateEmail } from "@/lib/email";

describe("validateEmail", () => {
  it("trims and lowercases a good address", () => {
    expect(validateEmail("  Reader@Example.COM ")).toEqual({
      ok: true,
      email: "reader@example.com",
    });
  });

  it("asks for an address when empty", () => {
    expect(validateEmail("   ")).toEqual({ ok: false, message: "Enter your email address." });
  });

  it.each(["reader", "reader@", "@example.com", "reader@example", "a b@example.com"])(
    "rejects %j",
    (value) => {
      expect(validateEmail(value).ok).toBe(false);
    },
  );

  it("rejects an address over 254 characters", () => {
    expect(validateEmail(`${"a".repeat(250)}@example.com`).ok).toBe(false);
  });
});
