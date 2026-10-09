/**
 * A CSV into rows of strings, and nothing cleverer than that.
 *
 * Written rather than installed because the whole of what is needed is
 * below, and a dependency that parses CSV would also parse types,
 * guess numbers and trim things — all of which this must do its own
 * way, or not at all.
 *
 * What it handles, because Meta's exports contain all of it:
 *
 *   · quoted fields with commas inside them — campaign names routinely
 *     have one, and splitting on every comma shifts a whole row's
 *     columns left without anything looking wrong
 *   · doubled quotes inside a quoted field (`""`), which is how a quote
 *     is escaped
 *   · CRLF as well as LF, because an export downloaded on Windows has
 *     the former and a stray `\r` at the end of the last column makes
 *     every header match fail
 *   · a byte-order mark at the start, which Excel adds on save and
 *     which otherwise becomes part of the first header's name
 *
 * It does NOT handle: a newline inside a quoted field. Meta does not
 * produce one, and the row-per-post shape means a description with a
 * line break would be the only source. It throws rather than guessing,
 * because the alternative is a silently short file.
 */

export function tokenise(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];

    if (quoted) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else if (char === "\n") {
        throw new Error(
          "That file has a line break inside a quoted field, which this reader does not handle.",
        );
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      // A trailing newline, or a blank line in the middle, is not a row.
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  return rows;
}

/**
 * The header row, and a reader for each data row by column name.
 *
 * Names are matched case-insensitively and with the surrounding spaces
 * gone, because an export's headers are written for people.
 */
export function readTable(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const [header, ...body] = tokenise(text);
  if (!header) return { headers: [], rows: [] };

  const headers = header.map((h) => h.trim());
  const rows = body.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((name, index) => {
      row[name.toLowerCase()] = (cells[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/**
 * A number from a cell, or null.
 *
 * Null rather than zero, and that is §4's rule rather than a
 * preference: a column that is not in the file and a column that says
 * 0 are different facts, and only one of them should draw a bar.
 *
 * Thousands separators and a currency symbol are stripped, because
 * Meta writes "1,234" and "£600.00" depending on the column.
 */
export function cellNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const text = raw.replace(/[£$€,\s]/g, "").trim();
  if (text === "" || text === "-") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
