import { describe, expect, it } from "vitest";

import { ViewQuerySchema } from "./schema";

describe("board query", () => {
  it("parses hidden repos into a list, empty meaning none hidden", () => {
    expect(ViewQuerySchema.parse({ hide: "acme/a,acme/b" }).hide).toEqual(["acme/a", "acme/b"]);
    expect(ViewQuerySchema.parse({ hide: "" }).hide).toEqual([]);
  });
});
