import { NextResponse } from "next/server";

import { isR2Configured, uploadToR2 } from "@/lib/r2";

/**
 * TEMPORARY R2 diagnostics. Guarded by RUNNER_SECRET so it isn't public.
 * Reports which R2 env vars the runtime actually sees, runs a real test upload,
 * and fetches the result back to confirm public access. DELETE after debugging.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = req.headers.get("x-runner-secret") ?? "";
  if (!process.env.RUNNER_SECRET || secret !== process.env.RUNNER_SECRET) {
    return new NextResponse("not found", { status: 404 });
  }

  const present = {
    R2_ACCOUNT_ID: Boolean(process.env.R2_ACCOUNT_ID),
    R2_ACCESS_KEY_ID: Boolean(process.env.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: Boolean(process.env.R2_SECRET_ACCESS_KEY),
    R2_BUCKET: Boolean(process.env.R2_BUCKET),
    R2_PUBLIC_BASE_URL: Boolean(process.env.R2_PUBLIC_BASE_URL),
  };
  const meta = {
    accountIdLen: (process.env.R2_ACCOUNT_ID ?? "").length,
    bucket: process.env.R2_BUCKET ?? null,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? null,
    accessKeyIdLen: (process.env.R2_ACCESS_KEY_ID ?? "").length,
    secretLen: (process.env.R2_SECRET_ACCESS_KEY ?? "").length,
  };

  if (!isR2Configured()) {
    return NextResponse.json({ configured: false, present, meta });
  }

  // 1x1 transparent PNG
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );

  try {
    const url = await uploadToR2(`tool-covers/_r2check.png`, png.buffer, "image/png");
    let publicStatus: number | string;
    try {
      const r = await fetch(url, { cache: "no-store" });
      publicStatus = r.status;
    } catch (e) {
      publicStatus = `fetch-threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    return NextResponse.json({ configured: true, present, meta, upload: "ok", url, publicStatus });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      present,
      meta,
      upload: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
