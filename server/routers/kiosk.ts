import type { Express } from "express";
import { pool } from "../db";
import { storage } from "../storage";
import { snapshotPrepTime } from "../lib/snapshot-prep-time";
import { requireAuth, requireRole } from "../middleware";
import { isStripeConfigured, getUncachableStripeClient, getPaymentStripeClient } from "../stripe";
import { createPaymentLink, getPaymentLink } from "../razorpay";
import { deductRecipeInventoryForOrder } from "../lib/deduct-recipe-inventory";

async function getActiveGateway(): Promise<string> {
  try {
    const { rows } = await pool.query(`SELECT active_payment_gateway FROM platform_settings WHERE id = 'singleton' LIMIT 1`);
    return rows[0]?.active_payment_gateway ?? "stripe";
  } catch {
    return "stripe";
  }
}

async function getPlatformRazorpayCredentials(): Promise<{ keyId: string | null; keySecret: string | null }> {
  try {
    const { rows } = await pool.query(`SELECT razorpay_key_id, razorpay_key_secret FROM platform_settings WHERE id = 'singleton' LIMIT 1`);
    return { keyId: rows[0]?.razorpay_key_id ?? null, keySecret: rows[0]?.razorpay_key_secret ?? null };
  } catch {
    return { keyId: null, keySecret: null };
  }
}

