import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const LIGHT_PAPER = "rgb(250, 248, 243)";
const DARK_PAPER = "rgb(18, 17, 16)";

const background = (page: Page) =>
  page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
const opacity = (page: Page, icon: "moon" | "sun") =>
  page.locator(`.theme-icon-${icon}`).evaluate((el) => getComputedStyle(el).opacity);

test.describe("with the system in light mode", () => {
  test.use({ colorScheme: "light" });

  test("the moon turns the page dark, and the choice survives a reload", async ({ page }) => {
    await page.goto("/");
    expect(await background(page)).toBe(LIGHT_PAPER);
    const toDark = page.getByRole("button", { name: "Switch to dark theme" });
    await expect(toDark).toBeVisible();
    await expect.poll(() => opacity(page, "moon")).toBe("1");

    await toDark.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await background(page)).toBe(DARK_PAPER);
    await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
    await expect.poll(() => opacity(page, "sun")).toBe("1");

    // Applied before the first paint: right after a reload the page is already dark.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await background(page)).toBe(DARK_PAPER);

    const results = await new AxeBuilder({ page }).withTags(["wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    expect(await background(page)).toBe(LIGHT_PAPER);
  });
});

test.describe("with the system in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("the page follows the system until the sun is clicked", async ({ page }) => {
    await page.goto("/sign-in");
    expect(await background(page)).toBe(DARK_PAPER);
    await expect.poll(() => opacity(page, "sun")).toBe("1");

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    expect(await background(page)).toBe(LIGHT_PAPER);

    await page.goto("/");
    expect(await background(page)).toBe(LIGHT_PAPER);
  });
});

test("the theme button is a 44px target reachable by keyboard", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "keyboard check runs on desktop");
  await page.goto("/");
  const button = page.getByRole("button", { name: "Switch to dark theme" });
  const box = await button.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
