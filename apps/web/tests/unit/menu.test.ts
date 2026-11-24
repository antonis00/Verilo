import { describe, expect, it } from "vitest";
import { inOrder, menuTopics } from "@/lib/menu";

const t = (id: number, featured = false) => ({ id, slug: `t${id}`, name: `T${id}`, featured });
const all = [t(1, true), t(2, true), t(3), t(4, true), t(5)];
const ids = (list: { id: number }[]) => list.map((x) => x.id);

describe("menuTopics", () => {
  it("gives visitors the featured topics", () => {
    expect(ids(menuTopics(all))).toEqual([1, 2, 4]);
  });

  it("puts the topics followed first, in the reader's order, then the other featured ones", () => {
    expect(ids(menuTopics(all, [5, 2]))).toEqual([5, 2, 1, 4]);
  });

  it("leaves out featured topics the reader left out", () => {
    expect(ids(menuTopics(all, [3], [1]))).toEqual([3, 2, 4]);
  });
});

describe("inOrder", () => {
  it("follows the saved order, then adds topics followed since", () => {
    expect(inOrder([1, 2, 3, 4], [3, 1])).toEqual([3, 1, 2, 4]);
  });

  it("drops topics no longer followed from the order", () => {
    expect(inOrder([2], [3, 2, 1])).toEqual([2]);
  });

  it("keeps the given order without a saved one", () => {
    expect(inOrder([4, 2], null)).toEqual([4, 2]);
  });
});
