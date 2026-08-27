// Where the gateway sends provider traffic.
//
// The real hosts, unless an override names an address that cannot leave this
// machine — which is how the routes get tested against a fake provider without
// spending money.
//
// WHY THE ALLOW-LIST IS THE WHOLE GUARD, AND WHY IT IS ENOUGH.
//
// This function holds our provider keys and attaches them to whatever URL these
// helpers return, so a plain `Deno.env.get("OPENAI_BASE_URL") ?? REAL` would be
// a credential-exfiltration primitive built out of a testing convenience: one
// mistyped production secret and live keys go to a host of someone else's
// choosing.
//
// The defence is that an override may only name a LOOPBACK OR DOCKER-INTERNAL
// address. None of those route anywhere. Set one in production and the gateway
// simply fails to connect — the route releases its hold and answers
// provider_unreachable. There is no value an attacker can put here that reaches
// them.
//
// An earlier version also required SUPABASE_URL to look like localhost, on the
// theory that belt and braces cost nothing. They cost something: inside the Edge
// runtime container SUPABASE_URL is the internal gateway host, never a loopback
// address, so that check was false EVERYWHERE — including local — and the
// override was silently ignored while the tests quietly called the real OpenAI
// with a fake key. A guard that never fires is not a guard; it is a bug with
// good intentions.

const OPENAI_REAL = "https://api.openai.com";
const ELEVENLABS_REAL = "https://api.elevenlabs.io";

/** Addresses that cannot leave the machine this function runs on. */
const LOCAL_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  // WITH THE BRACKETS. `new URL("http://[::1]:8799").hostname` is "[::1]", not
  // "::1" — so the bare spelling this list used to carry matched nothing and
  // v6 loopback silently fell through to the real provider. Safe, but it is
  // exactly the surprise this file is meant to prevent: a developer who points
  // the override at [::1], sees no error, and is calling real OpenAI on our
  // real key. Caught by upstream.test.ts, which is why that file exists.
  "[::1]",
  // The Edge runtime runs in a container, where 127.0.0.1 is the container
  // itself. A fake provider on the developer's own machine is reachable only by
  // this name, and it resolves to nothing outside Docker.
  "host.docker.internal",
]);

function base(envName: string, real: string): string {
  const override = Deno.env.get(envName);
  if (!override) return real;

  try {
    const u = new URL(override);
    if (LOCAL_HOSTS.has(u.hostname)) {
      console.warn(`ai-gateway: using LOCAL upstream override for ${envName}`);
      return override.replace(/\/+$/, "");
    }
    // Set, but not to a local address. Loud, because it means somebody tried:
    // either a misconfiguration worth fixing or an attempt worth seeing.
    console.error(
      `ai-gateway: ${envName} names a non-local host and was IGNORED. ` +
        `Provider traffic continues to ${real}.`,
    );
  } catch {
    console.error(`ai-gateway: ${envName} is not a valid URL and was ignored.`);
  }
  return real;
}

export function openAiBase(): string {
  return base("OPENAI_BASE_URL", OPENAI_REAL);
}

export function elevenLabsBase(): string {
  return base("ELEVENLABS_BASE_URL", ELEVENLABS_REAL);
}
