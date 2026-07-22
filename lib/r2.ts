import "server-only";

import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (S3-compatible) upload for PUBLIC assets — right now, tool cover
 * thumbnails. Kept deliberately small: sign a PUT with the R2 API credentials
 * and hand back the public URL.
 *
 * On the credentials, so this never gets confused with §13/§14: R2 API keys are
 * ordinary server-side secrets and MAY live in Vercel env. They only grant write
 * to a bucket of PUBLIC images; they cannot touch a member's API key, cannot
 * decrypt anything, and are read only inside this server-only module. This is
 * nothing like ENCRYPTION_KEY, which stays out of Vercel forever.
 *
 * Required env (server-side, no NEXT_PUBLIC_):
 *   R2_ACCOUNT_ID          — Cloudflare account id (forms the S3 endpoint host)
 *   R2_ACCESS_KEY_ID       — R2 API token access key id
 *   R2_SECRET_ACCESS_KEY   — R2 API token secret
 *   R2_BUCKET              — bucket name
 *   R2_PUBLIC_BASE_URL     — the bucket's public base URL (r2.dev or a custom
 *                            domain), e.g. https://pub-xxxx.r2.dev  (no trailing /)
 */

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

/** Whether the R2 env is fully set — so callers can fail with a clear message. */
export function isR2Configured(): boolean {
  return r2Config() !== null;
}

/**
 * Upload bytes to R2 at `key` and return the object's public URL. Throws on a
 * non-2xx response or missing config; the caller turns that into a user message.
 */
export async function uploadToR2(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const cfg = r2Config();
  if (!cfg) throw new Error("R2 is not configured.");

  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });

  // R2's S3 API, path-style: https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key}`;
  const res = await client.fetch(endpoint, {
    method: "PUT",
    body,
    headers: { "content-type": contentType },
  });
  if (!res.ok) {
    // R2/S3 return an XML error body (e.g. <Code>SignatureDoesNotMatch</Code>).
    // Include it so a failure is diagnosable instead of opaque.
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 ${res.status}: ${detail.slice(0, 400)}`);
  }

  return `${cfg.publicBaseUrl}/${key}`;
}
