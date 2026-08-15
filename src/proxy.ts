import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/**
 * Runs before every page request (Next 16's replacement for `middleware.ts`).
 *
 * Two jobs:
 *
 * 1. Refresh the Supabase session and write the rotated auth cookies onto the
 *    response. Server Components can't set cookies, so without this a member
 *    silently logs out when their token expires.
 *
 * 2. Keep signed-out visitors out of the portal, and signed-in members out of the
 *    login screen.
 *
 * This check is deliberately OPTIMISTIC — session presence only, no database
 * lookup. The proxy runs on every request including prefetches, so querying
 * `members` here would put a round trip behind every hovered link. Whether a
 * member is cancelled, onboarding or active is decided in the portal layout via
 * requireMember(). This is a filter; that's the gate.
 */

/**
 * Reachable with no session at all.
 *
 * `/api` is here because route handlers authenticate themselves — the cron
 * endpoint checks CRON_SECRET, for instance — and because redirecting a
 * non-browser client to an HTML login page is the wrong answer anyway: it wants
 * a 401, not a 307 to a form it can't fill in. Anything added under /api must do
 * its own auth; the proxy will not do it for you.
 */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth", "/api"];

/**
 * Needs a session but NOT a member record: an invited member setting their first
 * password has no `members` row yet, and /no-access exists to explain exactly
 * that situation.
 */
const SESSION_ONLY_PATHS = ["/set-password", "/no-access"];

function matches(pathname: string, paths: string[]): boolean {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function proxy(request: NextRequest) {
  // Lets `npm run dev` work before the Supabase credentials are pasted in.
  if (!env.isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        // No-cache headers, so Vercel's edge never serves one member's
        // refreshed session cookie to somebody else.
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // Must be awaited before the response is returned, or a refresh that lands
  // late can't write its cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = matches(pathname, PUBLIC_PATHS);

  if (!user && !isPublic && !matches(pathname, SESSION_ONLY_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Send them back where they were headed once they're in — but only ever to
    // an internal path; the login action re-validates this before using it.
    if (pathname !== "/") {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  // A signed-in member landing on the login screen is almost always a stale tab
  // or a bookmark. /auth/* is excluded — those routes complete a sign-in.
  if (user && (pathname === "/login" || pathname === "/forgot-password")) {
    const url = request.nextUrl.clone();
    url.pathname = "/piazza";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets — otherwise this runs
     * against every image and stylesheet for no reason.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
