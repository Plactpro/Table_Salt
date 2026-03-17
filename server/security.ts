import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";

export function setupSecurity(app: Express) {
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
  });

  app.use("/api/upload", uploadLimiter);

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
    next();
  });
}
