import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupSecurity } from "./security";
import { createServer } from "http";
import { incrementApiRequestCount } from "./api-counter";
import { discoverPriceIds } from "./stripe";

const app = express();
const httpServer = createServer(app);

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
    const { seedDatabase } = await import("./seed");
    await seedDatabase();
  } catch (e) {
    console.error("Seed error:", e);
  }

  // Initialize Stripe: run schema migrations, set up managed webhook, sync data, discover price IDs
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      await runMigrations({ databaseUrl, schema: "stripe" });
      log("Stripe schema ready", "stripe");

      const { getStripeSync } = await import("./stripeClient");
      const stripeSync = await getStripeSync();

      const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
      log("Stripe managed webhook configured", "stripe");

      stripeSync.syncBackfill().then(() => {
        log("Stripe data sync complete", "stripe");
      }).catch((err: any) => {
        console.warn("[Stripe] syncBackfill error:", err.message);
      });

      await discoverPriceIds();
    }
  } catch (e: any) {
    console.warn("[Stripe] Init skipped:", e.message);
  }

  await registerRoutes(httpServer, app);

  try {
    const { startRetentionScheduler } = await import("./retention-cleanup");
    startRetentionScheduler();
  } catch (e) {
    console.error("Retention scheduler init error:", e);
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
})();
