import type { Express } from "express";
import QRCode from "qrcode";
import { storage } from "../storage";
import { db, pool } from "../db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { getNextKotSequence } from "./print-jobs";
import { requireAuth, requireRole } from "../auth";
import { can, needsSupervisorApproval } from "../permissions";
import { auditLogFromReq } from "../audit";
import { emitToTenant } from "../realtime";
import { getSecuritySettings, verifySupervisorOverride } from "./_shared";
import { isStripeConfigured, getUncachableStripeClient } from "../stripe";
import { orders as ordersTable, inventoryItems as inventoryItemsTable, stockMovements as stockMovementsTable, type OrderStatus } from "@shared/schema";
import { convertUnits } from "@shared/units";
import { deductRecipeInventoryForOrder } from "../lib/deduct-recipe-inventory";
import { autoAssignTicket } from "../services/chef-assignment";
import { routeAndPrint } from "../services/printer-service";

function fireAutoAssign(tenantId: string, outletId: string | null | undefined, orderId: string, label?: string) {
  if (!outletId) return;
  setImmediate(() => {
    autoAssignTicket(tenantId, outletId, { orderId, menuItemName: label ?? undefined }).catch(() => {});
  });
}

/** Server-side whitelist of modifier size multipliers (fractional, e.g. 0.3 = +30%).
 *  Labels and multipliers must exactly match SIZE_MODIFIERS / SPICE_MODIFIERS in pos.tsx.
 *  The effective price is: canonicalPrice * (1 + sizeMultiplier).
 *  Spice modifiers carry no price impact (all 0).
 *  "extra" (free-text) modifiers are also zero-priced.
 *  Client-submitted prices are never trusted — only canonical DB price matters.
 */
const MODIFIER_SIZE_MULTIPLIERS: Record<string, number> = {
  Half: -0.2, Regular: 0, Large: 0.3, XL: 0.5,
};

function computeEffectivePrice(
  canonicalPrice: number,
  modifiers: Array<{ groupId?: string; type?: string; label?: string }>,
): number {
  let sizeMultiplier = 0;
  for (const mod of modifiers) {
    const groupKey = mod.groupId ?? mod.type;
    if (groupKey === "size" && mod.label !== undefined) {
      sizeMultiplier = MODIFIER_SIZE_MULTIPLIERS[mod.label] ?? 0;
    }
    // spice and extra modifiers have no price impact
  }
  return Math.max(0, canonicalPrice * (1 + sizeMultiplier));
}

