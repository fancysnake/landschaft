import { describe, expect, it } from "vitest";

import { move } from "./move";

describe("move", () => {
  it("moves an entry up and down", () => {
    expect(move(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("leaves the input untouched", () => {
    const items = ["a", "b"];
    move(items, 0, 1);
    expect(items).toEqual(["a", "b"]);
  });
});
