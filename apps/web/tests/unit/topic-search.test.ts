import { describe, expect, it } from "vitest";
import { MAX_RESULTS, normalise, searchTopics, visibleTopics } from "@/lib/topic-search";

const T = (id: number, name: string, aliases: string[] = [], featured = false) => ({
  id,
  name,
  aliases,
  featured,
});

const TOPICS = [
  T(1, "Sport", ["sports"], true),
  T(2, "Football", ["soccer", "premier league"]),
  T(3, "Formula 1", ["f1", "grand prix"]),
  T(4, "American football", ["nfl"]),
  T(5, "Cryptocurrency", ["crypto", "bitcoin"]),
  T(6, "Économie", []),
];

const names = (list: { name: string }[]) => list.map((t) => t.name);

describe("searchTopics", () => {
  it("finds by name, best matches first", () => {
    expect(names(searchTopics(TOPICS, "foot"))).toEqual(["Football", "American football"]);
  });

  it("finds by alias", () => {
    expect(names(searchTopics(TOPICS, "soccer"))).toEqual(["Football"]);
    expect(names(searchTopics(TOPICS, "F1"))).toEqual(["Formula 1"]);
    expect(names(searchTopics(TOPICS, "bitc"))).toEqual(["Cryptocurrency"]);
  });

  it("ignores case, accents and punctuation", () => {
    expect(names(searchTopics(TOPICS, "economie"))).toEqual(["Économie"]);
    expect(names(searchTopics(TOPICS, "  CRYPTO! "))).toEqual(["Cryptocurrency"]);
    expect(normalise("Formula-1")).toBe("formula 1");
  });

  it("returns nothing for an empty query or no match", () => {
    expect(searchTopics(TOPICS, "   ")).toEqual([]);
    expect(searchTopics(TOPICS, "zzz")).toEqual([]);
  });

  it(`shows at most ${MAX_RESULTS}`, () => {
    const many = Array.from({ length: 40 }, (_, i) => T(i + 100, `Topic ${i}`));
    expect(searchTopics(many, "topic")).toHaveLength(MAX_RESULTS);
  });
});

describe("visibleTopics", () => {
  it("shows the featured ones and any the reader chose", () => {
    expect(names(visibleTopics(TOPICS, [3]))).toEqual(["Sport", "Formula 1"]);
  });
});
