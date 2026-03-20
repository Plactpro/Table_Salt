import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../middleware";
import { isStripeConfigured, getUncachableStripeClient } from "../stripe";

export function registerGuestRoutes(app: Express): void {
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
      const table = await storage.getTable(req.params.tableId);
      if (!table || table.tenantId !== user.tenantId) return res.status(404).json({ message: "Table not found" });
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

      const categories = await storage.getCategoriesByTenant(tenant.id);
      const items = await storage.getMenuItemsForOutlet(tenant.id, outletId);
      const cartItems = await storage.getGuestCartItems(session.id);

      const existingOrders = await storage.getOrdersByTenant(tenant.id);
      const tableOrders = existingOrders.filter(o => o.tableId === table.id && o.status !== "paid" && o.status !== "cancelled" && o.status !== "voided");
      const runningBill: any[] = [];
      for (const order of tableOrders) {
        const oi = await storage.getOrderItemsByOrder(order.id);
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
        items: items.filter((i: any) => i.available !== false),
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

      const menuItem = await storage.getMenuItem(menuItemId);
      if (!menuItem) return res.status(404).json({ message: "Menu item not found" });
      if (menuItem.tenantId !== session.tenantId) return res.status(403).json({ message: "Item not available" });
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
        await storage.createOrderItem({ orderId: order.id, menuItemId: ci.menuItemId, name: ci.name, quantity: ci.quantity, price: ci.price, notes: ci.notes });
      }

      await storage.clearGuestCart(sessionId);
      await storage.updateTableSession(sessionId, { orderId: order.id });

      const orderItemsFull = await storage.getOrderItemsByOrder(order.id);
      res.json({ order, items: orderItemsFull });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/session/:sessionId/call-server", async (req, res) => {
    try {
      const session = await storage.getTableSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      await storage.updateTable(session.tableId, { callServerFlag: true });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/guest/session/:sessionId/request-bill", async (req, res) => {
    try {
      const session = await storage.getTableSession(req.params.sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      await storage.updateTable(session.tableId, { requestBillFlag: true });
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
        const oi = await storage.getOrderItemsByOrder(order.id);
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

      const stripeClient = await getUncachableStripeClient();
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
}
