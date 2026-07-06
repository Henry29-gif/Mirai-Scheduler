import { logger } from "../utils/logger";

// Transactional email. Provider-agnostic: sends via Resend's HTTP API when
// RESEND_API_KEY is set, otherwise logs the message to the server console (dev
// mode) so flows can be built and tested before an email account exists.
//
// To go live: sign up at resend.com (simplest; free tier), verify your sending
// domain, then set RESEND_API_KEY and EMAIL_FROM in the backend environment.
// Swapping to SendGrid/Postmark/SES later means changing only `sendEmail` below.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "NurseScheduler <onboarding@resend.dev>";

export const emailIsLive = !!RESEND_API_KEY;

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!RESEND_API_KEY) {
    // In production, NEVER log message bodies (password-reset emails contain a
    // live sign-in token) — fail loudly so the missing key gets configured.
    if (process.env.NODE_ENV === "production") {
      logger.error(`Email NOT sent (RESEND_API_KEY is not configured): "${subject}"`);
      throw new Error("Email is not configured");
    }
    logger.info(`[email:dev] (no RESEND_API_KEY — not sent)\n  to: ${to}\n  subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error(`Resend email failed: ${res.status} ${body}`);
    throw new Error("Email delivery failed");
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const subject = "Reset your NurseScheduler password";
  const text =
    `We received a request to reset your NurseScheduler password.\n\n` +
    `Reset it here (this link expires in 1 hour):\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't change.`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0F1B2D">
      <h2 style="color:#14263D">Reset your password</h2>
      <p>We received a request to reset your NurseScheduler password.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#2AA6A1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Reset password</a>
      </p>
      <p style="color:#5B677A;font-size:14px">This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.</p>
      <p style="color:#5B677A;font-size:13px;word-break:break-all">Or paste this link into your browser:<br>${resetUrl}</p>
    </div>`;
  await sendEmail(to, subject, html, text);
}
