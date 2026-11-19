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

// Checks what a browser sent before it reaches the database: well-formed ids, region codes and
// booleans; a topic or outlet can't be both followed and muted/hidden. Choices that are no
// longer offered (a topic retired, an outlet paused, a region dropped from Places) are left out
// quietly: they were valid when the reader made them, and refusing the whole save would leave
// the reader stuck with a choice they can no longer see.
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
  const regions = Array.isArray(r.regions) ? [...new Set(r.regions as unknown[])] : null;
  if (!regions || regions.length > 50 || regions.some((c) => typeof c !== "string")) {
    return { ok: false, message: "Some choices couldn't be read. Reload the page and try again." };
  }
  if (typeof r.showOpinion !== "boolean" || typeof r.showTier3 !== "boolean") {
    return { ok: false, message: "Some choices couldn't be read. Reload the page and try again." };
  }
  const topic = (t: number) => known.topics.has(t);
  const source = (id: number) => known.sources.has(id);
  const followedTopics = new Set(followTopics.filter(topic));
  const followedSources = new Set(followSources.filter(source));
  return {
    ok: true,
    value: {
      followTopics: [...followedTopics],
      muteTopics: muteTopics.filter((t) => topic(t) && !followedTopics.has(t)),
      followSources: [...followedSources],
      hideSources: hideSources.filter((s) => source(s) && !followedSources.has(s)),
      regions: (regions as string[]).filter((c) => REGION_CODES.has(c)),
      showOpinion: r.showOpinion,
      showTier3: r.showTier3,
    },
  };
}

export function toRanking(input: PreferencesInput): Preferences {
  return { ...input };
}
