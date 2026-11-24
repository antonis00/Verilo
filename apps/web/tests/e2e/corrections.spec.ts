import { expect, test } from "@playwright/test";
import { signIn, uniqueName } from "./sign-in";
import { makeEditor, refreshCaches, removeStory, seedStory, seedSummary } from "./supabase-admin";

test("a reported mistake is withdrawn by an editor and corrected in public", async ({
  page,
  browser,
}, info) => {
  const slug = uniqueName("correction", info.project.name);
  const headline = `Corrected story ${slug}`;
  try {
    const { storyId, articleIds } = await seedStory(slug, headline);
    await seedSummary(storyId, [
      { text: "Ministers met in Lisbon on Thursday.", article_ids: [articleIds[0]] },
      { text: "They agreed a shared statement.", article_ids: articleIds },
    ]);
    await refreshCaches(page.request);

    // A visitor, not signed in, reports it.
    const visitor = await browser.newPage();
    await visitor.goto(`/story/${storyId}`);
    await visitor.getByText("Report a mistake").click();
    await visitor.getByLabel("What is wrong?").fill("The meeting was in Porto, not Lisbon.");
    await visitor.getByRole("button", { name: "Send report" }).click();
    await expect(visitor.getByRole("status")).toHaveText("Thank you. An editor will check it.");
    await visitor.close();

    // An editor sees it on the desk and withdraws the summary with a public note.
    const email = `${uniqueName("editor-corr", info.project.name)}@example.com`;
    await signIn(page, email);
    await makeEditor(email);
    await page.goto("/desk");
    const report = page
      .getByRole("region", { name: "Reported mistakes" })
      .getByRole("listitem")
      .filter({ hasText: "The meeting was in Porto, not Lisbon." });
    await expect(report).toContainText(headline);
    await report.getByLabel("Correction note (public)").fill("The summary gave the wrong city.");
    await report.getByRole("button", { name: "Withdraw the summary" }).click();
    await expect(report).toHaveCount(0);

    // The story goes back to headlines only and says why; the corrections page lists it.
    await page.goto(`/story/${storyId}`);
    await expect(page.getByRole("region", { name: "In brief" })).toHaveCount(0);
    await expect(page.getByText(/^Correction, /)).toBeVisible();
    await expect(page.getByText("The summary gave the wrong city.")).toBeVisible();
    await page.goto("/corrections");
    const entry = page.getByRole("listitem").filter({ hasText: headline });
    await expect(entry).toContainText("The summary gave the wrong city.");
  } finally {
    await removeStory(slug, headline);
  }
});
