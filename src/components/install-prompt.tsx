"use client";

import { useEffect, useState } from "react";

import { installState, type InstallState } from "@/lib/install/state";
import { Card, Eyebrow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * An offer to put aOS on the home screen.
 *
 * Deliberately quiet. It appears once, it can be dismissed, and dismissing it is
 * remembered — a banner that returns every morning on the screen somebody opens
 * daily stops being an offer and becomes a tax.
 *
 * On iOS there is no install API at all: Safari exposes no `beforeinstallprompt`
 * and nothing can trigger the sheet, so the only honest thing to do is show
 * where the button is. That matters beyond tidiness — iOS push notifications
 * only reach a web app that has been added to the home screen, so this is the
 * one route to them ever working on an iPhone.
 */

const DISMISSED_KEY = "aos.install-prompt.dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Private browsing, or storage blocked. Showing it is the safe default.
    return false;
  }
}

export function InstallPrompt() {
  const [state, setState] = useState<InstallState>("none");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari's non-standard property, which is the only signal on iOS.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    const evaluate = (canPrompt: boolean) =>
      setState(
        installState({
          userAgent: navigator.userAgent,
          isStandalone,
          canPrompt,
          dismissed: readDismissed(),
        }),
      );

    evaluate(false);

    // Chrome fires this when it decides the app is installable, which can be
    // after first paint — so the state is re-evaluated rather than decided once.
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      evaluate(true);
    };

    const onInstalled = () => setState("installed");

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Can't remember it; it'll offer again next time. Better than failing.
    }
    setState("none");
  }

  if (state === "none" || state === "installed") return null;

  return (
    <Card className="mt-5 bg-lemon/25">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>On your phone</Eyebrow>
          <p className="mt-1 text-body text-navy">
            Put aOS on your home screen — it opens straight to Piazza, without
            the browser around it.
          </p>

          {state === "ios-guide" ? (
            <p className="mt-2 text-small text-navy/70">
              Tap <strong className="font-medium">Share</strong> at the bottom of
              Safari, then{" "}
              <strong className="font-medium">Add to Home Screen</strong>.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-caption text-navy/50 underline underline-offset-4 transition hover:text-navy"
        >
          Not now
        </button>
      </div>

      {state === "prompt" ? (
        <div className="mt-3">
          <Button
            size="sm"
            onClick={async () => {
              if (!deferred) return;
              await deferred.prompt();
              const { outcome } = await deferred.userChoice;
              // Either way the event is spent — it can only be used once.
              setDeferred(null);
              setState(outcome === "accepted" ? "installed" : "none");
            }}
          >
            Add to home screen
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
