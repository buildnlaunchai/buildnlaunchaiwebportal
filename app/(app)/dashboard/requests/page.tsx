import { RequestBoard } from "@/components/dashboard/request-board";
import { requireUser } from "@/lib/access";
import { getFeatureRequests } from "@/lib/requests";

export default async function RequestsPage() {
  await requireUser("/dashboard/requests");
  const { requests, myVotes } = await getFeatureRequests();

  return (
    <div className="max-w-[720px]">
      <h1 className="text-h1">Feature requests</h1>
      <p className="mt-2 text-small text-text-muted">
        Tell me what to build, and upvote what you want most. This is genuinely how
        I decide what ships next.
      </p>
      <div className="mt-8">
        <RequestBoard requests={requests} myVotes={[...myVotes]} />
      </div>
    </div>
  );
}
