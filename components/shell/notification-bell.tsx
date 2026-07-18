"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { markNotificationsRead } from "@/actions/notifications";
import { createClient } from "@/lib/supabase/client";
import { formatShipDate } from "@/lib/format";
import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

/**
 * The in-app bell (§11). Every email is also a notification, so this is the
 * running record. Live over Realtime — a new notification appears without a
 * refresh; opening the dropdown marks them read.
 */
export function NotificationBell({
  initial,
  userId,
}: {
  initial: Notification[];
  userId: string;
}) {
  const [items, setItems] = useState<Notification[]>(initial);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.read_at).length;

  // Live inserts for this user.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 20)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openPanel = () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      const ids = items.filter((n) => !n.read_at).map((n) => n.id);
      // Optimistic; the action enforces "own rows only" server-side.
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
      void markNotificationsRead(ids);
    }
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={openPanel}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        className="relative inline-flex size-[34px] items-center justify-center rounded-[9px] border border-line bg-surface/70 text-text-muted transition-colors duration-micro ease-default hover:border-line-strong hover:bg-elevated hover:text-text"
      >
        <Bell aria-hidden className="size-4" strokeWidth={1.6} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-medium text-accent-text">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-80 overflow-hidden rounded-lg border border-line bg-elevated shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <span className="text-h3">Notifications</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-small text-text-faint">
                Nothing yet. You&apos;ll hear from me here.
              </p>
            ) : (
              items.map((n) => {
                const inner = (
                  <>
                    <div className="flex items-start gap-2">
                      {!n.read_at && <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-pill bg-accent" />}
                      <div className={cn("min-w-0", n.read_at && "pl-3.5")}>
                        <p className="text-small text-text">{n.title}</p>
                        {n.body && <p className="mt-0.5 text-small text-text-muted">{n.body}</p>}
                        <p className="text-mono mt-1 text-text-faint">{formatShipDate(n.created_at)}</p>
                      </div>
                    </div>
                  </>
                );
                return n.href ? (
                  <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="block border-b border-line px-4 py-3 last:border-0 hover:bg-surface">
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id} className="border-b border-line px-4 py-3 last:border-0">
                    {inner}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
