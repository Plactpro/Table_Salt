import type { Express } from "express";
import { storage } from "../storage";
import { requireRole } from "../middleware";
import { emitToTenant } from "../realtime";
import {
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertGoodsReceivedNoteSchema,
  insertGrnItemSchema,
} from "@shared/schema";

export function registerProcurementRoutes(app: Express): void {
  app.get("/api/purchase-orders", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getPurchaseOrdersByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-orders/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      const items = await storage.getPurchaseOrderItems(po.id);
      const grns = await storage.getGRNsByPO(po.id);
      const approvals = await storage.getProcurementApprovals(po.id);
      res.json({ ...po, items, grns, approvals });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...poBody } = req.body;
      if (poBody.expectedDelivery && typeof poBody.expectedDelivery === "string") {
        poBody.expectedDelivery = new Date(poBody.expectedDelivery);
      }
      const poCount = await storage.countPurchaseOrdersByTenant(user.tenantId);
      const poNumber = poBody.poNumber || `PO-${String(poCount + 1).padStart(4, "0")}`;
      const data = insertPurchaseOrderSchema.parse({ ...poBody, tenantId: user.tenantId, poNumber, createdBy: user.id });
      const po = await storage.createPurchaseOrder(data);
      let totalAmount = 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const totalCost = parseFloat(item.quantity) * parseFloat(item.unitCost);
          totalAmount += totalCost;
          await storage.createPurchaseOrderItem(insertPurchaseOrderItemSchema.parse({
            purchaseOrderId: po.id,
            inventoryItemId: item.inventoryItemId,
            catalogItemId: item.catalogItemId || null,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalCost: totalCost.toFixed(2),
          }));
        }
        await storage.updatePurchaseOrder(po.id, user.tenantId, { totalAmount: totalAmount.toFixed(2) });
      }
      res.json({ ...po, totalAmount: totalAmount.toFixed(2) });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/purchase-orders/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      if (req.body.expectedDelivery && typeof req.body.expectedDelivery === "string") {
        req.body.expectedDelivery = new Date(req.body.expectedDelivery);
      }
      const po = await storage.updatePurchaseOrder(req.params.id, user.tenantId, req.body);
      if (!po) return res.status(404).json({ message: "PO not found" });
      res.json(po);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders/:id/approve", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      if (po.status !== "draft") return res.status(400).json({ message: "Only draft POs can be approved" });
      await storage.updatePurchaseOrder(po.id, user.tenantId, { status: "approved", approvedBy: user.id, approvedAt: new Date() });
      await storage.createProcurementApproval({ tenantId: user.tenantId, purchaseOrderId: po.id, action: "approved", performedBy: user.id, notes: req.body.notes || null });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders/:id/send", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      if (po.status !== "approved") return res.status(400).json({ message: "PO must be approved before sending" });
      await storage.updatePurchaseOrder(po.id, user.tenantId, { status: "sent" });
      await storage.createProcurementApproval({ tenantId: user.tenantId, purchaseOrderId: po.id, action: "sent", performedBy: user.id, notes: null });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/grns", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getGRNsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/grns", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, purchaseOrderId, notes } = req.body;
      if (!purchaseOrderId || !items || !Array.isArray(items)) return res.status(400).json({ message: "purchaseOrderId and items required" });
      const po = await storage.getPurchaseOrder(purchaseOrderId, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });

      const grnCount = (await storage.getGRNsByTenant(user.tenantId)).length;
      const grnNumber = `GRN-${String(grnCount + 1).padStart(4, "0")}`;
      const grn = await storage.createGRN(insertGoodsReceivedNoteSchema.parse({
        tenantId: user.tenantId, purchaseOrderId, grnNumber, receivedBy: user.id, notes: notes || null,
      }));

      const poItems = await storage.getPurchaseOrderItems(purchaseOrderId);
      const poItemMap = new Map(poItems.map(pi => [pi.id, pi]));

      for (const item of items) {
        const poItem = poItemMap.get(item.purchaseOrderItemId);
        if (!poItem) continue;
        const variance = parseFloat(item.actualUnitCost) - parseFloat(poItem.unitCost);
        await storage.createGRNItem(insertGrnItemSchema.parse({
          grnId: grn.id,
          purchaseOrderItemId: item.purchaseOrderItemId,
          inventoryItemId: poItem.inventoryItemId,
          quantityReceived: item.quantityReceived,
          actualUnitCost: item.actualUnitCost,
          priceVariance: variance.toFixed(2),
          notes: item.notes || null,
        }));

        const newReceivedQty = parseFloat(poItem.receivedQty || "0") + parseFloat(item.quantityReceived);
        await storage.updatePurchaseOrderItem(poItem.id, { receivedQty: newReceivedQty.toFixed(2) });

        const invItem = await storage.getInventoryItem(poItem.inventoryItemId);
        if (invItem) {
          const conversionRatio = parseFloat(invItem.conversionRatio || "1");
          const receivedQtyBase = parseFloat(item.quantityReceived) * conversionRatio;
          const newStock = parseFloat(invItem.currentStock || "0") + receivedQtyBase;
          const costPerBaseUnit = conversionRatio > 0 ? (parseFloat(item.actualUnitCost) / conversionRatio).toFixed(4) : item.actualUnitCost;
          await storage.updateInventoryItem(invItem.id, { currentStock: newStock.toFixed(2), costPrice: item.actualUnitCost, costPerBaseUnit });
          await storage.createStockMovement({ tenantId: user.tenantId, itemId: invItem.id, type: "received", quantity: receivedQtyBase.toFixed(2), reason: `GRN ${grnNumber} from PO ${po.poNumber}` });
        }
      }

      const updatedPoItems = await storage.getPurchaseOrderItems(purchaseOrderId);
      const allFullyReceived = updatedPoItems.every(pi => parseFloat(pi.receivedQty || "0") >= parseFloat(pi.quantity));
      const anyReceived = updatedPoItems.some(pi => parseFloat(pi.receivedQty || "0") > 0);
      const newStatus = allFullyReceived ? "closed" : anyReceived ? "partially_received" : po.status;
      if (newStatus !== po.status) {
        await storage.updatePurchaseOrder(po.id, user.tenantId, { status: newStatus });
      }

      emitToTenant(user.tenantId, "stock:updated", { grnId: grn.id, grnNumber, poNumber: po.poNumber, itemCount: items.length, source: "grn" });
      res.json(grn);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/grns/:id/items", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const grns = await storage.getGRNsByTenant(user.tenantId);
      const grn = grns.find(g => g.id === req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      res.json(await storage.getGRNItems(req.params.id));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/procurement/analytics", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const pos = await storage.getPurchaseOrdersByTenant(user.tenantId);
      const allSuppliers = await storage.getSuppliersByTenant(user.tenantId);
      const invItems = await storage.getInventoryByTenant(user.tenantId);
      const invMap = new Map(invItems.map(i => [i.id, i]));

      const spendBySupplier: Record<string, { name: string; total: number; count: number }> = {};
      const spendByItem: Record<string, { name: string; total: number; count: number }> = {};
      let totalSpend = 0;
      const totalPOs = pos.length;
      let closedPOs = 0;
      const supplierMap = new Map(allSuppliers.map(s => [s.id, s]));

      for (const po of pos) {
        const amount = parseFloat(po.totalAmount || "0");
        totalSpend += amount;
        if (po.status === "closed") closedPOs++;
        const supplier = supplierMap.get(po.supplierId);
        const sName = supplier?.name || "Unknown";
        if (!spendBySupplier[po.supplierId]) spendBySupplier[po.supplierId] = { name: sName, total: 0, count: 0 };
        spendBySupplier[po.supplierId].total += amount;
        spendBySupplier[po.supplierId].count++;

        const poItems = await storage.getPurchaseOrderItems(po.id);
        for (const item of poItems) {
          const inv = invMap.get(item.inventoryItemId);
          const iName = inv?.name || "Unknown";
          if (!spendByItem[item.inventoryItemId]) spendByItem[item.inventoryItemId] = { name: iName, total: 0, count: 0 };
          spendByItem[item.inventoryItemId].total += parseFloat(item.totalCost);
          spendByItem[item.inventoryItemId].count++;
        }
      }

      const grns = await storage.getGRNsByTenant(user.tenantId);
      const variances: Array<{ itemName: string; expected: number; actual: number; variance: number }> = [];
      for (const grn of grns) {
        const grnItemsList = await storage.getGRNItems(grn.id);
        for (const gi of grnItemsList) {
          if (parseFloat(gi.priceVariance || "0") !== 0) {
            const inv = invMap.get(gi.inventoryItemId);
            variances.push({
              itemName: inv?.name || "Unknown",
              expected: parseFloat(gi.actualUnitCost) - parseFloat(gi.priceVariance || "0"),
              actual: parseFloat(gi.actualUnitCost),
              variance: parseFloat(gi.priceVariance || "0"),
            });
          }
        }
      }

      res.json({
        totalSpend: totalSpend.toFixed(2),
        totalPOs,
        closedPOs,
        activePOs: totalPOs - closedPOs,
        supplierCount: allSuppliers.length,
        spendBySupplier: Object.values(spendBySupplier).sort((a, b) => b.total - a.total),
        spendByItem: Object.values(spendByItem).sort((a, b) => b.total - a.total).slice(0, 20),
        topVariances: variances.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 20),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/procurement/low-stock", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const items = await storage.getInventoryByTenant(user.tenantId);
      const lowStock = items.filter(i => {
        const stock = parseFloat(i.currentStock || "0");
        const reorder = parseFloat(i.reorderLevel || "0");
        return stock <= reorder && reorder > 0;
      }).map(i => ({
        ...i,
        suggestedQty: Math.max(0, parseFloat(i.parLevel || "0") - parseFloat(i.currentStock || "0")).toFixed(2),
      }));
      res.json(lowStock);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
