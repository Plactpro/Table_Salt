import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { pool } from "./db";
import connectPgSimple from "connect-pg-simple";

interface LockoutEntry {
  count: number;
  firstAttemptAt: number;
}
const loginFailureMap = new Map<string, LockoutEntry>();
const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export function recordFailedLogin(username: string): boolean {
  const key = username.trim().toLowerCase();
  const now = Date.now();
  const entry = loginFailureMap.get(key);
  if (!entry || now - entry.firstAttemptAt > LOCKOUT_WINDOW_MS) {
    loginFailureMap.set(key, { count: 1, firstAttemptAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count >= LOCKOUT_MAX_ATTEMPTS;
}

export function isAccountLocked(username: string): boolean {
  const key = username.trim().toLowerCase();
  const now = Date.now();
  const entry = loginFailureMap.get(key);
  if (!entry) return false;
  if (now - entry.firstAttemptAt > LOCKOUT_WINDOW_MS) {
    loginFailureMap.delete(key);
    return false;
  }
  return entry.count >= LOCKOUT_MAX_ATTEMPTS;
}

export function clearLoginFailures(username: string): void {
  loginFailureMap.delete(username.trim().toLowerCase());
}

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
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        if (isAccountLocked(username)) {
          return done(null, false, { message: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes." });
        }
        const user = await storage.getUserByUsername(username);
        if (!user) {
          recordFailedLogin(username);
          return done(null, false, { message: "Invalid credentials" });
        }
        if (user.active === false) return done(null, false, { message: "Account is deactivated" });
        const valid = await comparePasswords(password, user.password);
        if (!valid) {
          const locked = recordFailedLogin(username);
          if (locked) {
            return done(null, false, { message: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes." });
          }
          return done(null, false, { message: "Invalid credentials" });
        }
        clearLoginFailures(username);
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

  const userId: string | undefined = req.user?.id;
  if (userId && req.sessionID) {
    const ip = req.ip || req.headers["x-forwarded-for"] || null;
    const ua = req.headers["user-agent"] || null;
    pool.query(
      `UPDATE session SET user_id = $1, ip_address = $2, user_agent = $3, last_active = now() WHERE sid = $4`,
      [userId, ip, ua, req.sessionID]
    ).catch(() => {});
  }

  const tenantId: string | undefined = req.user?.tenantId;
  if (tenantId) {
    import("./db").then(({ pool }) => {
      pool.query(
        `UPDATE tenants SET subscription_status = 'canceled', plan = 'basic' WHERE id = $1 AND subscription_status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < now()`,
        [tenantId]
      ).catch(() => {});
    }).catch(() => {});
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