import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NotifyMeButton } from "@/components/tools/notify-me-button";
import { ProviderChip } from "@/components/tools/provider-chip";
import { StatusPill } from "@/components/tools/status-pill";
import { ToolFormPreview } from "@/components/tools/tool-form-preview";
import { ToolIcon } from "@/components/tools/tool-icon";
import { YouTubeEmbed } from "@/components/tools/youtube-embed";
import { Button } from "@/components/ui/button";
import { parseInputSchema } from "@/lib/tool-schema";
import { getPublicTools, getToolBySlug } from "@/lib/tools";

// ISR: the shipping log and catalog render from the database, so refresh the
// static HTML periodically. A tool published from the admin (Phase 7) appears
// publicly within this window with no redeploy — which is the whole point of a
// log that grows as you ship. Phase 7 can also revalidatePath('/') for instant.
export const revalidate = 300;
// Pre-render every public tool page at build for SEO (route map: "SEO-optimized").
export async function generateStaticParams() {
  const tools = await getPublicTools();
  return tools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolBySlug(slug);
  if (!tool) return { title: "Tool not found — Build & Launch AI" };

  return {
    title: `${tool.name} — Build & Launch AI`,
    description: tool.tagline,
    openGraph: {
      title: tool.name,
      description: tool.tagline,
      type: "website",
      images: tool.cover_image_url ? [{ url: tool.cover_image_url }] : undefined,
    },
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = await getToolBySlug(slug);
  if (!tool) notFound();

  const inputSchema = parseInputSchema(tool.input_schema);
  const isComingSoon = tool.status === "coming_soon";
  const isPublicPreview = tool.access_type === "public_preview";

  const cta = isComingSoon
    ? { label: "Notify me when it ships", href: "/apply" }
    : isPublicPreview
      ? { label: "Try it free", href: `/login?next=/dashboard/tools/${tool.slug}` }
      : { label: "Apply for access", href: "/apply" };

  return (
    <article className="mx-auto w-full max-w-[1200px] px-5 py-12 lg:px-8">
      <Link
        href="/tools"
        className="inline-flex items-center gap-2 text-small text-text-muted transition-colors duration-micro ease-default hover:text-text"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        All tools
      </Link>

      {/* Two columns on desktop: the pitch on the left, the form preview on the
          right — a preview of the runner's split (DESIGN.md §8). */}
      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_420px]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md border border-line text-text-muted">
              <ToolIcon name={tool.icon} className="size-6" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {isComingSoon && (
                <StatusPill label="coming soon" tone="warn" dot={false} />
              )}
              {tool.category && (
                <span className="text-mono-chip rounded-pill bg-elevated px-2 py-1 text-text-muted">
                  {tool.category}
                </span>
              )}
              {tool.version && (
                <span className="text-mono text-text-faint">v{tool.version}</span>
              )}
            </div>
          </div>

          <h1 className="text-display-l mt-6">{tool.name}</h1>
          <p className="mt-3 text-h3 font-normal text-text-muted">{tool.tagline}</p>

          {tool.video_url && (
            <div className="mt-8">
              <YouTubeEmbed url={tool.video_url} title={tool.name} />
            </div>
          )}

          {tool.description && (
            <div className="prose-measure mt-8 flex flex-col gap-4">
              {tool.description.split("\n\n").map((para, i) => (
                <p key={i} className="text-body text-text-muted">
                  {para}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* The gated form preview. */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-md border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-h3">Inputs</h2>
              {!isPublicPreview && !isComingSoon && (
                <span className="inline-flex items-center gap-1.5 text-small text-text-faint">
                  <Lock aria-hidden className="size-3.5" strokeWidth={1.5} />
                  locked
                </span>
              )}
            </div>

            <p className="mt-1 text-small text-text-muted">
              {isComingSoon
                ? "Here's what it'll ask for."
                : "Here's what you'll fill in to run it."}
            </p>

            <div className="mt-5">
              <ToolFormPreview schema={inputSchema} />
            </div>

            {tool.required_providers.length > 0 && (
              <div className="mt-5 border-t border-line pt-5">
                <p className="mb-2 text-label text-text">You&apos;ll need</p>
                <ProviderChip providers={tool.required_providers} />
              </div>
            )}

            <div className="mt-6">
              {isComingSoon ? (
                <NotifyMeButton toolId={tool.id} size="md" className="w-full" />
              ) : (
                <Link href={cta.href}>
                  <Button variant="primary" className="w-full">
                    {cta.label}
                  </Button>
                </Link>
              )}
              {!isComingSoon && !isPublicPreview && (
                <p className="mt-3 text-small text-text-muted">
                  Approved members run this with their own key.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}
