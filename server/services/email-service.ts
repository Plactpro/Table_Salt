import { emailBase } from "../templates/email-base";

async function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    console.warn("[EmailService] SMTP not configured — emails will be skipped");
    return null;
  }

  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: { user, pass },
  });
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  try {
    const transport = await getSmtpTransport();
    if (!transport) return;

    const from = process.env.FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@tablesalt.app";

    await transport.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    console.log(`[EmailService] Sent "${opts.subject}" to ${opts.to}`);
  } catch (err: any) {
    console.error(`[EmailService] Failed to send email to ${opts.to}: ${err.message}`);
  }
}

export async function sendWelcomeEmail(email: string, name: string, restaurantName: string): Promise<void> {
  const appUrl = process.env.APP_URL || "https://tablesalt.app";
  const subject = `Welcome to Table Salt, ${restaurantName}!`;
  const body = `
    <p style="font-size:16px;margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 12px;">Your restaurant <strong>${restaurantName}</strong> is now set up on Table Salt.</p>
    <p style="margin:0 0 20px;">Your <strong>14-day free trial</strong> has started. No credit card required yet.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${appUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Open Your Dashboard</a>
    </div>
    <p style="margin:16px 0 8px;font-weight:600;">Quick start tips:</p>
    <ul style="margin:0 0 16px;padding-left:20px;line-height:1.8;">
      <li>Set up your menu with items and categories</li>
      <li>Add your staff members and assign roles</li>
      <li>Take your first order and process payment</li>
    </ul>
    <p style="margin:0;color:#555;">Need help? Reply to this email or use our in-app support.</p>
  `;
  const html = emailBase({ title: `Welcome to Table Salt`, body, footerText: "You received this email because you just registered on Table Salt." });
  await sendEmail({ to: email, subject, html, text: `Hi ${name}, your restaurant ${restaurantName} is now set up on Table Salt. Your 14-day free trial has started. Visit ${appUrl} to get started.` });
}

export async function sendTrialWarningEmail(email: string, restaurantName: string, daysRemaining: number): Promise<void> {
  const appUrl = process.env.APP_URL || "https://tablesalt.app";
  const billingUrl = `${appUrl}/settings?tab=subscription`;
  const subject = `Your Table Salt trial ends in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
  const urgencyColor = daysRemaining === 1 ? "#dc2626" : daysRemaining <= 3 ? "#d97706" : "#2563eb";
  const body = `
    <p style="font-size:16px;margin:0 0 16px;">Hi ${restaurantName} team,</p>
    <div style="background:#fef3c7;border-left:4px solid ${urgencyColor};padding:14px 16px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-weight:600;color:${urgencyColor};">Your free trial ends in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.</p>
    </div>
    <p style="margin:0 0 12px;">When your trial expires, you will lose access to:</p>
    <ul style="margin:0 0 20px;padding-left:20px;line-height:1.8;color:#555;">
      <li>All your restaurant data (orders, customers, menu)</li>
      <li>Staff management and scheduling tools</li>
      <li>Kitchen and inventory management</li>
      <li>Reports and analytics</li>
    </ul>
    <div style="text-align:center;margin:24px 0;">
      <a href="${billingUrl}" style="background:${urgencyColor};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Upgrade Now</a>
    </div>
    <p style="margin:0;color:#555;font-size:14px;">Upgrading takes less than 2 minutes and ensures uninterrupted access to all your data.</p>
  `;
  const html = emailBase({ title: `Trial Expiry Warning`, body, footerText: "You received this email because you have an active trial on Table Salt." });
  await sendEmail({ to: email, subject, html, text: `Your Table Salt trial ends in ${daysRemaining} day(s). Upgrade now at ${billingUrl} to keep access to all your data.` });
}

export async function sendStaffInviteEmail(
  email: string,
  name: string,
  restaurantName: string,
  tempPassword: string,
  appUrl: string,
  role: string,
  ownerName?: string
): Promise<void> {
  const loginUrl = `${appUrl}/login`;
  const subject = `You've been added to ${restaurantName} on Table Salt`;
  const body = `
    <p style="font-size:16px;margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 16px;">${ownerName ? `<strong>${ownerName}</strong> has` : "You have been"} added you to <strong>${restaurantName}</strong> as a <strong>${role}</strong>.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-weight:600;color:#1e293b;">Your login details:</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:14px;width:40%;">Email / Username</td>
          <td style="padding:6px 0;font-weight:600;font-size:14px;">${email}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:14px;">Temporary Password</td>
          <td style="padding:6px 0;font-weight:600;font-size:14px;font-family:monospace;background:#f1f5f9;padding:4px 8px;border-radius:4px;">${tempPassword}</td>
        </tr>
      </table>
    </div>
    <p style="margin:0 0 20px;color:#d97706;font-size:14px;font-weight:500;">Please change your password after your first login.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${loginUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">Login to Table Salt</a>
    </div>
  `;
  const html = emailBase({ title: `You've been added to ${restaurantName}`, body, footerText: "You received this email because an account was created for you on Table Salt." });
  await sendEmail({ to: email, subject, html, text: `Hi ${name}, you've been added to ${restaurantName} on Table Salt as a ${role}. Login at ${loginUrl} with your email ${email} and temporary password: ${tempPassword}. Please change your password after first login.` });
}

export async function sendSupportReplyEmail(
  email: string,
  ticketSubject: string,
  replyMessage: string,
  ticketUrl: string
): Promise<void> {
  const subject = `Reply to your support ticket: ${ticketSubject}`;
  const body = `
    <p style="font-size:16px;margin:0 0 16px;">Hi,</p>
    <p style="margin:0 0 16px;">Our support team has replied to your ticket: <strong>${ticketSubject}</strong></p>
    <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:16px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;color:#1e293b;white-space:pre-wrap;">${replyMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${ticketUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">View Full Conversation</a>
    </div>
    <p style="margin:0;color:#555;font-size:14px;">You can reply directly from the support page in your Table Salt dashboard.</p>
  `;
  const html = emailBase({ title: `Support Reply`, body, footerText: "You received this email because you have an open support ticket on Table Salt." });
  await sendEmail({ to: email, subject, html, text: `Support reply for ticket "${ticketSubject}":\n\n${replyMessage}\n\nView full conversation: ${ticketUrl}` });
}
