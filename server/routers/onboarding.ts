import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../storage";

export function registerOnboardingRoutes(app: Express): void {
  app.patch("/api/onboarding/complete", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role !== "owner") {
        return res.status(403).json({ message: "Only owners can complete onboarding" });
      }
      await storage.updateTenant(user.tenantId, { onboardingCompleted: true });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
