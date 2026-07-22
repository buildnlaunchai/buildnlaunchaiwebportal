"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { uploadToR2, isR2Configured } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";

type Result<T = object> = { error: string } | ({ ok: true } & T);

const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — a logo, not a hero.
// Raster only: an SVG could carry script and would need dangerouslyAllowSVG for
// next/image. A transparent PNG covers the logo case cleanly.
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

/**
 * Upload the site logo. Admin-only; the image goes to Cloudflare R2 (public),
 * and the URL is saved on the singleton app_settings row. It's a public asset,
 * so routing it through this action is fine. The header + sidebar read it via
 * the public settings view and fall back to the daisy mark when it's null.
 */
export async function uploadLogo(formData: FormData): Promise<Result<{ url: string }>> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No image selected." };
  if (!LOGO_TYPES.includes(file.type)) return { error: "Use a PNG, JPG, WebP, or AVIF." };
  if (file.size > LOGO_MAX_BYTES) return { error: "Logo must be under 2 MB." };
  if (!isR2Configured()) {
    return { error: "Image storage isn't configured yet — set the R2_* env vars." };
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const key = `branding/logo-${crypto.randomUUID()}.${ext}`;

  try {
    const url = await uploadToR2(key, await file.arrayBuffer(), file.type);
    const admin = createAdminClient();
    const { error } = await admin
      .from("app_settings")
      .update({ logo_url: url })
      .eq("id", true);
    if (error) return { error: "Uploaded, but couldn't save it. Try again." };

    // The logo lives in the root layout — revalidate every page under it.
    revalidatePath("/", "layout");
    return { ok: true, url };
  } catch (e) {
    console.error("[uploadLogo] failed:", e);
    return { error: "Upload failed. Try again." };
  }
}

/** Clear the logo, reverting to the built-in daisy mark. */
export async function removeLogo(): Promise<Result> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .update({ logo_url: null })
    .eq("id", true);
  if (error) return { error: "Couldn't remove the logo. Try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}
