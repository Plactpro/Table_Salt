import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupSecurity } from "./security";
import { createServer } from "http";
import { incrementApiRequestCount } from "./api-counter";
import { checkApiRateAnomaly } from "./security-alerts";
import { discoverPriceIds } from "./stripe";
import { setupWebSocket } from "./realtime";
import { pool } from "./db";
import { routeContext } from "./lib/query-logger";

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("[CRITICAL] SESSION_SECRET env var is not set. Using insecure default — set it before deploying to AWS.");
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  process.exit(1);
});

const app = express();
const httpServer = createServer(app);

app.use(compression());

setupSecurity(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// stripe-replit-sync managed webhook — must be registered BEFORE express.json()
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).json({ error: "Missing stripe-signature" });
    const signature = Array.isArray(sig) ? sig[0] : sig;
    if (!Buffer.isBuffer(req.body)) {
      return res.status(500).json({ error: "Webhook body is not a Buffer" });
    }
    try {
      const { getStripeSync } = await import("./stripeClient");
      const sync = await getStripeSync();
      await sync.processWebhook(req.body as Buffer, signature);
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[Stripe] Managed webhook error:", err.message);
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

// Razorpay webhook — must be registered BEFORE express.json() to get raw body
app.post(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["x-razorpay-signature"];
    if (!sig || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Invalid request" });
    const rawBody = req.body.toString("utf8");
    const { verifyWebhookSignature } = await import("./razorpay");
    if (!verifyWebhookSignature(rawBody, Array.isArray(sig) ? sig[0] : sig)) {
      return res.status(400).json({ error: "Signature mismatch" });
    }
    try {
      const event = JSON.parse(rawBody);
      if (event.event === "payment_link.paid") {
        const pl = event.payload?.payment_link?.entity;
        const payment = event.payload?.payment?.entity;
        if (pl?.reference_id && payment?.id) {
          const { storage } = await import("./storage");
          const bill = await storage.getBill(pl.reference_id);
          // Idempotency: skip if already processed
          if (bill && bill.paymentStatus !== "paid") {
            // Derive method from Razorpay payload — never trust external input
            const rzpMethod = (payment.method as string | undefined)?.toLowerCase();
            const payMethod = rzpMethod === "card" ? "CARD" : rzpMethod === "upi" ? "UPI" : "RAZORPAY";
            const { finalizeBillCompletion } = await import("./routers/restaurant-billing");
            await finalizeBillCompletion({
              bill,
              paymentMethod: payMethod,
              paymentId: payment.id,
              linkId: pl.id,
              amountStr: pl.amount != null ? String(pl.amount / 100) : bill.totalAmount,
            });
          }
        }
      }
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[Razorpay webhook]", err.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Health check cache — 5-second TTL to prevent overloading the DB
let healthCache: { data: Record<string, unknown>; statusCode: number; expiresAt: number } | null = null;

// Health check — public, no auth, used by AWS ALB target group health checks and super admin dashboard
app.get("/api/health", async (_req: Request, res: Response) => {
  const now = Date.now();
  if (healthCache && healthCache.expiresAt > now) {
    return res.status(healthCache.statusCode).json(healthCache.data);
  }

  try {
    const dbStart = Date.now();
    await pool.query("SELECT 1");
    const dbResponseMs = Date.now() - dbStart;

    const poolTotal = pool.totalCount;
    const poolIdle = pool.idleCount;
    const poolUsed = poolTotal - poolIdle;
    const poolMax = 20; // matches pool config in db.ts

    const memUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    let tenantCount = 0;
    try {
      const { rows } = await pool.query(`SELECT COUNT(*) FROM tenants WHERE slug != 'platform'`);
      tenantCount = parseInt(rows[0]?.count || "0", 10);
    } catch {}

    // Count active WebSocket connections
    let activeWebsockets = 0;
    try {
      const { getWssClientCount } = await import("./realtime");
      activeWebsockets = getWssClientCount();
    } catch {}

    const poolUsedPct = poolMax > 0 ? poolUsed / poolMax : 0;
    let status: "ok" | "degraded" | "down" = "ok";
    if (dbResponseMs > 500 || poolUsedPct > 0.8) status = "degraded";

    const { circuitBreakerRegistry } = await import("./lib/circuit-breaker");
    const circuitBreakers: Record<string, string> = {};
    for (const [name, breaker] of circuitBreakerRegistry.getAll()) {
      circuitBreakers[name] = breaker.getState();
    }

    const data: Record<string, unknown> = {
      status,
      db_response_ms: dbResponseMs,
      db_pool_used: poolUsed,
      db_pool_max: poolMax,
      active_websockets: activeWebsockets,
      memory_used_mb: memUsed,
      uptime_seconds: Math.floor(process.uptime()),
      tenant_count: tenantCount,
      circuit_breakers: circuitBreakers,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
    };

    const httpStatus = status === "down" ? 503 : 200;
    healthCache = { data, statusCode: httpStatus, expiresAt: now + 5_000 };
    return res.status(httpStatus).json(data);
  } catch {
    const data = {
      status: "down",
      db_response_ms: null,
      db_pool_used: null,
      db_pool_max: 20,
      active_websockets: 0,
      memory_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      uptime_seconds: Math.floor(process.uptime()),
      tenant_count: 0,
      circuit_breakers: {},
      timestamp: new Date().toISOString(),
    };
    healthCache = { data, statusCode: 503, expiresAt: now + 5_000 };
    return res.status(503).json(data);
  }
});

// Rate anomaly detection — non-blocking sampler for authenticated GET requests
app.use((req, _res, next) => {
  const u = (req as any).user;
  if (u && req.method === "GET" && req.path.startsWith("/api")) {
    checkApiRateAnomaly(u.id, u.tenantId, u.name, req).catch(() => {});
  }
  next();
});

app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    routeContext.run({ route: `${req.method} ${req.path}` }, next);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  if (path.startsWith("/api")) {
    incrementApiRequestCount();
  }
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      if (process.env.NODE_ENV === "production") {
        console.log(JSON.stringify({
          level: res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO",
          ts: new Date().toISOString(),
          method: req.method,
          path,
          status: res.statusCode,
          durationMs: duration,
          tenantId: (req as any).user?.tenantId,
        }));
      } else {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        const sensitiveRoutes = ["/api/gdpr/export", "/api/gdpr/delete-account", "/api/gdpr/anonymize-account", "/api/auth/login", "/api/auth/register", "/api/security"];
        if (capturedJsonResponse && !sensitiveRoutes.some(r => path.startsWith(r))) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        log(logLine);
      }
    }
  });

  next();
});

