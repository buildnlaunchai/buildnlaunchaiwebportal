import { cn } from "@/lib/utils";

/**
 * The Spark mark — a twelve-petal daisy/asterisk, the reference's signature
 * motif (DESIGN.md §3). Petals are `currentColor`, so the mark takes the accent
 * (or any text color) from whatever wraps it; the center pip is a fixed pale
 * lime so it reads as lit rather than punched-out. Decorative — always
 * `aria-hidden`, never a substitute for a text label.
 */
export function SparkMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-full", className)}
      fill="currentColor"
      aria-hidden
    >
      <g>
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse
            key={i}
            cx="50"
            cy="26"
            rx="8.5"
            ry="19"
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
      </g>
      <circle cx="50" cy="50" r="9" fill="#eef7c8" />
    </svg>
  );
}
