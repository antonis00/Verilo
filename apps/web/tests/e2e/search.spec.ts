import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { uniqueName } from "./sign-in";
import { refreshCaches, removeStory, seedStory } from "./supabase-admin";

test("search finds a story by a word in its headline", async ({ page }, info) => {
  const slug = uniqueName("search", info.project.name);
  const word = `zyx${slug.replace(/[^a-z0-9]/g, "")}`;
  const headline = `Lighthouse keepers ${word} strike`;
  try {
    const { storyId } = await seedStory(slug, headline);
    await refreshCaches(page.request);
    await page.goto("/");
    await page.getByRole("link", { name: "Search" }).click();
    await page.getByLabel("Search stories").fill(word);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(`1 story for “${word}”`);
    await expect(page.getByRole("link", { name: headline })).toHaveAttribute(
      "href",
      `/story/${storyId}`,
    );
    const results = await new AxeBuilder({ page }).withTags(["wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await page.goto("/search?q=qqqnothingmatchesthis");
    await expect(page.getByRole("status")).toContainText("No stories for");
  } finally {
    await removeStory(slug, headline);
  }
});
