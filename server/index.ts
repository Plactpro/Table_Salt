import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupSecurity } from "./security";
import { createServer } from "http";
import { incrementApiRequestCount } from "./api-counter";
import { discoverPriceIds } from "./stripe";
import { setupWebSocket } from "./realtime";
import compression from "compression";
import { pool } from "./db";

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
app.use(compression());

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
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      const sensitiveRoutes = ["/api/gdpr/export", "/api/gdpr/delete-account", "/api/gdpr/anonymize-account", "/api/auth/login", "/api/auth/register", "/api/security"];
      if (capturedJsonResponse && !sensitiveRoutes.some(r => path.startsWith(r))) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

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
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
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

  try {
    const { startRetentionScheduler } = await import("./retention-cleanup");
    startRetentionScheduler();
  } catch (e) {
    console.error("Retention scheduler init error:", e);
  }

  try {
    const { startEscalationJob } = await import("./routers/table-requests");
    startEscalationJob();
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

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

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
