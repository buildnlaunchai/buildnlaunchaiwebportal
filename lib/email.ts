import "server-only";

/**
 * Email via Resend, called by REST (no SDK dependency, and the same shape works
 * in Deno for the run-tool Edge Function). Sends happen ONLY here or in an Edge
 * Function — never a client component (§11).
 *
 * Best-effort: a mail failure must never break the mutation that triggered it.
 * Every path returns void and swallows its own errors.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.warn("Resend not configured — skipping email:", opts.subject);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) console.error("Resend send failed:", res.status);
  } catch (err) {
    console.error("Resend send threw (non-fatal):", (err as Error).message);
  }
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://buildnlaunchai.com"
  );
}

/* ---------- The branded shell -------------------------------------------
   Inline styles only — email clients strip <style>. Voice from DESIGN.md §12:
   sentence case, active voice, no exclamation marks, no "Oops". */
function shell(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0f1013;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
      <tr><td style="padding:0 24px 20px;">
        <span style="color:#ecedf1;font-size:15px;font-weight:600;">Build &amp; Launch</span>
      </td></tr>
      <tr><td style="background:#17181d;border:1px solid #2b2e37;border-radius:10px;padding:28px 24px;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:16px 24px;color:#5d6270;font-size:12px;">
        Build &amp; Launch AI — a private lab of AI automation tools.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;color:#ecedf1;font-size:20px;font-weight:600;">${text}</h1>`;
}
function para(text: string): string {
  return `<p style="margin:0 0 14px;color:#8e94a3;font-size:15px;line-height:1.6;">${text}</p>`;
}
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:6px;background:#6366f1;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:6px;">${label}</a>`;
}

export type EmailContent = { subject: string; html: string };

/* ---------- The templates (§11) ----------------------------------------- */

export function applicationReceivedEmail(name: string): EmailContent {
  return {
    subject: "I got your application",
    html: shell(
      heading("I got it") +
        para(`Thanks${name ? `, ${name}` : ""} — your application is in. I review these personally, usually within a day, and you'll hear from me by email.`) +
        para("In the meantime, a few tools are open to everyone — no approval, no key needed.") +
        button(`${siteUrl()}/tools`, "Browse the tools"),
    ),
  };
}

export function approvedEmail(name: string, skoolUrl?: string | null): EmailContent {
  return {
    subject: "You're in",
    html: shell(
      heading("You're in") +
        para(`${name ? `${name}, y` : "Y"}our application is approved. Your tools are unlocked — connect a provider key and run your first one.`) +
        button(`${siteUrl()}/dashboard`, "Go to your dashboard") +
        (skoolUrl ? para(`<br/>Come say hi in the community: <a href="${skoolUrl}" style="color:#7175f3;">${skoolUrl}</a>`) : ""),
    ),
  };
}

export function waitlistedEmail(name: string): EmailContent {
  return {
    subject: "You're on the waitlist",
    html: shell(
      heading("You're on the waitlist") +
        para(`${name ? `${name}, t` : "T"}hanks for applying. I'm adding people as I add capacity, and you're on the list — I'll email you the moment there's room.`) +
        para("The open tools need no approval and no key, if you'd like to try one now.") +
        button(`${siteUrl()}/tools`, "Try the open tools"),
    ),
  };
}

export function toolPublishedEmail(toolName: string, tagline: string, slug: string): EmailContent {
  return {
    subject: `New tool: ${toolName}`,
    html: shell(
      heading(`New tool: ${toolName}`) +
        para(tagline) +
        button(`${siteUrl()}/dashboard/tools/${slug}`, "Open it"),
    ),
  };
}

export function toolAccessGrantedEmail(toolName: string, slug: string): EmailContent {
  return {
    subject: `You've got access to ${toolName}`,
    html: shell(
      heading(`${toolName} is unlocked`) +
        para("I've granted you access to this tool. Connect any key it needs and give it a run.") +
        button(`${siteUrl()}/dashboard/tools/${slug}`, "Run it"),
    ),
  };
}

export function keyStoppedWorkingEmail(provider: string, toolName: string, hint: string): EmailContent {
  return {
    subject: `Your ${provider} key stopped working`,
    html: shell(
      heading(`${provider} rejected your key`) +
        para(`Your ${provider} key (ending ${hint}) was refused during a run of ${toolName}, so I've marked it invalid. It may have been revoked, or run out of credit on ${provider}'s side. Nothing was charged on my end.`) +
        para("Update the key and you're back in business.") +
        button(`${siteUrl()}/dashboard/keys?provider=${provider}`, "Update your key"),
    ),
  };
}