// PR-011: Webhook "no orders" monitoring with false-positive prevention
function startWebhookMonitor() {
  const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  async function runWebhookCheck() {
    try {
      // Get all active order channels with last_webhook_at set
      const { rows: channels } = await pool.query(`
        SELECT oc.id, oc.name, oc.slug, oc.tenant_id,
               oc.last_webhook_at,
               COALESCE(oc.webhook_alert_threshold_minutes, 120) AS threshold_minutes
        FROM order_channels oc
        WHERE oc.active = true AND oc.last_webhook_at IS NOT NULL
      `);

      for (const ch of channels) {
        try {
          const thresholdMs = (ch.threshold_minutes || 120) * 60 * 1000;
          const lastWebhookAt = new Date(ch.last_webhook_at).getTime();
          const ageMs = Date.now() - lastWebhookAt;

          if (ageMs < thresholdMs) continue; // Within threshold — OK

          // Check if outlet is open using opening_hours text field (format: "HH:MM-HH:MM")
          // If opening_hours is null/unset we assume 24h operation (always open).
          // On any query error we err on the side of alerting (don't swallow the check).
          let outletOpen = true;
          try {
            const { rows: outletRows } = await pool.query(`
              SELECT opening_hours FROM outlets
              WHERE tenant_id = $1 AND opening_hours IS NOT NULL
              LIMIT 1
            `, [ch.tenant_id]);
            if (outletRows.length > 0 && outletRows[0].opening_hours) {
              const parts = (outletRows[0].opening_hours as string).split("-");
              if (parts.length === 2) {
                const [openH, openM] = (parts[0] || "").split(":").map(Number);
                const [closeH, closeM] = (parts[1] || "").split(":").map(Number);
                const now = new Date();
                const nowMins = now.getHours() * 60 + now.getMinutes();
                const openMins = (openH || 0) * 60 + (openM || 0);
                const closeMins = (closeH || 0) * 60 + (closeM || 0);
                // Handle overnight hours (e.g. 22:00-02:00)
                if (closeMins < openMins) {
                  outletOpen = nowMins >= openMins || nowMins < closeMins;
                } else {
                  outletOpen = nowMins >= openMins && nowMins < closeMins;
                }
              }
            }
          } catch (hoursErr) {
            console.warn(`[WebhookMonitor] Could not check outlet hours for tenant ${ch.tenant_id}:`, hoursErr);
            // If we can't check hours, skip alerting to avoid false positives
            outletOpen = false;
          }

          if (!outletOpen) continue; // Outlet not open — skip

          // False-positive prevention: verify the restaurant is currently operational (previous_hour_order_count > 0).
          // Since webhook-sourced orders stop when the integration is down, we check POS/walk-in orders
          // (channel = 'pos') as the proxy for "restaurant is operational" — POS always works independently.
          // Additionally verify the channel was historically active (last 24h) to exclude dormant integrations.
          const { rows: activeCheck } = await pool.query(`
            SELECT
              (SELECT COUNT(*) FROM orders WHERE tenant_id = $1 AND channel = 'pos' AND created_at > NOW() - INTERVAL '1 hour') AS pos_hour_count,
              (SELECT COUNT(*) FROM orders WHERE tenant_id = $1 AND channel = $2 AND created_at > NOW() - INTERVAL '24 hours') AS channel_day_count
          `, [ch.tenant_id, ch.slug]);

          const posHourCount = parseInt(activeCheck[0]?.pos_hour_count || "0", 10);
          const channelDayCount = parseInt(activeCheck[0]?.channel_day_count || "0", 10);

          // Skip if restaurant has no POS activity this hour (quiet period) OR channel was never active
          if (posHourCount === 0 || channelDayCount === 0) continue;

          // Fire in-app alert to managers
          await pool.query(`
            INSERT INTO alert_events (tenant_id, outlet_id, alert_code, severity, message, created_at)
            SELECT $1, o.id, 'WEBHOOK_NO_ORDERS', 'warning',
                   $2, NOW()
            FROM outlets o
            WHERE o.tenant_id = $1
            LIMIT 1
            ON CONFLICT DO NOTHING
          `, [
            ch.tenant_id,
            `No ${ch.name || ch.slug} orders received in ${Math.round(ageMs / 60000)} minutes — check your integration.`
          ]).catch(() => {}); // Non-fatal

          console.log(`[WebhookMonitor] Alert fired for channel '${ch.slug}' tenant ${ch.tenant_id}: ${Math.round(ageMs / 60000)} min since last webhook`);
        } catch (chErr) {
          console.error(`[WebhookMonitor] Error checking channel ${ch.id}:`, chErr);
        }
      }
    } catch (err) {
      console.error("[WebhookMonitor] Check failed:", err);
    }
  }

  setInterval(runWebhookCheck, CHECK_INTERVAL_MS);
  // Also run once after a 2-minute startup delay to let migrations complete
  setTimeout(runWebhookCheck, 2 * 60 * 1000);
  console.log("[WebhookMonitor] Started — checking every 30 minutes");
}

