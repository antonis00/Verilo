import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OwnItem, OwnSource } from "@/lib/own-sources";

// Read with the reader's own session: row-level security returns only the sources they added
// and those sources' items.

type SourceRow = {
  id: number;
  kind: OwnSource["kind"];
  url: string;
  title: string | null;
  site_url: string | null;
  status: OwnSource["status"];
  last_error: string | null;
  blocked_reason: string | null;
  sources: { name: string } | null;
};

export async function ownSources(): Promise<{ accepted: boolean; sources: OwnSource[] }> {
  const db = await createClient();
  const [prefs, rows] = await Promise.all([
    db.from("reader_preferences").select("own_sources_accepted_at").maybeSingle(),
    db
      .from("reader_own_sources")
      .select(
        "added_at, own_sources (id, kind, url, title, site_url, status, last_error, blocked_reason, sources (name))",
      )
      .order("added_at", { ascending: true }),
  ]);
  const sources = ((rows.data ?? []) as unknown as { own_sources: SourceRow | null }[])
    .map((r) => r.own_sources)
    .filter((s): s is SourceRow => s !== null)
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      url: s.url,
      title: s.title,
      siteUrl: s.site_url,
      status: s.status,
      lastError: s.last_error,
      blockedReason: s.blocked_reason,
      official: s.sources?.name ?? null,
    }));
  return { accepted: Boolean(prefs.data?.own_sources_accepted_at), sources };
}

export async function ownItems(limit: number): Promise<OwnItem[]> {
  const db = await createClient();
  const { data } = await db
    .from("own_items")
    .select("id, source_id, url, title, snippet, published_at")
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    publishedAt: r.published_at,
  }));
}
