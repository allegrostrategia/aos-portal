"use client";

import { useActionState } from "react";

import {
  activateMember,
  cancelMember,
  rejoinMember,
  type MemberActionState,
} from "@/lib/admin/member-actions";
import type { MemberStatus } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";

/**
 * The lifecycle controls.
 *
 * Only the move that's actually valid from the current status is offered —
 * the database refuses the others anyway, and showing a button that always
 * errors is a worse way to learn that.
 */
export function StatusActions({
  memberId,
  memberName,
  status,
}: {
  memberId: string;
  memberName: string;
  status: MemberStatus;
}) {
  const [activateState, activate] = useActionState<MemberActionState, FormData>(
    activateMember,
    null,
  );
  const [cancelState, cancel] = useActionState<MemberActionState, FormData>(
    cancelMember,
    null,
  );
  const [rejoinState, rejoin] = useActionState<MemberActionState, FormData>(
    rejoinMember,
    null,
  );

  const state = activateState ?? cancelState ?? rejoinState;

  return (
    <Card>
      <Eyebrow>Membership</Eyebrow>

      <div className="mt-3 flex flex-col gap-4">
        {status === "onboarding" ? (
          <form action={activate} className="flex flex-col gap-2">
            <input type="hidden" name="member_id" value={memberId} />
            <p className="text-small text-navy/70">
              Activating opens the full library, hot seat, peer pairing and the
              draw. Done at week 1 of the month after they joined.
            </p>
            <Button type="submit" size="sm" className="self-start">
              Activate {memberName}
            </Button>
          </form>
        ) : null}

        {status === "cancelled" ? (
          <form action={rejoin} className="flex flex-col gap-2">
            <input type="hidden" name="member_id" value={memberId} />
            <p className="text-small text-navy/70">
              Rejoining puts them back into onboarding from scratch — fresh
              audit, fresh roadmap, fresh six-month term. Their previous work
              stays theirs.
            </p>
            <Button type="submit" size="sm" className="self-start">
              Reinstate {memberName} into onboarding
            </Button>
          </form>
        ) : (
          <form action={cancel} className="flex flex-col gap-2 border-t border-navy/10 pt-4">
            <input type="hidden" name="member_id" value={memberId} />
            <label htmlFor="cancel_note" className="text-small font-medium text-navy">
              Cancel {memberName}&rsquo;s membership
            </label>
            <p className="text-small text-navy/70">
              Revokes access. Nothing is deleted — their logs, roadmap and
              Archivio all stay exactly where they are.
            </p>
            <input
              id="cancel_note"
              name="note"
              type="text"
              placeholder="Why, if it's worth recording (optional)"
              className="w-full rounded-md border border-navy/15 bg-white px-3 py-2 text-small text-navy placeholder:text-navy/40"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="self-start"
            >
              Cancel {memberName}&rsquo;s membership
            </Button>
          </form>
        )}

        <FormMessage error={state?.error} notice={state?.notice} />
      </div>
    </Card>
  );
}
