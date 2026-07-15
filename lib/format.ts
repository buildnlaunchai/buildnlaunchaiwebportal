/**
 * Date formatting for the mono, machine-shaped values in DESIGN.md §3
 * (timestamps like "14 Jul 2026"). Fixed to en-GB day-month-year and UTC so the
 * server and client always render the same string — a locale-dependent date is
 * a hydration mismatch waiting to happen.
 */
const SHIP_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatShipDate(iso: string): string {
  return SHIP_DATE.format(new Date(iso));
}
