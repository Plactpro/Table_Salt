import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { requirePermission } from "../permissions";
import { auditLogFromReq } from "../audit";

/** Strip server-only secrets from tenant objects before sending to client */
function sanitizeTenant(tenant: Record<string, any> | null | undefined) {
  if (!tenant) return tenant;
  const { razorpayKeySecret, ...safe } = tenant as any;
  return safe;
}

export function registerTenantRoutes(app: Express): void {
  app.get("/api/tenant", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.getTenant(user.tenantId);
    res.json(sanitizeTenant(tenant));
  });

  app.patch("/api/tenant", requireRole("owner"), async (req, res) => {
    const user = req.user as any;
    const before = await storage.getTenant(user.tenantId);
    const tenant = await storage.updateTenant(user.tenantId, req.body);
    auditLogFromReq(req, { action: "tenant_settings_updated", entityType: "tenant", entityId: user.tenantId, before: before ? { name: before.name, currency: before.currency, taxRate: before.taxRate } : null, after: req.body });
    res.json(sanitizeTenant(tenant));
  });

  app.get("/api/offers", requireAuth, async (req, res) => {
    const user = req.user as any;
    const offerList = await storage.getOffersByTenant(user.tenantId);
    res.json(offerList);
  });

  app.get("/api/offers/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const offer = await storage.getOfferByTenant(req.params.id, user.tenantId);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    res.json(offer);
  });

  app.post("/api/offers", requireRole("owner", "manager"), requirePermission("manage_offers"), async (req, res) => {
    try {
      const user = req.user as any;
      const offer = await storage.createOffer({ ...req.body, tenantId: user.tenantId });
      auditLogFromReq(req, { action: "offer_created", entityType: "offer", entityId: offer.id, entityName: offer.name, after: { name: offer.name, type: offer.type, value: offer.value } });
      res.json(offer);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/offers/:id", requireRole("owner", "manager"), requirePermission("manage_offers"), async (req, res) => {
    const user = req.user as any;
    const existing = await storage.getOfferByTenant(req.params.id, user.tenantId);
    const offer = await storage.updateOfferByTenant(req.params.id, user.tenantId, req.body);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    if (existing) auditLogFromReq(req, { action: "offer_updated", entityType: "offer", entityId: req.params.id, entityName: existing.name, before: { name: existing.name, active: existing.active }, after: req.body });
    res.json(offer);
  });

  app.delete("/api/offers/:id", requireRole("owner", "manager"), requirePermission("manage_offers"), async (req, res) => {
    const user = req.user as any;
    const existing = await storage.getOfferByTenant(req.params.id, user.tenantId);
    await storage.deleteOfferByTenant(req.params.id, user.tenantId);
    if (existing) auditLogFromReq(req, { action: "offer_deleted", entityType: "offer", entityId: req.params.id, entityName: existing.name });
    res.json({ message: "Deleted" });
  });

  app.get("/api/promotion-rules", requireAuth, async (req, res) => {
    const user = req.user as any;
    const rules = await storage.getPromotionRulesByTenant(user.tenantId);
    res.json(rules);
  });

  app.get("/api/promotion-rules/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const rule = await storage.getPromotionRule(req.params.id, user.tenantId);
    if (!rule) return res.status(404).json({ message: "Rule not found" });
    res.json(rule);
  });

  function parseRuleDates(body: Record<string, any>) {
    const data = { ...body };
    if (data.startDate && typeof data.startDate === "string") data.startDate = new Date(data.startDate);
    if (data.endDate && typeof data.endDate === "string") data.endDate = new Date(data.endDate);
    return data;
  }

  app.post("/api/promotion-rules", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), requirePermission("manage_offers"), async (req, res) => {
    try {
      const user = req.user as any;
      const rule = await storage.createPromotionRule({ ...parseRuleDates(req.body), tenantId: user.tenantId });
      auditLogFromReq(req, { action: "promotion_rule_created", entityType: "promotion_rule", entityId: rule.id, entityName: rule.name, after: { name: rule.name, ruleType: rule.ruleType, discountType: rule.discountType, discountValue: rule.discountValue } });
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/promotion-rules/:id", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), requirePermission("manage_offers"), async (req, res) => {
    const user = req.user as any;
    const existing = await storage.getPromotionRule(req.params.id, user.tenantId);
    const rule = await storage.updatePromotionRule(req.params.id, user.tenantId, parseRuleDates(req.body));
    if (!rule) return res.status(404).json({ message: "Rule not found" });
    if (existing) auditLogFromReq(req, { action: "promotion_rule_updated", entityType: "promotion_rule", entityId: req.params.id, entityName: existing.name, before: { name: existing.name, active: existing.active }, after: req.body });
    res.json(rule);
  });

  app.delete("/api/promotion-rules/:id", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), requirePermission("manage_offers"), async (req, res) => {
    const user = req.user as any;
    const existing = await storage.getPromotionRule(req.params.id, user.tenantId);
    await storage.deletePromotionRule(req.params.id, user.tenantId, user.id);
    if (existing) auditLogFromReq(req, { action: "promotion_rule_deleted", entityType: "promotion_rule", entityId: req.params.id, entityName: existing.name });
    res.json({ message: "Deleted" });
  });

  app.post("/api/promotions/evaluate", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const body = req.body;
      if (!body || !Array.isArray(body.items)) {
        return res.status(400).json({ message: "Invalid input: requires items (array)" });
      }
      if (!body.channel || typeof body.channel !== "string") {
        return res.status(400).json({ message: "Invalid input: channel (string) is required" });
      }
      for (const item of body.items) {
        if (!item.menuItemId || typeof item.quantity !== "number") {
          return res.status(400).json({ message: "Invalid input: each item requires menuItemId and quantity (number)" });
        }
      }

      const menuItemsList = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItemsList.map(m => [m.id, m]));

      let serverSubtotal = 0;
      const canonicalItems: { menuItemId: string; name: string; price: number; quantity: number; categoryId?: string }[] = [];
      for (const item of body.items) {
        const mi = menuMap.get(item.menuItemId);
        const canonicalPrice = mi ? Number(mi.price) : Number(item.price || 0);
        const qty = Number(item.quantity) || 1;
        serverSubtotal += canonicalPrice * qty;
        canonicalItems.push({
          menuItemId: item.menuItemId,
          name: mi?.name || item.name || "",
          price: canonicalPrice,
          quantity: qty,
          categoryId: mi?.categoryId || item.categoryId || undefined,
        });
      }
      serverSubtotal = Math.round(serverSubtotal * 100) / 100;

      const { evaluateRules } = await import("../promotions-engine");
      const rules = await storage.getPromotionRulesByTenant(user.tenantId);
      const tenant = await storage.getTenant(user.tenantId);
      const tenantTaxRate = Number(tenant?.taxRate || 0) / 100;
      const tenantServiceChargeRate = Number(tenant?.serviceCharge || 0) / 100;
      const result = evaluateRules(rules, {
        items: canonicalItems,
        subtotal: serverSubtotal,
        channel: body.channel,
        orderType: body.orderType,
        outletId: body.outletId,
        tableArea: body.tableArea,
        customerId: body.customerId,
        loyaltyTier: body.loyaltyTier,
        customerSegment: body.customerSegment,
        dayOfWeek: body.dayOfWeek,
        hour: body.hour,
        taxRate: body.taxRate ?? tenantTaxRate,
        serviceChargeRate: body.serviceChargeRate ?? tenantServiceChargeRate,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
