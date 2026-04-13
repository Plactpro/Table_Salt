import type { Express } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { campaigns } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export function registerCampaignsRoutes(app: Express) {
  // List campaigns
  app.get("/api/campaigns", requireAuth, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const result = await db.select().from(campaigns)
        .where(eq(campaigns.tenantId, tenantId))
        .orderBy(desc(campaigns.createdAt));
      res.json(result);
    } catch (err: any) {
      console.error("[campaigns] list error:", err);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Create campaign
  app.post("/api/campaigns", requireAuth, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;
      const { name, subject, body, targetTier, targetTags, scheduledAt } = req.body;
      if (!name || !subject || !body) {
        return res.status(400).json({ message: "Name, subject, and body are required" });
      }
      const [campaign] = await db.insert(campaigns).values({
        tenantId,
        name,
        subject,
        body,
        targetTier: targetTier || null,
        targetTags: targetTags || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        createdBy: userId,
        status: "draft",
      }).returning();
      res.status(201).json(campaign);
    } catch (err: any) {
      console.error("[campaigns] create error:", err);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Update campaign
  app.patch("/api/campaigns/:id", requireAuth, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const updates = req.body;
      const [updated] = await db.update(campaigns)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Campaign not found" });
      res.json(updated);
    } catch (err: any) {
      console.error("[campaigns] update error:", err);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // Delete campaign
  app.delete("/api/campaigns/:id", requireAuth, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const [deleted] = await db.delete(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
        .returning();
      if (!deleted) return res.status(404).json({ message: "Campaign not found" });
      res.json({ message: "Campaign deleted" });
    } catch (err: any) {
      console.error("[campaigns] delete error:", err);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // Send campaign (mark as sent)
  app.post("/api/campaigns/:id/send", requireAuth, async (req: any, res) => {
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const [campaign] = await db.update(campaigns)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
        .returning();
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      res.json({ message: "Campaign sent", campaign });
    } catch (err: any) {
      console.error("[campaigns] send error:", err);
      res.status(500).json({ message: "Failed to send campaign" });
    }
  });
}
