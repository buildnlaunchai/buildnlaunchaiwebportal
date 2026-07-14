import { ShieldOff } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * §12: errors don't apologize and are never vague. Say what happened, then what
 * to do. A suspended member is owed a straight answer and a way to reach a
 * human — not a silent 404 that leaves them wondering if the site is broken.
 */
export default function SuspendedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5">
      <div className="flex max-w-[400px] flex-col items-center text-center">
        <ShieldOff aria-hidden className="size-6 text-danger" strokeWidth={1.5} />
        <h1 className="text-h3 mt-5">Your account is suspended</h1>
        <p className="mt-2 text-small text-text-muted">
          You can&apos;t run tools or see your history while this is in place. If
          you think it&apos;s a mistake, reply to any email from me and I&apos;ll
          take a look.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
