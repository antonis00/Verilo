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
      "id, title, first_published_at, last_published_at, article_count, outlet_count, articles, topic_ids, summary",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("story failed", error.message);
  return (data as Card | null) ?? null;
}
