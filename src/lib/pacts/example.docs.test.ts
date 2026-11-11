import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import type { Dashboard } from "./config";

import { rows, section } from "../__fixtures__/markdown";
import { ConfigSchema } from "./config";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const page = read("docs/workflow.md");
const example = ConfigSchema.parse(JSON.parse(read("landschaft.config.example.json")));

const FLAGS = ["collapsed", "hideBlocked", "fluid"] as const;
type Flag = (typeof FLAGS)[number];
type Item = { name: string; filter: string } & Partial<Record<Flag, boolean>>;

/** The flag each token of a Settings cell sets. */
const SETTINGS: Record<string, Flag> = {
  "starts collapsed": "collapsed",
  "hides blocked": "hideBlocked",
  fluid: "fluid",
};

/** The flags a Settings cell sets; a table without that column sets none. */
function settings(cell = "none"): Flag[] {
  if (cell === "none") return [];
  const set = new Set(
    cell.split(",").map((token) => {
      const flag = SETTINGS[token.trim().toLowerCase()];
      if (flag === undefined) throw new Error(`unknown setting "${token.trim()}"`);
      return flag;
    }),
  );
  return FLAGS.filter((flag) => set.has(flag));
}

/** The lanes, columns or groups of `dashboard`, by the first header of the table that lists them. */
const tables = (dashboard: Dashboard): Record<string, Item[]> =>
  dashboard.type === "inbox"
    ? { Group: dashboard.groups }
    : { Lane: dashboard.swimlanes, Column: dashboard.columns };

it("workflow.md lists the dashboards and users of the example config", () => {
  expect(rows(page, "Dashboard").map(([name, layout]) => [name, layout])).toEqual(
    example.dashboards.map(({ name, type }) => [name, type]),
  );
  for (const user of example.users) expect(page).toContain(`\`${user}\``);
});

it.each(example.dashboards)(
  "workflow.md states $name as the example config has it",
  (dashboard) => {
    const text = section(page, dashboard.name);
    expect(text).toContain(`\`${dashboard.filter}\``);
    expect(page).toContain(`\`closedDays: ${dashboard.closedDays}\``);
    for (const [header, items] of Object.entries(tables(dashboard))) {
      expect(
        rows(text, header).map(([name, filter = "", cell]) => ({
          name,
          filter: /`([^`]*)`/.exec(filter)?.[1] ?? "",
          settings: settings(cell),
        })),
        header,
      ).toEqual(
        items.map((item) => ({
          name: item.name,
          filter: item.filter,
          settings: FLAGS.filter((flag) => item[flag]),
        })),
      );
    }
  },
);
