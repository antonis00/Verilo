import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./sign-in";
import { setTrial, userIdFor } from "./supabase-admin";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

test("a new reader's free trial shows in My News, and on the front page near its end", async ({
  page,
}, info) => {
  const email = `${uniqueName("trial", info.project.name)}@example.com`;
  await signIn(page, email);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/$/);
  const notice = page.getByRole("complementary", { name: "Your free trial" });
  await expect(page.getByRole("main")).toBeVisible();
  await expect(notice).toHaveCount(0); // 14 days left: no reminder

  await page.goto("/my-news");
  await expect(page.getByTestId("trial")).toHaveText(/^Free trial: 14 days left \(until .+\)\.$/);

  // The last days: a quiet line on the front page.
  const id = await userIdFor(email);
  await setTrial(id, { trial_ends_at: inDays(1.5) });
  await page.goto("/");
  await expect(notice).toContainText("Free trial: 2 days left");

  // Ended: nothing is locked yet, and the page says so.
  await setTrial(id, { trial_ends_at: inDays(-1) });
  await page.goto("/");
  await expect(notice).toContainText("Your free trial has ended.");
  await expect(notice).toContainText("everything stays open");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // the page is all there

  // Subscribed: no trial talk at all.
  await setTrial(id, { subscribed_until: inDays(30) });
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(notice).toHaveCount(0);
  await page.goto("/my-news");
  await expect(page.getByTestId("trial")).toHaveCount(0);
});
