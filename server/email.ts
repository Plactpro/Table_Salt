import type { InsertSalesInquiry, InsertSupportTicket } from "@shared/schema";

export const emailConfig = {
  sales: {
    email: process.env.SALES_EMAIL || "sales@serveos.com",
    cc: process.env.SALES_CC_EMAILS?.split(",").filter(Boolean) || [],
    subjectPrefix: "Sales Inquiry",
  },
  support: {
    email: process.env.SUPPORT_EMAIL || "support@serveos.com",
    cc: process.env.SUPPORT_CC_EMAILS?.split(",").filter(Boolean) || [],
    subjectPrefix: "Support Request",
  },
  enableContactSales: process.env.ENABLE_CONTACT_SALES !== "false",
  enableContactSupport: process.env.ENABLE_CONTACT_SUPPORT !== "false",
};

export async function sendContactSalesEmail(data: InsertSalesInquiry): Promise<void> {
  console.log(`[Sales Email] To: ${emailConfig.sales.email}`);
  console.log(`[Sales Email] Subject: ${emailConfig.sales.subjectPrefix} - ${data.businessName} (${data.businessType})`);
  console.log(`[Sales Email] Inquiry saved to database. Configure email transport (SMTP/SendGrid) for delivery.`);
}

export async function sendSupportEmail(data: InsertSupportTicket, referenceNumber: string): Promise<void> {
  const urgencyTag = data.urgency === "critical" || data.urgency === "high" ? `[${data.urgency?.toUpperCase()}] ` : "";
  console.log(`[Support Email] To: ${emailConfig.support.email}`);
  console.log(`[Support Email] Subject: ${urgencyTag}${emailConfig.support.subjectPrefix}: ${data.issueType} - ${data.shortDescription} (${referenceNumber})`);
  console.log(`[Support Email] Ticket saved to database. Configure email transport (SMTP/SendGrid) for delivery.`);
}
