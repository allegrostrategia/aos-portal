/**
 * Headshot files.
 *
 * Shared by the browser (which picks and resizes) and the server (which decides
 * the path and checks it), so nothing server-only belongs here.
 */

export const HEADSHOT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * What the file picker offers.
 *
 * HEIC is included because that is what an iPhone produces by default, and a
 * member whose only photo of themselves is greyed out in the picker will not go
 * and convert it — they'll skip the step. Safari can decode it for the resize
 * below; where it can't, the original uploads and the browser that displays it
 * decides.
 */
export const HEADSHOT_ACCEPT = "image/*";

/** Longest edge after resizing. A directory card renders it at 56px. */
export const HEADSHOT_MAX_EDGE = 800;

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : "";
}

export function isHeadshotFile(filename: string): boolean {
  return extensionOf(filename) in HEADSHOT_TYPES;
}

/**
 * Where a headshot lives.
 *
 * The first path segment must be the member's own id — that is exactly what the
 * storage policy checks, and the server checks it again before the path is
 * written into a row other members read.
 */
export function headshotPathFor(
  memberId: string,
  filename: string,
  unique: string,
): string {
  const extension = extensionOf(filename) || "jpg";
  return `${memberId}/${unique}.${extension}`;
}

export function ownsHeadshotPath(memberId: string, path: string): boolean {
  return path.startsWith(`${memberId}/`);
}
