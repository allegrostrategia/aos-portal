"use client";

import { useEffect, useState } from "react";

import { removePushSubscription, savePushSubscription } from "@/lib/push/actions";
import { Button } from "@/components/ui/button";

/**
 * "Turn on notifications on this device" (round 2 brief, F).
 *
 * Everything that can only happen from a tap happens here: registering the
 * service worker, asking for permission, subscribing with the public VAPID
 * key, and handing the subscription to the server.
 *
 * Two things this can't paper over, and says instead:
 *
 *  · On an iPhone, push only works from the home-screen app, not Safari. If
 *    the page isn't running standalone, the button explains rather than
 *    asking for a permission that can't be granted.
 *  · Permission is a one-shot. Once denied, a browser won't ask again, and
 *    the only way back is the device's own settings. So the button never
 *    asks until it's tapped, and if permission is already denied it says so
 *    and stops.
 */
type State = "unsupported" | "needs-install" | "denied" | "off" | "on" | "busy";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle() {
  const [state, setState] = useState<State>("busy");
  const [error, setError] = useState<string | null>(null);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      if (iOS && !standalone) {
        setState("needs-install");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setError(null);
    if (!publicKey) {
      setError("Notifications aren't set up on this deployment yet.");
      return;
    }
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      const result = await savePushSubscription({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        userAgent: navigator.userAgent,
      });
      if (!result.ok) {
        setError(result.message);
        setState("off");
        return;
      }
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setState("on");
    }
  }

  const copy: Record<State, string> = {
    unsupported: "This browser can't show notifications.",
    "needs-install": "On an iPhone, add aOS to your home screen first (Share, then Add to Home Screen), then turn notifications on from there.",
    denied: "Notifications are blocked for aOS in this browser. Turn them back on in your device's settings, then come back here.",
    off: "Get a notification on this device when somebody messages you.",
    on: "This device gets notified. Turn off here, or in your device's settings.",
    busy: "One moment…",
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-ink/70">{copy[state]}</p>
      {state === "off" ? (
        <Button type="button" size="sm" onClick={() => void enable()} className="self-start">
          Turn on notifications on this device
        </Button>
      ) : state === "on" ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => void disable()} className="self-start">
          Turn off on this device
        </Button>
      ) : null}
      {error ? <p className="text-caption text-deep-red">{error}</p> : null}
    </div>
  );
}
