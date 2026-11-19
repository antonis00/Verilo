import { describe, expect, it } from "vitest";
import { checkPreferences, EMPTY_INPUT } from "@/lib/preferences";

const known = { topics: new Set([1, 2, 3]), sources: new Set([10, 11, 12]) };
const input = (over: Record<string, unknown> = {}) => ({ ...EMPTY_INPUT, ...over });

describe("checkPreferences", () => {
  it("accepts a good set and removes duplicates", () => {
    const r = checkPreferences(
      input({
        followTopics: [1, 1, 2],
        followSources: [10],
        regions: ["europe", "europe", "africa"],
      }),
      known,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        ...EMPTY_INPUT,
        followTopics: [1, 2],
        followSources: [10],
        regions: ["europe", "africa"],
      },
    });
  });

  it("lets following win over muting or hiding", () => {
    const r = checkPreferences(
      input({ followTopics: [1], muteTopics: [1, 2], followSources: [10], hideSources: [10, 11] }),
      known,
    );
    expect(r.ok && r.value.muteTopics).toEqual([2]);
    expect(r.ok && r.value.hideSources).toEqual([11]);
  });

  // A choice made when it was offered (a topic since retired, an outlet since paused, a place
  // since dropped) must not block every later save: it's left out and the rest is saved.
  it("drops choices no longer offered and saves the rest", () => {
    const r = checkPreferences(
      input({
        followTopics: [1, 99],
        muteTopics: [98],
        followSources: [97],
        hideSources: [10, 99],
        regions: ["international", "europe", "atlantis", "FR"],
      }),
      known,
    );
    expect(r).toEqual({
      ok: true,
      value: { ...EMPTY_INPUT, followTopics: [1], hideSources: [10], regions: ["europe"] },
    });
  });

  it.each([
    ["a region that isn't text", { regions: [5] }, "couldn't be read"],
    ["regions that aren't a list", { regions: "europe" }, "couldn't be read"],
    ["a non-number id", { followTopics: ["1"] }, "couldn't be read"],
    ["a negative id", { followSources: [-1] }, "couldn't be read"],
    ["a string for a switch", { showOpinion: "yes" }, "couldn't be read"],
  ])("refuses %s", (_name, over, message) => {
    const r = checkPreferences(input(over), known);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain(message);
  });

  it("refuses nothing at all", () => {
    expect(checkPreferences(null, known).ok).toBe(false);
  });
});
