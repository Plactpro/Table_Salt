import type { Express, Request, Response } from "express";
import { requireAuth, requireRole, requireFreshSession } from "../auth";
import { storage } from "../storage";
import { alertEngine } from "../services/alert-engine";
import { pool } from "../db";
import { z } from "zod";

export function registerAlertSystemRoutes(app: Express): void {

  app.get("/api/alerts/definitions", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const defs = await storage.getAlertDefinitions(user.tenantId);
      res.json(defs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/alerts/events", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const hours = req.query.hours ? parseInt(req.query.hours as string) : 4;
      const events = await storage.getAlertEvents(user.tenantId, outletId, { hours });
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/alerts/events/:id/acknowledge", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { id } = req.params;
      await alertEngine.acknowledge(id, user.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/alerts/outlet-configs/:outletId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const configs = await storage.getAlertOutletConfigs(user.tenantId, outletId);
      const defs = await storage.getAlertDefinitions(user.tenantId);
      const configMap = new Map(configs.map(c => [c.alertCode, c]));
      const merged = defs.map(def => ({
        alertCode: def.alertCode,
        alertName: def.alertName,
        soundKey: def.soundKey,
        urgency: def.urgency,
        canBeDisabled: def.canBeDisabled,
        isEnabled: configMap.get(def.alertCode)?.isEnabled ?? true,
        volumeLevel: configMap.get(def.alertCode)?.volumeLevel ?? 80,
      }));
      res.json(merged);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const upsertConfigSchema = z.object({
    configs: z.array(z.object({
      alertCode: z.string().min(1),
      isEnabled: z.boolean().optional(),
      volumeLevel: z.number().int().min(0).max(100).optional(),
    })),
  });

  app.put("/api/alerts/outlet-configs/:outletId", requireAuth, requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "supervisor"), requireFreshSession, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const parsed = upsertConfigSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: parsed.error.format() });

      const results = [];
      for (const cfg of parsed.data.configs) {
        const row = await storage.upsertAlertOutletConfig({
          tenantId: user.tenantId,
          outletId,
          alertCode: cfg.alertCode,
          isEnabled: cfg.isEnabled,
          volumeLevel: cfg.volumeLevel,
        });
        results.push(row);
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/alerts/pending", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const events = await storage.getUnresolvedAlertEvents(user.tenantId, outletId);
      res.json({ count: events.length, events });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // PR-010: Clear all acknowledged (non-critical) notifications for the current tenant
  app.post("/api/notifications/clear-acknowledged", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { rowCount } = await pool.query(
        `DELETE FROM alert_events
         WHERE tenant_id = $1
           AND is_resolved = true
           AND urgency NOT IN ('critical', 'high')`,
        [user.tenantId]
      );
      res.json({ success: true, deleted: rowCount ?? 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
