/** The text under the `## ` heading that is `heading` or starts with `${heading}:`, up to the next one. */
export function section(page: string, heading: string): string {
  const [, ...parts] = page.split(/^## /m);
  const found = parts.find((part) => {
    const title = part.slice(0, part.indexOf("\n"));
    return title === heading || title.startsWith(`${heading}:`);
  });
  if (found === undefined) throw new Error(`no "## ${heading}" heading`);
  return found;
}

/** The cells of a table row, split on unescaped pipes. */
const cells = (line: string) =>
  line
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim());

/** The cells of the table whose first header is `header`, a row each, header and separator left out. */
export function rows(text: string, header: string): string[][] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => cells(line)[0] === header);
  if (start === -1) throw new Error(`no table with the header "${header}"`);
  const table = lines.slice(start);
  const end = table.findIndex((line) => !line.startsWith("|"));
  const [, , ...body] = end === -1 ? table : table.slice(0, end);
  return body.map(cells);
}
