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

async function seedSource(slug: string, tier: number, lean: string) {
  const [source] = await rest("sources", {
    method: "POST",
    body: JSON.stringify({
      slug,
      name: `Test Outlet ${slug}`,
      homepage: "https://test-outlet.example",
      country: "GB",
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
export async function seedStory(slug: string, headline: string) {
  const wire = await seedSource(`${slug}-a`, 1, "center");
  const paper = await seedSource(`${slug}-b`, 2, "lean_right");
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
  await rest("articles", {
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
  return story.id as number;
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
