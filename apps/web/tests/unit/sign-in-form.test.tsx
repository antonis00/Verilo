import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/sign-in/actions", () => ({
  requestSignInLink: vi.fn(async () => ({ status: "idle" })),
}));

const { SignInForm } = await import("@/app/sign-in/sign-in-form");

describe("SignInForm", () => {
  it("has a labelled email field and a clear button", () => {
    render(<SignInForm />);
    const field = screen.getByLabelText("Email address");
    expect(field).toHaveAttribute("type", "email");
    expect(field).toHaveAttribute("autocomplete", "email");
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
  });
});
