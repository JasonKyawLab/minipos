import { Resend } from "resend";
import { env } from "../config/validation.js";

const resend = new Resend(env.RESEND_API_KEY);

const LOGO = `<img src="${env.APP_URL}/logo.png" alt="MiniPOS" width="140" style="display:inline-block;" />`;
const FOOTER = `
  <hr style="margin:24px 0;border:none;border-top:1px solid #E5E5E5;" />
  <p style="font-size:11px;color:#aaa;text-align:center;margin:0;">
    © 2026 MiniPOS · <a href="${env.APP_URL}" style="color:#aaa;">${env.APP_URL}</a>
  </p>`;

function wrap(body: string) {
  return `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
      <div style="text-align:center;padding:32px 0 24px;">${LOGO}</div>
      ${body}
      ${FOOTER}
    </div>`;
}

export async function sendVerificationEmail(to: string, name: string, verifyUrl: string) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return;

  await resend.emails.send({
    from:    env.RESEND_FROM,
    to,
    subject: "Verify your MiniPOS email",
    text:    `Hi ${name},\n\nPlease verify your email by clicking the link below (valid for 24 hours):\n\n${verifyUrl}\n\n— MiniPOS Team`,
    html: wrap(`
      <h2 style="color:#0F2B4C;margin:0 0 12px;">Verify your email</h2>
      <p style="color:#5F5E5A;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Hi ${name}, thanks for signing up! Click the button below to verify your email address.
        The link expires in <strong>24 hours</strong>.
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${verifyUrl}"
           style="display:inline-block;padding:12px 28px;background:#0D7A5F;color:#fff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
          Verify email
        </a>
      </div>
      <p style="font-size:13px;color:#888;margin:0;">
        If you didn't create a MiniPOS account, you can safely ignore this email.
      </p>`),
  });
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return;

  await resend.emails.send({
    from:    env.RESEND_FROM,
    to,
    subject: "Reset your MiniPOS password",
    text:    `Hi ${name},\n\nClick the link below to reset your password (valid for 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.\n\n— MiniPOS Team`,
    html: wrap(`
      <h2 style="color:#0F2B4C;margin:0 0 12px;">Reset your password</h2>
      <p style="color:#5F5E5A;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Hi ${name}, we received a request to reset your MiniPOS password.
        Click the button below — the link expires in <strong>1 hour</strong>.
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${resetUrl}"
           style="display:inline-block;padding:12px 28px;background:#0D7A5F;color:#fff;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
          Reset password
        </a>
      </div>
      <p style="font-size:13px;color:#888;margin:0;">
        If you didn't request a password reset, you can safely ignore this email.
      </p>`),
  });
}
