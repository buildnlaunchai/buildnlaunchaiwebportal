import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ToolIcon } from "@/components/tools/tool-icon";
import { HUB_TOKEN_QUERY_PARAM } from "@/lib/embed";

/**
 * An embedded app (DESIGN.md §9, "Embedded app") — rendered as a FOCUS MODE.
 *
 * An iframe tool is a whole product with its own design and its own signature
 * moment. Framing it inside the dashboard shell made it read as "a video playing
 * inside another platform", so the hub now gets out of the way completely: the
 * app takes the entire viewport, and the only hub chrome left is one slim glass
 * bar — the way back to Apps, the tool's identity, and the one line of truth
 * about where the work lives. Same product, lowest possible volume.
 *
 * A server component on purpose. The token belongs in the src the server
 * renders, not in a client component's props — a client component would ship it
 * into the RSC payload as a serialized prop, which is a second copy of a
 * credential in a place nobody thinks to look.
 */
export function ToolEmbed({
  embedUrl,
  token,
  name,
  slug,
  icon,
}: {
  embedUrl: string;
  token: string;
  name: string;
  slug: string;
  icon: string | null;
}) {
  // The token rides the URL exactly once. The app verifies it, swaps it into an
  // httpOnly cookie, and redirects to the clean URL — so it lives in the address
  // bar for one request and in history not at all. That handoff is the app's
  // lib/hub/transport.ts contract; the hub's side of it is this line.
  const src = new URL(embedUrl);
  src.searchParams.set(HUB_TOKEN_QUERY_PARAM, token);

  return (
    // z-40: above the shell's sidebar (z-30) and mobile nav (z-30), below the
    // command palette (z-50). fade-enter: arrives, doesn't pop.
    <div className="fade-enter fixed inset-0 z-40 flex flex-col bg-canvas">
      {/* The one piece of hub chrome: a slim glass bar, same material as the
          shell's top bar. Left: the way out. Middle: which app this is. */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-[var(--glass)] px-3 backdrop-blur-[14px] sm:px-4">
        <Link
          href="/dashboard"
          className="flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-line bg-surface/70 px-3 text-small text-text-muted transition-colors duration-micro ease-default hover:border-line-strong hover:text-text"
        >
          <ArrowLeft aria-hidden className="size-4" strokeWidth={1.6} />
          Apps
        </Link>
        <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] border border-line bg-elevated text-text-muted [border-top-color:var(--line-strong)]">
          <ToolIcon name={icon} className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-display text-[14px] font-semibold leading-tight text-text">
            {name}
          </div>
          <div className="text-mono-chip truncate text-text-faint">{slug}</div>
        </div>
        {/* Where the work lives — stated once, quietly, where it's true. */}
        <p className="ml-auto hidden shrink-0 text-small text-text-faint md:block">
          Your work stays in this app — it won&apos;t show in run history.
        </p>
      </header>

      <iframe
        src={src.toString()}
        title={name}
        // allow-same-origin is REQUIRED, not permissive. Without it the frame
        // gets an opaque origin, which means no cookies and no storage — the
        // app could never keep the token we just gave it, and every navigation
        // inside it would land back on its locked screen.
        //
        // allow-same-origin + allow-scripts together do let a frame reach out
        // and remove its own sandbox attribute. That is a real caveat and it is
        // accepted here with eyes open: this is first-party code we wrote,
        // served from our own subdomain. The sandbox is defence in depth against
        // the app doing something silly, not a containment boundary for hostile
        // code — if we ever embed someone else's app, it does not get
        // allow-same-origin and it does not get a token.
        //
        // allow-downloads: the animator's whole point is exporting a video.
        // allow-forms: any real app has one eventually; costs nothing here.
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
        // Permissions policy: the apps copy share links (clipboard-write) and
        // may go fullscreen for video review. Granted to the frame explicitly —
        // without this, clipboard calls inside the iframe fail silently.
        allow="clipboard-read; clipboard-write; fullscreen"
        // No loading spinner over the frame (§9): the app renders its own
        // loading state, and two products saying "wait" at once is one too many.
        className="w-full flex-1 bg-canvas"
      />
    </div>
  );
}
