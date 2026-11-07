import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { ConfigSchema, DashboardSchema, InboxGroupSchema } from "./config";

const page = readFileSync(new URL("../../../docs/configuration.md", import.meta.url), "utf8");

/** A default cell's value: its first code span, as JSON where it is JSON. */
function parseDefault(cell: string): unknown {
  const code = /`([^`]+)`/.exec(cell)?.[1];
  if (code === undefined) return undefined;
  try {
    return JSON.parse(code);
  } catch {
    return code;
  }
}

/** The fields of the table under `heading`, and the defaults of those that have one. */
function table(heading: string) {
  const section = page.split(`## ${heading}\n`)[1]?.split("\n## ")[0] ?? "";
  const rows = section
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => line.split(/(?<!\\)\|/).map((cell) => cell.trim()));
  const fields = rows.map(([, field = ""]) => field.replaceAll("`", ""));
  const defaults = rows.flatMap(([, field = "", , cell = ""]) => {
    const value = parseDefault(cell);
    return value === undefined ? [] : [[field.replaceAll("`", ""), value]];
  });
  return { fields, defaults: Object.fromEntries(defaults) as Record<string, unknown> };
}

const sorted = (fields: string[]) => [...fields].toSorted();

it("configuration.md states every config field and default", () => {
  const dashboard = { id: "d", name: "D" };
  const board = DashboardSchema.parse({
    ...dashboard,
    swimlanes: [{ id: "l", name: "L" }],
    columns: [{ id: "c", name: "C" }],
  });
  const inbox = DashboardSchema.parse({ ...dashboard, type: "inbox" });
  if (board.type !== "board") throw new Error("a dashboard without type is a board");

  const global = table("Global");
  const config = ConfigSchema.parse({});
  expect(sorted(global.fields)).toEqual(sorted(Object.keys(config)));
  expect(ConfigSchema.parse(global.defaults)).toEqual(config);

  const cases = [
    ["Dashboard", { ...inbox, ...board, groups: [] }],
    ["Swimlane and column", { ...board.swimlanes[0], ...board.columns[0] }],
    ["Inbox group", InboxGroupSchema.parse({ id: "g", name: "G" })],
  ] as const;
  for (const [heading, parsed] of cases) {
    const { fields, defaults } = table(heading);
    expect(sorted(fields)).toEqual(sorted(Object.keys(parsed)));
    expect(parsed).toMatchObject(defaults);
  }
});
