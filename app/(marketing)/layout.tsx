import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getLogoUrl } from "@/lib/settings";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const logoUrl = await getLogoUrl();
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Grain film (DESIGN.md §3) — same screen-locked texture the app carries,
          so the marketing ground reads as graded, not plastic. */}
      <div className="grain" aria-hidden />

      <SiteHeader logoUrl={logoUrl} />

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
