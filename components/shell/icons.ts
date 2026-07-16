import {
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  ScrollText,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons are React components, and a component is a function — so it cannot be
 * passed from a Server Component to a Client Component as a prop. That is not a
 * quirk to work around; it is the RSC boundary telling the truth about what can
 * be serialized.
 *
 * So we pass an icon NAME across the boundary and resolve it to a component on
 * the client. This is the same shape `tools.icon` needs in Phase 2 — that column
 * holds a lucide icon name from the database, which likewise cannot be a
 * function. Building the registry now means the tool cards get it for free.
 */
export const ICONS = {
  apps: LayoutGrid,
  runs: History,
  keys: KeyRound,
  settings: Settings,
  overview: LayoutDashboard,
  applications: Inbox,
  users: Users,
  tools: Wrench,
  audit: ScrollText,
  announcements: Megaphone,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
