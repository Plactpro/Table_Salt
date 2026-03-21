import type { Express } from "express";
import { db } from "./db";
import { eq, and, desc, sql, ne, gte, lte, inArray, max, ilike, or } from "drizzle-orm";
import { z } from "zod";
import {
  tenants, users, outlets, orders, auditEvents, roleEnum, securityAlerts, customers, reservations, deliveryOrders,
} from "@shared/schema";
import { requireSuperAdmin, requireAuth, hashPassword } from "./auth";
import { auditLog } from "./audit";
import { encryptField, decryptField, isEncrypted } from "./encryption";
import { deriveKey, encryptWithKey, decryptWithKey, rotateField } from "./encryption-rotation";
import { getApiRequestCount } from "./api-counter";
import { pool } from "./db";

type UserRoleValue = typeof roleEnum.enumValues[number];

const PLATFORM_SLUG = "platform";
const USER_PII_FIELDS = ["email", "phone"] as const;

async function getPlatformTenantId(): Promise<string> {
  const [pt] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, PLATFORM_SLUG));
  if (!pt) throw new Error("Platform tenant not found — run startup migrations first");
  return pt.id;
}

function encryptPiiFields<T extends Record<string, unknown>>(data: T, fields: readonly string[]): T {
  const result = { ...data };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === "string" && val && !isEncrypted(val)) {
      (result as Record<string, unknown>)[field] = encryptField(val);
    }
  }
  return result;
}

function decryptPiiFields<T extends Record<string, unknown>>(record: T, fields: readonly string[]): T {
  if (!record) return record;
  const result = { ...record };
  for (const field of fields) {
    const val = result[field];
    if (typeof val === "string" && isEncrypted(val)) {
      (result as Record<string, unknown>)[field] = decryptField(val);
    }
  }
  return result;
}

function stripSensitiveFields(u: Record<string, unknown>): Record<string, unknown> {
  const { password, totpSecret, recoveryCodes, passwordHistory, ...safe } = u;
  return decryptPiiFields(safe, USER_PII_FIELDS);
}

/** Derive a safe username from an email address or a display name */
function deriveUsername(email: string | undefined, name: string): string {
  if (email) {
    const local = email.split("@")[0] ?? "";
    return local.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30) || name.toLowerCase().replace(/\s+/g, "_").slice(0, 30);
  }
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").slice(0, 30);
}

