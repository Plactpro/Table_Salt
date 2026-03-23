import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { calculatePackingCharge } from "../services/packing-charge-service";

export function registerPackingChargeRoutes(app: Express): void {

  app.get("/api/packing/settings/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const settings = await storage.getOutletPackingSettings(outletId, user.tenantId);
      if (!settings) {
        return res.json({
          outletId,
          tenantId: user.tenantId,
          takeawayChargeEnabled: false,
          deliveryChargeEnabled: false,
          chargeType: "FIXED_PER_ORDER",
          takeawayChargeAmount: "0",
          deliveryChargeAmount: "0",
          takeawayPerItem: "0",
          deliveryPerItem: "0",
          maxChargePerOrder: null,
          packingChargeTaxable: false,
          packingChargeTaxPct: "0",
          showOnReceipt: true,
          chargeLabel: "Packing Charge",
          currencyCode: "INR",
          currencySymbol: "₹",
        });
      }
      res.json(settings);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/packing/settings/:outletId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const data = { ...req.body, outletId, tenantId: user.tenantId, updatedBy: user.id };
      const settings = await storage.upsertOutletPackingSettings(data);
      res.json(settings);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/packing/categories/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const categories = await storage.getPackingCategories(outletId, user.tenantId);
      res.json(categories);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/packing/categories/:outletId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const category = await storage.createPackingCategory({
        ...req.body,
        outletId,
        tenantId: user.tenantId,
      });
      res.status(201).json(category);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/packing/categories/:outletId/:categoryId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { categoryId } = req.params;
      const category = await storage.updatePackingCategory(categoryId, user.tenantId, req.body);
      if (!category) return res.status(404).json({ message: "Category rate not found" });
      res.json(category);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/packing/categories/:outletId/:categoryId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { categoryId } = req.params;
      await storage.deletePackingCategory(categoryId, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/packing/exemptions/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const exemptions = await storage.getPackingExemptions(outletId, user.tenantId);
      res.json(exemptions);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/packing/exemptions/:outletId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const { exemptionType, referenceId, referenceName, reason } = req.body;
      if (!exemptionType || !referenceId) {
        return res.status(400).json({ message: "exemptionType and referenceId are required" });
      }
      const exemption = await storage.createPackingExemption({
        tenantId: user.tenantId,
        outletId,
        exemptionType,
        referenceId,
        referenceName: referenceName || null,
        reason: reason || null,
      });
      res.status(201).json(exemption);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/packing/exemptions/:outletId/:exemptionId", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { exemptionId } = req.params;
      await storage.deletePackingExemption(exemptionId, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/packing/calculate", async (req, res) => {
    try {
      const { outletId, orderType, orderItems } = req.body;
      if (!outletId || !orderType || !orderItems) {
        return res.status(400).json({ message: "outletId, orderType, and orderItems are required" });
      }
      if (orderType === 'dine_in') {
        return res.json({
          applicable: false,
          chargeAmount: 0,
          taxAmount: 0,
          totalAmount: 0,
          chargeType: 'NONE',
          label: 'Packing Charge',
          breakdown: [],
          reason: 'Packing charge does not apply to dine-in orders',
        });
      }
      if (orderType !== 'takeaway' && orderType !== 'delivery') {
        return res.status(400).json({ message: "orderType must be takeaway or delivery" });
      }
      // Resolve tenant from outlet server-side — never trust caller-supplied tenantId
      const outlet = await storage.getOutlet(outletId);
      if (!outlet) {
        return res.status(404).json({ message: "Outlet not found" });
      }
      const result = await calculatePackingCharge(outletId, outlet.tenantId, orderType, orderItems);
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
