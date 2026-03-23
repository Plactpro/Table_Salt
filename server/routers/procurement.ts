import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { requireRole } from "../middleware";
import { emitToTenant } from "../realtime";
import {
  purchaseOrders,
  purchaseOrderItems,
  goodsReceivedNotes,
  grnItems,
  supplierQuotations,
  purchaseReturns,
  purchaseReturnItems,
  stockTransfers,
  stockTransferItems,
  stockCounts,
  stockCountItems,
  damagedInventory,
  inventoryItems,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertGoodsReceivedNoteSchema,
  insertGrnItemSchema,
  insertQuotationRequestSchema,
  insertQuotationRequestItemSchema,
  insertSupplierQuotationSchema,
  insertSupplierQuotationItemSchema,
  insertPoDeliveryScheduleSchema,
  insertPurchaseReturnSchema,
  insertPurchaseReturnItemSchema,
  insertStockTransferSchema,
  insertStockTransferItemSchema,
  insertStockCountSchema,
  insertStockCountItemSchema,
  insertDamagedInventorySchema,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

function generateSequenceNumber(prefix: string, existingNumbers: string[]): string {
  let maxNum = 0;
  for (const num of existingNumbers) {
    if (typeof num === "string" && num.startsWith(prefix + "-")) {
      const parts = num.split("-");
      const n = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(4, "0")}`;
}

export function registerProcurementRoutes(app: Express): void {
  app.get("/api/purchase-orders", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getPurchaseOrdersByTenant(user.tenantId));
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
      await storage.updatePurchaseOrder(po.id, user.tenantId, { status: "sent_to_supplier", sentAt: new Date() });
      await storage.createProcurementApproval({ tenantId: user.tenantId, purchaseOrderId: po.id, action: "sent_to_supplier", performedBy: user.id, notes: null });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-orders/:id/deliveries", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      res.json(await storage.getPODeliverySchedules(po.id));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders/:id/deliveries", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      const existing = await storage.getPODeliverySchedules(po.id);
      const deliveryNumber = existing.length + 1;
      const data = insertPoDeliveryScheduleSchema.parse({ ...req.body, tenantId: user.tenantId, poId: po.id, deliveryNumber });
      const delivery = await storage.createPODeliverySchedule(data);
      res.json(delivery);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/purchase-orders/:id/deliveries/:deliveryId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const po = await storage.getPurchaseOrder(req.params.id, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      const delivery = await storage.updatePODeliverySchedule(req.params.deliveryId, user.tenantId, req.body);
      if (!delivery) return res.status(404).json({ message: "Delivery schedule not found" });
      res.json(delivery);
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
      const existingPOs = await storage.getPurchaseOrdersByTenant(user.tenantId);
      const poNumber = poBody.poNumber || generateSequenceNumber("PO", existingPOs.map(p => p.poNumber));
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
            ingredientName: item.ingredientName || null,
            unit: item.unit || null,
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
      const updateData = { ...req.body, updatedAt: new Date() };
      const po = await storage.updatePurchaseOrder(req.params.id, user.tenantId, updateData);
      if (!po) return res.status(404).json({ message: "PO not found" });
      res.json(po);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/goods-received-notes", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getGRNsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/goods-received-notes", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, purchaseOrderId, notes, status, ...grnBody } = req.body;
      if (!purchaseOrderId || !items || !Array.isArray(items)) return res.status(400).json({ message: "purchaseOrderId and items required" });
      const po = await storage.getPurchaseOrder(purchaseOrderId, user.tenantId);
      if (!po) return res.status(404).json({ message: "PO not found" });
      const shouldUpdateInventory = (status === "confirmed");

      const result = await db.transaction(async (tx) => {
        const grnRows = await tx.select({ grnNumber: goodsReceivedNotes.grnNumber }).from(goodsReceivedNotes).where(eq(goodsReceivedNotes.tenantId, user.tenantId));
        const grnNumber = grnBody.grnNumber || generateSequenceNumber("GRN", grnRows.map(r => r.grnNumber));

        const [grn] = await tx.insert(goodsReceivedNotes).values(insertGoodsReceivedNoteSchema.parse({
          tenantId: user.tenantId, purchaseOrderId, grnNumber, receivedBy: user.id, notes: notes || null,
          status: status || "draft",
          outletId: grnBody.outletId || null,
          supplierId: grnBody.supplierId || null,
          supplierInvoiceNo: grnBody.supplierInvoiceNo || null,
          supplierInvoiceDate: grnBody.supplierInvoiceDate || null,
          receivedByName: grnBody.receivedByName || null,
          totalItems: items.length,
          varianceNotes: grnBody.varianceNotes || null,
          poDeliveryId: grnBody.poDeliveryId || null,
        })).returning();

        const poItemRows = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
        const poItemMap = new Map(poItemRows.map(pi => [pi.id, pi]));
        let totalValue = 0;

        for (const item of items) {
          const poItem = poItemMap.get(item.purchaseOrderItemId);
          if (!poItem) continue;
          const variance = parseFloat(item.actualUnitCost) - parseFloat(poItem.unitCost);
          const acceptedQty = parseFloat(item.acceptedQty ?? item.quantityReceived);
          const rejectedQty = parseFloat(item.rejectedQty ?? "0");
          totalValue += acceptedQty * parseFloat(item.actualUnitCost);

          await tx.insert(grnItems).values(insertGrnItemSchema.parse({
            grnId: grn.id,
            purchaseOrderItemId: item.purchaseOrderItemId,
            inventoryItemId: poItem.inventoryItemId,
            quantityReceived: item.quantityReceived,
            actualUnitCost: item.actualUnitCost,
            priceVariance: variance.toFixed(2),
            notes: item.notes || null,
            acceptedQty: acceptedQty.toFixed(3),
            rejectedQty: rejectedQty.toFixed(3),
            batchNumber: item.batchNumber || null,
            expiryDate: item.expiryDate || null,
            storageLocation: item.storageLocation || null,
            qualityStatus: item.qualityStatus || "accepted",
            rejectionReason: item.rejectionReason || null,
          }));

          const newReceivedQty = parseFloat(poItem.receivedQty || "0") + parseFloat(item.quantityReceived);
          await tx.update(purchaseOrderItems).set({ receivedQty: newReceivedQty.toFixed(2) }).where(eq(purchaseOrderItems.id, poItem.id));

          if (shouldUpdateInventory) {
            const [inv] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, poItem.inventoryItemId), eq(inventoryItems.tenantId, user.tenantId)));
            if (inv) {
              const conversionRatio = parseFloat(inv.conversionRatio || "1");
              const receivedQtyBase = acceptedQty * conversionRatio;
              const costPerBaseUnit = conversionRatio > 0 ? (parseFloat(item.actualUnitCost) / conversionRatio).toFixed(4) : item.actualUnitCost;
              await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: inv.id, deltaQty: receivedQtyBase, outletId: grnBody.outletId || null, movementType: "received", reason: `GRN ${grnNumber} from PO ${po.poNumber}`, unitCost: item.actualUnitCost });
              await tx.update(inventoryItems).set({ costPerBaseUnit }).where(and(eq(inventoryItems.id, inv.id), eq(inventoryItems.tenantId, user.tenantId)));
            }
          }
        }

        await tx.update(goodsReceivedNotes).set({ totalValue: totalValue.toFixed(2), totalItems: items.length }).where(eq(goodsReceivedNotes.id, grn.id));

        const allPoItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
        const allFullyReceived = allPoItems.every(pi => parseFloat(pi.receivedQty || "0") >= parseFloat(pi.quantity));
        const anyReceived = allPoItems.some(pi => parseFloat(pi.receivedQty || "0") > 0);
        const newStatus = allFullyReceived ? "closed" : anyReceived ? "partially_received" : po.status;
        if (newStatus !== po.status) {
          await tx.update(purchaseOrders).set({ status: newStatus }).where(and(eq(purchaseOrders.id, po.id), eq(purchaseOrders.tenantId, user.tenantId)));
        }

        return grn;
      });

      if (shouldUpdateInventory) {
        emitToTenant(user.tenantId, "stock:updated", { grnId: result.id, source: "grn" });
      }
      res.json(result);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/goods-received-notes/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const grns = await storage.getGRNsByTenant(user.tenantId);
      const grn = grns.find(g => g.id === req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      const items = await storage.getGRNItems(grn.id);
      res.json({ ...grn, items });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/goods-received-notes/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const grns = await storage.getGRNsByTenant(user.tenantId);
      const grn = grns.find(g => g.id === req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });

      if (req.body.status === "confirmed" && grn.status !== "confirmed") {
        const updated = await db.transaction(async (tx) => {
          const grnItemsList = await tx.select().from(grnItems).where(eq(grnItems.grnId, grn.id));
          for (const grnItem of grnItemsList) {
            const [inv] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, grnItem.inventoryItemId), eq(inventoryItems.tenantId, user.tenantId)));
            if (inv) {
              const acceptedQty = parseFloat(grnItem.acceptedQty ?? grnItem.quantityReceived);
              const conversionRatio = parseFloat(inv.conversionRatio || "1");
              const receivedQtyBase = acceptedQty * conversionRatio;
              const costPerBaseUnit = conversionRatio > 0 ? (parseFloat(grnItem.actualUnitCost) / conversionRatio).toFixed(4) : grnItem.actualUnitCost;
              await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: inv.id, deltaQty: receivedQtyBase, outletId: grn.outletId || null, movementType: "received", reason: `GRN ${grn.grnNumber} confirmed`, unitCost: grnItem.actualUnitCost });
              await tx.update(inventoryItems).set({ costPerBaseUnit }).where(and(eq(inventoryItems.id, inv.id), eq(inventoryItems.tenantId, user.tenantId)));
            }
          }
          const [result] = await tx.update(goodsReceivedNotes).set(req.body).where(and(eq(goodsReceivedNotes.id, grn.id), eq(goodsReceivedNotes.tenantId, user.tenantId))).returning();
          return result;
        });
        emitToTenant(user.tenantId, "stock:updated", { grnId: grn.id, source: "grn_confirm" });
        return res.json(updated);
      }

      const updated = await storage.updateGRN(grn.id, user.tenantId, req.body);
      res.json(updated);
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

      const result = await db.transaction(async (tx) => {
        const grnRows2 = await tx.select({ grnNumber: goodsReceivedNotes.grnNumber }).from(goodsReceivedNotes).where(eq(goodsReceivedNotes.tenantId, user.tenantId));
        const grnNumber = generateSequenceNumber("GRN", grnRows2.map(r => r.grnNumber));

        const [grn] = await tx.insert(goodsReceivedNotes).values(insertGoodsReceivedNoteSchema.parse({
          tenantId: user.tenantId, purchaseOrderId, grnNumber, receivedBy: user.id, notes: notes || null,
        })).returning();

        const poItemRows = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
        const poItemMap = new Map(poItemRows.map(pi => [pi.id, pi]));

        for (const item of items) {
          const poItem = poItemMap.get(item.purchaseOrderItemId);
          if (!poItem) continue;
          const variance = parseFloat(item.actualUnitCost) - parseFloat(poItem.unitCost);
          await tx.insert(grnItems).values(insertGrnItemSchema.parse({
            grnId: grn.id,
            purchaseOrderItemId: item.purchaseOrderItemId,
            inventoryItemId: poItem.inventoryItemId,
            quantityReceived: item.quantityReceived,
            actualUnitCost: item.actualUnitCost,
            priceVariance: variance.toFixed(2),
            notes: item.notes || null,
          }));

          const newReceivedQty = parseFloat(poItem.receivedQty || "0") + parseFloat(item.quantityReceived);
          await tx.update(purchaseOrderItems).set({ receivedQty: newReceivedQty.toFixed(2) }).where(eq(purchaseOrderItems.id, poItem.id));

          const [inv] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.id, poItem.inventoryItemId), eq(inventoryItems.tenantId, user.tenantId)));
          if (inv) {
            const conversionRatio = parseFloat(inv.conversionRatio || "1");
            const receivedQtyBase = parseFloat(item.quantityReceived) * conversionRatio;
            const costPerBaseUnit = conversionRatio > 0 ? (parseFloat(item.actualUnitCost) / conversionRatio).toFixed(4) : item.actualUnitCost;
            await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: inv.id, deltaQty: receivedQtyBase, outletId: null, movementType: "received", reason: `GRN ${grnNumber} from PO ${po.poNumber}`, unitCost: item.actualUnitCost });
            await tx.update(inventoryItems).set({ costPerBaseUnit }).where(and(eq(inventoryItems.id, inv.id), eq(inventoryItems.tenantId, user.tenantId)));
          }
        }

        const allPoItems = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
        const allFullyReceived = allPoItems.every(pi => parseFloat(pi.receivedQty || "0") >= parseFloat(pi.quantity));
        const anyReceived = allPoItems.some(pi => parseFloat(pi.receivedQty || "0") > 0);
        const newStatus = allFullyReceived ? "closed" : anyReceived ? "partially_received" : po.status;
        if (newStatus !== po.status) {
          await tx.update(purchaseOrders).set({ status: newStatus }).where(and(eq(purchaseOrders.id, po.id), eq(purchaseOrders.tenantId, user.tenantId)));
        }
        return grn;
      });

      emitToTenant(user.tenantId, "stock:updated", { grnId: result.id, source: "grn" });
      res.json(result);
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

  app.get("/api/rfqs", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getRFQsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rfqs", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...rfqBody } = req.body;
      const rfqList = await storage.getRFQsByTenant(user.tenantId);
      const rfqNumber = rfqBody.rfqNumber || generateSequenceNumber("RFQ", rfqList.map(r => r.rfqNumber));
      const data = insertQuotationRequestSchema.parse({
        ...rfqBody,
        tenantId: user.tenantId,
        rfqNumber,
        requestedBy: user.id,
        requestedByName: rfqBody.requestedByName || null,
      });
      const rfq = await storage.createRFQ(data);
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await storage.createRFQItem(insertQuotationRequestItemSchema.parse({ ...item, rfqId: rfq.id }));
        }
      }
      const rfqItems = await storage.getRFQItems(rfq.id);
      res.json({ ...rfq, items: rfqItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/rfqs/:id/quotations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.getRFQ(req.params.id, user.tenantId);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      const quotations = await storage.getSupplierQuotations(rfq.id);
      const result = await Promise.all(quotations.map(async q => {
        const qItems = await storage.getSupplierQuotationItems(q.id);
        return { ...q, items: qItems };
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rfqs/:id/items", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.getRFQ(req.params.id, user.tenantId);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      const item = await storage.createRFQItem(insertQuotationRequestItemSchema.parse({ ...req.body, rfqId: rfq.id }));
      res.json(item);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/rfqs/:rfqId/items/:itemId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.getRFQ(req.params.rfqId, user.tenantId);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      const allItems = await storage.getRFQItems(rfq.id);
      const itemExists = allItems.some(i => i.id === req.params.itemId);
      if (!itemExists) return res.status(404).json({ message: "RFQ item not found" });
      await storage.deleteRFQItem(req.params.itemId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/rfqs/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.getRFQ(req.params.id, user.tenantId);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      const items = await storage.getRFQItems(rfq.id);
      const quotations = await storage.getSupplierQuotations(rfq.id);
      const quotationsWithItems = await Promise.all(quotations.map(async q => {
        const qItems = await storage.getSupplierQuotationItems(q.id);
        return { ...q, items: qItems };
      }));
      res.json({ ...rfq, items, quotations: quotationsWithItems });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/rfqs/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.updateRFQ(req.params.id, user.tenantId, req.body);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      res.json(rfq);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/supplier-quotations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getSupplierQuotationsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/supplier-quotations/:id/convert-to-po", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const quotation = await db.select().from(supplierQuotations).where(and(eq(supplierQuotations.id, req.params.id), eq(supplierQuotations.tenantId, user.tenantId))).then(rows => rows[0]);
      if (!quotation) return res.status(404).json({ message: "Quotation not found" });
      const qItems = await storage.getSupplierQuotationItems(quotation.id);
      const existingPOs2 = await storage.getPurchaseOrdersByTenant(user.tenantId);
      const poNumber = generateSequenceNumber("PO", existingPOs2.map(p => p.poNumber));

      const poData = insertPurchaseOrderSchema.parse({
        tenantId: user.tenantId,
        supplierId: quotation.supplierId,
        poNumber,
        status: "draft",
        totalAmount: quotation.totalAmount || "0",
        notes: `Created from quotation ${quotation.quotationNumber}`,
        createdBy: user.id,
        poSource: "FROM_QUOTATION",
        quotationId: quotation.id,
        paymentTerms: quotation.paymentTerms || null,
      });

      const po = await db.transaction(async (tx) => {
        const [newPo] = await tx.insert(purchaseOrders).values(poData).returning();

        let totalAmount = 0;
        for (const qi of qItems) {
          if (!qi.inventoryItemId) continue;
          const qty = parseFloat(qi.quotedQuantity || "1");
          const price = parseFloat(qi.unitPrice || "0");
          const total = qty * price;
          totalAmount += total;
          await tx.insert(purchaseOrderItems).values(insertPurchaseOrderItemSchema.parse({
            purchaseOrderId: newPo.id,
            inventoryItemId: qi.inventoryItemId,
            quantity: qi.quotedQuantity || "1",
            unitCost: qi.unitPrice || "0",
            totalCost: total.toFixed(2),
            ingredientName: qi.ingredientName || null,
            unit: qi.unit || null,
          }));
        }
        await tx.update(purchaseOrders).set({ totalAmount: totalAmount.toFixed(2) }).where(eq(purchaseOrders.id, newPo.id));
        return { ...newPo, totalAmount: totalAmount.toFixed(2) };
      });

      res.json(po);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/supplier-quotations/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const q = await storage.updateSupplierQuotation(req.params.id, user.tenantId, req.body);
      if (!q) return res.status(404).json({ message: "Quotation not found" });
      res.json(q);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/supplier-quotations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...qBody } = req.body;
      const allQuotations = await storage.getSupplierQuotationsByTenant(user.tenantId);
      const quotationNumber = qBody.quotationNumber || generateSequenceNumber("QTN", allQuotations.map(q => q.quotationNumber));
      const data = insertSupplierQuotationSchema.parse({ ...qBody, tenantId: user.tenantId, quotationNumber });
      const quotation = await storage.createSupplierQuotation(data);
      let totalAmount = 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const total = parseFloat(item.quotedQuantity || "1") * parseFloat(item.unitPrice || "0");
          totalAmount += total;
          await storage.createSupplierQuotationItem(insertSupplierQuotationItemSchema.parse({
            ...item,
            quotationId: quotation.id,
            totalPrice: total.toFixed(2),
          }));
        }
        await storage.updateSupplierQuotation(quotation.id, user.tenantId, { totalAmount: totalAmount.toFixed(2) });
      }
      const qItems = await storage.getSupplierQuotationItems(quotation.id);
      res.json({ ...quotation, totalAmount: totalAmount.toFixed(2), items: qItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/purchase-returns", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getPurchaseReturnsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-returns", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...returnBody } = req.body;
      const existingReturns = await storage.getPurchaseReturnsByTenant(user.tenantId);
      const returnNumber = returnBody.returnNumber || generateSequenceNumber("PR", existingReturns.map(r => r.returnNumber));
      const data = insertPurchaseReturnSchema.parse({ ...returnBody, tenantId: user.tenantId, returnNumber, createdBy: user.id });
      const purchaseReturn = await storage.createPurchaseReturn(data);
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await storage.createPurchaseReturnItem(insertPurchaseReturnItemSchema.parse({ ...item, returnId: purchaseReturn.id }));
        }
        await storage.updatePurchaseReturn(purchaseReturn.id, user.tenantId, { totalItems: items.length });
      }
      const returnItems = await storage.getPurchaseReturnItems(purchaseReturn.id);
      res.json({ ...purchaseReturn, items: returnItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/purchase-returns/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const purchaseReturn = await storage.getPurchaseReturn(req.params.id, user.tenantId);
      if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });
      const items = await storage.getPurchaseReturnItems(purchaseReturn.id);
      res.json({ ...purchaseReturn, items });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/purchase-returns/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const purchaseReturn = await storage.getPurchaseReturn(req.params.id, user.tenantId);
      if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });

      if (req.body.status === "approved" && purchaseReturn.status !== "approved") {
        const updated = await db.transaction(async (tx) => {
          const today = new Date();
          const datePart = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`;
          const prefix = `DN-${datePart}-`;
          const existingDNs = await tx.select({ debitNoteNumber: purchaseReturns.debitNoteNumber }).from(purchaseReturns).where(eq(purchaseReturns.tenantId, user.tenantId));
          const dn = req.body.debitNoteNumber || prefix + String(generateSequenceNumber(prefix.slice(0, -1), existingDNs.map(r => r.debitNoteNumber || "").filter(Boolean)).split("-").pop()).padStart(4, "0");

          const retItems = await tx.select().from(purchaseReturnItems).where(eq(purchaseReturnItems.returnId, purchaseReturn.id));
          for (const item of retItems) {
            if (!item.inventoryItemId) continue;
            const returnQty = parseFloat(item.returnQuantity || "0");
            if (returnQty > 0) {
              await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: item.inventoryItemId, deltaQty: -returnQty, outletId: purchaseReturn.outletId || null, movementType: "adjustment", reason: `Purchase return ${purchaseReturn.returnNumber} approved` });
            }
          }
          const [result] = await tx.update(purchaseReturns).set({
            ...req.body,
            debitNoteNumber: dn,
            approvedBy: user.id,
            approvedAt: new Date(),
          }).where(and(eq(purchaseReturns.id, purchaseReturn.id), eq(purchaseReturns.tenantId, user.tenantId))).returning();
          return result;
        });

        emitToTenant(user.tenantId, "stock:updated", { returnId: purchaseReturn.id, source: "purchase_return" });
        return res.json(updated);
      }

      const updated = await storage.updatePurchaseReturn(req.params.id, user.tenantId, req.body);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-returns/:id/items", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const purchaseReturn = await storage.getPurchaseReturn(req.params.id, user.tenantId);
      if (!purchaseReturn) return res.status(404).json({ message: "Purchase return not found" });
      const item = await storage.createPurchaseReturnItem(insertPurchaseReturnItemSchema.parse({ ...req.body, returnId: purchaseReturn.id }));
      res.json(item);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/stock-transfers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getStockTransfersByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/stock-transfers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...transferBody } = req.body;
      const existingTransfers = await storage.getStockTransfersByTenant(user.tenantId);
      const transferNumber = transferBody.transferNumber || generateSequenceNumber("TRF", existingTransfers.map(t => t.transferNumber));
      const data = insertStockTransferSchema.parse({
        ...transferBody,
        tenantId: user.tenantId,
        transferNumber,
        requestedBy: user.id,
        requestedByName: transferBody.requestedByName || null,
      });
      const transfer = await storage.createStockTransfer(data);
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await storage.createStockTransferItem(insertStockTransferItemSchema.parse({ ...item, transferId: transfer.id }));
        }
      }
      const transferItems = await storage.getStockTransferItems(transfer.id);
      res.json({ ...transfer, items: transferItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/stock-transfers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const transfer = await storage.getStockTransfer(req.params.id, user.tenantId);
      if (!transfer) return res.status(404).json({ message: "Stock transfer not found" });
      const items = await storage.getStockTransferItems(transfer.id);
      res.json({ ...transfer, items });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/stock-transfers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const transfer = await storage.getStockTransfer(req.params.id, user.tenantId);
      if (!transfer) return res.status(404).json({ message: "Stock transfer not found" });
      const newStatus = req.body.status;
      const updatePayload: Record<string, any> = { ...req.body };

      if (newStatus === "approved" && transfer.status !== "approved") {
        updatePayload.approvedBy = user.id;
        updatePayload.approvedAt = new Date();
      }

      if (newStatus === "dispatched" && transfer.status !== "dispatched") {
        updatePayload.dispatchedBy = user.id;
        updatePayload.dispatchedAt = new Date();

        await db.transaction(async (tx) => {
          const transferItems = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, transfer.id));
          for (const item of transferItems) {
            if (!item.inventoryItemId) continue;
            const dispatchQty = parseFloat(item.dispatchedQty || item.approvedQty || item.requestedQty || "0");
            if (dispatchQty > 0) {
              await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: item.inventoryItemId, deltaQty: -dispatchQty, outletId: transfer.fromOutletId || null, movementType: "adjustment", reason: `Transfer ${transfer.transferNumber} dispatched from ${transfer.fromOutletName || "outlet"}` });
            }
          }
        });
        emitToTenant(user.tenantId, "stock:updated", { transferId: transfer.id, source: "transfer_dispatch" });
      }

      if (newStatus === "received" && transfer.status !== "received") {
        updatePayload.receivedBy = user.id;
        updatePayload.receivedAt = new Date();

        await db.transaction(async (tx) => {
          const transferItems = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, transfer.id));
          for (const item of transferItems) {
            if (!item.inventoryItemId) continue;
            const receivedQty = parseFloat(item.receivedQty || item.dispatchedQty || item.approvedQty || item.requestedQty || "0");
            const dispatchedQty = parseFloat(item.dispatchedQty || item.approvedQty || item.requestedQty || "0");
            const variance = receivedQty - dispatchedQty;
            if (receivedQty > 0) {
              await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: item.inventoryItemId, deltaQty: receivedQty, outletId: transfer.toOutletId || null, movementType: "received", reason: `Transfer ${transfer.transferNumber} received at ${transfer.toOutletName || "outlet"}` });
            }
            if (Math.abs(variance) > 0.001) {
              await tx.update(stockTransferItems).set({ varianceQty: variance.toFixed(3) }).where(eq(stockTransferItems.id, item.id));
            }
          }
        });
        emitToTenant(user.tenantId, "stock:updated", { transferId: transfer.id, source: "transfer_receive" });
      }

      if (newStatus === "cancelled" && transfer.status === "dispatched") {
        await db.transaction(async (tx) => {
          const transferItems = await tx.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, transfer.id));
          for (const item of transferItems) {
            if (!item.inventoryItemId) continue;
            const dispatchQty = parseFloat(item.dispatchedQty || item.approvedQty || item.requestedQty || "0");
            if (dispatchQty > 0) {
              await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: item.inventoryItemId, deltaQty: dispatchQty, outletId: transfer.fromOutletId || null, movementType: "received", reason: `Transfer ${transfer.transferNumber} cancelled - stock reversed` });
            }
          }
        });
        emitToTenant(user.tenantId, "stock:updated", { transferId: transfer.id, source: "transfer_cancel" });
      }

      const updated = await storage.updateStockTransfer(req.params.id, user.tenantId, updatePayload);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/stock-counts", requireRole("owner", "manager", "staff"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getStockCountsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/stock-counts", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const existingCounts = await storage.getStockCountsByTenant(user.tenantId);
      const countNumber = req.body.countNumber || generateSequenceNumber("STC", existingCounts.map(c => c.countNumber));
      const data = insertStockCountSchema.parse({ ...req.body, tenantId: user.tenantId, countNumber, createdBy: user.id });
      const count = await storage.createStockCount(data);

      const allInventoryItems = await storage.getInventoryByTenant(user.tenantId);
      const countItems = allInventoryItems.map(inv => insertStockCountItemSchema.parse({
        countId: count.id,
        inventoryItemId: inv.id,
        ingredientName: inv.name,
        unit: inv.unit || null,
        systemQuantity: inv.currentStock || "0",
      }));
      if (countItems.length > 0) {
        await storage.bulkCreateStockCountItems(countItems);
      }
      await storage.updateStockCount(count.id, user.tenantId, { totalItemsCounted: countItems.length });
      const createdItems = await storage.getStockCountItems(count.id);
      res.json({ ...count, items: createdItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/stock-counts/:id", requireRole("owner", "manager", "staff"), async (req, res) => {
    try {
      const user = req.user as any;
      const count = await storage.getStockCount(req.params.id, user.tenantId);
      if (!count) return res.status(404).json({ message: "Stock count not found" });
      const items = await storage.getStockCountItems(count.id);
      res.json({ ...count, items });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/stock-counts/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const count = await storage.getStockCount(req.params.id, user.tenantId);
      if (!count) return res.status(404).json({ message: "Stock count not found" });
      const updatePayload: Record<string, any> = { ...req.body };
      if (req.body.status === "in_progress" && count.status !== "in_progress") {
        updatePayload.startedAt = new Date();
      }
      if (req.body.status === "completed" && count.status !== "completed") {
        updatePayload.completedAt = new Date();
      }
      if (req.body.status === "approved" && count.status !== "approved") {
        updatePayload.approvedBy = user.id;
        updatePayload.approvedAt = new Date();
      }
      const updated = await storage.updateStockCount(req.params.id, user.tenantId, updatePayload);
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/stock-counts/:id/items/:itemId", requireRole("owner", "manager", "staff"), async (req, res) => {
    try {
      const user = req.user as any;
      const count = await storage.getStockCount(req.params.id, user.tenantId);
      if (!count) return res.status(404).json({ message: "Stock count not found" });
      const items = await storage.getStockCountItems(count.id);
      const item = items.find(i => i.id === req.params.itemId);
      if (!item) return res.status(404).json({ message: "Stock count item not found" });

      const { physicalQuantity, varianceReason, notes } = req.body;
      const physical = parseFloat(physicalQuantity);
      const system = parseFloat(item.systemQuantity || "0");
      const variance = physical - system;
      const variancePercent = system !== 0 ? (variance / system) * 100 : 0;
      const varianceType = Math.abs(variance) < 0.001 ? "none" : variance > 0 ? "overage" : "shortage";

      const invItem = item.inventoryItemId ? await storage.getInventoryItem(item.inventoryItemId) : null;
      const unitCost = invItem ? parseFloat(invItem.costPrice || "0") : 0;
      const varianceValue = Math.abs(variance) * unitCost;

      const updated = await storage.updateStockCountItem(req.params.itemId, {
        physicalQuantity: physical.toFixed(3),
        varianceQuantity: variance.toFixed(3),
        varianceValue: varianceValue.toFixed(2),
        variancePercent: variancePercent.toFixed(2),
        varianceType,
        varianceReason: varianceReason || null,
        notes: notes || null,
        countedBy: user.id,
        countedByName: user.name || null,
        countedAt: new Date(),
      });

      const allItems = await storage.getStockCountItems(count.id);
      const itemsWithVariance = allItems.filter(i => i.varianceQuantity && Math.abs(parseFloat(i.varianceQuantity)) > 0.001).length;
      const totalVarianceValue = allItems.reduce((s, i) => s + parseFloat(i.varianceValue || "0"), 0);
      await storage.updateStockCount(count.id, user.tenantId, {
        itemsWithVariance,
        totalVarianceValue: totalVarianceValue.toFixed(2),
      });

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/stock-counts/:id/approve-adjustments", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const count = await storage.getStockCount(req.params.id, user.tenantId);
      if (!count) return res.status(404).json({ message: "Stock count not found" });
      const items = await storage.getStockCountItems(count.id);

      let adjustedCount = 0;
      await db.transaction(async (tx) => {
        for (const item of items) {
          if (!item.inventoryItemId || !item.physicalQuantity) continue;
          const variance = parseFloat(item.varianceQuantity || "0");
          if (Math.abs(variance) < 0.001) continue;
          await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: item.inventoryItemId, deltaQty: variance, outletId: count.outletId || null, movementType: "adjustment", reason: `Stock count ${count.countNumber} adjustment approved` });
          await tx.update(stockCountItems).set({ adjustmentApproved: true, adjustmentApprovedBy: user.id }).where(eq(stockCountItems.id, item.id));
          adjustedCount++;
        }
        await tx.update(stockCounts).set({ status: "approved", approvedBy: user.id, approvedAt: new Date() }).where(and(eq(stockCounts.id, count.id), eq(stockCounts.tenantId, user.tenantId)));
      });

      emitToTenant(user.tenantId, "stock:updated", { countId: count.id, source: "stock_count_adjustment", adjustedCount });
      res.json({ success: true, adjustedCount });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/damaged-inventory", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getDamagedInventoryByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/damaged-inventory", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getDamagedInventoryByTenant(user.tenantId);
      const damageNumber = req.body.damageNumber || generateSequenceNumber("DMG", existing.map(d => d.damageNumber));
      const data = insertDamagedInventorySchema.parse({
        ...req.body,
        tenantId: user.tenantId,
        damageNumber,
        discoveredBy: user.id,
        discoveredByName: req.body.discoveredByName || null,
      });

      const damaged = await db.transaction(async (tx) => {
        const [dmg] = await tx.insert(damagedInventory).values(data).returning();
        if (dmg.inventoryItemId && dmg.damagedQuantity) {
          const damagedQty = parseFloat(dmg.damagedQuantity);
          if (damagedQty > 0) {
            await storage.updateInventoryItemStock({ tx, tenantId: user.tenantId, inventoryItemId: dmg.inventoryItemId, deltaQty: -damagedQty, outletId: dmg.outletId || null, movementType: "damaged", reason: `Damaged inventory ${damageNumber}: ${dmg.damageCause || "declared"}` });
          }
        }
        return dmg;
      });

      emitToTenant(user.tenantId, "stock:updated", { damageId: damaged.id, source: "damaged_inventory" });
      res.json(damaged);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/damaged-inventory/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const item = await storage.getDamagedInventoryItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Damaged inventory record not found" });
      res.json(item);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/damaged-inventory/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const item = await storage.getDamagedInventoryItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Damaged inventory record not found" });
      const updatePayload: Record<string, any> = { ...req.body };
      if (req.body.status === "approved" && item.status !== "approved") {
        updatePayload.approvedBy = user.id;
        updatePayload.approvedAt = new Date();
      }
      if (["disposed", "written_off", "insurance_claimed"].includes(req.body.status) && !item.disposedAt) {
        updatePayload.disposedAt = new Date();
      }
      const updated = await storage.updateDamagedInventory(req.params.id, user.tenantId, updatePayload);
      res.json(updated);
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
