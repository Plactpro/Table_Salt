import type { Express } from "express";
import { db, pool } from "../db";
import { storage } from "../storage";
import { requireRole } from "../middleware";
import { emitToTenant } from "../realtime";

// Broader read access for roles that can view procurement
const procurementRead = requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager");
// Write access for roles that can create/modify procurement records
const procurementWrite = requireRole("owner", "franchise_owner", "hq_admin", "manager");
// Approval-only routes remain owner-only

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
  stockCountSessions,
  stockCountItems,
  damagedInventory,
  inventoryItems,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertGoodsReceivedNoteSchema,
  insertGrnItemSchema,
  insertRfqSchema,
  insertRfqItemSchema,
  insertSupplierQuotationSchema,
  insertQuotationItemSchema,
  insertPurchaseReturnSchema,
  insertPurchaseReturnItemSchema,
  insertStockTransferSchema,
  insertStockTransferItemSchema,
  insertStockCountSessionSchema,
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
  app.get("/api/purchase-orders", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const all = await storage.getPurchaseOrdersByTenant(user.tenantId);
      const data = all.slice(offset, offset + limit);
      res.json({ data, total: all.length, limit, offset, hasMore: offset + data.length < all.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-orders/:id", procurementRead, async (req, res) => {
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

  app.post("/api/purchase-orders", procurementWrite, async (req, res) => {
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

  app.patch("/api/purchase-orders/:id", procurementWrite, async (req, res) => {
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

  app.post("/api/goods-received-notes", procurementWrite, async (req, res) => {
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

  app.get("/api/grns", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getGRNsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/grns", procurementWrite, async (req, res) => {
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

  app.get("/api/grns/:id/items", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const grns = await storage.getGRNsByTenant(user.tenantId);
      const grn = grns.find(g => g.id === req.params.id);
      if (!grn) return res.status(404).json({ message: "GRN not found" });
      res.json(await storage.getGRNItems(req.params.id));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });



  app.get("/api/rfqs/:id/quotations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.getRFQ(req.params.id, user.tenantId);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      const quotations = await storage.getQuotationsByRFQ(rfq.id);
      const result = await Promise.all(quotations.map(async q => {
        const qItems = await storage.getQuotationItems(q.id);
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
      const item = await storage.createRFQItem(insertRfqItemSchema.parse({ ...req.body, rfqId: rfq.id }));
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
      const quotations = await storage.getQuotationsByRFQ(rfq.id);
      const quotationsWithItems = await Promise.all(quotations.map(async q => {
        const qItems = await storage.getQuotationItems(q.id);
        return { ...q, items: qItems };
      }));
      res.json({ ...rfq, items, quotations: quotationsWithItems });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });


  app.get("/api/supplier-quotations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await db.select().from(supplierQuotations).where(eq(supplierQuotations.tenantId, user.tenantId)));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/supplier-quotations/:id/convert-to-po", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const quotation = await db.select().from(supplierQuotations).where(and(eq(supplierQuotations.id, req.params.id), eq(supplierQuotations.tenantId, user.tenantId))).then(rows => rows[0]);
      if (!quotation) return res.status(404).json({ message: "Quotation not found" });
      const qItems = await storage.getQuotationItems(quotation.id);
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
      const [q] = await db.update(supplierQuotations).set(req.body).where(and(eq(supplierQuotations.id, req.params.id), eq(supplierQuotations.tenantId, user.tenantId))).returning();
      if (!q) return res.status(404).json({ message: "Quotation not found" });
      res.json(q);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/supplier-quotations", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...qBody } = req.body;
      const allQuotations = await db.select().from(supplierQuotations).where(eq(supplierQuotations.tenantId, user.tenantId));
      const quotationNumber = qBody.quotationNumber || generateSequenceNumber("QTN", allQuotations.map(q => q.quotationNumber));
      const data = insertSupplierQuotationSchema.parse({ ...qBody, tenantId: user.tenantId, quotationNumber });
      const quotation = await storage.createSupplierQuotation(data);
      let totalAmount = 0;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const total = parseFloat(item.quotedQuantity || "1") * parseFloat(item.unitPrice || "0");
          totalAmount += total;
          await storage.createQuotationItem(insertSupplierQuotationItemSchema.parse({
            ...item,
            quotationId: quotation.id,
            totalPrice: total.toFixed(2),
          }));
        }
        await db.update(supplierQuotations).set({ totalAmount: totalAmount.toFixed(2) }).where(and(eq(supplierQuotations.id, quotation.id), eq(supplierQuotations.tenantId, user.tenantId))).returning();
      }
      const qItems = await storage.getQuotationItems(quotation.id);
      res.json({ ...quotation, totalAmount: totalAmount.toFixed(2), items: qItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/procurement/analytics", procurementRead, async (req, res) => {
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

  app.get("/api/procurement/low-stock", procurementRead, async (req, res) => {
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

  // ─── RFQ Routes ────────────────────────────────────────────────────────────
  app.get("/api/rfqs", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const rfqList = await storage.getRFQsByTenant(user.tenantId);
      const result = await Promise.all(rfqList.map(async r => ({
        ...r,
        items: await storage.getRFQItems(r.id),
        quotations: await Promise.all((await storage.getQuotationsByRFQ(r.id)).map(async q => ({
          ...q,
          items: await storage.getQuotationItems(q.id),
        }))),
      })));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rfqs", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...body } = req.body;
      const rfqCount = await storage.getRFQsByTenant(user.tenantId).then(l => l.length);
      const rfqNumber = `RFQ-${String(rfqCount + 1).padStart(4, "0")}`;
      const rfq = await storage.createRFQ(insertRfqSchema.parse({ ...body, tenantId: user.tenantId, rfqNumber, createdBy: user.id }));
      if (Array.isArray(items)) {
        for (const item of items) {
          await storage.createRFQItem(insertRfqItemSchema.parse({ rfqId: rfq.id, ...item }));
        }
      }
      const rfqItems = await storage.getRFQItems(rfq.id);
      res.json({ ...rfq, items: rfqItems, quotations: [] });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/rfqs/:id", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.updateRFQ(req.params.id, user.tenantId, req.body);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      res.json(rfq);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rfqs/:id/send", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.getRFQ(req.params.id, user.tenantId);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      if (rfq.status !== "draft") return res.status(400).json({ message: "Only draft RFQs can be sent" });
      const updated = await storage.updateRFQ(rfq.id, user.tenantId, { status: "sent" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/rfqs/:id/quotations", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const rfq = await storage.getRFQ(req.params.id, user.tenantId);
      if (!rfq) return res.status(404).json({ message: "RFQ not found" });
      const { items, ...body } = req.body;
      const quotation = await storage.createSupplierQuotation(insertSupplierQuotationSchema.parse({ rfqId: rfq.id, ...body }));
      if (Array.isArray(items)) {
        for (const qi of items) {
          await storage.createQuotationItem(insertQuotationItemSchema.parse({ quotationId: quotation.id, ...qi }));
        }
      }
      await storage.updateRFQ(rfq.id, user.tenantId, { status: "received" });
      const qItems = await storage.getQuotationItems(quotation.id);
      res.json({ ...quotation, items: qItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  // ─── Purchase Return Routes ────────────────────────────────────────────────
  app.get("/api/purchase-returns", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const returns = await storage.getPurchaseReturnsByTenant(user.tenantId);
      const result = await Promise.all(returns.map(async r => ({
        ...r,
        items: await storage.getPurchaseReturnItems(r.id),
      })));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-returns", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...body } = req.body;
      const n = await storage.countPurchaseReturnsByTenant(user.tenantId);
      const returnNumber = `RET-${String(n + 1).padStart(4, "0")}`;
      const totalValue = Array.isArray(items)
        ? items.reduce((s: number, i: { returnQty: string; unitPrice: string }) =>
            s + (parseFloat(i.returnQty) || 0) * (parseFloat(i.unitPrice) || 0), 0)
        : 0;
      const ret = await storage.createPurchaseReturn(
        insertPurchaseReturnSchema.parse({ ...body, tenantId: user.tenantId, returnNumber, totalValue: totalValue.toFixed(2), createdBy: user.id })
      );
      if (Array.isArray(items)) {
        for (const item of items) {
          await storage.createPurchaseReturnItem(insertPurchaseReturnItemSchema.parse({ returnId: ret.id, ...item }));
        }
      }
      res.json({ ...ret, items: await storage.getPurchaseReturnItems(ret.id) });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/purchase-returns/:id", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getPurchaseReturn(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Return not found" });
      let update = req.body;
      if (req.body.status === "approved" && !existing.debitNote) {
        const n = await storage.countPurchaseReturnsByTenant(user.tenantId);
        update = { ...update, debitNote: `DN-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(n).padStart(4,"0")}` };
      }
      const ret = await storage.updatePurchaseReturn(req.params.id, user.tenantId, update);
      if (!ret) return res.status(404).json({ message: "Return not found" });
      res.json(ret);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Stock Transfer Routes ─────────────────────────────────────────────────
  app.get("/api/stock-transfers", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const transfers = await storage.getStockTransfersByTenant(user.tenantId);
      const result = await Promise.all(transfers.map(async t => ({
        ...t,
        items: await storage.getStockTransferItems(t.id),
      })));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/stock-transfers", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const { items, ...body } = req.body;
      const n = await storage.countStockTransfersByTenant(user.tenantId);
      const transferNumber = `IST-${String(n + 1).padStart(4, "0")}`;
      const transfer = await storage.createStockTransfer(
        insertStockTransferSchema.parse({ ...body, tenantId: user.tenantId, transferNumber, createdBy: user.id })
      );
      if (Array.isArray(items)) {
        for (const item of items) {
          await storage.createStockTransferItem(insertStockTransferItemSchema.parse({ transferId: transfer.id, ...item }));
        }
      }
      res.json({ ...transfer, items: await storage.getStockTransferItems(transfer.id) });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/stock-transfers/:id", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getStockTransfer(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Transfer not found" });
      let update = req.body;
      if (req.body.status === "in_transit") update = { ...update, dispatchedAt: new Date() };
      const transfer = await storage.updateStockTransfer(req.params.id, user.tenantId, update);
      if (!transfer) return res.status(404).json({ message: "Transfer not found" });
      // Handle receive with actual quantities
      if ((req.body.status === "received" || req.body.status === "partially_received") && Array.isArray(req.body.receiveLines)) {
        for (const line of req.body.receiveLines as Array<{ inventoryItemId: string; actualQty: string }>) {
          const items = await storage.getStockTransferItems(transfer.id);
          const tItem = items.find(i => i.inventoryItemId === line.inventoryItemId);
          if (tItem) await storage.updateStockTransferItem(tItem.id, { actualQty: line.actualQty });
        }
      }
      res.json(transfer);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Stock Count Routes ────────────────────────────────────────────────────
  app.get("/api/stock-counts", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const scope = req.query.scope as string | undefined;
      const sessions = await storage.getStockCountsByTenant(user.tenantId);
      let filtered = sessions;
      if (scope === 'CROCKERY_ONLY') {
        const crockeryCheck = await pool.query(
          `SELECT DISTINCT sci.session_id FROM stock_count_items sci
           JOIN inventory_items ii ON sci.inventory_item_id = ii.id
           JOIN stock_count_sessions scs ON sci.session_id = scs.id
           WHERE scs.tenant_id = $1 AND ii.item_category IN ('CROCKERY','CUTLERY','GLASSWARE')`,
          [user.tenantId]
        );
        const crockerySessionIds = new Set(crockeryCheck.rows.map((r: any) => r.session_id));
        filtered = sessions.filter(s => crockerySessionIds.has(s.id));
      } else if (scope === 'FOOD_ONLY') {
        const crockeryCheck = await pool.query(
          `SELECT DISTINCT sci.session_id FROM stock_count_items sci
           JOIN inventory_items ii ON sci.inventory_item_id = ii.id
           JOIN stock_count_sessions scs ON sci.session_id = scs.id
           WHERE scs.tenant_id = $1 AND ii.item_category IN ('CROCKERY','CUTLERY','GLASSWARE')`,
          [user.tenantId]
        );
        const crockerySessionIds = new Set(crockeryCheck.rows.map((r: any) => r.session_id));
        filtered = sessions.filter(s => !crockerySessionIds.has(s.id));
      }
      const result = await Promise.all(filtered.map(async s => ({
        ...s,
        items: await storage.getStockCountItems(s.id),
      })));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/stock-counts", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const n = await storage.countStockCountsByTenant(user.tenantId);
      const countNumber = `CNT-${String(n + 1).padStart(4, "0")}`;
      const session = await storage.createStockCount(
        insertStockCountSessionSchema.parse({ ...req.body, tenantId: user.tenantId, countNumber, createdBy: user.id })
      );
      // Seed items from current inventory
      const invItems = await storage.getInventoryByTenant(user.tenantId);
      for (const inv of invItems) {
        await storage.createStockCountItem(insertStockCountItemSchema.parse({
          sessionId: session.id,
          inventoryItemId: inv.id,
          systemQty: inv.currentStock || "0",
          physicalQty: null,
          counted: false,
        }));
      }
      const items = await storage.getStockCountItems(session.id);
      res.json({ ...session, items });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/stock-counts/:id", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const session = await storage.updateStockCount(req.params.id, user.tenantId, req.body);
      if (!session) return res.status(404).json({ message: "Count session not found" });
      res.json(session);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/stock-counts/:id/items", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const session = await storage.getStockCount(req.params.id, user.tenantId);
      if (!session) return res.status(404).json({ message: "Count session not found" });
      const result = await pool.query(
        `SELECT sci.*, ii.item_category AS "itemCategory", ii.unit_type AS "unitType", ii.name AS "itemName"
         FROM stock_count_items sci
         JOIN inventory_items ii ON sci.inventory_item_id = ii.id
         WHERE sci.session_id = $1`,
        [session.id]
      );
      res.json(result.rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/stock-counts/:id/items/:itemId", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      // Verify session belongs to tenant (prevent IDOR)
      const session = await storage.getStockCount(req.params.id, user.tenantId);
      if (!session) return res.status(404).json({ message: "Count session not found" });
      // Verify item belongs to this session
      const sessionItems = await storage.getStockCountItems(session.id);
      const sessionItem = sessionItems.find(i => i.id === req.params.itemId);
      if (!sessionItem) return res.status(404).json({ message: "Count item not found" });
      const { varianceReason, ...rest } = req.body;
      const updateData: Record<string, any> = { ...rest };
      if (varianceReason !== undefined) updateData.varianceReason = varianceReason;
      // For PIECE items, normalize physicalQty to whole integer before persisting
      if (updateData.physicalQty !== undefined) {
        const inv = await storage.getInventoryItem(sessionItem.inventoryItemId, user.tenantId);
        if (inv?.unitType === 'PIECE') {
          updateData.physicalQty = String(Math.round(parseFloat(String(updateData.physicalQty))));
        }
      }
      const item = await storage.updateStockCountItem(req.params.itemId, updateData);
      if (!item) return res.status(404).json({ message: "Count item not found" });
      res.json(item);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/stock-counts/:id/approve", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const session = await storage.getStockCount(req.params.id, user.tenantId);
      if (!session) return res.status(404).json({ message: "Count session not found" });
      const items = await storage.getStockCountItems(session.id);

      // SELECT FOR UPDATE: lock all affected inventory rows to prevent concurrent adjustments
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const item of items) {
          if (item.counted && item.physicalQty !== null) {
            const { rows: invRows } = await client.query(
              `SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2 AND is_deleted = false FOR UPDATE`,
              [item.inventoryItemId, user.tenantId]
            );
            const inv = invRows[0];
            if (inv) {
              const rawVariance = parseFloat(item.physicalQty) - parseFloat(item.systemQty);
              const isPiece = inv.unit_type === "PIECE";
              const variance = isPiece ? Math.round(rawVariance) : rawVariance;
              const newStock = isPiece ? String(Math.round(parseFloat(item.physicalQty))) : item.physicalQty;
              if (Math.abs(variance) > 0.001) {
                await client.query(`UPDATE inventory_items SET current_stock = $1 WHERE id = $2`, [newStock, inv.id]);
                const movementQty = isPiece ? String(variance) : variance.toFixed(2);
                // Insert stock movement in the same transaction (not via storage to avoid cross-context)
                await client.query(
                  `INSERT INTO stock_movements (tenant_id, item_id, type, quantity, reason) VALUES ($1, $2, $3, $4, $5)`,
                  [user.tenantId, inv.id, "adjustment", movementQty, `Stock count ${session.countNumber}`]
                );
              }
            }
          }
        }
        await client.query("COMMIT");
      } catch (txErr: any) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      const updated = await storage.updateStockCount(session.id, user.tenantId, { status: "approved", approvedAt: new Date(), approvedBy: user.id });
      emitToTenant(user.tenantId, "stock:updated", { source: "stock_count", sessionId: session.id });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Damaged Inventory Routes ──────────────────────────────────────────────
  app.get("/api/damaged-inventory", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const itemCategory = req.query.itemCategory as string | undefined;
      res.json(await storage.getDamagedInventoryByTenant(user.tenantId, itemCategory ? { itemCategory } : undefined));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/damaged-inventory", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const n = await storage.countDamagedInventoryByTenant(user.tenantId);
      const damageNumber = `DMG-${String(n + 1).padStart(4, "0")}`;
      // Normalize damagedQty to whole integer for PIECE items before persisting
      let normalizedBody = { ...req.body };
      if (req.body.inventoryItemId && req.body.damagedQty !== undefined) {
        const invItem = await storage.getInventoryItem(req.body.inventoryItemId, user.tenantId);
        if (invItem?.unitType === 'PIECE') {
          normalizedBody.damagedQty = String(Math.round(parseFloat(String(req.body.damagedQty))));
        }
      }
      const totalValue = (parseFloat(normalizedBody.damagedQty || "0") * parseFloat(normalizedBody.unitCost || "0")).toFixed(2);
      const damage = await storage.createDamagedInventory(
        insertDamagedInventorySchema.parse({ ...normalizedBody, tenantId: user.tenantId, damageNumber, totalValue, createdBy: user.id })
      );
      // Deduct from inventory atomically using SELECT FOR UPDATE to prevent race conditions
      if (damage.inventoryItemId) {
        const dbClient = await pool.connect();
        try {
          await dbClient.query("BEGIN");
          const { rows } = await dbClient.query(
            `SELECT * FROM inventory_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [damage.inventoryItemId, user.tenantId]
          );
          if (rows[0]) {
            const inv = rows[0];
            const damagedQtyParsed = parseFloat(damage.damagedQty);
            const damagedQtyRounded = inv.unit_type === 'PIECE' ? Math.round(damagedQtyParsed) : damagedQtyParsed;
            const rawNewStock = Math.max(0, parseFloat(inv.current_stock || "0") - damagedQtyRounded);
            const newStock = inv.unit_type === 'PIECE' ? Math.round(rawNewStock) : rawNewStock;
            await dbClient.query(`UPDATE inventory_items SET current_stock = $1 WHERE id = $2`, [String(newStock), inv.id]);
            await dbClient.query(
              `INSERT INTO stock_movements (tenant_id, item_id, type, quantity, reason) VALUES ($1, $2, $3, $4, $5)`,
              [user.tenantId, inv.id, "waste", String(-damagedQtyRounded), `Damage ${damageNumber}`]
            );
          }
          await dbClient.query("COMMIT");
        } catch (err) {
          await dbClient.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          dbClient.release();
        }
      }
      res.json(damage);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/damaged-inventory/:id", procurementWrite, async (req, res) => {
    try {
      const user = req.user as any;
      const damage = await storage.updateDamagedInventory(req.params.id, user.tenantId, { ...req.body, reviewedBy: req.body.status !== undefined ? user.id : undefined, reviewedAt: req.body.status !== undefined ? new Date() : undefined });
      if (!damage) return res.status(404).json({ message: "Damage record not found" });
      res.json(damage);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Breakage Monthly Report ───────────────────────────────────────────────
  app.get("/api/reports/breakage-monthly", procurementRead, async (req, res) => {
    try {
      const user = req.user as any;
      const year = req.query.year as string || String(new Date().getFullYear());
      const month = String(req.query.month || (new Date().getMonth() + 1)).padStart(2, '0');
      const monthStr = `${year}-${month}`;
      const report = await storage.getBreakageReport(user.tenantId, monthStr);
      res.json(report);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
