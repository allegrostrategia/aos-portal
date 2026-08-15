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
        "RESEND_API_KEY isn't set on this deployment, so no product email can be sent.",
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
