import { expect, test } from "@playwright/test";
import { signIn, skipWizard, uniqueName } from "./sign-in";
import { TEST_BRIEFING_SECRET } from "./constants";
import { countEmailsTo, emailTo } from "./mailpit";
import { setTrial, userIdFor } from "./supabase-admin";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

test("a new reader's free trial shows in Preferences, and on the front page near its end", async ({
  page,
}, info) => {
  const email = `${uniqueName("trial", info.project.name)}@example.com`;
  await signIn(page, email);
  await skipWizard(page);
  const notice = page.getByRole("complementary", { name: "Your free trial" });
  await expect(page.getByRole("main")).toBeVisible();
  await expect(notice).toHaveCount(0); // 14 days left: no reminder

  await page.goto("/preferences");
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
  await page.goto("/preferences");
  await expect(page.getByTestId("trial")).toHaveCount(0);
});

test("a reader gets one reminder 4 days before the trial ends", async ({ page, request }, info) => {
  const email = `${uniqueName("trial-mail", info.project.name)}@example.com`;
  await signIn(page, email);
  await skipWizard(page);
  const id = await userIdFor(email);
  await setTrial(id, { trial_ends_at: inDays(3.5) });
  const run = async () =>
    (
      await request.post("/api/briefing/run", {
        headers: { Authorization: `Bearer ${TEST_BRIEFING_SECRET}` },
        data: { now: new Date().toISOString(), only: [id] },
      })
    ).json();
  expect((await run()).trial).toEqual({ sent: 1, failed: 0 });
  expect((await run()).trial).toEqual({ sent: 0, failed: 0 }); // once only
  const message = await emailTo(email, { subject: /ends in 4 days$/, sentAfter: 0 });
  expect(message.Text).toContain("nothing is charged");
  expect(await countEmailsTo(email, /free trial ends/)).toBe(1);
});
