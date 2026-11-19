import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signInLinkFor } from "./mailpit";
import { makeEditor, removeOutlet, seedOutlet } from "./supabase-admin";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  const { pathname, search } = new URL(await signInLinkFor(email));
  await page.goto(pathname + search);
  await expect(page).toHaveURL(/\/my-news$/);
}

const unique = (what: string, project: string) =>
  `${what}-${project}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

test("the desk is not found for visitors and ordinary readers", async ({ page }, info) => {
  const missing = await page.goto("/desk");
  expect(missing?.status()).toBe(404);

  await signIn(page, `${unique("reader", info.project.name)}@example.com`);
  const stillMissing = await page.goto("/desk");
  expect(stillMissing?.status()).toBe(404);
  await expect(page.getByRole("navigation", { name: "Account" })).not.toContainText("Desk");
});

test("an editor sees the latest articles and each source's tier, lean and feeds", async ({
  page,
}, info) => {
  const email = `${unique("editor", info.project.name)}@example.com`;
  const slug = unique("test-outlet", info.project.name).toLowerCase();
  const headline = `Test headline ${slug}`;

  await signIn(page, email);
  await makeEditor(email);
  await seedOutlet(slug, headline);
  try {
    await page.goto("/desk");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The desk");
    await expect(page.getByRole("navigation", { name: "Account" })).toContainText("Desk");

    const article = page.getByRole("listitem").filter({ hasText: headline });
    await expect(article).toContainText(`Test Outlet ${slug}`);
    await expect(article).toContainText("Reputable · Lean right");
    await expect(article.getByRole("link", { name: headline })).toHaveAttribute(
      "href",
      `https://test-outlet.example/${slug}`,
    );

    const source = page
      .getByRole("region", { name: "Sources" })
      .getByRole("listitem")
      .filter({ hasText: `Test Outlet ${slug}` });
    await expect(source).toContainText("Tier 2 (Reputable)");
    await expect(source).toContainText("not reviewed");

    const results = await new AxeBuilder({ page }).withTags(["wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  } finally {
    await removeOutlet(slug);
  }
});
