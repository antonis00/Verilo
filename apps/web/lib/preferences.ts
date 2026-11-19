// A reader's preferences: what the wizard and settings send, how it's checked, and how it maps
// to the ranking's Preferences. Pure apart from the types, so the checks are unit-tested.

import type { Preferences } from "@/lib/feed";
import { REGION_CODES } from "@/lib/regions";

export { REGIONS } from "@/lib/regions";

export type PreferencesInput = {
  followTopics: number[];
  muteTopics: number[];
  followSources: number[];
  hideSources: number[];
  regions: string[];
  showOpinion: boolean;
  showTier3: boolean;
};

export const EMPTY_INPUT: PreferencesInput = {
  followTopics: [],
  muteTopics: [],
  followSources: [],
  hideSources: [],
  regions: [],
  showOpinion: true,
  showTier3: true,
};

export type Checked = { ok: true; value: PreferencesInput } | { ok: false; message: string };

const ids = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => Number.isInteger(x) && x > 0) && v.length <= 500
    ? [...new Set(v as number[])]
    : null;

// Checks what a browser sent before it reaches the database: only known topics and outlets,
// known regions, real booleans; a topic or outlet can't be both followed and muted/hidden.
export function checkPreferences(
  raw: unknown,
  known: { topics: Set<number>; sources: Set<number> },
): Checked {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Nothing to save." };
  const r = raw as Record<string, unknown>;
  const followTopics = ids(r.followTopics);
  const muteTopics = ids(r.muteTopics);
  const followSources = ids(r.followSources);
  const hideSources = ids(r.hideSources);
  if (!followTopics || !muteTopics || !followSources || !hideSources) {
    return { ok: false, message: "Some choices couldn't be read. Reload the page and try again." };
  }
  if ([...followTopics, ...muteTopics].some((t) => !known.topics.has(t))) {
    return { ok: false, message: "A topic you chose no longer exists. Reload the page." };
  }
  if ([...followSources, ...hideSources].some((s) => !known.sources.has(s))) {
    return { ok: false, message: "An outlet you chose is no longer available. Reload the page." };
  }
  const regions = Array.isArray(r.regions) ? [...new Set(r.regions as unknown[])] : null;
  if (!regions || regions.some((c) => typeof c !== "string" || !REGION_CODES.has(c))) {
    return { ok: false, message: "A place you chose isn't one we cover." };
  }
  if (typeof r.showOpinion !== "boolean" || typeof r.showTier3 !== "boolean") {
    return { ok: false, message: "Some choices couldn't be read. Reload the page and try again." };
  }
  const followedTopics = new Set(followTopics);
  const followedSources = new Set(followSources);
  return {
    ok: true,
    value: {
      followTopics,
      muteTopics: muteTopics.filter((t) => !followedTopics.has(t)),
      followSources,
      hideSources: hideSources.filter((s) => !followedSources.has(s)),
      regions: regions as string[],
      showOpinion: r.showOpinion,
      showTier3: r.showTier3,
    },
  };
}

export function toRanking(input: PreferencesInput): Preferences {
  return { ...input };
}
