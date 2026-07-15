import {
  Box,
  FileText,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Mic,
  Newspaper,
  PenLine,
  Search,
  Sparkles,
  Users,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Resolves tools.icon (a lucide name string from the database) to a component.
 *
 * A curated allow-list, not a dynamic lookup over all of lucide: the icon name
 * is admin-authored data, and rendering an arbitrary string as a component name
 * is both a tree-shaking problem and a small injection surface. The admin editor
 * (Phase 7) will pick from exactly this set. Unknown names fall back to Box, so
 * a typo degrades to a neutral icon rather than a blank card.
 */
const TOOL_ICONS: Record<string, LucideIcon> = {
  search: Search,
  users: Users,
  newspaper: Newspaper,
  "message-circle": MessageCircle,
  mail: Mail,
  video: Video,
  image: ImageIcon,
  mic: Mic,
  "pen-line": PenLine,
  "file-text": FileText,
  sparkles: Sparkles,
  wrench: Wrench,
};

export function ToolIcon({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  const Icon = (name && TOOL_ICONS[name]) || Box;
  return <Icon aria-hidden className={cn("size-5", className)} strokeWidth={1.5} />;
}
