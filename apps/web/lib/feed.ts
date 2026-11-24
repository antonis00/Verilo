// Ranking stories for a front page. Pure functions, no I/O, so every rule is unit-tested.
//
// score = 0.35 importance + 0.25 freshness + 0.25 followed topic + 0.10 followed source
//       + 0.05 places + 0.10 reliability            (docs/design.md, "Scoring (v1 formula)")
//
// Then, for a healthy page: at most MAX_PER_TOPIC stories per topic and MAX_PER_SOURCE leads per
// outlet in the first TOP_WINDOW cards, and a few widely covered stories outside the reader's
// interests in "Also important today", so the feed never becomes a bubble.

import type { Kind, Lean, Tier } from "@/lib/sources";

export type CardArticle = {
  id: number;
  source_id: number;
  source: string;
  tier: Tier;
  lean: Lean;
  country: string;
  region: string;
  kind: Kind;
  title: string;
  snippet: string;
  url: string;
  published_at: string | null;
};

export type Card = {
  id: number;
  title: string;
  first_published_at: string;
  last_published_at: string;
  article_count: number;
  outlet_count: number;
  articles: CardArticle[];
  topic_ids: number[];
  summary: Summary | null;
  follows?: number | null; // the earlier story this one continues
};

// A checked AI summary (Phase 4): points, each citing the articles it was drawn from.
export type Summary = {
  bullets: { text: string; article_ids: number[] }[];
  writer: string;
  checker: string | null;
  created_at: string;
};

export type Preferences = {
  followTopics: number[];
  muteTopics: number[];
  followSources: number[];
  hideSources: number[];
  regions: string[];
  showOpinion: boolean;
  showTier3: boolean;
};

export const NO_PREFERENCES: Preferences = {
  followTopics: [],
  muteTopics: [],
  followSources: [],
  hideSources: [],
  regions: [],
  showOpinion: true,
  showTier3: true,
};

export type Ranked = {
  card: Card;
  headline: string;
  lead: CardArticle;
  visible: CardArticle[];
  outlets: number;
  score: number;
  reasons: string[];
  followedTopic: boolean;
};

export const WEIGHTS = {
  importance: 0.35,
  freshness: 0.25,
  topic: 0.25,
  source: 0.1,
  places: 0.05,
  reliability: 0.1,
};
export const FRESH_HALF_LIFE_HOURS = 12;
export const TOP_WINDOW = 10;
export const MAX_PER_TOPIC = 3;
export const MAX_PER_SOURCE = 2;
export const ALSO_IMPORTANT = 4;
// The share of the follow boost a story gets however small it is; the rest scales with importance.
export const FOLLOW_FLOOR = 0.4;
export const ALSO_IMPORTANT_MIN_OUTLETS = 5;
const TIER_WEIGHT: Record<Tier, number> = { 1: 1, 2: 0.7, 3: 0.3 };

function visibleArticles(card: Card, p: Preferences): CardArticle[] {
  const hidden = new Set(p.hideSources);
  return card.articles.filter(
    (a) =>
      !hidden.has(a.source_id) &&
      (p.showOpinion || a.kind !== "opinion") &&
      (p.showTier3 || a.tier !== 3),
  );
}

// The article a card leads with: one from an outlet the reader follows, else the most trusted
// outlet's news report, else anything visible.
function chooseLead(visible: CardArticle[], followed: Set<number>): CardArticle {
  const news = visible.filter((a) => a.kind === "news");
  const pool = news.length ? news : visible;
  return [...pool].sort(
    (a, b) =>
      Number(followed.has(b.source_id)) - Number(followed.has(a.source_id)) ||
      a.tier - b.tier ||
      (b.snippet ? 1 : 0) - (a.snippet ? 1 : 0),
  )[0];
}

