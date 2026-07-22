"use client";

import { ChevronDown, LayoutGrid, LogOut, Shield } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { signOut } from "@/actions/auth";
import { createClient } from "@/lib/supabase/client";

type SessionUser = { avatarUrl: string | null; name: string; isAdmin: boolean };

/**
 * The marketing header's auth slot. Resolves the session IN THE BROWSER so the
 * marketing pages stay static (no per-request cookie read on the server): while
 * it resolves — and for signed-out visitors — it shows Log in / Apply; once a
 * signed-in user is known it becomes an avatar with a dropdown (Dashboard, plus
 * Admin Dashboard for admins, and Sign out).
 */
export function SiteUserMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser || !active) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, role")
        .eq("id", authUser.id)
        .maybeSingle();
      if (!active) return;
      const meta = authUser.user_metadata as { avatar_url?: string; full_name?: string };
      setUser({
        avatarUrl: profile?.avatar_url ?? meta.avatar_url ?? null,
        name: profile?.full_name ?? meta.full_name ?? authUser.email ?? "Account",
        isAdmin: profile?.role === "admin",
      });
    })();
    return () => {
      active = false;
    };
  }, []);

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

  // Signed out (or still resolving) → the default Log in / Apply.
  if (!user) {
    return (
      <>
        <Link
          href="/login"
          className="hidden px-3 text-small font-medium text-text-muted transition-colors duration-micro ease-default hover:text-text sm:inline"
        >
          Log in
        </Link>
        <Link
          href="/apply"
          className="rounded-pill bg-accent px-4 py-2 text-small font-semibold text-accent-text transition-colors duration-micro ease-default hover:bg-accent-hover"
        >
          Apply
        </Link>
      </>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase();
  const avatar = user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary Google CDN avatar
    <img
      src={user.avatarUrl}
      alt=""
      className="size-8 rounded-pill object-cover shadow-[0_0_0_2px_rgba(200,242,79,0.4)]"
    />
  ) : (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-pill bg-gradient-to-br from-accent-hover to-accent text-small font-semibold text-accent-text shadow-[0_0_0_2px_rgba(200,242,79,0.4)]"
    >
      {initial}
    </span>
  );

  const item =
    "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-body text-text-muted transition-colors duration-micro ease-default hover:bg-surface hover:text-text";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-pill py-1 pl-1 pr-2 transition-colors duration-micro ease-default hover:bg-elevated"
      >
        {avatar}
        <ChevronDown aria-hidden className="size-4 text-text-faint" strokeWidth={1.8} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-line bg-elevated shadow-modal"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-small font-medium text-text">{user.name}</p>
          </div>
          <div className="p-1">
            <Link href="/dashboard" role="menuitem" onClick={() => setOpen(false)} className={item}>
              <LayoutGrid aria-hidden className="size-4" strokeWidth={1.6} />
              Dashboard
            </Link>
            {user.isAdmin && (
              <Link href="/admin" role="menuitem" onClick={() => setOpen(false)} className={item}>
                <Shield aria-hidden className="size-4" strokeWidth={1.6} />
                Admin Dashboard
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => startTransition(() => void signOut())}
              className={`${item} w-full disabled:opacity-60`}
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
