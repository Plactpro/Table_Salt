import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, hashPassword, requireFreshSession } from "../auth";
import { auditLogFromReq } from "../audit";
import { sendStaffInviteEmail } from "../services/email-service";
import { pool } from "../db";

export function registerUsersRoutes(app: Express): void {
  app.get("/api/users", requireAuth, async (req, res) => {
    const user = req.user as any;
    const users = await storage.getUsersByTenant(user.tenantId);
    const ids = users.map(u => u.id);
    let restrictionMap: Record<string, { processingRestricted: boolean; restrictionReason: string | null; restrictionRequestedAt: string | null }> = {};
    if (ids.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, processing_restricted, restriction_reason, restriction_requested_at FROM users WHERE id = ANY($1)`,
        [ids]
      );
      for (const row of rows) {
        restrictionMap[row.id] = {
          processingRestricted: row.processing_restricted === true,
          restrictionReason: row.restriction_reason ?? null,
          restrictionRequestedAt: row.restriction_requested_at ? row.restriction_requested_at.toISOString() : null,
        };
      }
    }
    res.json(users.map(({ password: _, totpSecret: _ts, recoveryCodes: _rc, passwordHistory: _ph, ...u }) => ({
      ...u,
      ...(restrictionMap[u.id] ?? { processingRestricted: false, restrictionReason: null, restrictionRequestedAt: null }),
    })));
  });

  app.post("/api/users", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!req.body.name || !req.body.name.trim()) {
        return res.status(400).json({ message: "Name is required" });
      }
      if (!req.body.username || !req.body.username.trim()) {
        return res.status(400).json({ message: "Username is required" });
      }
      if (!req.body.role) {
        return res.status(400).json({ message: "Role is required" });
      }
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already taken. Please choose a different username." });
      }
      const plainPassword = req.body.password || "demo123";
      const hashedPw = await hashPassword(plainPassword);
      const tenant = await storage.getTenant(user.tenantId);
      const newUser = await storage.createUser({
        ...req.body,
        tenantId: user.tenantId,
        password: hashedPw,
        preferredLanguage: req.body.preferredLanguage || tenant?.defaultLanguage || "en",
      });
      const { password: _, ...safeUser } = newUser;
      auditLogFromReq(req, { action: "user_created", entityType: "user", entityId: newUser.id, entityName: newUser.name, after: { name: newUser.name, role: newUser.role } });

      if (newUser.email) {
        const appUrl = process.env.APP_URL || "https://tablesalt.app";
        sendStaffInviteEmail(
          newUser.email,
          newUser.name,
          tenant?.name || "your restaurant",
          plainPassword,
          appUrl,
          newUser.role || "staff",
          user.name
        ).catch(() => {});
      }

      res.json(safeUser);
    } catch (err: any) {
      if (err.code === "23505") {
        return res.status(409).json({ message: "Username already taken. Please choose a different username." });
      }
      res.status(500).json({ message: err.message || "Failed to create staff member" });
    }
  });

  app.patch("/api/users/:id", requireRole("owner", "manager"), requireFreshSession, async (req, res) => {
    try {
      const user = req.user as any;
      const data = { ...req.body };
      if (data.name !== undefined && (!data.name || !data.name.trim())) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      if (data.password) {
        data.password = await hashPassword(data.password);
      }
      const updated = await storage.updateUser(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _, totpSecret: _ts, recoveryCodes: _rc, passwordHistory: _ph, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err: any) {
      if (err.code === "23505") {
        return res.status(409).json({ message: "Username already taken" });
      }
      res.status(500).json({ message: err.message || "Failed to update staff member" });
    }
  });

  app.get("/api/outlets", requireAuth, async (req, res) => {
    const user = req.user as any;
    const outletList = await storage.getOutletsByTenant(user.tenantId);
    res.json(outletList);
  });

  app.post("/api/outlets", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    const outlet = await storage.createOutlet({ ...req.body, tenantId: user.tenantId });
    res.json(outlet);
  });

  app.patch("/api/outlets/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as Express.User & { tenantId: string };
    const outlet = await storage.updateOutlet(req.params.id, user.tenantId, req.body);
    res.json(outlet);
  });

  app.delete("/api/outlets/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as Express.User & { tenantId: string };
    await storage.deleteOutlet(req.params.id, user.tenantId);
    res.json({ success: true });
  });
}
