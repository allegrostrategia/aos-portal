import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/auth/member";

/**
 * aOS is members-only — there is no public marketing page here, that's
 * allegrostrategia.com. The root just points people at the right door.
 */
export default async function RootPage() {
  const member = await getCurrentMember();

  if (!member) redirect("/login");
  if (member.status === "cancelled") redirect("/no-access");

  redirect("/piazza");
}
