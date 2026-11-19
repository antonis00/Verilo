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
const MAX_CANDIDATES = 500;

export async function candidateCards(): Promise<Card[]> {
  "use cache";
  cacheStories();
  const since = new Date(Date.now() - CANDIDATE_HOURS * 3_600_000).toISOString();
  const { data, error } = await publicClient()
    .from("story_cards")
    .select(
      "id, title, first_published_at, last_published_at, article_count, outlet_count, articles, topic_ids",
    )
    .gte("last_published_at", since)
    .order("last_published_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (error) {
    console.error("front page stories failed", error.message);
    return [];
  }
  return (data ?? []) as Card[];
}

export type Topic = { id: number; slug: string; name: string };

export async function topics(): Promise<Topic[]> {
  "use cache";
  cacheReference();
  const { data, error } = await publicClient()
    .from("topics")
    .select("id, slug, name")
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
      "id, title, first_published_at, last_published_at, article_count, outlet_count, articles, topic_ids",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("story failed", error.message);
  return (data as Card | null) ?? null;
}
