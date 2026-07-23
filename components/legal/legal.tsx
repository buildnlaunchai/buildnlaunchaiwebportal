import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/** One section of a policy. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3 text-text">{title}</h2>
      {children}
    </section>
  );
}

/** Shared page shell for the legal/policy routes — DESIGN.md prose column. */
export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-5 py-16 lg:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-small text-text-muted transition-colors duration-micro ease-default hover:text-text"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        Home
      </Link>

      <h1 className="text-display-l mt-6 text-balance">{title}</h1>
      <p className="mt-2 text-small text-text-faint">Last updated: {updated}</p>

      {intro ? <p className="mt-6 text-body text-text-muted">{intro}</p> : null}

      <div className="mt-10 flex flex-col gap-8 text-body text-text-muted [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-accent-hover [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </div>
  );
}
