import { CodesManager } from "@/components/admin/codes-manager";
import { requireAdmin } from "@/lib/access";
import { listAccessCodes } from "@/lib/admin-codes";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminCodesPage() {
  await requireAdmin();
  const svc = createAdminClient();

  const [codes, { data: plans }, { data: tools }] = await Promise.all([
    listAccessCodes(),
    svc.from("plans").select("id, name").eq("is_active", true).order("sort_order"),
    svc.from("tools").select("id, name").order("sort_order"),
  ]);

  return <CodesManager initial={codes} plans={plans ?? []} tools={tools ?? []} />;
}
