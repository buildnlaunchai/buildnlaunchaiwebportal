"use client";

import { ChevronDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { signOut } from "@/actions/auth";

/**
 * The account pill (DESIGN.md §10 — the app shell). A ringed avatar + name +
 * chevron that opens a small menu. It carries the sign-out action (and a jump to
 * settings) — the affordance the chevron promises, without a full command menu
 * (that is still Phase 4).
 */
export function UserMenu({
  email,
  fullName,
  avatarUrl,
}: {
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const name = fullName ?? email;
  const initial = (fullName ?? email).trim().charAt(0).toUpperCase();

  // Close on outside click / Escape — the same pattern as the bell.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const avatar = avatarUrl ? (
    // Not next/image: an arbitrary Google CDN host, not worth a remotePatterns
    // entry for a 26px avatar.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      className="size-[26px] rounded-pill shadow-[0_0_0_2px_rgba(47,107,255,0.35)]"
    />
  ) : (
    <span
      aria-hidden
      className="flex size-[26px] items-center justify-center rounded-pill bg-gradient-to-br from-accent-hover to-accent text-[12px] font-semibold text-accent-text shadow-[0_0_0_2px_rgba(47,107,255,0.35)]"
    >
      {initial}
    </span>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-[34px] items-center gap-2 rounded-pill border border-line bg-surface/70 py-0 pl-1 pr-2.5 transition-colors duration-micro ease-default hover:border-line-strong"
      >
        {avatar}
        <span className="hidden max-w-[120px] truncate text-small font-medium text-text lg:inline">
          {name}
        </span>
        <ChevronDown
          aria-hidden
          className="hidden size-3.5 text-text-faint lg:inline"
          strokeWidth={1.6}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-40 w-56 overflow-hidden rounded-lg border border-line bg-elevated shadow-pop"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-small font-medium text-text">{name}</p>
            <p className="truncate text-mono text-text-faint">{email}</p>
          </div>
          <div className="p-1">
            <Link
              href="/dashboard/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-body text-text-muted transition-colors duration-micro ease-default hover:bg-surface hover:text-text"
            >
              <Settings aria-hidden className="size-4" strokeWidth={1.6} />
              Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => startTransition(() => void signOut())}
              className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-body text-text-muted transition-colors duration-micro ease-default hover:bg-surface hover:text-text disabled:opacity-60"
            >
              <LogOut aria-hidden className="size-4" strokeWidth={1.6} />
              {pending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
