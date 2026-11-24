import { expect, test } from "@playwright/test";
import { uniqueName } from "./sign-in";
import { mergeStory, refreshCaches, removeStory, seedStory } from "./supabase-admin";

test("a link to a story merged into another opens that one", async ({ page }, info) => {
  const a = uniqueName("merged-a", info.project.name);
  const b = uniqueName("merged-b", info.project.name);
  try {
    const kept = await seedStory(a, `Kept story ${a}`);
    const gone = await seedStory(b, `Merged story ${b}`);
    await mergeStory(gone.storyId, kept.storyId);
    await refreshCaches(page.request);
    await page.goto(`/story/${gone.storyId}`);
    await expect(page).toHaveURL(new RegExp(`/story/${kept.storyId}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Kept story ${a}`);
  } finally {
    await removeStory(a, `Kept story ${a}`);
    await removeStory(b, `Merged story ${b}`);
  }
});
