import { expect, type Page } from "@playwright/test";
import { signInLinkFor } from "./mailpit";

export const uniqueName = (what: string, project: string) =>
  `${what}-${project}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toLowerCase();

// Signs a new reader in through the emailed link. New readers land on the welcome wizard.
export async function signIn(page: Page, email: string, landing: RegExp = /\/welcome$/) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  const { pathname, search } = new URL(await signInLinkFor(email));
  await page.goto(pathname + search);
  await expect(page).toHaveURL(landing);
}
