import type { Express } from "express";
import passport from "passport";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { randomBytes, createHash } from "crypto";
import { storage } from "../storage";
import { db, pool } from "../db";
import { eq } from "drizzle-orm";
import { requireAuth, hashPassword, comparePasswords, validatePasswordPolicy, checkPasswordHistory, DEFAULT_PASSWORD_POLICY } from "../auth";
import { sendWelcomeEmail } from "../services/email-service";
import { users } from "@shared/schema";
import { auditLog, auditLogFromReq } from "../audit";
import { checkFailedLoginAlert, checkNewIpLoginAlert, alertPasswordChanged, alert2FADisabled } from "../security-alerts";
import { trialEndsAtDate, isStripeConfigured, getUncachableStripeClient } from "../stripe";

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { restaurantName, name, username, password, email, phone } = req.body;
      if (!restaurantName || !name || !username || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (!email) {
        return res.status(400).json({ message: "Email address is required" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email address" });
      }

      const { rows: [regSetting] } = await pool.query(
        `SELECT registration_open FROM platform_settings WHERE id = 'singleton' LIMIT 1`
      );
      if (regSetting?.registration_open === false) {
        return res.status(403).json({ message: "Self-registration is currently disabled. Contact us to get started." });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const emailHash = createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
      const { rows: [emailCheck] } = await pool.query(
        `SELECT 1 FROM users WHERE email_hash = $1 LIMIT 1`,
        [emailHash]
      );
      if (emailCheck) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
      const trialEnd = trialEndsAtDate();
      const tenant = await storage.createTenant({ name: restaurantName, slug, plan: "standard", subscriptionStatus: "trialing", trialEndsAt: trialEnd });

      if (await isStripeConfigured()) {
        try {
          const stripeClient = await getUncachableStripeClient();
          const customer = await stripeClient.customers.create({
            name: restaurantName,
            metadata: { tenantId: tenant.id },
          });
          await storage.updateTenant(tenant.id, { stripeCustomerId: customer.id });
        } catch (stripeErr) {
          console.error("Stripe customer creation failed (non-fatal):", stripeErr);
        }
      }

      await storage.createOutlet({ tenantId: tenant.id, name: "Main Branch" });
      const hashedPw = await hashPassword(password);
      const user = await storage.createUser({
        tenantId: tenant.id,
        username,
        password: hashedPw,
        name,
        role: "owner",
        email: email || null,
        phone: phone || null,
      });
      if (email) {
        try {
          await pool.query(`UPDATE users SET email_hash = $1 WHERE id = $2`, [emailHash, user.id]);
        } catch (hashErr) {
          console.warn("Could not set email_hash (non-fatal):", hashErr);
        }
        sendWelcomeEmail(email, name, restaurantName).catch(() => {});
      }
      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed" });
        const { password: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        auditLog({ tenantId: null, action: "login_failed", entityType: "user", entityName: req.body.username, metadata: { username: req.body.username }, req });
        checkFailedLoginAlert(req.body.username, req);
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      if (user.totpEnabled && !req.body.totpCode) {
        return res.status(200).json({ requires2FA: true, userId: user.id });
      }

      if (user.totpEnabled && req.body.totpCode) {
        const totp = new TOTP({ secret: user.totpSecret, algorithm: "SHA1", digits: 6, period: 30 });
        const valid = totp.validate({ token: req.body.totpCode, window: 1 }) !== null;

        if (!valid) {
          const codes = user.recoveryCodes || [];
          const codeIdx = codes.indexOf(req.body.totpCode);
          if (codeIdx === -1) {
            auditLog({ tenantId: user.tenantId, action: "login_failed", entityType: "user", entityName: req.body.username, metadata: { username: req.body.username, reason: "invalid_2fa" }, req });
            return res.status(401).json({ message: "Invalid 2FA code" });
          }
          codes.splice(codeIdx, 1);
          try {
            await db.update(users).set({ recoveryCodes: codes }).where(eq(users.id, user.id));
          } catch {
            return res.status(500).json({ message: "Failed to consume recovery code" });
          }
        }
      }

      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        const tenant = await storage.getTenant(user.tenantId);
        const mc = (tenant?.moduleConfig || {}) as Record<string, any>;
        const sessionData = req.session as Record<string, unknown>;
        sessionData.lastActivity = Date.now();
        sessionData.idleTimeoutMinutes = Number(mc.idleTimeoutMinutes ?? 30);

        const maxSessions = Number(mc.maxConcurrentSessions ?? 5);
        try {
          const result = await pool.query(
            `SELECT COUNT(*) AS cnt FROM "session" WHERE sess->>'passport' LIKE $1`,
            [`%"user":"${user.id}"%`]
          );
          const activeSessions = parseInt(result.rows[0]?.cnt || "0", 10);
          if (activeSessions > maxSessions) {
            await pool.query(
              `DELETE FROM "session" WHERE sid != $1 AND sess->>'passport' LIKE $2 ORDER BY expire ASC LIMIT $3`,
              [req.sessionID, `%"user":"${user.id}"%`, activeSessions - maxSessions]
            );
          }
        } catch (_) { /* concurrent session cleanup best-effort */ }

        auditLog({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "login", entityType: "user", entityId: user.id, entityName: user.name, req });
        checkNewIpLoginAlert(user.id, user.tenantId, user.name, req);
        const { password: _, totpSecret: _ts, recoveryCodes: _rc, passwordHistory: _ph, ...safeUser } = user;
        const redirectTo = (user.role as string) === "super_admin" ? "/admin" : undefined;
        return res.json({ ...safeUser, onboardingCompleted: tenant?.onboardingCompleted ?? false, ...(redirectTo ? { redirectTo } : {}) });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    const u = req.user as Record<string, unknown> | undefined;
    if (u) {
      auditLog({ tenantId: String(u.tenantId), userId: String(u.id), userName: String(u.name), action: "logout", entityType: "user", entityId: String(u.id), req });
    }
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { password: _, totpSecret: _ts, recoveryCodes: _rc, passwordHistory: _ph, ...safeUser } = req.user as any;
    const tenant = await storage.getTenant(safeUser.tenantId);
    const { rows: [userRow] } = await pool.query(`SELECT theme_preference FROM users WHERE id = $1`, [safeUser.id]);
    res.json({ ...safeUser, themePreference: userRow?.theme_preference ?? "system", tenant: tenant ? { id: tenant.id, name: tenant.name, plan: tenant.plan, businessType: tenant.businessType, currency: tenant.currency, timezone: tenant.timezone, timeFormat: tenant.timeFormat, currencyPosition: tenant.currencyPosition, currencyDecimals: tenant.currencyDecimals, taxRate: tenant.taxRate, taxType: tenant.taxType, compoundTax: tenant.compoundTax, serviceCharge: tenant.serviceCharge, onboardingCompleted: tenant.onboardingCompleted, subscriptionStatus: tenant.subscriptionStatus, trialEndsAt: tenant.trialEndsAt, stripeCustomerId: tenant.stripeCustomerId, stripeSubscriptionId: tenant.stripeSubscriptionId, gstin: tenant.gstin, cgstRate: tenant.cgstRate, sgstRate: tenant.sgstRate, invoicePrefix: tenant.invoicePrefix, razorpayEnabled: tenant.razorpayEnabled, razorpayKeyId: tenant.razorpayKeyId } : null });
  });

  app.patch("/api/users/preferences", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { themePreference } = req.body;
      if (themePreference && !["light", "dark", "system"].includes(themePreference)) {
        return res.status(400).json({ message: "Invalid theme preference. Must be light, dark, or system." });
      }
      if (themePreference !== undefined) {
        await pool.query(`UPDATE users SET theme_preference = $1 WHERE id = $2`, [themePreference, user.id]);
      }
      res.json({ message: "Preferences updated", themePreference });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/2fa/setup", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.totpEnabled) return res.status(400).json({ message: "2FA is already enabled" });
      const secret = new Secret();
      const totp = new TOTP({ issuer: "Table Salt", label: user.username, secret, algorithm: "SHA1", digits: 6, period: 30 });
      const uri = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(uri);
      await db.update(users).set({ totpSecret: secret.base32 }).where(eq(users.id, user.id));
      res.json({ qrCodeUrl: qrDataUrl, secret: secret.base32, uri });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/2fa/verify", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "Verification code is required" });
      const freshUser = await storage.getUser(user.id);
      if (!freshUser || !freshUser.totpSecret) return res.status(400).json({ message: "2FA setup not started" });
      const totp = new TOTP({ secret: freshUser.totpSecret, algorithm: "SHA1", digits: 6, period: 30 });
      const valid = totp.validate({ token: code, window: 1 }) !== null;
      if (!valid) return res.status(400).json({ message: "Invalid verification code" });
      const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(4).toString("hex"));
      await db.update(users).set({ totpEnabled: true, recoveryCodes }).where(eq(users.id, user.id));
      auditLogFromReq(req, { action: "2fa_enabled", entityType: "user", entityId: user.id, entityName: user.name });
      res.json({ recoveryCodes, message: "2FA has been enabled" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/2fa/disable", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { password: currentPassword } = req.body;
      if (!currentPassword) return res.status(400).json({ message: "Current password is required" });
      const freshUser = await storage.getUser(user.id);
      if (!freshUser) return res.status(404).json({ message: "User not found" });
      const valid = await comparePasswords(currentPassword, freshUser.password);
      if (!valid) return res.status(401).json({ message: "Invalid password" });
      await db.update(users).set({ totpEnabled: false, totpSecret: null, recoveryCodes: null }).where(eq(users.id, user.id));
      auditLogFromReq(req, { action: "2fa_disabled", entityType: "user", entityId: user.id, entityName: user.name });
      alert2FADisabled(user.id, user.tenantId, user.name, req);
      res.json({ message: "2FA has been disabled" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ message: "Current and new passwords are required" });
      const freshUser = await storage.getUser(user.id);
      if (!freshUser) return res.status(404).json({ message: "User not found" });
      const valid = await comparePasswords(currentPassword, freshUser.password);
      if (!valid) return res.status(401).json({ message: "Current password is incorrect" });
      const sameAsOld = await comparePasswords(newPassword, freshUser.password);
      if (sameAsOld) return res.status(400).json({ message: "New password must be different from current password" });
      const tenant = await storage.getTenant(user.tenantId);
      const mc = (tenant?.moduleConfig || {}) as Record<string, any>;
      const policy = mc.passwordPolicy || {};
      const validation = validatePasswordPolicy(newPassword, policy);
      if (!validation.valid) return res.status(400).json({ message: validation.errors.join(". ") });
      const canUse = await checkPasswordHistory(newPassword, freshUser.passwordHistory, policy.preventReuseCount ?? 5);
      if (!canUse) return res.status(400).json({ message: "Cannot reuse a recent password" });
      const newHash = await hashPassword(newPassword);
      const history = [...(freshUser.passwordHistory || []), freshUser.password].slice(-10);
      await db.update(users).set({ password: newHash, passwordChangedAt: new Date(), passwordHistory: history }).where(eq(users.id, user.id));
      auditLogFromReq(req, { action: "password_changed", entityType: "user", entityId: user.id, entityName: user.name });
      alertPasswordChanged(user.id, user.tenantId, user.name, req);
      res.json({ message: "Password changed successfully" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/auth/password-policy", requireAuth, async (req, res) => {
    const user = req.user as any;
    const tenant = await storage.getTenant(user.tenantId);
    const mc = (tenant?.moduleConfig || {}) as Record<string, any>;
    res.json({ ...DEFAULT_PASSWORD_POLICY, ...mc.passwordPolicy });
  });
}
