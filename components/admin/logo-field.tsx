"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { removeLogo, uploadLogo } from "@/actions/admin-settings";
import { SparkMark } from "@/components/brand/spark-mark";
import { Button } from "@/components/ui/button";

/**
 * The site-logo control (admin settings). Uploads to R2 via the admin action,
 * which saves the URL on app_settings and revalidates the layout; a refresh
 * then shows the new logo in the preview (and everywhere else). Falls back to
 * the built-in daisy mark when none is set.
 */
export function LogoField({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const working = busy || pending;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadLogo(fd);
      if ("error" in res) setError(res.error);
      else startTransition(() => router.refresh());
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = () => {
    setError(null);
    startTransition(async () => {
      const res = await removeLogo();
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-4">
        {/* preview — the logo mark, as it appears in the header/sidebar */}
        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-line bg-[var(--sunken)] [border-top-color:var(--line-strong)]">
          <span
            aria-hidden
            className="flex items-center justify-center text-accent [filter:drop-shadow(0_0_9px_rgba(200,242,79,0.4))]"
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Site logo"
                width={36}
                height={36}
                className="size-9 object-contain"
              />
            ) : (
              <SparkMark className="size-8" />
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={working}
          >
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <ImagePlus aria-hidden className="size-4" strokeWidth={1.6} />
            )}
            {busy ? "Uploading…" : logoUrl ? "Replace" : "Upload logo"}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={working}
            >
              <Trash2 aria-hidden className="size-4" strokeWidth={1.6} />
              Remove
            </Button>
          )}
        </div>
      </div>

      <p className="text-small text-text-faint">
        A square PNG or WebP with a transparent background works best. Shown in the
        marketing header and the app sidebar.
      </p>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
