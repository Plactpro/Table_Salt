import type { Express } from "express";
import { storage } from "../storage";
import { requireRole, requireAuth } from "../middleware";
import { pool } from "../db";
import {
  insertRegionSchema,
  insertFranchiseInvoiceSchema,
  insertOutletMenuOverrideSchema,
  insertSupplierSchema,
  insertSupplierCatalogItemSchema,
} from "@shared/schema";

export function registerFranchiseRoutes(app: Express): void {
  app.get("/api/regions", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getRegionsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/regions", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const data = insertRegionSchema.parse({ ...req.body, tenantId: user.tenantId });
      res.json(await storage.createRegion(data));
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/regions/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const region = await storage.updateRegion(req.params.id, user.tenantId, req.body);
      if (!region) return res.status(404).json({ message: "Region not found" });
      res.json(region);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/regions/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteRegion(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/franchise-invoices", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const invoices = outletId
        ? await storage.getFranchiseInvoicesByOutlet(outletId, user.tenantId)
        : await storage.getFranchiseInvoicesByTenant(user.tenantId);
      res.json(invoices);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/franchise-invoices", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const outlet = outlets.find(o => o.id === req.body.outletId);
      if (!outlet) return res.status(400).json({ message: "Outlet not found in your tenant" });
      if (!outlet.isFranchise) return res.status(400).json({ message: "Outlet is not a franchise" });
      const body = { ...req.body, tenantId: user.tenantId };
      if (typeof body.periodStart === "string") body.periodStart = new Date(body.periodStart);
      if (typeof body.periodEnd === "string") body.periodEnd = new Date(body.periodEnd);
      const data = insertFranchiseInvoiceSchema.parse(body);
      res.json(await storage.createFranchiseInvoice(data));
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/franchise-invoices/calculate", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, periodStart, periodEnd } = req.body;
      if (!outletId || !periodStart || !periodEnd) return res.status(400).json({ message: "outletId, periodStart, periodEnd required" });
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const outlet = outlets.find(o => o.id === outletId);
      if (!outlet || !outlet.isFranchise) return res.status(400).json({ message: "Outlet is not a franchise" });
      const kpis = await storage.getOutletKPIs(user.tenantId, outletId, new Date(periodStart), new Date(periodEnd));
      const kpi = kpis[0] || { totalRevenue: "0" };
      const netSales = parseFloat(String(kpi.totalRevenue || "0"));
      const royaltyRate = parseFloat(outlet.royaltyRate || "0");
      const minGuarantee = parseFloat(outlet.minimumGuarantee || "0");
      const calculatedRoyalty = netSales * (royaltyRate / 100);
      const finalAmount = Math.max(calculatedRoyalty, minGuarantee);
      res.json({ outletId, outletName: outlet.name, periodStart, periodEnd, netSales: netSales.toFixed(2), royaltyRate: royaltyRate.toFixed(2), calculatedRoyalty: calculatedRoyalty.toFixed(2), minimumGuarantee: minGuarantee.toFixed(2), finalAmount: finalAmount.toFixed(2) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/franchise-invoices/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const invoice = await storage.updateFranchiseInvoice(req.params.id, user.tenantId, req.body);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      res.json(invoice);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/outlet-menu-overrides/:outletId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getOutletMenuOverrides(req.params.outletId, user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/outlet-menu-overrides", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      if (!outlets.find(o => o.id === req.body.outletId)) return res.status(400).json({ message: "Outlet not found in your tenant" });
      const allItems = await storage.getMenuItemsByTenant(user.tenantId);
      if (!allItems.find(m => m.id === req.body.menuItemId)) return res.status(400).json({ message: "Menu item not found in your tenant" });
      const data = insertOutletMenuOverrideSchema.parse({ ...req.body, tenantId: user.tenantId });
      res.json(await storage.createOutletMenuOverride(data));
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/outlet-menu-overrides/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const override = await storage.updateOutletMenuOverride(req.params.id, user.tenantId, req.body);
      if (!override) return res.status(404).json({ message: "Override not found" });
      res.json(override);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/outlet-menu-overrides/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteOutletMenuOverride(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/hq/outlet-kpis", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const kpis = await storage.getOutletKPIs(user.tenantId, outletId, from, to);
      const allOutlets = await storage.getOutletsByTenant(user.tenantId);
      const outletMapLocal = new Map(allOutlets.map(o => [o.id, o]));

      const [feedbackMetrics, labourMetrics, foodCostReport] = await Promise.all([
        storage.getOutletFeedbackMetrics(user.tenantId, from, to),
        storage.getOutletLabourMetrics(user.tenantId, from, to),
        storage.getOutletFoodCostMetrics(user.tenantId),
      ]);

      const feedbackMap = new Map(feedbackMetrics.map((f: any) => [f.outletId, f]));
      const labourMap = new Map(labourMetrics.map((l: any) => [l.outletId, l]));

      const enriched = kpis.map(k => {
        const outlet = outletMapLocal.get(k.outletId as string);
        const fb = feedbackMap.get(k.outletId as string) || { avgRating: "0", feedbackCount: 0 };
        const lab = labourMap.get(k.outletId as string) || { labourHours: 0 };
        const revenue = parseFloat(String(k.totalRevenue || "0"));
        const estimatedLabourCost = Number(lab.labourHours || 0) * 15;
        const labourPct = revenue > 0 ? ((estimatedLabourCost / revenue) * 100).toFixed(1) : "0.0";
        const foodCostPct = foodCostReport.get(k.outletId as string) || "0.0";
        const rating = parseFloat(String(fb.avgRating || "0"));
        const count = Number(fb.feedbackCount || 0);
        const promoters = Math.round(count * Math.max(0, (rating - 4) / 1));
        const detractors = Math.round(count * Math.max(0, (3 - rating) / 3));
        const nps = count > 0 ? Math.round(((promoters - detractors) / count) * 100) : 0;
        return {
          ...k,
          outletName: outlet?.name || "Unknown",
          isFranchise: outlet?.isFranchise || false,
          regionId: outlet?.regionId || null,
          avgRating: fb.avgRating,
          feedbackCount: fb.feedbackCount,
          nps,
          labourCostPct: labourPct,
          foodCostPct,
        };
      });
      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/outlets/:outletId/menu", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getMenuItemsForOutlet(user.tenantId, req.params.outletId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/suppliers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getSuppliersByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/suppliers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const s = await storage.getSupplier(req.params.id, user.tenantId);
      if (!s) return res.status(404).json({ message: "Supplier not found" });
      res.json(s);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/suppliers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const data = insertSupplierSchema.parse({ ...req.body, tenantId: user.tenantId });
      res.json(await storage.createSupplier(data));
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/suppliers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const s = await storage.updateSupplier(req.params.id, user.tenantId, req.body);
      if (!s) return res.status(404).json({ message: "Supplier not found" });
      res.json(s);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/suppliers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      // Delete-in-use guard: check for pending/open purchase orders from this supplier
      const { rows: pendingPOs } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM purchase_orders
         WHERE supplier_id = $1 AND tenant_id = $2
           AND status NOT IN ('received', 'cancelled')
           AND is_deleted = false`,
        [req.params.id, user.tenantId]
      );
      const pendingCount = parseInt(pendingPOs[0].cnt, 10);
      if (pendingCount > 0) {
        return res.status(400).json({ message: `Cannot delete — this supplier has ${pendingCount} pending purchase order${pendingCount > 1 ? "s" : ""}.` });
      }

      await storage.deleteSupplier(req.params.id, user.tenantId, user.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/suppliers/:supplierId/catalog", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getSupplierCatalogItems(req.params.supplierId, user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/supplier-catalog-items", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const data = insertSupplierCatalogItemSchema.parse({ ...req.body, tenantId: user.tenantId });
      res.json(await storage.createSupplierCatalogItem(data));
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/supplier-catalog-items/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const s = await storage.updateSupplierCatalogItem(req.params.id, user.tenantId, req.body);
      if (!s) return res.status(404).json({ message: "Catalog item not found" });
      res.json(s);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/supplier-catalog-items/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteSupplierCatalogItem(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
