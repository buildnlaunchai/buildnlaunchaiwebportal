import { ToolsList } from "@/components/admin/tools-list";
import { requireAdmin } from "@/lib/access";
import { listToolsForAdmin } from "@/lib/admin-tools";

export default async function AdminToolsPage() {
  await requireAdmin();
  const tools = await listToolsForAdmin();
  return <ToolsList initial={tools} />;
}
