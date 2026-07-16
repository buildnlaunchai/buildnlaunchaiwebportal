"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { OutputBlock, OutputBlockType } from "@/lib/tool-schema";

const TYPES: OutputBlockType[] = ["markdown", "table", "json", "file", "image"];

/** The visual output-block builder (§8). Emits OutputBlock[]. */
export function OutputBuilder({
  blocks,
  onChange,
}: {
  blocks: OutputBlock[];
  onChange: (blocks: OutputBlock[]) => void;
}) {
  const update = (i: number, patch: Partial<OutputBlock>) =>
    onChange(blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () =>
    onChange([...blocks, { type: "markdown", key: `block_${blocks.length + 1}`, label: "Result" }]);

  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 && (
        <p className="text-small text-text-faint">No output blocks yet. Add how results should render.</p>
      )}

      {blocks.map((block, i) => (
        <div key={i} className="rounded-md border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-mono text-text-faint">{block.type} · {block.key || "unkeyed"}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="size-8 px-0" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ChevronUp aria-hidden className="size-4" strokeWidth={1.5} />
              </Button>
              <Button variant="ghost" size="sm" className="size-8 px-0" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move down">
                <ChevronDown aria-hidden className="size-4" strokeWidth={1.5} />
              </Button>
              <Button variant="ghost" size="sm" className="size-8 px-0 hover:text-danger" onClick={() => remove(i)} aria-label="Remove block">
                <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={block.type} onChange={(e) => update(i, { type: e.target.value as OutputBlockType })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Key</Label>
              <Input value={block.key} onChange={(e) => update(i, { key: e.target.value })} className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Label</Label>
              <Input value={block.label ?? ""} onChange={(e) => update(i, { label: e.target.value })} />
            </div>
          </div>

          {block.type === "table" && (
            <div className="mt-3 flex flex-col gap-1.5">
              <Label>Columns (comma-separated)</Label>
              <Input
                value={(block.columns ?? []).join(", ")}
                onChange={(e) => update(i, { columns: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })}
                placeholder="name, email, subs"
                className="font-mono"
              />
            </div>
          )}

          {block.type === "json" && (
            <label className="mt-3 flex items-center gap-2 text-small text-text-muted">
              <input type="checkbox" checked={block.collapsed ?? false} onChange={(e) => update(i, { collapsed: e.target.checked })} className="size-4 rounded-sm border-line" />
              Collapsed by default
            </label>
          )}
        </div>
      ))}

      <Button variant="secondary" size="sm" onClick={add} className="self-start">
        <Plus aria-hidden className="size-4" strokeWidth={1.5} />
        Add block
      </Button>
    </div>
  );
}
