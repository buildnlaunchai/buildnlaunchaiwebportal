"use client";

import { UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  giftMembership,
  revokeMembership,
  setSuspended,
} from "@/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, SectionHeader } from "@/components/ui/panel";

type Props = {
  userId: string;
  email: string;
  hasActiveMembership: boolean;
  suspended: boolean;
};

export function UserControls({ userId, email, hasActiveMembership, suspended }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Typed confirmation for revoke — irreversible-ish and affects someone else
  // (DESIGN.md §9). Type the email to arm the button.
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  // Trial length for a direct grant. Blank/0 = a permanent comp; N = an N-day
  // trial that auto-expires. No Paddle, no code.
  const [days, setDays] = useState("");
  const trialDays = Math.max(0, Math.floor(Number(days) || 0));

  const run = (fn: () => Promise<{ error: string } | { ok: true }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) setError(res.error);
      else {
        setConfirming(false);
        setTyped("");
        router.refresh();
      }
    });
  };

  return (
    <Panel className="flex flex-col gap-4">
      <SectionHeader icon={UserCog} title="Membership & account" />

      {error && (
        <p className="text-small text-danger" role="alert">
          {error}
        </p>
      )}

      {/* Membership lever */}
      {hasActiveMembership ? (
        confirming ? (
          <div className="flex flex-col gap-2 rounded-md border border-danger bg-danger-quiet p-3">
            <p className="text-small text-text">
              Type <span className="text-mono text-text">{email}</span> to revoke
              this membership.
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={email}
              aria-label="Type the email to confirm"
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={typed !== email}
                pending={pending}
                onClick={() => run(() => revokeMembership(userId))}
              >
                Revoke membership
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  setTyped("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <span className="text-small text-text-muted">
              Active membership.
            </span>
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              Revoke
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-small text-text-muted">No active membership.</span>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-mono-chip text-text-faint">
                Trial length (days)
              </span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="0 = permanent"
                className="w-40"
                aria-label="Trial length in days — blank or 0 grants a permanent membership"
              />
            </label>
            <Button
              variant="primary"
              size="sm"
              pending={pending}
              onClick={() =>
                run(() =>
                  giftMembership(userId, trialDays > 0 ? trialDays : undefined),
                )
              }
            >
              {trialDays > 0 ? `Grant ${trialDays}-day trial` : "Gift membership"}
            </Button>
          </div>
          <p className="text-mono-chip text-text-faint">
            Blank or 0 comps a permanent membership. A trial auto-expires — no
            Paddle, no code to hand out.
          </p>
        </div>
      )}

      {/* Suspend lever — reversible, so a plain toggle, no typed confirm */}
      <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
        <span className="text-small text-text-muted">
          {suspended ? "Account is suspended." : "Account is active."}
        </span>
        <Button
          variant={suspended ? "secondary" : "danger"}
          size="sm"
          pending={pending}
          onClick={() => run(() => setSuspended(userId, !suspended))}
        >
          {suspended ? "Unsuspend" : "Suspend"}
        </Button>
      </div>
    </Panel>
  );
}
