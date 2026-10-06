"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import {
  saveBenchmarkReply,
  type BenchmarkState,
} from "@/lib/reporting/benchmark-actions";

/**
 * The benchmark round trip (§7).
 *
 * A prompt built from the client's own setup answers, taken away, asked
 * of whoever they ask, and the reply pasted back. **aOS works nothing
 * out** — it reads what came back and says plainly which lines it could
 * not read, so nobody has to work out which of thirteen were missed.
 */

export function BenchmarksForm({
  workspaceId,
  prompt,
  setAt,
  unmatched,
}: {
  workspaceId: string;
  prompt: string | null;
  setAt: string | null;
  unmatched: string[];
}) {
  const [state, action] = useActionState<BenchmarkState, FormData>(
    saveBenchmarkReply,
    null,
  );

  const stillUnmatched = state?.unmatched ?? unmatched;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <SectionTitle aside={setAt ? `Last set ${new Date(setAt).toLocaleDateString("en-GB")}` : "Never set"}>
          Ask for the benchmarks
        </SectionTitle>
        {prompt ? (
          <>
            <p className="mb-3 text-body text-ink/70">
              Copy this, ask it, and paste the reply below. Nothing here works a
              benchmark out on its own.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-cream-deep p-4 text-small whitespace-pre-wrap text-ink/80">
              {prompt}
            </pre>
          </>
        ) : (
          <p className="text-body text-ink/70">
            This client&rsquo;s setup answers — what the business does, its main
            offers, and the country — are not filled in yet, so there is no prompt
            to ask. Add them on the client&rsquo;s details first.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle>Paste the reply</SectionTitle>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <label htmlFor="benchmark-reply" className="sr-only">
            The reply, pasted
          </label>
          <textarea
            id="benchmark-reply"
            name="reply"
            rows={10}
            placeholder={"Opt-in rate: 35%\nOpen rate: 42%\nCost per lead: £4.50"}
            className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none transition placeholder:text-ink/40 focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
          />
          <Footer state={state} />
        </form>
      </Card>

      {stillUnmatched.length > 0 ? (
        <Card>
          <SectionTitle aside={`${stillUnmatched.length} not read`}>
            Lines that could not be read
          </SectionTitle>
          <p className="mb-3 text-body text-ink/70">
            Each line needs to name one of the figures this tool knows and carry one
            number. A range — &ldquo;between 30 and 40%&rdquo; — is two numbers and a
            judgement, so it is left for a person.
          </p>
          <ul className="flex flex-col gap-2">
            {stillUnmatched.map((line) => (
              <li key={line} className="rounded-xl bg-cream-deep px-3.5 py-2.5 text-small text-ink/80">
                {line}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Footer({ state }: { state: BenchmarkState }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {pending ? "Reading…" : (state?.error ?? state?.notice ?? "")}
      </p>
      <Button type="submit" disabled={pending}>
        Read the reply
      </Button>
    </div>
  );
}
