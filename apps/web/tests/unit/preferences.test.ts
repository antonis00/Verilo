import { describe, expect, it } from "vitest";
import { checkPreferences, EMPTY_INPUT } from "@/lib/preferences";

const known = { topics: new Set([1, 2, 3]), sources: new Set([10, 11, 12]) };
const input = (over: Record<string, unknown> = {}) => ({ ...EMPTY_INPUT, ...over });

describe("checkPreferences", () => {
  it("accepts a good set and removes duplicates", () => {
    const r = checkPreferences(
      input({ followTopics: [1, 1, 2], followSources: [10], countries: ["GB", "GB", "IN"] }),
      known,
    );
    expect(r).toEqual({
      ok: true,
      value: { ...EMPTY_INPUT, followTopics: [1, 2], followSources: [10], countries: ["GB", "IN"] },
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

  it.each([
    ["an unknown topic", { followTopics: [99] }, "topic"],
    ["an unknown outlet", { hideSources: [99] }, "outlet"],
    ["an unknown place", { countries: ["FR"] }, "place"],
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
