import { RedeemForm } from "@/components/dashboard/redeem-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/access";

export default async function RedeemPage() {
  await requireUser("/dashboard/redeem");
  return (
    <div className="mx-auto max-w-[440px]">
      <PageHeader
        back={{ href: "/dashboard/settings", label: "Settings" }}
        title="Redeem a code"
        description="Got a code for a membership or a specific tool? Enter it here."
      />
      <RedeemForm />
    </div>
  );
}
