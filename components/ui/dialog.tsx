"use client";

import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Dialog (DESIGN.md §9) — `--elevated`, `--radius-lg`, `--shadow-modal`, max
 * 520px. Enters at opacity 0 / scale 0.98 over 200ms with `--ease-enter`.
 * Backdrop `--backdrop`, no blur. Focus is trapped and returns to the trigger
 * on close (§13). Escape closes. Title is an `h3`; the primary action goes on
 * the right of the footer.
 *
 * Controlled: the parent owns `open` and `onClose`. One primitive for every
 * modal in the product, so a dialog is never hand-rolled again.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    // Remember what to restore focus to, lock scroll, focus the panel. The
    // enter animation is CSS on mount (dialog-enter / fade-enter) — no state.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Trap Tab within the panel.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      {/* backdrop — no blur (§9) */}
      <div
        className="fade-enter absolute inset-0 bg-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "dialog-enter relative w-full max-w-[520px] rounded-lg border border-line bg-elevated p-5 shadow-modal outline-none",
          "[border-top-color:var(--line-strong)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-h3">
              {title}
            </h3>
            {description && (
              <p id={descId} className="mt-1 text-small text-text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors duration-micro ease-default hover:bg-surface hover:text-text"
          >
            <X aria-hidden className="size-4" strokeWidth={1.6} />
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}

        {footer && (
          <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
