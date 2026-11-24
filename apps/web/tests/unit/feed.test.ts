import { describe, expect, it } from "vitest";
import {
  placesScore,
  ALSO_IMPORTANT_MIN_OUTLETS,
  MAX_PER_SOURCE,
  MAX_PER_TOPIC,
  NO_PREFERENCES,
  rank,
  rankTopic,
  score,
  TOP_WINDOW,
  type Card,
  type CardArticle,
  type Preferences,
} from "@/lib/feed";
import type { Kind, Lean, Tier } from "@/lib/sources";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let nextId = 1;
function article(
  source_id: number,
  opts: { tier?: Tier; kind?: Kind; lean?: Lean; region?: string; title?: string } = {},
): CardArticle {
  const id = nextId++;
  return {
    id,
    source_id,
    source: `Outlet ${source_id}`,
    tier: opts.tier ?? 2,
    lean: opts.lean ?? "center",
    country: "GB",
    region: opts.region ?? "uk-ireland",
    kind: opts.kind ?? "news",
    title: opts.title ?? `Headline ${id}`,
    snippet: "",
    url: `https://example.com/${id}`,
    published_at: hoursAgo(1),
  };
}

function card(
  id: number,
  articles: CardArticle[],
  opts: { topics?: number[]; age?: number; title?: string } = {},
): Card {
  return {
    id,
    title: opts.title ?? articles[0].title,
    first_published_at: hoursAgo((opts.age ?? 1) + 1),
    last_published_at: hoursAgo(opts.age ?? 1),
    article_count: articles.length,
    outlet_count: new Set(articles.map((a) => a.source_id)).size,
    articles,
    topic_ids: opts.topics ?? [],
    summary: null,
  };
}

const outlets = (n: number, offset = 100) =>
  Array.from({ length: n }, (_, i) => article(offset + i));
const prefs = (p: Partial<Preferences>): Preferences => ({ ...NO_PREFERENCES, ...p });
const ids = (list: { card: Card }[]) => list.map((r) => r.card.id);

describe("score", () => {
  it("ranks wider coverage above narrower, all else equal", () => {
    const wide = score(card(1, outlets(10)), NO_PREFERENCES, NOW)!;
    const narrow = score(card(2, outlets(2)), NO_PREFERENCES, NOW)!;
    expect(wide.score).toBeGreaterThan(narrow.score);
  });

  it("ranks fresher above older, all else equal", () => {
    const fresh = score(card(1, outlets(4), { age: 1 }), NO_PREFERENCES, NOW)!;
    const old = score(card(2, outlets(4), { age: 30 }), NO_PREFERENCES, NOW)!;
    expect(fresh.score).toBeGreaterThan(old.score);
  });

  it("drops a story whose main topic the reader muted", () => {
    expect(score(card(1, outlets(5), { topics: [7] }), prefs({ muteTopics: [7] }), NOW)).toBeNull();
  });

  it("removes hidden outlets, and drops a story only they cover", () => {
    const c = card(1, [article(1), article(2)]);
    const r = score(c, prefs({ hideSources: [1] }), NOW)!;
    expect(r.visible.map((a) => a.source_id)).toEqual([2]);
    expect(score(card(2, [article(1)]), prefs({ hideSources: [1] }), NOW)).toBeNull();
  });

  it("leaves out opinion pieces and tier 3 outlets when the reader asks", () => {
    const c = card(1, [article(1), article(2, { kind: "opinion" }), article(3, { tier: 3 })]);
    const r = score(c, prefs({ showOpinion: false, showTier3: false }), NOW)!;
    expect(r.visible.map((a) => a.source_id)).toEqual([1]);
  });

  it("uses another headline when the story's comes from a hidden outlet", () => {
    const c = card(
      1,
      [article(1, { title: "Hidden take" }), article(2, { title: "Plain report" })],
      {
        title: "Hidden take",
      },
    );
    expect(score(c, prefs({ hideSources: [1] }), NOW)!.headline).toBe("Plain report");
  });

  it("leads with an outlet the reader follows, then the most trusted", () => {
    const c = card(1, [article(1, { tier: 2 }), article(2, { tier: 1 }), article(3, { tier: 2 })]);
    expect(score(c, NO_PREFERENCES, NOW)!.lead.source_id).toBe(2);
    expect(score(c, prefs({ followSources: [3] }), NOW)!.lead.source_id).toBe(3);
  });

  it("says why a story is there", () => {
    const c = card(1, outlets(6), { topics: [4] });
    const r = score(c, prefs({ followTopics: [4] }), NOW, new Map([[4, "Geopolitics"]]))!;
    expect(r.reasons).toEqual(["You follow Geopolitics", "Covered by 6 outlets"]);
  });
});

