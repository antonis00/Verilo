import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", h1: "Today’s front page" },
  { path: "/about", h1: "One story per event, not ten copies of the same article" },
  { path: "/privacy", h1: "Privacy policy" },
  { path: "/terms", h1: "Terms of use" },
  { path: "/sign-in", h1: "Sign in or create an account" },
  { path: "/no-such-page", h1: "There’s no page at this address" },
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const { path, h1 } of PAGES) {
      test(`${path} has its heading and no accessibility violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });
    }
  });
}

test("the page never scrolls sideways", async ({ page }) => {
  for (const { path } of PAGES) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("headlines use the serif and body text the sans", async ({ page }) => {
  await page.goto("/about");
  const h1 = await page
    .getByRole("heading", { level: 1 })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  const body = await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
  expect(h1).toMatch(/Newsreader/i);
  expect(body).toMatch(/Public Sans/i);
});

test("the skip link jumps to the content", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "keyboard navigation is a desktop check");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("security headers are sent", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});
