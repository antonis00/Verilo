import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./sign-in";
import { userIdFor } from "./supabase-admin";

test("a reader can download their data and delete their account", async ({ page }, info) => {
  const email = `${uniqueName("account", info.project.name)}@example.com`;
  await signIn(page, email);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/$/);

  // Their data, as a file: their email and choices, nobody else's.
  const exported = await page.request.get("/api/account/export");
  expect(exported.headers()["content-disposition"]).toContain("verilo-my-data.json");
  const data = await exported.json();
  expect(data.account.email).toBe(email);
  expect(data.preferences.onboarded_at).toBeTruthy();

  await page.goto("/my-news");
  const yourData = page.getByRole("region", { name: "Your data" });
  await yourData.getByText("Delete my account").first().click();
  await yourData.getByLabel(/to confirm/).fill("delete");
  await yourData.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is deleted");

  // Gone: no account with that email, and the session ended with it.
  await expect(userIdFor(email)).rejects.toThrow(/no account/);
  expect((await page.request.get("/api/account/export")).status()).toBe(401);
});
