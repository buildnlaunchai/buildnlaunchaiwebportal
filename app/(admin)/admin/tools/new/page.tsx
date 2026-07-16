import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ToolEditor } from "@/components/admin/tool-editor";
import { requireAdmin } from "@/lib/access";
import { emptyToolDraft } from "@/lib/admin-tools";

export default async function NewToolPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/tools" className="inline-flex items-center gap-2 text-small text-text-muted transition-colors duration-micro ease-default hover:text-text">
          <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
          All tools
        </Link>
        <h1 className="text-h1 mt-4">New tool</h1>
      </div>
      <ToolEditor initial={emptyToolDraft()} />
    </div>
  );
}
