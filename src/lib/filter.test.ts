import { describe, expect, it } from "vitest";

import {
  askedLabels,
  type FilterItem,
  filterError,
  matchesFilter,
  parseFilter,
  quoteValue,
  suggestFilter,
} from "./filter";

const item = (extra: Partial<FilterItem> = {}): FilterItem => ({
  kind: "issue",
  repo: "acme/app",
  author: null,
  assignees: [],
  labels: [],
  statuses: [],
  parent: null,
  subIssues: { total: 0 },
  blocked: false,
  blocking: false,
  ...extra,
});
const labels = (...names: string[]) => item({ labels: names.map((name) => ({ name })) });
const fits = (filter: string, target: FilterItem, viewer: string | null = null) =>
  matchesFilter(parseFilter(filter), target, viewer);

describe("parseFilter", () => {
  it("reads an empty filter as null", () => {
    expect(parseFilter("")).toBeNull();
    expect(parseFilter("   ")).toBeNull();
  });

  it("binds - tightest, then AND, then OR", () => {
    expect(parseFilter("label:a -label:b OR label:c")).toEqual({
      type: "or",
      nodes: [
        {
          type: "and",
          nodes: [
            { type: "term", key: "label", values: ["a"] },
            { type: "not", node: { type: "term", key: "label", values: ["b"] } },
          ],
        },
        { type: "term", key: "label", values: ["c"] },
      ],
    });
    expect(parseFilter("label:a AND label:b")).toEqual(parseFilter("label:a label:b"));
  });

  it("reads parens, alternatives, quotes and escapes", () => {
    expect(parseFilter('-(is:pr label:a|"b c")')).toEqual({
      type: "not",
      node: {
        type: "and",
        nodes: [
          { type: "term", key: "is", values: ["pr"] },
          { type: "term", key: "label", values: ["a", "b c"] },
        ],
      },
    });
    expect(parseFilter(String.raw`label:"say \"hi\""`)).toEqual({
      type: "term",
      key: "label",
      values: ['say "hi"'],
    });
    expect(parseFilter("label:prio:high")).toEqual({
      type: "term",
      key: "label",
      values: ["prio:high"],
    });
  });

  it("takes AND and OR only in uppercase", () => {
    expect(filterError("label:a or label:b")).toMatch(/expected key:value, got "or"/);
    expect(filterError("label:or")).toBeNull();
  });

  it("explains what is wrong and where", () => {
    expect(filterError("bug")).toMatch(/expected key:value, got "bug" \(at 1\)/);
    expect(filterError("foo:x")).toMatch(/unknown key "foo"/);
    expect(filterError("is:conflict")).toMatch(/is:conflict is not valid; expected issue, pr/);
    expect(filterError("label:a (label:b")).toMatch(/unclosed paren \(at 9\)/);
    expect(filterError('label:"a')).toMatch(/unclosed quote/);
    expect(filterError("label:a)")).toMatch(/unexpected "\)"/);
    expect(filterError("label:a OR")).toMatch(/expected a term/);
    expect(filterError("label:a|")).toMatch(/expected a value/);
    expect(filterError("repo:app")).toMatch(/owner\/repo/);
    expect(filterError("parent-issue:acme/app")).toMatch(/owner\/repo#number/);
    expect(filterError("author:@ann")).toMatch(/GitHub login/);
    expect(filterError("has:children")).toMatch(/expected parent-issue, sub-issues/);
  });

  it("rejects keys and values inherited from Object", () => {
    expect(filterError("constructor:x")).toMatch(/unknown key "constructor"/);
    expect(filterError("toString:x")).toMatch(/unknown key "toString"/);
    expect(filterError("is:constructor")).toMatch(/is:constructor is not valid/);
  });
});

describe("matchesFilter", () => {
  it("matches labels by name, whatever the case", () => {
    expect(fits("label:Bug", labels("bug"))).toBe(true);
    expect(fits("label:a|b", labels("B"))).toBe(true);
    expect(fits("label:a label:b", labels("a"))).toBe(false);
    expect(fits("-label:a", labels("b"))).toBe(true);
    expect(fits('label:"needs review"', labels("Needs Review"))).toBe(true);
  });

  it("matches kinds, statuses and blockers", () => {
    const pr = item({ kind: "pr", statuses: ["is:ci:failed"] });
    expect(fits("is:pr", pr)).toBe(true);
    expect(fits("is:issue", pr)).toBe(false);
    expect(fits("is:CI:failed", pr)).toBe(true);
    expect(fits("is:conflicting", pr)).toBe(false);
    expect(fits("is:has-pr", item({ statuses: ["is:has-pr"] }))).toBe(true);
    expect(fits("is:blocked", item({ blocked: true }))).toBe(true);
    expect(fits("is:blocking", item({ blocking: true }))).toBe(true);
    expect(fits("is:blocked|blocking", item())).toBe(false);
  });

  it("matches parents and sub-issues", () => {
    const child = item({ parent: { repo: "acme/app", number: 12 } });
    expect(fits("has:parent-issue", child)).toBe(true);
    expect(fits("has:parent-issue", item())).toBe(false);
    expect(fits("parent-issue:Acme/App#12", child)).toBe(true);
    expect(fits("parent-issue:acme/app#1", child)).toBe(false);
    expect(fits("has:Sub-Issues", item({ subIssues: { total: 2 } }))).toBe(true);
    expect(fits("has:sub-issues", child)).toBe(false);
  });

  it("matches repos and people, with @me as the viewer", () => {
    const ann = item({ author: "Ann", assignees: [{ login: "bob" }] });
    expect(fits("repo:ACME/app", ann)).toBe(true);
    expect(fits("author:ann", ann)).toBe(true);
    expect(fits("assignee:ann", ann)).toBe(false);
    expect(fits("user:bob", ann)).toBe(true);
    expect(fits("user:@me", ann, "bob")).toBe(true);
    expect(fits("user:@me", ann)).toBe(false);
    expect(fits("author:renovate[bot]", item({ author: "renovate" }))).toBe(true);
  });

  it("combines with OR and parens", () => {
    const filter = "is:pr (label:a OR is:unanswered)";
    expect(fits(filter, item({ kind: "pr", statuses: ["is:unanswered"] }))).toBe(true);
    expect(fits(filter, item({ labels: [{ name: "a" }] }))).toBe(false);
  });
});

describe("askedLabels", () => {
  it("lists labels outside a -, lower-cased", () => {
    expect(askedLabels(parseFilter("label:A|b (label:c OR -label:d) -(label:e)"))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(askedLabels(null)).toEqual([]);
  });
});

describe("quoteValue", () => {
  it("quotes only values the parser would split", () => {
    expect(quoteValue("prio:high")).toBe("prio:high");
    expect(quoteValue("needs review")).toBe('"needs review"');
    expect(quoteValue('a"b')).toBe(String.raw`"a\"b"`);
    expect(parseFilter(`label:${quoteValue('x (y) | "z"')}`)).toMatchObject({
      values: ['x (y) | "z"'],
    });
  });
});

describe("suggestFilter", () => {
  it("completes keys, then the key's values", () => {
    expect(suggestFilter("", [])).toContain("label:");
    expect(suggestFilter("is:pr -la", [])).toEqual(["is:pr -label:"]);
    expect(suggestFilter("label:", ["bug", "needs review"])).toEqual([
      "label:bug",
      'label:"needs review"',
    ]);
    expect(suggestFilter("(label:x|B", ["bug", "x"])).toEqual(["(label:x|bug"]);
    expect(suggestFilter("is:ci", [])).toEqual(["is:ci:failed", "is:ci:running"]);
    expect(suggestFilter("repo:", [])).toEqual([]);
    expect(suggestFilter("constructor:", [])).toEqual([]);
    expect(suggestFilter("has:", [])).toEqual(["has:parent-issue", "has:sub-issues"]);
  });
});
