/**
 * Library asset naming and file-type rules (§6, §7).
 *
 * Shared by the browser — which picks the file and guesses its format — and the
 * server, which decides where it lands in the bucket. So nothing server-only
 * belongs in here.
 */

export type ContentFormat = "video" | "pdf" | "audio" | "spreadsheet";

/**
 * The extension decides the format, not the MIME type.
 *
 * Browsers disagree about `File.type` for exactly the files Nina uploads most:
 * .m4a arrives as audio/x-m4a, audio/mp4 or an empty string depending on the OS,
 * and .csv is routinely reported as application/vnd.ms-excel. The extension is
 * what the person actually chose, and it's the same on every machine.
 */
export const FORMAT_BY_EXTENSION: Record<string, ContentFormat> = {
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
  mp3: "audio",
  m4a: "audio",
  wav: "audio",
  aac: "audio",
  ogg: "audio",
  pdf: "pdf",
  csv: "spreadsheet",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
};

/** For the file picker's `accept`, so the OS dialog greys out the rest. */
export const UPLOAD_ACCEPT = Object.keys(FORMAT_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(",");

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : "";
}

export function formatForFilename(filename: string): ContentFormat | null {
  return FORMAT_BY_EXTENSION[extensionOf(filename)] ?? null;
}

export function slugify(value: string, maxLength = 80): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

/**
 * Where a file lands in the bucket.
 *
 * Filed under its station, because that's the organising principle everywhere
 * else — a bucket sorted the same way as the library is one Nina can still read
 * directly in Supabase's dashboard a year from now.
 *
 * The random suffix, rather than the title alone: two trainings can legitimately
 * share a name across a re-record, and a colliding path would either fail the
 * upload or quietly overwrite the older file.
 */
export function assetPathFor(
  stationSlug: string,
  filename: string,
  unique: string,
): string {
  const extension = extensionOf(filename);
  const base = slugify(filename.replace(/\.[^.]*$/, ""), 60) || "file";
  return `${stationSlug}/${base}-${unique}.${extension}`;
}

export function prettyBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