export function score(
  card: Card,
  p: Preferences,
  now: number,
  topicNames: Map<number, string> = new Map(),
): Ranked | null {
  const visible = visibleArticles(card, p);
  if (!visible.length) return null;
  const mainTopics = card.topic_ids.slice(0, 2);
  if (mainTopics.some((t) => p.muteTopics.includes(t))) return null;

  const followedSources = new Set(p.followSources);
  const outlets = new Set(visible.map((a) => a.source_id)).size;
  const tierOne = visible.some((a) => a.tier === 1 && a.kind === "news");
  const importance = Math.min(1, Math.log2(1 + outlets) / Math.log2(21) + (tierOne ? 0.1 : 0));
  const ageHours = Math.max(0, (now - Date.parse(card.last_published_at)) / 3_600_000);
  const freshness = 0.5 ** (ageHours / FRESH_HALF_LIFE_HOURS);
  // Only the story's main topics count, so the reason shown is what the story is about.
  const topicHit = mainTopics.find((t) => p.followTopics.includes(t));
  const sourceHit = visible.find((a) => followedSources.has(a.source_id));
  const regions = new Set(p.regions);
  const bySource = new Map(visible.map((a) => [a.source_id, a]));
  const placesShare = regions.size
    ? [...bySource.values()].filter((a) => regions.has(a.region)).length / bySource.size
    : 0;
  const reliability =
    [...bySource.values()].reduce((sum, a) => sum + TIER_WEIGHT[a.tier], 0) / bySource.size;

  const total =
    WEIGHTS.importance * importance +
    WEIGHTS.freshness * freshness +
    // Following lifts a story in proportion to its importance, so a one-outlet story on a
    // followed topic can't outrank one thirty outlets cover (Nov 2026 review).
    WEIGHTS.topic * (topicHit !== undefined ? FOLLOW_FLOOR + (1 - FOLLOW_FLOOR) * importance : 0) +
    WEIGHTS.source * (sourceHit ? FOLLOW_FLOOR + (1 - FOLLOW_FLOOR) * importance : 0) +
    WEIGHTS.places * placesShare +
    WEIGHTS.reliability * reliability;

  const reasons: string[] = [];
  if (topicHit !== undefined)
    reasons.push(`You follow ${topicNames.get(topicHit) ?? "this topic"}`);
  if (sourceHit) reasons.push(`From ${sourceHit.source}, which you follow`);
  if (outlets >= ALSO_IMPORTANT_MIN_OUTLETS) reasons.push(`Covered by ${outlets} outlets`);

  const lead = chooseLead(visible, followedSources);
  // The story's own headline, unless it came from an outlet this reader has hidden.
  const headline = visible.some((a) => a.title === card.title) ? card.title : lead.title;
  return {
    card,
    headline,
    lead,
    visible,
    outlets,
    score: total,
    reasons,
    followedTopic: topicHit !== undefined || Boolean(sourceHit),
  };
}

export type FrontPage = { top: Ranked[]; alsoImportant: Ranked[] };

export function rank(
  cards: Card[],
  p: Preferences,
  now: number,
  options: { limit?: number; topicNames?: Map<number, string> } = {},
): FrontPage {
  const limit = options.limit ?? 24;
  const personal = p.followTopics.length > 0 || p.followSources.length > 0;
  const scored = cards
    .map((c) => score(c, p, now, options.topicNames))
    .filter((r): r is Ranked => r !== null)
    // A story only one outlet covers needs a reason to be on the page: something you follow.
    .filter((r) => r.outlets >= 2 || r.followedTopic)
    .sort((a, b) => b.score - a.score || b.outlets - a.outlets);

  const top: Ranked[] = [];
  const perTopic = new Map<number, number>();
  const perSource = new Map<number, number>();
  const deferred: Ranked[] = [];
  for (const r of scored) {
    if (top.length < TOP_WINDOW) {
      const topic = r.card.topic_ids[0];
      const tooManyTopic = topic !== undefined && (perTopic.get(topic) ?? 0) >= MAX_PER_TOPIC;
      const tooManySource = (perSource.get(r.lead.source_id) ?? 0) >= MAX_PER_SOURCE;
      // The top of the page is for stories more than one outlet reports.
      const tooSmall = r.outlets < 2;
      if (tooManyTopic || tooManySource || tooSmall) {
        deferred.push(r);
        continue;
      }
      if (topic !== undefined) perTopic.set(topic, (perTopic.get(topic) ?? 0) + 1);
      perSource.set(r.lead.source_id, (perSource.get(r.lead.source_id) ?? 0) + 1);
    }
    top.push(r);
    if (top.length === TOP_WINDOW) top.push(...deferred.splice(0));
    if (top.length >= limit) break;
  }
  if (top.length < limit) top.push(...deferred.slice(0, limit - top.length));
  const shown = top.slice(0, limit);

  // Widely covered stories outside the reader's interests that didn't make the top of their page
  // (they compete in the main list first): so the page never becomes a bubble.
  const inTop = new Set(shown.slice(0, TOP_WINDOW).map((r) => r.card.id));
  const alsoImportant = personal
    ? scored
        .filter(
          (r) =>
            !r.followedTopic && !inTop.has(r.card.id) && r.outlets >= ALSO_IMPORTANT_MIN_OUTLETS,
        )
        .sort((a, b) => b.outlets - a.outlets || b.score - a.score)
        .slice(0, ALSO_IMPORTANT)
    : [];
  const also = new Set(alsoImportant.map((r) => r.card.id));
  return { top: shown.filter((r) => !also.has(r.card.id)), alsoImportant };
}

// One topic's page: its stories only, best first. Unlike the front page, a story one outlet covers
// is kept (the reader asked for this topic), and there are no per-topic caps or "also important".
// Hidden outlets, muted-topic and opinion / tier 3 choices still apply.
export const TOPIC_PAGE_LIMIT = 30;

export function rankTopic(
  cards: Card[],
  topicId: number,
  p: Preferences,
  now: number,
  topicNames: Map<number, string> = new Map(),
): FrontPage {
  // Muting is for the front page; on the topic's own page the reader chose to look.
  const prefs = { ...p, muteTopics: p.muteTopics.filter((t) => t !== topicId) };
  const top = cards
    .filter((c) => c.topic_ids.includes(topicId))
    .map((c) => score(c, prefs, now, topicNames))
    .filter((r): r is Ranked => r !== null)
    .sort((a, b) => b.score - a.score || b.outlets - a.outlets)
    .slice(0, TOPIC_PAGE_LIMIT);
  return { top, alsoImportant: [] };
}
