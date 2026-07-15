import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/* DESIGN.md §9 — Select. Native <select> restyled to the input skin, with our
   own chevron. Native is the right call: it's accessible for free, works on
   mobile, and a custom popover here would be complexity for no gain. */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-[38px] w-full appearance-none rounded-sm border border-line bg-surface pl-3 pr-9",
          "text-body text-text",
          "transition-colors duration-micro ease-default",
          "hover:border-line-strong",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-quiet",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-danger",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        strokeWidth={1.5}
      />
    </div>
  );
}
