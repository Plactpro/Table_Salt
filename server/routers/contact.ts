import type { Express } from "express";
import { storage } from "../storage";
import { insertSalesInquirySchema, insertSupportTicketSchema } from "@shared/schema";
import { sendContactSalesEmail, sendSupportEmail, emailConfig } from "../email";

export function registerContactRoutes(app: Express): void {
  app.post("/api/contact-sales", async (req, res) => {
    try {
      if (!emailConfig.enableContactSales) {
        return res.status(403).json({ message: "Contact sales is currently disabled" });
      }
      const parsed = insertSalesInquirySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }
      const inquiry = await storage.createSalesInquiry(parsed.data);
      try {
        await sendContactSalesEmail(parsed.data);
      } catch (emailErr) {
        console.error("[Contact Sales] Email notification failed (inquiry saved):", emailErr);
      }
      res.json({ message: "Inquiry submitted successfully", id: inquiry.id });
    } catch (err: any) {
      console.error("[Contact Sales Error]", err);
      res.status(500).json({ message: "Failed to submit inquiry. Please try again." });
    }
  });

  app.post("/api/contact-support", async (req, res) => {
    try {
      if (!emailConfig.enableContactSupport) {
        return res.status(403).json({ message: "Contact support is currently disabled" });
      }
      const parsed = insertSupportTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten().fieldErrors });
      }
      const data = { ...parsed.data };
      const authUser = req.user as any;
      if (authUser) {
        data.tenantId = authUser.tenantId || data.tenantId;
        data.userId = authUser.id || data.userId;
        data.userName = authUser.name || data.userName;
      }
      const ticket = await storage.createSupportTicket(data);
      try {
        await sendSupportEmail(data, ticket.referenceNumber || "");
      } catch (emailErr) {
        console.error("[Contact Support] Email notification failed (ticket saved):", emailErr);
      }
      res.json({
        message: "Support ticket created successfully",
        id: ticket.id,
        referenceNumber: ticket.referenceNumber,
      });
    } catch (err: any) {
      console.error("[Contact Support Error]", err);
      res.status(500).json({ message: "Failed to create support ticket. Please try again." });
    }
  });
}
