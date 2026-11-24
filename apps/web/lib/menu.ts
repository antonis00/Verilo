// The sections menu (the horizontal bar under the masthead). Pure, so the rules are unit-tested.
//
// A reader's bar is the topics they follow, in the order they put them in (dragged in Preferences;
// stored in reader_preferences.menu_topics), then the featured topics they neither follow nor
// leave out. Visitors get the featured topics.

// The most topics the saved order holds; any followed beyond it come after, in the order chosen.
export const MENU_MAX = 100;

export type MenuTopic = { id: number; slug: string; name: string; featured: boolean };

export function menuTopics<T extends MenuTopic>(
  topics: T[],
  followed: number[] = [],
  muted: number[] = [],
): T[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const chosen = followed.map((id) => byId.get(id)).filter((t): t is T => t !== undefined);
  const skip = new Set([...chosen.map((t) => t.id), ...muted]);
  return [...chosen, ...topics.filter((t) => t.featured && !skip.has(t.id))];
}

// The topics followed, in the reader's saved order: those in `order` first, as placed, then any
// followed since (in the order given).
export function inOrder(followed: number[], order: number[] | null): number[] {
  const set = new Set(followed);
  const placed = (order ?? []).filter((id) => set.has(id));
  const seen = new Set(placed);
  return [...new Set([...placed, ...followed.filter((id) => !seen.has(id))])];
}
