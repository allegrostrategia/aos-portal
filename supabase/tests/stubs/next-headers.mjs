/** Stands in for `next/headers`: no request, so no origin, and the action falls back to NEXT_PUBLIC_SITE_URL. */
export async function headers() {
  return new Headers();
}
