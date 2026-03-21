import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";

export function registerPrintJobRoutes(app: Express): void {
  app.get("/api/print-jobs", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const referenceId = req.query.referenceId as string | undefined;
      const jobs = await storage.getPrintJobsByTenant(user.tenantId, { status, limit, referenceId });
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print-jobs", requireRole("owner", "manager", "cashier", "waiter", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const { type, referenceId, station, payload } = req.body;
      if (!type || !referenceId) {
        return res.status(400).json({ message: "type and referenceId are required" });
      }
      const job = await storage.createPrintJob({
        tenantId: user.tenantId,
        type,
        referenceId,
        station: station ?? null,
        status: "queued",
        payload: payload ?? {},
      });
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/print-jobs/:id/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status } = req.body;
      if (!["queued", "printed", "failed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const job = await storage.updatePrintJob(req.params.id, user.tenantId, { status });
      if (!job) return res.status(404).json({ message: "Print job not found" });
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
