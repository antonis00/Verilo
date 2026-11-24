import { expect, test } from "@playwright/test";
import { signIn, skipWizard, uniqueName } from "./sign-in";
import { refreshCaches, removeTopic, seedTopic } from "./supabase-admin";

// Self-contained: the test's own three topics, whatever else the catalog holds (CI starts with
// none; locally there are the real ones, and parallel tests add and remove their own).
test("the topics a reader follows, dragged into order, lead the sections bar", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const slug = uniqueName("menu", info.project.name);
  const names = ["A", "B", "C"].map((x) => `Menu ${x} ${slug}`);
  const slugs = names.map((_, i) => `${slug}-${i}`);
  try {
    for (const [i, name] of names.entries()) await seedTopic(slugs[i], name, { featured: true });
    await refreshCaches(page.request);
    await signIn(page, `${slug}@example.com`);
    await skipWizard(page);

    // The cog in the masthead opens the settings.
    await page
      .getByRole("navigation", { name: "Account" })
      .getByRole("link", { name: "Settings" })
      .click();
    await expect(page).toHaveURL(/\/my-news$/);
    await expect(page.locator("form[data-ready=true]").first()).toBeVisible();
    const topics = page.locator("#settings-topics");
    const toAdd = topics.getByRole("group", { name: "Topics to follow" });
    const mine = topics.getByRole("list", { name: "Your topics, in order" });

    // Follow A, B and C: each goes to the end of Your topics.
    for (const name of names) await toAdd.getByRole("button", { name }).click();
    await expect(mine.getByRole("button")).toHaveText(names);

    // Drag C before A: C, A, B. (On screen first: a pointer can only drag what's in view.)
    await mine.scrollIntoViewIfNeeded();
    const from = (await mine.getByRole("button", { name: names[2] }).boundingBox())!;
    const to = (await mine.getByRole("button", { name: names[0] }).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2, { steps: 4 });
    await page.mouse.move(to.x + 4, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(mine.getByRole("button")).toHaveText([names[2], names[0], names[1]]);

    // Shift + arrow moves one by keyboard: B before A gives C, B, A.
    await mine.getByRole("button", { name: names[1] }).focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(mine.getByRole("button")).toHaveText([names[2], names[1], names[0]]);
    await expect(mine.getByRole("button", { name: names[1] })).toBeFocused();

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    // The bar under the masthead starts with them, in that order.
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Sections" }).getByRole("link");
    await expect(bar.nth(1)).toHaveText(names[2]);
    await expect(bar.nth(2)).toHaveText(names[1]);
    await expect(bar.nth(3)).toHaveText(names[0]);

    // The order is kept: settings show it again, and pressing one stops following it.
    await page.goto("/my-news");
    await expect(page.locator("form[data-ready=true]").first()).toBeVisible();
    await expect(mine.getByRole("button")).toHaveText([names[2], names[1], names[0]]);
    await mine.getByRole("button", { name: names[1] }).click();
    await expect(mine.getByRole("button")).toHaveText([names[2], names[0]]);
    await expect(toAdd.getByRole("button", { name: names[1] })).toBeVisible();
  } finally {
    for (const s of slugs) await removeTopic(s);
  }
});
