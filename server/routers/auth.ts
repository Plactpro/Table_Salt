import type { Express } from "express";
import passport from "passport";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import { db, pool } from "../db";
import { eq } from "drizzle-orm";
import { requireAuth, requireFreshSession, hashPassword, comparePasswords, validatePasswordPolicy, checkPasswordHistory, DEFAULT_PASSWORD_POLICY, isAccountLocked, recordFailedLogin, clearLoginFailures } from "../auth";
import { sendWelcomeEmail } from "../services/email-service";
import { users } from "@shared/schema";
import { auditLog, auditLogFromReq } from "../audit";
import { checkFailedLoginAlert, checkNewIpLoginAlert, alertPasswordChanged, alert2FADisabled, checkMultiAccountSameIp, checkCrossAccountFailedLogins } from "../security-alerts";
import { trialEndsAtDate, isStripeConfigured, getUncachableStripeClient } from "../stripe";
import { sendPasswordResetEmail } from "../email";
import { isWeakPin, pinValidationError } from "@shared/pin-utils";

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { restaurantName, name, username, password, email, phone, tosAccepted } = req.body;
      if (!restaurantName || !name || !username || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (tosAccepted !== true) {
        return res.status(400).json({ message: "You must accept the Terms of Service to create an account" });
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
      // Log ToS and Privacy Policy consent
      try {
        const { rows: [platformSettings] } = await pool.query(
          `SELECT tos_version, privacy_version FROM platform_settings WHERE id = 'singleton' LIMIT 1`
        );
        const tosVersion = platformSettings?.tos_version || "2026-01";
        const privacyVersion = platformSettings?.privacy_version || "2026-01";
        const ip = (req.headers["x-forwarded-for"] as string || req.ip || "").split(",")[0].trim();
        const userAgent = (req.headers["user-agent"] || "").slice(0, 500);
        await pool.query(
          `INSERT INTO consent_log (user_id, tenant_id, document_type, document_version, accepted_at, ip_address, user_agent)
           VALUES ($1, $2, 'tos', $3, NOW(), $4, $5)`,
          [user.id, tenant.id, tosVersion, ip, userAgent]
        );
        await pool.query(
          `INSERT INTO consent_log (user_id, tenant_id, document_type, document_version, accepted_at, ip_address, user_agent)
           VALUES ($1, $2, 'privacy_policy', $3, NOW(), $4, $5)`,
          [user.id, tenant.id, privacyVersion, ip, userAgent]
        );
      } catch (consentErr) {
        console.warn("Consent log insert failed (non-fatal):", consentErr);
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
        const msg = info?.message || "Invalid credentials";
        const isLockout = msg.includes("locked");
        auditLog({ tenantId: null, action: "login_failed", entityType: "user", entityName: req.body.username, metadata: { username: req.body.username }, req });
        checkFailedLoginAlert(req.body.username, req);
        const failedLoginIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || "unknown";
        checkCrossAccountFailedLogins(failedLoginIp, "platform").catch(() => {});
        return res.status(isLockout ? 423 : 401).json({ message: msg });
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

      // PR-009: Subscription grace period enforcement at login time.
      // Policy (timestamp-based, not status-based — status may lag actual expiry):
      //   - Active/trialing with expiry in future: no restriction.
      //   - Expired within last 24h (grace window): all logins allowed, warning header set.
      //   - Expired >24h ago (past grace): non-owner NEW logins are blocked.
      //   - Owners/admins always allowed so they can renew the subscription.
      const ownerRoles = ["owner", "franchise_owner", "hq_admin", "super_admin"];
      if (!ownerRoles.includes(user.role)) {
        try {
          const { rows: tenantRows } = await pool.query(
            `SELECT subscription_status, trial_ends_at, subscription_expires_at FROM tenants WHERE id = $1 LIMIT 1`,
            [user.tenantId]
          );
          const t = tenantRows[0];
          if (t) {
            const GRACE_MS = 24 * 60 * 60 * 1000;
            // Determine expiry timestamp (prefer subscription_expires_at, fall back to trial_ends_at)
            const expiresAt = t.subscription_expires_at
              ? new Date(t.subscription_expires_at)
              : t.trial_ends_at ? new Date(t.trial_ends_at) : null;

            if (expiresAt) {
              const msSinceExpiry = Date.now() - expiresAt.getTime();
              // Strictly timestamp-driven — ignore subscription_status which may lag due to
              // webhook delays or status update scheduling. Timestamps are authoritative.
              if (msSinceExpiry > GRACE_MS) {
                // Past 24h grace — block new non-owner logins regardless of status
                return res.status(402).json({
                  code: "SUBSCRIPTION_EXPIRED",
                  message: "Subscription has expired. Please contact the account owner to renew.",
                });
              } else if (msSinceExpiry > 0) {
                // Within 24h grace window — allow, warn
                res.setHeader("X-Subscription-Warning", "expired_grace");
              }
              // msSinceExpiry <= 0 = not yet expired — no restriction
            }
          }
        } catch (graceErr) {
          console.error("[Auth] Grace period check failed (non-fatal):", graceErr);
        }
      }

      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        const tenant = await storage.getTenant(user.tenantId);
        const mc = (tenant?.moduleConfig || {}) as Record<string, any>;
        const sessionData = req.session as Record<string, unknown>;
        sessionData.lastActivity = Date.now();
        sessionData.idleTimeoutMinutes = Number(mc.idleTimeoutMinutes ?? 30);

        // PR-009: Account sharing detection — check for live concurrent sessions.
        // We verify there is an actual active session in the session table for this user
        // (not just a stale session_token left over from a previous logout).
        // Alert fires only when a genuinely concurrent session is detected.
        try {
          const { rows: liveSessions } = await pool.query(
            `SELECT COUNT(*) AS cnt FROM "session" WHERE sess->>'passport' LIKE $1 AND expire > now()`,
            [`%"user":"${user.id}"%`]
          );
          const liveCount = parseInt(liveSessions[0]?.cnt || "0", 10);
          if (liveCount > 0) {
            // Another session for this user is currently active — fire alert (non-blocking)
            const deviceInfo = `${req.headers["user-agent"]?.slice(0, 100) || "Unknown device"} — IP: ${(req.headers["x-forwarded-for"] as string || req.ip || "unknown").split(",")[0].trim()}`;
            setImmediate(async () => {
              try {
                const safeDevice = deviceInfo.split(" — IP:")[0].trim().slice(0, 100);
                // PR-009: Persistent alert via alert engine (durable bell/alert-center entry).
                // ALERT-13 target_roles = manager/owner/franchise_owner/hq_admin/super_admin.
                const { alertEngine } = await import("../services/alert-engine");
                await alertEngine.trigger("ALERT-13", {
                  tenantId: user.tenantId,
                  referenceId: user.id,
                  message: `Account sharing detected: ${user.name || user.username} logged in from another session. Device: ${safeDevice}`,
                }).catch(() => {});
              } catch (_) {}
            });
          }
        } catch (_) { /* non-fatal */ }

        // PR-001: Generate and store session token for concurrent session detection
        const newSessionToken = randomBytes(18).toString("hex");
        sessionData.sessionToken = newSessionToken;
        await pool.query(`UPDATE users SET session_token = $1 WHERE id = $2`, [newSessionToken, user.id]).catch(() => {});

        const maxSessions = Number(mc.maxConcurrentSessions ?? 5);
        try {
          const result = await pool.query(
            `SELECT COUNT(*) AS cnt FROM "session" WHERE sess->>'passport' LIKE $1`,
            [`%"user":"${user.id}"%`]
          );
          const activeSessions = parseInt(result.rows[0]?.cnt || "0", 10);
          if (activeSessions > maxSessions) {
            await pool.query(
              `DELETE FROM "session" WHERE sid IN (SELECT sid FROM "session" WHERE sid != $1 AND sess->>'passport' LIKE $2 ORDER BY expire ASC LIMIT $3)`,
              [req.sessionID, `%"user":"${user.id}"%`, activeSessions - maxSessions]
            );
          }
        } catch (_) { /* concurrent session cleanup best-effort */ }

        pool.query(
          `UPDATE session SET user_id = $1, ip_address = $2, user_agent = $3, last_active = now() WHERE sid = $4`,
          [user.id, req.ip || null, req.headers["user-agent"] || null, req.sessionID]
        ).catch(() => {});

        auditLog({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "login", entityType: "user", entityId: user.id, entityName: user.name, req });
        checkNewIpLoginAlert(user.id, user.tenantId, user.name, req);
        const loginIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.socket?.remoteAddress || req.ip || "unknown";
        checkMultiAccountSameIp(loginIp, user.tenantId).catch(() => {});
        checkCrossAccountFailedLogins(loginIp, user.tenantId).catch(() => {});
        const { password: _, totpSecret: _ts, recoveryCodes: _rc, passwordHistory: _ph, ...safeUser } = user;
        const redirectTo = (user.role as string) === "super_admin" ? "/admin" : undefined;

        // Consent version check
        let requiresConsentUpdate = false;
        const outdatedDocuments: string[] = [];
        try {
          const { rows: [platformSettings] } = await pool.query(
            `SELECT tos_version, privacy_version FROM platform_settings WHERE id = 'singleton' LIMIT 1`
          );
          if (platformSettings && user.role !== "super_admin") {
            const { rows: consentRows } = await pool.query(
              `SELECT DISTINCT ON (document_type) document_type, document_version, accepted_at
               FROM consent_log WHERE user_id = $1 ORDER BY document_type, accepted_at DESC`,
              [user.id]
            );
            const tosConsent = consentRows.find(r => r.document_type === "tos");
            const privacyConsent = consentRows.find(r => r.document_type === "privacy_policy");
            if (!tosConsent || tosConsent.document_version !== platformSettings.tos_version) {
              outdatedDocuments.push("tos");
              requiresConsentUpdate = true;
            }
            if (!privacyConsent || privacyConsent.document_version !== platformSettings.privacy_version) {
              outdatedDocuments.push("privacy_policy");
              requiresConsentUpdate = true;
            }
          }
        } catch (_) { /* consent check non-fatal */ }

        return res.json({
          ...safeUser,
          onboardingCompleted: tenant?.onboardingCompleted ?? false,
          ...(redirectTo ? { redirectTo } : {}),
          ...(requiresConsentUpdate ? { requiresConsentUpdate: true, consentDocuments: outdatedDocuments } : {}),
        });
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
    const { rows: [userRow] } = await pool.query(
      `SELECT theme_preference, processing_restricted, restriction_requested_at, restriction_reason FROM users WHERE id = $1`,
      [safeUser.id]
    );
    res.json({
      ...safeUser,
      themePreference: userRow?.theme_preference ?? "system",
      processingRestricted: userRow?.processing_restricted ?? false,
      restrictionRequestedAt: userRow?.restriction_requested_at ?? null,
      restrictionReason: userRow?.restriction_reason ?? null,
      tenant: tenant ? {
        id: tenant.id, name: tenant.name, plan: tenant.plan, businessType: tenant.businessType,
        currency: tenant.currency, timezone: tenant.timezone, timeFormat: tenant.timeFormat,
        currencyPosition: tenant.currencyPosition, currencyDecimals: tenant.currencyDecimals,
        taxRate: tenant.taxRate, taxType: tenant.taxType, compoundTax: tenant.compoundTax,
        serviceCharge: tenant.serviceCharge, onboardingCompleted: tenant.onboardingCompleted,
        subscriptionStatus: tenant.subscriptionStatus, trialEndsAt: tenant.trialEndsAt,
        stripeCustomerId: tenant.stripeCustomerId, stripeSubscriptionId: tenant.stripeSubscriptionId,
        gstin: tenant.gstin, cgstRate: tenant.cgstRate, sgstRate: tenant.sgstRate,
        invoicePrefix: tenant.invoicePrefix, razorpayEnabled: tenant.razorpayEnabled,
        razorpayKeyId: tenant.razorpayKeyId,
      } : null,
    });
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

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const emailHash = createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
      const { rows } = await pool.query(
        `SELECT id, email FROM users WHERE email_hash = $1 LIMIT 1`,
        [emailHash]
      );
      if (rows.length > 0) {
        const user = rows[0];
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
          [user.id, tokenHash, expiresAt]
        );
        const appUrl = process.env.APP_URL;
        if (!appUrl) {
          console.warn("[Password Reset] APP_URL env var is not configured — reset email suppressed to prevent host-header poisoning.");
        } else {
          const userEmail = user.email || email;
          await sendPasswordResetEmail(userEmail, token, appUrl).catch(() => {});
        }
      }
      return res.json({ message: "If that email address is registered, you will receive a password reset link shortly." });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ message: "Token and new password are required" });
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const { rows } = await pool.query(
        `SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() LIMIT 1`,
        [tokenHash]
      );
      if (rows.length === 0) return res.status(400).json({ message: "Invalid or expired reset token" });
      const tokenRow = rows[0];
      const freshUser = await storage.getUser(tokenRow.user_id);
      if (!freshUser) return res.status(404).json({ message: "User not found" });
      const tenant = await storage.getTenant(freshUser.tenantId);
      const mc = (tenant?.moduleConfig || {}) as Record<string, any>;
      const policy = mc.passwordPolicy || {};
      const validation = validatePasswordPolicy(newPassword, policy);
      if (!validation.valid) return res.status(400).json({ message: validation.errors.join(". ") });
      const canUse = await checkPasswordHistory(newPassword, freshUser.passwordHistory, policy.preventReuseCount ?? DEFAULT_PASSWORD_POLICY.preventReuseCount);
      if (!canUse) return res.status(400).json({ message: "Cannot reuse a recent password" });
      const newHash = await hashPassword(newPassword);
      const history = [...(freshUser.passwordHistory || []), freshUser.password].slice(-10);
      await db.update(users).set({ password: newHash, passwordChangedAt: new Date(), passwordHistory: history }).where(eq(users.id, tokenRow.user_id));
      await pool.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);
      await pool.query(`DELETE FROM session WHERE sess->'passport'->>'user' = $1`, [tokenRow.user_id]);
      return res.json({ message: "Password has been reset successfully. Please log in with your new password." });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/auth/sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT sid, ip_address, user_agent, last_active FROM session WHERE user_id = $1 ORDER BY last_active DESC NULLS LAST`,
        [user.id]
      );
      const sessions = rows.map((row: any) => ({
        sessionId: row.sid,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        lastActive: row.last_active,
        isCurrent: row.sid === req.sessionID,
      }));
      return res.json(sessions);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/auth/sessions/:sessionId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { sessionId } = req.params;
      if (sessionId === req.sessionID) return res.status(400).json({ message: "Cannot revoke current session this way. Use logout." });
      const { rowCount } = await pool.query(
        `DELETE FROM session WHERE sid = $1 AND user_id = $2`,
        [sessionId, user.id]
      );
      if (!rowCount) return res.status(404).json({ message: "Session not found" });
      return res.json({ message: "Session revoked" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/auth/sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      await pool.query(
        `DELETE FROM session WHERE user_id = $1 AND sid != $2`,
        [user.id, req.sessionID]
      );
      return res.json({ message: "All other sessions have been signed out" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/auth/2fa/status", requireAuth, async (req, res) => {
    const user = req.user as any;
    const freshUser = await storage.getUser(user.id);
    res.json({ enabled: !!(freshUser?.totpEnabled) });
  });

  // PR-001: Session logout-all endpoint (rotate session_token to invalidate all other sessions)
  app.post("/api/auth/sessions/logout-all", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const newToken = randomBytes(18).toString("hex");
      await pool.query(`UPDATE users SET session_token = $1 WHERE id = $2`, [newToken, user.id]);
      // PR-001 fix: also update the current session's token so requireFreshSession continues to work
      (req.session as Record<string, unknown>).sessionToken = newToken;
      await pool.query(
        `DELETE FROM session WHERE user_id = $1 AND sid != $2`,
        [user.id, req.sessionID]
      );
      auditLogFromReq(req, { action: "logout_all_sessions", entityType: "user", entityId: user.id, entityName: user.name });
      return res.json({ message: "All other sessions have been signed out" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // PR-001: PIN login endpoint
  app.post("/api/auth/pin-login", async (req, res) => {
    try {
      const { username, pin } = req.body;
      if (!username || !pin) {
        return res.status(400).json({ message: "Username and PIN are required" });
      }
      if (!/^\d{4}$/.test(pin)) {
        return res.status(400).json({ message: "PIN must be 4 digits" });
      }

      const pinKey = `pin:${username.trim().toLowerCase()}`;
      if (isAccountLocked(pinKey)) {
        return res.status(423).json({ message: "Account temporarily locked due to too many failed PIN attempts. Try again in 15 minutes." });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        recordFailedLogin(pinKey);
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (user.active === false) {
        return res.status(401).json({ message: "Account is deactivated" });
      }

      const allowedPinRoles = ["waiter", "cashier", "kitchen", "delivery_agent", "cleaning_staff"];
      if (!allowedPinRoles.includes(user.role)) {
        return res.status(403).json({ message: "PIN login is only available for staff roles" });
      }

      const { rows: [pinRow] } = await pool.query(
        `SELECT pin_hash, pin_expires_at FROM users WHERE id = $1`,
        [user.id]
      );
      if (!pinRow?.pin_hash) {
        return res.status(401).json({ message: "No PIN is set for this account. Ask your manager to set one." });
      }

      const pinValid = await bcrypt.compare(pin, pinRow.pin_hash);
      if (!pinValid) {
        const locked = recordFailedLogin(pinKey);
        auditLog({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "pin_login_failed", entityType: "user", entityId: user.id, entityName: user.name, req });
        if (locked) {
          return res.status(423).json({ message: "Account temporarily locked due to too many failed PIN attempts. Try again in 15 minutes." });
        }
        return res.status(401).json({ message: "Invalid PIN" });
      }

      // Check expiry
      if (pinRow.pin_expires_at && new Date(pinRow.pin_expires_at) < new Date()) {
        auditLog({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "pin_login_expired", entityType: "user", entityId: user.id, entityName: user.name, req });
        return res.status(401).json({ code: "PIN_EXPIRED", message: "PIN has expired. Ask your manager to reset it, or use your password to log in." });
      }

      clearLoginFailures(pinKey);

      req.login(user, async (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Login failed" });

        const tenant = await storage.getTenant(user.tenantId);
        const mc = (tenant?.moduleConfig || {}) as Record<string, any>;
        const sessionData = req.session as Record<string, unknown>;
        sessionData.lastActivity = Date.now();
        sessionData.idleTimeoutMinutes = Number(mc.idleTimeoutMinutes ?? 30);

        // PR-001 fix: rotate session token so requireFreshSession works for PIN-logged sessions
        const newSessionToken = randomBytes(18).toString("hex");
        await pool.query(`UPDATE users SET session_token = $1 WHERE id = $2`, [newSessionToken, user.id]);
        sessionData.sessionToken = newSessionToken;

        pool.query(
          `UPDATE session SET user_id = $1, ip_address = $2, user_agent = $3, last_active = now() WHERE sid = $4`,
          [user.id, req.ip || null, req.headers["user-agent"] || null, req.sessionID]
        ).catch(() => {});

        auditLog({ tenantId: user.tenantId, userId: user.id, userName: user.name, action: "PIN_LOGIN", entityType: "user", entityId: user.id, entityName: user.name, req });

        const { password: _, totpSecret: _ts, recoveryCodes: _rc, passwordHistory: _ph, ...safeUser } = user;
        return res.json({ ...safeUser });
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // PR-001: Set PIN for a staff user (manager/owner sets PIN for another user)
  app.post("/api/auth/set-pin", requireAuth, requireFreshSession, async (req, res) => {
    try {
      const currentUser = req.user as any;
      const { userId, pin } = req.body;
      if (!userId || !pin) {
        return res.status(400).json({ message: "userId and pin are required" });
      }
      if (!["owner", "manager", "franchise_owner", "hq_admin"].includes(currentUser.role)) {
        return res.status(403).json({ message: "Only managers and owners can set PINs" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser || targetUser.tenantId !== currentUser.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      const userIdLastFour = targetUser.id.replace(/-/g, "").slice(-4);
      const validationError = pinValidationError(pin, userIdLastFour);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const pinHash = await bcrypt.hash(pin, 10);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      await pool.query(
        `UPDATE users SET pin_hash = $1, pin_set_at = $2, pin_expires_at = $3 WHERE id = $4`,
        [pinHash, now, expiresAt, userId]
      );
      auditLogFromReq(req, { action: "pin_set", entityType: "user", entityId: userId, entityName: targetUser.name, metadata: { setBy: currentUser.id } });
      return res.json({ message: "PIN set successfully. Expires in 90 days." });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // PR-001: PIN change — requires current PIN (user identity) + manager approval (manager credentials)
  // Implements the "PIN change requires current PIN plus manager approval" security requirement.
  app.post("/api/auth/change-pin", requireAuth, requireFreshSession, async (req, res) => {
    try {
      const currentUser = req.user as any;
      const { currentPin, newPin, managerUsername, managerPassword } = req.body;
      if (!currentPin || !newPin) {
        return res.status(400).json({ message: "currentPin and newPin are required" });
      }
      if (!managerUsername || !managerPassword) {
        return res.status(400).json({ message: "Manager credentials (managerUsername, managerPassword) are required for PIN changes" });
      }
      // Verify user's current PIN
      const user = await storage.getUser(currentUser.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!user.pinHash) {
        return res.status(400).json({ message: "No PIN is set. Ask a manager to set your PIN first." });
      }
      const currentPinValid = await bcrypt.compare(String(currentPin), user.pinHash);
      if (!currentPinValid) {
        auditLogFromReq(req, { action: "pin_change_failed", entityType: "user", entityId: user.id, metadata: { reason: "wrong_current_pin" } });
        return res.status(401).json({ message: "Current PIN is incorrect" });
      }
      // Verify manager credentials and role within same tenant
      const manager = await storage.getUserByUsername(managerUsername);
      if (!manager || manager.tenantId !== currentUser.tenantId) {
        auditLogFromReq(req, { action: "pin_change_failed", entityType: "user", entityId: user.id, metadata: { reason: "manager_not_found" } });
        return res.status(403).json({ message: "Manager not found or not in this organisation" });
      }
      if (!["owner", "manager", "franchise_owner", "hq_admin"].includes(manager.role)) {
        auditLogFromReq(req, { action: "pin_change_failed", entityType: "user", entityId: user.id, metadata: { reason: "approver_not_manager", approverId: manager.id } });
        return res.status(403).json({ message: "Approver must be a manager or owner" });
      }
      const managerPwValid = await comparePasswords(String(managerPassword), manager.password);
      if (!managerPwValid) {
        auditLogFromReq(req, { action: "pin_change_failed", entityType: "user", entityId: user.id, metadata: { reason: "wrong_manager_password", approverId: manager.id } });
        return res.status(403).json({ message: "Manager password is incorrect" });
      }
      // Validate new PIN
      const userIdLastFour = user.id.replace(/-/g, "").slice(-4);
      const validationError = pinValidationError(String(newPin), userIdLastFour);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }
      // Apply new PIN
      const newHash = await bcrypt.hash(String(newPin), 10);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      await pool.query(
        `UPDATE users SET pin_hash = $1, pin_set_at = $2, pin_expires_at = $3 WHERE id = $4`,
        [newHash, now, expiresAt, user.id]
      );
      auditLogFromReq(req, { action: "pin_changed", entityType: "user", entityId: user.id, metadata: { approvedBy: manager.id, approverRole: manager.role } });
      return res.json({ message: "PIN changed successfully. Expires in 90 days." });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // PR-001: Clear/reset PIN for a staff user
  app.delete("/api/auth/pin/:userId", requireAuth, requireFreshSession, async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!["owner", "manager", "franchise_owner", "hq_admin"].includes(currentUser.role)) {
        return res.status(403).json({ message: "Only managers and owners can reset PINs" });
      }
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser || targetUser.tenantId !== currentUser.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }
      await pool.query(
        `UPDATE users SET pin_hash = NULL, pin_set_at = NULL, pin_expires_at = NULL WHERE id = $1`,
        [req.params.userId]
      );
      auditLogFromReq(req, { action: "pin_reset", entityType: "user", entityId: req.params.userId, entityName: targetUser.name });
      return res.json({ message: "PIN has been reset" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // PR-001: RESTful aliases for staff PIN management (used by staff.tsx UI)
  app.post("/api/auth/staff/:staffId/set-pin", requireAuth, requireFreshSession, async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!["owner", "manager", "franchise_owner", "hq_admin"].includes(currentUser.role)) {
        return res.status(403).json({ message: "Only managers and owners can set PINs" });
      }
      const targetUser = await storage.getUser(req.params.staffId);
      if (!targetUser || targetUser.tenantId !== currentUser.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      const { pin } = req.body;
      if (!pin) return res.status(400).json({ message: "pin is required" });

      const userIdLastFour = targetUser.id.replace(/-/g, "").slice(-4);
      const validationError = pinValidationError(pin, userIdLastFour);
      if (validationError) return res.status(400).json({ message: validationError });

      const pinHash = await bcrypt.hash(pin, 10);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      await pool.query(
        `UPDATE users SET pin_hash = $1, pin_set_at = $2, pin_expires_at = $3 WHERE id = $4`,
        [pinHash, now, expiresAt, req.params.staffId]
      );
      auditLogFromReq(req, { action: "pin_set", entityType: "user", entityId: req.params.staffId, entityName: targetUser.name, metadata: { setBy: currentUser.id } });
      return res.json({ message: "PIN set successfully. Expires in 90 days." });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/auth/staff/:staffId/pin", requireAuth, requireFreshSession, async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!["owner", "manager", "franchise_owner", "hq_admin"].includes(currentUser.role)) {
        return res.status(403).json({ message: "Only managers and owners can reset PINs" });
      }
      const targetUser = await storage.getUser(req.params.staffId);
      if (!targetUser || targetUser.tenantId !== currentUser.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }
      await pool.query(
        `UPDATE users SET pin_hash = NULL, pin_set_at = NULL, pin_expires_at = NULL WHERE id = $1`,
        [req.params.staffId]
      );
      auditLogFromReq(req, { action: "pin_reset", entityType: "user", entityId: req.params.staffId, entityName: targetUser.name });
      return res.json({ message: "PIN has been cleared" });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
