import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { uniqueName } from "./sign-in";
import { refreshCaches, removeStory, seedStory } from "./supabase-admin";

test("the masthead's search shows matching stories as you type", async ({ page }, info) => {
  const slug = uniqueName("search", info.project.name);
  const word = `zyx${slug.replace(/[^a-z0-9]/g, "")}`;
  const headline = `Lighthouse keepers ${word} strike`;
  try {
    const { storyId } = await seedStory(slug, headline);
    await refreshCaches(page.request);
    await page.goto("/");

    // The magnifier opens a box across the top; typing lists the matches under it.
    await page.locator("a[aria-label=Search][data-ready=true]").click();
    const box = page.getByRole("combobox", { name: "Search stories" });
    await expect(box).toBeFocused();
    await box.pressSequentially(word);
    const match = page.getByRole("option", { name: new RegExp(headline) });
    await expect(match).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // Arrow down and Enter open the story.
    await box.press("ArrowDown");
    await expect(match).toHaveAttribute("aria-selected", "true");
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/story/${storyId}$`));

    // Escape closes it; "/" opens it again, and Enter alone shows every result.
    await page.keyboard.press("/");
    await expect(box).toBeFocused();
    await box.press("Escape");
    await expect(box).toHaveCount(0);
    await page.keyboard.press("/");
    await box.fill(word);
    await expect(match).toBeVisible();
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole("status")).toContainText(`1 story for “${word}”`);
    // The full results page keeps the words searched for.
    await expect(page.getByLabel("Search stories")).toHaveValue(word);
    await expect(page.getByRole("link", { name: headline })).toHaveAttribute(
      "href",
      `/story/${storyId}`,
    );

    await page.goto("/search?q=qqqnothingmatchesthis");
    await expect(page.getByRole("status")).toContainText("No stories for");
  } finally {
    await removeStory(slug, headline);
  }
});

test("without the page's script, the magnifier still leads to search", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await context.close();
});
