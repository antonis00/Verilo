import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./sign-in";
import { makeEditor, removeStory, seedStory, seedSummary } from "./supabase-admin";

const unique = uniqueName;

test("the desk is not found for visitors and ordinary readers", async ({ page }, info) => {
  const missing = await page.goto("/desk");
  expect(missing?.status()).toBe(404);

  await signIn(page, `${unique("reader", info.project.name)}@example.com`);
  const stillMissing = await page.goto("/desk");
  expect(stillMissing?.status()).toBe(404);
  await expect(page.getByRole("navigation", { name: "Account" })).not.toContainText("Desk");
});

test("an editor sees stories with their outlets, leans, opinion labels and summary status", async ({
  page,
}, info) => {
  const email = `${unique("editor", info.project.name)}@example.com`;
  const slug = unique("test-outlet", info.project.name).toLowerCase();
  const headline = `Test headline ${slug}`;

  await signIn(page, email);
  await makeEditor(email);
  try {
    const { storyId, articleIds } = await seedStory(slug, headline);
    await seedSummary(
      storyId,
      [{ text: "Officials said 45 ministers attended.", article_ids: articleIds }],
      "point 1: the number 45 is not in its cited excerpts",
    );
    await page.goto("/desk");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The desk");
    await expect(page.getByRole("navigation", { name: "Account" })).toContainText("Desk");

    const story = page
      .getByRole("region", { name: "Stories" })
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: headline }) });
    // Only the news report counts for leans and the summary rule; the opinion piece doesn't.
    await expect(story).toContainText("Leans: Centre");
    await expect(story).toContainText("summary failed");
    await expect(story).toContainText("point 1: the number 45 is not in its cited excerpts");
    await story.getByText("The draft that failed").click();
    await expect(story).toContainText("Officials said 45 ministers attended.");

    await story.getByText("The 2 articles").click();
    const opinion = story.getByRole("listitem").filter({ hasText: `Our view on ${headline}` });
    await expect(opinion).toContainText("Lean right · Opinion");
    await expect(opinion.getByText("Opinion")).toHaveAttribute("title", "link path /opinion/");
    await expect(story.getByRole("link", { name: headline, exact: true })).toHaveAttribute(
      "href",
      `https://test-outlet.example/${slug}/report`,
    );

    const source = page
      .getByRole("region", { name: "Sources" })
      .getByRole("listitem")
      .filter({ hasText: `Test Outlet ${slug}-b` });
    await expect(source).toContainText("Tier 2 (Reputable)");
    await expect(source).toContainText("not reviewed");

    const results = await new AxeBuilder({ page }).withTags(["wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  } finally {
    await removeStory(slug, headline);
  }
});
