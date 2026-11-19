// Finding topics as a reader types: by name or alias ("soccer" finds Football, "f1" Formula 1),
// ignoring case and accents. Pure, so it's unit-tested.

export type SearchableTopic = { id: number; name: string; aliases: string[]; featured: boolean };

export const MAX_RESULTS = 24;

export function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

// Best matches first: a name that starts with the query ("foot" → Football), then a name with a
// word that does (American football), then a name containing it, then the same three for
// aliases; alphabetical within each.
export function searchTopics<T extends SearchableTopic>(topics: T[], query: string): T[] {
  const q = normalise(query);
  if (!q) return [];
  const words = (s: string) => s.split(" ");
  const tier = (text: string): number => {
    if (text.startsWith(q)) return 0;
    if (words(text).some((w) => w.startsWith(q))) return 1;
    if (text.includes(q)) return 2;
    return -1;
  };
  const rank = (t: T): number => {
    const byName = tier(normalise(t.name));
    if (byName >= 0) return byName;
    const byAlias = t.aliases
      .map((a) => tier(normalise(a)))
      .filter((r) => r >= 0)
      .sort()[0];
    return byAlias === undefined ? -1 : 3 + byAlias;
  };
  return topics
    .map((t) => ({ t, r: rank(t) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.t.name.localeCompare(b.t.name))
    .slice(0, MAX_RESULTS)
    .map((x) => x.t);
}

// What the chips show with an empty search box: the featured topics, plus any others the
// reader has already chosen, so a choice never disappears from view.
export function visibleTopics<T extends SearchableTopic>(topics: T[], chosen: number[]): T[] {
  return topics.filter((t) => t.featured || chosen.includes(t.id));
}
