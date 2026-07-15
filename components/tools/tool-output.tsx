"use client";

import { Download, FileWarning } from "lucide-react";
import { useState } from "react";

import { Markdown } from "@/components/tools/markdown";
import type { OutputBlock, OutputSchema } from "@/lib/tool-schema";
import { cn } from "@/lib/utils";

/**
 * The generic output renderer (CLAUDE.md §3). Walks a tool's output_schema and
 * renders each block from the run's output data, in order. One of the two
 * components at the heart of the product.
 */
function TableBlock({ rows, columns }: { rows: unknown; columns?: string[] }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="text-small text-text-faint">No rows.</p>;
  }
  const cols = columns && columns.length > 0 ? columns : Object.keys(rows[0] ?? {});
  return (
    // §9 Table: on mobile it would become cards; for dense run output a scroll
    // container is acceptable and never scrolls the page (overflow is local).
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full border-collapse text-small">
        <thead>
          <tr className="border-b border-line">
            {cols.map((c) => (
              <th key={c} className="text-eyebrow px-3 py-2 text-left text-text-faint">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0 hover:bg-elevated">
              {cols.map((c) => {
                const v = (row as Record<string, unknown>)?.[c];
                const text = v == null ? "—" : String(v);
                const isUrl = /^https?:\/\//.test(text);
                return (
                  <td key={c} className="tabular px-3 py-2 align-top text-text">
                    {isUrl ? (
                      <a
                        href={text}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent-hover"
                      >
                        {text.replace(/^https?:\/\//, "").slice(0, 40)}
                      </a>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JsonBlock({ value, collapsed }: { value: unknown; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-small text-text-muted hover:text-text"
      >
        {open ? "Hide" : "Show"} raw
      </button>
      {open && (
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-line bg-sunken p-3 text-mono text-text-muted">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function FileBlock({ value, label }: { value: unknown; label?: string }) {
  // A re-hosted artifact is { storagePath } and its URL is signed server-side;
  // if we only have that shape here (no URL resolved), it's expired or pending.
  const url =
    typeof value === "string" && /^https?:\/\//.test(value) ? value : null;
  if (!url) {
    return (
      <div className="inline-flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-small text-text-faint">
        <FileWarning aria-hidden className="size-4" strokeWidth={1.5} />
        File expired · files are kept for 30 days
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2 text-small text-text transition-colors duration-micro ease-default hover:border-line-strong"
    >
      <Download aria-hidden className="size-4" strokeWidth={1.5} />
      {label ?? "Download"}
    </a>
  );
}

function Block({ block, data }: { block: OutputBlock; data: Record<string, unknown> }) {
  const value = data[block.key];

  const body = (() => {
    switch (block.type) {
      case "markdown":
        return typeof value === "string" ? <Markdown source={value} /> : null;
      case "table":
        return <TableBlock rows={value} columns={block.columns} />;
      case "json":
        return <JsonBlock value={value} collapsed={block.collapsed} />;
      case "file":
        return <FileBlock value={value} label={block.label} />;
      case "image":
        return typeof value === "string" && /^https?:\/\//.test(value) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={block.label ?? ""} className="max-w-full rounded-md border border-line" />
        ) : (
          <FileBlock value={value} label={block.label} />
        );
      default:
        return null;
    }
  })();

  if (body == null) return null;

  return (
    <div className="flex flex-col gap-2">
      {block.label && block.type !== "file" && (
        <p className="text-eyebrow text-text-faint">{block.label}</p>
      )}
      {body}
    </div>
  );
}

export function ToolOutput({
  schema,
  data,
  className,
}: {
  schema: OutputSchema;
  data: Record<string, unknown>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {schema.blocks.map((block, i) => (
        <Block key={`${block.key}-${i}`} block={block} data={data} />
      ))}
    </div>
  );
}
