"use client";

import { PROVIDERS } from "@/lib/providers";
import type { ApiProvider } from "@/lib/providers";
import { cn } from "@/lib/utils";

/** BYOK required-providers picker (§8). Toggle the keys a tool needs to run. */
export function ProviderPicker({
  selected,
  onChange,
}: {
  selected: ApiProvider[];
  onChange: (providers: ApiProvider[]) => void;
}) {
  const toggle = (p: ApiProvider) =>
    onChange(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => {
          const on = selected.includes(p.value);
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(p.value)}
              className={cn(
                "text-mono-chip rounded-pill border px-3 py-1.5 transition-colors duration-micro ease-default",
                on
                  ? "border-accent bg-accent-quiet text-accent"
                  : "border-line bg-surface text-text-muted hover:border-line-strong hover:text-text",
              )}
            >
              {p.value}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-small text-text-faint">
        {selected.length === 0
          ? "No keys needed — this tool can be a public preview."
          : `Members must connect: ${selected.join(", ")}.`}
      </p>
    </div>
  );
}
