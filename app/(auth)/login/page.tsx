import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

const ERRORS: Record<string, string> = {
  // §12: errors don't apologize and are never vague. Say what happened, then
  // what to do. No "Oops!", no exclamation marks.
  expired: "That link has expired or was already used. Here's a fresh one.",
  missing_code: "That sign-in link was incomplete. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const message = error ? ERRORS[error] : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-[380px]">
        <Link href="/" className="mb-10 flex items-center gap-2">
          <span aria-hidden className="size-6 rounded-sm bg-accent" />
          <span className="font-display text-[15px] font-semibold">
            Build &amp; Launch
          </span>
        </Link>

        <h1 className="text-h1">Sign in</h1>
        <p className="mt-2 text-small text-text-muted">
          New here? Signing in is the first step of applying.
        </p>

        {message && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-danger bg-danger-quiet px-4 py-3 text-small text-danger"
          >
            {message}
          </div>
        )}

        <div className="mt-8">
          <LoginForm next={safeNext} />
        </div>
      </div>
    </main>
  );
}