export function registerKioskRoutes(app: Express): void {
  app.get("/api/kiosk-devices", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getKioskDevicesByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kiosk-devices", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { name, outletId, active, settings } = req.body;
      if (!name) return res.status(400).json({ message: "Device name is required" });
      if (outletId) {
        const outlet = await storage.getOutletUnchecked(outletId);
        if (!outlet || outlet.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid outlet" });
      }
      const crypto = await import("crypto");
      const deviceToken = crypto.randomBytes(32).toString("hex");
      const device = await storage.createKioskDevice({ name, outletId: outletId || null, active: active ?? true, settings: settings || null, tenantId: user.tenantId, deviceToken });
      res.json(device);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/kiosk-devices/:id", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { name, active, settings, outletId } = req.body;
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (active !== undefined) updates.active = active;
      if (settings !== undefined) updates.settings = settings;
      if (outletId !== undefined) {
        const outlet = await storage.getOutletUnchecked(outletId);
        if (!outlet || outlet.tenantId !== user.tenantId) return res.status(400).json({ message: "Invalid outlet" });
        updates.outletId = outletId;
      }
      const device = await storage.updateKioskDevice(req.params.id, user.tenantId, updates);
      if (!device) return res.status(404).json({ message: "Device not found" });
      res.json(device);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/kiosk-devices/:id", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteKioskDevice(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/upsell-rules", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getUpsellRulesByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/upsell-rules", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.createUpsellRule({ ...req.body, tenantId: user.tenantId }));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/upsell-rules/:id", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const rule = await storage.updateUpsellRule(req.params.id, user.tenantId, req.body);
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json(rule);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/upsell-rules/:id", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteUpsellRule(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/kiosk/menu", async (req, res) => {
    try {
      const token = req.headers["x-kiosk-token"] as string;
      if (!token) return res.status(401).json({ message: "Missing kiosk token" });
      const device = await storage.getKioskDeviceByToken(token);
      if (!device || !device.active) return res.status(401).json({ message: "Invalid or inactive kiosk device" });
      const categories = await storage.getCategoriesByTenant(device.tenantId!);
      const items = await storage.getMenuItemsByTenant(device.tenantId!);
      res.json({ categories: categories.filter(c => c.active !== false), items: items.filter(i => i.available !== false), tenantId: device.tenantId, outletId: device.outletId });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/kiosk/upsells", async (req, res) => {
    try {
      const token = req.headers["x-kiosk-token"] as string;
      if (!token) return res.status(401).json({ message: "Missing kiosk token" });
      const device = await storage.getKioskDeviceByToken(token);
      if (!device || !device.active) return res.status(401).json({ message: "Invalid or inactive kiosk device" });
      const rules = await storage.getUpsellRulesByTenant(device.tenantId!);
      res.json(rules.filter(r => r.active));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/kiosk/tenant-info", async (req, res) => {
    try {
      const token = req.headers["x-kiosk-token"] as string;
      if (!token) return res.status(401).json({ message: "Missing kiosk token" });
      const device = await storage.getKioskDeviceByToken(token);
      if (!device || !device.active) return res.status(401).json({ message: "Invalid or inactive kiosk device" });
      const tenant = await storage.getTenant(device.tenantId!);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json({
        name: tenant.name, currency: tenant.currency,
        currencyPosition: (tenant as any).currencyPosition || "before",
        currencyDecimals: (tenant as any).currencyDecimals ?? 2,
        taxRate: tenant.taxRate, serviceCharge: tenant.serviceCharge,
        taxType: (tenant as any).taxType || "vat",
        compoundTax: (tenant as any).compoundTax ?? false,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/kiosk/device-config", async (req, res) => {
    try {
      const token = req.headers["x-kiosk-token"] as string;
      if (!token) return res.status(401).json({ message: "Missing kiosk token" });
      const device = await storage.getKioskDeviceByToken(token);
      if (!device || !device.active) return res.status(401).json({ message: "Invalid or inactive kiosk device" });
      res.json({ id: device.id, name: device.name, settings: device.settings || {} });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kiosk/order", async (req, res) => {
    try {
      const token = req.headers["x-kiosk-token"] as string;
      if (!token) return res.status(401).json({ message: "Missing kiosk token" });
      const device = await storage.getKioskDeviceByToken(token);
      if (!device || !device.active) return res.status(401).json({ message: "Invalid or inactive kiosk device" });

      const { items, paymentMethod, clientOrderId } = req.body;

      if (clientOrderId) {
        const existing = await storage.getOrderByClientId(device.tenantId!, clientOrderId);
        if (existing) {
          const existingItems = await storage.getOrderItemsByOrder(existing.id, device.tenantId!);
          return res.status(409).json({ message: "Duplicate order", order: { ...existing, items: existingItems }, tokenNumber: existing.orderNumber || existing.id.slice(0, 6).toUpperCase() });
        }
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must have at least one item" });
      }

      const menuItemsList = await storage.getMenuItemsByTenant(device.tenantId!);
      const menuMap = new Map(menuItemsList.map(m => [m.id, m]));
      const availableItems = new Set(menuItemsList.filter(m => m.available !== false).map(m => m.id));

      let serverSubtotal = 0;
      const serverItems: { menuItemId: string; name: string; price: number; quantity: number; categoryId?: string; notes?: string }[] = [];
      for (const item of items) {
        if (!item.menuItemId || typeof item.menuItemId !== "string") continue;
        const mi = menuMap.get(item.menuItemId);
        if (!mi || !availableItems.has(mi.id)) continue;
        const canonicalPrice = Number(mi.price);
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        serverSubtotal += canonicalPrice * qty;
        serverItems.push({ menuItemId: mi.id, name: mi.name, price: canonicalPrice, quantity: qty, categoryId: mi.categoryId || undefined, notes: typeof item.notes === "string" ? item.notes.slice(0, 200) : undefined });
      }

      if (serverItems.length === 0) return res.status(400).json({ message: "No valid items in order" });
      serverSubtotal = Math.round(serverSubtotal * 100) / 100;

      const { evaluateRules } = await import("../promotions-engine");
      const promoRules = await storage.getPromotionRulesByTenant(device.tenantId!);
      const tenant = await storage.getTenant(device.tenantId!);
      const taxRate = Number(tenant?.taxRate || 0) / 100;
      const serviceChargeRate = Number(tenant?.serviceCharge || 0) / 100;

      const requestedServiceType = req.body.serviceType === "dine_in" ? "dine_in" : "takeaway";

      const engineResult = evaluateRules(promoRules, {
        items: serverItems,
        subtotal: serverSubtotal,
        channel: "kiosk",
        orderType: requestedServiceType,
      });

      const engineDiscountTotal = engineResult.appliedDiscounts.reduce((s, d) => s + (d.discountAmount > 0 ? d.discountAmount : 0), 0);
      const totalDiscount = Math.round(engineDiscountTotal * 100) / 100;
      const afterDiscount = Math.max(0, serverSubtotal - totalDiscount);
      const serverServiceCharge = Math.round(afterDiscount * serviceChargeRate * 100) / 100;
      const serverTax = Math.round(afterDiscount * taxRate * 100) / 100;
      const serverTotal = Math.round((afterDiscount + serverServiceCharge + serverTax) * 100) / 100;

      const pm = paymentMethod || "card";
      const isDigitalPayment = ["card", "upi", "wallet"].includes(pm);
      const orderStatus = isDigitalPayment ? "paid" : "new";

      let order;
      try {
        order = await storage.createOrder({
          tenantId: device.tenantId!, outletId: device.outletId,
          orderType: requestedServiceType, channel: "kiosk",
          channelOrderId: clientOrderId || undefined, status: orderStatus,
          subtotal: serverSubtotal.toFixed(2), discount: totalDiscount.toFixed(2),
          tax: serverTax.toFixed(2), total: serverTotal.toFixed(2),
          paymentMethod: pm, notes: `Kiosk order from ${device.name}`,
        });
      } catch (dbErr: any) {
        if (clientOrderId && dbErr.code === "23505" && dbErr.constraint?.includes("channel_order_id")) {
          const dup = await storage.getOrderByClientId(device.tenantId!, clientOrderId);
          if (dup) {
            const dupItems = await storage.getOrderItemsByOrder(dup.id, device.tenantId!);
            return res.status(409).json({ message: "Duplicate order", order: { ...dup, items: dupItems }, tokenNumber: dup.orderNumber || dup.id.slice(0, 6).toUpperCase() });
          }
        }
        throw dbErr;
      }

      for (const item of serverItems) {
        const mi = menuMap.get(item.menuItemId);
        const itemPrepMinutes = await snapshotPrepTime(item.menuItemId, mi?.prepTimeMinutes);
        await storage.createOrderItem({
          orderId: order.id, menuItemId: item.menuItemId, name: item.name,
          quantity: item.quantity, price: item.price.toFixed(2),
          station: mi?.station || null, course: mi?.course || null, notes: item.notes || null,
          itemPrepMinutes,
        });
      }

      const orderItems = await storage.getOrderItemsByOrder(order.id, device.tenantId!);
      const tokenNumber = order.orderNumber || order.id.slice(0, 6).toUpperCase();

      if (isDigitalPayment) {
        try {
          await deductRecipeInventoryForOrder(order.id, device.tenantId!, "kiosk");
        } catch (deductErr) {
          console.error(`[kiosk] Inventory deduction failed for order ${order.id}:`, deductErr);
        }
      }

      res.json({ ...order, items: orderItems, tokenNumber });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kiosk/payment-session", async (req, res) => {
    try {
      const gwCheck = await getActiveGateway();
      if (gwCheck === "razorpay") return res.status(403).json({ message: "Stripe payments are disabled. Active gateway is Razorpay." });
      if (!await isStripeConfigured()) return res.status(503).json({ message: "Stripe is not configured" });
      const token = req.headers["x-kiosk-token"] as string;
      if (!token) return res.status(401).json({ message: "Missing kiosk token" });
      const device = await storage.getKioskDeviceByToken(token);
      if (!device || !device.active) return res.status(401).json({ message: "Invalid or inactive kiosk device" });

      const { items, serviceType, clientOrderId } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Order must have at least one item" });

      if (clientOrderId) {
        const existing = await storage.getOrderByClientId(device.tenantId!, clientOrderId);
        if (existing) {
          const existingItems = await storage.getOrderItemsByOrder(existing.id, device.tenantId!);
          return res.status(409).json({ message: "Duplicate order", order: { ...existing, items: existingItems } });
        }
      }

      const menuItemsList = await storage.getMenuItemsByTenant(device.tenantId!);
      const menuMap = new Map(menuItemsList.map(m => [m.id, m]));
      const availableItems = new Set(menuItemsList.filter(m => m.available !== false).map(m => m.id));

      let serverSubtotal = 0;
      const serverItems: { menuItemId: string; name: string; price: number; quantity: number; notes?: string }[] = [];
      for (const item of items) {
        if (!item.menuItemId || typeof item.menuItemId !== "string") continue;
        const mi = menuMap.get(item.menuItemId);
        if (!mi || !availableItems.has(mi.id)) continue;
        const canonicalPrice = Number(mi.price);
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        serverSubtotal += canonicalPrice * qty;
        serverItems.push({ menuItemId: mi.id, name: mi.name, price: canonicalPrice, quantity: qty, notes: typeof item.notes === "string" ? item.notes.slice(0, 200) : undefined });
      }
      if (serverItems.length === 0) return res.status(400).json({ message: "No valid items in order" });
      serverSubtotal = Math.round(serverSubtotal * 100) / 100;

      const tenant = await storage.getTenant(device.tenantId!);
      const taxRate = Number(tenant?.taxRate || 0) / 100;
      const serviceChargeRate = Number(tenant?.serviceCharge || 0) / 100;
      const afterDiscount = serverSubtotal;
      const serverServiceCharge = Math.round(afterDiscount * serviceChargeRate * 100) / 100;
      const serverTax = Math.round(afterDiscount * taxRate * 100) / 100;
      const serverTotal = Math.round((afterDiscount + serverServiceCharge + serverTax) * 100) / 100;
      const requestedServiceType = serviceType === "dine_in" ? "dine_in" : "takeaway";

      const order = await storage.createOrder({
        tenantId: device.tenantId!, outletId: device.outletId,
        orderType: requestedServiceType, channel: "kiosk",
        channelOrderId: clientOrderId || undefined, status: "pending_payment",
        subtotal: serverSubtotal.toFixed(2), discount: "0.00",
        tax: serverTax.toFixed(2), total: serverTotal.toFixed(2),
        paymentMethod: "card", notes: `Kiosk order from ${device.name} (awaiting card payment)`,
      });

      for (const item of serverItems) {
        const mi = menuMap.get(item.menuItemId);
        const itemPrepMinutes = await snapshotPrepTime(item.menuItemId, mi?.prepTimeMinutes);
        await storage.createOrderItem({
          orderId: order.id, menuItemId: item.menuItemId, name: item.name,
          quantity: item.quantity, price: item.price.toFixed(2),
          station: mi?.station || null, course: mi?.course || null, notes: item.notes || null,
          itemPrepMinutes,
        });
      }

      const stripeClient = await getPaymentStripeClient();
      const origin = `${req.protocol}://${req.get("host")}`;
      const currency = (tenant?.currency || "aed").toLowerCase();

      const lineItems = serverItems.map(item => ({
        price_data: { currency, product_data: { name: item.name }, unit_amount: Math.round(item.price * 100) },
        quantity: item.quantity,
      }));

      if (serverTax > 0) lineItems.push({ price_data: { currency, product_data: { name: "Tax" }, unit_amount: Math.round(serverTax * 100) }, quantity: 1 });
      if (serverServiceCharge > 0) lineItems.push({ price_data: { currency, product_data: { name: "Service Charge" }, unit_amount: Math.round(serverServiceCharge * 100) }, quantity: 1 });

      const session = await stripeClient.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        success_url: `${origin}/kiosk?token=${token}&payment_success=1&orderId=${order.id}`,
        cancel_url: `${origin}/kiosk?token=${token}&payment_cancelled=1&orderId=${order.id}`,
        metadata: { orderPayment: "true", orderId: order.id, tenantId: device.tenantId!, channel: "kiosk" },
      });

      await pool.query(`UPDATE orders SET stripe_payment_session_id = $1 WHERE id = $2`, [session.id, order.id]);

      res.json({ url: session.url, orderId: order.id, sessionId: session.id });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/kiosk/razorpay-payment", async (req, res) => {
    try {
      const gwCheck = await getActiveGateway();
      if (gwCheck === "stripe") return res.status(403).json({ message: "Razorpay payments are disabled. Active gateway is Stripe." });
      const token = req.headers["x-kiosk-token"] as string;
      if (!token) return res.status(401).json({ message: "Missing kiosk token" });
      const device = await storage.getKioskDeviceByToken(token);
      if (!device || !device.active) return res.status(401).json({ message: "Invalid or inactive kiosk device" });

      const { items, serviceType, clientOrderId } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Order must have at least one item" });

      if (clientOrderId) {
        const existing = await storage.getOrderByClientId(device.tenantId!, clientOrderId);
        if (existing) {
          const existingItems = await storage.getOrderItemsByOrder(existing.id, device.tenantId!);
          return res.status(409).json({ message: "Duplicate order", order: { ...existing, items: existingItems } });
        }
      }

      const menuItemsList = await storage.getMenuItemsByTenant(device.tenantId!);
      const menuMap = new Map(menuItemsList.map(m => [m.id, m]));
      const availableItems = new Set(menuItemsList.filter(m => m.available !== false).map(m => m.id));

      let serverSubtotal = 0;
      const serverItems: { menuItemId: string; name: string; price: number; quantity: number; notes?: string }[] = [];
      for (const item of items) {
        if (!item.menuItemId || typeof item.menuItemId !== "string") continue;
        const mi = menuMap.get(item.menuItemId);
        if (!mi || !availableItems.has(mi.id)) continue;
        const canonicalPrice = Number(mi.price);
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        serverSubtotal += canonicalPrice * qty;
        serverItems.push({ menuItemId: mi.id, name: mi.name, price: canonicalPrice, quantity: qty, notes: typeof item.notes === "string" ? item.notes.slice(0, 200) : undefined });
      }
      if (serverItems.length === 0) return res.status(400).json({ message: "No valid items in order" });
      serverSubtotal = Math.round(serverSubtotal * 100) / 100;

      const tenant = await storage.getTenant(device.tenantId!);
      const taxRate = Number(tenant?.taxRate || 0) / 100;
      const serviceChargeRate = Number(tenant?.serviceCharge || 0) / 100;
      const afterDiscount = serverSubtotal;
      const serverServiceCharge = Math.round(afterDiscount * serviceChargeRate * 100) / 100;
      const serverTax = Math.round(afterDiscount * taxRate * 100) / 100;
      const serverTotal = Math.round((afterDiscount + serverServiceCharge + serverTax) * 100) / 100;
      const requestedServiceType = serviceType === "dine_in" ? "dine_in" : "takeaway";

      const order = await storage.createOrder({
        tenantId: device.tenantId!, outletId: device.outletId,
        orderType: requestedServiceType, channel: "kiosk",
        channelOrderId: clientOrderId || undefined, status: "pending_payment",
        subtotal: serverSubtotal.toFixed(2), discount: "0.00",
        tax: serverTax.toFixed(2), total: serverTotal.toFixed(2),
        paymentMethod: "razorpay", notes: `Kiosk order from ${device.name} (awaiting Razorpay payment)`,
      });

      for (const item of serverItems) {
        const mi = menuMap.get(item.menuItemId);
        const itemPrepMinutes = await snapshotPrepTime(item.menuItemId, mi?.prepTimeMinutes);
        await storage.createOrderItem({
          orderId: order.id, menuItemId: item.menuItemId, name: item.name,
          quantity: item.quantity, price: item.price.toFixed(2),
          station: mi?.station || null, course: mi?.course || null, notes: item.notes || null,
          itemPrepMinutes,
        });
      }

      const platformCreds = await getPlatformRazorpayCredentials();
      const keyId = tenant?.razorpayKeyId || platformCreds.keyId;
      const keySecret = tenant?.razorpayKeySecret || platformCreds.keySecret;

      const link = await createPaymentLink({
        amountRupees: serverTotal,
        currency: tenant?.currency || "AED",
        description: `Kiosk Order — ${device.name}`,
        billId: order.id,
        tenantKeyId: keyId,
        tenantKeySecret: keySecret,
      });

      res.json({ paymentLinkId: link.id, shortUrl: link.short_url, orderId: order.id, status: link.status });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/kiosk/razorpay-payment-status/:orderId", async (req, res) => {
    try {
      const token = req.headers["x-kiosk-token"] as string;
      if (!token) return res.status(401).json({ message: "Missing kiosk token" });
      const device = await storage.getKioskDeviceByToken(token);
      if (!device || !device.active) return res.status(401).json({ message: "Invalid or inactive kiosk device" });

      const { linkId } = req.query;
      if (!linkId) return res.status(400).json({ message: "linkId query param required" });

      const tenant = await storage.getTenant(device.tenantId!);

      const order = await storage.getOrder(req.params.orderId, device.tenantId!);
      if (!order) {
        return res.status(403).json({ message: "Order not found or access denied" });
      }

      const platformCreds = await getPlatformRazorpayCredentials();
      const keyId = (tenant as any)?.razorpayKeyId || platformCreds.keyId;
      const keySecret = (tenant as any)?.razorpayKeySecret || platformCreds.keySecret;

      const link = await getPaymentLink(linkId as string, keyId, keySecret);

      if (link.status === "paid") {
        await storage.updateOrder(req.params.orderId, device.tenantId!, { status: "completed", paymentMethod: "razorpay" });
        try {
          await deductRecipeInventoryForOrder(req.params.orderId, device.tenantId!, "kiosk");
        } catch (deductErr) {
          console.error(`[kiosk/razorpay] Inventory deduction failed for order ${req.params.orderId}:`, deductErr);
        }
        return res.json({ status: "paid", orderId: req.params.orderId });
      }
      return res.json({ status: link.status === "cancelled" || link.status === "expired" ? "cancelled" : "pending" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
