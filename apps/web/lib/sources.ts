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

export { COUNTRY_LABEL } from "@/lib/regions";

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

export type Kind = "news" | "opinion" | "sponsored";

export const KIND_LABEL: Record<Kind, string | null> = {
  news: null,
  opinion: "Opinion",
  sponsored: "Sponsored",
};

// Leans fall into three groups for the balance rule: a summary needs outlets from two of them.
export type LeanGroup = "left" | "centre" | "right";
export const LEAN_GROUP: Record<Lean, LeanGroup> = {
  left: "left",
  lean_left: "left",
  center: "centre",
  lean_right: "right",
  right: "right",
};

const LEAN_ORDER: Lean[] = ["left", "lean_left", "center", "lean_right", "right"];

export function leanSpread(leans: Lean[]): Lean[] {
  return LEAN_ORDER.filter((l) => leans.includes(l));
}

// The summary rule (CLAUDE.md, Phase 4): only news reports from tier 1–2 outlets count; there
// must be at least 3 such outlets, at least one of them tier 1, from at least 2 lean groups.
export const SUMMARY_RULE = { outlets: 3, groups: 2 } as const;

export type Readiness = {
  ready: boolean;
  outlets: number;
  tierOne: boolean;
  groups: number;
  missing: string[];
};

export function summaryReadiness(
  articles: { kind: Kind; source: { id: number; tier: Tier; lean: Lean } | null }[],
): Readiness {
  const trusted = new Map<number, { tier: Tier; lean: Lean }>();
  for (const a of articles) {
    if (a.kind === "news" && a.source && a.source.tier <= 2) trusted.set(a.source.id, a.source);
  }
  const outlets = trusted.size;
  const tierOne = [...trusted.values()].some((s) => s.tier === 1);
  const groups = new Set([...trusted.values()].map((s) => LEAN_GROUP[s.lean])).size;
  const missing: string[] = [];
  if (outlets < SUMMARY_RULE.outlets)
    missing.push(
      `${SUMMARY_RULE.outlets - outlets} more reputable outlet${SUMMARY_RULE.outlets - outlets === 1 ? "" : "s"}`,
    );
  if (!tierOne) missing.push("a public broadcaster or wire service");
  if (groups < SUMMARY_RULE.groups) missing.push("another lean group");
  return { ready: missing.length === 0, outlets, tierOne, groups, missing };
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
