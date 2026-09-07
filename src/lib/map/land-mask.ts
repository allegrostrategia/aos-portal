/**
 * Where the water is on the La Strada artwork. Generated — do not hand-edit.
 *
 *     node scripts/build-map-mask.mjs
 *
 * One character per 32px cell of `la-strada-map.png`: `~` sea, `#` land.
 * Squint and the shape of the town is visible in it, which is the point — this
 * is the ground truth a marker position gets checked against, so it should be
 * possible to see that it is right.
 *
 * See the generator for why this is a committed mask rather than a colour test
 * run at test time. Short version: shadowed asphalt and dark water are the same
 * colour, and only connectivity to the picture's edge tells them apart.
 */

/** The artwork this was generated from. A different picture must regenerate. */
export const ARTWORK_SHA256 = "fdd4c7b554b29fdc33a983a8abdbf53cfe9f621ef216155c4d4bdc1fcfbce53c";

export const MASK_CELL = 32;

export const LAND_MASK: readonly string[] = [
  "~~~~~~~~~~##################################~~##",
  "~~~~~~~~~###################################~~~~",
  "~~~~~~~~~####################################~~~",
  "~~~~~~~~~~###################################~~~",
  "~~~~~~~~~####################################~~~",
  "~~~~####~####################################~~~",
  "~~~#####~#####################################~~",
  "~~~~~~~#~#~##################################~~#",
  "~~~~##~~~~~~################################~~~~",
  "~~~~~~~~~~###################################~~~",
  "~~~~~##~~###################################~~~~",
  "~~~~~~#~#####################################~~~",
  "~~~~~########################################~~~",
  "~~~~###########################################~",
  "~~~~##########################################~~",
  "~~~~~#########################################~~",
  "~~~#~~~########################################~",
  "~~~###~##~##################################~~~~",
  "~~~~###~~~~~################################~~~~",
  "~~~~~~~#~~~#~~##############################~~~~",
  "~#~~~#~~~##~~#~#########################~#~~#~~~",
  "~~~##~~~~###~~~~#####################~~~~~~~~~~~",
  "~~~#~~~~####~~~######################~~~~~~~~~~~",
  "~~~~~~####~~~~~#######################~~~~~~~~~~",
  "~~#######~~~~~~#######################~~~~~~~~~~",
  "~######~~~~##~~########################~~~~~~~~~",
  "######~~~~~~~~~~#########################~~~~~~~",
];

/** True when this point on the artwork (in percent) is open water. */
export function isSea(x: number, y: number, width = 1536, height = 864): boolean {
  const row = LAND_MASK[Math.min(LAND_MASK.length - 1, Math.max(0, Math.floor((y / 100) * height / MASK_CELL)))];
  const col = Math.min(row.length - 1, Math.max(0, Math.floor((x / 100) * width / MASK_CELL)));
  return row[col] === "~";
}

/** How much of an axis-aligned box on the artwork is open water, 0–1. */
export function seaFraction(x: number, y: number, w: number, h: number): number {
  let total = 0;
  let wet = 0;
  for (let dy = -h / 2; dy <= h / 2; dy += 0.5) {
    for (let dx = -w / 2; dx <= w / 2; dx += 0.5) {
      total++;
      if (isSea(x + dx, y + dy)) wet++;
    }
  }
  return total === 0 ? 0 : wet / total;
}
