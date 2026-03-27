import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { isStripeConfigured, getUncachableStripeClient, STRIPE_PRICE_IDS, planFromPriceId } from "../stripe";
import { deductRecipeInventoryForOrder } from "../lib/deduct-recipe-inventory";
import { returnResourcesFromTable } from "../services/resource-service";
import { pool } from "../db";

export function registerBillingRoutes(app: Express): void {
  app.get("/api/onboarding/status", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.getTenant(user.tenantId);
    res.json({ completed: tenant?.onboardingCompleted ?? false });
  });

  app.patch("/api/onboarding/profile", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { businessType, cuisineStyle, phone } = req.body;
    const tenant = await storage.updateTenant(user.tenantId, {
      ...(businessType !== undefined && { businessType }),
      ...(cuisineStyle !== undefined && { cuisineStyle }),
      ...(phone !== undefined && { phone }),
    });
    res.json(tenant);
  });

  app.patch("/api/onboarding/location", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { address, country, timezone } = req.body;
    const tenant = await storage.updateTenant(user.tenantId, {
      ...(address !== undefined && { address }),
      ...(country !== undefined && { country }),
      ...(timezone !== undefined && { timezone }),
    });
    res.json(tenant);
  });

  app.patch("/api/onboarding/config", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { currency, taxRate, serviceCharge } = req.body;
    const tenant = await storage.updateTenant(user.tenantId, {
      ...(currency !== undefined && { currency }),
      ...(taxRate !== undefined && { taxRate }),
      ...(serviceCharge !== undefined && { serviceCharge }),
    });
    res.json(tenant);
  });

  app.patch("/api/onboarding/outlet", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { name, address } = req.body;
    const outlets = await storage.getOutletsByTenant(user.tenantId);
    if (!outlets.length) return res.status(404).json({ message: "No outlet found" });
    const outlet = await storage.updateOutlet(outlets[0].id, user.tenantId, {
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
    });
    res.json(outlet);
  });

  app.post("/api/onboarding/complete", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.updateTenant(user.tenantId, { onboardingCompleted: true });
    res.json({ completed: true, tenant });
  });

  async function checkTrialExpiry(tenantId: string) {
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) return;
    if (tenant.subscriptionStatus === "trialing" && tenant.trialEndsAt && new Date(tenant.trialEndsAt) < new Date()) {
      await storage.updateTenant(tenantId, { subscriptionStatus: "trial_expired" });
    }
  }

  /**
   * PR-009: Compute subscription grace period status, timestamp-first with operational gating.
   * Grace = expired within 24h AND (open orders OR active shift) — consistent with requireAuth.
   */
  async function getGraceStatus(
    tenant: { subscriptionStatus?: string | null; trialEndsAt?: string | null; subscriptionExpiresAt?: string | null },
    tenantId: string
  ): Promise<"active" | "expired_grace" | "expired"> {
    const expiresAt = tenant.subscriptionExpiresAt
      ? new Date(tenant.subscriptionExpiresAt as string)
      : tenant.trialEndsAt ? new Date(tenant.trialEndsAt as string) : null;

    if (!expiresAt) {
      // No expiry timestamp — unlimited trial or active subscription
      const status = tenant.subscriptionStatus ?? "trialing";
      return (status === "active" || status === "trialing") ? "active" : "expired";
    }

    const msSinceExpiry = Date.now() - expiresAt.getTime();
    if (msSinceExpiry <= 0) return "active"; // Not yet expired
    if (msSinceExpiry > 24 * 60 * 60 * 1000) return "expired"; // Past grace window

    // Within 24h grace window — check operational activity (consistent with requireAuth)
    try {
      const { rows: openOrders } = await pool.query(
        `SELECT 1 FROM orders WHERE tenant_id = $1 AND status NOT IN ('completed','cancelled','paid','voided') LIMIT 1`,
        [tenantId]
      );
      const { rows: activeShifts } = await pool.query(
        `SELECT 1 FROM shifts WHERE tenant_id = $1 AND ended_at IS NULL LIMIT 1`,
        [tenantId]
      ).catch(() => ({ rows: [] }));
      const hasActivity = openOrders.length > 0 || activeShifts.length > 0;
      return hasActivity ? "expired_grace" : "expired";
    } catch {
      // On DB error, grant grace conservatively to avoid disrupting live service
      return "expired_grace";
    }
  }

  app.get("/api/billing/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      await checkTrialExpiry(user.tenantId);
      const tenant = await storage.getTenant(user.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const trialEnd = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
      const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0;
      const graceStatus = await getGraceStatus(tenant, user.tenantId);
      res.json({
        plan: tenant.plan,
        subscriptionStatus: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
        trialDaysLeft: daysLeft,
        stripeCustomerId: tenant.stripeCustomerId,
        stripeConfigured: await isStripeConfigured(),
        graceStatus,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/billing/create-checkout-session", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!["owner", "franchise_owner", "hq_admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied. Billing changes require Owner role." });
      }
      if (!await isStripeConfigured()) {
        return res.status(503).json({ message: "Stripe is not configured." });
      }
      const { plan } = req.body as { plan: string };
      if (!plan || !["basic", "standard", "premium"].includes(plan)) {
        return res.status(400).json({ message: "Invalid plan. Must be basic, standard, or premium." });
      }
      const priceId = STRIPE_PRICE_IDS[plan];
      if (!priceId) {
        return res.status(503).json({ message: `Stripe price ID for plan '${plan}' is not configured.` });
      }
      const tenant = await storage.getTenant(user.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const stripeClient = await getUncachableStripeClient();
      const origin = `${req.protocol}://${req.get("host")}`;
      const session = await stripeClient.checkout.sessions.create({
        mode: "subscription",
        customer: tenant.stripeCustomerId ?? undefined,
        customer_creation: tenant.stripeCustomerId ? undefined : "always",
        ...(tenant.stripeCustomerId ? {} : { customer_data: { metadata: { tenantId: tenant.id } } }),
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { tenantId: tenant.id, plan },
        success_url: `${origin}/settings?tab=subscription&upgraded=1`,
        cancel_url: `${origin}/settings?tab=subscription`,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      // PR-011: Distinguish gateway outages from application errors
      const isGatewayErr = err?.type?.startsWith("Stripe") || err?.statusCode >= 500 ||
        /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(err?.message || "");
      if (isGatewayErr) {
        pool.query(
          `INSERT INTO system_events (event_type, name, message, created_at) VALUES ($1, $2, $3, NOW())`,
          ["GATEWAY_FAILURE", "stripe", `Stripe gateway failure during create-checkout-session: ${err.message}`]
        ).catch(() => {});
        return res.status(503).json({ code: "GATEWAY_DOWN", message: "Payment system is temporarily unavailable. Please try again shortly." });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/billing/portal", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!["owner", "franchise_owner", "hq_admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied. Billing portal requires Owner role." });
      }
      if (!await isStripeConfigured()) {
        return res.status(503).json({ message: "Stripe is not configured." });
      }
      const tenant = await storage.getTenant(user.tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!tenant.stripeCustomerId) {
        return res.status(400).json({ message: "No Stripe customer found. Please upgrade first." });
      }
      const stripeClient = await getUncachableStripeClient();
      const origin = `${req.protocol}://${req.get("host")}`;
      try {
        const session = await stripeClient.billingPortal.sessions.create({
          customer: tenant.stripeCustomerId,
          return_url: `${origin}/settings?tab=subscription`,
        });
        res.json({ url: session.url });
      } catch (stripeErr: any) {
        const isGatewayDown = stripeErr?.type === "StripeConnectionError" || stripeErr?.type === "StripeAPIError" || stripeErr?.code === "ECONNREFUSED";
        if (isGatewayDown) {
          pool.query(
            `INSERT INTO system_events (event_type, name, message, created_at) VALUES ($1, $2, $3, NOW())`,
            ["GATEWAY_FAILURE", "stripe", `Stripe gateway failure during billing-portal: ${stripeErr.message}`]
          ).catch(() => {});
          return res.status(503).json({ code: "GATEWAY_DOWN", message: "Payment system is temporarily unavailable. Please try again shortly." });
        }
        res.status(500).json({ message: stripeErr.message });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/webhooks/stripe", async (req, res) => {
    if (!await isStripeConfigured()) {
      return res.status(503).json({ message: "Stripe not configured" });
    }
    const rawSig = req.headers["stripe-signature"];
    const sig = Array.isArray(rawSig) ? rawSig[0] : rawSig;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !webhookSecret) {
      return res.status(400).json({ message: "Missing signature or webhook secret" });
    }
    const stripeClient = await getUncachableStripeClient();
    let event: import("stripe").Stripe.Event;
    try {
      const rawBody = (req as any).rawBody as Buffer;
      event = stripeClient.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("Stripe webhook signature verification failed:", err.message);
      return res.status(400).json({ message: `Webhook error: ${err.message}` });
    }

    try {
      async function resolveTenantByCustomer(customerId: string): Promise<string | null> {
        const sc = await getUncachableStripeClient();
        const customer = await sc.customers.retrieve(customerId);
        if (customer.deleted) return null;
        const metaTenantId = (customer as import("stripe").Stripe.Customer).metadata?.tenantId;
        if (metaTenantId) return metaTenantId;
        const tenant = await storage.getTenantByStripeCustomerId(customerId);
        return tenant?.id ?? null;
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as import("stripe").Stripe.Checkout.Session;
          if (session.metadata?.orderPayment === "true") {
            const orderId = session.metadata?.orderId;
            if (orderId) {
              const orderToUpdate = await storage.getOrderById(orderId);
              if (orderToUpdate && orderToUpdate.status !== "paid") {
                await storage.updateOrder(orderId, { status: "paid", paymentMethod: "card" });
                if (orderToUpdate.tableId) {
                  try { await storage.updateTable(orderToUpdate.tableId, orderToUpdate.tenantId, { status: "free" }); } catch (_) {}
                  returnResourcesFromTable(orderToUpdate.tableId, orderToUpdate.tenantId, false).catch(() => {});
                }
                if (orderToUpdate.channel === "kiosk") {
                  try {
                    await deductRecipeInventoryForOrder(orderId, orderToUpdate.tenantId, "kiosk");
                  } catch (deductErr) {
                    console.error(`[billing/stripe] Inventory deduction failed for order ${orderId}:`, deductErr);
                  }
                }
              }
            } else if (session.metadata?.guestPayment === "true" && session.metadata?.sessionId) {
              const guestSession = await storage.getTableSession(session.metadata.sessionId);
              if (guestSession) {
                const allOrders = await storage.getOrdersByTenant(guestSession.tenantId);
                const unpaidTableOrders = allOrders.filter(o =>
                  o.tableId === guestSession.tableId &&
                  o.status !== "cancelled" &&
                  o.status !== "voided" &&
                  o.status !== "paid"
                );
                for (const order of unpaidTableOrders) {
                  await storage.updateOrder(order.id, { status: "paid", paymentMethod: "card" });
                }
                try { await storage.updateTable(guestSession.tableId, guestSession.tenantId, { status: "free" }); } catch (_) {}
                returnResourcesFromTable(guestSession.tableId, guestSession.tenantId, false).catch(() => {});
                try { await storage.updateTableSession(guestSession.id, { status: "closed", closedAt: new Date() }); } catch (_) {}
              }
            }
            break;
          }
          const tenantId = session.metadata?.tenantId ?? null;
          const plan = session.metadata?.plan ?? "basic";
          const newCustomerId = session.customer && typeof session.customer === "string" ? session.customer : null;
          if (tenantId) {
            await storage.updateTenant(tenantId, {
              plan,
              stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
              subscriptionStatus: "active",
              ...(newCustomerId ? { stripeCustomerId: newCustomerId } : {}),
            });
            if (newCustomerId) {
              try {
                const sc2 = await getUncachableStripeClient();
                await sc2.customers.update(newCustomerId, { metadata: { tenantId } });
              } catch (metaErr: any) {
                console.warn("Failed to set tenantId metadata on Stripe customer:", metaErr.message);
              }
            }
          }
          break;
        }
        case "customer.subscription.updated": {
          const sub = event.data.object as import("stripe").Stripe.Subscription;
          const tenantId = await resolveTenantByCustomer(sub.customer as string);
          if (tenantId) {
            const priceId = sub.items.data[0]?.price?.id;
            const plan = priceId ? planFromPriceId(priceId) : "basic";
            const statusMap: Record<string, string> = {
              active: "active",
              past_due: "past_due",
              canceled: "canceled",
              unpaid: "past_due",
              paused: "paused",
              incomplete: "trialing",
              incomplete_expired: "canceled",
              trialing: "trialing",
            };
            await storage.updateTenant(tenantId, {
              plan,
              subscriptionStatus: statusMap[sub.status] ?? sub.status,
            });
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as import("stripe").Stripe.Subscription;
          const tenantId = await resolveTenantByCustomer(sub.customer as string);
          if (tenantId) {
            await storage.updateTenant(tenantId, {
              plan: "basic",
              subscriptionStatus: "canceled",
              stripeSubscriptionId: null,
            });
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as import("stripe").Stripe.Invoice;
          const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
          if (customerId) {
            const tenantId = await resolveTenantByCustomer(customerId);
            if (tenantId) {
              await storage.updateTenant(tenantId, { subscriptionStatus: "past_due" });
            }
          }
          break;
        }
        default:
          break;
      }
    } catch (processErr: any) {
      console.error("Stripe webhook processing error:", processErr);
      return res.status(500).json({ message: "Webhook processing failed", error: processErr?.message });
    }

    res.json({ received: true });
  });
}
