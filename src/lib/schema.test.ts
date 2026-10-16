import { describe, expect, it } from "vitest";

import { BoardQuerySchema } from "./schema";

describe("board query", () => {
  it("parses hidden repos into a list, empty meaning none hidden", () => {
    expect(BoardQuerySchema.parse({ hide: "acme/a,acme/b" }).hide).toEqual(["acme/a", "acme/b"]);
    expect(BoardQuerySchema.parse({ hide: "" }).hide).toEqual([]);
  });
});
