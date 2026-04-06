import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createHmac } from "crypto";
import type { Express, Request, Response, NextFunction } from "express";

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

function computeCsrfToken(sessionId: string): string {
  const secret = process.env.SESSION_SECRET || "table-salt-secret-key-change-in-prod";
  return createHmac("sha256", secret).update(sessionId).digest("hex");
}

/**
 * PR-001: Content Security Policy configuration.
 *
 * Rollout approach:
 *   Phase 1 (report-only): CSP was verified in report-only mode during development, observing
 *     violations via browser console/devtools to identify all required external sources.
 *   Phase 2 (enforcing): Once all violations were resolved, reportOnly was set to false.
 *     The current directives cover all runtime source requirements (React, Vite, Stripe, Razorpay).
 *
 * To revert to report-only for debugging violations, set reportOnly: true below.
 *
 * Allowed sources:
 *   default-src:     'self'
 *   script-src:      'self' 'unsafe-inline' 'unsafe-eval' (required for React/Vite)
 *   style-src:       'self' 'unsafe-inline' (required for shadcn/ui inline styles)
 *   font-src:        'self' data: https://fonts.gstatic.com
 *   img-src:         'self' data: blob: https: (for user uploaded images and CDN assets)
 *   connect-src:     'self' wss: https://api.stripe.com https://api.razorpay.com
 *   frame-src:       'self' https://js.stripe.com https://hooks.stripe.com https://api.razorpay.com https://checkout.razorpay.com
 *   worker-src:      'self' blob:
 *   object-src:      'none'
 *   base-uri:        'self'
 *   form-action:     'self'
 *   frame-ancestors: 'none' (prevents clickjacking)
 */
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "blob:", "https:"],
  connectSrc: ["'self'", "wss:", "https://api.stripe.com", "https://api.razorpay.com"],
  frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "https://api.razorpay.com", "https://checkout.razorpay.com"],
  workerSrc: ["'self'", "blob:"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

export async function setupSecurity(app: Express) {
  app.set("trust proxy", 1);

  // PR-001: CSP rollout — Phase 1 (report-only) was validated in development; Phase 2 (enforcing)
  // is now active by default. Set CSP_REPORT_ONLY=true env var to revert to report-only for debugging.
  const cspReportOnly = process.env.CSP_REPORT_ONLY === "true";
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: CSP_DIRECTIVES,
        reportOnly: cspReportOnly,
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    helmet.hsts({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    })
  );

  app.use(
    helmet.referrerPolicy({
      policy: "strict-origin-when-cross-origin",
    })
  );

  app.use(
    helmet.permittedCrossDomainPolicies({
      permittedPolicies: "none",
    })
  );

  const isTest = process.env.NODE_ENV === "test";

  // Redis store for rate limiting — shared across all Node.js processes/instances.
  // Falls back to in-memory store if REDIS_URL is not set (single-process dev/staging).
  let redisStore: RedisStore | undefined;
  if (process.env.REDIS_URL) {
    try {
      const { default: Redis } = await import("ioredis");
      const redisClient = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      redisClient.on("error", (err: Error) =>
        console.warn("[rate-limit] Redis error — falling back to in-memory:", err.message)
      );
      await redisClient.connect().catch(() => {});
      redisStore = new RedisStore({
        sendCommand: (...args: string[]) => redisClient.call(...args) as any,
      });
      console.log("[rate-limit] Using Redis store for rate limiters");
    } catch (err: any) {
      console.warn("[rate-limit] Could not connect to Redis, using in-memory store:", err.message);
    }
  }

  const authLimiter = rateLimit({
    store: redisStore,
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many login attempts. Please try again after 15 minutes." },
    keyGenerator: (req: Request) => {
      return req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    },
    skip: () => isTest,
    validate: { default: true, keyGeneratorIpFallback: false },
  });

  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);

  const apiLimiter = rateLimit({
    store: redisStore,
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many requests. Please slow down." },
    keyGenerator: (req: Request) => {
      const user = req.user as Record<string, unknown> | undefined;
      if (user?.id) return `user-${user.id}`;
      return req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    },
    skip: (req: Request) => {
      if (isTest) return true;
      const p = req.originalUrl || req.path;
      if (p === "/api/auth/login" || p === "/api/auth/register") return true;
      return false;
    },
    validate: { default: true, keyGeneratorIpFallback: false },
  });

  app.use("/api/", apiLimiter);

  const uploadLimiter = rateLimit({
    store: redisStore,
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many uploads. Please try again in a minute." },
    keyGenerator: (req: Request) => {
      const user = req.user as Record<string, unknown> | undefined;
      if (user?.id) return `upload-${user.id}`;
      return req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    },
    validate: { default: true, keyGeneratorIpFallback: false },
  });

  app.use("/api/upload", uploadLimiter);

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
    next();
  });
}

