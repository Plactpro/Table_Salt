import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { emitToTenant } from "../realtime";
import { verifySupervisorOverride } from "./_shared";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { tenants as tenantsTable } from "@shared/schema";
import { createPaymentLink, getPaymentLink, verifyWebhookSignature } from "../razorpay";

function getFiscalYear(date: Date): string {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  if (m >= 4) return `${y}-${String(y + 1).slice(2)}`;
  return `${y - 1}-${String(y).slice(2)}`;
}

function numWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (n === 0) return "Zero";
  function convert(num: number): string {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convert(num % 100) : "");
  }
  const paise = Math.round((n % 1) * 100);
  const rupees = Math.floor(n);
  let result = convert(rupees);
  if (paise > 0) result += ` & ${paise} Paise`;
  return result;
}

export function registerRestaurantBillingRoutes(app: Express): void {

  app.get("/api/restaurant-bills", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const bills = await storage.getBillsByTenant(user.tenantId, { limit, offset, status });
      res.json(bills);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/restaurant-bills/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const payments = await storage.getBillPayments(bill.id);
      const order = await storage.getOrder(bill.orderId);
      const items = order ? await storage.getOrderItemsByOrder(order.id) : [];
      res.json({ ...bill, payments, order, items, amountInWords: numWords(Number(bill.totalAmount)) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/restaurant-bills/by-order/:orderId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBillByOrder(req.params.orderId);
      if (!bill) return res.status(404).json({ message: "No bill for this order" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const payments = await storage.getBillPayments(bill.id);
      const order = await storage.getOrder(bill.orderId);
      const items = order ? await storage.getOrderItemsByOrder(order.id) : [];
      res.json({ ...bill, payments, order, items, amountInWords: numWords(Number(bill.totalAmount)) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/restaurant-bills", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { orderId, tableId, customerId, subtotal, discountAmount, discountReason,
        serviceCharge, taxAmount, taxBreakdown, tips, totalAmount, covers, posSessionId } = req.body;
      if (!orderId || totalAmount == null) return res.status(400).json({ message: "orderId and totalAmount are required" });
      const referencedOrder = await storage.getOrder(orderId);
      if (!referencedOrder) return res.status(404).json({ message: "Order not found" });
      if (referencedOrder.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const existing = await storage.getBillByOrder(orderId);
      if (existing) return res.json({ ...existing, alreadyExists: true });

      const tenant = await storage.getTenant(user.tenantId);
      const isGST = tenant?.currency === "INR" && tenant?.taxType === "gst";
      let invoiceNumber: string | null = null;
      let cgstAmount: string | null = null;
      let sgstAmount: string | null = null;
      let resolvedTaxBreakdown = taxBreakdown || null;
      const { customerGstin } = req.body;

      if (isGST) {
        const cgstRate = Number(tenant?.cgstRate ?? 9);
        const sgstRate = Number(tenant?.sgstRate ?? 9);
        const tax = Number(taxAmount ?? 0);
        const totalGstRate = cgstRate + sgstRate || 18;
        const cgst = Math.round((tax * cgstRate / totalGstRate) * 100) / 100;
        const sgst = Math.round((tax * sgstRate / totalGstRate) * 100) / 100;
        cgstAmount = String(cgst);
        sgstAmount = String(sgst);
        resolvedTaxBreakdown = {
          [`CGST (${cgstRate}%)`]: cgst.toFixed(2),
          [`SGST (${sgstRate}%)`]: sgst.toFixed(2),
        };

        const prefix = tenant?.invoicePrefix || "INV";
        const fy = getFiscalYear(new Date());
        const [updated] = await db.update(tenantsTable)
          .set({ invoiceCounter: sql`COALESCE(${tenantsTable.invoiceCounter}, 0) + 1` })
          .where(eq(tenantsTable.id, user.tenantId))
          .returning({ counter: tenantsTable.invoiceCounter });
        const counter = updated?.counter ?? 1;
        invoiceNumber = `${prefix}/${fy}/${String(counter).padStart(5, "0")}`;
      }

      const bill = await storage.createBill({
        tenantId: user.tenantId,
        outletId: user.outletId || null,
        billNumber: "",
        orderId,
        tableId: tableId || null,
        customerId: customerId || null,
        waiterId: user.id,
        waiterName: user.name || user.username,
        subtotal: String(subtotal ?? 0),
        discountAmount: String(discountAmount ?? 0),
        discountReason: discountReason || null,
        serviceCharge: String(serviceCharge ?? 0),
        taxAmount: String(taxAmount ?? 0),
        taxBreakdown: resolvedTaxBreakdown,
        tips: String(tips ?? 0),
        totalAmount: String(totalAmount),
        paymentStatus: "pending",
        posSessionId: posSessionId || null,
        covers: covers || 1,
        invoiceNumber,
        customerGstin: (isGST && customerGstin) ? customerGstin : null,
        cgstAmount,
        sgstAmount,
      });
      res.status(201).json({ ...bill, amountInWords: numWords(Number(bill.totalAmount)) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/restaurant-bills/:id/payments", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (bill.paymentStatus === "voided") return res.status(400).json({ message: "Bill is voided" });

      const { payments, tips } = req.body as {
        payments: { paymentMethod: string; amount: number; referenceNo?: string }[];
        tips?: number;
      };
      if (!payments || !payments.length) return res.status(400).json({ message: "payments array required" });

      const loyaltyCustomerId = req.body.loyaltyCustomerId as string | undefined;
      const loyaltyPointsRedeemed = Number(req.body.loyaltyPointsRedeemed ?? 0);

      const loyaltyRows = payments.filter(p => p.paymentMethod === "LOYALTY");
      if (loyaltyRows.length > 0) {
        if (!loyaltyCustomerId) {
          return res.status(400).json({ message: "A customer must be linked to use a Loyalty payment" });
        }
        const totalLoyaltyTender = loyaltyRows.reduce((s, p) => s + Number(p.amount), 0);
        const requiredPoints = Math.ceil(totalLoyaltyTender / 0.01);
        const loyaltyCustomer = await storage.getCustomerByTenant(loyaltyCustomerId, user.tenantId);
        if (!loyaltyCustomer) {
          return res.status(404).json({ message: "Loyalty customer not found" });
        }
        if ((loyaltyCustomer.loyaltyPoints ?? 0) < requiredPoints) {
          return res.status(400).json({
            message: `Insufficient loyalty points — need ${requiredPoints} pts, customer has ${loyaltyCustomer.loyaltyPoints ?? 0} pts`,
          });
        }
      }

      const createdPayments = [];
      for (const p of payments) {
        const payment = await storage.createBillPayment({
          tenantId: user.tenantId,
          billId: bill.id,
          paymentMethod: p.paymentMethod,
          amount: String(p.amount),
          referenceNo: p.referenceNo || null,
          collectedBy: user.id,
          isRefund: false,
        });
        createdPayments.push(payment);
      }

      const allPayments = await storage.getBillPayments(bill.id);
      const paidTotal = allPayments.filter(p => !p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
      const billTotal = Number(bill.totalAmount) + (tips ? Number(tips) : 0);
      const newStatus = paidTotal >= billTotal - 0.01 ? "paid" : "partially_paid";

      const updatedBill = await storage.updateBill(bill.id, user.tenantId, {
        paymentStatus: newStatus,
        tips: tips ? String(Number(bill.tips) + tips) : bill.tips,
        ...(newStatus === "paid" ? { paidAt: new Date() } : {}),
        ...(!bill.customerId && loyaltyCustomerId ? { customerId: loyaltyCustomerId } : {}),
      });

      if (newStatus === "paid") {
        await storage.updateOrder(bill.orderId, { status: "completed", paymentMethod: payments[0]?.paymentMethod?.toLowerCase() || "cash" });
        if (bill.tableId) {
          try { await storage.updateTable(bill.tableId, { status: "free" }); } catch (_) {}
        }
        const effectiveLoyaltyCustomerId = loyaltyCustomerId || bill.customerId;
        if (effectiveLoyaltyCustomerId) {
          try {
            const customer = await storage.getCustomerByTenant(effectiveLoyaltyCustomerId, user.tenantId);
            if (customer) {
              const pointsEarned = Math.floor(billTotal / 10);
              const serverLoyaltyPointsDeducted = loyaltyRows.length > 0
                ? Math.ceil(loyaltyRows.reduce((s, p) => s + Number(p.amount), 0) / 0.01)
                : loyaltyPointsRedeemed;
              const netChange = pointsEarned - serverLoyaltyPointsDeducted;
              const newBalance = Math.max(0, (customer.loyaltyPoints ?? 0) + netChange);
              if (netChange !== 0) {
                await storage.updateCustomerByTenant(effectiveLoyaltyCustomerId, user.tenantId, {
                  loyaltyPoints: newBalance,
                });
              }
            }
          } catch (_) {}
        }
        emitToTenant(user.tenantId, "order:completed", { orderId: bill.orderId, status: "completed", tableId: bill.tableId });
      }

      res.json({ bill: updatedBill, payments: createdPayments });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/restaurant-bills/:id/void", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (bill.paymentStatus === "voided") return res.status(400).json({ message: "Bill is already voided" });
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ message: "Void reason is required" });

      const existingMovements = await storage.getStockMovementsByOrder(bill.orderId);
      const consumptionMovements = existingMovements.filter(m => m.type === "RECIPE_CONSUMPTION");
      for (const mv of consumptionMovements) {
        const item = await storage.getInventoryItem(mv.itemId);
        if (!item) continue;
        const stockBefore = Number(item.currentStock ?? 0);
        const reversalQty = Math.abs(Number(mv.quantity));
        const stockAfter = stockBefore + reversalQty;
        await storage.updateInventoryItem(mv.itemId, {
          currentStock: String(stockAfter),
        });
        await storage.createStockMovement({
          tenantId: user.tenantId,
          itemId: mv.itemId,
          type: "RECIPE_REVERSAL",
          quantity: String(reversalQty),
          reason: `Void bill ${bill.billNumber}: ${reason}`,
          orderId: bill.orderId,
          orderNumber: mv.orderNumber,
          menuItemId: mv.menuItemId,
          chefId: mv.chefId,
          chefName: mv.chefName,
          station: mv.station,
          shiftId: mv.shiftId,
          stockBefore: String(stockBefore),
          stockAfter: String(stockAfter),
        });
      }

      const updated = await storage.updateBill(bill.id, user.tenantId, {
        paymentStatus: "voided",
        voidReason: reason,
        voidedAt: new Date(),
        voidedBy: user.id,
      });

      await storage.updateOrder(bill.orderId, { status: "voided" });
      if (bill.tableId) {
        try { await storage.updateTable(bill.tableId, { status: "free" }); } catch (_) {}
      }
      if (bill.customerId && bill.paymentStatus === "paid") {
        try {
          const customer = await storage.getCustomerByTenant(bill.customerId, user.tenantId);
          if (customer) {
            const pointsToReverse = Math.floor(Number(bill.totalAmount) / 10);
            if (pointsToReverse > 0) {
              await storage.updateCustomerByTenant(bill.customerId, user.tenantId, {
                loyaltyPoints: Math.max(0, (customer.loyaltyPoints ?? 0) - pointsToReverse),
              });
            }
          }
        } catch (_) {}
      }
      emitToTenant(user.tenantId, "order:updated", { orderId: bill.orderId, status: "voided" });
      res.json({ ...updated, reversalsCreated: consumptionMovements.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/restaurant-bills/:id/refund", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (bill.paymentStatus !== "paid") return res.status(400).json({ message: "Bill is not paid" });
      const { amount, reason, paymentMethod } = req.body;
      if (!amount || !reason) return res.status(400).json({ message: "amount and reason required" });

      const allPayments = await storage.getBillPayments(bill.id);
      const totalPaid = allPayments.filter(p => !p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
      const totalRefunded = allPayments.filter(p => p.isRefund).reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
      const netPaid = totalPaid - totalRefunded;
      if (Number(amount) > netPaid + 0.01) {
        return res.status(400).json({ message: `Refund amount (${Number(amount).toFixed(2)}) exceeds net paid balance (${netPaid.toFixed(2)})` });
      }

      const refund = await storage.createBillPayment({
        tenantId: user.tenantId,
        billId: bill.id,
        paymentMethod: paymentMethod || "CASH",
        amount: String(-Math.abs(Number(amount))),
        isRefund: true,
        refundReason: reason,
        collectedBy: user.id,
      });

      const customerId = bill.customerId;
      if (customerId) {
        try {
          const customer = await storage.getCustomerByTenant(customerId, user.tenantId);
          if (customer) {
            const refundFraction = Math.min(1, Number(amount) / Math.max(netPaid, 0.01));
            const loyaltyPayments = allPayments.filter(p => !p.isRefund && p.paymentMethod === "LOYALTY");
            const loyaltyPaid = loyaltyPayments.reduce((s, p) => s + Number(p.amount), 0);
            const pointsToRestore = Math.floor(loyaltyPaid * 100 * refundFraction);
            const earnedPoints = Math.floor(Number(bill.totalAmount) / 10);
            const pointsToDeduct = Math.floor(earnedPoints * refundFraction);
            const netChange = pointsToRestore - pointsToDeduct;
            if (netChange !== 0) {
              await storage.updateCustomerByTenant(customerId, user.tenantId, {
                loyaltyPoints: Math.max(0, (customer.loyaltyPoints ?? 0) + netChange),
              });
            }
          }
        } catch (_) {}
      }

      res.json(refund);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/session", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const session = await storage.getActivePosSession(user.tenantId, user.id);
      res.json(session || null);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pos/session/open", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getActivePosSession(user.tenantId, user.id);
      if (existing) return res.json(existing);
      const { openingFloat, shiftName } = req.body;
      const now = new Date();
      const hour = now.getHours();
      const autoShift = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Night";
      const session = await storage.createPosSession({
        tenantId: user.tenantId,
        outletId: user.outletId || null,
        waiterId: user.id,
        waiterName: user.name || user.username,
        shiftName: shiftName || autoShift,
        openingFloat: String(openingFloat ?? 0),
        status: "open",
      });
      res.status(201).json(session);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pos/session/close", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { sessionId, closingCashCount, notes, supervisorOverride } = req.body;
      const isManagerOrOwner = user.role === "owner" || user.role === "manager";
      if (!isManagerOrOwner) {
        const result = await verifySupervisorOverride(supervisorOverride, user.tenantId, "close_shift", req);
        if (!result.verified) return res.status(403).json({ message: result.error || "Manager approval required to close shift" });
      }
      let session;
      if (sessionId) {
        session = await storage.getPosSession(sessionId);
        if (!session || session.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      } else {
        session = await storage.getActivePosSession(user.tenantId, user.id);
      }
      if (!session) return res.status(404).json({ message: "No active session" });
      if (session.status === "closed") return res.status(400).json({ message: "Session already closed" });
      const report = await storage.getPosSessionReport(session.id);
      await storage.updatePosSession(session.id, user.tenantId, {
        totalOrders: report.billCount,
        totalRevenue: String(report.totalRevenue),
        revenueByMethod: report.revenueByMethod,
      });
      const updated = await storage.closePosSession(session.id, user.tenantId, {
        closingCashCount: closingCashCount != null ? closingCashCount : undefined,
        closedBy: user.id,
        notes: notes || undefined,
      });
      res.json({ session: updated, report });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/session/report", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        const active = await storage.getActivePosSession(user.tenantId, user.id);
        if (!active) return res.status(404).json({ message: "No active session" });
        const report = await storage.getPosSessionReport(active.id);
        return res.json(report);
      }
      const session = await storage.getPosSession(sessionId);
      if (!session || session.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const report = await storage.getPosSessionReport(sessionId);
      res.json(report);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/restaurant-bills/:id/payment-request", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (bill.paymentStatus === "paid") return res.status(400).json({ message: "Bill already paid" });

      const tenant = await storage.getTenant(user.tenantId);
      if (!tenant?.razorpayEnabled) return res.status(400).json({ message: "Razorpay gateway not enabled for this account" });

      const { method, tips } = req.body;
      const tipVal = parseFloat(tips) || 0;

      if (tipVal > 0) {
        await storage.updateBill(bill.id, user.tenantId, { tips: tipVal.toFixed(2) });
      }

      // Always derive amount from server-side bill totals — never trust client-supplied amount
      const serverAmount = Number(bill.totalAmount) + tipVal;

      if (bill.razorpayOrderId) {
        try {
          const existing = await getPaymentLink(bill.razorpayOrderId, tenant.razorpayKeyId);
          if (existing.status !== "cancelled" && existing.status !== "expired") {
            return res.json({ paymentLinkId: existing.id, shortUrl: existing.short_url, status: existing.status });
          }
        } catch (_) {}
      }

      const link = await createPaymentLink({
        amountRupees: serverAmount,
        currency: tenant.currency || "INR",
        description: `Payment for Bill ${bill.billNumber}`,
        billId: bill.id,
        tenantKeyId: tenant.razorpayKeyId,
      });

      await storage.updateBill(bill.id, user.tenantId, { razorpayOrderId: link.id });

      return res.json({ paymentLinkId: link.id, shortUrl: link.short_url, status: link.status });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/restaurant-bills/:id/payment-status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });

      if (bill.paymentStatus === "paid") return res.json({ status: "paid" });

      if (!bill.razorpayOrderId) return res.json({ status: "pending" });

      const tenant = await storage.getTenant(user.tenantId);
      const link = await getPaymentLink(bill.razorpayOrderId, tenant?.razorpayKeyId);

      if (link.status === "paid") {
        const paymentId = link.payments?.[0]?.payment_id ?? null;
        const method = (req.query.method as string) || "UPI";
        await storage.updateBill(bill.id, user.tenantId, { paymentStatus: "paid", paidAt: new Date() });
        await storage.createBillPayment({
          tenantId: bill.tenantId,
          billId: bill.id,
          paymentMethod: method,
          amount: link.amount ? String(link.amount / 100) : bill.totalAmount,
          referenceNo: paymentId || link.id,
          collectedBy: user.id,
          razorpayPaymentId: paymentId,
        });
        // Run same completion side-effects as the standard payment flow
        await storage.updateOrder(bill.orderId, { status: "completed", paymentMethod: method.toLowerCase() });
        if (bill.tableId) {
          try { await storage.updateTable(bill.tableId, { status: "free" }); } catch (_) {}
        }
        emitToTenant(bill.tenantId, "order:completed", { orderId: bill.orderId, status: "completed", tableId: bill.tableId });
        return res.json({ status: "paid", paymentId });
      }

      return res.json({ status: link.status === "cancelled" || link.status === "expired" ? "cancelled" : "pending" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
