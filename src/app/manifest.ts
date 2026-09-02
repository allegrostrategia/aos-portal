import type { MetadataRoute } from "next";

/**
 * The web app manifest — what makes aOS installable to a phone's home screen.
 *
 * Worth having on its own terms: members reach for this daily, and a portal
 * behind a browser chrome with tabs and an address bar reads as a website you
 * visit rather than the place you work. It is also the prerequisite for iOS push
 * notifications, which only reach a web app added to the home screen — so this
 * is the groundwork for that, done separately and testable on its own.
 *
 * `start_url` is "/" rather than /piazza deliberately: the root already decides
 * where somebody belongs — login, no-access, or Piazza — so the installed app
 * gets the same routing as any other entry point rather than a second copy of
 * that decision that could drift.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "aOS — Allegro Strategia",
    short_name: "aOS",
    description:
      "Every month, one real thing costing you time or money gets built live, based on your real data.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Off-white ground and brand navy — matching globals.css rather than being
    // picked again here, so the splash screen isn't a colour nothing else uses.
    background_color: "#F3F5FD",
    theme_color: "#073C8C",
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        // Deliberately not "maskable": Android crops maskable icons to a circle
        // or squircle, and this mark has no safe-zone padding designed for that.
        // Declaring it would get the lettering clipped. A purpose-built maskable
        // variant with wider margins could be added later.
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
