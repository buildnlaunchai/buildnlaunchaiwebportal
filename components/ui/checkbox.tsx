import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — the native control, tokened. `accent-accent` paints the check in
 * `--accent` (CSS `accent-color`), which keeps the OS control's built-in
 * keyboard and screen-reader behaviour while matching the palette — the right
 * trade for a checkbox, where a custom control buys nothing but risk.
 */
export function Checkbox({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer rounded-sm border border-line bg-surface accent-accent",
        "transition-colors duration-micro ease-default hover:border-line-strong",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