(async () => {
  try {
    const { runAdminMigrations } = await import("./admin-migrations");
    await runAdminMigrations();
  } catch (e) {
    console.error("Admin migrations error:", e);
  }

  try {
    const { runTask108Migrations } = await import("./admin-migrations");
    await runTask108Migrations();
  } catch (e) {
    console.error("Task 108 migrations error:", e);
  }

  try {
    const { runTask184Migrations } = await import("./admin-migrations");
    await runTask184Migrations();
  } catch (e) {
    console.error("Task 184 migrations error:", e);
  }

  try {
    const { runTask191Migrations } = await import("./admin-migrations");
    await runTask191Migrations();
  } catch (e) {
    console.error("Task 191 migrations error:", e);
  }

  try {
    const { seedDatabase } = await import("./seed");
    await seedDatabase();
  } catch (e) {
    console.error("Seed error:", e);
  }

  try {
    const { seedPricingData } = await import("./seed");
    await seedPricingData();
  } catch (e) {
    console.error("Pricing seed error:", e);
  }

  try {
    const { seedTimeTrackingData } = await import("./seed");
    await seedTimeTrackingData();
  } catch (e) {
    console.error("Time tracking seed error:", e);
  }

  try {
    const { seedTicketHistoryData } = await import("./seed");
    await seedTicketHistoryData();
  } catch (e) {
    console.error("Ticket history seed error:", e);
  }

  try {
    const { seedAlertDefinitions } = await import("./seed");
    await seedAlertDefinitions();
  } catch (e) {
    console.error("Alert definitions seed error:", e);
  }

  try {
    const { seedCrockeryItems } = await import("./seed");
    await seedCrockeryItems();
  } catch (e) {
    console.error("Crockery seed error:", e);
  }

  try {
    const { seedCashSessionData } = await import("./seed");
    await seedCashSessionData();
  } catch (e) {
    console.error("Cash session seed error:", e);
  }

  try {
    const { seedTipSettings } = await import("./seed");
    await seedTipSettings();
  } catch (e) {
    console.error("Tip settings seed error:", e);
  }

  try {
    const { seedPackingSettings } = await import("./seed");
    await seedPackingSettings();
  } catch (e) {
    console.error("Packing settings seed error:", e);
  }

  try {
    const { seedSpecialResources } = await import("./seed");
    await seedSpecialResources();
  } catch (e) {
    console.error("Special resources seed error:", e);
  }

  // Initialize Stripe schema (stripe-replit-sync manages the stripe.* tables)
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      await runMigrations({ databaseUrl, schema: "stripe" });
      log("Stripe schema ready", "stripe");
    }
  } catch (e: any) {
    console.warn("[Stripe] Schema migration skipped:", e.message);
  }

  // Set up managed webhook + backfill (non-fatal: price discovery runs independently)
  try {
    const { getStripeSync } = await import("./stripeClient");
    const stripeSync = await getStripeSync();
    const webhookBaseUrl = process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    log("Stripe managed webhook configured at /api/stripe/webhook", "stripe");

    stripeSync.syncBackfill().then(() => {
      log("Stripe data sync complete", "stripe");
    }).catch((err: any) => {
      console.warn("[Stripe] syncBackfill error:", err.message);
    });
  } catch (e: any) {
    console.warn("[Stripe] Managed webhook setup skipped:", e.message);
  }

  // Price ID discovery runs independently — checkout still works even if webhook setup failed
  await discoverPriceIds();

  await registerRoutes(httpServer, app);

  // PR-002: Audit Trail Hard-Protection startup assertion — runs AFTER routes are registered.
  // Verifies no DELETE/PUT/PATCH route exists for the security audit-log (/api/audit-log).
  // NOTE: /api/audits/* (cleaning/compliance audit templates) is a separate feature and is
  // intentionally excluded from this check — only the append-only audit_events trail is protected.
  const AUDIT_TRAIL_PATH_PREFIXES = ["/api/audit-log", "/api/audit-events"];
  const auditDeleteRoutes = (app as any)._router?.stack?.filter((layer: any) => {
    const path: string = layer?.route?.path ?? "";
    const isAuditTrail = AUDIT_TRAIL_PATH_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + "/"));
    return isAuditTrail && (layer?.route?.methods?.delete || layer?.route?.methods?.put || layer?.route?.methods?.patch);
  }) ?? [];
  if (auditDeleteRoutes.length > 0) {
    const offenders = auditDeleteRoutes.map((l: any) => `${Object.keys(l.route.methods).join(",").toUpperCase()} ${l.route.path}`);
    console.error("[STARTUP ASSERTION FAILED] Detected DELETE/UPDATE route(s) for audit trail endpoint — audit_events must be append-only:", offenders);
    process.exit(1);
  }

  try {
    const { startRetentionScheduler } = await import("./retention-cleanup");
    startRetentionScheduler();
  } catch (e) {
    console.error("Retention scheduler init error:", e);
  }

  try {
    const { startHealthLogger } = await import("./routers/compliance");
    startHealthLogger();
  } catch (e) {
    console.error("Health logger init error:", e);
  }

  try {
    const { startEscalationJob, cleanupExpiredQrSessions } = await import("./routers/table-requests");
    startEscalationJob();
    cleanupExpiredQrSessions();
  } catch (e) {
    console.error("Escalation job init error:", e);
  }

  try {
    const { startEscalationChecker } = await import("./services/chef-assignment");
    startEscalationChecker();
  } catch (e) {
    console.error("Chef assignment escalation checker init error:", e);
  }

  try {
    const { startStockReportScheduler } = await import("./services/stock-report-scheduler");
    startStockReportScheduler();
  } catch (e) {
    console.error("Stock report scheduler init error:", e);
  }

  try {
    const { startShiftDigestScheduler } = await import("./services/shift-digest-mailer");
    startShiftDigestScheduler();
  } catch (e) {
    console.error("Shift digest scheduler init error:", e);
  }

  try {
    const { startCoordinationRulesChecker } = await import("./services/coordination-rules");
    startCoordinationRulesChecker();
  } catch (e) {
    console.error("Coordination rules checker init error:", e);
  }

  try {
    const { startAdvanceOrderScheduler } = await import("./services/advance-order-scheduler");
    startAdvanceOrderScheduler();
  } catch (e) {
    console.error("Advance order scheduler init error:", e);
  }

  try {
    const { startWastageSummaryScheduler } = await import("./services/wastage-summary-scheduler");
    startWastageSummaryScheduler();
  } catch (e) {
    console.error("Wastage summary scheduler init error:", e);
  }

  try {
    const { startUnclockdInChecker } = await import("./services/alert-engine");
    startUnclockdInChecker();
  } catch (e) {
    console.error("Alert unclock-in checker init error:", e);
  }

  try {
    const { startTrialWarningScheduler } = await import("./services/trial-warning-mailer");
    startTrialWarningScheduler();
  } catch (e) {
    console.error("Trial warning scheduler init error:", e);
  }

  // PR-011: Webhook "no orders" monitoring — runs every 30 minutes during outlet hours
  try {
    startWebhookMonitor();
  } catch (e) {
    console.error("Webhook monitor init error:", e);
  }

  // PR-004: Start printer health monitors (ping + auto-retry) for all active outlets
  try {
    const { pool: monitorPool } = await import("./db");
    const { startPrinterMonitor } = await import("./services/printer-service");
    const { rows: outlets } = await monitorPool.query(
      `SELECT id, tenant_id FROM outlets WHERE active = true OR active IS NULL LIMIT 200`
    );
    for (const outlet of outlets) {
      startPrinterMonitor(outlet.tenant_id as string, outlet.id as string);
    }
    console.log(`[PrinterMonitor] Started monitors for ${outlets.length} outlets`);
  } catch (e) {
    console.error("[PrinterMonitor] Init error:", e);
  }

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (process.env.NODE_ENV === "production") {
      console.log(JSON.stringify({
        level: "ERROR",
        ts: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status,
        message,
        stack: err.stack,
        tenantId: (req as any).user?.tenantId,
      }));
    } else {
      console.error("Internal Server Error:", err);
    }

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  const wss = setupWebSocket(httpServer);

  const shutdown = async (signal: string) => {
    console.log(`[Shutdown] Received ${signal}, shutting down gracefully...`);
    httpServer.close(() => console.log('[Shutdown] HTTP server closed'));
    if (wss) wss.clients.forEach((client: any) => client.terminate());
    try { await pool.end(); } catch (_) {}
    console.log('[Shutdown] DB pool closed, exiting.');
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();
