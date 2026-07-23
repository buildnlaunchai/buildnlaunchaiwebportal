"use client";

import Link from "next/link";

import { useIsActiveMember } from "@/components/billing/use-is-member";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The canonical marketing CTA. An active member gets "Visit dashboard" → the app;
 * everyone else gets "Subscribe — $10/mo" → the pricing page (where the checkout
 * overlay actually lives). Used for the hero, the landing close, /tools, and the
 * public tool page — every marketing surface funnels through /pricing, and no
 * paying member ever sees a Subscribe CTA.
 */
export function MemberCta({
  label = "Subscribe — $10/mo",
  memberLabel = "Visit dashboard",
  href = "/pricing",
  variant = "primary",
  size,
  className,
  block = false,
}: {
  label?: string;
  memberLabel?: string;
  /** Where non-members go. Members always go to /dashboard. */
  href?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  block?: boolean;
}) {
  const isMember = useIsActiveMember();

  return (
    <Link href={isMember ? "/dashboard" : href} className={cn(block && "block")}>
      <Button
        variant={variant}
        size={size}
        className={cn(block && "w-full", className)}
      >
        {isMember ? memberLabel : label}
      </Button>
    </Link>
  );
}
