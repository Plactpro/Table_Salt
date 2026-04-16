import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, requireFreshSession } from "../auth";
import { emitToTenant } from "../realtime";
import { verifySupervisorOverride } from "./_shared";
import { db, pool } from "../db";
import { sql, eq } from "drizzle-orm";
import { tenants as tenantsTable, type InsertCustomer } from "@shared/schema";
import { createPaymentLink, getPaymentLink, refundRazorpayPayment, GatewayDownError } from "../razorpay";
import { routeAndPrint } from "../services/printer-service";
import { logCashDrawerEvent } from "./cash-drawer-log";
import { recordAndDistributeTip } from "../services/tip-service";
import { calculatePackingCharge } from "../services/packing-charge-service";
import { applyParkingChargeToBill } from "../services/parking-charge-service";
import { returnResourcesFromTable } from "../services/resource-service";
import { recalculateBillTotals } from "../lib/bill-recalc";
import { sendEmail } from "../services/email-service";
import { auditLog as auditLogImport } from "../audit";
import { emailBase } from "../templates/email-base";

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

/**
 * Shared helper: run all side effects when a bill is fully paid via the Razorpay gateway.
 * Called from both the polling status route AND the webhook handler to ensure consistent
 * behavior (loyalty accrual, order completion, table release, realtime event).
 */
export async function finalizeBillCompletion(opts: {
  bill: { id: string; tenantId: string; orderId: string; tableId: string | null; customerId: string | null; totalAmount: string; tips: string | null };
  paymentMethod: string;
  paymentId: string | null;
  linkId: string;
  amountStr: string;
  collectedById?: string;
}): Promise<void> {
  const { bill: billInit, paymentMethod, paymentId, linkId, amountStr, collectedById } = opts;
  let bill = billInit;

  // 1. Mark bill as paid
  await storage.updateBill(bill.id, bill.tenantId, { paymentStatus: "paid", paidAt: new Date() });

  // 2. Record payment row
  await storage.createBillPayment({
    tenantId: bill.tenantId,
    billId: bill.id,
    paymentMethod,
    amount: amountStr,
    referenceNo: paymentId || linkId,
    ...(collectedById ? { collectedBy: collectedById } : {}),
    razorpayPaymentId: paymentId,
  });

  // 3. Complete the order
  await storage.updateOrder(bill.orderId, bill.tenantId, { status: "completed", paymentMethod: paymentMethod.toLowerCase() });

  // 4. Free the table and return any special resources
  if (bill.tableId) {
    try { await storage.updateTable(bill.tableId, bill.tenantId, { status: "free" }); } catch (_) {}
    returnResourcesFromTable(bill.tableId, bill.tenantId, false).catch(() => {});
  }

  // 5. Loyalty points accrual + CRM visit update for linked customer
  if (bill.customerId) {
    try {
      const customer = await storage.getCustomerByTenant(bill.customerId, bill.tenantId);
      if (customer) {
        const billTotal = Number(bill.totalAmount) + Number(bill.tips || 0);
        const pointsEarned = Math.floor(billTotal / 10);
        const newTotalSpent = (Number(customer.totalSpent ?? "0") + billTotal).toFixed(2);
        const newVisitCount = (customer.visitCount ?? 0) + 1;
        const crmUpdate: Partial<InsertCustomer> = {
          totalSpent: newTotalSpent,
          visitCount: newVisitCount,
          lastVisitAt: new Date(),
        };
        if (pointsEarned > 0) crmUpdate.loyaltyPoints = (customer.loyaltyPoints ?? 0) + pointsEarned;
        await storage.updateCustomerByTenant(bill.customerId, bill.tenantId, crmUpdate);
      }
    } catch (_) {}
  }

  // 6. Parking charge — auto-append if a valet ticket is linked and not yet charged
  try {
    const { rows: valetRows } = await pool.query(
      `SELECT id FROM valet_tickets WHERE bill_id=$1 AND tenant_id=$2 AND charge_added_to_bill=false LIMIT 1`,
      [bill.id, bill.tenantId]
    );
      if (valetRows[0]) {
        try {
          await applyParkingChargeToBill(bill.id, valetRows[0].id, bill.tenantId);
          // Re-read bill to get updated totalAmount including parking
          const updatedBill = await storage.getBill(bill.id, bill.tenantId);
          if (updatedBill) bill = updatedBill;
        } catch (e) {
          console.error("[billing] Parking charge auto-apply failed:", e);
        }
      }
  } catch (_) {}

  // 7. Realtime notification
  emitToTenant(bill.tenantId, "order:completed", { orderId: bill.orderId, status: "completed", tableId: bill.tableId });
}

