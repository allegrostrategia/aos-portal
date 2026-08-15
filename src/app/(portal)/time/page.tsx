import { redirect } from "next/navigation";

/**
 * The daily view and the weekly check-in were the same screen doing one job
 * twice, so they merged into /log — one submission, three jobs (§4). This
 * redirect keeps any bookmark from the few days /time existed working.
 */
export default function TimeRedirect() {
  redirect("/log");
}
