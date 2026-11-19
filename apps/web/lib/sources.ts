// Labels for the source registry's values, shared by every page that shows an outlet.

export type Lean = "left" | "lean_left" | "center" | "lean_right" | "right";
export type Tier = 1 | 2 | 3;

export const LEAN_LABEL: Record<Lean, string> = {
  left: "Left",
  lean_left: "Lean left",
  center: "Centre",
  lean_right: "Lean right",
  right: "Right",
};

export const TIER_LABEL: Record<Tier, string> = {
  1: "Fact base",
  2: "Reputable",
  3: "Labelled",
};

export const COUNTRY_LABEL: Record<string, string> = {
  US: "US",
  GB: "UK",
  CA: "Canada",
  AU: "Australia",
  IE: "Ireland",
  IN: "India",
  INT: "International",
};

// "5 min ago", "3 h ago", "2 days ago"; exact time in the title attribute.
export function ago(iso: string | null, now: number): string {
  if (!iso) return "no date";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export type FeedHealth = "ok" | "failing" | "waiting" | "off";

export function feedHealth(feed: {
  active: boolean;
  last_success_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
}): FeedHealth {
  if (!feed.active) return "off";
  if (feed.consecutive_failures > 0) return "failing";
  if (!feed.last_success_at) return "waiting";
  return "ok";
}
