import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn, skipWizard, uniqueName } from "./sign-in";
import {
  refreshCaches,
  removeStory,
  removeTopic,
  seedStory,
  seedSummary,
  seedTopic,
} from "./supabase-admin";

const axe = async (page: import("@playwright/test").Page) =>
  (
    await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  ).violations.map((v) => `${v.id}: ${v.help}`);

test("visitors get the front page with an invitation to make it theirs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today’s front page");
  const invite = page.getByRole("complementary", { name: "Make this front page yours" });
  await expect(invite.getByRole("link", { name: "Get started" })).toHaveAttribute(
    "href",
    "/welcome",
  );
  // Either stories or the empty state, and always an end: the page is finite. Only the visible
  // one counts: while React streams in a replacement, a hidden copy can briefly be in the page.
  await expect(
    page
      .getByText("You’re caught up.")
      .or(page.getByRole("heading", { name: "No stories yet" }))
      .filter({ visible: true }),
  ).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test("a story page shows every outlet's version with its lean and labels", async ({
  page,
}, info) => {
  const slug = uniqueName("front-story", info.project.name);
  const headline = `Story page ${slug}`;
  try {
    const { storyId } = await seedStory(slug, headline);
    await refreshCaches(page.request);
    await page.goto(`/story/${storyId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(headline);
    const coverage = page.getByRole("region", { name: "How each outlet reported it" });
    const report = coverage.getByRole("listitem").filter({ hasText: `Test Outlet ${slug}-a` });
    await expect(report).toContainText("Fact base · Centre");
    await expect(report.getByRole("link", { name: headline })).toHaveAttribute(
      "href",
      `https://test-outlet.example/${slug}/report`,
    );
    const opinion = coverage.getByRole("listitem").filter({ hasText: `Test Outlet ${slug}-b` });
    await expect(opinion).toContainText("Lean right · Opinion");
    // Leans in the summary line count news reports only.
    await expect(page.getByText(/leans: Centre$/)).toBeVisible();
    // Who reported it counts each outlet with a news report once: here the centre fact base.
    const who = page.getByRole("region", { name: "Who reported it" });
    await expect(who).toContainText("1 outlet with a news report");
    await expect(who.getByRole("definition")).toHaveText(["0", "0", "1", "0", "0", "1", "0", "0"]);
    expect(await axe(page)).toEqual([]);
  } finally {
    await removeStory(slug, headline);
  }
});

test("a checked summary leads the story page, each point linking to its outlets", async ({
  page,
}, info) => {
  const slug = uniqueName("summary", info.project.name);
  const headline = `Summarised story ${slug}`;
  try {
    const { storyId, articleIds } = await seedStory(slug, headline);
    await seedSummary(storyId, [
      { text: "Ministers met in Lisbon on Thursday.", article_ids: [articleIds[0]] },
      { text: "They agreed a shared statement.", article_ids: articleIds },
    ]);
    await refreshCaches(page.request);
    await page.goto(`/story/${storyId}`);
    const brief = page.getByRole("region", { name: "In brief" });
    const first = brief.getByRole("listitem").filter({ hasText: "Ministers met in Lisbon" });
    await expect(first.getByRole("link", { name: `Test Outlet ${slug}-a` })).toHaveAttribute(
      "href",
      `https://test-outlet.example/${slug}/report`,
    );
    await expect(brief.getByRole("listitem")).toHaveCount(2);
    await expect(brief).toContainText("Summarised by an AI model (gpt-oss-120b)");
    await expect(brief).toContainText("by a different model (qwen3.8-27b)");
    expect(await axe(page)).toEqual([]);
  } finally {
    await removeStory(slug, headline);
  }
});

test("an unknown story is not found", async ({ page }) => {
  const response = await page.goto("/story/999999999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "There’s no page at this address",
  );
  expect(response?.status()).toBeLessThan(500);
});

