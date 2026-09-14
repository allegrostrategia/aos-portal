/*
 * aOS service worker: push notifications only.
 *
 * Deliberately no caching, no offline, no fetch handler. A service worker
 * that caches pages is a service worker that serves stale pages, and the one
 * thing this file must not do is make the app harder to update. It receives
 * a push, shows it, and opens the right conversation when tapped.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "aOS", body: "", url: "/piazza", tag: undefined };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // A push with no readable body still deserves a notification.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: payload.tag,
      // Replace an earlier notification for the same room rather than stack.
      renotify: Boolean(payload.tag),
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/piazza";
  const target = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab if there is one; otherwise open a new one.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
