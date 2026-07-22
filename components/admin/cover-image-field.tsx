"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { uploadToolCover } from "@/actions/admin-tools";

/**
 * The tool cover uploader (admin editor, §7). Click to pick a file; it uploads
 * to the public `tool-covers` bucket through the admin Server Action and stores
 * the returned URL on the draft. Shows a live preview at the same 16:9 the card
 * renders, so the admin sees what a member will see. "Remove" just clears the
 * URL — the orphaned object is harmless (public, tiny) and never linked again.
 */
export function CoverImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadToolCover(fd);
      if ("error" in res) setError(res.error);
      else onChange(res.url);
    } catch {
      // A thrown Server Action (network, redirect, unexpected) must never leave
      // the control stuck on a spinner — surface it and let them retry.
      setError("Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = ""; // allow re-picking the same file
        }}
      />

      {value ? (
        <div className="relative aspect-[16/9] w-full max-w-sm overflow-hidden rounded-lg border border-line [border-top-color:var(--line-strong)]">
          <Image src={value} alt="" fill sizes="384px" className="object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={pick}
              className="text-mono-chip rounded-md bg-backdrop/70 px-2.5 py-1 text-text backdrop-blur-sm transition-colors hover:bg-backdrop"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Remove cover image"
              className="rounded-md bg-backdrop/70 p-1.5 text-text backdrop-blur-sm transition-colors hover:bg-backdrop"
            >
              <X aria-hidden className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-backdrop/60">
              <Loader2 aria-hidden className="size-5 animate-spin text-accent" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="flex aspect-[16/9] w-full max-w-sm flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface text-text-muted transition-colors duration-micro ease-default hover:border-accent hover:text-text disabled:opacity-60"
        >
          {busy ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <ImagePlus aria-hidden className="size-5" strokeWidth={1.6} />
          )}
          <span className="text-small">{busy ? "Uploading…" : "Upload cover image"}</span>
          <span className="text-mono-chip text-text-faint">
            16:9 · PNG / JPG / WebP · ≤ 4 MB
          </span>
        </button>
      )}

      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
