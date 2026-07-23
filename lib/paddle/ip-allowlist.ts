import "server-only";

/**
 * Paddle webhook source-IP allowlist — DEFENCE IN DEPTH, layered ON TOP OF the
 * HMAC signature check, never instead of it. HMAC is the cryptographic gate; this
 * just rejects traffic that doesn't even originate from Paddle before we bother
 * verifying a signature.
 *
 * Paddle publishes its notification IPs:
 *   live:    https://api.paddle.com/ips          (data.ipv4_cidrs)
 *   sandbox: https://sandbox-api.paddle.com/ips  (data.ipv4_cidrs)
 * They change rarely. The values below were fetched 2026-07-24. When Paddle
 * rotates them, either update these constants OR — with no redeploy — set the
 * PADDLE_WEBHOOK_IPS env var (comma-separated CIDRs), which overrides them.
 */
const PADDLE_LIVE_IPS = [
  "34.237.3.244/32",
  "34.195.105.136/32",
  "34.232.58.13/32",
  "35.155.119.135/32",
  "34.212.5.7/32",
  "52.11.166.252/32",
];

const PADDLE_SANDBOX_IPS = [
  "3.208.120.145/32",
  "54.234.237.108/32",
  "34.194.127.46/32",
  "44.241.183.62/32",
  "100.20.172.113/32",
  "44.226.236.210/32",
];

/**
 * Default allows BOTH environments so a live-migration deploy can't reject a
 * still-active sandbox destination mid-transition. After go-live, narrow to
 * live-only by setting PADDLE_WEBHOOK_IPS to just the live CIDRs (optional —
 * HMAC already rejects anything sandbox could send with a live secret).
 */
function allowlist(): string[] {
  const env = process.env.PADDLE_WEBHOOK_IPS;
  if (env && env.trim()) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...PADDLE_LIVE_IPS, ...PADDLE_SANDBOX_IPS];
}

/** IPv4 dotted-quad → unsigned 32-bit int, or null if not valid IPv4. */
function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(m[i]);
    if (octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range ?? "");
  if (ipInt === null || rangeInt === null || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/** The client IP as Vercel's edge reports it (IPv4-mapped IPv6 unwrapped). */
export function clientIp(headers: Headers): string | null {
  const raw =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

/**
 * Should this source IP pass the IP gate?
 *   - in the allowlist            → true
 *   - determinable, not allowed   → false  (the caller rejects with 403)
 *   - null (couldn't determine)   → true   (defer to HMAC — an unforgeable
 *                                            signature already proves it's Paddle;
 *                                            a header quirk must never drop a
 *                                            legitimately-signed delivery)
 */
export function ipAllowed(ip: string | null): boolean {
  if (!ip) return true;
  return allowlist().some((cidr) => inCidr(ip, cidr));
}
