import * as React from "react";

import { cn } from "@/lib/utils";

/* DESIGN.md §9 — Textarea. Same skin as Input, min 96px tall. */
export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-sm border border-line bg-surface px-3 py-2",
        "text-body text-text placeholder:text-text-faint",
        "transition-colors duration-micro ease-default",
        "hover:border-line-strong",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-quiet",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}
