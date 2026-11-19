import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./sign-in";
import { refreshCaches, removeStory, removeTopic, seedStory, seedTopic } from "./supabase-admin";

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
  // Either stories or the empty state, and always an end: the page is finite.
  await expect(
    page.getByText("You’re caught up.").or(page.getByRole("heading", { name: "No stories yet" })),
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
    topicId = await seedTopic(slug, topicName);
    await seedStory(slug, headline, { country: "IE", topicId });
    await refreshCaches(page.request);

    await signIn(page, `${slug}@example.com`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Make the front page yours");
    expect(await axe(page)).toEqual([]);

    // Step 1: topics.
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    const topicChip = page.getByRole("button", { name: topicName });
    await topicChip.click();
    await expect(topicChip).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Next" }).click();

    // Step 2: places. Focus moves to the new question.
    await expect(page.getByRole("heading", { name: "Which places matter to you?" })).toBeFocused();
    await page.getByRole("button", { name: "Ireland" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // Step 3: outlets, grouped by country; Ireland is open because it was chosen.
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

    // Settings show the same choices, and saving a change works.
    await page.goto("/my-news");
    await expect(page.getByRole("button", { name: topicName }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Ireland" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("switch", { name: /Opinion pieces/ })).not.toBeChecked();
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
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today’s front page");

  // Next time the link goes straight to the front page, not the wizard.
  await page.getByRole("link", { name: "My News" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await signIn(page, `${slug}@example.com`, /\/$/);
});

test("the section menu opens a topic's own page", async ({ page }, info) => {
  const slug = uniqueName("section", info.project.name);
  const topicName = `Section ${slug}`;
  const headline = `Section story ${slug}`;
  try {
    const topicId = await seedTopic(slug, topicName);
    await seedStory(slug, headline, { topicId });
    await refreshCaches(page.request);

    await page.goto("/");
    const sections = page.getByRole("navigation", { name: "Sections" });
    await expect(sections.getByRole("link", { name: "Top stories" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await sections.getByRole("link", { name: topicName }).click();

    await expect(page).toHaveURL(new RegExp(`/topic/${slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(topicName);
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
