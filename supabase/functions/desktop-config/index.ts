// The desktop-config Edge Function.
//
// The one endpoint in this project that answers with NO AUTHENTICATION AT ALL,
// and that is precisely the point: it is what a desktop install with a broken
// or outdated sign-in calls to be told "you need to update". An endpoint that
// required a session could never answer the question "why can't I sign in" —
// the failure it exists to explain is the failure that would silence it.
//
// WHY verify_jwt = false IS SAFE HERE, AND ONLY HERE-ish. §9.4 is emphatic that
// turning the gateway off puts a function on the open internet, and for
// run-tool that is only tolerable because RUNNER_SECRET is checked on the first
// line. There is no equivalent check in this file and none is needed, because
// there is nothing to protect: this function reads no database, accepts no
// input, holds no secret, and returns a constant that is identical for every
// caller on earth. The worst an attacker can do with it is learn which version
// of a public app we would like people to run.
//
// CHEAP BY CONSTRUCTION. Every install calls this on every launch, so this file
// imports NOTHING — no supabase-js, no crypto, no jose — opens no connection,
// and does no work beyond serialising a constant. Cold start is the runtime and
// this file, and there is no dependency that can be slow or down. Keep it that
// way: the moment this needs a database read, it stops being the thing an app
// can rely on when everything else is broken.

/**
 * The shape the desktop client honours. EVERY FIELD IS OPTIONAL, and the client
 * treats a missing field as "no constraint".
 *
 * Client-side contract, restated here because this file is the other half of it
 * and the two must not drift:
 *   - snake_case or camelCase are both accepted. We send snake_case.
 *   - Unknown fields are ignored, so adding one later is not a breaking change.
 *   - A leading "v" on a version is tolerated ("v0.3.0" == "0.3.0"). We send
 *     bare semver anyway; there is no reason to lean on someone else's leniency.
 *   - Non-2xx, unreachable, or unparseable is treated by the CLIENT as "no
 *     constraint" — it fails OPEN. That is what makes this endpoint safe to
 *     depend on, and also why it must never return a half-built object: a
 *     partial answer is worse than no answer, because no answer is handled.
 */
type DesktopConfig = {
  /** Below this, the client should refuse to run and tell the user to update. */
  minimum_version?: string;
  /** Specific bad builds to block, even at or above minimum_version. */
  killed_versions?: string[];
  /** Newest release, for a non-blocking "update available" nudge. */
  latest_version?: string;
  /** Where to get it. */
  download_url?: string;
  /** What changed. */
  notes_url?: string;
};

/**
 * ===================== THE ONLY THING TO EDIT IN THIS FILE =====================
 *
 * `{}` is a valid, meaningful answer: NO CONSTRAINT. Every install runs, nothing
 * is nudged, nothing is blocked. Shipped this way deliberately, so the endpoint
 * exists and is proven reachable long before it is ever used to stop anybody.
 *
 * This is a KILL SWITCH. Raising the floor here bricks every older install at
 * next launch, and there is no undo for a user who has already been told to
 * update. So it lives in version control rather than in a dashboard field: a
 * change is a diff, reviewable and revertible, and it ships with one command:
 *
 *     supabase functions deploy desktop-config
 *
 * Populated, it would look like this:
 *
 *     const CONFIG: DesktopConfig = {
 *       minimum_version: "0.3.0",
 *       killed_versions: ["0.4.1"],
 *       latest_version: "0.5.0",
 *       download_url: "https://github.com/buildnlaunchai/raw-footage-real-story-releases/releases/latest",
 *       notes_url: "https://github.com/buildnlaunchai/raw-footage-real-story-releases/releases/tag/v0.5.0",
 *     }
 *
 * Before raising minimum_version, check the version spread of live installs.
 * The desktop app now sends X-App-Version on desktop-licence and desktop-keys,
 * so that number is knowable rather than guessable — but nothing records it yet.
 * =============================================================================
 */
const CONFIG: DesktopConfig = {};

// Serialised once at module scope, not per request. The body never varies.
const BODY = JSON.stringify(CONFIG);

const headers = {
  "content-type": "application/json",

  // Cheap AND responsive. 60s of edge caching takes essentially all of the load
  // off the origin for something called on every launch by every install, while
  // keeping the propagation delay on a kill switch to about a minute.
  // stale-while-revalidate is the reliability half: if the origin is briefly
  // unhappy, a cache keeps serving the last good answer instead of forcing the
  // client onto its fail-open path.
  "cache-control": "public, max-age=60, stale-while-revalidate=300",

  // Auth here is nothing at all, so there is no cookie and no CSRF surface for
  // an origin restriction to protect — same reasoning as key-vault, one step
  // further. x-app-version is allowed through so a webview-originated request
  // carrying it does not fail preflight.
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info, x-app-version",
  "access-control-max-age": "86400",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (req.method !== "GET" && req.method !== "HEAD") {
    // The client treats any non-2xx as "no constraint", so this is a safe
    // refusal rather than a failure mode — but say so properly anyway.
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...headers, "cache-control": "no-store" },
    });
  }

  return new Response(BODY, { status: 200, headers });
});
