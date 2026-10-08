import type { StatusLabel } from "./schema";
import type { IssueKind, IssueRef } from "./types";

/**
 * Filter expressions for swimlanes and columns, in GitHub search syntax: `key:value` terms,
 * `a|b` for any of several values, a leading `-` to negate, side by side (or `AND`) for all,
 * `OR` for either, parens to group, quotes around values with spaces, parens, `|` or `"`.
 * `-` binds tightest, then AND, then OR.
 */
export type FilterNode =
  | { type: "term"; key: FilterKey; values: string[] }
  | { type: "not"; node: FilterNode }
  | { type: "and" | "or"; nodes: FilterNode[] };

export const IS_VALUES = [
  "issue",
  "pr",
  "conflicting",
  "ci:failed",
  "ci:running",
  "unanswered",
  "has-pr",
  "blocked",
  "blocking",
] as const;
export const HAS_VALUES = ["parent-issue", "sub-issues"] as const;
const LOGIN = /^(@me|[a-z\d](?:[a-z\d_-]*[a-z\d])?(\[bot\])?)$/i;
const REPO = /^[\w.-]+\/[\w.-]+$/;
const ISSUE_REF = /^[\w.-]+\/[\w.-]+#\d+$/;

/** Each key with the check its values must pass, or null for any value. */
const KEYS = {
  label: null,
  is: (value: string) => (IS_VALUES as readonly string[]).includes(value),
  has: (value: string) => (HAS_VALUES as readonly string[]).includes(value),
  "parent-issue": (value: string) => ISSUE_REF.test(value),
  repo: (value: string) => REPO.test(value),
  author: (value: string) => LOGIN.test(value),
  assignee: (value: string) => LOGIN.test(value),
  user: (value: string) => LOGIN.test(value),
} as const;
export type FilterKey = keyof typeof KEYS;
export const FILTER_KEYS = Object.keys(KEYS) as FilterKey[];

const EXPECTED: Partial<Record<FilterKey, string>> = {
  is: IS_VALUES.join(", "),
  has: HAS_VALUES.join(", "),
  "parent-issue": "owner/repo#number",
  repo: "owner/repo",
  author: "a GitHub login or @me",
  assignee: "a GitHub login or @me",
  user: "a GitHub login or @me",
};

export class FilterError extends Error {
  constructor(
    message: string,
    /** Offset into the filter text where the problem starts. */
    readonly at: number,
  ) {
    super(`${message} (at ${at + 1})`);
  }
}

const isSpace = (char: string | undefined) => char !== undefined && /\s/.test(char);
/** Ends an unquoted value. */
const isBreak = (char: string | undefined) =>
  char === undefined || isSpace(char) || '()|"'.includes(char);

/** The expression tree, or null for an empty (catch-all) filter; throws `FilterError`. */
export function parseFilter(text: string): FilterNode | null {
  let pos = 0;
  const skipSpace = () => {
    while (isSpace(text[pos])) pos += 1;
  };
  /** `AND` or `OR` standing alone at `pos`. */
  const keyword = (word: "AND" | "OR") =>
    text.startsWith(word, pos) && isBreak(text[pos + word.length]);

  const value = (): string => {
    if (text[pos] !== '"') {
      const start = pos;
      while (!isBreak(text[pos])) pos += 1;
      if (pos === start) throw new FilterError("expected a value", pos);
      return text.slice(start, pos);
    }
    const start = pos;
    pos += 1;
    let out = "";
    while (text[pos] !== '"') {
      if (pos >= text.length) throw new FilterError("unclosed quote", start);
      if (text[pos] === "\\" && pos + 1 < text.length) pos += 1;
      out += text[pos];
      pos += 1;
    }
    pos += 1;
    if (out === "") throw new FilterError("empty value", start);
    return out;
  };

  const term = (): FilterNode => {
    const start = pos;
    while (/[a-z-]/i.test(text[pos] ?? "")) pos += 1;
    const key = text.slice(start, pos);
    if (text[pos] !== ":") {
      while (!isBreak(text[pos])) pos += 1;
      throw new FilterError(`expected key:value, got "${text.slice(start, pos)}"`, start);
    }
    if (!(key in KEYS)) {
      throw new FilterError(
        `unknown key "${key}"; expected one of ${FILTER_KEYS.join(", ")}`,
        start,
      );
    }
    const filterKey = key as FilterKey;
    pos += 1;
    const values: string[] = [];
    for (;;) {
      const at = pos;
      const raw = value();
      const normal = filterKey === "is" || filterKey === "has" ? raw.toLowerCase() : raw;
      const check = KEYS[filterKey];
      if (check && !check(normal)) {
        throw new FilterError(`${key}:${raw} is not valid; expected ${EXPECTED[filterKey]}`, at);
      }
      values.push(normal);
      if (text[pos] !== "|") break;
      pos += 1;
    }
    return { type: "term", key: filterKey, values };
  };

  const unary = (): FilterNode => {
    skipSpace();
    if (text[pos] === "-") {
      pos += 1;
      return { type: "not", node: unary() };
    }
    if (text[pos] === "(") {
      const start = pos;
      pos += 1;
      const node = or();
      skipSpace();
      if (text[pos] !== ")") throw new FilterError("unclosed paren", start);
      pos += 1;
      return node;
    }
    if (pos >= text.length || text[pos] === ")" || keyword("AND") || keyword("OR")) {
      throw new FilterError("expected a term", pos);
    }
    return term();
  };

  const and = (): FilterNode => {
    const nodes = [unary()];
    for (;;) {
      skipSpace();
      if (pos >= text.length || text[pos] === ")" || keyword("OR")) break;
      if (keyword("AND")) pos += 3;
      nodes.push(unary());
    }
    return nodes.length === 1 ? nodes[0]! : { type: "and", nodes };
  };

  const or = (): FilterNode => {
    const nodes = [and()];
    for (;;) {
      skipSpace();
      if (!keyword("OR")) break;
      pos += 2;
      nodes.push(and());
    }
    return nodes.length === 1 ? nodes[0]! : { type: "or", nodes };
  };

  skipSpace();
  if (pos >= text.length) return null;
  const node = or();
  skipSpace();
  if (pos < text.length) throw new FilterError(`unexpected "${text[pos]}"`, pos);
  return node;
}

