"use client";

import Script from "next/script";
import { useEffect, useId, useRef, useState } from "react";

/* Cloudflare Turnstile widget (CLAUDE.md §13). Renders explicitly via the API
   so the token flows through a React callback rather than a global. The server
   re-verifies the token on submit — this widget is the challenge, not the
   check. */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const domId = useId();

  useEffect(() => {
    if (!ready || !siteKey || !ref.current || !window.turnstile) return;
    if (widgetId.current) return; // render once

    widgetId.current = window.turnstile.render(ref.current, {
      sitekey: siteKey,
      theme: "auto",
      callback: onToken,
      // A token expires (~5 min). Clear it so a stale token isn't submitted.
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });

    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [ready, siteKey, onToken]);

  // No site key configured (local dev). Render nothing; the server fails open in
  // dev, so the form still works. The honeypot and rate limit still apply.
  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onLoad={() => setReady(true)}
      />
      <div ref={ref} id={domId} className="min-h-[65px]" />
    </>
  );
}
