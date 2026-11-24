import { expect, test } from "@playwright/test";
import { signIn, skipWizard, uniqueName } from "./sign-in";
import { makeEditor, ownSourceFetched, removeOwnSource } from "./supabase-admin";

// A reader accepts the note, adds a Telegram channel, reads its posts on the front page and in
// From your sources, and an editor blocks it. The fetcher's part (reading the channel) is stood
// in for by writing what it would store.
test("a reader adds their own source, reads it apart from Verilo's stories, and it can be blocked", async ({
  page,
}, info) => {
  test.slow(); // many pages, the desk among them
  const slug = uniqueName("own", info.project.name);
  const channel = `e2e_${slug.replace(/[^a-z0-9]/gi, "").slice(-20)}`;
  const url = `https://t.me/s/${channel.toLowerCase()}`;
  const headline = `Ferry timetable changes ${slug}`;
  try {
    await signIn(page, `${slug}@example.com`);
    await skipWizard(page);

    await page.goto("/my-news#own-sources");
    const section = page.locator("#own-sources[data-ready=true]");
    await expect(section.getByTestId("own-sources-notice")).toContainText(
      "Verilo doesn’t check or rate these sources",
    );
    await section.getByRole("button", { name: "I understand, let me add sources" }).click();

    const field = section.getByLabel("Add a source");
    await field.fill("https://192.168.1.1/feed");
    await section.getByRole("button", { name: "Add" }).click();
    await expect(section.getByRole("alert")).toHaveText("Only public websites can be added.");

    await field.fill(`@${channel}`);
    await section.getByRole("button", { name: "Add" }).click();
    await expect(section.getByRole("status")).toHaveText(
      "Added. Its latest posts appear within a few minutes.",
    );
    const list = section.getByRole("list", { name: "Your sources" });
    await expect(list).toContainText(`@${channel.toLowerCase()}`);
    await expect(list).toContainText("Telegram channel · Unverified · added by you");
    await expect(list).toContainText("Checking it now");

    await ownSourceFetched(url, "Harbour Live", {
      url: `https://t.me/${channel.toLowerCase()}/7`,
      title: headline,
      snippet: "From Monday.",
    });

    await page.goto("/");
    const yours = page.getByRole("region", { name: "From your sources" });
    await expect(yours.getByRole("link", { name: headline })).toBeVisible();
    await expect(yours).toContainText("Harbour Live · Unverified · added by you");
    await yours.getByRole("link", { name: "Everything from your sources" }).click();
    await expect(page).toHaveURL(/\/your-sources$/);
    await expect(page.getByRole("link", { name: headline })).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow ugc",
    );
    await expect(page.getByText("From Monday.")).toBeVisible();

    const exported = await page.request.get("/api/account/export");
    expect(JSON.stringify(await exported.json())).toContain(url);

    // An editor sees the source with how many follow it, never who, and blocks it.
    await makeEditor(`${slug}@example.com`);
    await page.goto("/desk");
    const row = page.getByTestId("own-source-row").filter({ hasText: url });
    await expect(row).toContainText("1 reader");
    await row.getByLabel("Reason (its readers see it)").fill("Pretends to be a ferry company");
    await row.getByRole("button", { name: "Block" }).click();
    await expect(row).toContainText("Blocked: Pretends to be a ferry company");

    await page.goto("/my-news#own-sources");
    await expect(page.locator("#own-sources")).toContainText(
      "Blocked by Verilo’s editors: Pretends to be a ferry company",
    );
    await page.goto("/your-sources");
    await expect(page.getByRole("link", { name: headline })).toHaveCount(0);

    await page.goto("/my-news#own-sources");
    await page
      .locator("#own-sources[data-ready=true]")
      .getByRole("button", { name: `Remove Harbour Live` })
      .click();
    await expect(
      page.locator("#own-sources").getByRole("list", { name: "Your sources" }),
    ).toHaveCount(0);
  } finally {
    await removeOwnSource(url);
  }
});
