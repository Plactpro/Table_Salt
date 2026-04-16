import nodemailer from "nodemailer";
import type { InsertSalesInquiry, InsertSupportTicket } from "@shared/schema";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true";

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

const FROM_ADDRESS = process.env.SMTP_FROM || "noreply@tablesalt.app";

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  appUrl: string
): Promise<void> {
  const resetLink = `${appUrl}/reset-password?token=${token}`;
  const transport = createTransport();

  if (!transport) {
    console.warn("[Password Reset Email] SMTP not configured — email not sent.");
    return;
  }

  await transport.sendMail({
    from: FROM_ADDRESS,
    to: email,
    subject: "Reset your Table Salt password",
    text: `You requested a password reset. Click the link below to set a new password (expires in 1 hour):\n\n${resetLink}\n\nIf you did not request this, ignore this email.`,
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${resetLink}">Reset your password</a> (expires in 1 hour).</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });

  console.log(`[Password Reset Email] Sent to user (email redacted for security)`);
}

export const emailConfig = {
  sales: {
    email: process.env.SALES_EMAIL || "sales@tablesalt.app",
    cc: process.env.SALES_CC_EMAILS?.split(",").filter(Boolean) || [],
    subjectPrefix: "Sales Inquiry",
  },
  support: {
    email: process.env.SUPPORT_EMAIL || "support@tablesalt.app",
    cc: process.env.SUPPORT_CC_EMAILS?.split(",").filter(Boolean) || [],
    subjectPrefix: "Support Request",
  },
  enableContactSales: process.env.ENABLE_CONTACT_SALES !== "false",
  enableContactSupport: process.env.ENABLE_CONTACT_SUPPORT !== "false",
};

export async function sendContactSalesEmail(data: InsertSalesInquiry): Promise<void> {
  console.log(`[Sales Email] Inquiry saved to database. Configure email transport (SMTP/SendGrid) for delivery.`);
}

export async function sendSupportEmail(data: InsertSupportTicket, referenceNumber: string): Promise<void> {
  const urgencyTag = data.urgency === "critical" || data.urgency === "high" ? `[${data.urgency?.toUpperCase()}] ` : "";
  console.log(`[Support Email] Ticket ${referenceNumber} saved to database. Configure email transport (SMTP/SendGrid) for delivery.`);
}
