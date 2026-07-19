import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * BackLink — the return affordance on a detail page (a run, a tool, the editor).
 * One consistent treatment everywhere, so "how do I get out of here" is never a
 * new question.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 text-small text-text-muted transition-colors duration-micro ease-default hover:text-text"
    >
      <ArrowLeft aria-hidden className="size-4" strokeWidth={1.6} />
      {label}
    </Link>
  );
}

/**
 * PageHeader — the top of an authenticated page.
 *
 * The app shell's top bar already renders the section title for every nav page
 * (DESIGN.md §10), so a nav page passes NO `title` and leads with a one-line
 * `description` plus any page-level `actions`. A detail page reached outside the
 * nav (a run, the tool editor) — where the top bar can only show a fallback —
 * passes its own `title` and a `back` link. One component, both shapes, so the
 * page head reads the same wherever you are.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4", className)}>
      {back && <BackLink {...back} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {(title || description) && (
          <div className="min-w-0">
            {title && <h1 className="text-h1">{title}</h1>}
            {description && (
              <p
                className={cn(
                  "text-small text-text-muted prose-measure",
                  title && "mt-1.5",
                )}
              >
                {description}
              </p>
            )}
          </div>
        )}
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
