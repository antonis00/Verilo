// The sections menu (the horizontal bar under the masthead). Pure, so the rules are unit-tested.
//
// A reader may choose its sections and their order in My News (reader_preferences.menu_topics).
// Until they do, it's the topics they follow first, in the order they chose them, then the
// featured topics. Visitors get the featured topics.

export const MENU_MAX = 20;

export type MenuTopic = { id: number; slug: string; name: string; featured: boolean };

export function menuTopics<T extends MenuTopic>(
  topics: T[],
  followed: number[] = [],
  custom: number[] | null = null,
): T[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  if (custom) {
    return custom.map((id) => byId.get(id)).filter((t): t is T => t !== undefined);
  }
  const chosen = followed.map((id) => byId.get(id)).filter((t): t is T => t !== undefined);
  const seen = new Set(chosen.map((t) => t.id));
  return [...chosen, ...topics.filter((t) => t.featured && !seen.has(t.id))].slice(0, MENU_MAX);
}

// What a saved menu may hold: known topics, each once, at most MENU_MAX.
export function checkMenu(raw: unknown, known: Set<number>): number[] | null {
  if (!Array.isArray(raw) || raw.length > MENU_MAX) return null;
  if (!raw.every((x) => Number.isInteger(x) && x > 0)) return null;
  return [...new Set(raw as number[])].filter((id) => known.has(id));
}
