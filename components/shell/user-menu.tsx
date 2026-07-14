"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Phase 1 is a sign-out button and an avatar, not a dropdown. A popover with one
 * item in it is a menu pretending to be a menu — the real one arrives in Phase 4
 * alongside the command palette, when there is more than one thing to put in it.
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

  const name = fullName ?? email;
  const initial = (fullName ?? email).trim().charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      {avatarUrl ? (
        // Not next/image: this is an arbitrary Google CDN host, and adding it to
        // next.config's remotePatterns to save a few KB on a 24px avatar is not
        // a trade worth making.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="size-6 rounded-pill border border-line"
        />
      ) : (
        <span
          aria-hidden
          className="text-mono-chip flex size-6 items-center justify-center rounded-pill bg-elevated text-text-muted"
        >
          {initial}
        </span>
      )}

      <span className="hidden max-w-[140px] truncate text-small text-text-muted lg:inline">
        {name}
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="size-8 px-0"
        aria-label="Sign out"
        title="Sign out"
        pending={pending}
        onClick={() => startTransition(() => void signOut())}
      >
        <LogOut aria-hidden className="size-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
