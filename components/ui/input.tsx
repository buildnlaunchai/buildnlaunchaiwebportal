import * as React from "react";

import { cn } from "@/lib/utils";

/* DESIGN.md §9 — Input.
   --surface fill, 1px --line, --radius-sm, 38px tall. Hover: --line-strong.
   Focus: --accent border + a 2px --accent-quiet ring. */
export function Input({
  className,
  type = "text",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "h-[38px] w-full rounded-sm border border-line bg-surface px-3",
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

/* §9: "Labels are always visible, above the field. Placeholders are examples,
   never labels." A placeholder-as-label vanishes the moment someone types, and
   then they cannot check their own work. */
export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("text-label block text-text", className)} {...props}>
      {children}
      {/* §9: required fields get a --danger asterisk. Optional is the
          exception; mark the exception. */}
      {required && (
        <span aria-hidden className="ml-1 text-danger">
          *
        </span>
      )}
    </label>
  );
}
