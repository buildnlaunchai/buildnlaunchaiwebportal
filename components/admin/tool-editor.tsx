"use client";

import {
  FileOutput,
  FlaskConical,
  Info,
  KeyRound,
  ListChecks,
  type LucideIcon,
  Settings2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createTool, updateTool } from "@/actions/admin-tools";
import { CoverImageField } from "@/components/admin/cover-image-field";
import { FieldBuilder } from "@/components/admin/field-builder";
import { OutputBuilder } from "@/components/admin/output-builder";
import { ProviderPicker } from "@/components/admin/provider-picker";
import { TestRunPanel } from "@/components/admin/test-run-panel";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/input";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ApiProvider } from "@/lib/providers";
import type { InputField, OutputBlock } from "@/lib/tool-schema";
import type { ToolDraft } from "@/lib/validation/tool";

function Section({ icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Panel>
      <SectionHeader icon={icon} title={title} description={hint} />
      <div className="mt-5">{children}</div>
    </Panel>
  );
}

export function ToolEditor({
  toolId,
  initial,
}: {
  toolId?: string;
  initial: ToolDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ToolDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ToolDraft>(key: K, value: ToolDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = toolId ? await updateTool(toolId, draft) : await createTool(draft);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSaved(true);
      if (!toolId && "id" in res) router.push(`/admin/tools/${res.id}`);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* The data-vs-behaviour boundary — stated plainly, not implied away. */}
      <Callout tone="info" icon={Info}>
        This editor ships the tool&apos;s <strong>interface</strong> — form, output,
        access, copy — live, with no deploy. The tool&apos;s <strong>behaviour</strong>{" "}
        is a TypeScript handler at{" "}
        <span className="text-mono">
          supabase/functions/run-tool/handlers/{draft.function_name || draft.slug || "your-slug"}.ts
        </span>{" "}
        that you deploy separately with{" "}
        <span className="text-mono">supabase functions deploy run-tool</span>. Use
        Test run below to check the handler is wired up.
      </Callout>

      <Section icon={Settings2} title="Basics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Slug" required hint="lowercase-with-hyphens">
            <Input value={draft.slug} onChange={(e) => set("slug", e.target.value)} className="font-mono" />
          </Field>
          <Field label="Tagline" required className="sm:col-span-2">
            <Input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Description (markdown)" className="sm:col-span-2">
            <Textarea rows={4} value={draft.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Category">
            <Input value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="research, content…" />
          </Field>
          <Field label="Icon (lucide name)">
            <Input value={draft.icon} onChange={(e) => set("icon", e.target.value)} placeholder="search, users…" className="font-mono" />
          </Field>
          <Field label="Build video URL">
            <Input value={draft.video_url} onChange={(e) => set("video_url", e.target.value)} placeholder="https://youtube.com/…" />
          </Field>
          <Field label="Cover image" hint="Shown on the tool card. 16:9 works best." className="sm:col-span-2">
            <CoverImageField value={draft.cover_image_url ?? ""} onChange={(url) => set("cover_image_url", url)} />
          </Field>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="Access & status">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => set("status", e.target.value as ToolDraft["status"])}>
              {["draft", "coming_soon", "published", "maintenance", "archived"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Access type" hint="'members' opens it to all; 'manual' is per-user">
            <Select value={draft.access_type} onChange={(e) => set("access_type", e.target.value as ToolDraft["access_type"])}>
              {["public_preview", "members", "plan", "manual"].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <Field label="Runtime">
            <Select value={draft.runtime} onChange={(e) => set("runtime", e.target.value as ToolDraft["runtime"])}>
              {["edge_function", "internal", "iframe", "external_link"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Timeout (seconds)" hint="5–400 (Supabase cap)">
            <Input type="number" value={draft.timeout_seconds} onChange={(e) => set("timeout_seconds", Number(e.target.value))} />
          </Field>
          <Field label="Rate limit / day" hint="blank = unlimited">
            <Input type="number" value={draft.rate_limit_per_day ?? ""} onChange={(e) => set("rate_limit_per_day", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        </div>
        <label className="mt-4 flex cursor-pointer select-none items-start gap-2.5">
          <Checkbox
            className="mt-0.5"
            checked={draft.is_featured ?? false}
            onChange={(e) => set("is_featured", e.target.checked)}
          />
          <span>
            <span className="text-label">Feature on the catalog</span>
            <span className="ml-2 text-small text-text-faint">
              — showcase this tool in the big hero on /tools. One at a time.
            </span>
          </span>
        </label>
      </Section>

      <Section icon={KeyRound} title="Required keys (BYOK)" hint="Which provider keys a member must connect to run this.">
        <ProviderPicker
          selected={draft.required_providers as ApiProvider[]}
          onChange={(p) => set("required_providers", p)}
        />
      </Section>

      <Section icon={Terminal} title="Runtime config">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Handler (function name)" hint="defaults to the slug">
            <Input value={draft.function_name} onChange={(e) => set("function_name", e.target.value)} placeholder={draft.slug} className="font-mono" />
          </Field>
          {draft.runtime === "iframe" && (
            <Field label="Embed URL (https)">
              <Input value={draft.embed_url} onChange={(e) => set("embed_url", e.target.value)} />
            </Field>
          )}
          {draft.runtime === "external_link" && (
            <Field label="External URL (https)">
              <Input value={draft.external_url} onChange={(e) => set("external_url", e.target.value)} />
            </Field>
          )}
        </div>
      </Section>

      <Section icon={ListChecks} title="Input form" hint="The fields a member fills in. Rendered live from this.">
        <FieldBuilder
          fields={draft.input_schema.fields as InputField[]}
          onChange={(fields) => set("input_schema", { fields })}
        />
      </Section>

      <Section icon={FileOutput} title="Output" hint="How the result renders, block by block.">
        <OutputBuilder
          blocks={draft.output_schema.blocks as OutputBlock[]}
          onChange={(blocks) => set("output_schema", { type: "blocks", blocks })}
        />
      </Section>

      {/* Save bar */}
      <div className="sticky bottom-0 z-10 -mx-5 flex items-center gap-3 border-t border-line bg-canvas/95 px-5 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <Button variant="primary" pending={pending} onClick={save}>
          {toolId ? "Save changes" : "Create tool"}
        </Button>
        {error && <span className="text-small text-danger">{error}</span>}
        {saved && !error && <span className="text-small text-live">Saved.</span>}
      </div>

      {/* Test run — only once the tool has an id to run against. */}
      {toolId ? (
        <Section icon={FlaskConical} title="Test run" hint="Fires the tool with YOUR admin keys and shows the raw response.">
          <TestRunPanel toolId={toolId} inputSchema={draft.input_schema} />
        </Section>
      ) : (
        <Section icon={FlaskConical} title="Test run">
          <p className="text-small text-text-faint">Create the tool first, then test it here.</p>
        </Section>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label required={required}>{label}</Label>
      {children}
      {hint && <p className="text-small text-text-faint">{hint}</p>}
    </div>
  );
}