export function registerRestaurantBillingRoutes(app: Express): void {

  // O8: Public receipt endpoint — no auth required so customers can view via QR code
  app.get("/api/public/receipt/:id", async (req, res) => {
    try {
      const bill = await storage.getBillUnchecked(req.params.id);
      if (!bill) return res.status(404).json({ message: "Receipt not found" });
      // Fetch tenant name for display
      const tenantRow = await db.select({ name: tenantsTable.name, currency: tenantsTable.currency })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, bill.tenantId))
        .limit(1);
      const tenant = tenantRow[0] ?? null;
      const allPayments = await storage.getBillPayments(bill.id);
      const order = bill.orderId ? await storage.getOrder(bill.orderId, bill.tenantId) : null;
      const items = order ? await storage.getOrderItemsByOrder(order.id, bill.tenantId) : [];
      res.json({
        id: bill.id,
        billNumber: bill.billNumber,
        invoiceNumber: bill.invoiceNumber,
        totalAmount: bill.totalAmount,
        paymentStatus: bill.paymentStatus,
        paidAt: bill.paidAt,
        createdAt: bill.createdAt,
        subtotal: bill.subtotal,
        discountAmount: bill.discountAmount,
        serviceCharge: bill.serviceCharge,
        taxAmount: bill.taxAmount,
        tips: bill.tips,
        orderType: order?.orderType ?? null,
        tableId: order?.tableId ?? null,
        restaurantName: tenant?.name ?? "Restaurant",
        currency: tenant?.currency ?? "USD",
        // Restrict to safe fields only — no internal IDs or metadata exposed publicly
        payments: allPayments.map(p => ({
          paymentMethod: p.paymentMethod,
          amount: p.amount,
          isRefund: p.isRefund ?? false,
        })),
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/restaurant-bills", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
      const offset = parseInt(req.query.offset as string) || 0;
      const bills = await storage.getBillsByTenant(user.tenantId, { limit, offset, status });
      res.json(bills);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/restaurant-bills/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id, user.tenantId);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const payments = await storage.getBillPayments(bill.id);
      const order = bill.orderId ? await storage.getOrder(bill.orderId, user.tenantId) : undefined;
      const items = order ? await storage.getOrderItemsByOrder(order.id, user.tenantId) : [];
      res.json({ ...bill, payments, order, items, amountInWords: numWords(Number(bill.totalAmount)) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/restaurant-bills/by-order/:orderId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBillByOrder(req.params.orderId, user.tenantId);
      if (!bill) return res.status(404).json({ message: "No bill for this order" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const payments = await storage.getBillPayments(bill.id);
      const order = bill.orderId ? await storage.getOrder(bill.orderId, user.tenantId) : undefined;
      const items = order ? await storage.getOrderItemsByOrder(order.id, user.tenantId) : [];
      res.json({ ...bill, payments, order, items, amountInWords: numWords(Number(bill.totalAmount)) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/restaurant-bills", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { orderId, tableId, customerId, discountReason,
        tips, covers, posSessionId } = req.body;
      if (!orderId) return res.status(400).json({ message: "orderId is required" });
      const referencedOrder = await storage.getOrder(orderId, user.tenantId);
      if (!referencedOrder) return res.status(404).json({ message: "Order not found" });
      const existing = await storage.getBillByOrder(orderId, user.tenantId);
      if (existing) return res.json({ ...existing, alreadyExists: true });

      // F-121 fix: Fetch order items and recompute all monetary values server-side.
      // Client-submitted subtotal, tax, discount, serviceCharge, and totalAmount are IGNORED.
      const orderItems = await storage.getOrderItemsByOrder(orderId);
      if (orderItems.length === 0) {
        return res.status(400).json({ message: "Cannot create bill for order with no items" });
      }
      for (const oi of orderItems) {
        if (Number(oi.quantity) <= 0) {
          return res.status(400).json({ message: `Invalid quantity for item "${oi.name}"` });
        }
      }

      // Packing charge: only applies to takeaway/delivery, never dine_in
      const orderType = referencedOrder.orderType;
      let packingChargeAmount = 0;
      let packingChargeLabelStr = 'Packing Charge';
      let packingChargeTaxAmount = 0;
      let packingChargeType = 'FIXED_PER_ORDER';
      let packingBreakdown: Array<{ item: string; qty: number; rate: number; amount: number; category?: string }> = [];
      let packingItemCount: number | null = null;

      if (orderType === 'takeaway' || orderType === 'delivery') {
        // Accept pre-calculated from frontend; otherwise calculate server-side
        const frontendPackingCharge = Number(req.body.packingCharge ?? 0);
        if (frontendPackingCharge > 0) {
          packingChargeAmount = frontendPackingCharge;
          packingChargeLabelStr = req.body.packingChargeLabel || 'Packing Charge';
          packingChargeTaxAmount = Number(req.body.packingChargeTax ?? 0);
        } else {
          try {
            const outletId = user.outletId || referencedOrder.outletId;
            if (outletId) {
              // Join order_items with menu_items to get categoryId for PER_CATEGORY and exemption logic
              const { rows: enrichedItems } = await pool.query(`
                SELECT oi.id, oi.menu_item_id, oi.name, oi.quantity, oi.price,
                       mi.category_id
                FROM order_items oi
                LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
                WHERE oi.order_id = $1
              `, [orderId]);
              const itemsForCalc: Array<{ id: string; menuItemId?: string; name: string; quantity: number; price: number; categoryId?: string }> = enrichedItems.map((i: any) => ({
                id: i.id,
                menuItemId: i.menu_item_id || undefined,
                name: i.name,
                quantity: Number(i.quantity),
                price: Number(i.price),
                categoryId: i.category_id || undefined,
              }));
              const packingResult = await calculatePackingCharge(outletId, user.tenantId, orderType, itemsForCalc);
              if (packingResult.applicable) {
                packingChargeAmount = packingResult.chargeAmount;
                packingChargeLabelStr = packingResult.label;
                packingChargeTaxAmount = packingResult.taxAmount;
                packingChargeType = packingResult.chargeType;
                packingBreakdown = packingResult.breakdown;
                packingItemCount = itemsForCalc.reduce((s, i) => s + i.quantity, 0);
              }
            }
          } catch (e) { /* silent — never blocks bill creation */ }
        }
      }
      // Dine-in: packing charge is always zero regardless of client payload
      // (already enforced by the orderType gate above)

      const tenant = await storage.getTenant(user.tenantId);
      const { customerGstin } = req.body;

      // F-121 fix: Server-side recalculation of all monetary values from order items.
      // Client-submitted subtotal/tax/discount/serviceCharge/totalAmount are IGNORED.
      // Uses the order's stored discount (server-calculated at order creation time).
      const orderDiscount = Number(referencedOrder.discount || referencedOrder.discountAmount || 0);
      const recalc = recalculateBillTotals(
        orderItems,
        orderDiscount,
        {
          taxRate: tenant?.taxRate || "0",
          taxType: tenant?.taxType || null,
          compoundTax: tenant?.compoundTax ?? false,
          serviceCharge: tenant?.serviceCharge || "0",
          currency: tenant?.currency || null,
          cgstRate: tenant?.cgstRate,
          sgstRate: tenant?.sgstRate,
        },
        packingChargeAmount,
        packingChargeTaxAmount,
        req.body.totalAmount != null ? Number(req.body.totalAmount) : undefined,
      );

      // Log tampering signal if client-submitted total diverges from server calculation
      if (recalc.discrepancy !== null && recalc.discrepancy > 0.02) {
        console.warn(`[BILL_TAMPERING] orderId=${orderId} tenant=${user.tenantId} clientTotal=${req.body.totalAmount} serverTotal=${recalc.totalWithPacking} discrepancy=${recalc.discrepancy}`);
      }

      // GST invoice number (only for Indian GST tenants)
      let invoiceNumber: string | null = null;
      if (recalc.isGST) {
        const prefix = tenant?.invoicePrefix || "INV";
        const fy = getFiscalYear(new Date());
        const [updated] = await db.update(tenantsTable)
          .set({ invoiceCounter: sql`COALESCE(${tenantsTable.invoiceCounter}, 0) + 1` })
          .where(eq(tenantsTable.id, user.tenantId))
          .returning({ counter: tenantsTable.invoiceCounter });
        const counter = updated?.counter ?? 1;
        invoiceNumber = `${prefix}/${fy}/${String(counter).padStart(5, "0")}`;
      }

      let bill = await storage.createBill({
        tenantId: user.tenantId,
        outletId: user.outletId || null,
        billNumber: "",
        orderId,
        tableId: tableId || null,
        customerId: customerId || null,
        waiterId: user.id,
        waiterName: user.name || user.username,
        subtotal: recalc.subtotal.toFixed(2),
        discountAmount: recalc.discount.toFixed(2),
        discountReason: discountReason || null,
        serviceCharge: recalc.serviceCharge.toFixed(2),
        taxAmount: recalc.tax.toFixed(2),
        taxBreakdown: recalc.taxBreakdown,
        tips: String(tips ?? 0),
        totalAmount: recalc.totalWithPacking.toFixed(2),
        paymentStatus: "pending",
        posSessionId: posSessionId || null,
        covers: covers || 1,
        invoiceNumber,
        customerGstin: (recalc.isGST && customerGstin) ? customerGstin : null,
        cgstAmount: recalc.cgstAmount !== null ? recalc.cgstAmount.toFixed(2) : null,
        sgstAmount: recalc.sgstAmount !== null ? recalc.sgstAmount.toFixed(2) : null,
        packingCharge: packingChargeAmount > 0 ? packingChargeAmount.toFixed(2) : "0",
        packingChargeLabel: packingChargeLabelStr,
        packingChargeTax: packingChargeTaxAmount > 0 ? packingChargeTaxAmount.toFixed(2) : "0",
      });

      // Fire-and-forget: log packing charge audit record with full metadata
      if (packingChargeAmount > 0) {
        (async () => {
          try {
            const outletId = user.outletId || referencedOrder.outletId;
            if (outletId) {
              await pool.query(`
                INSERT INTO bill_packing_charges (
                  tenant_id, outlet_id, bill_id, order_id, order_type, charge_type,
                  charge_amount, tax_amount, total_amount, item_count, breakdown
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                ON CONFLICT DO NOTHING
              `, [
                user.tenantId, outletId, bill.id, orderId,
                orderType, packingChargeType,
                packingChargeAmount.toFixed(2),
                packingChargeTaxAmount.toFixed(2),
                (packingChargeAmount + packingChargeTaxAmount).toFixed(2),
                packingItemCount,
                packingBreakdown.length > 0 ? JSON.stringify(packingBreakdown) : null,
              ]);
            }
          } catch (e) { /* silent */ }
        })();
      }

      res.status(201).json({ ...bill, amountInWords: numWords(Number(bill.totalAmount)) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/restaurant-bills/:id/payments", requireAuth, requireFreshSession, async (req, res) => {
    // PR-001: Declare idempotency tracking variables outside try so finally can clean up on ALL
    // failure paths (both exceptions AND early 4xx returns after the key was claimed).
    const paymentIdemKey = req.headers["x-idempotency-key"] as string | undefined;
    let idemClaimed = false;
    let idemResponseStored = false;
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id, user.tenantId);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (bill.paymentStatus === "voided") return res.status(400).json({ message: "Bill is voided" });

      const { payments, tips, tipType, tipPercentage } = req.body as {
        payments: { paymentMethod: string; amount: number; referenceNo?: string }[];
        tips?: number;
        tipType?: string;
        tipPercentage?: number;
      };
      if (!payments || !payments.length) return res.status(400).json({ message: "payments array required" });

      // PR-001: Idempotency — prevent duplicate payment submissions (e.g. double-tap on Pay button)
      if (paymentIdemKey) {
        // Atomic INSERT: only the first caller gets a RETURNING row; concurrent callers get nothing
        const { rows: claimRows } = await pool.query(
          `INSERT INTO idempotency_keys (key, tenant_id, endpoint, response_code)
           VALUES ($1, $2, 'POST /api/payments', 200)
           ON CONFLICT (key, tenant_id) DO NOTHING
           RETURNING key`,
          [paymentIdemKey, user.tenantId]
        );
        const wonRace = claimRows.length > 0;
        if (!wonRace) {
          // We lost the race — wait briefly then return the winner's stored response
          await new Promise(r => setTimeout(r, 300));
          const { rows: replayRows } = await pool.query(
            `SELECT response_body FROM idempotency_keys WHERE key = $1 AND tenant_id = $2 AND endpoint = 'POST /api/payments' AND created_at > NOW() - INTERVAL '60 seconds'`,
            [paymentIdemKey, user.tenantId]
          );
          if (replayRows[0]?.response_body) {
            return res.json(replayRows[0].response_body);
          }
          // Winner still processing — return 409 so client can retry
          return res.status(409).json({ code: "IDEMPOTENCY_CONFLICT", message: "Duplicate payment request in progress. Please retry in a moment." });
        }
        idemClaimed = true; // won the race; finally block will clean up if we fail to store response
      }

      // PR-001: Payment field validation — re-query live bill and validate all submitted amounts
      const { auditLog: auditLogFn } = await import("../audit");
      const liveBillTotal = Number(bill.totalAmount);
      const clientTips = Number(tips ?? 0);
      if (clientTips < 0) {
        auditLogFn({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "payment_validation_failed", entityType: "bill", entityId: bill.id, metadata: { reason: "negative_tip", tip: clientTips }, req }).catch(() => {});
        return res.status(400).json({ message: "Tip amount cannot be negative" });
      }
      const clientDiscount = Number(req.body.discountAmount ?? bill.discountAmount ?? 0);
      const clientSubtotal = Number(bill.subtotal ?? 0);
      if (clientDiscount > clientSubtotal + 0.01) {
        auditLogFn({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "payment_validation_failed", entityType: "bill", entityId: bill.id, metadata: { reason: "discount_exceeds_subtotal", discountAmount: clientDiscount, subtotal: clientSubtotal }, req }).catch(() => {});
        return res.status(400).json({ message: `Discount amount (${clientDiscount.toFixed(2)}) exceeds bill subtotal (${clientSubtotal.toFixed(2)})` });
      }
      const paymentSum = payments.reduce((s, p) => s + Number(p.amount), 0);
      // Validate that submitted payment total covers the live bill total (single and split)
      if (Math.abs(paymentSum - liveBillTotal) > 1.01) {
        auditLogFn({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "payment_validation_failed", entityType: "bill", entityId: bill.id, metadata: { reason: "payment_sum_mismatch", paymentSum, billTotal: liveBillTotal }, req }).catch(() => {});
        return res.status(400).json({ message: `Payment total (${paymentSum.toFixed(2)}) does not match bill total (${liveBillTotal.toFixed(2)})` });
      }

      // PR-001: Tax-rate sanity check — verify stored taxAmount is consistent with outlet-configured rate
      // This guards against tampered bills where the tax was manually reduced after creation
      const billTaxAmount = Number(bill.taxAmount ?? 0);
      const billSubtotal = Number(bill.subtotal ?? 0);
      if (billSubtotal > 0.01 && billTaxAmount > 0) {
        const tenant = await storage.getTenant(user.tenantId);
        let configuredTaxRate = Number(tenant?.taxRate ?? 0);
        if (bill.outletId) {
          try {
            const outletResult = await pool.query(
              `SELECT outlet_tax_rate FROM outlets WHERE id = $1 AND tenant_id = $2`,
              [bill.outletId, bill.tenantId]
            );
            if (outletResult.rows[0]?.outlet_tax_rate != null) {
              configuredTaxRate = Number(outletResult.rows[0].outlet_tax_rate);
            }
          } catch (_) {}
        }
        if (configuredTaxRate > 0) {
          // Account for compound tax: if enabled, service charge is added to tax base
        const serviceChargePct = Number(tenant?.serviceCharge ?? 0) / 100;
        const serviceChargeAmt = billSubtotal * serviceChargePct;
        const isCompoundTax = tenant?.compoundTax === true || tenant?.compoundTax === "true";
        const discountAmt = Number(bill.discountAmount ?? 0);
        const taxableSubtotal = Math.max(0, billSubtotal - discountAmt);
        const taxBase = isCompoundTax
          ? taxableSubtotal + (taxableSubtotal * serviceChargePct)
          : taxableSubtotal;
        const expectedTax = Math.round(taxBase * configuredTaxRate) / 100;
          const taxDeviation = Math.abs(billTaxAmount - expectedTax);
          const toleranceAmt = 2.0; // ±2 currency units to absorb per-line rounding
          if (taxDeviation > toleranceAmt) {
            auditLogFn({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "payment_validation_failed", entityType: "bill", entityId: bill.id, metadata: { reason: "tax_rate_mismatch", storedTax: billTaxAmount, expectedTax, configuredTaxRate, subtotal: billSubtotal }, req }).catch(() => {});
            return res.status(400).json({ message: `Bill tax amount (${billTaxAmount.toFixed(2)}) does not match expected tax at configured rate ${configuredTaxRate}% (expected ~${expectedTax.toFixed(2)})` });
          }
        }
      }

      // PR-001: Strict field-integrity check — if client submits bill-level fields, they must
      // match the live bill exactly (within ±1 currency unit tolerance). This prevents tampered
      // bill payloads from slipping through even when individual checks passed above.
      const fieldsToCheck: Array<{ field: string; submitted: number | undefined; live: number }> = [
        { field: "totalAmount",   submitted: req.body.totalAmount   !== undefined ? Number(req.body.totalAmount)   : undefined, live: Number(bill.totalAmount ?? 0) },
        { field: "taxAmount",     submitted: req.body.taxAmount     !== undefined ? Number(req.body.taxAmount)     : undefined, live: Number(bill.taxAmount ?? 0) },
        { field: "discountAmount",submitted: req.body.discountAmount !== undefined ? Number(req.body.discountAmount): undefined, live: Number(bill.discountAmount ?? 0) },
        { field: "serviceCharge", submitted: req.body.serviceCharge !== undefined ? Number(req.body.serviceCharge) : undefined, live: Number(bill.serviceCharge ?? 0) },
      ];
      for (const { field, submitted, live } of fieldsToCheck) {
        if (submitted !== undefined && Math.abs(submitted - live) > 1.01) {
          const { auditLog: auditLogFn2 } = await import("../audit");
          auditLogFn2({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "payment_validation_failed", entityType: "bill", entityId: bill.id, metadata: { reason: "field_integrity_mismatch", field, submitted, live }, req }).catch(() => {});
          return res.status(400).json({ message: `Submitted ${field} (${submitted}) does not match bill value (${live.toFixed(2)}). Reload the bill and try again.` });
        }
      }

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

        // PR-004: Fire-and-forget cash session update + drawer open for CASH payments
        if (p.paymentMethod === "CASH") {
          setImmediate(async () => {
            try {
              const { pool: billingPool } = await import("../db");
              const activeSession = await billingPool.query(
                `SELECT id FROM cash_sessions WHERE cashier_id = $1 AND status = 'open' AND tenant_id = $2 LIMIT 1`,
                [user.id, user.tenantId]
              );
              if (activeSession.rows[0]) {
                const sessionId = activeSession.rows[0].id;
                await billingPool.query(
                  `UPDATE cash_sessions
                   SET total_cash_sales = total_cash_sales + $1,
                       total_transactions = total_transactions + 1,
                       expected_closing_cash = opening_float + total_cash_sales + $1 - total_cash_refunds - total_cash_payouts
                   WHERE id = $2`,
                  [Number(p.amount), sessionId]
                );
                await logCashDrawerEvent({
                  tenantId: user.tenantId,
                  cashierId: user.id,
                  cashierName: user.name || user.username,
                  eventType: "SALE",
                  billId: bill.id,
                  amount: Number(p.amount),
                  sessionId,
                });
              }
            } catch (err) {
              console.error("[billing] Cash session update failed:", err);
            }
          });
        }
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
        await storage.updateOrder(bill.orderId, user.tenantId, { status: "completed", paymentMethod: payments[0]?.paymentMethod?.toLowerCase() || "cash" });
        if (bill.tableId) {
          try { await storage.updateTable(bill.tableId, user.tenantId, { status: "free" }); } catch (_) {}
          returnResourcesFromTable(bill.tableId, user.tenantId, false).catch(() => {});
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
              const newTotalSpent = (Number(customer.totalSpent ?? "0") + billTotal).toFixed(2);
              const newVisitCount = (customer.visitCount ?? 0) + 1;
              const crmUpdate: Partial<InsertCustomer> = {
                totalSpent: newTotalSpent,
                visitCount: newVisitCount,
                lastVisitAt: new Date(),
              };
              if (netChange !== 0) crmUpdate.loyaltyPoints = newBalance;
              await storage.updateCustomerByTenant(effectiveLoyaltyCustomerId, user.tenantId, crmUpdate);
            }
          } catch (_) {}
        }
        emitToTenant(user.tenantId, "order:completed", { orderId: bill.orderId, status: "completed", tableId: bill.tableId });

        setImmediate(() => {
          routeAndPrint({
            jobType: "receipt",
            referenceId: bill.id,
            outletId: bill.outletId ?? null,
            tenantId: user.tenantId,
            triggeredByName: user.name || user.username,
          }).catch(err => {
            console.error(`[billing] Auto-print receipt failed for bill ${bill.id}:`, err);
          });
        });
      }

      // Fire-and-forget tip recording — never blocks payment
      if (tips && Number(tips) > 0 && newStatus === "paid") {
        (async () => {
          try {
            const outletId = updatedBill?.outletId || bill.outletId || user.outletId;
            const { rows: [tipSettings] } = await pool.query(
              `SELECT * FROM outlet_tip_settings WHERE outlet_id = $1 AND tenant_id = $2 AND tips_enabled = true LIMIT 1`,
              [outletId, user.tenantId]
            );
            if (tipSettings) {
              const activePaymentMethod = payments[0]?.paymentMethod || "CASH";
              const subtotal = Number(bill.subtotal || 0);
              await recordAndDistributeTip({
                billId: bill.id,
                orderId: bill.orderId,
                tenantId: user.tenantId,
                outletId,
                tipAmount: Number(tips),
                tipType: (tipType as 'PERCENTAGE' | 'CUSTOM') || "CUSTOM",
                tipPercentage: tipPercentage || null,
                tipBasisAmount: subtotal || null,
                waiterId: bill.waiterId || user.id,
                waiterName: bill.waiterName || user.name || user.username,
                paymentMethod: activePaymentMethod,
                settings: tipSettings,
              });
            }
          } catch (e) { /* silent */ }
        })();
      }

      const paymentResult = { bill: updatedBill, payments: createdPayments };
      // PR-001: Mark success BEFORE fire-and-forget so finally cleanup knows not to delete the key
      idemResponseStored = true;
      if (paymentIdemKey && idemClaimed) {
        pool.query(
          `UPDATE idempotency_keys SET response_body = $1 WHERE key = $2 AND tenant_id = $3 AND endpoint = 'POST /api/payments'`,
          [JSON.stringify(paymentResult), paymentIdemKey, user.tenantId]
        ).catch(() => {});
      }
      res.json(paymentResult);
    } catch (err: any) {
      // PR-001: Classify gateway outages — return 503 GATEWAY_DOWN instead of generic 500
      const isGatewayErr = err?.message && (
        /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|network|gateway|razorpay|stripe/i.test(err.message)
        || err?.statusCode === 502 || err?.statusCode === 503
      );
      if (isGatewayErr) {
        const failUser = (req as any).user;
        if (failUser) {
          const { auditLog: auditLogFn } = await import("../audit").catch(() => ({ auditLog: null }));
          if (auditLogFn) {
            auditLogFn({ tenantId: failUser.tenantId, userId: failUser.id, userName: failUser.name, action: "GATEWAY_FAILURE", entityType: "bill", entityId: req.params.id, metadata: { operation: "payment_submission", error: err.message }, req }).catch(() => {});
          }
        }
        // PR-011: Log gateway failures to system_events (not PAYMENT_FAILURE — keeps metrics clean)
        pool.query(
          `INSERT INTO system_events (event_type, name, message, created_at) VALUES ($1, $2, $3, NOW())`,
          ["GATEWAY_FAILURE", "payment-gateway", `Payment gateway failure during payment_submission: ${err.message}`]
        ).catch(() => {});
        return res.status(503).json({ code: "GATEWAY_DOWN", message: "Payment gateway is unreachable. Use manual/cash payment or try again shortly." });
      }
      res.status(500).json({ message: err.message });
    } finally {
      // PR-001: Idempotency lifecycle — delete key on ALL failure paths (exceptions, early 4xx,
      // and gateway-down) so retries are never permanently stuck. Only runs if key was claimed
      // but response_body was never stored (i.e., any non-success terminal state).
      if (paymentIdemKey && idemClaimed && !idemResponseStored) {
        const tenantId = (req as any).user?.tenantId;
        if (tenantId) {
          pool.query(
            `DELETE FROM idempotency_keys WHERE key = $1 AND tenant_id = $2 AND endpoint = 'POST /api/payments' AND response_body IS NULL`,
            [paymentIdemKey, tenantId]
          ).catch(() => {});
        }
      }
    }
  });

  app.put("/api/restaurant-bills/:id/void", requireRole("owner", "manager"), requireFreshSession, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id, user.tenantId);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (bill.paymentStatus === "voided") return res.status(400).json({ message: "Bill is already voided" });
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ message: "Void reason is required" });

      const existingMovements = await storage.getStockMovementsByOrder(bill.orderId);
      const consumptionMovements = existingMovements.filter(m => m.type === "RECIPE_CONSUMPTION");
      for (const mv of consumptionMovements) {
        const item = await storage.getInventoryItem(mv.itemId, user.tenantId);
        if (!item) continue;
        const stockBefore = Number(item.currentStock ?? 0);
        const reversalQty = Math.abs(Number(mv.quantity));
        const stockAfter = stockBefore + reversalQty;
        await storage.updateInventoryItem(mv.itemId, {
          currentStock: String(stockAfter),
        }, user.tenantId);
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

      await storage.updateOrder(bill.orderId, user.tenantId, { status: "voided" });
      if (bill.tableId) {
        try { await storage.updateTable(bill.tableId, user.tenantId, { status: "free" }); } catch (_) {}
        returnResourcesFromTable(bill.tableId, user.tenantId, false).catch(() => {});
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

      // PR-004: Open cash drawer + log VOID event if bill was paid with CASH
      const cashPayments = (await storage.getBillPayments(bill.id)).filter(p => !p.isRefund && p.paymentMethod === "CASH");
      if (cashPayments.length > 0) {
        const totalCash = cashPayments.reduce((s, p) => s + Number(p.amount), 0);
        setImmediate(async () => {
          try {
            const { pool: billingPool } = await import("../db");
            const activeSession = await billingPool.query(
              `SELECT id FROM cash_sessions WHERE cashier_id = $1 AND status = 'open' AND tenant_id = $2 LIMIT 1`,
              [user.id, user.tenantId]
            );
            if (activeSession.rows[0]) {
              await billingPool.query(
                `UPDATE cash_sessions SET total_cash_refunds = total_cash_refunds + $1 WHERE id = $2`,
                [totalCash, activeSession.rows[0].id]
              );
            }
            await logCashDrawerEvent({
              tenantId: user.tenantId,
              cashierId: user.id,
              cashierName: user.name || user.username,
              eventType: "VOID",
              billId: bill.id,
              amount: totalCash,
            });
          } catch (e) {
            console.error("[billing] VOID cash drawer error:", e);
          }
        });
      }

      res.json({ ...updated, reversalsCreated: consumptionMovements.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/restaurant-bills/:id/refund", requireRole("owner", "manager"), requireFreshSession, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id, user.tenantId);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (!["paid", "partially_refunded"].includes(bill.paymentStatus || "")) {
        return res.status(400).json({ message: "Bill is not in a refundable state" });
      }
      const { amount, reason, paymentMethod, refundedItemIds, originalPaymentId } = req.body;
      if (!amount || !reason) return res.status(400).json({ message: "amount and reason required" });
      if (Number(amount) <= 0) return res.status(400).json({ message: "Refund amount must be greater than zero" });

      const allPayments = await storage.getBillPayments(bill.id);
      const totalPaid = allPayments.filter(p => !p.isRefund).reduce((s, p) => s + Number(p.amount), 0);
      const totalRefunded = allPayments.filter(p => p.isRefund).reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
      const netPaid = totalPaid - totalRefunded;
      if (Number(amount) > netPaid + 0.01) {
        return res.status(400).json({ message: `Refund amount (${Number(amount).toFixed(2)}) exceeds net paid balance (${netPaid.toFixed(2)})` });
      }

      // PR-001: Per-payment cap — refund amount must not exceed the referenced original payment record.
      // If client provides originalPaymentId, validate against that specific record.
      // Otherwise fall back to finding any Razorpay payment on the bill.
      let razorpayOriginalPayment = originalPaymentId
        ? allPayments.find(p => p.id === originalPaymentId && !p.isRefund)
        : allPayments.find(p => !p.isRefund && p.razorpayPaymentId);

      if (originalPaymentId && !razorpayOriginalPayment) {
        return res.status(400).json({ message: "Referenced original payment record not found or is already a refund" });
      }

      if (razorpayOriginalPayment) {
        const originalPaymentAmount = Math.abs(Number(razorpayOriginalPayment.amount));
        // PR-001: Scope prior refunds to this specific payment record via originalPaymentId FK.
        // This works for ALL payment methods (Razorpay, cash, UPI, card, etc.) because every
        // refund now stores originalPaymentId pointing to the payment record it reverses.
        const alreadyRefunded = allPayments
          .filter(p => p.isRefund && p.originalPaymentId === razorpayOriginalPayment.id)
          .reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
        const maxRefundable = originalPaymentAmount - alreadyRefunded;
        if (Number(amount) > maxRefundable + 0.01) {
          return res.status(400).json({ message: `Refund amount (${Number(amount).toFixed(2)}) exceeds the original payment amount available for refund (${maxRefundable.toFixed(2)})` });
        }
      }

      // Mandatory Razorpay gateway reversal if original payment used Razorpay
      let razorpayRefundId: string | null = null;
      if (razorpayOriginalPayment?.razorpayPaymentId) {
        const tenant = await storage.getTenant(user.tenantId);
        if (!tenant?.razorpayKeyId || !tenant?.razorpayKeySecret) {
          return res.status(502).json({ message: "Razorpay keys are not configured for this tenant — cannot process gateway reversal" });
        }
        try {
          const amountPaise = Math.round(Number(amount) * 100);
          const rzpRefund = await refundRazorpayPayment(
            razorpayOriginalPayment.razorpayPaymentId,
            amountPaise,
            reason,
            tenant.razorpayKeyId,
            tenant.razorpayKeySecret,
          );
          razorpayRefundId = rzpRefund.id;
        } catch (rzpErr: unknown) {
          if (rzpErr instanceof GatewayDownError) {
            auditLogImport({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "GATEWAY_FAILURE", entityType: "bill", entityId: bill.id, metadata: { operation: "refund", amount: Number(amount), error: rzpErr.message }, req }).catch(() => {});
            return res.status(503).json({ code: "GATEWAY_DOWN", message: rzpErr.message });
          }
          const msg = rzpErr instanceof Error ? rzpErr.message : "Unknown Razorpay error";
          return res.status(502).json({ message: `Razorpay refund failed: ${msg}` });
        }
      }

      const refundMetadata = refundedItemIds && Array.isArray(refundedItemIds) && refundedItemIds.length > 0
        ? { refundedItems: refundedItemIds }
        : undefined;

      const refund = await storage.createBillPayment({
        tenantId: user.tenantId,
        billId: bill.id,
        paymentMethod: paymentMethod || "CASH",
        amount: String(-Math.abs(Number(amount))),
        isRefund: true,
        refundReason: refundMetadata
          ? `${reason} | items:${JSON.stringify(refundedItemIds)}`
          : reason,
        collectedBy: user.id,
        // PR-001: Explicit link to original payment record for per-payment cap scoping.
        // Works for ALL payment methods (Razorpay, cash, UPI, card, etc.).
        ...(razorpayOriginalPayment ? { originalPaymentId: razorpayOriginalPayment.id } : {}),
        ...(razorpayOriginalPayment?.razorpayPaymentId ? { razorpayPaymentId: razorpayOriginalPayment.razorpayPaymentId } : {}),
        ...(razorpayRefundId ? { razorpayRefundId } : {}),
      });

      // Recalculate net balance and update bill status
      const newTotalRefunded = totalRefunded + Number(amount);
      const newPaymentStatus = newTotalRefunded >= totalPaid - 0.01 ? "refunded" : "partially_refunded";
      await storage.updateBill(bill.id, user.tenantId, { paymentStatus: newPaymentStatus });

      // Loyalty adjustments
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

      // PR-004: Open cash drawer + log REFUND event for CASH payment method
      if ((paymentMethod || "CASH") === "CASH") {
        setImmediate(async () => {
          try {
            const { pool: billingPool } = await import("../db");
            const activeSession = await billingPool.query(
              `SELECT id FROM cash_sessions WHERE cashier_id = $1 AND status = 'open' AND tenant_id = $2 LIMIT 1`,
              [user.id, user.tenantId]
            );
            if (activeSession.rows[0]) {
              await billingPool.query(
                `UPDATE cash_sessions SET total_cash_refunds = total_cash_refunds + $1 WHERE id = $2`,
                [Number(amount), activeSession.rows[0].id]
              );
            }
            await logCashDrawerEvent({
              tenantId: user.tenantId,
              cashierId: user.id,
              cashierName: user.name || user.username,
              eventType: "REFUND",
              billId: bill.id,
              amount: -Number(amount),
            });
          } catch (e) {
            console.error("[billing] REFUND cash drawer error:", e);
          }
        });
      }

      res.json({ ...refund, billPaymentStatus: newPaymentStatus, refundPaymentId: refund.id });
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
        session = await storage.getPosSession(sessionId, user.tenantId);
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
      const session = await storage.getPosSession(sessionId, user.tenantId);
      if (!session || session.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      const report = await storage.getPosSessionReport(sessionId);
      res.json(report);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/restaurant-bills/:id/payment-request", requireAuth, requireFreshSession, async (req, res) => {
    // PR-001: Idempotency for payment-request — prevent duplicate payment link creation
    const reqIdemKey = req.headers["x-idempotency-key"] as string | undefined;
    let reqIdemClaimed = false;
    let reqIdemStored = false;
    try {
      const user = req.user as any;
      // Idempotency claim before any processing
      if (reqIdemKey) {
        const { rows: claimRows } = await pool.query(
          `INSERT INTO idempotency_keys (key, tenant_id, endpoint, response_code)
           VALUES ($1, $2, 'POST /api/payment-request', 200)
           ON CONFLICT (key, tenant_id) DO NOTHING
           RETURNING key`,
          [reqIdemKey, user.tenantId]
        );
        if (claimRows.length === 0) {
          const { rows: replayRows } = await pool.query(
            `SELECT response_body FROM idempotency_keys WHERE key = $1 AND tenant_id = $2 AND endpoint = 'POST /api/payment-request' AND created_at > NOW() - INTERVAL '60 seconds'`,
            [reqIdemKey, user.tenantId]
          );
          if (replayRows[0]?.response_body) return res.json(replayRows[0].response_body);
          return res.status(202).json({ code: "PROCESSING", message: "Payment request in progress" });
        }
        reqIdemClaimed = true;
      }
      const bill = await storage.getBill(req.params.id, user.tenantId);
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
          const existing = await getPaymentLink(bill.razorpayOrderId, tenant.razorpayKeyId, tenant.razorpayKeySecret);
          if (existing.status !== "cancelled" && existing.status !== "expired") {
            return res.json({ paymentLinkId: existing.id, shortUrl: existing.short_url, status: existing.status });
          }
        } catch (_) {}
      }

      const link = await createPaymentLink({
        amountRupees: serverAmount,
        currency: tenant.currency || "AED",
        description: `Payment for Bill ${bill.billNumber}`,
        billId: bill.id,
        tenantKeyId: tenant.razorpayKeyId,
        tenantKeySecret: tenant.razorpayKeySecret,
      });

      await storage.updateBill(bill.id, user.tenantId, { razorpayOrderId: link.id });

      const reqResult = { paymentLinkId: link.id, shortUrl: link.short_url, status: link.status };
      reqIdemStored = true;
      if (reqIdemKey && reqIdemClaimed) {
        pool.query(
          `UPDATE idempotency_keys SET response_body = $1 WHERE key = $2 AND tenant_id = $3 AND endpoint = 'POST /api/payment-request'`,
          [JSON.stringify(reqResult), reqIdemKey, user.tenantId]
        ).catch(() => {});
      }
      return res.json(reqResult);
    } catch (err: any) {
      if (err instanceof GatewayDownError) {
        const errUser = req.user as any;
        auditLogImport({ tenantId: errUser?.tenantId, userId: errUser?.id, userName: errUser?.name, action: "GATEWAY_FAILURE", entityType: "bill", entityId: req.params.id, metadata: { operation: "create_payment_link", error: err.message }, req }).catch(() => {});
        // PR-011: Log to system_events as GATEWAY_FAILURE (not PAYMENT_FAILURE)
        pool.query(
          `INSERT INTO system_events (event_type, name, message, created_at) VALUES ($1, $2, $3, NOW())`,
          ["GATEWAY_FAILURE", "payment-gateway", `Payment gateway failure during create_payment_link: ${err.message}`]
        ).catch(() => {});
        return res.status(503).json({ code: "GATEWAY_DOWN", message: err.message });
      }
      res.status(500).json({ message: err.message });
    } finally {
      if (reqIdemKey && reqIdemClaimed && !reqIdemStored) {
        const tenantId = (req as any).user?.tenantId;
        if (tenantId) {
          pool.query(
            `DELETE FROM idempotency_keys WHERE key = $1 AND tenant_id = $2 AND endpoint = 'POST /api/payment-request' AND response_body IS NULL`,
            [reqIdemKey, tenantId]
          ).catch(() => {});
        }
      }
    }
  });

  // PR-001: Manual gateway-pending payment — records a payment with gatewayStatus='gateway_down' when Razorpay is unreachable
  app.post("/api/restaurant-bills/:id/payments/manual-pending", requireRole("owner", "manager", "cashier", "waiter", "supervisor", "outlet_manager"), requireFreshSession, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id, user.tenantId);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });
      if (bill.paymentStatus === "paid") return res.status(400).json({ message: "Bill already paid" });
      const { amount, paymentMethod, referenceNo } = req.body;
      if (!amount || Number(amount) <= 0) return res.status(400).json({ message: "Valid amount required" });
      const liveBillTotal = Number(bill.totalAmount);
      if (Math.abs(Number(amount) - liveBillTotal) > 1.01) {
        return res.status(400).json({ message: `Pending payment amount (${Number(amount).toFixed(2)}) does not match bill total (${liveBillTotal.toFixed(2)})` });
      }
      const payment = await storage.createBillPayment({
        tenantId: user.tenantId,
        billId: bill.id,
        paymentMethod: paymentMethod || "manual_pending",
        amount: String(Number(amount).toFixed(2)),
        collectedBy: user.id,
        referenceNo: referenceNo || undefined,
        gatewayStatus: "gateway_down",
      });
      await storage.updateBill(bill.id, user.tenantId, { paymentStatus: "pending_gateway_reconciliation" });
      auditLogImport({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "GATEWAY_FAILURE", entityType: "bill", entityId: bill.id, metadata: { amount: Number(amount), paymentMethod: paymentMethod || "manual_pending", referenceNo }, req }).catch(() => {});
      res.json({ ...payment, billPaymentStatus: "pending_gateway_reconciliation" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/restaurant-bills/:id/payment-status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const bill = await storage.getBill(req.params.id, user.tenantId);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });

      if (bill.paymentStatus === "paid") return res.json({ status: "paid" });

      if (!bill.razorpayOrderId) return res.json({ status: "pending" });

      const tenant = await storage.getTenant(user.tenantId);
      const link = await getPaymentLink(bill.razorpayOrderId, tenant?.razorpayKeyId, tenant?.razorpayKeySecret);

      if (link.status === "paid") {
        const paymentId = link.payments?.[0]?.payment_id ?? null;
        // Derive method from Razorpay payload — never trust client query param for reconciliation
        const rzpMethod = link.payments?.[0]?.method?.toLowerCase();
        const method = rzpMethod === "card" ? "CARD" : rzpMethod === "upi" ? "UPI" : "RAZORPAY";
        // Idempotency guard: re-fetch bill to check if webhook already finalised it
        const freshBill = await storage.getBill(bill.id, user.tenantId);
        if (freshBill?.paymentStatus === "paid") {
          return res.json({ status: "paid", paymentId });
        }
        await finalizeBillCompletion({
          bill,
          paymentMethod: method,
          paymentId,
          linkId: link.id,
          amountStr: link.amount ? String(link.amount / 100) : bill.totalAmount,
          collectedById: user.id,
        });
        return res.json({ status: "paid", paymentId });
      }

      return res.json({ status: link.status === "cancelled" || link.status === "expired" ? "cancelled" : "pending" });
    } catch (err: any) {
      if (err instanceof GatewayDownError) return res.status(503).json({ code: "GATEWAY_DOWN", message: err.message });
      res.status(500).json({ message: err.message });
    }
  });

  // Email receipt to customer
  app.post("/api/bills/:id/send-email", requireAuth, requireRole("owner", "manager", "waiter"), async (req, res) => {
    try {
      const user = req.user as any;
      const { customerEmail } = req.body;
      if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return res.status(400).json({ message: "Valid customer email is required" });
      }

      const bill = await storage.getBill(req.params.id, user.tenantId);
      if (!bill) return res.status(404).json({ message: "Bill not found" });
      if (bill.tenantId !== user.tenantId) return res.status(403).json({ message: "Forbidden" });

      const payments = await storage.getBillPayments(bill.id);
      const order = bill.orderId ? await storage.getOrder(bill.orderId, user.tenantId) : undefined;
      const items = order ? await storage.getOrderItemsByOrder(order.id, user.tenantId) : [];
      const tenant = await storage.getTenant(user.tenantId);
      const restaurantName = tenant?.name || "Restaurant";
      const currency = tenant?.currency || "USD";

      function fmtAmount(val: string | number | null): string {
        const n = Number(val ?? 0);
        return `${currency} ${n.toFixed(2)}`;
      }

      const billDate = bill.createdAt ? new Date(bill.createdAt as any).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
      const itemRows = items.map((item: any) => `
        <tr>
          <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;">${item.name}</td>
          <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtAmount(item.price)}</td>
          <td style="padding:8px 4px;border-bottom:1px solid #f0f0f0;text-align:right;">${fmtAmount(Number(item.price) * Number(item.quantity))}</td>
        </tr>
      `).join("");

      const paymentMethod = payments[0]?.paymentMethod || order?.paymentMethod || "—";
      const invoiceNumber = (bill as any).invoiceNumber || `#${bill.id.slice(-6).toUpperCase()}`;

      const body = `
        <div style="text-align:center;margin-bottom:24px;">
          <h2 style="margin:0 0 4px;font-size:20px;">${restaurantName}</h2>
          <p style="margin:0;color:#64748b;font-size:13px;">Invoice ${invoiceNumber}</p>
          <p style="margin:0;color:#64748b;font-size:13px;">${billDate}</p>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 4px;text-align:left;color:#64748b;font-weight:600;">Item</th>
              <th style="padding:8px 4px;text-align:center;color:#64748b;font-weight:600;">Qty</th>
              <th style="padding:8px 4px;text-align:right;color:#64748b;font-weight:600;">Price</th>
              <th style="padding:8px 4px;text-align:right;color:#64748b;font-weight:600;">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr>
            <td style="padding:6px 4px;color:#64748b;">Subtotal</td>
            <td style="padding:6px 4px;text-align:right;">${fmtAmount(bill.subtotal)}</td>
          </tr>
          ${Number(bill.discountAmount) > 0 ? `<tr><td style="padding:6px 4px;color:#22c55e;">Discount</td><td style="padding:6px 4px;text-align:right;color:#22c55e;">-${fmtAmount(bill.discountAmount)}</td></tr>` : ""}
          ${Number(bill.taxAmount) > 0 ? `<tr><td style="padding:6px 4px;color:#64748b;">Tax</td><td style="padding:6px 4px;text-align:right;">${fmtAmount(bill.taxAmount)}</td></tr>` : ""}
          ${Number(bill.serviceCharge) > 0 ? `<tr><td style="padding:6px 4px;color:#64748b;">Service Charge</td><td style="padding:6px 4px;text-align:right;">${fmtAmount(bill.serviceCharge)}</td></tr>` : ""}
          ${Number((bill as any).packingCharge) > 0 ? `<tr><td style="padding:6px 4px;color:#64748b;">Packing Charge</td><td style="padding:6px 4px;text-align:right;">${fmtAmount((bill as any).packingCharge)}</td></tr>` : ""}
          <tr style="border-top:2px solid #1e293b;">
            <td style="padding:10px 4px;font-weight:700;font-size:16px;">Total</td>
            <td style="padding:10px 4px;text-align:right;font-weight:700;font-size:16px;">${fmtAmount(bill.totalAmount)}</td>
          </tr>
        </table>

        <div style="background:#f0fdf4;border-radius:6px;padding:12px 16px;text-align:center;margin-bottom:16px;">
          <span style="color:#16a34a;font-weight:600;">Paid</span>
          <span style="color:#64748b;font-size:13px;margin-left:8px;">via ${paymentMethod}</span>
        </div>

        <p style="text-align:center;color:#64748b;font-size:13px;margin:0;">Thank you for dining with us!</p>
      `;

      const html = emailBase({
        title: `Receipt from ${restaurantName}`,
        body,
        footerText: `Receipt issued by ${restaurantName}. Please retain for your records.`,
      });

      await sendEmail({
        to: customerEmail,
        subject: `Your receipt from ${restaurantName}`,
        html,
        text: `Receipt from ${restaurantName} — Invoice ${invoiceNumber}\nTotal: ${fmtAmount(bill.totalAmount)}\nPayment: ${paymentMethod}\nThank you for dining with us!`,
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // PR-010: Manual-pending payments panel — return unresolved offline payments for manager review
  app.get("/api/billing/manual-pending", requireAuth, requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;

      const params: unknown[] = [user.tenantId];
      let outletFilter = "";
      if (outletId) {
        params.push(outletId);
        outletFilter = `AND b.outlet_id = $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT
          bp.id AS payment_id,
          bp.amount,
          bp.created_at AS payment_created_at,
          bp.gateway_status,
          b.id AS bill_id,
          b.bill_number,
          b.total_amount,
          b.payment_status,
          b.outlet_id,
          b.created_at AS bill_created_at
         FROM bill_payments bp
         JOIN bills b ON b.id = bp.bill_id
         WHERE bp.tenant_id = $1
           AND bp.payment_method = 'manual_pending'
           AND bp.gateway_status = 'gateway_down'
           AND bp.is_refund = false
           AND b.payment_status != 'paid'
           ${outletFilter}
         ORDER BY bp.created_at DESC
         LIMIT 200`,
        params
      );

      res.json({ data: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // TIP-ENDPOINT: GET /api/tip-settings
  app.get("/api/tip-settings", async (req: any, res: any) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const { rows } = await pool.query(
        `SELECT * FROM outlet_tip_settings WHERE tenant_id = $1 LIMIT 1`,
        [user.tenantId]
      );
      res.json(rows[0] || { tipsEnabled: false, distributionMethod: "equal", waiterSharePct: 70, kitchenSharePct: 30, tipPercentageOptions: [5, 10, 15, 20] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // TIP-ENDPOINT: PATCH /api/tip-settings
  app.patch("/api/tip-settings", async (req: any, res: any) => {
    try {
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const { tipsEnabled, distributionMethod, waiterShare, kitchenShare, tipPercentageOptions } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO outlet_tip_settings (id, tenant_id, outlet_id, tips_enabled, distribution_method, waiter_share_pct, kitchen_share_pct, suggested_pct_1, suggested_pct_2, suggested_pct_3)
         VALUES (gen_random_uuid(), $1, $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, outlet_id) DO UPDATE SET
           tips_enabled = $2, distribution_method = $3, waiter_share_pct = $4, kitchen_share_pct = $5,
           suggested_pct_1 = $6, suggested_pct_2 = $7, suggested_pct_3 = $8, updated_at = NOW()
         RETURNING *`,
        [
          user.tenantId,
          tipsEnabled ?? false,
          distributionMethod ?? "equal",
          waiterShare ?? 70,
          kitchenShare ?? 30,
          JSON.stringify(tipPercentageOptions ?? [5, 10, 15, 20]),
        ]
      );
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POS-EMAIL-RECEIPT: Send receipt via SMTP
  app.post("/api/bills/:id/email-receipt", requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { email } = req.body;
      const tenantId = req.user?.tenantId;
      if (!email?.trim()) return res.status(400).json({ message: "Email required" });

      const { rows: [bill] } = await pool.query(
        `SELECT b.*, t.name as restaurant_name, o.name as outlet_name
         FROM bills b
         JOIN tenants t ON t.id = b.tenant_id
         LEFT JOIN outlets o ON o.id = b.outlet_id
         WHERE b.id = $1 AND b.tenant_id = $2`,
        [id, tenantId]
      );
      if (!bill) return res.status(404).json({ message: "Bill not found" });

      const receiptUrl = `${process.env.APP_URL || "https://inifinit.com"}/receipt/${bill.id}`;

      await sendEmail({
        to: email.trim(),
        subject: `Receipt from ${bill.restaurant_name} — ${bill.bill_number}`,
        html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2>${bill.restaurant_name}</h2>
          <p><strong>Bill:</strong> ${bill.bill_number}</p>
          <p><strong>Total:</strong> ${bill.total_amount}</p>
          <p><a href="${receiptUrl}" style="background:#0070f3;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none">View Digital Receipt</a></p>
        </div>`,
      });

      res.json({ success: true, message: `Receipt sent to ${email}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

}
