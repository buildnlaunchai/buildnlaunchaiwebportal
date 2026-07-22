"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import { useSubscribe } from "@/components/billing/use-subscribe";
import { cn } from "@/lib/utils";

/**
 * The canonical "Subscribe — $10/mo" CTA, rendered with the design-system Button.
 * Reused wherever a member joins: the landing close, the catalog, a locked tool
 * page, the dashboard empty state. It swaps its own label to "Visit dashboard"
 * for a member who's already active, so nobody double-subscribes. Custom-styled
 * placements (the hero, the header) use the useSubscribe hook directly instead.
 */
export function SubscribeButton({
  priceId,
  variant = "primary",
  size,
  className,
  block = false,
  label = "Subscribe — $10/mo",
  memberLabel = "Visit dashboard",
  loginNext = "/dashboard",
}: {
  priceId: string | null;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Full-width. */
  block?: boolean;
  label?: string;
  memberLabel?: string;
  /** Where a signed-out visitor lands after logging in. */
  loginNext?: string;
}) {
  const { state, act } = useSubscribe(priceId, loginNext);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => void act()}
      className={cn(block && "w-full", className)}
    >
      {state === "member" ? memberLabel : label}
    </Button>
  );
}
