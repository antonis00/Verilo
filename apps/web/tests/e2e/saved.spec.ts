import { expect, test } from "@playwright/test";
import { signIn, skipWizard, uniqueName } from "./sign-in";
import { refreshCaches, removeStory, seedStory } from "./supabase-admin";

test("a reader saves a story and finds it in Saved stories", async ({ page }, info) => {
  const slug = uniqueName("saved", info.project.name);
  const headline = `Saved story ${slug}`;
  try {
    const { storyId } = await seedStory(slug, headline);
    await refreshCaches(page.request);
    await signIn(page, `${slug}@example.com`);
    await skipWizard(page);
    await expect(page).toHaveURL(/\/$/);

    await page.goto(`/story/${storyId}`);
    const save = page.getByRole("button", { name: "Save for later" });
    await save.click();
    await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.goto("/preferences");
    await page.getByRole("link", { name: "Saved stories" }).click();
    await expect(page.getByRole("link", { name: headline })).toBeVisible();

    // Unsaving takes it off the list.
    await page.goto(`/story/${storyId}`);
    await page.getByRole("button", { name: "Saved" }).click();
    await expect(page.getByRole("button", { name: "Save for later" })).toBeVisible();
    await page.goto("/saved");
    await expect(page.getByText("Nothing saved yet.")).toBeVisible();
  } finally {
    await removeStory(slug, headline);
  }
});
