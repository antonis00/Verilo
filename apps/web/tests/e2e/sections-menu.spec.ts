import { expect, test, type Page } from "@playwright/test";
import { uniqueName } from "./sign-in";
import { refreshCaches, removeTopic, seedTopic } from "./supabase-admin";

// Enough sections that the menu overflows at any width, whatever the database holds.
const COUNT = 14;

// Tests run in parallel and all refresh the app's caches, so a page another test requested just
// before this one seeded its sections can put the older topic list back. Refresh and reload
// until this test's sections are there.
async function openWithSections(page: Page, first: string) {
  await expect(async () => {
    await refreshCaches(page.request);
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Sections" }).getByRole("link", {
        name: first,
        exact: true,
      }),
    ).toBeAttached({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

const scrollLeft = (page: Page) =>
  page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("list")
    .evaluate((el) => el.scrollLeft);

test.describe("the section menu scrolls sideways", () => {
  const slugs: string[] = [];
  let first = "";

  test.beforeEach(async ({ page }, info) => {
    slugs.length = 0;
    const base = uniqueName("menu", info.project.name);
    for (let i = 0; i < COUNT; i++) {
      const slug = `${base}-${i}`;
      slugs.push(slug);
      await seedTopic(slug, `Long section name ${i} ${base.slice(-5)}`, { featured: true });
    }
    first = `Long section name 0 ${base.slice(-5)}`;
    await refreshCaches(page.request);
  });

  test.afterEach(async () => {
    for (const slug of slugs) await removeTopic(slug);
  });

  test("a mouse wheel over the menu slides it, without scrolling the page", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "phone", "mouse wheel is a desktop check");
    await openWithSections(page, first);
    const menu = page.getByRole("navigation", { name: "Sections" });
    expect(await scrollLeft(page)).toBe(0);

    await menu.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await page.mouse.wheel(0, -300);
    await expect.poll(() => scrollLeft(page)).toBe(0);
  });

  test("a finger swipe slides it on a phone", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "touch is a phone check");
    await openWithSections(page, first);
    const list = page.getByRole("navigation", { name: "Sections" }).getByRole("list");
    const box = (await list.boundingBox())!;

    // A finger dragged from right to left across the menu, as raw touch events (Chrome's
    // synthetic scroll gesture doesn't reach this element; real touches do).
    const cdp = await page.context().newCDPSession(page);
    const y = Math.round(box.y + box.height / 2);
    const x = Math.round(box.x + box.width * 0.8);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - i * 20, y }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(0);
  });
});
