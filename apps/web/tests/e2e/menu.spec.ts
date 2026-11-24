import { expect, test } from "@playwright/test";
import { signIn, skipWizard, uniqueName } from "./sign-in";
import { refreshCaches, removeTopic, seedTopic } from "./supabase-admin";

// Self-contained: the test's own three sections, whatever else the catalog holds (CI starts with
// none; locally there are the real ones, and parallel tests add and remove their own).
test("a reader chooses the sections on the menu and their order", async ({ page }, info) => {
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
    const form = page.getByRole("region", { name: "Your sections menu" });
    await expect(form).toHaveAttribute("data-ready", "true");
    // By default, the featured sections: this test's three among them.
    for (const name of names) await expect(form.getByText(name, { exact: true })).toBeVisible();

    // Clear the menu, then add the three in the order C, A, B, and save.
    const removes = form.getByRole("button", { name: /^Remove / });
    while ((await removes.count()) > 0) await removes.first().click();
    const adding = form.getByLabel("Add a section");
    for (const name of [names[2], names[0], names[1]]) {
      await adding.selectOption({ label: name });
      await form.getByRole("button", { name: "Add", exact: true }).click();
    }
    // Then B up one place: C, B, A.
    await form.getByRole("button", { name: `Move ${names[1]} up` }).click();
    await form.getByRole("button", { name: "Save menu" }).click();
    await expect(form.getByRole("status")).toHaveText("Saved. Your menu shows these sections now.");

    // The bar under the masthead is exactly that, after "Top stories".
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Sections" }).getByRole("link");
    await expect(bar).toHaveText(["Top stories", names[2], names[1], names[0]]);

    // Back to the default: the featured sections again.
    await page.goto("/my-news");
    await expect(form).toHaveAttribute("data-ready", "true");
    await form.getByRole("button", { name: "Back to the default" }).click();
    await expect(form.getByRole("status")).toContainText("back to the default");
    await page.goto("/");
    for (const name of names) await expect(bar.filter({ hasText: name })).toHaveCount(1);
  } finally {
    for (const s of slugs) await removeTopic(s);
  }
});
