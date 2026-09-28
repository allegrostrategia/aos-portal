import {
  deploymentLabel,
  deploymentOf,
  shouldWarnAboutDeployment,
} from "@/lib/deployment";

/**
 * "You are not on the live app."
 *
 * In the document flow rather than fixed, deliberately: the fixed bottom bar
 * and the pinned chat room took four attempts to agree about the viewport on
 * an installed iOS app, and a second fixed element would be a fifth. This
 * pushes the page down by one line, which on a preview is the correct amount
 * of rude.
 *
 * Server-rendered from `VERCEL_ENV`, so there is nothing to get out of step
 * and no client bundle. Hidden on print, like the rest of the chrome.
 */
export function DeploymentBanner() {
  const deployment = deploymentOf(process.env.VERCEL_ENV);
  if (!shouldWarnAboutDeployment(deployment)) return null;

  return (
    <p
      role="status"
      className="w-full min-w-0 shrink-0 bg-deep-red px-4 py-1.5 text-center text-caption font-medium break-words text-white print:hidden"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.375rem)" }}
    >
      {deploymentLabel(deployment, process.env.VERCEL_URL)}
    </p>
  );
}
