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
    // Cookie migration: users with legacy connect.sid (pre PA-1 rename) can still authenticate
    // This copies the old cookie value to ts.sid so express-session can find the session
    // Safe to remove after 30 days from deployment
    (req: any, _res: any, next: any) => {
      if (req.cookies?.["connect.sid"] && !req.cookies?.["ts.sid"]) {
        req.cookies["ts.sid"] = req.cookies["connect.sid"];
      }
      next();
    },
    session({
      store: new PgSession({
        pool,
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 15,
        ttl: 30 * 24 * 60 * 60,
      }),
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: false,
      name: "ts.sid",
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
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
      if (user) {
        // PR-009: Attach tenant subscription grace status to the user object at deserialization.
        // Grace eligibility = subscription expired within 24h AND (open orders OR active shift exists).
        // This satisfies the spec: "a subscription that expires while there are open orders or an
        // active shift NEVER immediately locks out the system."
        try {
          const { rows } = await pool.query(
            `SELECT subscription_status, trial_ends_at, subscription_expires_at FROM tenants WHERE id = $1 LIMIT 1`,
            [user.tenantId]
          );
          if (rows[0]) {
            const t = rows[0];
            // PR-009: Use timestamp-first approach — trialing status may lag actual expiry.
            // Grace = expired within 24h (by timestamp) AND operational activity present.
            const expiresAt = t.subscription_expires_at
              ? new Date(t.subscription_expires_at)
              : t.trial_ends_at ? new Date(t.trial_ends_at) : null;
            const msSince = expiresAt ? Date.now() - expiresAt.getTime() : -1;
            // Include trialing with expired timestamp (status lags the scheduled update)
            const GRACE_MS = 24 * 60 * 60 * 1000;
            const inTimeWindow = msSince > 0 && msSince <= GRACE_MS;
            if (inTimeWindow) {
              // Check for open orders or active shift (operational continuity condition per spec)
              const { rows: openOrders } = await pool.query(
                `SELECT 1 FROM orders WHERE tenant_id = $1 AND status NOT IN ('completed','cancelled','paid','voided') LIMIT 1`,
                [user.tenantId]
              );
              const { rows: activeShifts } = await pool.query(
                `SELECT 1 FROM shifts WHERE tenant_id = $1 AND ended_at IS NULL LIMIT 1`,
                [user.tenantId]
              ).catch(() => ({ rows: [] }));
              const hasOperationalActivity = openOrders.length > 0 || activeShifts.length > 0;
              (user as any)._subscriptionWarning = hasOperationalActivity ? "expired_grace" : null;
            } else {
              (user as any)._subscriptionWarning = null;
            }
          }
        } catch (_ignored) {
          (user as any)._subscriptionWarning = null;
        }
      }
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
    // Only promote trialing → canceled after the full 24-hour grace window has passed.
    pool.query(
      `UPDATE tenants SET subscription_status = 'canceled', plan = 'basic' WHERE id = $1 AND subscription_status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < now() - INTERVAL '24 hours'`,
      [tenantId]
    ).catch(() => {});
  }

  // PR-009: Subscription grace warning — inject subscriptionWarning field into every
  // authenticated JSON response body AND set the response header.
  // The field is set synchronously from data attached at deserialization time.
  if (req.user?._subscriptionWarning) {
    const warning = req.user._subscriptionWarning as string;
    res.setHeader("X-Subscription-Warning", warning);
    // Intercept res.json to inject the subscriptionWarning field
    const origJson = res.json.bind(res);
    res.json = (body: any) => {
      if (body !== null && typeof body === "object" && !Array.isArray(body)) {
        return origJson({ ...body, subscriptionWarning: warning });
      }
      return origJson(body);
    };
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

/** PR-009: Throttle map so account_sharing_alert fires at most once per user per 5 minutes. */
const sessionAlertThrottle = new Map<string, number>();
const SESSION_ALERT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * PR-001 / PR-009: Concurrent session detection middleware.
 * Only applied to sensitive routes (payments, voids, refunds, role changes, settings, admin).
 * PR-009: On token mismatch, fires an account_sharing_alert notification (throttled) and continues.
 *         Alert-only — does not block either session (spec: "do not forcibly kick out either session").
 */
export async function requireFreshSession(req: any, res: any, next: any): Promise<void> {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  try {
    const sessionToken = (req.session as Record<string, unknown>).sessionToken as string | undefined;
    // If no session token stored (legacy session), allow through — best effort for pre-PR-001 sessions
    if (!sessionToken) return next();

    const { rows } = await pool.query(
      `SELECT session_token, name FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    const dbToken = rows[0]?.session_token;
    if (dbToken && sessionToken !== dbToken) {
      // PR-009: Fire throttled alert to manager/owner channels — at most once per user per 5 min.
      // Account sharing is surfaced to management without interrupting the user's flow.
      const alertKey = `${req.user.tenantId}:${req.user.id}`;
      const lastAlerted = sessionAlertThrottle.get(alertKey) ?? 0;
      if (Date.now() - lastAlerted > SESSION_ALERT_COOLDOWN_MS) {
        sessionAlertThrottle.set(alertKey, Date.now());
        setImmediate(async () => {
          try {
            const staffName = rows[0]?.name || req.user.name || "Unknown";
            const deviceInfo = (req.headers["user-agent"] ?? "Unknown device").slice(0, 100);
            // PR-009: Persistent alert via alert engine (durable bell/alert-center entry).
            const { alertEngine } = await import("./services/alert-engine");
            await alertEngine.trigger("ALERT-13", {
              tenantId: req.user.tenantId,
              message: `Account sharing detected: ${staffName} logged in from another session. Device: ${deviceInfo}`,
            }).catch(() => {});
          } catch (_ignored) {}
        });
      }
      // Allow request to continue — alert-only behavior per PR-009
    }
    return next();
  } catch (err) {
    // Fail closed on verification errors to protect sensitive routes
    console.error("[requireFreshSession] Token verification error — failing closed:", err);
    return res.status(500).json({ message: "Session verification failed. Please log in again." });
  }
}
