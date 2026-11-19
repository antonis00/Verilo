import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { TEST_BRIEFING_SECRET } from "./constants";
import { countEmailsTo, emailTo } from "./mailpit";
import { signIn, uniqueName } from "./sign-in";
import {
  refreshCaches,
  removeStory,
  removeTopic,
  seedStory,
  seedTopic,
  userIdFor,
} from "./supabase-admin";

// The next two mornings in Doha (UTC+3, no daylight saving), as UTC times at the given Doha hour.
function dohaMornings() {
  const day = (offset: number) => {
    const d = new Date(Date.now() + 3 * 3_600_000 + offset * 86_400_000);
    return d.toISOString().slice(0, 10);
  };
  const at = (date: string, dohaHour: number, minute = 30) =>
    `${date}T${String(dohaHour - 3).padStart(2, "0")}:${minute}:00Z`;
  return { tomorrow: day(1), after: day(2), at };
}

// The reader's browser is in Qatar: the briefing's hour is their own.
test.use({ timezoneId: "Asia/Qatar" });

test("a reader sets the daily briefing, gets it once that morning and stops it from the email", async ({
  page,
  request,
}, info) => {
  const slug = uniqueName("briefing", info.project.name);
  const headline = `Briefing story ${slug}`;
  const email = `${slug}@example.com`;
  let topicId = 0;
  try {
    // The reader follows the story's topic, so it leads their briefing among the day's news.
    topicId = await seedTopic(slug, `Topic ${slug}`, { aliases: [`alias-${slug}`] });
    await seedStory(slug, headline, { topicId });
    await refreshCaches(page.request);

    await signIn(page, email);
    await page.getByRole("searchbox", { name: "Search topics to follow" }).fill(`alias-${slug}`);
    await page.getByRole("button", { name: `Topic ${slug}` }).click();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/my-news");
    const form = page.getByRole("form", { name: "Daily briefing" });
    await expect(form).toContainText("Your time (Asia/Qatar)");
    await form.getByLabel("Time", { exact: true }).selectOption({ label: "6 am" });
    await form.getByLabel(/^Full/).check();
    await form.getByRole("button", { name: "Save briefing" }).click();
    await expect(form.getByRole("status")).toHaveText(
      "Saved. Your briefing comes at 6 am, Asia/Qatar time.",
    );
    const results = await new AxeBuilder({ page }).withTags(["wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // The pipeline's call, for a given moment and only this reader.
    const id = await userIdFor(email);
    const run = async (now: string) =>
      (
        await request.post("/api/briefing/run", {
          headers: { Authorization: `Bearer ${TEST_BRIEFING_SECRET}` },
          data: { now, only: [id] },
        })
      ).json();
    const { tomorrow, after, at } = dohaMornings();
    const sentAfter = Date.now();
    expect(await run(at(tomorrow, 5))).toMatchObject({ due: 0, sent: 0 }); // 05:30 in Doha
    expect(await run(at(tomorrow, 6))).toMatchObject({ due: 1, sent: 1 }); // 06:30
    expect(await run(at(tomorrow, 7))).toMatchObject({ due: 0, sent: 0 }); // once a day

    const message = await emailTo(email, { subject: /^Your briefing: /, sentAfter });
    expect(message.HTML).toContain(headline);
    expect(message.Text).toContain("FOR YOU");

    // A made-up link doesn't stop anyone's briefing.
    await page.goto(`/briefing/stop?u=${id}&t=not-the-token`);
    await page.getByRole("button", { name: "Stop the briefing" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link didn’t work");

    // The email's own link does, after asking.
    const href = message.HTML.match(/href="([^"]*\/briefing\/stop[^"]*)"/)![1].replaceAll(
      "&amp;",
      "&",
    );
    const { pathname, search } = new URL(href);
    await page.goto(pathname + search);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stop the daily briefing?");
    await page.getByRole("button", { name: "Stop the briefing" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "You won’t get the daily briefing",
    );

    expect(await run(at(after, 6))).toMatchObject({ due: 0, sent: 0 });
    expect(await countEmailsTo(email, /^Your briefing: /)).toBe(1); // only the first morning's
    await page.goto("/my-news");
    await expect(
      page.getByRole("switch", { name: /Send me the daily briefing/ }),
    ).not.toBeChecked();
  } finally {
    await removeStory(slug, headline);
    if (topicId) await removeTopic(slug);
  }
});

test("the briefing run and one-click unsubscribe need their secrets", async ({ request }) => {
  expect((await request.post("/api/briefing/run")).status()).toBe(404);
  expect(
    (
      await request.post("/api/briefing/run", {
        headers: { Authorization: "Bearer wrong-secret-123456" },
      })
    ).status(),
  ).toBe(404);
  const fake = "00000000-0000-0000-0000-000000000000";
  expect((await request.post(`/api/briefing/unsubscribe?u=${fake}&t=made-up`)).status()).toBe(404);
});
