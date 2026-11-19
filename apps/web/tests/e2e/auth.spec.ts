import { expect, test } from "@playwright/test";
import { signInLinkFor } from "./mailpit";

function newReader(project: string) {
  return `reader-${project}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test("My News sends a signed-out reader to sign in", async ({ page }) => {
  await page.goto("/my-news");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fmy-news$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in or create an account");
});

test("a bad email is explained next to the field", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("That doesn't look like an email address.")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
});

test("sign in with an emailed link, then sign out", async ({ page }, info) => {
  const email = newReader(info.project.name);

  await page.goto("/sign-in");
  await page.getByLabel("Email address").pressSequentially(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  const link = await signInLinkFor(email);
  // The email points at the configured site URL; open the same path on the test server.
  const { pathname, search } = new URL(link);
  await page.goto(pathname + search);

  await expect(page).toHaveURL(/\/my-news$/);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Account" })).toContainText("My News");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Account" })).toContainText("Sign in");

  await page.goto("/my-news");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a used or broken link says so", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=nonsense&type=email");
  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
  // Next.js has its own hidden role="alert" route announcer, so match the message by its text.
  const problem = page.getByText("That sign-in link has expired or was already used.");
  await expect(problem).toBeVisible();
  await expect(problem).toHaveAttribute("role", "alert");
});

test("the link can't send a reader to another site", async ({ page }) => {
  // A bad token falls back to the sign-in page whatever `next` says.
  await page.goto("/auth/confirm?token_hash=nonsense&type=email&next=//evil.example");
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/sign-in/);
});
