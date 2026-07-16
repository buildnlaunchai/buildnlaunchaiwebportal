import { RedeemForm } from "@/components/dashboard/redeem-form";
import { requireUser } from "@/lib/access";

export default async function RedeemPage() {
  await requireUser("/dashboard/redeem");
  return (
    <div className="mx-auto max-w-[440px]">
      <h1 className="text-h1">Redeem a code</h1>
      <p className="mt-2 text-small text-text-muted">
        Got a code for a membership or a specific tool? Enter it here.
      </p>
      <div className="mt-8">
        <RedeemForm />
      </div>
    </div>
  );
}
