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

export async function seedOutlet(slug: string, headline: string) {
  const [source] = await rest("sources", {
    method: "POST",
    body: JSON.stringify({
      slug,
      name: `Test Outlet ${slug}`,
      homepage: "https://test-outlet.example",
      country: "GB",
      kind: "newspaper",
      tier: 2,
      lean: "lean_right",
      rating_basis: "Created by an end-to-end test.",
    }),
  });
  await rest("articles", {
    method: "POST",
    body: JSON.stringify({
      source_id: source.id,
      url: `https://test-outlet.example/${slug}`,
      title: headline,
      snippet: "A short test snippet.",
      published_at: new Date().toISOString(),
      content_hash: Array.from({ length: 64 }, () => "a").join(""),
    }),
  });
}

export async function removeOutlet(slug: string) {
  await rest(`sources?slug=eq.${slug}`, { method: "DELETE", prefer: "return=minimal" });
}
