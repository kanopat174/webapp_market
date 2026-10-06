import { config } from "../config.js";
import { run } from "../db/database.js";

/**
 * Send one email. With RESEND_API_KEY it goes out through Resend; without one it is only
 * recorded (status "logged") so it can be read on the admin Emails page during development.
 * Never throws: email problems must not break checkout or password resets.
 */
export async function sendEmail({ to, subject, html, text, kind }) {
  const log = (status, error = null) =>
    run("INSERT INTO email_log (to_email, subject, kind, status, error, html) VALUES (?, ?, ?, ?, ?, ?)", to, subject, kind, status, error, html);

  if (!config.mail.resendKey) {
    log("logged");
    if (!config.isProd) console.log(`[mail] (not sent, no RESEND_API_KEY) to=${to} subject="${subject}"`);
    return { ok: true, delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.mail.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.mail.from, to: [to], subject, html, text,
        ...(config.mail.replyTo ? { reply_to: config.mail.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      log("failed", `HTTP ${res.status}: ${detail}`);
      console.error(`[mail] Resend rejected email to ${to}: ${res.status} ${detail}`);
      return { ok: false };
    }
    log("sent");
    return { ok: true, delivered: true };
  } catch (err) {
    log("failed", String(err.message || err));
    console.error(`[mail] could not send to ${to}:`, err.message);
    return { ok: false };
  }
}

/** Fire-and-forget wrapper for use after a database write has committed. */
export const queueEmail = (msg) => { sendEmail(msg).catch(() => {}); };
