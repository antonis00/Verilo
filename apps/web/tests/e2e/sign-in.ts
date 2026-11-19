import { expect, type Page } from "@playwright/test";
import { signInLinkFor } from "./mailpit";

export const uniqueName = (what: string, project: string) =>
  `${what}-${project}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase();

// Signs a reader in through the emailed link. New readers land on the welcome wizard.
//
// On a slow machine (CI) a click can land before the form's script has loaded; the click is then
// retried. If the form shows an error instead of "Check your inbox", the test fails with it.
export async function signIn(page: Page, email: string, landing: RegExp = /\/welcome$/) {
  await page.goto("/sign-in", { waitUntil: "load" });
  const sentAfter = Date.now();
  await expect(async () => {
    const problem = page.getByRole("alert").filter({ hasNotText: /^$/ });
    if (await problem.count()) {
      throw new Error(`sign-in form error: ${await problem.first().textContent()}`);
    }
    if (!(await page.getByRole("status").count())) {
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    }
    await expect(page.getByRole("status")).toContainText(email, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  const { pathname, search } = new URL(await signInLinkFor(email, { sentAfter }));
  await page.goto(pathname + search);
  await expect(page).toHaveURL(landing);
}
