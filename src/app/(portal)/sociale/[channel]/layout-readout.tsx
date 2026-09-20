"use client";

import { useEffect, useState } from "react";

/**
 * On-device layout numbers, for when a phone disagrees with every render.
 *
 * Rendered only with `?debug=1`. Reports the three heights a fixed bar and a
 * pinned shell can disagree about — the window, the visual viewport and the
 * root element — plus where the bar, the shell and the room's card actually
 * landed, the safe-area insets as the device resolves them, and whether the
 * page is running standalone. Reads again on resize and scroll, so the
 * keyboard's effect shows too.
 */
export function LayoutReadout() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;

    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;" +
      "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
    document.body.appendChild(probe);

    const rect = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return "none";
      const r = el.getBoundingClientRect();
      return `${Math.round(r.top)}→${Math.round(r.bottom)} (h${Math.round(r.height)})`;
    };

    const read = () => {
      const cs = getComputedStyle(probe);
      setLines([
        `standalone ${window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true}`,
        `innerHeight ${window.innerHeight} · visualViewport ${Math.round(window.visualViewport?.height ?? -1)} · vv.offsetTop ${Math.round(window.visualViewport?.offsetTop ?? -1)}`,
        `html.clientHeight ${document.documentElement.clientHeight} · body ${document.body.clientHeight} · scrollY ${Math.round(window.scrollY)} · docScrollH ${document.documentElement.scrollHeight}`,
        `safe-area top ${cs.paddingTop} · bottom ${cs.paddingBottom}`,
        `shell ${rect(".portal-shell")}`,
        `content ${rect(".portal-content")}`,
        `main ${rect("main[data-chat-screen]")}`,
        `bar ${rect('[class*="fixed"][class*="bottom-0"]')}`,
        `composer ${rect("textarea")}`,
      ]);
    };

    read();
    window.addEventListener("resize", read);
    window.addEventListener("scroll", read, { passive: true });
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("scroll", read);
      window.visualViewport?.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("scroll", read);
      probe.remove();
    };
  }, []);

  if (lines.length === 0) return null;

  return (
    <pre
      className="fixed top-14 left-2 z-50 max-w-[95vw] rounded-md bg-ink/85 p-2 font-mono text-[10px] leading-tight whitespace-pre-wrap text-cream"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
    >
      {lines.join("\n")}
    </pre>
  );
}
