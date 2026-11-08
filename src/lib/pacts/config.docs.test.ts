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
  const cells = section
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line): [string, unknown] => {
      const [, field = "", , cell = ""] = line.split(/(?<!\\)\|/).map((text) => text.trim());
      return [field.replaceAll("`", ""), parseDefault(cell)];
    });
  return {
    fields: cells.map(([field]) => field),
    defaults: Object.fromEntries(cells.filter(([, value]) => value !== undefined)),
  };
}

/** The keys the schema filled in: those a parse returned that its input lacked. */
const filled = (...parses: [input: object, parsed: object][]) => [
  ...new Set(
    parses.flatMap(([input, parsed]) => Object.keys(parsed).filter((key) => !(key in input))),
  ),
];

const lane = { id: "l", name: "L" };
const column = { id: "c", name: "C" };
const group = { id: "g", name: "G" };
const boardInput = { id: "d", name: "D", swimlanes: [lane], columns: [column] };
const inboxInput = { id: "d", name: "D", type: "inbox" };
const board = DashboardSchema.parse(boardInput);
const inbox = DashboardSchema.parse(inboxInput);
const inboxGroup = InboxGroupSchema.parse(group);
if (board.type !== "board") throw new Error("a dashboard without type is a board");

it("configuration.md states every Global field and default", () => {
  const { fields, defaults } = table("Global");
  const config = ConfigSchema.parse({});
  expect(fields.toSorted()).toEqual(Object.keys(config).toSorted());
  expect(Object.keys(defaults).toSorted()).toEqual(filled([{}, config]).toSorted());
  expect(ConfigSchema.parse(defaults)).toEqual(config);
});

it.each<[string, object, string[]]>([
  ["Dashboard", { ...inbox, ...board }, filled([boardInput, board], [inboxInput, inbox])],
  [
    "Swimlane and column",
    { ...board.swimlanes[0], ...board.columns[0] },
    filled([lane, board.swimlanes[0]], [column, board.columns[0]]),
  ],
  ["Inbox group", inboxGroup, filled([group, inboxGroup])],
])("configuration.md states every %s field and default", (heading, parsed, defaulted) => {
  const { fields, defaults } = table(heading);
  expect(fields.toSorted()).toEqual(Object.keys(parsed).toSorted());
  expect(Object.keys(defaults).toSorted()).toEqual(defaulted.toSorted());
  expect(parsed).toMatchObject(defaults);
});
