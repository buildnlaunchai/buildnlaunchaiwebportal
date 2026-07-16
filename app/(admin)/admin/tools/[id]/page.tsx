import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ToolEditor } from "@/components/admin/tool-editor";
import { requireAdmin } from "@/lib/access";
import { getToolForEditor } from "@/lib/admin-tools";

export default async function EditToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const draft = await getToolForEditor(id);
  if (!draft) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/tools" className="inline-flex items-center gap-2 text-small text-text-muted transition-colors duration-micro ease-default hover:text-text">
          <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
          All tools
        </Link>
        <h1 className="text-h1 mt-4">{draft.name}</h1>
        <p className="text-mono text-text-faint">{draft.slug}</p>
      </div>
      <ToolEditor toolId={id} initial={draft} />
    </div>
  );
}
