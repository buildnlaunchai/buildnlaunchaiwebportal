import type { NextConfig } from "next";

/* next/image needs the Supabase Storage host allow-listed to serve tool cover
   thumbnails from the public `tool-covers` bucket. Derive it from the same env
   the app already uses; fall back to the known project host if it's unset at
   build time. Only the public object path is permitted. */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "pezsxoynjjsipfnpfvva.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
