"use server";

import { clientIp } from "@/lib/client-ip";
import { searchStories } from "@/lib/news";
import { allow } from "@/lib/rate-limit";

export type QuickResult = {
  id: number;
  title: string;
  outletCount: number;
  lastPublishedAt: string;
};

const QUICK_RESULTS = 6;

// The masthead's search box, as the reader types: the best few stories. The full list stays at
// /search. Limited per visitor, since each keystroke pause asks once.
export async function quickSearch(raw: unknown): Promise<QuickResult[] | null> {
  const query = String(raw ?? "")
    .trim()
    .slice(0, 200);
  if (query.length < 2) return [];
  if (!allow(`quick-search:${await clientIp()}`, 120, 60_000)) return null;
  const results = await searchStories(query);
  return results.slice(0, QUICK_RESULTS).map((r) => ({
    id: r.id,
    title: r.title,
    outletCount: r.outlet_count,
    lastPublishedAt: r.last_published_at,
  }));
}
