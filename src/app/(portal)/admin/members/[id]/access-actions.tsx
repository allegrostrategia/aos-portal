"use client";

import { useActionState } from "react";

import {
  sendResetLink,
  setTemporaryPassword,
  type AccessState,
} from "@/lib/admin/access-actions";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";

/**
 * Getting a member back in. Two buttons, one for each situation — a link to
 * their inbox, or a password to pass on — and the temporary password shown
 * once, large and copyable, where Nina is looking.
 */
export function AccessActions({
  memberId,
  memberName,
  email,
}: {
  memberId: string;
  memberName: string;
  email: string;
}) {
  const [linkState, sendLink] = useActionState<AccessState, FormData>(sendResetLink, null);
  const [passwordState, setPassword] = useActionState<AccessState, FormData>(
    setTemporaryPassword,
    null,
  );

  return (
    <Card>
      <Eyebrow>Access</Eyebrow>
      <p className="mt-1 text-small text-ink/70">
        If {memberName} can&rsquo;t get in.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <form action={sendLink} className="flex flex-col gap-2">
          <input type="hidden" name="member_id" value={memberId} />
          <p className="text-small text-ink/70">
            Emails a reset link to {email}. The usual route: nothing for you to
            hand over.
          </p>
          <Button type="submit" size="sm" variant="secondary" className="self-start">
            Send a reset link
          </Button>
          <FormMessage error={linkState?.error} notice={linkState?.notice} />
        </form>

        <form action={setPassword} className="flex flex-col gap-2 border-t border-ink/10 pt-4">
          <input type="hidden" name="member_id" value={memberId} />
          <p className="text-small text-ink/70">
            Sets a temporary password and shows it here, once. For when the
            email route won&rsquo;t work: a dead inbox, or a test account.
          </p>
          <Button type="submit" size="sm" variant="secondary" className="self-start">
            Set a temporary password
          </Button>
          <FormMessage error={passwordState?.error} notice={passwordState?.notice} />
          {passwordState?.password ? (
            <p className="mt-1">
              <code className="inline-block select-all rounded-lg bg-cream-deep px-3 py-2 font-mono text-heading tracking-wide text-ink">
                {passwordState.password}
              </code>
            </p>
          ) : null}
        </form>
      </div>
    </Card>
  );
}