/** The parse error message for `text`, or null when it parses. */
export function filterError(text: string): string | null {
  try {
    parseFilter(text);
    return null;
  } catch (error) {
    if (error instanceof FilterError) return error.message;
    throw error;
  }
}

/** `value` as it must be written in a filter: quoted when it holds a space, paren, `|` or `"`. */
export function quoteValue(value: string): string {
  return /[\s()|"\\]/.test(value) ? `"${value.replaceAll(/["\\]/g, "\\$&")}"` : value;
}

/** Labels a filter asks for outside a `-`, lower-cased. */
export function askedLabels(node: FilterNode | null): string[] {
  if (!node || node.type === "not") return [];
  if (node.type === "term") {
    return node.key === "label" ? node.values.map((value) => value.toLowerCase()) : [];
  }
  return node.nodes.flatMap(askedLabels);
}

/** What a filter tests an item on. */
export interface FilterItem {
  kind: IssueKind;
  repo: string;
  author: string | null;
  assignees: { login: string }[];
  labels: { name: string }[];
  statuses: StatusLabel[];
  parent: IssueRef | null;
  subIssues: { total: number };
  /** Has an open blocker. */
  blocked: boolean;
  /** Blocks an open issue. */
  blocking: boolean;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** `login` is `value`, where `@me` stands for `viewer` and a `[bot]` suffix is dropped. */
function isLogin(value: string, login: string | null, viewer: string | null): boolean {
  const wanted = same(value, "@me") ? viewer : value.replace(/\[bot\]$/i, "");
  return wanted !== null && login !== null && same(wanted, login);
}

function holds(key: FilterKey, value: string, item: FilterItem, viewer: string | null): boolean {
  switch (key) {
    case "label":
      return item.labels.some((label) => same(label.name, value));
    case "is":
      if (value === "issue" || value === "pr") return item.kind === value;
      if (value === "blocked") return item.blocked;
      if (value === "blocking") return item.blocking;
      return item.statuses.includes(`is:${value}` as StatusLabel);
    case "has":
      return value === "parent-issue" ? item.parent !== null : item.subIssues.total > 0;
    case "parent-issue":
      return item.parent !== null && same(`${item.parent.repo}#${item.parent.number}`, value);
    case "repo":
      return same(item.repo, value);
    case "author":
      return isLogin(value, item.author, viewer);
    case "assignee":
      return item.assignees.some(({ login }) => isLogin(value, login, viewer));
    case "user":
      return (
        isLogin(value, item.author, viewer) ||
        item.assignees.some(({ login }) => isLogin(value, login, viewer))
      );
  }
}

/** Whether `item` satisfies `node`; an empty filter takes everything. */
export function matchesFilter(
  node: FilterNode | null,
  item: FilterItem,
  viewer: string | null = null,
): boolean {
  if (!node) return true;
  switch (node.type) {
    case "term":
      return node.values.some((value) => holds(node.key, value, item, viewer));
    case "not":
      return !matchesFilter(node.node, item, viewer);
    case "and":
      return node.nodes.every((child) => matchesFilter(child, item, viewer));
    case "or":
      return node.nodes.some((child) => matchesFilter(child, item, viewer));
  }
}

/**
 * Completions for the last term of `text`: keys, then the key's values (`labels` for
 * `label:`), each as the whole filter text with that term completed.
 */
export function suggestFilter(text: string, labels: string[]): string[] {
  // ponytail: a term is what follows the last space or paren, so a half-typed quoted value
  // holding a space gets no suggestions.
  const word = /[^\s(]*$/.exec(text)![0].replace(/^-+/, "");
  const colon = word.indexOf(":");
  const key = colon < 0 ? null : word.slice(0, colon);
  const partial = key === null ? word : word.slice(Math.max(colon, word.lastIndexOf("|")) + 1);
  const head = text.slice(0, text.length - partial.length);
  const options: Record<string, readonly string[]> = {
    label: labels.map(quoteValue),
    is: IS_VALUES,
    has: HAS_VALUES,
    author: ["@me"],
    assignee: ["@me"],
    user: ["@me"],
  };
  const candidates = key === null ? FILTER_KEYS.map((name) => `${name}:`) : (options[key] ?? []);
  return candidates
    .filter((option) => option !== partial && same(option.slice(0, partial.length), partial))
    .map((option) => head + option);
}
