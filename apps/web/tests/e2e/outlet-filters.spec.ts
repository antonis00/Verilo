import { expect, test } from "@playwright/test";
import { signIn, skipWizard, uniqueName } from "./sign-in";
import { refreshCaches, removeOutlets, seedOutlets } from "./supabase-admin";

test("settings filter the outlets by reliability and lean", async ({ page }, info) => {
  test.slow();
  const slug = uniqueName("filters", info.project.name);
  try {
    const names = await seedOutlets(slug);
    await refreshCaches(page.request);
    await signIn(page, `${slug}@example.com`);
    await skipWizard(page);
    await page.goto("/preferences#settings-outlets");
    await expect(page.locator("form[data-ready=true]").first()).toBeVisible();
    const outlets = page.locator("#settings-outlets");
    const row = (name: string) => outlets.getByRole("listitem").filter({ hasText: name });
    const reliability = outlets.getByRole("group", { name: "Filter by reliability" });
    const lean = outlets.getByRole("group", { name: "Filter by lean" });

    // Fact base only: the reputable and weaker ones leave the list.
    await reliability.getByRole("button", { name: "Fact base" }).click();
    await expect(reliability.getByRole("button", { name: "Fact base" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(row(names.fact)).toBeVisible();
    await expect(row(names.rep)).toHaveCount(0);
    await expect(row(names.weak)).toHaveCount(0);
    await expect(outlets.getByText(/^Showing \d+ of \d+ outlets\./)).toBeVisible();

    // Add Reputable, and narrow to right-leaning: only the reputable one, which leans right.
    await reliability.getByRole("button", { name: "Reputable" }).click();
    await lean.getByRole("button", { name: "Lean right" }).click();
    await expect(row(names.rep)).toBeVisible();
    await expect(row(names.fact)).toHaveCount(0);

    // Show all brings everything back, and no filter is chosen.
    await outlets.getByRole("button", { name: "Show all" }).click();
    for (const name of Object.values(names)) await expect(row(name)).toHaveCount(1);
    await expect(outlets.locator("[aria-pressed=true]")).toHaveCount(0);
  } finally {
    await removeOutlets(slug);
  }
});
