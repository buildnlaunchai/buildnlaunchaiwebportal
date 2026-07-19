"use client";

import { ChevronDown, ChevronUp, Copy, Package, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteTool, duplicateTool, reorderTools } from "@/actions/admin-tools";
import { StatusPill } from "@/components/tools/status-pill";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { AdminToolListItem } from "@/lib/admin-tools";

const STATUS_TONE = {
  draft: "faint",
  coming_soon: "warn",
  published: "live",
  maintenance: "warn",
  archived: "faint",
} as const;

export function ToolsList({ initial }: { initial: AdminToolListItem[] }) {
  const router = useRouter();
  const [tools, setTools] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<AdminToolListItem | null>(null);
  const [typed, setTyped] = useState("");

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tools.length) return;
    const next = [...tools];
    [next[i], next[j]] = [next[j], next[i]];
    setTools(next);
    startTransition(() => reorderTools(next.map((t) => t.id)).then(() => router.refresh()));
  };

  const dup = (id: string) =>
    startTransition(async () => {
      const res = await duplicateTool(id);
      if ("ok" in res) router.push(`/admin/tools/${res.id}`);
    });

  const doDelete = (tool: AdminToolListItem) =>
    startTransition(async () => {
      await deleteTool(tool.id);
      setTools((t) => t.filter((x) => x.id !== tool.id));
      setConfirmDelete(null);
      setTyped("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Link href="/admin/tools/new">
          <Button variant="primary" size="sm">
            <Plus aria-hidden className="size-4" strokeWidth={1.5} />
            New tool
          </Button>
        </Link>
      </div>

      {tools.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No tools yet"
          description="Ship the first one — write a handler, deploy, then create the row here."
          action={
            <Link href="/admin/tools/new">
              <Button variant="primary">New tool</Button>
            </Link>
          }
        />
      ) : (
        <Panel flush>
          {tools.map((tool, i) => (
            <div key={tool.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0 || pending} className="text-text-faint transition-colors duration-micro ease-default hover:text-text disabled:opacity-30" aria-label="Move up">
                  <ChevronUp aria-hidden className="size-4" strokeWidth={1.5} />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === tools.length - 1 || pending} className="text-text-faint transition-colors duration-micro ease-default hover:text-text disabled:opacity-30" aria-label="Move down">
                  <ChevronDown aria-hidden className="size-4" strokeWidth={1.5} />
                </button>
              </div>

              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-text-muted [border-top-color:var(--line-strong)]">
                <ToolIcon name={tool.icon} className="size-[18px]" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-body-strong text-text">{tool.name}</span>
                  <StatusPill label={tool.status} tone={STATUS_TONE[tool.status]} dot={false} />
                </div>
                <p className="text-mono truncate text-text-faint">
                  {tool.slug} · {tool.access_type} · {tool.run_count} runs
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Link href={`/admin/tools/${tool.id}`}>
                  <Button variant="ghost" size="sm" className="size-8 px-0" aria-label="Edit"><Pencil aria-hidden className="size-4" strokeWidth={1.5} /></Button>
                </Link>
                <Button variant="ghost" size="sm" className="size-8 px-0" onClick={() => dup(tool.id)} aria-label="Duplicate"><Copy aria-hidden className="size-4" strokeWidth={1.5} /></Button>
                <Button variant="ghost" size="sm" className="size-8 px-0 hover:text-danger" onClick={() => { setConfirmDelete(tool); setTyped(""); }} aria-label="Delete"><Trash2 aria-hidden className="size-4" strokeWidth={1.5} /></Button>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {/* Delete confirm. Typed confirmation only when it has run history (§9). */}
      {confirmDelete && (
        <Dialog
          open
          onClose={() => setConfirmDelete(null)}
          title={`Delete ${confirmDelete.name}?`}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                pending={pending}
                disabled={confirmDelete.run_count > 0 && typed !== confirmDelete.slug}
                onClick={() => doDelete(confirmDelete)}
              >
                Delete
              </Button>
            </>
          }
        >
          {confirmDelete.run_count > 0 ? (
            <>
              <p className="text-small text-text-muted">
                This tool has {confirmDelete.run_count} runs. Deleting it removes them too.
                Type <span className="text-mono text-text">{confirmDelete.slug}</span> to confirm.
              </p>
              <Input className="mt-3" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmDelete.slug} />
            </>
          ) : (
            <p className="text-small text-text-muted">This draft has no runs. It&apos;ll be gone for good.</p>
          )}
        </Dialog>
      )}
    </div>
  );
}
