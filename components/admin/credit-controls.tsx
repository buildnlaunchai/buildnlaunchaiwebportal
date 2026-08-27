"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adjustCredits, setCreditOverride } from "@/actions/admin-credits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  userId: string;
  email: string;
  balance: number;
  override: boolean | null;
  /** What the global switch says, so "follows the switch" can say which way. */
  globalOn: boolean;
};

/**
 * The two things an admin does to one member's credit.
 *
 * Kept on one row with the member rather than behind a detail page, because
 * both actions are answers to a question you ask while looking at the list —
 * "why is this person on credit" and "give them some" — and a page in between
 * would mean losing the comparison that prompted it.
 */
export function CreditControls({ userId, email, balance, override, globalOn }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<{ error: string } | { ok: true }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) setError(res.error);
      else {
        setOpen(false);
        setAmount("");
        setNote("");
        router.refresh();
      }
    });
  };

  const effective = override ?? globalOn;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Three states, three buttons, and the current one is simply selected.
            A two-way toggle cannot express "follows the switch", which is where
            almost every member should be — and hiding the default behind a
            "clear" affordance makes it look like an edge case rather than the
            norm. */}
        {(
          [
            [null, "Follows switch"],
            [true, "Always on"],
            [false, "Always off"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={String(value)}
            type="button"
            variant={override === value ? "primary" : "ghost"}
            size="sm"
            disabled={pending || override === value}
            onClick={() => run(() => setCreditOverride(userId, value))}
          >
            {label}
          </Button>
        ))}
        <span className="text-small text-text-faint">
          &rarr; credit mode is {effective ? "ON" : "off"} for {email}
        </span>
      </div>

      {open ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="credits, e.g. 50000 or -50000"
              inputMode="numeric"
              className="max-w-[220px]"
              aria-label={`Credits to add or remove for ${email}`}
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="why — the member sees this"
              className="max-w-[280px]"
              aria-label={`Reason for adjusting ${email}`}
            />
            <Button
              type="button"
              size="sm"
              disabled={pending || !amount.trim() || !note.trim()}
              onClick={() =>
                run(() => adjustCredits(userId, Math.trunc(Number(amount) || 0), note))
              }
            >
              {pending ? "Working…" : "Apply"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-small text-text-faint">
            Balance is {balance.toLocaleString()}. A negative number takes credit
            back. Either way it lands in the ledger with your note on it.
          </p>
        </div>
      ) : (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
            Adjust balance
          </Button>
        </div>
      )}

      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
