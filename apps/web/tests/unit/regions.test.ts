import { describe, expect, it } from "vitest";

describe("placeLabel", () => {
  it("names a story's places for display", async () => {
    const { placeLabel } = await import("@/lib/regions");
    expect(placeLabel(["middle-east"])).toBe("Middle East");
    expect(placeLabel(["europe", "middle-east"])).toBe("Europe and Middle East");
    expect(placeLabel(["global"])).toBe("Global");
    expect(placeLabel(null)).toBeNull();
    expect(placeLabel(["atlantis"])).toBeNull();
  });
});
