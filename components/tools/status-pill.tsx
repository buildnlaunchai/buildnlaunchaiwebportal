import { cn } from "@/lib/utils";

/* DESIGN.md §9 — Status pill.
   --radius-pill, mono-chip, 4/8 padding, --*-quiet background, --* text, a 6px
   dot before the label. The dot only pulses in RUNNING (added in Phase 6, when
   there is a run to pulse for).

   The mapping is fixed by §9: QUEUED faint · RUNNING accent · DONE live ·
   FAILED/TIMEOUT danger · ACTIVE live · PENDING/LOCKED warn · INVALID danger. */

type Tone = "faint" | "accent" | "live" | "warn" | "danger";

const TONE: Record<Tone, string> = {
  faint: "bg-elevated text-text-faint",
  accent: "bg-accent-quiet text-accent",
  live: "bg-live-quiet text-live",
  warn: "bg-warn-quiet text-warn",
  danger: "bg-danger-quiet text-danger",
};

const DOT: Record<Tone, string> = {
  faint: "bg-text-faint",
  accent: "bg-accent",
  live: "bg-live",
  warn: "bg-warn",
  danger: "bg-danger",
};

export function StatusPill({
  label,
  tone,
  dot = true,
  className,
}: {
  label: string;
  tone: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-mono-chip inline-flex items-center gap-2 rounded-pill px-2 py-1 uppercase",
        TONE[tone],
        className,
      )}
    >
      {dot && (
        <span aria-hidden className={cn("size-1.5 rounded-pill", DOT[tone])} />
      )}
      {label}
    </span>
  );
}
