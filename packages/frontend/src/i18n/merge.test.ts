import { describe, expect, it } from "vitest";

import { mergePosMessages } from "./merge.js";

describe("mergePosMessages", () => {
  it("deep-merges with later sources winning per leaf", () => {
    expect(
      mergePosMessages(
        { pos: { order: { total: "Total: {amount}", note: "keep" } } },
        { pos: { order: { total: "Sum: {amount}" } }, app: { hello: "hi" } },
      ),
    ).toEqual({
      pos: { order: { total: "Sum: {amount}", note: "keep" } },
      app: { hello: "hi" },
    });
  });

  it("skips undefined sources and treats arrays as leaves", () => {
    expect(mergePosMessages(undefined, { a: [1] }, undefined, { b: "x" })).toEqual({
      a: [1],
      b: "x",
    });
    expect(mergePosMessages({ a: { deep: true } }, { a: [2] })).toEqual({ a: [2] });
  });

  it("never lets a `__proto__` key escape into the prototype chain", () => {
    const hostile = JSON.parse('{"__proto__": {"isAdmin": true}, "keep": "me"}') as object;
    const merged = mergePosMessages({ a: "1" }, hostile);
    expect("isAdmin" in {}).toBe(false);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(merged).toMatchObject({ a: "1", keep: "me" });
  });

  it("returns an empty tree for no sources", () => {
    expect(mergePosMessages()).toEqual({});
  });
});
