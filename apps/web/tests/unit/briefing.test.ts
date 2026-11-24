import { describe, expect, it } from "vitest";
import {
  buildBriefing,
  DEFAULT_BRIEFING,
  isTimeZone,
  renderEmail,
  settingsFrom,
  type Briefing,
} from "@/lib/briefing";
import type { Card, CardArticle, Ranked } from "@/lib/feed";

// Who is due is decided in the database: workers/tests/test_briefing_db.py.
describe("briefing settings", () => {
  it("accepts only real time zones and falls back to the defaults", () => {
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone(42)).toBe(false);
    expect(settingsFrom(null)).toEqual(DEFAULT_BRIEFING);
    expect(
      settingsFrom({
        user_id: "u",
        enabled: true,
        send_hour: 6,
        length: "full",
        time_zone: "Nowhere/Land",
      }),
    ).toEqual({ enabled: true, sendHour: 6, length: "full", timeZone: "UTC" });
  });
});

function ranked(id: number, opts: { summary?: string; snippet?: string; topic?: number } = {}) {
  const lead = { id: id * 10, source_id: 1, snippet: opts.snippet ?? "" } as CardArticle;
  const card = {
    id,
    topic_ids: opts.topic ? [opts.topic] : [],
    summary: opts.summary
      ? {
          bullets: [{ text: opts.summary, article_ids: [] }],
          writer: "w",
          checker: "c",
          created_at: "",
        }
      : null,
  } as unknown as Card;
  return {
    card,
    headline: `Story ${id}`,
    lead,
    outlets: id,
    visible: [],
    score: 1,
    reasons: [],
    followedTopic: true,
  } as Ranked;
}

describe("buildBriefing", () => {
  const names = new Map([[7, "Economy"]]);
  const page = {
    top: Array.from({ length: 12 }, (_, i) =>
      ranked(i + 1, { topic: 7, snippet: `Snippet ${i + 1}` }),
    ),
    alsoImportant: [ranked(3), ranked(50, { summary: "A checked point." }), ranked(51), ranked(52)],
  };

  it("takes 5 stories and 1 everyone-should-know for short, 10 and 2 for full, never repeating", () => {
    const short = buildBriefing(page, "short", names);
    expect(short.stories.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(short.everyone.map((s) => s.id)).toEqual([50]); // story 3 is already in the list
    const full = buildBriefing(page, "full", names);
    expect(full.stories).toHaveLength(10);
    expect(full.everyone.map((s) => s.id)).toEqual([50, 51]);
  });

  it("uses the checked summary's first point when there is one, else the excerpt", () => {
    const b = buildBriefing(page, "short", names);
    expect(b.stories[0]).toMatchObject({
      kicker: "Economy",
      line: "Snippet 1",
      fromSummary: false,
    });
    expect(b.everyone[0]).toMatchObject({ line: "A checked point.", fromSummary: true });
  });

  it("cuts a long line at a word", () => {
    const long = "word ".repeat(100);
    const b = buildBriefing(
      { top: [ranked(1, { snippet: long })], alsoImportant: [] },
      "short",
      names,
    );
    expect(b.stories[0].line.length).toBeLessThanOrEqual(241);
    expect(b.stories[0].line.endsWith("word…")).toBe(true);
  });
});

describe("renderEmail", () => {
  const briefing: Briefing = {
    stories: [
      {
        id: 1,
        headline: "Rates <held> & steady",
        kicker: "Economy",
        line: "The bank kept rates.",
        fromSummary: true,
        outlets: 6,
      },
    ],
    everyone: [],
  };
  const links = {
    site: "https://verilo.example",
    unsubscribe: "https://verilo.example/briefing/stop?u=1&t=x",
  };

  it("leads the subject with the top story and escapes what outlets wrote", () => {
    const email = renderEmail(briefing, { label: "Friday 20 November", weekday: "Friday" }, links);
    expect(email.subject).toBe("Your Friday briefing: Rates <held> & steady");
    expect(email.html).toContain("Rates &lt;held&gt; &amp; steady");
    expect(email.html).not.toContain("<held>");
    expect(email.html).toContain('href="https://verilo.example/story/1"');
    expect(email.html).toContain("AI summary, checked against the reports");
    expect(email.html).toContain("https://verilo.example/briefing/stop?u=1&amp;t=x");
    expect(email.html).not.toContain("Everyone should know");
  });

  it("has a plain-text version with every link", () => {
    const { text } = renderEmail(
      briefing,
      { label: "Friday 20 November", weekday: "Friday" },
      links,
    );
    expect(text).toContain("FOR YOU");
    expect(text).toContain("https://verilo.example/story/1");
    expect(text).toContain("Stop these emails: https://verilo.example/briefing/stop?u=1&t=x");
  });
});
