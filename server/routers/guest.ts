import type { Express } from "express";
import { pool } from "../db";
import { storage } from "../storage";
import { snapshotPrepTime } from "../lib/snapshot-prep-time";
import { requireAuth } from "../middleware";
import { isStripeConfigured, getUncachableStripeClient, getPaymentStripeClient } from "../stripe";
import { createPaymentLink } from "../razorpay";
import { getTipConfig, recordAndDistributeTip } from "../services/tip-service";

async function getPlatformGatewaySettings(): Promise<{ activeGateway: string; razorpayKeyId: string | null; razorpayKeySecret: string | null }> {
  try {
    const { rows } = await pool.query(`SELECT active_payment_gateway, razorpay_key_id, razorpay_key_secret FROM platform_settings WHERE id = 'singleton' LIMIT 1`);
    return { activeGateway: rows[0]?.active_payment_gateway ?? "stripe", razorpayKeyId: rows[0]?.razorpay_key_id ?? null, razorpayKeySecret: rows[0]?.razorpay_key_secret ?? null };
  } catch {
    return { activeGateway: "stripe", razorpayKeyId: null, razorpayKeySecret: null };
  }
}

export function registerGuestRoutes(app: Express): void {
  // lightweight endpoint returning only categories (no items) for progressive loading
  app.get("/api/guest/menu/:outletId/categories", async (req, res) => {
    try {
      const { outletId } = req.params;
      const outlet = await storage.getOutlet(outletId);
      if (!outlet) return res.status(404).json({ message: "Outlet not found" });
      const tenant = await storage.getTenant(outlet.tenantId);
      if (!tenant) return res.status(404).json({ message: "Restaurant not found" });
      const categories = await storage.getCategoriesByTenant(tenant.id);
      res.json({
        categories: categories.filter(c => c.active !== false),
        currency: tenant.currency,
        currencyPosition: (tenant as any).currencyPosition || "before",
        currencyDecimals: (tenant as any).currencyDecimals ?? 2,
        taxRate: tenant.taxRate,
        restaurantName: tenant.name,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // items-per-category endpoint for progressive loading
  app.get("/api/guest/menu/:outletId/categories/:categoryId/items", async (req, res) => {
    try {
      const { outletId, categoryId } = req.params;
      const outlet = await storage.getOutlet(outletId);
      if (!outlet) return res.status(404).json({ message: "Outlet not found" });
      const tenant = await storage.getTenant(outlet.tenantId);
      if (!tenant) return res.status(404).json({ message: "Restaurant not found" });
      const allItems = await storage.getMenuItemsForOutlet(tenant.id, outletId);
      const items = allItems
        .filter((i: any) => i.categoryId === categoryId && i.available !== false)
        .map((i: any) => ({
          id: i.id, name: i.name, description: i.description, price: i.price,
          categoryId: i.categoryId, image: i.image, isVeg: i.isVeg,
          spicyLevel: i.spicyLevel, allergens: i.allergens || null, tags: i.tags || null,
        }));
      res.json({ items });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/guest/menu/:outletId", async (req, res) => {
    try {
      const { outletId } = req.params;
      const outlet = await storage.getOutlet(outletId);
      if (!outlet) return res.status(404).json({ message: "Outlet not found" });
      const tenant = await storage.getTenant(outlet.tenantId);
      if (!tenant) return res.status(404).json({ message: "Restaurant not found" });
      const categories = await storage.getCategoriesByTenant(tenant.id);
      const items = await storage.getMenuItemsForOutlet(tenant.id, outletId);
      res.json({
        categories: categories.filter(c => c.active !== false),
        items: items.map((i: any) => ({
          id: i.id, name: i.name, description: i.description, price: i.price,
          categoryId: i.categoryId, image: i.image, isVeg: i.isVeg,
          spicyLevel: i.spicyLevel, allergens: i.allergens || null, tags: i.tags || null,
        })),
        currency: tenant.currency,
        currencyPosition: (tenant as any).currencyPosition || "before",
        currencyDecimals: (tenant as any).currencyDecimals ?? 2,
        taxRate: tenant.taxRate, restaurantName: tenant.name,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/tables/:tableId/generate-qr-token", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const table = await storage.getTable(req.params.tableId, user.tenantId);
      if (!table) return res.status(404).json({ message: "Table not found" });
      const crypto = await import("crypto");
      const token = `tbl-${crypto.randomBytes(8).toString("hex")}`;
      const updated = await storage.updateTableByTenant(table.id, user.tenantId, { qrToken: token });
      res.json({ qrToken: token, table: updated });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/guest/:outletId/:tableToken", async (req, res) => {
    try {
      const { outletId, tableToken } = req.params;
      const table = await storage.getTableByQrToken(outletId, tableToken);
      if (!table) return res.status(404).json({ message: "Table not found" });

      const outlet = await storage.getOutlet(outletId);
      if (!outlet) return res.status(404).json({ message: "Outlet not found" });

      const tenant = await storage.getTenant(outlet.tenantId);
      if (!tenant) return res.status(404).json({ message: "Restaurant not found" });

      let session = await storage.getActiveTableSession(table.id);
      if (!session) {
        session = await storage.createTableSession({
          tenantId: tenant.id, outletId, tableId: table.id, token: tableToken,
          status: "active", guestCount: 1,
        });
      }

      // lightweight initial response — omit full menu items; categories + session + cart returned
      // Items are fetched on-demand per-category via GET /api/guest/menu/:outletId/categories/:categoryId/items
      const categories = await storage.getCategoriesByTenant(tenant.id);
      const cartItems = await storage.getGuestCartItems(session.id);

      const existingOrders = await storage.getOrdersByTenant(tenant.id);
      const tableOrders = existingOrders.filter(o => o.tableId === table.id && o.status !== "paid" && o.status !== "cancelled" && o.status !== "voided");
      const runningBill: any[] = [];
      for (const order of tableOrders) {
        const oi = await storage.getOrderItemsByOrder(order.id, tenant.id);
        runningBill.push({ orderId: order.id, status: order.status, subtotal: order.subtotal, tax: order.tax, total: order.total, items: oi });
      }

      res.json({
        session,
        table: { id: table.id, number: table.number, zone: table.zone, capacity: table.capacity },
        tenant: {
          name: tenant.name, currency: tenant.currency,
          currencyPosition: (tenant as any).currencyPosition || "before",
          currencyDecimals: (tenant as any).currencyDecimals ?? 2,
          taxRate: tenant.taxRate, serviceCharge: tenant.serviceCharge,
          taxType: (tenant as any).taxType || "vat",
          compoundTax: (tenant as any).compoundTax ?? false,
        },
        outlet: { id: outlet.id, name: outlet.name },
        categories: categories.filter(c => c.active !== false),
        // items intentionally omitted — use GET /api/guest/menu/:outletId/categories/:categoryId/items
        cart: cartItems, runningBill,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/session/:sessionId/cart", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getTableSession(sessionId);
      if (!session || session.status !== "active") return res.status(404).json({ message: "Session not found or expired" });

      const { menuItemId, quantity, notes, guestLabel } = req.body;
      if (!menuItemId) return res.status(400).json({ message: "menuItemId is required" });

      const menuItem = await storage.getMenuItem(menuItemId, session.tenantId);
      if (!menuItem) return res.status(404).json({ message: "Menu item not found" });
      if (menuItem.available === false) return res.status(400).json({ message: "Item is not available" });

      const item = await storage.createGuestCartItem({
        sessionId, menuItemId, name: menuItem.name, price: menuItem.price,
        quantity: Math.max(1, Math.min(99, quantity || 1)),
        notes: notes ? String(notes).slice(0, 500) : null,
        guestLabel: guestLabel ? String(guestLabel).slice(0, 50) : "Guest 1",
      });
      res.json(item);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/guest/cart/:itemId", async (req, res) => {
    try {
      const { itemId } = req.params;
      const { quantity, notes, sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ message: "sessionId is required" });
      const session = await storage.getTableSession(sessionId);
      if (!session || session.status !== "active") return res.status(404).json({ message: "Session not found or expired" });
      const cartItems = await storage.getGuestCartItems(sessionId);
      if (!cartItems.find(ci => ci.id === itemId)) return res.status(403).json({ message: "Item not in session cart" });

      if (quantity !== undefined && quantity <= 0) {
        await storage.deleteGuestCartItem(itemId);
        return res.json({ deleted: true });
      }
      const updated = await storage.updateGuestCartItem(itemId, {
        ...(quantity !== undefined && { quantity: Math.max(1, Math.min(99, quantity)) }),
        ...(notes !== undefined && { notes: String(notes).slice(0, 500) }),
      });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/guest/cart/:itemId", async (req, res) => {
    try {
      const { sessionId } = req.query as { sessionId?: string };
      if (!sessionId) return res.status(400).json({ message: "sessionId query param is required" });
      const session = await storage.getTableSession(sessionId);
      if (!session || session.status !== "active") return res.status(404).json({ message: "Session not found" });
      const cartItems = await storage.getGuestCartItems(sessionId);
      if (!cartItems.find(ci => ci.id === req.params.itemId)) return res.status(403).json({ message: "Item not in session cart" });
      await storage.deleteGuestCartItem(req.params.itemId);
      res.json({ deleted: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/guest/session/:sessionId/cart", async (req, res) => {
    try {
      const session = await storage.getTableSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      res.json(await storage.getGuestCartItems(session.id));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/session/:sessionId/order", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getTableSession(sessionId);
      if (!session || session.status !== "active") return res.status(404).json({ message: "Session not found or expired" });

      const cartItems = await storage.getGuestCartItems(sessionId);
      if (cartItems.length === 0) return res.status(400).json({ message: "Cart is empty" });

      const tenant = await storage.getTenant(session.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const subtotal = cartItems.reduce((s, ci) => s + Number(ci.price) * ci.quantity, 0);
      const taxRate = Number(tenant.taxRate || "0") / 100;
      const serviceChargePct = Number(tenant.serviceCharge || "0") / 100;
      const serviceChargeAmount = subtotal * serviceChargePct;
      const compoundTax = (tenant as any).compoundTax ?? false;
      const taxBase = compoundTax ? subtotal + serviceChargeAmount : subtotal;
      const taxAmount = taxBase * taxRate;
      const total = subtotal + serviceChargeAmount + taxAmount;

      const order = await storage.createOrder({
        tenantId: session.tenantId, outletId: session.outletId,
        tableId: session.tableId, orderType: "dine_in", status: "new", channel: "qr_dinein",
        subtotal: subtotal.toFixed(2), tax: taxAmount.toFixed(2), discount: "0",
        total: total.toFixed(2),
        notes: serviceChargeAmount > 0 ? `Service Charge: ${serviceChargeAmount.toFixed(2)}` : null,
      });

      for (const ci of cartItems) {
        const itemPrepMinutes = await snapshotPrepTime(ci.menuItemId);
        await storage.createOrderItem({ orderId: order.id, menuItemId: ci.menuItemId, name: ci.name, quantity: ci.quantity, price: ci.price, notes: ci.notes, itemPrepMinutes });
      }

      await storage.clearGuestCart(sessionId);
      await storage.updateTableSession(sessionId, { orderId: order.id });

      const orderItemsFull = await storage.getOrderItemsByOrder(order.id, tenant.id);
      res.json({ order, items: orderItemsFull });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/session/:sessionId/call-server", async (req, res) => {
    try {
      const session = await storage.getTableSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      await storage.updateTable(session.tableId, session.tenantId, { callServerFlag: true });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/session/:sessionId/request-bill", async (req, res) => {
    try {
      const session = await storage.getTableSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      await storage.updateTable(session.tableId, session.tenantId, { requestBillFlag: true });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/guest/session/:sessionId/bill", async (req, res) => {
    try {
      const session = await storage.getTableSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const tenant = await storage.getTenant(session.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const allOrders = await storage.getOrdersByTenant(session.tenantId);
      const tableOrders = allOrders.filter(o => o.tableId === session.tableId && o.status !== "cancelled" && o.status !== "voided");
      const billItems: any[] = [];
      let billTotal = 0, billTax = 0, billSubtotal = 0;

      for (const order of tableOrders) {
        const oi = await storage.getOrderItemsByOrder(order.id, tenant.id);
        for (const item of oi) billItems.push({ ...item, orderId: order.id, orderStatus: order.status });
        billSubtotal += Number(order.subtotal || 0);
        billTax += Number(order.tax || 0);
        billTotal += Number(order.total || 0);
      }

      res.json({
        items: billItems,
        subtotal: billSubtotal.toFixed(2), tax: billTax.toFixed(2), total: billTotal.toFixed(2),
        currency: tenant.currency,
        currencyPosition: (tenant as any).currencyPosition || "before",
        currencyDecimals: (tenant as any).currencyDecimals ?? 2,
        restaurantName: tenant.name,
        tableNumber: (await storage.getTable(session.tableId))?.number,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/session/:sessionId/close", async (req, res) => {
    try {
      const session = await storage.getTableSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      await storage.updateTableSession(session.id, { status: "closed", closedAt: new Date() });
      await storage.clearGuestCart(session.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/payment-session", async (req, res) => {
    try {
      const gwSettings = await getPlatformGatewaySettings();
      if (gwSettings.activeGateway === "razorpay") return res.status(403).json({ message: "Stripe payments are disabled. Active gateway is Razorpay." });
      if (!await isStripeConfigured()) return res.status(503).json({ message: "Stripe is not configured" });
      const { sessionId, outletId, tableToken } = req.body;
      if (!sessionId || !outletId || !tableToken) return res.status(400).json({ message: "sessionId, outletId, and tableToken are required" });

      const tableSession = await storage.getTableSession(sessionId);
      if (!tableSession) return res.status(404).json({ message: "Session not found" });

      const validTable = await storage.getTableByQrToken(outletId, tableToken);
      if (!validTable || validTable.id !== tableSession.tableId) return res.status(403).json({ message: "Session does not match the provided table credentials" });

      const tenant = await storage.getTenant(tableSession.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const allOrders = await storage.getOrdersByTenant(tableSession.tenantId);
      const unpaidTableOrders = allOrders.filter(o => o.tableId === tableSession.tableId && o.status !== "cancelled" && o.status !== "voided" && o.status !== "paid");
      const billTotal = unpaidTableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const amountInCents = Math.round(billTotal * 100);
      if (amountInCents <= 0) return res.status(400).json({ message: "No unpaid bill found for this session" });

      const stripeClient = await getPaymentStripeClient();
      const origin = `${req.protocol}://${req.get("host")}`;
      const currency = (tenant.currency || "usd").toLowerCase();
      const session = await stripeClient.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price_data: { currency, product_data: { name: `Bill Payment — ${tenant.name}` }, unit_amount: amountInCents }, quantity: 1 }],
        success_url: `${origin}/guest/${outletId}/${tableToken}?payment_success=1`,
        cancel_url: `${origin}/guest/${outletId}/${tableToken}?payment_cancelled=1`,
        metadata: { orderPayment: "true", guestPayment: "true", sessionId, tenantId: tableSession.tenantId, channel: "guest" },
      });
      res.json({ url: session.url, sessionId: session.id, amount: billTotal.toFixed(2) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/razorpay-payment", async (req, res) => {
    try {
      const gwSettings = await getPlatformGatewaySettings();
      if (gwSettings.activeGateway === "stripe") return res.status(403).json({ message: "Razorpay payments are disabled. Active gateway is Stripe." });
      const { sessionId, outletId, tableToken } = req.body;
      if (!sessionId || !outletId || !tableToken) return res.status(400).json({ message: "sessionId, outletId, and tableToken are required" });

      const tableSession = await storage.getTableSession(sessionId);
      if (!tableSession) return res.status(404).json({ message: "Session not found" });

      const validTable = await storage.getTableByQrToken(outletId, tableToken);
      if (!validTable || validTable.id !== tableSession.tableId) return res.status(403).json({ message: "Session does not match the provided table credentials" });

      const tenant = await storage.getTenant(tableSession.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const allOrders = await storage.getOrdersByTenant(tableSession.tenantId);
      const unpaidTableOrders = allOrders.filter(o => o.tableId === tableSession.tableId && o.status !== "cancelled" && o.status !== "voided" && o.status !== "paid");
      const billTotal = unpaidTableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      if (billTotal <= 0) return res.status(400).json({ message: "No unpaid bill found for this session" });

      const platformSettings = await getPlatformGatewaySettings();
      const keyId = (tenant as any).razorpayKeyId || platformSettings.razorpayKeyId;
      const keySecret = (tenant as any).razorpayKeySecret || platformSettings.razorpayKeySecret;

      const link = await createPaymentLink({
        amountRupees: billTotal,
        currency: tenant.currency || "INR",
        description: `Bill Payment — ${tenant.name}`,
        billId: sessionId,
        tenantKeyId: keyId,
        tenantKeySecret: keySecret,
      });

      res.json({ paymentLinkId: link.id, shortUrl: link.short_url, amount: billTotal.toFixed(2) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/guest/razorpay-payment-status", async (req, res) => {
    try {
      const { linkId, outletId, tableToken } = req.query as Record<string, string>;
      if (!linkId || !outletId || !tableToken) return res.status(400).json({ message: "linkId, outletId, and tableToken are required" });

      const table = await storage.getTableByQrToken(outletId, tableToken);
      if (!table) return res.status(403).json({ message: "Invalid table credentials" });

      const tenant = await storage.getTenant(table.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const platformSettings = await getPlatformGatewaySettings();
      const keyId = (tenant as any).razorpayKeyId || platformSettings.razorpayKeyId;
      const keySecret = (tenant as any).razorpayKeySecret || platformSettings.razorpayKeySecret;

      const { getPaymentLink } = await import("../razorpay");
      const link = await getPaymentLink(linkId, keyId, keySecret);

      if (link.status === "paid") {
        const allOrders = await storage.getOrdersByTenant(table.tenantId);
        const tableOrders = allOrders.filter(o => o.tableId === table.id && (o.status === "pending_payment" || o.status === "new" || o.status === "completed"));
        for (const o of tableOrders) {
          if (o.status !== "paid") {
            await storage.updateOrder(o.id, tenant.id, { status: "paid", paymentMethod: "razorpay" });
          }
        }
        return res.json({ status: "paid" });
      }

      return res.json({ status: link.status === "cancelled" || link.status === "expired" ? "cancelled" : "pending" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // GET tip config for a QR session (no auth)
  app.get("/api/guest/session/:sessionId/tip-config", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const tableSession = await storage.getTableSession(sessionId);
      if (!tableSession) return res.json(null);

      const { rows: outletRows } = await pool.query(
        `SELECT id FROM outlets WHERE id = $1 LIMIT 1`,
        [tableSession.outletId]
      );
      if (!outletRows[0]) return res.json(null);

      const config = await getTipConfig(tableSession.outletId!, tableSession.tenantId);
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST QR cash payment with optional tip
  app.post("/api/guest/session/:sessionId/cash-payment", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { tip_amount } = req.body;
      const tableSession = await storage.getTableSession(sessionId);
      if (!tableSession) return res.status(404).json({ message: "Session not found" });

      const allOrders = await storage.getOrdersByTenant(tableSession.tenantId);
      const tableOrders = allOrders.filter(o =>
        o.tableId === tableSession.tableId &&
        o.status !== "cancelled" && o.status !== "voided" && o.status !== "paid"
      );

      for (const o of tableOrders) {
        await storage.updateOrder(o.id, tenant.id, { status: "paid", paymentMethod: "cash" });
      }

      // Fire-and-forget tip recording
      if (tip_amount && Number(tip_amount) > 0 && tableSession.outletId) {
        (async () => {
          try {
            const { rows: [tipSettings] } = await pool.query(
              `SELECT * FROM outlet_tip_settings WHERE outlet_id = $1 AND tenant_id = $2 AND tips_enabled = true LIMIT 1`,
              [tableSession.outletId, tableSession.tenantId]
            );
            if (tipSettings && tableOrders[0]) {
              const firstOrder = tableOrders[0];
              const { rows: billRows } = await pool.query(
                `SELECT id, waiter_id, waiter_name FROM bills WHERE order_id = $1 LIMIT 1`,
                [firstOrder.id]
              );
              if (billRows[0]) {
                const bill = billRows[0];
                await recordAndDistributeTip({
                  billId: bill.id,
                  orderId: firstOrder.id,
                  tenantId: tableSession.tenantId,
                  outletId: tableSession.outletId!,
                  tipAmount: Number(tip_amount),
                  tipType: "CUSTOM",
                  tipPercentage: null,
                  tipBasisAmount: Number(firstOrder.total || 0),
                  waiterId: bill.waiter_id || tableSession.tenantId,
                  waiterName: bill.waiter_name || "Guest Order",
                  paymentMethod: "CASH",
                  settings: tipSettings,
                });
              }
            }
          } catch (e) { /* silent */ }
        })();
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
