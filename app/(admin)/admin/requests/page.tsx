import { RequestsManager } from "@/components/admin/requests-manager";
import { requireAdmin } from "@/lib/access";
import { getRequestsForAdmin } from "@/lib/requests";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminRequestsPage() {
  await requireAdmin();
  const svc = createAdminClient();
  const [requests, { data: tools }] = await Promise.all([
    getRequestsForAdmin(),
    svc.from("tools").select("id, name").order("sort_order"),
  ]);
  return <RequestsManager initial={requests} tools={tools ?? []} />;
}