describe("rank", () => {
  it("lifts a followed topic's story above a bigger story the reader doesn't follow", () => {
    const big = card(1, outlets(8, 100), { topics: [1] });
    const niche = card(2, [article(200), article(201)], { topics: [9] });
    const page = rank([big, niche], prefs({ followTopics: [9] }), NOW);
    expect(ids(page.top)[0]).toBe(2);
  });

  it("keeps single-outlet stories only when they match something followed", () => {
    const single = card(1, [article(1)], { topics: [5] });
    expect(rank([single], NO_PREFERENCES, NOW).top).toEqual([]);
    expect(ids(rank([single], prefs({ followTopics: [5] }), NOW).top)).toEqual([1]);
  });

  it(`allows at most ${MAX_PER_TOPIC} stories per topic in the first ${TOP_WINDOW}`, () => {
    const sameTopic = Array.from({ length: 6 }, (_, i) =>
      card(i + 1, outlets(10, 100 + i * 20), { topics: [1] }),
    );
    const others = Array.from({ length: 8 }, (_, i) =>
      card(i + 20, outlets(3, 500 + i * 10), { topics: [i + 2] }),
    );
    // Enough other stories to fill the window; with too few, deferred ones fill the gap rather
    // than leave the page short.
    const page = rank([...sameTopic, ...others], NO_PREFERENCES, NOW);
    const firstTen = page.top.slice(0, TOP_WINDOW);
    expect(firstTen.filter((r) => r.card.topic_ids[0] === 1)).toHaveLength(MAX_PER_TOPIC);
    // The rest aren't lost, just placed lower.
    expect(page.top.filter((r) => r.card.topic_ids[0] === 1)).toHaveLength(6);
  });

  it(`allows at most ${MAX_PER_SOURCE} leads from one outlet in the first ${TOP_WINDOW}`, () => {
    const fromOne = Array.from({ length: 4 }, (_, i) =>
      card(i + 1, [article(1, { tier: 1 }), article(300 + i)], { topics: [i + 1] }),
    );
    const page = rank(fromOne, NO_PREFERENCES, NOW);
    expect(page.top.slice(0, 2).every((r) => r.lead.source_id === 1)).toBe(true);
    expect(page.top[2].lead.source_id).toBe(1); // deferred, still shown after the window
  });

  it("lets a widely covered story outside the reader's interests compete in the main list", () => {
    const followed = Array.from({ length: 5 }, (_, i) =>
      card(i + 1, outlets(3, 100 + i * 10), { topics: [1] }),
    );
    const world = card(50, outlets(30, 700), { topics: [2] });
    const page = rank([...followed, world], prefs({ followTopics: [1] }), NOW);
    expect(ids(page.top)[0]).toBe(50);
    expect(page.alsoImportant).toEqual([]);
  });

  it("keeps widely covered stories that miss the top in 'also important today'", () => {
    // Ten followed stories as wide as it gets fill the top; a wide outside story waits below.
    const followed = Array.from({ length: 10 }, (_, i) =>
      card(i + 1, outlets(25, 100 + i * 40), { topics: [10 + i] }),
    );
    const world = card(50, outlets(ALSO_IMPORTANT_MIN_OUTLETS + 1, 900), { topics: [2] });
    const followTopics = followed.map((c) => c.topic_ids[0]);
    const page = rank([...followed, world], prefs({ followTopics }), NOW);
    expect(ids(page.alsoImportant)).toEqual([50]);
    expect(ids(page.top)).not.toContain(50);
  });

  it("never lets a one-outlet story on a followed topic outrank one thirty outlets cover", () => {
    const small = card(1, outlets(1, 100), { topics: [1] });
    const big = card(2, outlets(30, 300), { topics: [2] });
    expect(ids(rank([small, big], prefs({ followTopics: [1] }), NOW).top)).toEqual([2, 1]);
  });

  it("keeps single-outlet stories out of the top ten while wider ones are waiting", () => {
    const singles = Array.from({ length: 12 }, (_, i) =>
      card(i + 1, outlets(1, 100 + i), { topics: [1] }),
    );
    const shared = Array.from({ length: 10 }, (_, i) =>
      card(100 + i, outlets(2, 500 + i * 5), { topics: [20 + i], age: 30 }),
    );
    const top = rank([...singles, ...shared], prefs({ followTopics: [1] }), NOW).top;
    expect(top.slice(0, 10).every((r) => r.outlets >= 2)).toBe(true);
  });

  it("names only a main topic as the reason", () => {
    const story = card(1, outlets(3, 100), { topics: [2, 5, 1] });
    const [r] = rank([story], prefs({ followTopics: [1] }), NOW).top;
    expect(r.reasons.some((x) => x.startsWith("You follow"))).toBe(false);
  });

  it("has no 'also important' section without personal interests", () => {
    const world = card(50, outlets(10, 700));
    expect(rank([world], NO_PREFERENCES, NOW).alsoImportant).toEqual([]);
  });

  it("stops at the limit: the page ends", () => {
    const many = Array.from({ length: 40 }, (_, i) => card(i + 1, outlets(3, 1000 + i * 5)));
    expect(rank(many, NO_PREFERENCES, NOW, { limit: 24 }).top).toHaveLength(24);
  });
});

