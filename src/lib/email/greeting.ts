/**
 * "{First name}," — the one line every email in aOS opens with.
 *
 * Nina's wording of 3 November writes the greeting as `{First name}`, and
 * the two client emails were not doing that: a retainer client's name
 * comes from `report_access.display_name`, which is whatever was typed
 * when their login was created, and that is usually a full name. So they
 * were being greeted "Bella Fawkes," where a member gets "Ruth,".
 *
 * The reduction lives here rather than at the call sites so there is one
 * rule and one fallback. **The fallback is "Hello,"** — the same as
 * before, and it is reached when the name is missing or blank rather than
 * sending a bare comma. Nobody has ever had a blank one, because the
 * admin form requires a name; it is a fallback for a row, not for a
 * person.
 *
 * The first word, not everything before the last: "Mary Jane Watson" is
 * greeted "Mary", and somebody who goes by both names is a thing to fix
 * in their display name rather than by guessing here.
 */
export function greeting(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? `${first},` : "Hello,";
}
