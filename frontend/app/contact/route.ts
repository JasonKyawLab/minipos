import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { name, email, message } = await req.json();

  if (!name || !email || !message) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  // Notify us
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to:   process.env.CONTACT_EMAIL!,
    replyTo: email,
    subject: `New message from ${name} (${email})`,
    text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#0F2B4C;">New contact from MiniPOS</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#888;width:80px;">Name</td><td style="padding:8px 0;font-weight:500;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#0D7A5F;">${email}</a></td></tr>
        </table>
        <div style="margin-top:16px;padding:16px;background:#F1EFE8;border-radius:8px;">
          <p style="margin:0;white-space:pre-wrap;">${message}</p>
        </div>
      </div>
    `,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }

  // Auto-reply to sender
  await resend.emails.send({
    from:    process.env.RESEND_FROM!,
    to:      email,
    subject: "We received your message — MiniPOS",
    text: `Hi ${name},\n\nThanks for reaching out! We've received your message and will get back to you soon.\n\nYour message:\n"${message}"\n\n— MiniPOS Team`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
        <div style="text-align:center;padding:32px 0 24px;">
          <img src="https://minipos.site/logo.png" alt="MiniPOS" width="140" style="display:inline-block;" />
        </div>
        <h2 style="color:#0F2B4C;margin:0 0 12px;">Thanks for reaching out, ${name}!</h2>
        <p style="color:#5F5E5A;font-size:14px;line-height:1.6;margin:0 0 16px;">
          We've received your message and will get back to you as soon as possible.
        </p>
        <div style="padding:16px;background:#F1EFE8;border-radius:8px;">
          <p style="margin:0;font-size:13px;color:#888;">Your message:</p>
          <p style="margin:8px 0 0;white-space:pre-wrap;font-size:14px;color:#1A1A1A;">${message}</p>
        </div>
        <p style="margin-top:24px;font-size:13px;color:#5F5E5A;">— MiniPOS Team</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #E5E5E5;" />
        <p style="font-size:11px;color:#aaa;text-align:center;margin:0;">
          © 2026 MiniPOS · <a href="https://minipos.site" style="color:#aaa;">minipos.site</a>
        </p>
      </div>
    `,
  });

  return NextResponse.json({ success: true });
}
