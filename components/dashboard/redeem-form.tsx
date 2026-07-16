"use client";

import { CheckCircle2, Ticket } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { redeemCode } from "@/actions/redeem";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function RedeemForm({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await redeemCode(code);
      if ("error" in res) setError(res.error);
      else setDone(res.kind);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 aria-hidden className="size-6 text-live" strokeWidth={1.5} />
        <h2 className="text-h3 mt-4">
          {done === "membership" ? "Membership unlocked" : "Tools unlocked"}
        </h2>
        <p className="mt-2 text-small text-text-muted">
          Your code was redeemed. It&apos;s all on your dashboard now.
        </p>
        <Link href="/dashboard" className="mt-6">
          <Button variant="primary">Go to your dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Access code</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="BLAI-XXXX-XXXX"
          className="font-mono uppercase"
          autoComplete="off"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && (
          <p className="text-small text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button variant="primary" pending={pending} disabled={!code.trim()} onClick={submit}>
        <Ticket aria-hidden className="size-4" strokeWidth={1.5} />
        Redeem
      </Button>
    </div>
  );
}
