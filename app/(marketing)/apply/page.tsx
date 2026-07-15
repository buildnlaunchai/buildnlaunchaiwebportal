import { CheckCircle2, Clock, DoorClosed, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ApplyForm } from "@/components/apply/apply-form";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/access";
import { getApplicationsOpen, getMyLatestApplication } from "@/lib/applications";
import { formatShipDate } from "@/lib/format";
import { getPublicTools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Apply — Build & Launch AI",
  description: "Apply for access to the tools.",
};

// A shell so every state on this page shares one frame.
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-5 py-16 lg:px-8">
      {children}
    </div>
  );
}

export default async function ApplyPage() {
  // Auth before apply. An anonymous visitor is bounced to sign-in and lands
  // right back here (§1). From here on, there is always a real account.
  const user = await requireUser("/apply");

  const [existing, open, tools] = await Promise.all([
    getMyLatestApplication(),
    getApplicationsOpen(),
    getPublicTools(),
  ]);

  // ---- Already applied → show status, not the form (§12 voice) -------------
  if (existing) {
    if (existing.status === "pending") {
      return (
        <Frame>
          <Clock aria-hidden className="size-6 text-warn" strokeWidth={1.5} />
          <h1 className="text-h1 mt-5">You&apos;re in the queue</h1>
          <p className="mt-2 text-body text-text-muted">
            Applied {formatShipDate(existing.created_at)}. I review these
            personally, usually within a day. You&apos;ll get an email the moment
            I do.
          </p>
          <div className="mt-6">
            <Link href="/dashboard">
              <Button variant="secondary">Go to your dashboard</Button>
            </Link>
          </div>
        </Frame>
      );
    }

    if (existing.status === "approved") {
      return (
        <Frame>
          <CheckCircle2 aria-hidden className="size-6 text-live" strokeWidth={1.5} />
          <h1 className="text-h1 mt-5">You&apos;re in</h1>
          <p className="mt-2 text-body text-text-muted">
            Your application was approved. Head to your dashboard to see what&apos;s
            unlocked.
          </p>
          <div className="mt-6">
            <Link href="/dashboard">
              <Button variant="primary">Go to your dashboard</Button>
            </Link>
          </div>
        </Frame>
      );
    }

    if (existing.status === "waitlisted") {
      return (
        <Frame>
          <Clock aria-hidden className="size-6 text-warn" strokeWidth={1.5} />
          <h1 className="text-h1 mt-5">You&apos;re on the waitlist</h1>
          <p className="mt-2 text-body text-text-muted">
            I&apos;m adding people as I add capacity, and you&apos;re on the list.
            In the meantime, the open tools need no approval and no key.
          </p>
          <div className="mt-6">
            <Link href="/tools">
              <Button variant="secondary">Try the open tools</Button>
            </Link>
          </div>
        </Frame>
      );
    }

    // rejected
    return (
      <Frame>
        <XCircle aria-hidden className="size-6 text-text-faint" strokeWidth={1.5} />
        <h1 className="text-h1 mt-5">Not a fit right now</h1>
        <p className="mt-2 text-body text-text-muted">
          I couldn&apos;t take this one on, but things change. The open tools are
          yours to use any time, no approval needed.
        </p>
        <div className="mt-6">
          <Link href="/tools">
            <Button variant="secondary">Browse the tools</Button>
          </Link>
        </div>
      </Frame>
    );
  }

  // ---- No application yet, but applications are closed (§12) ----------------
  if (!open) {
    return (
      <Frame>
        <DoorClosed aria-hidden className="size-6 text-text-faint" strokeWidth={1.5} />
        <h1 className="text-h1 mt-5">Applications are closed right now</h1>
        <p className="mt-2 text-body text-text-muted">
          I open them up as I add capacity. You&apos;re signed in, so I have your
          email — I&apos;ll let you know the moment they reopen.
        </p>
        <div className="mt-6">
          <Link href="/tools">
            <Button variant="secondary">Browse the tools</Button>
          </Link>
        </div>
      </Frame>
    );
  }

  // ---- The form -------------------------------------------------------------
  return (
    <Frame>
      <h1 className="text-display-l">Apply for access</h1>
      <p className="mt-3 text-body text-text-muted">
        Signed in as{" "}
        <span className="text-body-strong text-text">{user.email}</span>. A minute
        of questions, then I take it from there. It&apos;s free while I build in
        public.
      </p>

      <div className="mt-10">
        <ApplyForm tools={tools.map((t) => ({ slug: t.slug, name: t.name }))} />
      </div>
    </Frame>
  );
}
