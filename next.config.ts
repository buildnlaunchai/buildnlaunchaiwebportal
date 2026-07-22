import type { NextConfig } from "next";

/* next/image must allow-list the hosts that serve tool cover thumbnails. Covers
   now live on Cloudflare R2 (R2_PUBLIC_BASE_URL); the Supabase public path stays
   allowed too, harmlessly, for any legacy/Supabase-hosted asset. Both are
   derived from env so nothing is hardcoded. */
function hostOf(url: string | undefined): string | null {
  try {
    return new URL(url ?? "").hostname;
  } catch {
    return null;
  }
}

const supabaseHost = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "pezsxoynjjsipfnpfvva.supabase.co";
const r2Host = hostOf(process.env.R2_PUBLIC_BASE_URL);

const nextConfig: NextConfig = {
  // Server Actions default to a 1 MB request-body cap, which a real cover image
  // trips (Next rejects it with a 413 before uploadToolCover even runs — that's
  // the 500). Raise it to Vercel's serverless ceiling (4.5 MB); the action still
  // validates the image is ≤ 4 MB, and the editor blocks oversized files client-
  // side so nothing over the limit is ever sent.
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
      ...(r2Host
        ? [{ protocol: "https" as const, hostname: r2Host, pathname: "/**" }]
        : []),
    ],
  },
};

export default nextConfig;
