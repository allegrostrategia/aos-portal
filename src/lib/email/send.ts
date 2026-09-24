import "server-only";

/**
 * Sending email from the app.
 *
 * Resend's HTTP API directly rather than their SDK — one fetch, no dependency,
 * and nothing here needs the parts an SDK adds.
 *
 * Note this is a *separate* configuration from the Resend credentials sitting in
 * Supabase's SMTP settings. Those send auth email (invitations, password
 * resets); this sends product email (reminders). Same provider, same verified
 * domain, two places to configure — which is worth knowing when one works and
 * the other doesn't.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? "aOS <noreply@allegrostrategia.com>";
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * What this runtime can actually see, for when "the key is set" and "the app
 * says it isn't" are both true (23 Sep: the cron sent three emails at 08:58
 * and a Server Action four hours later said the key was missing).
 *
 * **Names and lengths only, never a value.** A secret that ends up in a
 * database column or a log is a secret that has leaked, and this text goes
 * into both.
 *
 * Three things it settles at a glance:
 *   · whether *any* secret is visible here, or none — context versus variable
 *   · whether a name near-misses: `RESEND_API_KEY ` with a trailing space, or
 *     a lowercase twin, are invisible in a dashboard and exact here
 *   · how many variables this runtime has at all, which differs sharply
 *     between two deployments of the same code
 */
export function envFingerprint(): string {
  const names = Object.keys(process.env);

  const nearMisses = names
    .filter((name) => /resend/i.test(name) || /^\s|\s$/.test(name))
    .map((name) => JSON.stringify(name));

  const known = ["RESEND_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_SUBJECT", "NEXT_PUBLIC_SITE_URL", "EMAIL_FROM", "VERCEL_ENV", "VERCEL_URL"]
    .map((name) => {
      const value = process.env[name];
      // VERCEL_ENV and VERCEL_URL name the deployment, so those are printed:
      // two projects serving one product is the shape that fits the evidence.
      const show = name === "VERCEL_ENV" || name === "VERCEL_URL";
      return `${name}=${value === undefined ? "absent" : show ? value : `${value.length} chars`}`;
    });

  return `${names.length} vars | ${known.join(" · ")} | resend-ish or padded names: ${nearMisses.join(", ") || "none"}`;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      error:
        "RESEND_API_KEY isn't set on this deployment, so no product email can be sent. " +
        `What this runtime sees: ${envFingerprint()}`,
    };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [to],
        subject,
        text,
        ...(html ? { html } : {}),
      }),
    });

    if (!response.ok) {
      // Resend's error body is JSON, but a gateway failure might not be — so
      // read as text and let the job's last_error carry whatever came back.
      const body = await response.text();
      return { ok: false, error: `Resend ${response.status}: ${body.slice(0, 300)}` };
    }

    const data = (await response.json()) as { id?: string };
    return { ok: true, id: data.id ?? null };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
