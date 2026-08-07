"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import { useSubscribe } from "@/components/billing/use-subscribe";
import { cn } from "@/lib/utils";

/**
 * The canonical "Subscribe — $10/mo" CTA, rendered with the design-system Button.
 * Reused wherever a member joins: the landing close, the catalog, a locked tool
 * page, the dashboard empty state. It swaps its own label to "Visit dashboard"
 * for a member who's already active, so nobody double-subscribes. Custom-styled
 * placements can use the useSubscribe hook directly instead.
 *
 * There is no `priceId` prop any more: Creem checkout resolves the product from
 * `plans` server-side in /api/checkout, so the id no longer has to be fetched on
 * every page that renders a CTA and threaded down through props.
 */
export function SubscribeButton({
  variant = "primary",
  size,
  className,
  block = false,
  label = "Subscribe — $10/mo",
  memberLabel = "Visit dashboard",
  loginNext = "/dashboard",
}: {
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
  const { state, act } = useSubscribe(loginNext);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={act}
      className={cn(block && "w-full", className)}
    >
      {state === "member" ? memberLabel : label}
    </Button>
  );
}
