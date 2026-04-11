import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../auth";
import { customers, type InsertCustomer } from "@shared/schema";

export function registerCustomersRoutes(app: Express): void {
  app.get("/api/customers", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const phone = req.query.phone as string | undefined;
      if (phone) {
        const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");
        const match = await db
          .select()
          .from(customers)
          .where(
            sql`${customers.tenantId} = ${user.tenantId} AND REGEXP_REPLACE(COALESCE(${customers.phone}, ''), '[\\s\\-\\(\\)]', '', 'g') = ${normalizedPhone}`
          );
        return res.json({ data: match, total: match.length, limit: match.length, offset: 0, hasMore: false });
      }
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const [data, [{ total }]] = await Promise.all([
        storage.getCustomersByTenant(user.tenantId, { limit, offset }),
        db.select({ total: sql<number>`count(*)::int` }).from(customers).where(eq(customers.tenantId, user.tenantId)),
      ]);
      res.json({ data, total: Number(total), limit, offset, hasMore: offset + data.length < Number(total) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/customers", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customer = await storage.createCustomer({ ...req.body, tenantId: user.tenantId });
    res.json(customer);
  });

  app.get("/api/customers/lookup", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const phone = req.query.phone as string | undefined;
      if (!phone || !phone.trim()) return res.status(400).json({ message: "phone query param is required" });
      const normalizedPhone = phone.trim().replace(/[\s\-\(\)]/g, "");
      const found = await db
        .select()
        .from(customers)
        .where(
          sql`${customers.tenantId} = ${user.tenantId} AND REGEXP_REPLACE(COALESCE(${customers.phone}, ''), '[\\s\\-\\(\\)]', '', 'g') = ${normalizedPhone}`
        )
        .limit(1);
      const match = found[0];
      if (!match) return res.status(404).json({ message: "Customer not found" });

      const tenantOffers = await storage.getOffersByTenant(user.tenantId);
      const activeOffers = tenantOffers
        .filter(o => o.active && (o.type === "percentage" || o.type === "fixed_amount"))
        .filter(o => /birthday|anniversary/i.test(o.name))
        .map(o => ({
          id: o.id,
          name: o.name,
          type: o.type,
          value: o.value,
          maxDiscount: o.maxDiscount ?? null,
        }));

      res.json({
        id: match.id,
        name: match.name,
        email: match.email,
        phone: match.phone,
        loyaltyTier: match.loyaltyTier,
        loyaltyPoints: match.loyaltyPoints,
        totalSpent: match.totalSpent,
        visitCount: match.visitCount,
        lastVisitAt: match.lastVisitAt,
        birthday: match.birthday,
        anniversary: match.anniversary,
        notes: match.notes,
        tags: match.tags,
        gstin: match.gstin,
        activeOffers,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const customer = await storage.getCustomerByTenant(req.params.id, user.tenantId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.patch("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { appendNote, ...rest } = req.body as { appendNote?: string } & Partial<InsertCustomer>;
      const updateData: Partial<InsertCustomer> = rest;
      if (appendNote && appendNote.trim()) {
        const existing = await storage.getCustomerByTenant(req.params.id, user.tenantId);
        if (!existing) return res.status(404).json({ message: "Customer not found" });
        const timestamp = new Date().toISOString().replace("T", " ").slice(0, 16);
        const entry = `[${timestamp}] ${appendNote.trim()}`;
        const existingNotes = existing.notes?.trim() ?? "";
        updateData.notes = existingNotes ? `${existingNotes}\n${entry}` : entry;
      }
      const customer = await storage.updateCustomerByTenant(req.params.id, user.tenantId, updateData);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/customers/:id", requireRole("owner", "manager"), async (req, res) => {
    const user = req.user as any;
    await storage.deleteCustomerByTenant(req.params.id, user.tenantId, user.id);
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
// CRM-LOYALTY-LOG: Loyalty transaction history
app.get("/api/customers/:id/loyalty-history", requireAuth, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const { rows } = await pool.query(
      `SELECT * FROM loyalty_transactions
       WHERE customer_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [id, tenantId]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

}
