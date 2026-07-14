"use client";

import { useTransition } from "react";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      pending={pending}
      onClick={() => startTransition(() => void signOut())}
    >
      Sign out
    </Button>
  );
}
