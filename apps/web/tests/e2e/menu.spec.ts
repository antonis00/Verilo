import { expect, test } from "@playwright/test";
import { signIn, skipWizard, uniqueName } from "./sign-in";

test("a reader chooses the sections on the menu and their order", async ({ page }, info) => {
  await signIn(page, `${uniqueName("menu", info.project.name)}@example.com`);
  await skipWizard(page);

  // The cog in the masthead opens the settings.
  await page
    .getByRole("navigation", { name: "Account" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/my-news$/);

  const form = page.getByRole("region", { name: "Your sections menu" });
  const rows = form.getByRole("listitem");
  const names = async () =>
    (await rows.allTextContents()).map((t) =>
      t
        .replace(/^\d+/, "")
        .replace(/↑↓Remove$/, "")
        .trim(),
    );
  // Other tests add and remove their own topics ("Topic …", "Section …", "Long section name …")
  // while this one runs:
  // only the real catalog's are compared.
  const real = (list: string[]) =>
    list.filter((n) => !/^(Topic|Section|Long section name) /.test(n));
  await expect(form).toHaveAttribute("data-ready", "true");
  const before = real(await names());
  expect(before.length).toBeGreaterThan(2);

  // Second section to the top, drop the last one, add another, save.
  await form.getByRole("button", { name: `Move ${before[1]} up` }).click();
  await form.getByRole("button", { name: `Remove ${before[before.length - 1]}` }).click();
  const adding = form.getByLabel("Add a section");
  const options = real(
    (await adding.locator("option").allTextContents()).slice(1).map((t) => t.trim()),
  );
  const extra = options[0];
  await adding.selectOption({ label: extra });
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await form.getByRole("button", { name: "Save menu" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved. Your menu shows these sections now.");

  // The bar under the masthead follows it, after "Top stories".
  const expected = [before[1], before[0], ...before.slice(2, -1), extra];
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Sections" }).getByRole("link");
  const shown = async () => real(await bar.allTextContents());
  await expect.poll(shown).toEqual(["Top stories", ...expected]);

  // And back to the default.
  await page.goto("/my-news");
  await form.getByRole("button", { name: "Back to the default" }).click();
  await expect(form.getByRole("status")).toContainText("back to the default");
  // The default, as My News now shows it (other tests may add featured topics meanwhile).
  await page.goto("/my-news");
  await expect(rows.first()).toBeVisible();
  const defaults = real(await names());
  await page.goto("/");
  await expect.poll(shown).toEqual(["Top stories", ...defaults]);
});