export function registerAdminRoutes(app: Express) {

  // ───────────────────────────────────────────────────────────────────────────
  // Bootstrap — unauthenticated, one-time-only: fails if super admin exists.
  // Registered at both /api/platform/setup (canonical) and /api/admin/setup
  // (alias) so callers can use either path.
  // ───────────────────────────────────────────────────────────────────────────

  const handleSetup: import("express").RequestHandler = async (req, res) => {
    try {
      const existing = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.role, "super_admin" as UserRoleValue))
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Super admin already exists. Use login instead." });
      }

      const bodySchema = z.object({
        username: z.string().min(3).regex(/^[a-z0-9_]+$/, "Username must be lowercase alphanumeric with underscores"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        name: z.string().min(2),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const { username, password, name } = parsed.data;

      const platformTenantId = await getPlatformTenantId();
      const [existingUser] = await db.select({ id: users.id }).from(users)
        .where(eq(users.username, username)).limit(1);
      if (existingUser) {
        return res.status(409).json({ message: "Username already taken" });
      }

      const hashedPw = await hashPassword(password);
      const [newAdmin] = await db.insert(users).values({
        tenantId: platformTenantId,
        username,
        password: hashedPw,
        name,
        role: "super_admin" as UserRoleValue,
        active: true,
      }).returning({ id: users.id, username: users.username, name: users.name });

      await auditLog({
        tenantId: platformTenantId,
        userId: newAdmin.id,
        userName: newAdmin.name,
        action: "super_admin_created",
        entityType: "platform",
        entityId: newAdmin.id,
        entityName: newAdmin.name,
      });

      return res.json({ message: "Super admin created successfully", username: newAdmin.username });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  };

  app.post("/api/platform/setup", handleSetup);
  app.post("/api/admin/setup", handleSetup);

  // ───────────────────────────────────────────────────────────────────────────
  // Impersonation session management — outside /api/admin/* namespace because
  // the "end" and "status" routes are called while the session belongs to the
  // *impersonated* user (not a super_admin).  Start still uses requireSuperAdmin.
  // ───────────────────────────────────────────────────────────────────────────

  const handleImpersonateStart: import("express").RequestHandler = async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string; tenantId: string; role: string };
      const [target] = await db.select().from(users).where(eq(users.id, req.params.userId));
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.role === "super_admin" as UserRoleValue) {
        return res.status(403).json({ message: "Cannot impersonate another super admin" });
      }
      if (!target.active) {
        return res.status(403).json({ message: "Cannot impersonate a deactivated user" });
      }

      const [targetTenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, target.tenantId));

      // Capture backup values before session regeneration
      const backupData = {
        userId: adminUser.id,
        userName: adminUser.name,
        tenantId: adminUser.tenantId,
        role: adminUser.role,
        impersonatedTenantName: targetTenant?.name ?? null,
      };

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "impersonation_start",
        entityType: "platform",
        entityId: target.id,
        entityName: target.name,
        metadata: { targetTenantId: target.tenantId, targetRole: target.role },
        req,
      });

      // Passport 0.6+ regenerates the session on req.login() by default.
      // We use keepSessionInfo:true to preserve existing session data (backup).
      req.login(target, { keepSessionInfo: true }, (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Failed to switch session" });
        // Write backup AFTER login to ensure it survives any session handling
        const sess = req.session as Record<string, unknown>;
        sess.superAdminBackup = backupData;
        req.session.save((saveErr) => {
          if (saveErr) return res.status(500).json({ message: "Failed to save session" });
          return res.json({ message: "Impersonation started", user: stripSensitiveFields(target as Record<string, unknown>) });
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  };

  const handleImpersonateEnd: import("express").RequestHandler = async (req, res) => {
    try {
      const session = req.session as Record<string, unknown>;
      const backup = session.superAdminBackup as {
        userId: string;
        userName: string;
        tenantId: string;
        role: string;
      } | undefined;

      if (!backup) {
        return res.status(400).json({ message: "Not currently impersonating" });
      }

      const [originalAdmin] = await db.select().from(users).where(eq(users.id, backup.userId));
      if (!originalAdmin) return res.status(404).json({ message: "Original admin session not found" });

      const currentUser = req.user as { id?: string; name?: string; tenantId?: string; role?: string };
      await auditLog({
        tenantId: null,
        userId: backup.userId,
        userName: backup.userName,
        action: "impersonation_end",
        entityType: "platform",
        entityId: currentUser.id ?? "",
        entityName: currentUser.name ?? "",
        metadata: { impersonatedTenantId: currentUser.tenantId, impersonatedRole: currentUser.role },
        req,
      });

      delete session.superAdminBackup;

      req.login(originalAdmin, (loginErr) => {
        if (loginErr) return res.status(500).json({ message: "Failed to restore session" });
        return res.json({
          message: "Returned to admin session",
          user: stripSensitiveFields(originalAdmin as Record<string, unknown>),
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  };

  // End must be registered BEFORE /:userId to prevent Express matching "end" as userId param
  app.post("/api/session/impersonate/end", requireAuth, handleImpersonateEnd);
  app.post("/api/admin/impersonate/end", requireAuth, handleImpersonateEnd);
  // Extra alias with "impersonation" spelling (no conflict risk)
  app.post("/api/admin/impersonation/end", requireAuth, handleImpersonateEnd);

  app.post("/api/session/impersonate/:userId", requireSuperAdmin, handleImpersonateStart);
  app.post("/api/admin/impersonate/:userId", requireSuperAdmin, handleImpersonateStart);

  const handleImpersonationStatus: import("express").RequestHandler = (req, res) => {
    const session = req.session as Record<string, unknown>;
    const backup = session.superAdminBackup as Record<string, unknown> | undefined;
    if (!backup) return res.json({ isImpersonating: false });
    const backup2 = backup as Record<string, unknown>;
    return res.json({
      isImpersonating: true,
      originalAdmin: { userId: backup.userId, userName: backup.userName, role: backup.role },
      tenantName: backup2.impersonatedTenantName ?? null,
    });
  };

  app.get("/api/session/impersonation/status", requireAuth, handleImpersonationStatus);
  app.get("/api/admin/impersonation/status", requireAuth, handleImpersonationStatus);

  // ───────────────────────────────────────────────────────────────────────────
  // All routes below this point are under /api/admin/* and use requireSuperAdmin
  // (exception: impersonate/end and impersonation/status use requireAuth because
  //  during impersonation the active session belongs to the impersonated user)
  // ───────────────────────────────────────────────────────────────────────────

  app.get("/api/admin/stats", requireSuperAdmin, async (_req, res) => {
    try {
      const platformTenantId = await getPlatformTenantId();

      const [tenantStats] = await db.select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where active = true)::int`,
        suspended: sql<number>`count(*) filter (where active = false)::int`,
      }).from(tenants).where(ne(tenants.id, platformTenantId));

      const planDistribution = await db.select({
        plan: tenants.plan,
        count: sql<number>`count(*)::int`,
      }).from(tenants).where(ne(tenants.id, platformTenantId)).groupBy(tenants.plan);

      const businessTypes = await db.select({
        businessType: tenants.businessType,
        count: sql<number>`count(*)::int`,
      }).from(tenants).where(ne(tenants.id, platformTenantId)).groupBy(tenants.businessType);

      const [userStats] = await db.select({
        total: sql<number>`count(*)::int`,
      }).from(users).where(
        and(
          ne(users.tenantId, platformTenantId),
          ne(users.role, "super_admin" as UserRoleValue)
        )
      );

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfDay);
      startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [orderStats] = await db.select({
        today: sql<number>`count(*) filter (where created_at >= ${startOfDay})::int`,
        thisWeek: sql<number>`count(*) filter (where created_at >= ${startOfWeek})::int`,
        thisMonth: sql<number>`count(*) filter (where created_at >= ${startOfMonth})::int`,
        total: sql<number>`count(*)::int`,
      }).from(orders);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const newTenantsRaw = await db.select({
        date: sql<string>`date(created_at)::text`,
        count: sql<number>`count(*)::int`,
      }).from(tenants)
        .where(and(ne(tenants.id, platformTenantId), gte(tenants.createdAt, thirtyDaysAgo)))
        .groupBy(sql`date(created_at)`)
        .orderBy(sql`date(created_at)`);

      // Top 5 tenants by order count
      const topTenantRows = await db.select({
        tenantId: orders.tenantId,
        orderCount: sql<number>`count(*)::int`,
      }).from(orders)
        .groupBy(orders.tenantId)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      const topTenantIds = topTenantRows.map((r) => r.tenantId).filter(Boolean) as string[];
      const topTenantDetails = topTenantIds.length > 0
        ? await db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug, plan: tenants.plan })
            .from(tenants).where(inArray(tenants.id, topTenantIds))
        : [];

      const topTenantsByOrders = topTenantRows.map((r) => {
        const detail = topTenantDetails.find((t) => t.id === r.tenantId);
        return {
          id: r.tenantId,
          name: detail?.name ?? "Unknown",
          slug: detail?.slug ?? "",
          plan: detail?.plan ?? "",
          orderCount: r.orderCount,
        };
      });

      return res.json({
        tenants: {
          total: tenantStats?.total ?? 0,
          active: tenantStats?.active ?? 0,
          suspended: tenantStats?.suspended ?? 0,
        },
        planDistribution,
        businessTypes,
        users: { total: userStats?.total ?? 0 },
        orders: {
          today: orderStats?.today ?? 0,
          thisWeek: orderStats?.thisWeek ?? 0,
          thisMonth: orderStats?.thisMonth ?? 0,
          total: orderStats?.total ?? 0,
        },
        newTenantsLast30Days: newTenantsRaw,
        topTenantsByOrders,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ─── Tenant CRUD ──────────────────────────────────────────────────────────

  app.get("/api/admin/tenants", requireSuperAdmin, async (req, res) => {
    try {
      const platformTenantId = await getPlatformTenantId();
      const { search, plan, active, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(limitStr ?? "50", 10) || 50, 200);
      const offset = Math.max(parseInt(offsetStr ?? "0", 10) || 0, 0);

      const whereClause = and(
        ne(tenants.id, platformTenantId),
        search ? or(ilike(tenants.name, `%${search}%`), ilike(tenants.slug, `%${search}%`)) : undefined,
        plan ? eq(tenants.plan, plan) : undefined,
        active !== undefined && active !== "" ? eq(tenants.active, active === "true") : undefined,
      );

      const [totalResult, page] = await Promise.all([
        db.select({ cnt: sql<number>`count(*)::int` }).from(tenants).where(whereClause),
        db.select().from(tenants).where(whereClause).orderBy(desc(tenants.createdAt)).limit(limit).offset(offset),
      ]);
      const total = totalResult[0]?.cnt ?? 0;

      if (page.length === 0) return res.json({ data: [], total, limit, offset });

      const tenantIds = page.map(t => t.id);
      const [userCounts, outletCounts, orderCounts, ownerUsers, lastActivityRows] = await Promise.all([
        db.select({ tenantId: users.tenantId, count: sql<number>`count(*)::int` })
          .from(users).where(inArray(users.tenantId, tenantIds)).groupBy(users.tenantId),
        db.select({ tenantId: outlets.tenantId, count: sql<number>`count(*)::int` })
          .from(outlets).where(inArray(outlets.tenantId, tenantIds)).groupBy(outlets.tenantId),
        db.select({ tenantId: orders.tenantId, count: sql<number>`count(*)::int` })
          .from(orders).where(inArray(orders.tenantId, tenantIds)).groupBy(orders.tenantId),
        db.select({ tenantId: users.tenantId, id: users.id })
          .from(users).where(and(inArray(users.tenantId, tenantIds), eq(users.role, "owner" as UserRoleValue))),
        db.select({ tenantId: auditEvents.tenantId, lastActivity: max(auditEvents.createdAt) })
          .from(auditEvents).where(inArray(auditEvents.tenantId, tenantIds)).groupBy(auditEvents.tenantId),
      ]);

      const ucMap = new Map(userCounts.map(r => [r.tenantId, r.count]));
      const ocMap = new Map(outletCounts.map(r => [r.tenantId, r.count]));
      const ordMap = new Map(orderCounts.map(r => [r.tenantId, r.count]));
      const ownerMap = new Map(ownerUsers.map(u => [u.tenantId, u.id]));
      const lastActMap = new Map(lastActivityRows.map(r => [r.tenantId, r.lastActivity]));

      const data = page.map(({ razorpayKeySecret: _secret, ...t }) => ({
        ...t,
        userCount: ucMap.get(t.id) ?? 0,
        outletCount: ocMap.get(t.id) ?? 0,
        orderCount: ordMap.get(t.id) ?? 0,
        ownerUserId: ownerMap.get(t.id) ?? null,
        lastActivity: lastActMap.get(t.id) ?? null,
      }));
      return res.json({ data, total, limit, offset });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  app.get("/api/admin/tenants/:id", requireSuperAdmin, async (req, res) => {
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [tenantUsers, tenantOutlets, [orderStats], [recentOrderStats], recentAudit] = await Promise.all([
        db.select().from(users).where(eq(users.tenantId, tenant.id)).orderBy(users.name),
        db.select().from(outlets).where(eq(outlets.tenantId, tenant.id)),
        db.select({ total: sql<number>`count(*)::int` }).from(orders).where(eq(orders.tenantId, tenant.id)),
        db.select({ total: sql<number>`count(*)::int` }).from(orders).where(
          and(eq(orders.tenantId, tenant.id), gte(orders.createdAt, thirtyDaysAgo))
        ),
        db.select().from(auditEvents).where(eq(auditEvents.tenantId, tenant.id))
          .orderBy(desc(auditEvents.createdAt)).limit(20),
      ]);

      const { razorpayKeySecret: _secret, ...safeTenant } = tenant as any;
      return res.json({
        ...safeTenant,
        users: tenantUsers.map(u => stripSensitiveFields(u as Record<string, unknown>)),
        outlets: tenantOutlets,
        orderCount: orderStats?.total ?? 0,
        recentOrderCount: recentOrderStats?.total ?? 0,
        recentAuditEvents: recentAudit,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  const createTenantSchema = z.object({
    tenantName: z.string().min(2),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
    ownerName: z.string().min(2),
    ownerEmail: z.string().email().optional(),
    ownerUsername: z.string().min(3).regex(/^[a-z0-9_]+$/, "Username must be lowercase alphanumeric with underscores").optional(),
    ownerPassword: z.string().min(8),
    plan: z.enum(["basic", "standard", "premium", "enterprise"]).default("basic"),
    currency: z.string().default("USD"),
    timezone: z.string().default("UTC"),
    businessType: z.string().default("casual_dining"),
  });

  app.post("/api/admin/tenants", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const parsed = createTenantSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const { tenantName, slug, ownerName, ownerEmail, ownerPassword, plan, currency, timezone, businessType } = parsed.data;

      // Derive username from email or name if not provided
      const rawUsername = parsed.data.ownerUsername ?? deriveUsername(ownerEmail, ownerName);

      const [existingSlug] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (existingSlug) return res.status(409).json({ message: "Slug already taken" });

      const [existingUsername] = await db.select({ id: users.id }).from(users)
        .where(eq(users.username, rawUsername)).limit(1);
      if (existingUsername) return res.status(409).json({ message: `Username '${rawUsername}' already taken` });

      const hashedPw = await hashPassword(ownerPassword);

      const result = await db.transaction(async (tx) => {
        const [newTenant] = await tx.insert(tenants).values({
          name: tenantName,
          slug,
          plan,
          currency,
          timezone,
          businessType,
          active: true,
          moduleConfig: {},
        }).returning();

        await tx.insert(outlets).values({
          tenantId: newTenant.id,
          name: "Main Branch",
          active: true,
        });

        const ownerValues = encryptPiiFields({
          tenantId: newTenant.id,
          username: rawUsername,
          password: hashedPw,
          name: ownerName,
          email: ownerEmail,
          role: "owner" as UserRoleValue,
          active: true,
        }, USER_PII_FIELDS);
        const [newOwner] = await tx.insert(users).values(ownerValues).returning();

        return { newTenant, newOwner };
      });

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "tenant_created",
        entityType: "platform",
        entityId: result.newTenant.id,
        entityName: result.newTenant.name,
        after: { tenantName, slug, plan, ownerUsername: rawUsername },
        req,
      });

      return res.status(201).json({
        tenant: result.newTenant,
        owner: stripSensitiveFields(result.newOwner as Record<string, unknown>),
      });
    } catch (err: unknown) {
      const dbErr = err as { code?: string; message?: string };
      if (dbErr.code === "23505") return res.status(409).json({ message: "Slug or username already taken" });
      return res.status(500).json({ message: dbErr.message ?? "Unknown error" });
    }
  });

  const updateTenantSchema = z.object({
    name: z.string().min(2).optional(),
    plan: z.enum(["basic", "standard", "premium", "enterprise"]).optional(),
    active: z.boolean().optional(),
    address: z.string().optional(),
    timezone: z.string().optional(),
    currency: z.string().optional(),
    businessType: z.string().optional(),
    moduleConfig: z.record(z.unknown()).optional(),
  });

  app.patch("/api/admin/tenants/:id", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const parsed = updateTenantSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }

      const platformTenantId = await getPlatformTenantId();
      if (req.params.id === platformTenantId) {
        return res.status(403).json({ message: "Cannot modify platform tenant" });
      }

      const [before] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
      if (!before) return res.status(404).json({ message: "Tenant not found" });

      const [updated] = await db.update(tenants).set(parsed.data)
        .where(eq(tenants.id, req.params.id)).returning();

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "tenant_updated",
        entityType: "platform",
        entityId: req.params.id,
        entityName: before.name,
        before: { plan: before.plan, active: before.active, name: before.name },
        after: parsed.data,
        req,
      });

      const { razorpayKeySecret: _s, ...safeUpdated } = (updated || {}) as any;
      return res.json(safeUpdated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  const suspendSchema = z.object({ reason: z.string().optional() });

  app.post("/api/admin/tenants/:id/suspend", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const parsed = suspendSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }

      const platformTenantId = await getPlatformTenantId();
      if (req.params.id === platformTenantId) {
        return res.status(403).json({ message: "Cannot suspend platform tenant" });
      }

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!tenant.active) return res.status(400).json({ message: "Tenant is already suspended" });

      const [updated] = await db.update(tenants).set({ active: false })
        .where(eq(tenants.id, req.params.id)).returning();

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "tenant_suspended",
        entityType: "platform",
        entityId: req.params.id,
        entityName: tenant.name,
        metadata: { reason: parsed.data.reason ?? null },
        req,
      });

      return res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  app.post("/api/admin/tenants/:id/reactivate", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (tenant.active) return res.status(400).json({ message: "Tenant is already active" });

      const [updated] = await db.update(tenants).set({ active: true })
        .where(eq(tenants.id, req.params.id)).returning();

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "tenant_reactivated",
        entityType: "platform",
        entityId: req.params.id,
        entityName: tenant.name,
        req,
      });

      return res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ─── Cross-Tenant User Management ────────────────────────────────────────

  app.get("/api/admin/users", requireSuperAdmin, async (req, res) => {
    try {
      const platformTenantId = await getPlatformTenantId();
      const { tenantId, role, search, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
      const limit = Math.min(parseInt(limitStr ?? "50", 10) || 50, 200);
      const offset = Math.max(parseInt(offsetStr ?? "0", 10) || 0, 0);

      const whereClause = and(
        ne(users.tenantId, platformTenantId),
        tenantId ? eq(users.tenantId, tenantId) : undefined,
        role ? eq(users.role, role as UserRoleValue) : undefined,
        search ? or(
          ilike(users.name, `%${search}%`),
          ilike(users.username, `%${search}%`),
        ) : undefined,
      );

      const [pageRows, totalResult, lastLogins] = await Promise.all([
        db
          .select({
            id: users.id,
            tenantId: users.tenantId,
            username: users.username,
            name: users.name,
            email: users.email,
            role: users.role,
            active: users.active,
            totpEnabled: users.totpEnabled,
            passwordChangedAt: users.passwordChangedAt,
            tenantName: tenants.name,
            tenantPlan: tenants.plan,
          })
          .from(users)
          .innerJoin(tenants, eq(users.tenantId, tenants.id))
          .where(whereClause)
          .orderBy(users.name)
          .limit(limit)
          .offset(offset),
        db.select({ cnt: sql<number>`count(*)::int` })
          .from(users)
          .innerJoin(tenants, eq(users.tenantId, tenants.id))
          .where(whereClause),
        db
          .select({ userId: auditEvents.userId, lastLogin: max(auditEvents.createdAt) })
          .from(auditEvents)
          .where(eq(auditEvents.action, "login"))
          .groupBy(auditEvents.userId),
      ]);

      const loginMap = new Map(lastLogins.map(r => [r.userId, r.lastLogin]));
      const data = pageRows.map(u => ({
        ...decryptPiiFields(u as Record<string, unknown>, USER_PII_FIELDS),
        lastLogin: loginMap.get(u.id) ?? null,
      }));

      const total = totalResult[0]?.cnt ?? 0;
      return res.json({ data, total, limit, offset });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  const toggleUserSchema = z.object({ active: z.boolean() });

  app.patch("/api/admin/users/:id", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const parsed = toggleUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }

      const [target] = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.role === "super_admin" as UserRoleValue) {
        return res.status(403).json({ message: "Cannot modify super admin accounts via this endpoint" });
      }

      const [updated] = await db.update(users).set({ active: parsed.data.active })
        .where(eq(users.id, req.params.id)).returning();

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: parsed.data.active ? "user_reactivated" : "user_deactivated",
        entityType: "platform",
        entityId: req.params.id,
        entityName: target.name,
        metadata: { targetTenantId: target.tenantId, targetRole: target.role },
        req,
      });

      return res.json(stripSensitiveFields(updated as Record<string, unknown>));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  app.post("/api/admin/users/:id/reset-password", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const [target] = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.role === "super_admin" as UserRoleValue) {
        return res.status(403).json({ message: "Cannot reset super admin passwords via this endpoint" });
      }

      const tempPassword = randomBytes(8).toString("base64url").slice(0, 12);
      const hashedPw = await hashPassword(tempPassword);
      await db.update(users).set({
        password: hashedPw,
        passwordChangedAt: null,
        passwordHistory: [],
      }).where(eq(users.id, req.params.id));

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "password_force_reset",
        entityType: "platform",
        entityId: req.params.id,
        entityName: target.name,
        metadata: { targetTenantId: target.tenantId },
        req,
      });

      return res.json({ tempPassword, message: "Password reset. Share this temporary password securely." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ─── Audit Log ────────────────────────────────────────────────────────────

  app.get("/api/admin/audit-log", requireSuperAdmin, async (req, res) => {
    try {
      const { tenantId, userId, action, from, to, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
      const limitNum = Math.min(parseInt(limitStr || "50"), 200);
      const offsetNum = Math.max(parseInt(offsetStr || "0"), 0);

      const whereClause = and(
        tenantId ? eq(auditEvents.tenantId, tenantId) : undefined,
        userId ? eq(auditEvents.userId, userId) : undefined,
        action ? eq(auditEvents.action, action) : undefined,
        from ? gte(auditEvents.createdAt, new Date(from)) : undefined,
        to ? lte(auditEvents.createdAt, new Date(to)) : undefined,
      );

      const [events, [{ total }]] = await Promise.all([
        db
          .select({
            id: auditEvents.id,
            tenantId: auditEvents.tenantId,
            userId: auditEvents.userId,
            userName: auditEvents.userName,
            userEmail: users.email,
            userRole: users.role,
            action: auditEvents.action,
            entityType: auditEvents.entityType,
            entityId: auditEvents.entityId,
            entityName: auditEvents.entityName,
            ipAddress: auditEvents.ipAddress,
            metadata: auditEvents.metadata,
            before: auditEvents.before,
            after: auditEvents.after,
            createdAt: auditEvents.createdAt,
            tenantName: tenants.name,
          })
          .from(auditEvents)
          .leftJoin(tenants, eq(auditEvents.tenantId, tenants.id))
          .leftJoin(users, eq(auditEvents.userId, users.id))
          .where(whereClause)
          .orderBy(desc(auditEvents.createdAt))
          .limit(limitNum)
          .offset(offsetNum),
        db.select({ total: sql<number>`count(*)::int` }).from(auditEvents).where(whereClause),
      ]);

      const data = events.map(e => {
        if (!e.userEmail) return e;
        return { ...e, userEmail: isEncrypted(e.userEmail) ? decryptField(e.userEmail) : e.userEmail };
      });
      return res.json({ data, total: Number(total), limit: limitNum, offset: offsetNum });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ─── Super Admin Management ───────────────────────────────────────────────

  app.get("/api/admin/super-admins", requireSuperAdmin, async (_req, res) => {
    try {
      const admins = await db.select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        active: users.active,
        totpEnabled: users.totpEnabled,
      }).from(users).where(eq(users.role, "super_admin" as UserRoleValue)).orderBy(users.name);

      // Derive lastActive from most recent audit event per super-admin user
      const adminIds = admins.map(a => a.id);
      const lastActiveMap: Record<string, string | null> = {};
      if (adminIds.length > 0) {
        const rows = await db
          .select({ userId: auditEvents.userId, lastActive: sql<string>`max(${auditEvents.createdAt})` })
          .from(auditEvents)
          .where(inArray(auditEvents.userId, adminIds))
          .groupBy(auditEvents.userId);
        for (const row of rows) {
          if (row.userId) lastActiveMap[row.userId] = row.lastActive;
        }
      }

      const result = admins.map(a => ({
        ...decryptPiiFields(a as Record<string, unknown>, USER_PII_FIELDS),
        lastActive: lastActiveMap[a.id] ?? null,
      }));
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  const createSuperAdminSchema = z.object({
    username: z.string().min(3).regex(/^[a-z0-9_]+$/, "Username must be lowercase alphanumeric with underscores"),
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  });

  app.post("/api/admin/super-admins", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const parsed = createSuperAdminSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }

      const platformTenantId = await getPlatformTenantId();
      const [existing] = await db.select({ id: users.id }).from(users)
        .where(eq(users.username, parsed.data.username)).limit(1);
      if (existing) return res.status(409).json({ message: "Username already taken" });

      const hashedPw = await hashPassword(parsed.data.password);
      const newAdminValues = encryptPiiFields({
        tenantId: platformTenantId,
        username: parsed.data.username,
        password: hashedPw,
        name: parsed.data.name,
        email: parsed.data.email,
        role: "super_admin" as UserRoleValue,
        active: true,
      }, USER_PII_FIELDS);
      const [newAdmin] = await db.insert(users).values(newAdminValues).returning();

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "super_admin_created",
        entityType: "platform",
        entityId: newAdmin.id,
        entityName: newAdmin.name,
        req,
      });

      return res.status(201).json(stripSensitiveFields(newAdmin as Record<string, unknown>));
    } catch (err: unknown) {
      const dbErr = err as { code?: string; message?: string };
      if (dbErr.code === "23505") return res.status(409).json({ message: "Username already taken" });
      return res.status(500).json({ message: dbErr.message ?? "Unknown error" });
    }
  });

  app.delete("/api/admin/super-admins/:id", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      if (req.params.id === adminUser.id) {
        return res.status(400).json({ message: "Cannot deactivate your own account" });
      }

      const [target] = await db.select().from(users).where(
        and(eq(users.id, req.params.id), eq(users.role, "super_admin" as UserRoleValue))
      );
      if (!target) return res.status(404).json({ message: "Super admin not found" });

      await db.update(users).set({ active: false }).where(eq(users.id, req.params.id));

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "super_admin_deactivated",
        entityType: "platform",
        entityId: req.params.id,
        entityName: target.name,
        req,
      });

      return res.json({ message: "Super admin deactivated" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ─── Platform Settings ─────────────────────────────────────────────────────
  // Persisted to the platform_settings DB table (single-row singleton).

  const platformSettingsSchema = z.object({
    maintenanceMode: z.boolean().optional(),
    registrationOpen: z.boolean().optional(),
    platformName: z.string().min(1).optional(),
    maxTenantsPerPlan: z.record(z.string(), z.number().int().positive()).optional(),
    alertEmailRecipients: z.array(z.string().email()).optional(),
  });

  async function loadPlatformSettings() {
    const { rows } = await pool.query(
      `SELECT maintenance_mode, registration_open, platform_name, max_tenants_per_plan, alert_email_recipients
       FROM platform_settings WHERE id = 'singleton' LIMIT 1`
    );
    if (rows.length === 0) {
      return {
        maintenanceMode: false,
        registrationOpen: true,
        platformName: "Table Salt",
        maxTenantsPerPlan: { basic: 100, standard: 50, premium: 20, enterprise: 5 },
        alertEmailRecipients: [] as string[],
      };
    }
    const r = rows[0];
    return {
      maintenanceMode: r.maintenance_mode ?? false,
      registrationOpen: r.registration_open ?? true,
      platformName: r.platform_name ?? "Table Salt",
      maxTenantsPerPlan: r.max_tenants_per_plan ?? { basic: 100, standard: 50, premium: 20, enterprise: 5 },
      alertEmailRecipients: r.alert_email_recipients ?? [],
    };
  }

  app.get("/api/admin/platform-settings", requireSuperAdmin, async (_req, res) => {
    try {
      return res.json(await loadPlatformSettings());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  app.patch("/api/admin/platform-settings", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const parsed = platformSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const updates = parsed.data;
      const current = await loadPlatformSettings();

      const next = {
        maintenanceMode: updates.maintenanceMode ?? current.maintenanceMode,
        registrationOpen: updates.registrationOpen ?? current.registrationOpen,
        platformName: updates.platformName ?? current.platformName,
        maxTenantsPerPlan: updates.maxTenantsPerPlan ? { ...current.maxTenantsPerPlan, ...updates.maxTenantsPerPlan } : current.maxTenantsPerPlan,
        alertEmailRecipients: updates.alertEmailRecipients ?? current.alertEmailRecipients,
      };

      await pool.query(
        `INSERT INTO platform_settings (id, maintenance_mode, registration_open, platform_name, max_tenants_per_plan, alert_email_recipients, updated_at)
         VALUES ('singleton', $1, $2, $3, $4, $5, now())
         ON CONFLICT (id) DO UPDATE SET
           maintenance_mode = EXCLUDED.maintenance_mode,
           registration_open = EXCLUDED.registration_open,
           platform_name = EXCLUDED.platform_name,
           max_tenants_per_plan = EXCLUDED.max_tenants_per_plan,
           alert_email_recipients = EXCLUDED.alert_email_recipients,
           updated_at = now()`,
        [next.maintenanceMode, next.registrationOpen, next.platformName, JSON.stringify(next.maxTenantsPerPlan), JSON.stringify(next.alertEmailRecipients)]
      );

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "platform_settings_updated",
        entityType: "platform",
        entityId: "settings",
        entityName: "Platform Settings",
        metadata: updates as Record<string, unknown>,
        req,
      });

      return res.json(next);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ─── Analytics ─────────────────────────────────────────────────────────────

  /** Build a zero-filled 12-month array of { month: "YYYY-MM", count: 0 } */
  function buildMonthSeries(monthsBack: number): { month: string; count: number }[] {
    const series: { month: string; count: number }[] = [];
    const now = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      series.push({ month: `${y}-${m}`, count: 0 });
    }
    return series;
  }

  /** Build a zero-filled N-week array of { week: "YYYY-MM-DD", count: 0 } */
  function buildWeekSeries(weeksBack: number): { week: string; count: number }[] {
    const series: { week: string; count: number }[] = [];
    const now = new Date();
    // Align to current week's Monday
    const dayOfWeek = now.getDay(); // 0 = Sun
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday);
    for (let i = weeksBack - 1; i >= 0; i--) {
      const d = new Date(thisMonday);
      d.setDate(thisMonday.getDate() - i * 7);
      const iso = d.toISOString().slice(0, 10);
      series.push({ week: iso, count: 0 });
    }
    return series;
  }

  /** Merge raw DB results into a pre-built series by key */
  function mergeIntoMonthSeries(
    series: { month: string; count: number }[],
    raw: { month: string; count: number }[]
  ): { month: string; count: number }[] {
    const map = new Map(raw.map((r) => [r.month, r.count]));
    return series.map((s) => ({ ...s, count: map.get(s.month) ?? 0 }));
  }

  function mergeIntoWeekSeries(
    series: { week: string; count: number }[],
    raw: { week: string; count: number }[]
  ): { week: string; count: number }[] {
    const map = new Map(raw.map((r) => [r.week, r.count]));
    return series.map((s) => ({ ...s, count: map.get(s.week) ?? 0 }));
  }

  app.get("/api/admin/analytics", requireSuperAdmin, async (_req, res) => {
    try {
      const platformTenantId = await getPlatformTenantId();

      // Monthly tenant growth — last 12 months
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
      twelveMonthsAgo.setDate(1);
      twelveMonthsAgo.setHours(0, 0, 0, 0);

      const tenantGrowthRaw = await db.select({
        month: sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      }).from(tenants)
        .where(and(ne(tenants.id, platformTenantId), gte(tenants.createdAt, twelveMonthsAgo)))
        .groupBy(sql`date_trunc('month', created_at)`)
        .orderBy(sql`date_trunc('month', created_at)`);

      // Monthly user registrations — last 12 months (from users.createdAt, excluding platform/super_admin)
      const userRegistrationsRaw = await db.select({
        month: sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      }).from(users)
        .where(and(
          ne(users.tenantId, platformTenantId),
          ne(users.role, "super_admin" as UserRoleValue),
          gte(users.createdAt, twelveMonthsAgo)
        ))
        .groupBy(sql`date_trunc('month', created_at)`)
        .orderBy(sql`date_trunc('month', created_at)`);

      // Weekly order volume — last 8 weeks
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

      const weeklyOrdersRaw = await db.select({
        week: sql<string>`to_char(date_trunc('week', created_at), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      }).from(orders)
        .where(gte(orders.createdAt, eightWeeksAgo))
        .groupBy(sql`date_trunc('week', created_at)`)
        .orderBy(sql`date_trunc('week', created_at)`);

      // Plan distribution with assumed price proxy
      const planPrices: Record<string, number> = {
        basic: 29,
        standard: 79,
        premium: 149,
        enterprise: 399,
      };
      const planDistributionRaw = await db.select({
        plan: tenants.plan,
        count: sql<number>`count(*)::int`,
      }).from(tenants)
        .where(ne(tenants.id, platformTenantId))
        .groupBy(tenants.plan);

      const planRevenue = planDistributionRaw.map((p) => ({
        plan: p.plan,
        count: p.count,
        price: planPrices[p.plan] ?? 0,
        revenue: (planPrices[p.plan] ?? 0) * p.count,
      }));

      // Top 5 tenants by order count
      const topTenantRows = await db.select({
        tenantId: orders.tenantId,
        orderCount: sql<number>`count(*)::int`,
      }).from(orders)
        .groupBy(orders.tenantId)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      const topTenantIds = topTenantRows.map((r) => r.tenantId).filter(Boolean) as string[];
      const topTenantDetails = topTenantIds.length > 0
        ? await db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug, plan: tenants.plan })
            .from(tenants).where(inArray(tenants.id, topTenantIds))
        : [];

      const topTenantsByOrders = topTenantRows.map((r) => {
        const detail = topTenantDetails.find((t) => t.id === r.tenantId);
        return {
          id: r.tenantId,
          name: detail?.name ?? "Unknown",
          slug: detail?.slug ?? "",
          plan: detail?.plan ?? "",
          orderCount: r.orderCount,
        };
      });

      // Platform health
      let dbOk = false;
      try {
        await db.execute(sql`SELECT 1`);
        dbOk = true;
      } catch {
        dbOk = false;
      }

      const uptimeSeconds = Math.floor(process.uptime());
      const apiRequestCount = getApiRequestCount();

      // Zero-fill time series to always return full windows
      const tenantGrowth = mergeIntoMonthSeries(buildMonthSeries(12), tenantGrowthRaw);
      const userRegistrations = mergeIntoMonthSeries(buildMonthSeries(12), userRegistrationsRaw);
      const weeklyOrderVolume = mergeIntoWeekSeries(buildWeekSeries(8), weeklyOrdersRaw);

      return res.json({
        tenantGrowth,
        userRegistrations,
        weeklyOrderVolume,
        planRevenue,
        topTenantsByOrders,
        platformHealth: {
          dbOk,
          uptimeSeconds,
          apiRequestCount,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ─── Cross-Tenant Security Alerts ─────────────────────────────────────────

  app.get("/api/admin/security-alerts", requireSuperAdmin, async (req, res) => {
    try {
      const { tenantId, severity, type, acknowledged, from, to, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
      const limitVal = Math.min(parseInt(limitStr ?? "50", 10) || 50, 200);
      const offsetVal = Math.max(parseInt(offsetStr ?? "0", 10) || 0, 0);

      const conditions = [];
      if (tenantId) conditions.push(eq(securityAlerts.tenantId, tenantId));
      if (severity) conditions.push(eq(securityAlerts.severity, severity as "info" | "warning" | "critical"));
      if (type) conditions.push(eq(securityAlerts.type, type));
      if (acknowledged !== undefined && acknowledged !== "") {
        conditions.push(eq(securityAlerts.acknowledged, acknowledged === "true"));
      }
      if (from) conditions.push(gte(securityAlerts.createdAt, new Date(from)));
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(securityAlerts.createdAt, toDate));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: securityAlerts.id,
            tenantId: securityAlerts.tenantId,
            userId: securityAlerts.userId,
            type: securityAlerts.type,
            severity: securityAlerts.severity,
            title: securityAlerts.title,
            description: securityAlerts.description,
            ipAddress: securityAlerts.ipAddress,
            metadata: securityAlerts.metadata,
            acknowledged: securityAlerts.acknowledged,
            acknowledgedBy: securityAlerts.acknowledgedBy,
            acknowledgedAt: securityAlerts.acknowledgedAt,
            createdAt: securityAlerts.createdAt,
            tenantName: tenants.name,
          })
          .from(securityAlerts)
          .leftJoin(tenants, eq(securityAlerts.tenantId, tenants.id))
          .where(whereClause)
          .orderBy(desc(securityAlerts.createdAt))
          .limit(limitVal)
          .offset(offsetVal),
        db.select({ total: sql<number>`count(*)::int` }).from(securityAlerts).where(whereClause),
      ]);

      return res.json({ data: rows, total: Number(total), limit: limitVal, offset: offsetVal });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  app.patch("/api/admin/security-alerts/:id/acknowledge", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as { id: string; name: string };
      const [alert] = await db.select().from(securityAlerts).where(eq(securityAlerts.id, req.params.id));
      if (!alert) return res.status(404).json({ message: "Alert not found" });

      const [updated] = await db.update(securityAlerts)
        .set({ acknowledged: true, acknowledgedBy: adminUser.id, acknowledgedAt: new Date() })
        .where(eq(securityAlerts.id, req.params.id))
        .returning();

      return res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ─── Audit Log CSV Export ─────────────────────────────────────────────────

  app.get("/api/admin/audit-log/export", requireSuperAdmin, async (req, res) => {
    try {
      const { tenantId, action, from, to } = req.query as Record<string, string>;

      const conditions = [];
      if (tenantId) conditions.push(eq(auditEvents.tenantId, tenantId));
      if (action) conditions.push(eq(auditEvents.action, action));
      if (from) conditions.push(gte(auditEvents.createdAt, new Date(from)));
      if (to) {
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1);
        conditions.push(lte(auditEvents.createdAt, toDate));
      }

      const rows = await db
        .select({
          id: auditEvents.id,
          createdAt: auditEvents.createdAt,
          tenantName: tenants.name,
          userName: auditEvents.userName,
          userEmail: users.email,
          action: auditEvents.action,
          entityType: auditEvents.entityType,
          entityName: auditEvents.entityName,
          ipAddress: auditEvents.ipAddress,
        })
        .from(auditEvents)
        .leftJoin(tenants, eq(auditEvents.tenantId, tenants.id))
        .leftJoin(users, eq(auditEvents.userId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditEvents.createdAt))
        .limit(10000);

      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      };

      const header = ["Timestamp", "Tenant", "User", "Email", "Action", "Entity Type", "Entity Name", "IP Address"];
      const csvRows = rows.map(r => [
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
        r.tenantName ?? "",
        r.userName ?? "",
        r.userEmail ? decryptField(r.userEmail) : "",
        r.action ?? "",
        r.entityType ?? "",
        r.entityName ?? "",
        r.ipAddress ?? "",
      ].map(escape).join(","));

      const csv = [header.join(","), ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().split("T")[0]}.csv"`);
      return res.send(csv);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ message });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Encryption key rotation — super_admin only
  // POST /api/admin/encryption/rotate-key
  // Body: { newKey: string }
  //
  // Re-encrypts all PII fields (users.email, users.phone, customers.email,
  // customers.phone, reservations.customerPhone, delivery_orders.customerPhone,
  // delivery_orders.driver_phone) from the current ENCRYPTION_KEY to the new
  // key.  Each tenant is committed in its own DB transaction so a failure in
  // one tenant does not affect others.
  //
  // After this completes, the operator MUST update the ENCRYPTION_KEY secret
  // to match newKey.  Until then decryption will use the old key (from the
  // running process), so the newly re-encrypted rows will appear garbled until
  // the process restarts with the new key.  The endpoint returns a warning
  // reminding the operator to do this.
  // ───────────────────────────────────────────────────────────────────────────

  app.post("/api/admin/encryption/rotate-key", requireSuperAdmin, async (req, res) => {
    const bodySchema = z.object({
      newKey: z.string().min(16, "New key must be at least 16 characters"),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
    }

    const oldRaw = process.env.ENCRYPTION_KEY;
    if (!oldRaw) {
      return res.status(500).json({ message: "ENCRYPTION_KEY environment variable is not set on this server" });
    }

    const { newKey: newRaw } = parsed.data;
    if (oldRaw === newRaw) {
      return res.status(400).json({ message: "New key is identical to the current key — nothing to rotate" });
    }

    const oldKey = deriveKey(oldRaw);
    const newKey = deriveKey(newRaw);

    const adminUser = req.user as { id: string; name: string };
    let tenantsProcessed = 0;
    let fieldsRotated = 0;
    let fieldsSkipped = 0;
    const errors: Array<{ tenantId: string; error: string }> = [];

    const allTenants = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);

    for (const tenant of allTenants) {
      try {
        await db.transaction(async (tx) => {
          let tenantRotated = 0;
          let tenantSkipped = 0;

          const tenantUsers = await tx.select({ id: users.id, email: users.email, phone: users.phone })
            .from(users).where(eq(users.tenantId, tenant.id));

          for (const u of tenantUsers) {
            const updates: Record<string, string> = {};
            const emailRes = rotateField(u.email, oldKey, newKey);
            if (emailRes.rotated && emailRes.result != null) { updates.email = emailRes.result; tenantRotated++; }
            else if (emailRes.skipped) tenantSkipped++;
            const phoneRes = rotateField(u.phone, oldKey, newKey);
            if (phoneRes.rotated && phoneRes.result != null) { updates.phone = phoneRes.result; tenantRotated++; }
            else if (phoneRes.skipped) tenantSkipped++;
            if (Object.keys(updates).length > 0) {
              await tx.update(users).set(updates).where(eq(users.id, u.id));
            }
          }

          const tenantCustomers = await tx.select({ id: customers.id, email: customers.email, phone: customers.phone })
            .from(customers).where(eq(customers.tenantId, tenant.id));

          for (const c of tenantCustomers) {
            const updates: Record<string, string> = {};
            const emailRes = rotateField(c.email, oldKey, newKey);
            if (emailRes.rotated && emailRes.result != null) { updates.email = emailRes.result; tenantRotated++; }
            else if (emailRes.skipped) tenantSkipped++;
            const phoneRes = rotateField(c.phone, oldKey, newKey);
            if (phoneRes.rotated && phoneRes.result != null) { updates.phone = phoneRes.result; tenantRotated++; }
            else if (phoneRes.skipped) tenantSkipped++;
            if (Object.keys(updates).length > 0) {
              await tx.update(customers).set(updates).where(eq(customers.id, c.id));
            }
          }

          const tenantReservations = await tx.select({ id: reservations.id, customerPhone: reservations.customerPhone })
            .from(reservations).where(eq(reservations.tenantId, tenant.id));

          for (const r of tenantReservations) {
            const phoneRes = rotateField(r.customerPhone, oldKey, newKey);
            if (phoneRes.rotated && phoneRes.result != null) {
              await tx.update(reservations)
                .set({ customerPhone: phoneRes.result })
                .where(eq(reservations.id, r.id));
              tenantRotated++;
            } else if (phoneRes.skipped) tenantSkipped++;
          }

          const tenantDeliveries = await tx.select({
            id: deliveryOrders.id,
            customerPhone: deliveryOrders.customerPhone,
            driverPhone: deliveryOrders.driverPhone,
          }).from(deliveryOrders).where(eq(deliveryOrders.tenantId, tenant.id));

          for (const d of tenantDeliveries) {
            const updates: Record<string, string> = {};
            const cpRes = rotateField(d.customerPhone, oldKey, newKey);
            if (cpRes.rotated && cpRes.result != null) { updates.customerPhone = cpRes.result; tenantRotated++; }
            else if (cpRes.skipped) tenantSkipped++;
            const dpRes = rotateField(d.driverPhone, oldKey, newKey);
            if (dpRes.rotated && dpRes.result != null) { updates.driverPhone = dpRes.result; tenantRotated++; }
            else if (dpRes.skipped) tenantSkipped++;
            if (Object.keys(updates).length > 0) {
              await tx.update(deliveryOrders).set(updates).where(eq(deliveryOrders.id, d.id));
            }
          }

          fieldsRotated += tenantRotated;
          fieldsSkipped += tenantSkipped;
        });

        tenantsProcessed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ tenantId: tenant.id, error: msg });
      }
    }

    await auditLog({
      tenantId: null,
      userId: adminUser.id,
      userName: adminUser.name,
      action: "encryption_key_rotated",
      entityType: "platform",
      entityId: "encryption",
      entityName: "Encryption Key Rotation",
      metadata: { tenantsProcessed, fieldsRotated, fieldsSkipped, errors: errors.length },
      req,
    });

    return res.json({
      tenantsProcessed,
      fieldsRotated,
      fieldsSkipped,
      errors,
      warning: "All PII fields have been re-encrypted with the new key. You MUST now update the ENCRYPTION_KEY secret and restart the server for decryption to work correctly with the new key.",
    });
  });
}