test("the welcome wizard saves choices that shape the front page and settings", async ({
  page,
}, info) => {
  const slug = uniqueName("wizard", info.project.name);
  const topicName = `Topic ${slug}`;
  const headline = `Followed story ${slug}`;
  let topicId = 0;
  try {
    // Not featured: the reader finds it by searching, here by its alias.
    topicId = await seedTopic(slug, topicName, { aliases: [`alias-${slug}`] });
    await seedStory(slug, headline, { country: "DE", topicId });
    await refreshCaches(page.request);

    await signIn(page, `${slug}@example.com`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make the front page yours");
    expect(await axe(page)).toEqual([]);

    // Step 1: topics. Featured ones are chips; others are found by searching.
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
    const topicChip = page.getByRole("button", { name: topicName });
    await expect(topicChip).toHaveCount(0);
    await expect(page.locator("[data-testid=wizard][data-ready=true]")).toBeVisible();
    await page.getByRole("searchbox", { name: "Search topics to follow" }).fill(`alias-${slug}`);
    await expect(page.getByText(`1 match for “alias-${slug}”`)).toBeVisible();
    await topicChip.click();
    await expect(topicChip).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2: places (regions). Focus moves to the new question.
    await expect(
      page.getByRole("heading", { name: "Which parts of the world matter to you?" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Europe", exact: true }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 3: a short list of well-known outlets, and all of them by region under a fold, where
    // Europe is open because it was chosen. (CI has no real outlets: then it's the full list.)
    const allOutlets = page.getByText(/^All \d+ outlets, by region$/);
    if (await allOutlets.count()) await allOutlets.click();
    await page.getByRole("button", { name: `Follow Test Outlet ${slug}-a` }).click();
    await page.getByRole("button", { name: `Hide Test Outlet ${slug}-b` }).click();
    await expect(page.getByRole("button", { name: `Hide Test Outlet ${slug}-b` })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Next" }).click();

    // Step 4: what to show.
    await page.getByRole("switch", { name: /Opinion pieces/ }).uncheck();
    expect(await axe(page)).toEqual([]);
    await page.getByRole("button", { name: "Next" }).click();

    // Step 5: the morning briefing, off unless the reader turns it on.
    const briefing = page.getByRole("switch", { name: /email me a daily briefing/ });
    await expect(briefing).not.toBeChecked();
    await briefing.check();
    await page.getByLabel("Time", { exact: true }).selectOption({ label: "8 am" });
    expect(await axe(page)).toEqual([]);
    await page.getByRole("button", { name: "Show my front page" }).click();

    // The personal front page: no invitation, and the followed story says why it's there.
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("complementary", { name: "Make this front page yours" }),
    ).toHaveCount(0);
    const story = page.getByRole("article").filter({ hasText: headline });
    await expect(story).toBeVisible();
    await expect(story).toContainText(`You follow ${topicName}`);
    // The hidden outlet doesn't appear on the card.
    await expect(story).not.toContainText(`${slug}-b`);

    // Preferences show the same choices, and saving a change works.
    await page.goto("/preferences");
    const briefingForm = page.getByRole("form", { name: "Daily briefing" });
    await expect(
      briefingForm.getByRole("switch", { name: /Send me the daily briefing/ }),
    ).toBeChecked();
    await expect(briefingForm.getByLabel("Time", { exact: true })).toHaveValue("8");
    await expect(page.getByRole("button", { name: topicName }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Europe", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("switch", { name: /Opinion pieces/ })).not.toBeChecked();

    // The outlets list folds: all regions at once, or one at a time. Which way the control
    // starts depends on the data (with outlets in one region only, it opens all of them).
    const outletsSection = page.getByRole("region", {
      name: "Any outlets you prefer, or want to skip?",
    });
    const regions = outletsSection.locator("details");
    const openCount = () => outletsSection.locator("details[open]").count();
    const fold = page.getByRole("button", { name: /^(Expand|Collapse) all$/ });
    if ((await fold.textContent())?.includes("Expand")) await fold.click();
    await expect.poll(openCount).toBe(await regions.count());
    await page.getByRole("button", { name: "Collapse all" }).click();
    await expect.poll(openCount).toBe(0);
    await regions.first().locator("summary").click();
    await expect.poll(openCount).toBe(1);
    // With one region open: "Expand all" if there are others, else everything is open.
    const label = (await regions.count()) > 1 ? "Expand all" : "Collapse all";
    await expect(page.getByRole("button", { name: label })).toBeVisible();
    await page.getByRole("switch", { name: /Opinion pieces/ }).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("switch", { name: /Opinion pieces/ })).toBeChecked();
    expect(await axe(page)).toEqual([]);
  } finally {
    await removeStory(slug, headline);
    await removeTopic(slug);
  }
});

test("a reader can skip the wizard and still gets a front page", async ({ page }, info) => {
  const slug = uniqueName("skipper", info.project.name);
  await signIn(page, `${slug}@example.com`);
  await skipWizard(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today’s front page");

  // Next time the link goes straight to the front page, not the wizard.
  await page.getByRole("link", { name: "Preferences" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await signIn(page, `${slug}@example.com`, /\/$/);
});

test("the section menu opens a topic's own page", async ({ page }, info) => {
  const slug = uniqueName("section", info.project.name);
  const topicName = `Section ${slug}`;
  const headline = `Section story ${slug}`;
  try {
    const topicId = await seedTopic(slug, topicName, { featured: true });
    await seedStory(slug, headline, { topicId });
    const sections = page.getByRole("navigation", { name: "Sections" });
    // Parallel tests refresh caches too; reload until this test's section is in the menu.
    await expect(async () => {
      await refreshCaches(page.request);
      await page.goto("/");
      await expect(sections.getByRole("link", { name: topicName })).toBeAttached({
        timeout: 1000,
      });
    }).toPass({ timeout: 20_000 });
    await expect(sections.getByRole("link", { name: "Top stories" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await sections.getByRole("link", { name: topicName }).click();

    await expect(page).toHaveURL(new RegExp(`/topic/${slug}$`));
    // The topic's own page can lag the menu by a moment while parallel tests refresh caches.
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(topicName, {
        timeout: 1000,
      });
    }).toPass({ timeout: 20_000 });
    await expect(sections.getByRole("link", { name: topicName })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("article").filter({ hasText: headline })).toBeVisible();
    expect(await axe(page)).toEqual([]);
  } finally {
    await removeStory(slug, headline);
    await removeTopic(slug);
  }
});

test("an unknown section is not found", async ({ page }) => {
  await page.goto("/topic/no-such-topic");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "There’s no page at this address",
  );
});
