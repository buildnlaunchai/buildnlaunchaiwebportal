import "server-only";

import { sendEmail, type EmailContent } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Write an in-app notification (the bell) and, optionally, send the matching
 * email — every email is also a notification (§11). Writes use the service role
 * because notifications have no client insert path. Best-effort: never throws.
 */
export async function notifyUser(opts: {
  userId: string;
  title: string;
  body?: string;
  href?: string;
  email?: { to: string } & EmailContent;
}): Promise<void> {
  const admin = createAdminClient();
  try {
    await admin.from("notifications").insert({
      user_id: opts.userId,
      title: opts.title,
      body: opts.body ?? null,
      href: opts.href ?? null,
    });
  } catch (err) {
    console.error("notification write failed (non-fatal):", (err as Error).message);
  }

  if (opts.email) {
    await sendEmail({ to: opts.email.to, subject: opts.email.subject, html: opts.email.html });
  }
}

/**
 * Fan-out: notify every ACTIVE member (used for "new tool published", §11).
 * Bulk-inserts the notifications and batches the emails through Resend.
 */
export async function notifyActiveMembers(opts: {
  title: string;
  body?: string;
  href?: string;
  email: EmailContent;
}): Promise<number> {
  const admin = createAdminClient();

  // Active members = active/trialing membership, not expired, not suspended.
  const { data: members } = await admin
    .from("memberships")
    .select("user_id, status, expires_at, profiles!inner(email, is_suspended)")
    .in("status", ["active", "trialing"]);

  const recipients = (members ?? [])
    .filter((m) => {
      const p = m.profiles as unknown as { email: string; is_suspended: boolean };
      return (
        !p.is_suspended &&
        (m.expires_at === null || new Date(m.expires_at) > new Date())
      );
    })
    .map((m) => ({
      user_id: m.user_id,
      email: (m.profiles as unknown as { email: string }).email,
    }));

  if (recipients.length === 0) return 0;

  // In-app notifications, one bulk insert.
  await admin.from("notifications").insert(
    recipients.map((r) => ({
      user_id: r.user_id,
      title: opts.title,
      body: opts.body ?? null,
      href: opts.href ?? null,
    })),
  );

  // Emails, batched (Resend accepts up to 100 per batch call).
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (key && from) {
    for (let i = 0; i < recipients.length; i += 100) {
      const chunk = recipients.slice(i, i + 100);
      try {
        await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify(
            chunk.map((r) => ({
              from,
              to: r.email,
              subject: opts.email.subject,
              html: opts.email.html,
            })),
          ),
        });
      } catch (err) {
        console.error("batch email failed (non-fatal):", (err as Error).message);
      }
    }
  }

  return recipients.length;
}
