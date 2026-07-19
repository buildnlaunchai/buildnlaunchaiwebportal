import { RequestBoard } from "@/components/dashboard/request-board";
import { requireUser } from "@/lib/access";
import { getFeatureRequests } from "@/lib/requests";

export default async function RequestsPage() {
  await requireUser("/dashboard/requests");
  const { requests, myVotes } = await getFeatureRequests();

  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <p className="text-small text-text-muted prose-measure">
        Tell me what to build, and upvote what you want most. This is genuinely how
        I decide what ships next.
      </p>
      <RequestBoard requests={requests} myVotes={[...myVotes]} />
    </div>
  );
}
