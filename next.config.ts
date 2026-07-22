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