export function setupCsrf(app: Express) {
  app.use("/api/", (req: Request, res: Response, next: NextFunction) => {
    const token = computeCsrfToken(req.sessionID);

    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    const method = req.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return next();
    }

    const url = req.originalUrl || req.path;
    if (
      url === "/api/auth/login" ||
      url === "/api/auth/register" ||
      url === "/api/auth/forgot-password" ||
      url === "/api/auth/reset-password" ||
      url === "/api/webhooks/stripe" ||
      url.startsWith("/api/guest/") ||
      url.startsWith("/api/kiosk/") ||
      url === "/api/table-requests" ||
      url === "/api/errors/client" ||
      url === "/api/ad-impressions"
    ) {
      return next();
    }

    const headerToken = req.headers[CSRF_HEADER] as string | undefined;
    if (!headerToken || headerToken !== token) {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }

    next();
  });
}

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isValidIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every(p => { const n = Number(p); return Number.isInteger(n) && n >= 0 && n <= 255; });
}

export function isValidCidr(cidr: string): boolean {
  const [ip, prefixStr] = cidr.split("/");
  if (!isValidIpv4(ip)) return false;
  if (prefixStr !== undefined) {
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  }
  return true;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    if (!isValidCidr(cidr)) return false;
    const [cidrIp, prefixStr] = cidr.split("/");
    const prefix = prefixStr ? parseInt(prefixStr) : 32;
    const ipLong = ipToLong(ip);
    const cidrLong = ipToLong(cidrIp);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipLong & mask) === (cidrLong & mask);
  } catch {
    return false;
  }
}

function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }
  if (ip === "::1") {
    return "127.0.0.1";
  }
  return ip;
}

function getClientIp(req: Request): string {
  const raw = req.ip || req.socket?.remoteAddress || "0.0.0.0";
  return normalizeIp(raw);
}

const PRIVILEGED_ROLES = new Set(["owner", "hq_admin", "franchise_owner", "manager", "accountant"]);
const SUPER_ADMIN_ROLE = "super_admin";
const PUBLIC_PATHS = ["/api/auth/", "/api/guest/", "/api/kiosk/", "/api/health", "/api/qr/"];

export function setupIpAllowlistMiddleware(app: Express) {
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const url = req.originalUrl || req.path;
    if (!url.startsWith("/api/")) return next();
    if (PUBLIC_PATHS.some(p => url.startsWith(p))) return next();

    const user = req.user as { tenantId?: string; role?: string } | undefined;
    if (!user?.tenantId) return next();
    if (user.role === SUPER_ADMIN_ROLE) return next();
    if (!PRIVILEGED_ROLES.has(user.role || "")) return next();

    try {
      const { storage } = await import("./storage");
      const tenant = await storage.getTenant(user.tenantId);
      if (!tenant) return next();
      const mc = (tenant.moduleConfig || {}) as Record<string, unknown>;
      if (!mc.ipAllowlistEnabled) return next();

      const clientIp = getClientIp(req);
      const userRole = user.role || "";

      const roleRules = mc.ipAllowlistRoles as Record<string, string[]> | undefined;
      if (roleRules && roleRules[userRole] && roleRules[userRole].length > 0) {
        const allowed = roleRules[userRole].some(cidr => isIpInCidr(clientIp, cidr));
        if (!allowed) {
          return res.status(403).json({ message: "Access denied: IP not in allowlist for your role" });
        }
        return next();
      }

      const allowlist = mc.ipAllowlist as string[] | undefined;
      if (!allowlist || allowlist.length === 0) return next();

      const allowed = allowlist.some(cidr => isIpInCidr(clientIp, cidr));
      if (!allowed) {
        return res.status(403).json({ message: "Access denied: IP not in allowlist" });
      }
      return next();
    } catch (err) {
      console.error("[ip-allowlist] Error evaluating allowlist, denying access:", err);
      return res.status(403).json({ message: "Access denied: IP allowlist evaluation failed" });
    }
  });
}