export function registerOrdersRoutes(app: Express): void {
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const [data, [{ total }]] = await Promise.all([
        storage.getOrdersByTenant(user.tenantId, { limit, offset }),
        db.select({ total: sql<number>`count(*)::int` }).from(ordersTable).where(eq(ordersTable.tenantId, user.tenantId)),
      ]);
      res.json({ data, total: Number(total), limit, offset });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/orders/on-hold", requireAuth, async (req, res) => {
    try {
      const user = req.user as Express.User & { tenantId: string; id: string; role: string };
      const isManager = ["owner", "manager", "admin"].includes(user.role);
      const onHoldStatus: OrderStatus = "on_hold";
      const conditions = isManager
        ? and(eq(ordersTable.tenantId, user.tenantId), eq(ordersTable.status, onHoldStatus))
        : and(eq(ordersTable.tenantId, user.tenantId), eq(ordersTable.status, onHoldStatus), eq(ordersTable.waiterId, user.id));
      const heldOrders = await db.select().from(ordersTable).where(conditions);
      const result = await Promise.all(heldOrders.map(async (order) => {
        const items = await storage.getOrderItemsByOrder(order.id);
        return { ...order, items };
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/orders/delivery-queue", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const pendingStatuses: OrderStatus[] = ["new", "on_hold"];
      const activeStatuses: OrderStatus[] = ["in_progress", "ready", "sent_to_kitchen"];
      const allStatuses = [...pendingStatuses, ...activeStatuses];
      const rows = await db.select().from(ordersTable).where(
        and(
          eq(ordersTable.tenantId, user.tenantId),
          eq(ordersTable.orderType, "delivery"),
          inArray(ordersTable.status, allStatuses)
        )
      ).orderBy(ordersTable.createdAt);
      const result = await Promise.all(rows.map(async (order) => {
        const items = await storage.getOrderItemsByOrder(order.id);
        return { ...order, items, queueType: pendingStatuses.includes(order.status as OrderStatus) ? "pending" : "active" };
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/orders/:id/accept-delivery", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id);
      if (!order || order.tenantId !== user.tenantId) return res.status(404).json({ message: "Order not found" });
      if (order.orderType !== "delivery") return res.status(400).json({ message: "Not a delivery order" });
      const etaMinutes = Math.max(5, Math.min(120, parseInt(req.body.etaMinutes) || 30));
      const estimatedReadyAt = new Date(Date.now() + etaMinutes * 60 * 1000);
      await pool.query(
        `UPDATE orders SET status = 'in_progress', estimated_ready_at = $1 WHERE id = $2`,
        [estimatedReadyAt, order.id]
      );
      try {
        await deductRecipeInventoryForOrder(order.id, user.tenantId, "delivery");
      } catch (deductErr) {
        console.error(`[orders/accept-delivery] Inventory deduction failed for order ${order.id}:`, deductErr);
      }
      emitToTenant(user.tenantId, "order:delivery_accepted", { orderId: order.id, etaMinutes, estimatedReadyAt });
      emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status: "in_progress", orderType: "delivery" });
      auditLogFromReq(req, { action: "delivery_order_accepted", entityType: "order", entityId: order.id, before: { status: order.status }, after: { status: "in_progress", etaMinutes } });
      res.json({ success: true, estimatedReadyAt });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/orders/:id/reject-delivery", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id);
      if (!order || order.tenantId !== user.tenantId) return res.status(404).json({ message: "Order not found" });
      if (order.orderType !== "delivery") return res.status(400).json({ message: "Not a delivery order" });
      const rejectionReason = String(req.body.rejectionReason || "Order rejected by restaurant");
      await pool.query(
        `UPDATE orders SET status = 'cancelled', rejection_reason = $1 WHERE id = $2`,
        [rejectionReason, order.id]
      );
      emitToTenant(user.tenantId, "order:delivery_rejected", { orderId: order.id, rejectionReason });
      emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status: "cancelled", orderType: "delivery" });
      auditLogFromReq(req, { action: "delivery_order_rejected", entityType: "order", entityId: order.id, before: { status: order.status }, after: { status: "cancelled", rejectionReason } });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/orders/:id/dispatch-delivery", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id);
      if (!order || order.tenantId !== user.tenantId) return res.status(404).json({ message: "Order not found" });
      if (order.orderType !== "delivery") return res.status(400).json({ message: "Not a delivery order" });
      await storage.updateOrder(order.id, { status: "served" });
      emitToTenant(user.tenantId, "order:delivery_dispatched", { orderId: order.id });
      emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status: "served", orderType: "delivery" });
      auditLogFromReq(req, { action: "delivery_order_dispatched", entityType: "order", entityId: order.id, before: { status: order.status }, after: { status: "served" } });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/orders/:id/accept", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id);
      if (!order || order.tenantId !== user.tenantId) return res.status(404).json({ message: "Order not found" });
      if (order.orderType !== "delivery") return res.status(400).json({ message: "Not a delivery order" });
      const etaMinutes = Math.max(5, Math.min(120, parseInt(req.body.etaMinutes) || 30));
      const estimatedReadyAt = new Date(Date.now() + etaMinutes * 60 * 1000);
      await pool.query(
        `UPDATE orders SET status = 'in_progress', estimated_ready_at = $1 WHERE id = $2`,
        [estimatedReadyAt, order.id]
      );
      try {
        await deductRecipeInventoryForOrder(order.id, user.tenantId, "delivery");
      } catch (deductErr) {
        console.error(`[orders/accept] Inventory deduction failed for order ${order.id}:`, deductErr);
      }
      emitToTenant(user.tenantId, "order:delivery_accepted", { orderId: order.id, etaMinutes, estimatedReadyAt });
      emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status: "in_progress", orderType: "delivery" });
      auditLogFromReq(req, { action: "delivery_order_accepted", entityType: "order", entityId: order.id, before: { status: order.status }, after: { status: "in_progress", etaMinutes } });
      res.json({ success: true, estimatedReadyAt });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/orders/:id/reject", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id);
      if (!order || order.tenantId !== user.tenantId) return res.status(404).json({ message: "Order not found" });
      if (order.orderType !== "delivery") return res.status(400).json({ message: "Not a delivery order" });
      const rejectionReason = String(req.body.rejectionReason || "Order rejected by restaurant");
      await pool.query(
        `UPDATE orders SET status = 'cancelled', rejection_reason = $1 WHERE id = $2`,
        [rejectionReason, order.id]
      );
      emitToTenant(user.tenantId, "order:delivery_rejected", { orderId: order.id, rejectionReason });
      emitToTenant(user.tenantId, "order:updated", { orderId: order.id, status: "cancelled", orderType: "delivery" });
      auditLogFromReq(req, { action: "delivery_order_rejected", entityType: "order", entityId: order.id, before: { status: order.status }, after: { status: "cancelled", rejectionReason } });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const user = req.user as Express.User & { tenantId: string };
    const order = await storage.getOrder(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
    const items = await storage.getOrderItemsByOrder(order.id);
    res.json({ ...order, items });
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { items, supervisorOverride, dismissedRuleIds, manualDiscountAmount, clientOrderId, ...orderData } = req.body;

      if (clientOrderId) {
        const existing = await storage.getOrderByClientId(user.tenantId, clientOrderId);
        if (existing) {
          const existingItems = await storage.getOrderItemsByOrder(existing.id);
          return res.status(409).json({ message: "Duplicate order", order: { ...existing, items: existingItems } });
        }
        orderData.channelOrderId = clientOrderId;
      }
      const hasClientOrderId = !!clientOrderId;

      const secSettings = await getSecuritySettings(user.tenantId);
      const discountPct = Number(orderData.discount || 0);
      if (secSettings.requireSupervisorForLargeDiscount && discountPct > secSettings.largeDiscountThreshold && !can(user, "apply_large_discount")) {
        if (supervisorOverride) {
          const result = await verifySupervisorOverride(supervisorOverride, user.tenantId, "apply_large_discount", req);
          if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
        } else {
          return res.status(403).json({ message: "Permission denied", action: "apply_large_discount", requiresSupervisor: true });
        }
      }

      const menuItemsList = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItemsList.map(m => [m.id, m]));
      const comboIdsInOrder: string[] = [];

      let serverSubtotal = 0;
      const serverItems: { menuItemId: string; name: string; price: number; quantity: number; categoryId?: string }[] = [];
      if (items && items.length > 0) {
        for (const item of items) {
          const isComboItem = item.isCombo === true || item.menuItemId?.startsWith("combo-") || false;
          if (isComboItem) {
            const comboId = item.comboId || item.menuItemId?.replace(/^combo-/, "").replace(/-\d+$/, "") || item.menuItemId;
            const combo = await storage.getComboOffer(comboId, user.tenantId);
            if (!combo) {
              return res.status(400).json({ message: `Combo offer not found: ${comboId}` });
            }
            if (!combo.isActive) {
              return res.status(400).json({ message: `Combo "${combo.name}" is no longer active` });
            }
            const now = new Date();
            if (combo.validityStart && now < new Date(combo.validityStart)) {
              return res.status(400).json({ message: `Combo "${combo.name}" has not started yet` });
            }
            if (combo.validityEnd && now > new Date(combo.validityEnd)) {
              return res.status(400).json({ message: `Combo "${combo.name}" has expired` });
            }
            if (combo.timeSlots && Array.isArray(combo.timeSlots) && (combo.timeSlots as string[]).length > 0) {
              const hour = now.getHours();
              const slotMap: Record<string, [number, number]> = { breakfast: [6, 11], lunch: [11, 15], dinner: [18, 23], "late-night": [23, 6] };
              const currentSlots = Object.entries(slotMap).filter(([, [s, e]]) => s <= e ? hour >= s && hour < e : hour >= s || hour < e).map(([k]) => k);
              const comboSlots = combo.timeSlots as string[];
              if (!currentSlots.some(cs => comboSlots.includes(cs))) {
                return res.status(400).json({ message: `Combo "${combo.name}" is not available at this time` });
              }
            }
            if (combo.outlets && Array.isArray(combo.outlets) && (combo.outlets as string[]).length > 0) {
              const userOutletId = "outletId" in user ? (user as { outletId?: string }).outletId : null;
              if (userOutletId && !(combo.outlets as string[]).includes(userOutletId)) {
                return res.status(400).json({ message: `Combo "${combo.name}" is not available at this outlet` });
              }
            }
            comboIdsInOrder.push(comboId);
            const comboPrice = Number(combo.comboPrice);
            const qty = Number(item.quantity) || 1;
            serverSubtotal += comboPrice * qty;
            serverItems.push({
              menuItemId: comboId,
              name: combo.name,
              price: comboPrice,
              quantity: qty,
              categoryId: undefined,
            });

          } else {
            const mi = item.menuItemId ? menuMap.get(item.menuItemId) : undefined;
            const canonicalPrice = mi ? Number(mi.price) : 0;
            const effectivePrice = Array.isArray(item.modifiers) && item.modifiers.length > 0
              ? computeEffectivePrice(canonicalPrice, item.modifiers as Array<{ groupId?: string; type?: string; label?: string }>)
              : canonicalPrice;
            const qty = Number(item.quantity) || 1;
            serverSubtotal += effectivePrice * qty;
            serverItems.push({
              menuItemId: item.menuItemId,
              name: mi?.name || item.name,
              price: effectivePrice,
              quantity: qty,
              categoryId: mi?.categoryId || undefined,
            });
          }
        }
      }

      serverSubtotal = Math.round(serverSubtotal * 100) / 100;

      const { evaluateRules } = await import("../promotions-engine");
      const promotionRules = await storage.getPromotionRulesByTenant(user.tenantId);
      const tenant = await storage.getTenant(user.tenantId);
      const taxRate = Number(tenant?.taxRate || 0) / 100;
      const serviceChargeRate = Number(tenant?.serviceCharge || 0) / 100;
      const isGST = tenant?.currency === "INR" && tenant?.taxType === "gst";

      const channel = orderData.channel || "pos";

      const engineResult = evaluateRules(promotionRules, {
        items: serverItems,
        subtotal: serverSubtotal,
        channel,
        orderType: orderData.orderType,
        outletId: orderData.outletId,
        taxRate,
        serviceChargeRate,
      });

      const dismissedSet = new Set(Array.isArray(dismissedRuleIds) ? dismissedRuleIds : []);
      const activeDiscounts = engineResult.appliedDiscounts.filter(d => !dismissedSet.has(d.ruleId));
      const engineDiscountTotal = activeDiscounts.reduce((s, d) => s + (d.discountAmount > 0 ? d.discountAmount : 0), 0);
      const engineSurchargeTotal = activeDiscounts.reduce((s, d) => s + (d.discountAmount < 0 ? Math.abs(d.discountAmount) : 0), 0);

      let offerDiscount = 0;
      if (orderData.offerId) {
        const offer = await storage.getOfferByTenant(orderData.offerId, user.tenantId);
        if (offer && offer.active) {
          if (offer.type === "percentage" || offer.type === "happy_hour") {
            offerDiscount = serverSubtotal * (Number(offer.value) / 100);
          } else if (offer.type === "fixed_amount") {
            offerDiscount = Number(offer.value);
          }
          if (offer.maxDiscount && offerDiscount > Number(offer.maxDiscount)) {
            offerDiscount = Number(offer.maxDiscount);
          }
          offerDiscount = Math.round(offerDiscount * 100) / 100;
        }
      }

      const manualDiscount = Number(manualDiscountAmount || 0);
      const totalDiscount = Math.round((engineDiscountTotal + offerDiscount + manualDiscount) * 100) / 100;
      const afterDiscount = Math.max(0, serverSubtotal - totalDiscount + engineSurchargeTotal);
      const serverServiceCharge = Math.round(afterDiscount * serviceChargeRate * 100) / 100;
      const serverTax = Math.round(afterDiscount * taxRate * 100) / 100;
      const serverTotal = Math.round((afterDiscount + serverServiceCharge + serverTax) * 100) / 100;

      let gstNotes: string | undefined;
      if (isGST && serverTax > 0) {
        const cgstRate = Number(tenant?.cgstRate || 0);
        const sgstRate = Number(tenant?.sgstRate || 0);
        const rateSum = cgstRate + sgstRate;
        const cgstAmount = rateSum > 0 ? Math.round(serverTax * cgstRate / rateSum * 100) / 100 : serverTax / 2;
        const sgstAmount = Math.round((serverTax - cgstAmount) * 100) / 100;
        gstNotes = `CGST(${cgstRate}%): ${cgstAmount.toFixed(2)} | SGST(${sgstRate}%): ${sgstAmount.toFixed(2)}`;
      }

      const serverOrderData = {
        ...orderData,
        tenantId: user.tenantId,
        waiterId: user.id,
        subtotal: serverSubtotal.toFixed(2),
        discount: totalDiscount.toFixed(2),
        discountAmount: totalDiscount > 0 ? totalDiscount.toFixed(2) : null,
        tax: serverTax.toFixed(2),
        total: serverTotal.toFixed(2),
        ...(gstNotes ? { notes: [orderData.notes, gstNotes].filter(Boolean).join(" | ") } : {}),
      };

      let order;
      try {
        order = await storage.createOrder(serverOrderData);
      } catch (dbErr: any) {
        if (hasClientOrderId && dbErr.code === "23505" && dbErr.constraint?.includes("channel_order_id")) {
          const dup = await storage.getOrderByClientId(user.tenantId, clientOrderId);
          if (dup) {
            const dupItems = await storage.getOrderItemsByOrder(dup.id);
            return res.status(409).json({ message: "Duplicate order", order: { ...dup, items: dupItems } });
          }
        }
        throw dbErr;
      }
      if (items && items.length > 0) {
        for (const item of items) {
          const isComboItem = item.isCombo === true || item.menuItemId?.startsWith("combo-") || false;
          if (isComboItem) {
            const comboId = item.comboId || item.menuItemId?.replace(/^combo-/, "").replace(/-\d+$/, "") || item.menuItemId;
            const combo = await storage.getComboOffer(comboId, user.tenantId);
            if (combo) {
              const mainCItems2 = (combo.mainItems as { menuItemId: string; name: string; price: string }[]) || [];
              const sideCItems2 = (combo.sideItems as { menuItemId: string; name: string; price: string }[]) || [];
              const addonCItems2 = (combo.addonItems as { menuItemId: string; name: string; price: string }[]) || [];
              const allComponents = [...mainCItems2, ...sideCItems2, ...addonCItems2];
              const componentNames = allComponents.map(c => c.name).join(", ");
              const savingsAmt = (Number(combo.individualTotal) - Number(combo.comboPrice)).toFixed(2);
              await storage.createOrderItem({
                menuItemId: null,
                name: `${combo.name} (Save ${savingsAmt})`,
                price: Number(combo.comboPrice).toFixed(2),
                quantity: Number(item.quantity) || 1,
                notes: `Includes: ${componentNames}`,
                orderId: order.id,
                station: null,
                course: null,
                metadata: {
                  isCombo: true,
                  comboId,
                  components: allComponents.map(c => ({ menuItemId: c.menuItemId, name: c.name })),
                },
              });
            }
          } else {
            const mi = item.menuItemId ? menuMap.get(item.menuItemId) : undefined;
            const canonicalPrice = mi ? Number(mi.price) : 0;
            const effectivePrice2 = Array.isArray(item.modifiers) && item.modifiers.length > 0
              ? computeEffectivePrice(canonicalPrice, item.modifiers as Array<{ groupId?: string; type?: string; label?: string }>)
              : canonicalPrice;
            await storage.createOrderItem({
              ...item,
              price: effectivePrice2.toFixed(2),
              orderId: order.id,
              station: item.station || mi?.station || null,
              course: item.course || mi?.course || null,
            });
          }
        }
      }
      for (const item of items || []) {
        const isComboItem = item.isCombo === true || item.menuItemId?.startsWith("combo-") || false;
        if (isComboItem) {
          const comboId = item.comboId || item.menuItemId?.replace(/^combo-/, "").replace(/-\d+$/, "") || item.menuItemId;
          const qty = Number(item.quantity) || 1;
          for (let i = 0; i < qty; i++) {
            storage.incrementComboOrderCount(comboId, user.tenantId).catch(() => {});
          }
        }
      }
      if (orderData.tableId) {
        await storage.updateTable(orderData.tableId, { status: "occupied" });
        emitToTenant(user.tenantId, "table:updated", { tableId: orderData.tableId, status: "occupied" });
      }
      const orderItems = await storage.getOrderItemsByOrder(order.id);
      auditLogFromReq(req, { action: "order_created", entityType: "order", entityId: order.id, entityName: `Order #${order.orderNumber || order.id.slice(0, 8)}`, after: { orderType: order.orderType, status: order.status, total: order.total, itemCount: orderItems.length, engineDiscounts: activeDiscounts.length } });

      if ((order.status === "sent_to_kitchen" || order.status === "in_progress") && orderItems.length > 0) {
        const sentAt = new Date().toISOString();
        const tables = orderData.tableId ? await storage.getTablesByTenant(user.tenantId) : [];
        const tableNum = orderData.tableId ? tables.find(t => t.id === orderData.tableId)?.number : undefined;
        const stations = Array.from(new Set(orderItems.map(i => i.station).filter((s): s is string => Boolean(s))));
        const kotSequence = await getNextKotSequence(user.tenantId, order.id);
        if (stations.length === 0) {
          await storage.createPrintJob({
            tenantId: user.tenantId,
            type: "kot",
            referenceId: order.id,
            station: null,
            status: "queued",
            payload: {
              kotSequence,
              orderId: order.id,
              orderType: order.orderType,
              tableNumber: tableNum ?? null,
              station: null,
              sentAt,
              items: orderItems.map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes, course: i.course })),
            },
          });
        } else {
          for (const stationName of stations) {
            const stationItems = orderItems.filter(i => i.station === stationName);
            if (stationItems.length === 0) continue;
            await storage.createPrintJob({
              tenantId: user.tenantId,
              type: "kot",
              referenceId: order.id,
              station: stationName,
              status: "queued",
              payload: {
                kotSequence,
                orderId: order.id,
                orderType: order.orderType,
                tableNumber: tableNum ?? null,
                station: stationName,
                sentAt,
                items: stationItems.map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes, course: i.course })),
              },
            });
          }
        }
      }

      emitToTenant(user.tenantId, "order:new", { orderId: order.id, status: order.status, tableId: order.tableId, orderType: order.orderType });
      const allergyItems = orderItems.filter(i => {
        const fm = (i.metadata as any)?.foodModification;
        return fm && (fm.allergies?.length > 0 || fm.allergyNote?.trim());
      });
      for (const ai of allergyItems) {
        const fm = (ai.metadata as any).foodModification;
        emitToTenant(user.tenantId, "allergy:alert", {
          orderId: order.id,
          itemId: ai.id,
          itemName: ai.name,
          allergies: fm.allergies ?? [],
          allergyNote: fm.allergyNote ?? null,
          tableId: order.tableId,
        });
      }
      if (order.status === "sent_to_kitchen" || order.status === "new") {
        fireAutoAssign(user.tenantId, order.outletId, order.id, `${order.orderType ?? "order"} #${order.id.slice(-6)}`);
      }
      res.json({ ...order, items: orderItems });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/orders/:id", requireAuth, async (req, res) => {
    const user = req.user as Express.User & { tenantId: string; id: string; role: string; name: string };
    const existing = await storage.getOrder(req.params.id);
    if (!existing) return res.status(404).json({ message: "Order not found" });
    if (existing.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });

    const secSettings = await getSecuritySettings(user.tenantId);

    if (req.body.status === "voided" && secSettings.requireSupervisorForVoid && !can(user, "void_order")) {
      if (req.body.supervisorOverride) {
        const result = await verifySupervisorOverride(req.body.supervisorOverride, user.tenantId, "void_order", req);
        if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
      } else {
        return res.status(403).json({ message: "Permission denied", action: "void_order", requiresSupervisor: needsSupervisorApproval(user, "void_order") });
      }
    }

    if (req.body.discount !== undefined) {
      const discountPct = Number(req.body.discount);
      if (secSettings.requireSupervisorForLargeDiscount && discountPct > secSettings.largeDiscountThreshold && !can(user, "apply_large_discount")) {
        if (req.body.supervisorOverride) {
          const result = await verifySupervisorOverride(req.body.supervisorOverride, user.tenantId, "apply_large_discount", req);
          if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
        } else {
          return res.status(403).json({ message: "Permission denied", action: "apply_large_discount", requiresSupervisor: true });
        }
      }
    }

    const { supervisorOverride: _svOverride, ...updateData } = req.body as Record<string, any>;

    if (req.body.status === "paid" && existing.orderType === "dine_in") {
      const tenant = await storage.getTenant(user.tenantId);
      const serviceChargeRate = Number(tenant?.serviceCharge || 0) / 100;
      if (serviceChargeRate > 0) {
        const subtotal = Number(existing.subtotal || 0);
        const serviceChargeAmount = subtotal * serviceChargeRate;
        const existingTotal = Number(existing.total || 0);
        updateData.total = (existingTotal + serviceChargeAmount).toFixed(2);
        updateData.notes = [existing.notes, `Service charge (${tenant?.serviceCharge}%): ${serviceChargeAmount.toFixed(2)}`].filter(Boolean).join(" | ");
      }
    }

    type DepletionWrite = {
      inventoryItemId: string;
      tenantId: string; menuItemId: string; recipeId: string;
      qty: number; reason: string;
    };
    type ReversalEntry = { tenantId: string; itemId: string; qty: number; menuItemId: string | null; recipeId: string | null };

    let depletionWrites: DepletionWrite[] = [];
    let reversalEntries: ReversalEntry[] = [];

    if (req.body.status === "paid" && existing.status !== "paid") {
      const oItems = await storage.getOrderItemsByOrder(req.params.id);
      type DepletionTarget = { menuItemId: string; name: string; quantity: number };
      const depletionTargets: DepletionTarget[] = [];
      for (const oi of oItems) {
        if (oi.menuItemId) {
          depletionTargets.push({ menuItemId: oi.menuItemId, name: oi.name, quantity: oi.quantity || 1 });
        } else if (oi.metadata && typeof oi.metadata === "object" && (oi.metadata as Record<string, unknown>).isCombo) {
          const meta = oi.metadata as { components?: { menuItemId: string; name: string }[] };
          if (meta.components) {
            for (const comp of meta.components) {
              depletionTargets.push({ menuItemId: comp.menuItemId, name: comp.name, quantity: oi.quantity || 1 });
            }
          }
        }
      }
      for (const dt of depletionTargets) {
        const recipe = await storage.getRecipeByMenuItem(dt.menuItemId);
        if (!recipe) continue;
        const recipeIngs = await storage.getRecipeIngredients(recipe.id);
        for (const ing of recipeIngs) {
          const invItem = await storage.getInventoryItem(ing.inventoryItemId);
          if (!invItem) continue;
          const ingUnit = ing.unit || invItem.unit || "pcs";
          const invUnit = invItem.unit || "pcs";
          const baseQty = Number(ing.quantity) / (1 - Number(ing.wastePct || 0) / 100);
          const convertedQty = convertUnits(baseQty, ingUnit, invUnit);
          const qty = Math.round(convertedQty * dt.quantity * 100) / 100;
          depletionWrites.push({
            inventoryItemId: ing.inventoryItemId,
            tenantId: user.tenantId,
            menuItemId: dt.menuItemId,
            recipeId: recipe.id,
            qty,
            reason: `Recipe consumption: ${dt.name} x${dt.quantity}`,
          });
        }
      }
    } else if (
      (req.body.status === "voided" || req.body.status === "cancelled") &&
      existing.status === "paid"
    ) {
      const consumptions = await storage.getStockMovementsByOrder(req.params.id);
      const alreadyReversed = consumptions.some((m) => m.type === "RECIPE_REVERSAL");
      if (!alreadyReversed) {
        for (const mv of consumptions) {
          if (mv.type === "RECIPE_CONSUMPTION") {
            reversalEntries.push({ tenantId: mv.tenantId, itemId: mv.itemId, qty: Number(mv.quantity), menuItemId: mv.menuItemId, recipeId: mv.recipeId });
          }
        }
      }
    }

    let order;
    if (depletionWrites.length > 0) {
      order = await db.transaction(async (tx) => {
        const [updated] = await tx.update(ordersTable).set(updateData).where(eq(ordersTable.id, req.params.id)).returning();
        for (const w of depletionWrites) {
          await tx.update(inventoryItemsTable)
            .set({ currentStock: sql`GREATEST(${inventoryItemsTable.currentStock}::numeric - ${w.qty}, 0)` })
            .where(eq(inventoryItemsTable.id, w.inventoryItemId));
          await tx.insert(stockMovementsTable).values({
            tenantId: w.tenantId,
            itemId: w.inventoryItemId,
            type: "RECIPE_CONSUMPTION",
            quantity: String(w.qty),
            reason: w.reason,
            orderId: req.params.id,
            menuItemId: w.menuItemId,
            recipeId: w.recipeId,
          });
        }
        return updated;
      });
    } else if (reversalEntries.length > 0) {
      order = await db.transaction(async (tx) => {
        const [updated] = await tx.update(ordersTable).set(updateData).where(eq(ordersTable.id, req.params.id)).returning();
        for (const rv of reversalEntries) {
          await tx.update(inventoryItemsTable)
            .set({ currentStock: sql`LEAST(${inventoryItemsTable.currentStock}::numeric + ${rv.qty}, 999999999)` })
            .where(eq(inventoryItemsTable.id, rv.itemId));
          await tx.insert(stockMovementsTable).values({
            tenantId: rv.tenantId,
            itemId: rv.itemId,
            type: "RECIPE_REVERSAL",
            quantity: String(rv.qty),
            reason: `Reversal (${req.body.status}): order ${req.params.id}`,
            orderId: req.params.id,
            menuItemId: rv.menuItemId,
            recipeId: rv.recipeId,
          });
        }
        return updated;
      });
    } else {
      order = await storage.updateOrder(req.params.id, updateData);
    }

    if (req.body.status === "sent_to_kitchen" && existing.status !== "sent_to_kitchen") {
      const allItems = await storage.getOrderItemsByOrder(req.params.id);
      if (allItems.length > 0) {
        const sentAt = new Date().toISOString();
        const tables = existing.tableId ? await storage.getTablesByTenant(user.tenantId) : [];
        const tableNum = existing.tableId ? tables.find(t => t.id === existing.tableId)?.number : undefined;
        const stationsArr = Array.from(new Set(allItems.map(i => i.station).filter((s): s is string => Boolean(s))));
        const kotSequence = await getNextKotSequence(user.tenantId, req.params.id);
        if (stationsArr.length === 0) {
          await storage.createPrintJob({
            tenantId: user.tenantId, type: "kot", referenceId: req.params.id, station: null, status: "queued",
            payload: {
              kotSequence,
              orderId: req.params.id, orderType: existing.orderType, tableNumber: tableNum ?? null, station: null, sentAt,
              items: allItems.map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes, course: i.course })),
            },
          });
        } else {
          for (const stn of stationsArr) {
            const stnItems = allItems.filter(i => i.station === stn);
            if (stnItems.length === 0) continue;
            await storage.createPrintJob({
              tenantId: user.tenantId, type: "kot", referenceId: req.params.id, station: stn, status: "queued",
              payload: {
                kotSequence,
                orderId: req.params.id, orderType: existing.orderType, tableNumber: tableNum ?? null, station: stn, sentAt,
                items: stnItems.map(i => ({ name: i.name, quantity: i.quantity, notes: i.notes, course: i.course })),
              },
            });
          }
        }
      }
    }

    if (req.body.status === "sent_to_kitchen" && existing.status !== "sent_to_kitchen") {
      setImmediate(() => {
        routeAndPrint({
          jobType: "kot",
          referenceId: req.params.id,
          outletId: existing.outletId ?? null,
          tenantId: user.tenantId,
          triggeredByName: user.name || user.username,
        }).catch(err => {
          console.error(`[orders] Auto-print KOT failed for order ${req.params.id}:`, err);
        });
      });
      fireAutoAssign(user.tenantId, existing.outletId, req.params.id, `${existing.orderType ?? "order"} #${req.params.id.slice(-6)}`);
    }

    if (req.body.status === "paid" && existing.status !== "paid" && existing.tableId) {
      await storage.updateTable(existing.tableId, { status: "free" });
      emitToTenant(user.tenantId, "table:updated", { tableId: existing.tableId, status: "free" });
    } else if (
      (req.body.status === "voided" || req.body.status === "cancelled") &&
      existing.tableId
    ) {
      await storage.updateTable(existing.tableId, { status: "free" });
      emitToTenant(user.tenantId, "table:updated", { tableId: existing.tableId, status: "free" });
    }

    if (req.body.status && req.body.status !== existing.status) {
      const terminalStatuses = ["served", "paid", "voided", "cancelled"];
      if (terminalStatuses.includes(req.body.status)) {
        emitToTenant(user.tenantId, "order:completed", { orderId: req.params.id, status: req.body.status, tableId: existing.tableId });
      } else {
        emitToTenant(user.tenantId, "order:updated", { orderId: req.params.id, status: req.body.status, tableId: existing.tableId });
      }
    }

    if (req.body.status === "voided" || req.body.status === "cancelled") {
      auditLogFromReq(req, {
        action: req.body.status === "voided" ? "order_voided" : "order_updated",
        entityType: "order", entityId: req.params.id,
        before: { status: existing.status, total: existing.total },
        after: { status: req.body.status },
      });
    } else if (existing.status !== req.body.status) {
      auditLogFromReq(req, { action: "order_updated", entityType: "order", entityId: req.params.id, before: { status: existing.status }, after: { status: req.body.status } });
    }

    const enriched: Record<string, unknown> = { ...(order as object) };
    if (order?.tableId) {
      const table = await storage.getTable(order.tableId);
      if (table) enriched.tableStatus = table.status;
    }
    if (order?.customerId) {
      const customer = await storage.getCustomerByTenant(order.customerId, user.tenantId);
      if (customer) enriched.loyaltyStatus = { points: customer.loyaltyPoints, tier: customer.loyaltyTier };
    }
    res.json(enriched);
  });

  app.get("/api/order-items", requireAuth, async (req, res) => {
    const user = req.user as any;
    const items = await storage.getOrderItemsByTenant(user.tenantId);
    res.json(items);
  });

  app.get("/api/order-items/:orderId", requireAuth, async (req, res) => {
    const user = req.user as any;
    const order = await storage.getOrder(req.params.orderId);
    if (!order || order.tenantId !== user.tenantId) {
      return res.status(404).json({ message: "Order not found" });
    }
    const items = await storage.getOrderItemsByOrder(req.params.orderId);
    res.json(items);
  });

  app.patch("/api/order-items/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const item = await storage.updateOrderItem(req.params.id, req.body);
    if (!item) return res.status(404).json({ message: "Item not found" });
    const order = await storage.getOrder(item.orderId);
    if (!order || order.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(item);
  });

  app.post("/api/orders/:id/payment-link", requireAuth, async (req, res) => {
    try {
      if (!await isStripeConfigured()) {
        return res.status(503).json({ message: "Stripe is not configured" });
      }
      const user = req.user as any;
      const order = await storage.getOrder(req.params.id);
      if (!order || order.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Order not found" });
      }
      const eligibleStatuses = ["new", "in_progress", "ready_to_pay", "pending_payment"] as const;
      if (!eligibleStatuses.includes(order.status as any)) {
        return res.status(400).json({ message: `Order status '${order.status}' is not eligible for a payment link` });
      }
      const stripeClient = await getUncachableStripeClient();
      const tenant = await storage.getTenant(user.tenantId);
      const currency = (tenant?.currency || "usd").toLowerCase();
      const amountInCents = Math.round(Number(order.total) * 100);
      const origin = `${req.protocol}://${req.get("host")}`;
      const session = await stripeClient.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency,
            product_data: { name: `Order Payment — ${tenant?.name || "Restaurant"}` },
            unit_amount: amountInCents,
          },
          quantity: 1,
        }],
        success_url: `${origin}/app/orders?payment_success=1&orderId=${order.id}`,
        cancel_url: `${origin}/app/orders?payment_cancelled=1&orderId=${order.id}`,
        metadata: {
          orderPayment: "true",
          orderId: order.id,
          tenantId: user.tenantId,
          channel: "pos",
        },
      });
      await storage.updateOrder(order.id, { status: "pending_payment" });
      await pool.query(
        `UPDATE orders SET stripe_payment_session_id = $1 WHERE id = $2`,
        [session.id, order.id]
      );
      const qrDataUrl = await QRCode.toDataURL(session.url!, { width: 256, margin: 2 });
      res.json({ url: session.url, sessionId: session.id, orderId: order.id, qrDataUrl });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/orders-with-offers", requireAuth, async (req, res) => {
    const user = req.user as any;
    const result = await storage.getOrdersWithOfferDetails(user.tenantId);
    res.json(result);
  });
}
