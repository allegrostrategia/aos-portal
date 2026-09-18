import { redirect } from "next/navigation";

/**
 * The separate roadmap editor is gone (La Strada brief, 18 Sep 2026): Nina
 * edits on the same page the member sees, with the toggle on Edit. Old links
 * land there.
 */
export default async function AdminRoadmapsPage({
  searchParams,
}: PageProps<"/admin/roadmaps">) {
  const params = await searchParams;
  const member = typeof params.member === "string" ? `&member=${params.member}` : "";
  redirect(`/roadmap?edit=1${member}`);
}