describe("rankTopic", () => {
  it("lists only the topic's stories, single-outlet ones included, best first", () => {
    const big = card(1, outlets(8, 100), { topics: [3] });
    const single = card(2, [article(200)], { topics: [3, 4] });
    const other = card(3, outlets(10, 300), { topics: [5] });
    const page = rankTopic([big, single, other], 3, NO_PREFERENCES, NOW);
    expect(ids(page.top)).toEqual([1, 2]);
    expect(page.alsoImportant).toEqual([]);
  });

  it("still applies hidden outlets and the show choices", () => {
    const c = card(1, [article(1), article(2, { kind: "opinion" })], { topics: [3] });
    const onlyHidden = card(2, [article(9)], { topics: [3] });
    const page = rankTopic(
      [c, onlyHidden],
      3,
      prefs({ hideSources: [9], showOpinion: false }),
      NOW,
    );
    expect(ids(page.top)).toEqual([1]);
    expect(page.top[0].visible.map((a) => a.source_id)).toEqual([1]);
  });

  it("shows a muted topic on its own page, since the reader opened it", () => {
    const c = card(1, outlets(3), { topics: [3] });
    expect(ids(rankTopic([c], 3, prefs({ muteTopics: [3] }), NOW).top)).toEqual([1]);
  });
});

describe("places", () => {
  it("lifts a story covered by outlets from the reader's regions", () => {
    const local = card(1, [article(1, { region: "europe" }), article(2, { region: "europe" })]);
    const elsewhere = card(2, [article(3), article(4)]);
    const asked = prefs({ regions: ["europe"] });
    expect(score(local, asked, NOW)!.score).toBeGreaterThan(score(elsewhere, asked, NOW)!.score);
    expect(score(local, NO_PREFERENCES, NOW)!.score).toBeCloseTo(
      score(elsewhere, NO_PREFERENCES, NOW)!.score,
    );
  });
});

describe("placesScore", () => {
  const a = (region: string) => ({ ...article(1), region }) as CardArticle;
  it("uses where a placed story happens, global counting half", () => {
    const regions = new Set(["middle-east"]);
    const story = (places: string[] | null) => ({ ...card(1, [article(1)]), places }) as Card;
    expect(placesScore(story(["middle-east", "europe"]), [a("uk-ireland")], regions)).toBe(1);
    expect(placesScore(story(["europe"]), [a("middle-east")], regions)).toBe(0);
    expect(placesScore(story(["global"]), [], regions)).toBe(0.5);
  });

  it("falls back to where the outlets are based for a story not yet placed", () => {
    const regions = new Set(["europe"]);
    const story = { ...card(1, [article(1)]), places: null } as Card;
    expect(placesScore(story, [a("europe"), a("uk-ireland")], regions)).toBe(0.5);
    expect(placesScore(story, [a("europe")], new Set())).toBe(0);
  });
});
