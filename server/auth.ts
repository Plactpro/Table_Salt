import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { pool } from "./db";
import connectPgSimple from "connect-pg-simple";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export interface PasswordPolicyConfig {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSpecialChar: boolean;
  preventReuseCount: number;
  expirationDays: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicyConfig = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecialChar: true,
  preventReuseCount: 5,
  expirationDays: 90,
};

export function validatePasswordPolicy(
  password: string,
  policy: Partial<PasswordPolicyConfig> = {}
): { valid: boolean; errors: string[] } {
  const p = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const errors: string[] = [];

  if (password.length < p.minLength) {
    errors.push(`Password must be at least ${p.minLength} characters`);
  }
  if (p.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (p.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (p.requireDigit && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one digit");
  }
  if (p.requireSpecialChar && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return { valid: errors.length === 0, errors };
}

export async function checkPasswordHistory(
  newPassword: string,
  history: string[] | null,
  preventReuseCount: number
): Promise<boolean> {
  if (!history || history.length === 0 || preventReuseCount === 0) return true;
  const recentHistory = history.slice(-preventReuseCount);
  for (const oldHash of recentHistory) {
    const match = await comparePasswords(newPassword, oldHash);
    if (match) return false;
  }
  return true;
}

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || "table-salt-secret-key-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) return done(null, false, { message: "Invalid credentials" });
        if (user.active === false) return done(null, false, { message: "Account is deactivated" });
        const valid = await comparePasswords(password, user.password);
        if (!valid) return done(null, false, { message: "Invalid credentials" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });
}

const _trialExpiryChecked = new Set<string>();

export function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const now = Date.now();
  const lastActivity = req.session?.lastActivity || now;
  const idleTimeoutMs = (req.session?.idleTimeoutMinutes || 30) * 60 * 1000;

  if (now - lastActivity > idleTimeoutMs) {
    req.logout(() => {
      req.session?.destroy(() => {});
    });
    return res.status(401).json({ message: "Session expired due to inactivity" });
  }

  req.session.lastActivity = now;

  const tenantId: string | undefined = req.user?.tenantId;
  if (tenantId && !_trialExpiryChecked.has(tenantId)) {
    _trialExpiryChecked.add(tenantId);
    import("./db").then(({ pool }) => {
      pool.query(
        `UPDATE tenants SET subscription_status = 'canceled', plan = 'basic' WHERE id = $1 AND subscription_status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < now()`,
        [tenantId]
      ).catch(() => {});
    }).catch(() => {});
    setTimeout(() => _trialExpiryChecked.delete(tenantId), 5 * 60 * 1000);
  }

  next();
}

export function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

export function requireSuperAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Super admin access required" });
  }
  next();
}