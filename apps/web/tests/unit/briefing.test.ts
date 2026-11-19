import { describe, expect, it } from "vitest";
import {
  buildBriefing,
  DEFAULT_BRIEFING,
  isDue,
  isTimeZone,
  localTime,
  renderEmail,
  settingsFrom,
  type Briefing,
} from "@/lib/briefing";
import type { Card, CardArticle, Ranked } from "@/lib/feed";

const at = (iso: string) => Date.parse(iso);

describe("when a briefing is due", () => {
  it("reads the reader's own date and hour", () => {
    // 04:30 UTC is 07:30 in Qatar and still the day before in New York.
    expect(localTime(at("2026-11-20T04:30:00Z"), "Asia/Qatar")).toEqual({
      date: "2026-11-20",
      hour: 7,
    });
    expect(localTime(at("2026-11-20T04:30:00Z"), "America/New_York")).toEqual({
      date: "2026-11-19",
      hour: 23,
    });
  });

  it("is due from the chosen hour for three hours, never in the afternoon", () => {
    const qatar = { ...DEFAULT_BRIEFING, timeZone: "Asia/Qatar" };
    expect(isDue(qatar, at("2026-11-20T03:59:00Z")).due).toBe(false); // 06:59
    expect(isDue(qatar, at("2026-11-20T04:00:00Z"))).toEqual({ due: true, date: "2026-11-20" });
    expect(isDue(qatar, at("2026-11-20T06:59:00Z")).due).toBe(true); // 09:59
    expect(isDue(qatar, at("2026-11-20T07:00:00Z")).due).toBe(false); // 10:00
    // A reader who finished the wizard at 4 pm gets nothing until the next morning.
    expect(isDue(qatar, at("2026-11-20T13:00:00Z")).due).toBe(false);
    expect(isDue({ ...qatar, enabled: false }, at("2026-11-20T04:30:00Z")).due).toBe(false);
  });

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
    const email = renderEmail(briefing, "Friday 20 November", links);
    expect(email.subject).toBe("Your briefing: Rates <held> & steady");
    expect(email.html).toContain("Rates &lt;held&gt; &amp; steady");
    expect(email.html).not.toContain("<held>");
    expect(email.html).toContain('href="https://verilo.example/story/1"');
    expect(email.html).toContain("AI summary, checked against the reports");
    expect(email.html).toContain("https://verilo.example/briefing/stop?u=1&amp;t=x");
    expect(email.html).not.toContain("Everyone should know");
  });

  it("has a plain-text version with every link", () => {
    const { text } = renderEmail(briefing, "Friday 20 November", links);
    expect(text).toContain("FOR YOU");
    expect(text).toContain("https://verilo.example/story/1");
    expect(text).toContain("Stop these emails: https://verilo.example/briefing/stop?u=1&t=x");
  });
});
