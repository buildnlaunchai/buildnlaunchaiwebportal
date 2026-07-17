import { HUB_TOKEN_QUERY_PARAM } from "@/lib/embed";

/**
 * An embedded app (DESIGN.md §9, "Embedded app"). The tool is a standalone app
 * on a hub subdomain; we hand it a signed token and get out of the way.
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
}: {
  embedUrl: string;
  token: string;
  name: string;
}) {
  // The token rides the URL exactly once. The app verifies it, swaps it into an
  // httpOnly cookie, and redirects to the clean URL — so it lives in the address
  // bar for one request and in history not at all. That handoff is the app's
  // lib/hub/transport.ts contract; the hub's side of it is this line.
  const src = new URL(embedUrl);
  src.searchParams.set(HUB_TOKEN_QUERY_PARAM, token);

  return (
    <div className="flex flex-col gap-3">
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
        className="h-[calc(100vh-260px)] min-h-[520px] w-full overflow-hidden rounded-md border border-line bg-canvas"
      />
      <p className="text-small text-text-muted">
        This one runs as its own app — your work stays in it, so it won&apos;t
        show up in run history.
      </p>
    </div>
  );
}
