import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { customers } from "@shared/schema";

export function registerCustomersRoutes(app: Express): void {
  app.get("/api/customers", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const [data, [{ total }]] = await Promise.all([
        storage.getCustomersByTenant(user.tenantId, { limit, offset }),
        db.select({ total: sql<number>`count(*)::int` }).from(customers).where(eq(customers.tenantId, user.tenantId)),
      ]);
      res.json({ data, total: Number(total), limit, offset });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/customers", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customer = await storage.createCustomer({ ...req.body, tenantId: user.tenantId });
    res.json(customer);
  });

  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customer = await storage.getCustomerByTenant(req.params.id, user.tenantId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.patch("/api/customers/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customer = await storage.updateCustomerByTenant(req.params.id, user.tenantId, req.body);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.delete("/api/customers/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteCustomerByTenant(req.params.id, user.tenantId);
    res.json({ message: "Deleted" });
  });

  app.get("/api/customers/by-tier/:tier", requireAuth, async (req, res) => {
    const user = req.user as any;
    const custs = await storage.getCustomersByLoyaltyTier(user.tenantId, req.params.tier);
    res.json(custs);
  });

  app.get("/api/customers/by-tag/:tag", requireAuth, async (req, res) => {
    const user = req.user as any;
    const custs = await storage.getCustomersByTags(user.tenantId, req.params.tag);
    res.json(custs);
  });
}
