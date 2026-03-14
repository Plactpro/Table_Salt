import type { InsertSalesInquiry } from "@shared/schema";

export const emailConfig = {
  salesEmail: process.env.SALES_EMAIL || "sales@serveos.com",
  ccEmails: process.env.SALES_CC_EMAILS?.split(",").filter(Boolean) || [],
  bccEmails: process.env.SALES_BCC_EMAILS?.split(",").filter(Boolean) || [],
  enableContactSales: process.env.ENABLE_CONTACT_SALES !== "false",
};

function formatInquiryEmail(data: InsertSalesInquiry): string {
  const lines = [
    "=== New Sales Inquiry ===",
    "",
    `Full Name: ${data.fullName}`,
    `Business Name: ${data.businessName}`,
    `Business Type: ${data.businessType}`,
    `Number of Outlets: ${data.numOutlets || "Not specified"}`,
    `Location: ${data.location}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone || "Not provided"}`,
    `Preferred Contact: ${data.preferredContact || "Email"}`,
    `How They Heard: ${data.heardFrom || "Not specified"}`,
    `Subscription Interest: ${(data.subscriptionInterest || []).join(", ") || "Not specified"}`,
    "",
    "--- Message ---",
    data.message,
    "",
    `Wants Demo: ${data.wantsDemo ? "Yes" : "No"}`,
    `Subscribe to Updates: ${data.wantsUpdates ? "Yes" : "No"}`,
    "",
    `Source Page: ${data.sourcePage || "Unknown"}`,
    `User Agent: ${data.userAgent || "Unknown"}`,
    `Timestamp: ${new Date().toISOString()}`,
    "",
    "=========================",
  ];
  return lines.join("\n");
}

export async function sendContactSalesEmail(data: InsertSalesInquiry): Promise<void> {
  console.log(`[Sales Email] To: ${emailConfig.salesEmail}`);
  console.log(`[Sales Email] Subject: New Sales Inquiry from ${data.businessName} (${data.businessType})`);
  console.log(`[Sales Email] Inquiry saved to database. Configure email transport (SMTP/SendGrid) for delivery.`);
}
