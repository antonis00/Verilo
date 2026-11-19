import { TEST_REVALIDATE_SECRET } from "./constants";
// Test setup through the local Supabase's REST API with the secret key (bypasses row-level
// security). Only for arranging data in tests; the app itself never uses this key.
const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

function key(): string {
  const k = process.env.SUPABASE_SECRET_KEY;
  if (!k) throw new Error("SUPABASE_SECRET_KEY not found: is the local Supabase running?");
  return k;
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      Prefer: init.prefer ?? "return=representation",
    },
  });
  if (!res.ok)
    throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function makeEditor(email: string) {
  const users = await fetch(`${API}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: key(), Authorization: `Bearer ${key()}` },
  }).then((r) => r.json() as Promise<{ users: { id: string; email: string }[] }>);
  const user = users.users.find((u) => u.email === email);
  if (!user) throw new Error(`no account for ${email}`);
  await rest(`profiles?id=eq.${user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_editor: true }),
  });
}

const hash = (c: string) => Array.from({ length: 64 }, () => c).join("");

// The region each test country counts for (the full list is in lib/regions.ts and the registry).
const TEST_REGION: Record<string, string> = { GB: "uk-ireland", IE: "uk-ireland", DE: "europe" };

async function seedSource(slug: string, tier: number, lean: string, country = "GB") {
  const [source] = await rest("sources", {
    method: "POST",
    body: JSON.stringify({
      slug,
      name: `Test Outlet ${slug}`,
      homepage: "https://test-outlet.example",
      country,
      region: TEST_REGION[country],
      kind: "newspaper",
      tier,
      lean,
      rating_basis: "Created by an end-to-end test.",
    }),
  });
  return source as { id: number };
}

// Two outlets reporting one story: a tier 1 news report and a tier 2 opinion piece. The story's
// outlet count is set high so it leads the desk's list, ahead of the real stories.
export async function seedStory(
  slug: string,
  headline: string,
  options: { country?: string; topicId?: number } = {},
) {
  const wire = await seedSource(`${slug}-a`, 1, "center", options.country);
  const paper = await seedSource(`${slug}-b`, 2, "lean_right", options.country);
  const now = new Date().toISOString();
  const [story] = await rest("stories", {
    method: "POST",
    body: JSON.stringify({
      title: headline,
      first_published_at: now,
      last_published_at: now,
      centroid: `[${Array.from({ length: 384 }, () => 0).join(",")}]`,
      article_count: 2,
      outlet_count: 999,
    }),
  });
  const articles = await rest("articles", {
    method: "POST",
    body: JSON.stringify([
      {
        source_id: wire.id,
        story_id: story.id,
        url: `https://test-outlet.example/${slug}/report`,
        title: headline,
        published_at: now,
        content_hash: hash("a"),
        kind: "news",
        kind_reason: null, // a bulk insert needs the same fields in every row
      },
      {
        source_id: paper.id,
        story_id: story.id,
        url: `https://test-outlet.example/${slug}/view`,
        title: `Our view on ${headline}`,
        published_at: now,
        content_hash: hash("b"),
        kind: "opinion",
        kind_reason: "link path /opinion/",
      },
    ]),
  });
  if (options.topicId) {
    // Both articles: a story's topic needs at least two of its articles behind it.
    await rest("article_topics", {
      method: "POST",
      body: JSON.stringify(
        articles.map((a: { id: number }) => ({
          article_id: a.id,
          topic_id: options.topicId,
          score: 1,
          method: "section",
        })),
      ),
    });
  }
  return {
    storyId: story.id as number,
    outletIds: [wire.id, paper.id],
    articleIds: articles.map((a: { id: number }) => a.id) as number[],
  };
}

// A summary as the workers store it: published after every check passed, or failed with why.
export async function seedSummary(
  storyId: number,
  bullets: { text: string; article_ids: number[] }[],
  failure?: string,
) {
  await rest("story_summaries", {
    method: "POST",
    body: JSON.stringify({
      story_id: storyId,
      status: failure ? "failed" : "published",
      bullets,
      article_ids: [...new Set(bullets.flatMap((b) => b.article_ids))],
      failure: failure ?? null,
      writer: "groq:openai/gpt-oss-120b",
      checker: "groq:qwen/qwen3.8-27b",
    }),
  });
}

export async function seedTopic(
  slug: string,
  name: string,
  options: { featured?: boolean; aliases?: string[] } = {},
) {
  const [topic] = await rest("topics", {
    method: "POST",
    body: JSON.stringify({
      slug,
      name,
      description: "A topic created by an end-to-end test.",
      position: 999,
      featured: options.featured ?? false,
      aliases: options.aliases ?? [],
    }),
  });
  return topic.id as number;
}

export async function removeTopic(slug: string) {
  await rest(`topics?slug=eq.${slug}`, { method: "DELETE", prefer: "return=minimal" });
}

// Removes whatever seedStory created, even if seeding stopped half-way.
export async function removeStory(slug: string, headline: string) {
  await rest(`sources?slug=in.(${slug}-a,${slug}-b)`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  await rest(`stories?title=eq.${encodeURIComponent(headline)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

// Tells the test server its cached stories, topics and outlets changed, as the pipeline does.
export async function refreshCaches(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/revalidate", {
    headers: { Authorization: `Bearer ${TEST_REVALIDATE_SECRET}` },
    data: { tags: ["stories", "reference"] },
  });
  if (!res.ok()) throw new Error(`refreshing caches failed: ${res.status()}`);
}

// A reader's id from their email (the auth admin API, filtered by email).
export async function userIdFor(email: string): Promise<string> {
  const res = await fetch(
    `${API}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=5`,
    { headers: { apikey: key(), Authorization: `Bearer ${key()}` } },
  );
  const { users } = (await res.json()) as { users: { id: string; email: string }[] };
  const user = users.find((u) => u.email === email);
  if (!user) throw new Error(`no account for ${email}`);
  return user.id;
}

// Moves a reader's trial end (and subscription), as the payment system will later.
export async function setTrial(
  userId: string,
  fields: { trial_ends_at?: string; subscribed_until?: string | null },
) {
  await rest(`profiles?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify(fields) });
}
