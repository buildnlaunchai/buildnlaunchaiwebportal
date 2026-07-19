"use client";

import { ListChecks, Megaphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createAnnouncement,
  deleteAnnouncement,
  setAnnouncementPublished,
} from "@/actions/announcements";
import { StatusPill } from "@/components/tools/status-pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Announcement } from "@/lib/announcements";
import { formatShipDate } from "@/lib/format";

export function AnnouncementsManager({ initial }: { initial: Announcement[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [variant, setVariant] = useState("info");
  const [error, setError] = useState<string | null>(null);

  const compose = (publish: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await createAnnouncement({ title, body, variant, publish });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setTitle("");
      setBody("");
      router.refresh();
    });
  };

  const act = (fn: () => Promise<{ error: string } | { ok: true }>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-8">
      <Panel>
        <SectionHeader icon={Megaphone} title="Compose" />
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label required>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's new" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Body</Label>
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-48">
            <Label>Variant</Label>
            <Select value={variant} onChange={(e) => setVariant(e.target.value)}>
              <option value="info">info</option>
              <option value="success">success</option>
              <option value="warning">warning</option>
            </Select>
          </div>
          {error && <p className="text-small text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" pending={pending} disabled={!title.trim()} onClick={() => compose(true)}>
              Publish
            </Button>
            <Button variant="secondary" pending={pending} disabled={!title.trim()} onClick={() => compose(false)}>
              Save draft
            </Button>
          </div>
        </div>
      </Panel>

      <section>
        <SectionHeader icon={ListChecks} title="All announcements" />
        <div className="mt-4">
          {initial.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Compose one above to share news with your members."
            />
          ) : (
            <Panel flush>
              {initial.map((a) => (
                <div key={a.id} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body text-text">{a.title}</span>
                      <StatusPill
                        label={a.is_published ? "published" : "draft"}
                        tone={a.is_published ? "live" : "faint"}
                        dot={false}
                      />
                    </div>
                    {a.body && <p className="truncate text-small text-text-muted">{a.body}</p>}
                    <p className="text-mono text-text-faint">{formatShipDate(a.created_at)}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    pending={pending}
                    onClick={() => act(() => setAnnouncementPublished(a.id, !a.is_published))}
                  >
                    {a.is_published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 px-0 hover:text-danger"
                    pending={pending}
                    onClick={() => act(() => deleteAnnouncement(a.id))}
                    aria-label="Delete"
                  >
                    <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
                  </Button>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </section>
    </div>
  );
}
