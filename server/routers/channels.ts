import type { Express } from "express";
import { storage } from "../storage";
import { snapshotPrepTime } from "../lib/snapshot-prep-time";
import { requireRole } from "../middleware";
import { getAdapter } from "../aggregator-adapters";
import { pool } from "../db";
import { verifyAggregatorHmac } from "../lib/webhook-hmac";

export function registerChannelsRoutes(app: Express): void {
  app.get("/api/order-channels", requireRole("owner", "manager", "waiter", "kitchen", "accountant", "outlet_manager", "hq_admin", "franchise_owner"), async (req, res) => {
    try {
      const user = req.user as any;
      // PR-011: Include last_webhook_at and webhook_alert_threshold_minutes for channel health display
      const { rows } = await pool.query(
        `SELECT id, tenant_id, name, slug, icon, active, commission_pct,
                last_webhook_at, webhook_alert_threshold_minutes
         FROM order_channels WHERE tenant_id = $1 AND active = true ORDER BY name`,
        [user.tenantId]
      );
      res.json(rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        slug: r.slug,
        icon: r.icon,
        active: r.active,
        commissionPct: r.commission_pct,
        lastWebhookAt: r.last_webhook_at,
        webhookAlertThresholdMinutes: r.webhook_alert_threshold_minutes ?? 120,
      })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/order-channels", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const channel = await storage.createOrderChannel({ ...req.body, tenantId: user.tenantId });
      res.json(channel);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/order-channels/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.updateOrderChannel(req.params.id, user.tenantId, req.body));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/order-channels/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteOrderChannel(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/channel-configs", requireRole("owner", "manager", "waiter", "kitchen", "accountant", "outlet_manager", "hq_admin", "franchise_owner"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getChannelConfigsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/channel-configs", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.createChannelConfig({ ...req.body, tenantId: user.tenantId }));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/channel-configs/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.updateChannelConfig(req.params.id, user.tenantId, req.body));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/channel-configs/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteChannelConfig(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/online-menu-mappings", requireRole("owner", "manager", "waiter", "kitchen", "accountant", "outlet_manager", "hq_admin", "franchise_owner"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.getOnlineMenuMappingsByTenant(user.tenantId));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/online-menu-mappings", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.createOnlineMenuMapping({ ...req.body, tenantId: user.tenantId }));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/online-menu-mappings/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      res.json(await storage.updateOnlineMenuMapping(req.params.id, user.tenantId, req.body));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/online-menu-mappings/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteOnlineMenuMapping(req.params.id, user.tenantId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/aggregator/ingest", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { channel, channelOrderId, items, customerName, customerPhone, customerAddress, notes } = req.body;
      if (!channel || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "channel and items[] are required" });
      }
      const channels = await storage.getOrderChannelsByTenant(user.tenantId);
      const ch = channels.find(c => c.slug === channel);
      if (!ch) return res.status(400).json({ message: `Unknown channel: ${channel}` });
      // PR-011: Update last_webhook_at timestamp on order receipt via ingest
      await pool.query(
        `UPDATE order_channels SET last_webhook_at = NOW() WHERE id = $1`,
        [ch.id]
      ).catch((err: any) => console.error("[WebhookMonitor] Failed to update last_webhook_at:", err));

      const normalizedOrder = {
        channelOrderId: channelOrderId || `${channel.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        items: (items as Array<Record<string, unknown>>).map((i: Record<string, unknown>) => ({
          externalItemId: String(i.externalItemId || ""),
          menuItemId: String(i.menuItemId || ""),
          name: String(i.name || ""),
          quantity: Number(i.quantity || 1),
          price: String(i.price || "0"),
        })),
        customerName: customerName || "",
        customerPhone: customerPhone || "",
        customerAddress: customerAddress || "",
        notes: notes || "",
      };
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItems.map(m => [m.id, m]));
      const mappings = await storage.getOnlineMenuMappingsByTenant(user.tenantId);
      const externalToMenuId = new Map(mappings.filter(m => m.channelId === ch.id).map(m => [m.externalItemId, m.menuItemId]));
      let subtotal = 0;
      const orderItemsData: Array<{ menuItemId: string | null; name: string; quantity: number; price: string; station: string | null; course: string | null; itemPrepMinutes: number | null }> = [];
      for (const item of normalizedOrder.items) {
        let menuItemId: string | undefined = item.menuItemId;
        if (!menuItemId && item.externalItemId) menuItemId = externalToMenuId.get(item.externalItemId);
        const mi = menuItemId ? menuMap.get(menuItemId) : undefined;
        if (menuItemId && !mi) menuItemId = undefined;
        const price = item.price || (mi ? mi.price : "0");
        subtotal += parseFloat(price) * item.quantity;
        const itemPrepMinutes = await snapshotPrepTime(menuItemId, mi?.prepTimeMinutes);
        orderItemsData.push({ menuItemId: menuItemId || null, name: item.name || mi?.name || "Unknown Item", quantity: item.quantity, price, station: mi?.station || null, course: mi?.course || null, itemPrepMinutes });
      }
      const tenant = await storage.getTenant(user.tenantId);
      const taxRate = parseFloat(tenant?.taxRate || "0");
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;
      const order = await storage.createOrder({
        tenantId: user.tenantId, outletId: outlets[0]?.id || null, orderType: "delivery", status: "new",
        subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2),
        channel: ch.slug, channelOrderId: normalizedOrder.channelOrderId,
        channelData: { customerName: normalizedOrder.customerName, customerPhone: normalizedOrder.customerPhone, customerAddress: normalizedOrder.customerAddress } as Record<string, unknown>,
        notes: normalizedOrder.notes || null,
      });
      for (const oi of orderItemsData) {
        await storage.createOrderItem({ orderId: order.id, menuItemId: oi.menuItemId, name: oi.name, quantity: oi.quantity, price: oi.price, station: oi.station, course: oi.course, itemPrepMinutes: oi.itemPrepMinutes });
      }
      res.json(order);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/aggregator/webhook/:platform", async (req, res) => {
    try {
    // HMAC signature verification + webhook logging
    const platform = req.params.platform;
    const sig = (
      req.headers["x-talabat-signature"] ??
      req.headers["x-zomato-signature"] ??
      req.headers["x-hub-signature-256"] ?? ""
    ) as string;
    const payload = req.body;

    // Log webhook receipt
    pool.query(
      `INSERT INTO webhook_events
       (platform, external_order_id, payload, status)
       VALUES ($1, $2, $3::jsonb, 'received')`,
      [
        platform,
        String(payload?.order_id ?? payload?.order?.id ?? ""),
        JSON.stringify(payload)
      ]
    ).catch(() => {});

      const adapter = getAdapter(platform);
      if (!adapter) return res.status(400).json({ message: `No adapter for platform: ${platform}` });
      // Public endpoint: resolve tenant from channel slug
      const { rows: chRows } = await pool.query(
        `SELECT oc.id, oc.webhook_secret,
                cc.tenant_id as config_tenant_id,
                cc.outlet_id as config_outlet_id
         FROM order_channels oc
         JOIN channel_configs cc ON cc.channel_id = oc.id
         WHERE oc.slug = $1 AND oc.active = true LIMIT 1`,
        [platform]
      );
      const ch = (chRows[0] as any);
      if (!ch) return res.status(400).json({ message: `Channel ${platform} not configured` });

      // F-189 fix: Validate HMAC signature against per-channel webhook_secret
      const channelSecret: string | null = ch.webhook_secret;
      if (!channelSecret) {
        return res.status(403).json({ message: "Webhook secret not configured for this channel — rejecting request" });
      }
      const bodyForHmac = JSON.stringify(payload);
      if (!verifyAggregatorHmac(bodyForHmac, sig, channelSecret)) {
        return res.status(401).json({ message: "Invalid webhook signature" });
      }

      const resolvedTenantId = ch.config_tenant_id;
      // PR-011: Update last_webhook_at timestamp on webhook receipt
      await pool.query(
        `UPDATE order_channels SET last_webhook_at = NOW() WHERE id = $1`,
        [ch.id]
      ).catch((err: any) => console.error("[WebhookMonitor] Failed to update last_webhook_at:", err));
      const parsed = adapter.parseOrder(req.body);
      const menuItems = await storage.getMenuItemsByTenant(resolvedTenantId);
      const menuMap = new Map(menuItems.map(m => [m.id, m]));
      const mappings = await storage.getOnlineMenuMappingsByTenant(resolvedTenantId);
      const externalToMenuId = new Map(mappings.filter(m => m.channelId === ch.id).map(m => [m.externalItemId, m.menuItemId]));
      let subtotal = 0;
      const orderItemsData: Array<{ menuItemId: string | null; name: string; quantity: number; price: string; station: string | null; course: string | null; itemPrepMinutes: number | null }> = [];
      for (const item of parsed.items) {
        let menuItemId: string | undefined = item.menuItemId;
        if (!menuItemId && item.externalItemId) menuItemId = externalToMenuId.get(item.externalItemId);
        const mi = menuItemId ? menuMap.get(menuItemId) : undefined;
        if (menuItemId && !mi) menuItemId = undefined;
        const price = item.price || (mi ? mi.price : "0");
        subtotal += parseFloat(price) * item.quantity;
        const itemPrepMinutes = await snapshotPrepTime(menuItemId, mi?.prepTimeMinutes);
        orderItemsData.push({ menuItemId: menuItemId || null, name: item.name || mi?.name || "Unknown", quantity: item.quantity, price, station: mi?.station || null, course: mi?.course || null, itemPrepMinutes });
      }
      const tenant = await storage.getTenant(resolvedTenantId);
      const taxRate = parseFloat(tenant?.taxRate || "0");
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;
      const outlets = await storage.getOutletsByTenant(resolvedTenantId);
      const order = await storage.createOrder({
        tenantId: resolvedTenantId, outletId: outlets[0]?.id || null, orderType: "delivery", status: "new",
        subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2),
        channel: platform, channelOrderId: parsed.channelOrderId,
        channelData: { customerName: parsed.customerName, customerPhone: parsed.customerPhone, customerAddress: parsed.customerAddress } as Record<string, unknown>,
        notes: parsed.notes || null,
      });
      for (const oi of orderItemsData) {
        await storage.createOrderItem({ orderId: order.id, menuItemId: oi.menuItemId, name: oi.name, quantity: oi.quantity, price: oi.price, station: oi.station, course: oi.course, itemPrepMinutes: oi.itemPrepMinutes });
      }
      res.json(order);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/aggregator/simulate/:platform", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const platform = req.params.platform;
      const adapter = getAdapter(platform);
      if (!adapter) return res.status(400).json({ message: `No adapter for platform: ${platform}` });
      const channels = await storage.getOrderChannelsByTenant(user.tenantId);
      const ch = channels.find(c => c.slug === platform);
      if (!ch) return res.status(400).json({ message: `Channel ${platform} not configured` });
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      if (menuItems.length === 0) return res.status(400).json({ message: "No menu items available" });
      const mockOrder = adapter.generateMockOrder(menuItems.map(m => ({ id: m.id, name: m.name, price: m.price })));
      const menuMap = new Map(menuItems.map(m => [m.id, m]));
      let subtotal = 0;
      const orderItemsData: Array<{ menuItemId: string; name: string; quantity: number; price: string; station: string | null; course: string | null; itemPrepMinutes: number | null }> = [];
      for (const item of mockOrder.items) {
        const mi = item.menuItemId ? menuMap.get(item.menuItemId) : undefined;
        subtotal += parseFloat(item.price) * item.quantity;
        const itemPrepMinutes = await snapshotPrepTime(item.menuItemId, mi?.prepTimeMinutes);
        orderItemsData.push({ menuItemId: item.menuItemId || "", name: item.name, quantity: item.quantity, price: item.price, station: mi?.station || null, course: mi?.course || null, itemPrepMinutes });
      }
      const tenant = await storage.getTenant(user.tenantId);
      const taxRate = parseFloat(tenant?.taxRate || "0");
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const order = await storage.createOrder({
        tenantId: user.tenantId, outletId: outlets[0]?.id || null, orderType: "delivery", status: "new",
        subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2),
        channel: platform, channelOrderId: mockOrder.channelOrderId,
        channelData: { customerName: mockOrder.customerName, customerPhone: mockOrder.customerPhone, customerAddress: mockOrder.customerAddress } as Record<string, unknown>,
        notes: mockOrder.notes || null,
      });
      for (const oi of orderItemsData) {
        await storage.createOrderItem({ orderId: order.id, menuItemId: oi.menuItemId, name: oi.name, quantity: oi.quantity, price: oi.price, station: oi.station, course: oi.course, itemPrepMinutes: oi.itemPrepMinutes });
      }
      res.json({ order, simulatedPayload: mockOrder });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
