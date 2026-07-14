"use client";

import { Mail } from "lucide-react";
import { useActionState, useTransition } from "react";

import { sendMagicLink, signInWithGoogle, type AuthResult } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/* Google's mark. Inline because DESIGN.md §14 forbids mixing icon sets, and
   Lucide has no brand icons — a third-party brand mark is not part of our icon
   system, it is someone else's trademark, so it lives here and nowhere else. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    sendMagicLink,
    null,
  );
  const [googlePending, startGoogle] = useTransition();

  const sent = state && "sent" in state;
  const error = state && "error" in state ? state.error : null;

  // The magic link was sent. Do not keep showing the form — the user's next
  // action is in their inbox, not on this page.
  if (sent) {
    return (
      <div className="flex flex-col items-center text-center">
        <Mail aria-hidden className="size-6 text-live" strokeWidth={1.5} />
        <h2 className="text-h3 mt-5">Check your email</h2>
        <p className="mt-2 text-small text-text-muted">
          The link signs you in and expires in an hour. It only works once.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        pending={googlePending}
        onClick={() => startGoogle(() => void signInWithGoogle(next))}
      >
        <GoogleMark />
        Continue with Google
      </Button>

      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="text-small text-text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="next" value={next} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="email" required>
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "email-error" : "email-help"}
          />
          {/* §9: help text below the field. Errors replace it. */}
          {error ? (
            <p id="email-error" className="text-small text-danger" role="alert">
              {error}
            </p>
          ) : (
            <p id="email-help" className="text-small text-text-muted">
              We&apos;ll email you a link. No password to remember.
            </p>
          )}
        </div>

        <Button type="submit" variant="primary" size="lg" pending={pending}>
          Email me a link
        </Button>
      </form>
    </div>
  );
}
