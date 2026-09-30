"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import {
  assignReportTeamMember,
  inviteReportClient,
  type ReportInviteState,
} from "@/lib/admin/report-users";

export function NewClientForm() {
  const [state, action] = useActionState<ReportInviteState, FormData>(
    inviteReportClient,
    null,
  );

  // Which kind is selected decides whether the end-date field exists at all.
  // The first version showed it always, labelled "Chiarezza only", and the
  // action then refused any submission that had something in it — which on
  // 30 September left Dom on a form he could not get past, with an error
  // about a field he had not meant to fill. A field that does not apply is
  // not rendered; the same rule §13 sets for the client switcher.
  const [kind, setKind] = useState<"retainer" | "chiarezza">("retainer");

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" name="business_name" required />
        <Field label="Contact name" name="display_name" required />
        <Field label="Email address" name="email" type="email" required />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kind" className="text-small font-medium text-ink">
            Kind
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as "retainer" | "chiarezza")
            }
            className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
          >
            <option value="retainer">Retainer client</option>
            <option value="chiarezza">Chiarezza attendee</option>
          </select>
        </div>
        <Field
          label="First month with figures"
          name="first_month"
          type="month"
          required
          hint="The earliest month you will enter data for."
        />
        {kind === "chiarezza" ? (
          <Field
            label="Access ends"
            name="access_end_date"
            type="month"
            required
            hint="Their login stops working after this month. Their data is kept."
          />
        ) : null}
      </div>

      <Footer state={state} label="Send invitation" />
    </form>
  );
}

export function AssignTeamForm({ workspaceId }: { workspaceId: string }) {
  const [state, action] = useActionState<ReportInviteState, FormData>(
    assignReportTeamMember,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Their name" name="display_name" required />
        <Field label="Their email address" name="email" type="email" required />
      </div>
      <p className="text-caption text-ink/55">
        They can enter and edit this client&rsquo;s figures and write notes. They
        cannot publish, and they will not see any other client.
      </p>
      <Footer state={state} label="Give them access" />
    </form>
  );
}

function Footer({ state, label }: { state: ReportInviteState; label: string }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/65"}`}
      >
        {pending ? "Working…" : (state?.error ?? state?.notice ?? "")}
      </p>
      <Button type="submit" variant="primary" disabled={pending}>
        {label}
      </Button>
    </div>
  );
}
