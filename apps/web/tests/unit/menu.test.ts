import { describe, expect, it } from "vitest";
import { checkMenu, MENU_MAX, menuTopics } from "@/lib/menu";

const t = (id: number, featured = false) => ({ id, slug: `t${id}`, name: `T${id}`, featured });
const all = [t(1, true), t(2, true), t(3), t(4, true), t(5)];
const ids = (list: { id: number }[]) => list.map((x) => x.id);

describe("menuTopics", () => {
  it("is the featured topics for a visitor", () => {
    expect(ids(menuTopics(all))).toEqual([1, 2, 4]);
  });

  it("puts the topics a reader follows first, in their order, then the featured ones", () => {
    expect(ids(menuTopics(all, [5, 2]))).toEqual([5, 2, 1, 4]);
  });

  it("is exactly the reader's own menu once they chose one, retired topics left out", () => {
    expect(ids(menuTopics(all, [5], [4, 3, 99]))).toEqual([4, 3]);
    expect(ids(menuTopics(all, [5], []))).toEqual([]);
  });
});

describe("checkMenu", () => {
  it("keeps known topics once each, and refuses anything malformed or too long", () => {
    const known = new Set([1, 2, 3]);
    expect(checkMenu([3, 1, 3, 77], known)).toEqual([3, 1]);
    expect(checkMenu(["1"], known)).toBeNull();
    expect(checkMenu("1,2", known)).toBeNull();
    expect(
      checkMenu(
        Array.from({ length: MENU_MAX + 1 }, (_, i) => i + 1),
        known,
      ),
    ).toBeNull();
  });
});
