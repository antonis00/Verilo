import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Card } from "@/lib/feed";
import type { Lean, Tier } from "@/lib/sources";
import { publicClient } from "@/lib/supabase/public";

// Shared reads, cached for every visitor and tagged, so the pipeline can tell the app when stories
// changed (POST /api/revalidate) and new ones appear at once. Without that ping, stories refresh
// within about a minute; topics and outlets change rarely and refresh within the hour.
export const STORIES_TAG = "stories";
export const REFERENCE_TAG = "reference";

// Called inside a "use cache" scope.
export function cacheStories() {
  cacheLife("minutes");
  cacheTag(STORIES_TAG);
}

function cacheReference() {
  cacheLife("hours");
  cacheTag(REFERENCE_TAG);
}

export const CANDIDATE_HOURS = 48;
// Candidates for ranking, chosen by importance rather than recency: every story two or more
// outlets covered in the last CANDIDATE_HOURS, widest first (Nov 2026 review: the 500 most
// recently updated covered only 4.4 hours and left out 24 of the day's 54 widest stories), plus
// the newest single-outlet stories, which reach a page only through a followed topic or outlet.
const SHARED_CANDIDATES = 400;
const SINGLE_CANDIDATES = 150;
const SINGLE_HOURS = 12;
const CARD_COLUMNS =
  "id, title, first_published_at, last_published_at, article_count, outlet_count, articles, topic_ids, summary, follows";

export async function candidateCards(): Promise<Card[]> {
  "use cache";
  cacheStories();
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const db = publicClient();
  const [shared, single] = await Promise.all([
    db
      .from("story_cards")
      .select(CARD_COLUMNS)
      .gte("last_published_at", hoursAgo(CANDIDATE_HOURS))
      .gte("outlet_count", 2)
      .order("outlet_count", { ascending: false })
      .order("last_published_at", { ascending: false })
      .limit(SHARED_CANDIDATES),
    db
      .from("story_cards")
      .select(CARD_COLUMNS)
      .gte("last_published_at", hoursAgo(SINGLE_HOURS))
      .eq("outlet_count", 1)
      .order("last_published_at", { ascending: false })
      .limit(SINGLE_CANDIDATES),
  ]);
  if (shared.error || single.error) {
    console.error("front page stories failed", (shared.error ?? single.error)?.message);
  }
  return [...(shared.data ?? []), ...(single.data ?? [])] as Card[];
}

export type Topic = {
  id: number;
  slug: string;
  name: string;
  featured: boolean;
  aliases: string[];
  parent_id: number | null;
};

export async function topics(): Promise<Topic[]> {
  "use cache";
  cacheReference();
  const { data, error } = await publicClient()
    .from("topics")
    .select("id, slug, name, featured, aliases, parent_id")
    .eq("active", true)
    .order("position");
  if (error) console.error("topics failed", error.message);
  return data ?? [];
}

export type Outlet = {
  id: number;
  name: string;
  country: string;
  region: string;
  tier: Tier;
  lean: Lean;
  kind: string;
};

export async function outlets(): Promise<Outlet[]> {
  "use cache";
  cacheReference();
  const { data, error } = await publicClient()
    .from("sources")
    .select("id, name, country, region, tier, lean, kind")
    .eq("status", "active")
    .order("name");
  if (error) console.error("outlets failed", error.message);
  return data ?? [];
}

export async function topicNames(): Promise<Map<number, string>> {
  return new Map((await topics()).map((t) => [t.id, t.name]));
}

export async function storyCard(id: number): Promise<Card | null> {
  "use cache";
  cacheStories();
  const { data, error } = await publicClient()
    .from("story_cards")
    .select(
      "id, title, first_published_at, last_published_at, article_count, outlet_count, articles, topic_ids, summary, follows",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("story failed", error.message);
  return (data as Card | null) ?? null;
}

export type Correction = {
  id: number;
  story_id: number;
  note: string;
  created_at: string;
  story_title?: string;
};

// Corrections on one story, newest first (a withdrawn summary, and why).
export async function storyCorrections(storyId: number): Promise<Correction[]> {
  "use cache";
  cacheStories();
  const { data, error } = await publicClient()
    .from("corrections")
    .select("id, story_id, note, created_at")
    .eq("story_id", storyId)
    .order("created_at", { ascending: false });
  if (error) console.error("corrections failed", error.message);
  return (data ?? []) as Correction[];
}

// Every correction, newest first, for the public corrections page.
export async function allCorrections(): Promise<Correction[]> {
  "use cache";
  cacheStories();
  const { data, error } = await publicClient()
    .from("corrections")
    .select("id, story_id, note, created_at, stories (title)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("corrections failed", error.message);
  return ((data ?? []) as unknown as (Correction & { stories: { title: string } | null })[]).map(
    (c) => ({ ...c, story_title: c.stories?.title }),
  );
}

// The stories a story continues and is continued by (its earlier and later coverage).
export async function relatedStories(
  storyId: number,
  follows: number | null | undefined,
): Promise<{
  earlier: { id: number; title: string } | null;
  later: { id: number; title: string }[];
}> {
  "use cache";
  cacheStories();
  const db = publicClient();
  const [earlier, later] = await Promise.all([
    follows
      ? db.from("story_cards").select("id, title").eq("id", follows).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("story_cards").select("id, title").eq("follows", storyId).order("first_published_at"),
  ]);
  return {
    earlier: (earlier.data as { id: number; title: string } | null) ?? null,
    later: ((later as { data: { id: number; title: string }[] | null }).data ?? []).slice(0, 5),
  };
}

// The story a merged story became part of (following a chain of merges), or null.
export async function mergedInto(storyId: number): Promise<number | null> {
  "use cache";
  cacheStories();
  let id = storyId;
  for (let hop = 0; hop < 5; hop++) {
    const { data } = await publicClient()
      .from("stories")
      .select("merged_into")
      .eq("id", id)
      .maybeSingle();
    if (!data?.merged_into) return id === storyId ? null : id;
    id = data.merged_into as number;
  }
  return id;
}

export type SearchResult = {
  id: number;
  title: string;
  last_published_at: string;
  outlet_count: number;
  line: string | null;
};

// Stories matching a reader's words (search_stories: full-text over headlines and excerpts).
export async function searchStories(query: string): Promise<SearchResult[]> {
  "use cache";
  cacheStories();
  const db = publicClient();
  const { data: hits, error } = await db.rpc("search_stories", { p_query: query, p_limit: 30 });
  if (error) {
    console.error("search failed", error.message);
    return [];
  }
  const ids = ((hits ?? []) as { story_id: number }[]).map((h) => h.story_id);
  if (!ids.length) return [];
  const { data } = await db
    .from("story_cards")
    .select("id, title, last_published_at, outlet_count, summary, articles")
    .in("id", ids);
  const byId = new Map(((data ?? []) as Card[]).map((c) => [c.id, c]));
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => ({
      id: c.id,
      title: c.title,
      last_published_at: c.last_published_at,
      outlet_count: c.outlet_count,
      line:
        c.summary?.bullets[0]?.text ??
        c.articles.find((a) => a.kind === "news" && a.snippet)?.snippet ??
        null,
    }));
}
