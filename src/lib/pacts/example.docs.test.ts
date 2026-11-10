import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { ConfigSchema } from "./config";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const page = read("docs/workflow.md");
const example = ConfigSchema.parse(JSON.parse(read("landschaft.config.example.json")));

/** The cells of the table in `text` whose first header is `header`, a row each, headers left out. */
function rows(text: string, header: string): string[][] {
  const table = text.split("\n").map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
  const start = table.findIndex(([first]) => first === header);
  if (start === -1) return [];
  const length = table.slice(start).findIndex((cells) => cells.length === 0);
  return table.slice(start + 2, length === -1 ? undefined : start + length);
}

/** What the table under `header` says of each lane, column or group: a filter is a code span. */
const stated = (text: string, header: string) =>
  rows(text, header).map(([name, filter = "", ...notes]) => ({
    name,
    filter: /`([^`]*)`/.exec(filter)?.[1] ?? "",
    collapsed: /collapsed|folded/i.test(notes.join()),
    hideBlocked: /hides blocked/i.test(notes.join()),
    fluid: /fluid/i.test(notes.join()),
  }));

it("workflow.md lists the dashboards and users of the example config", () => {
  expect(rows(page, "Dashboard").map(([name, layout]) => [name, layout])).toEqual(
    example.dashboards.map(({ name, type }) => [name, type]),
  );
  for (const user of example.users) expect(page).toContain(`\`${user}\``);
});

it.each(example.dashboards)(
  "workflow.md states $name as the example config has it",
  (dashboard) => {
    const section = page.split(`\n## ${dashboard.name}:`)[1]?.split("\n## ")[0] ?? "";
    expect(section).toContain(`\`${dashboard.filter}\``);
    expect(page).toContain(`\`closedDays: ${dashboard.closedDays}\``);
    if (dashboard.type === "inbox") {
      expect(stated(section, "Group")).toMatchObject(
        dashboard.groups.map(({ name, filter, collapsed }) => ({ name, filter, collapsed })),
      );
      return;
    }
    expect(stated(section, "Lane")).toEqual(
      dashboard.swimlanes.map(({ name, filter, collapsed, hideBlocked, fluid }) => ({
        name,
        filter,
        collapsed,
        hideBlocked,
        fluid,
      })),
    );
    expect(stated(section, "Column")).toMatchObject(
      dashboard.columns.map(({ name, filter }) => ({ name, filter })),
    );
  },
);
