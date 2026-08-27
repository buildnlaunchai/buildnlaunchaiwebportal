// licenceDenialReason — the order, which is the whole of its correctness.
//
//   deno test --allow-env supabase/functions/_shared/client-gate.test.ts
//
// This function decides what a client tells a member about why they were stopped,
// and every wrong answer here sends somebody to a page that cannot help them. The
// two credit reasons were added after both keys endpoints were caught reporting a
// switched-off credit system, and an empty balance, as a dead membership.

import { licenceDenialReason } from "./client-gate.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const LAPSED = {
  suspended: false,
  membershipStatus: "expired",
  membershipExpiresAt: "2026-08-25T23:28:10Z",
};

Deno.test("suspension outranks everything, credit included", () => {
  // Mirrors can_access_tool: "suspended beats everything, incl. admin". A suspended
  // member must never be told to buy credit — it would not help and it is not why.
  const r = licenceDenialReason({ ...LAPSED, suspended: true, creditDenial: "credit_exhausted" });
  assert(r === "suspended", `got ${r}`);
});

Deno.test("a paused credit system outranks the lapsed membership behind it", () => {
  // `membership_inactive` is TRUE here and irrelevant: it has been inactive for
  // weeks and they were running yesterday. What changed is the credit system.
  const r = licenceDenialReason({ ...LAPSED, creditDenial: "credit_mode_disabled" });
  assert(r === "credit_mode_disabled", `got ${r} — the client would offer to renew`);
});

Deno.test("an empty balance does the same", () => {
  const r = licenceDenialReason({ ...LAPSED, creditDenial: "credit_exhausted" });
  assert(r === "credit_exhausted", `got ${r}`);
});

Deno.test("without a credit denial, nothing about the old answers moved", () => {
  assert(
    licenceDenialReason({ ...LAPSED, creditDenial: null }) === "membership_inactive",
    "a lapsed member with no credit story is still membership_inactive",
  );
  assert(
    licenceDenialReason({ suspended: false, membershipStatus: null, membershipExpiresAt: null }) ===
      "no_membership",
    "never subscribed",
  );
  assert(
    licenceDenialReason({ suspended: false, membershipStatus: "active", membershipExpiresAt: null }) ===
      "no_access",
    "paid up, and this tool still is not theirs",
  );
  // Absent, not just null: the parameter is optional and every existing caller
  // omitted it until this change.
  assert(
    licenceDenialReason(LAPSED) === "membership_inactive",
    "omitting the new field must behave exactly as before",
  );
});

Deno.test("a membership that expired outranks a status that says otherwise", () => {
  // The pre-existing guard, kept under test: a stale 'active' row with a past
  // expiry is inactive, and a malformed date must not read as "not expired".
  assert(
    licenceDenialReason({
      suspended: false,
      membershipStatus: "active",
      membershipExpiresAt: "2020-01-01T00:00:00Z",
    }) === "membership_inactive",
    "expired despite the status",
  );
  assert(
    licenceDenialReason({
      suspended: false,
      membershipStatus: "active",
      membershipExpiresAt: "not a date",
    }) === "no_access",
    "an unparseable expiry must not silently expire a live membership",
  );
});
