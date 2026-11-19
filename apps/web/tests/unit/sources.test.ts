import { describe, expect, it } from "vitest";
import { leanSpread, summaryReadiness, type Kind, type Lean, type Tier } from "@/lib/sources";

const art = (id: number, tier: Tier, lean: Lean, kind: Kind = "news") => ({
  kind,
  source: { id, tier, lean },
});

describe("summaryReadiness", () => {
  it("is ready with three reputable outlets, a tier 1 among them, from two lean groups", () => {
    const r = summaryReadiness([art(1, 1, "center"), art(2, 2, "lean_left"), art(3, 2, "right")]);
    expect(r).toMatchObject({ ready: true, outlets: 3, tierOne: true, groups: 3, missing: [] });
  });

  it("counts each outlet once, however many articles it has", () => {
    const r = summaryReadiness([art(1, 1, "center"), art(1, 1, "center"), art(2, 2, "left")]);
    expect(r.outlets).toBe(2);
    expect(r.missing).toEqual(["1 more reputable outlet"]);
  });

  it("ignores opinion, sponsored pieces and tier 3 outlets", () => {
    const r = summaryReadiness([
      art(1, 1, "center"),
      art(2, 2, "right", "opinion"),
      art(3, 2, "left", "sponsored"),
      art(4, 3, "lean_right"),
    ]);
    expect(r.outlets).toBe(1);
    expect(r.ready).toBe(false);
  });

  it("needs a public broadcaster or wire service", () => {
    const r = summaryReadiness([art(1, 2, "left"), art(2, 2, "center"), art(3, 2, "right")]);
    expect(r.missing).toEqual(["a public broadcaster or wire service"]);
  });

  it("needs two lean groups: lean left and left are one group", () => {
    const r = summaryReadiness([art(1, 1, "lean_left"), art(2, 2, "left"), art(3, 2, "lean_left")]);
    expect(r.groups).toBe(1);
    expect(r.missing).toEqual(["another lean group"]);
  });
});

describe("leanSpread", () => {
  it("orders leans from left to right, once each", () => {
    expect(leanSpread(["right", "center", "lean_left", "center"])).toEqual([
      "lean_left",
      "center",
      "right",
    ]);
  });
});
