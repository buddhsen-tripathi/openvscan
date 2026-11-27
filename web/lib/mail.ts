import { env } from "cloudflare:workers";

/**
 * Transactional email (verification, password reset) through Cloudflare Email
 * Service. Needs a `send_email` binding named EMAIL and EMAIL_FROM set to an
 * address on a domain onboarded with `wrangler email sending enable`.
 */

export function isMailConfigured(): boolean {
  return Boolean(env.EMAIL && env.EMAIL_FROM);
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );

/** One short paragraph plus a single call-to-action link. */
export async function sendActionEmail(opts: {
  to: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}) {
  const text = `${opts.intro}\n\n${opts.action}: ${opts.url}\n\n${opts.outro}\n\n— OpenVScan`;
  if (!isMailConfigured()) {
    // Local development without a binding: print the link instead of failing.
    if (import.meta.env.DEV) {
      console.info(`[mail] to=${opts.to} subject="${opts.subject}"\n${text}`);
      return;
    }
    throw new Error("Email delivery is not configured on this deployment");
  }
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f6f4ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1b17">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e4e0d6;border-radius:10px;padding:28px">
<p style="margin:0 0 20px;font-weight:600;font-size:15px">OpenVScan</p>
<p style="margin:0 0 20px;font-size:14.5px;line-height:1.6">${escapeHtml(opts.intro)}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#1d1b17;color:#f6f4ef;text-decoration:none;font-size:14px;font-weight:500;padding:10px 16px;border-radius:7px">${escapeHtml(opts.action)}</a></p>
<p style="margin:0;font-size:12.5px;line-height:1.6;color:#6b675e">${escapeHtml(opts.outro)}</p>
</div></body></html>`;
  await env.EMAIL.send({
    to: opts.to,
    from: { email: env.EMAIL_FROM, name: "OpenVScan" },
    subject: opts.subject,
    text,
    html,
  });
}
