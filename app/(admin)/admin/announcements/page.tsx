import { AnnouncementsManager } from "@/components/admin/announcements-manager";
import { requireAdmin } from "@/lib/access";
import { listAnnouncementsForAdmin } from "@/lib/announcements";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const announcements = await listAnnouncementsForAdmin();
  return <AnnouncementsManager initial={announcements} />;
}
