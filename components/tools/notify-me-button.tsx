"use client";

import { Bell, Check } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { toggleToolInterest } from "@/actions/interest";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * "Notify me" on a coming-soon tool — the real one-click demand-capture
 * instrument (§10, DESIGN §9). If the visitor is signed in it toggles their
 * interest in place ("We'll tell you"); if not, it routes them to sign in and
 * back. tool_interest is engagement only — no access is granted here.
 */
export function NotifyMeButton({
  toolId,
  size = "sm",
  className,
}: {
  toolId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [interested, setInterested] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  // On mount, learn whether we're signed in and already interested. RLS scopes
  // the tool_interest read to the current user, so a returned row means "yes".
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      setAuthed(Boolean(session));
      if (session) {
        const { data } = await supabase
          .from("tool_interest")
          .select("tool_id")
          .eq("tool_id", toolId)
          .maybeSingle();
        if (active) setInterested(Boolean(data));
      }
    })();
    return () => { active = false; };
  }, [toolId]);

  const click = () => {
    if (authed === false) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    // Optimistic toggle.
    setInterested((v) => !v);
    startTransition(async () => {
      const res = await toggleToolInterest(toolId);
      if ("error" in res) setInterested((v) => !v); // roll back
      else setInterested(res.interested);
    });
  };

  return (
    <Button
      variant={interested ? "secondary" : "primary"}
      size={size}
      pending={pending}
      onClick={click}
      className={className}
    >
      {interested ? (
        <>
          <Check aria-hidden className="size-4" strokeWidth={1.5} />
          We&apos;ll tell you
        </>
      ) : (
        <>
          <Bell aria-hidden className="size-4" strokeWidth={1.5} />
          Notify me
        </>
      )}
    </Button>
  );
}
