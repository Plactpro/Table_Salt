import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomBytes } from "crypto";
import type { Express, Request, Response, NextFunction } from "express";

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function setupSecurity(app: Express) {
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
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

  const authLimiter = rateLimit({
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
    const session = req.session as Record<string, unknown>;
    if (!session.csrfToken) {
      session.csrfToken = generateCsrfToken();
    }

    res.cookie(CSRF_COOKIE, session.csrfToken as string, {
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
      url === "/api/errors/client"
    ) {
      return next();
    }

    const headerToken = req.headers[CSRF_HEADER] as string | undefined;
    if (!headerToken || headerToken !== session.csrfToken) {
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
