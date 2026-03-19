import type { Express } from "express";
import { db } from "./db";
import { eq, and, desc, sql, ilike, or, ne, gte, lte, not, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  tenants, users, outlets, orders, auditEvents,
} from "@shared/schema";
import { requireSuperAdmin } from "./auth";
import { hashPassword } from "./auth";
import { auditLog } from "./audit";
import { randomBytes } from "crypto";

const PLATFORM_TENANT_SLUG = "platform";

async function getPlatformTenantId(): Promise<string> {
  const [pt] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, PLATFORM_TENANT_SLUG));
  if (!pt) throw new Error("Platform tenant not found");
  return pt.id;
}

function safeUser(u: Record<string, unknown>) {
  const { password, totpSecret, recoveryCodes, passwordHistory, ...safe } = u as any;
  return safe;
}

export function registerAdminRoutes(app: Express) {

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  app.post("/api/admin/setup", async (req, res) => {
    try {
      const existing = await db.select({ id: users.id }).from(users)
        .where(eq(users.role as any, "super_admin"))
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Super admin already exists. Use login instead." });
      }
      const { username, password, name } = req.body;
      if (!username || !password || !name) {
        return res.status(400).json({ message: "username, password, and name are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const platformTenantId = await getPlatformTenantId();
      const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (existingUser.length > 0) {
        return res.status(409).json({ message: "Username already taken" });
      }
      const hashedPw = await hashPassword(password);
      const [newAdmin] = await db.insert(users).values({
        tenantId: platformTenantId,
        username,
        password: hashedPw,
        name,
        role: "super_admin" as any,
        active: true,
      }).returning();
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
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ─── Stats ────────────────────────────────────────────────────────────────

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
      }).from(tenants)
        .where(ne(tenants.id, platformTenantId))
        .groupBy(tenants.plan);

      const businessTypes = await db.select({
        businessType: tenants.businessType,
        count: sql<number>`count(*)::int`,
      }).from(tenants)
        .where(ne(tenants.id, platformTenantId))
        .groupBy(tenants.businessType);

      const [userStats] = await db.select({
        total: sql<number>`count(*)::int`,
      }).from(users).where(
        and(
          ne(users.tenantId, platformTenantId),
          ne(users.role as any, "super_admin")
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
        .where(
          and(
            ne(tenants.id, platformTenantId),
            gte(tenants.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(sql`date(created_at)`)
        .orderBy(sql`date(created_at)`);

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
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ─── Tenant Management ────────────────────────────────────────────────────

  app.get("/api/admin/tenants", requireSuperAdmin, async (req, res) => {
    try {
      const platformTenantId = await getPlatformTenantId();
      const { search, plan, active } = req.query as Record<string, string>;

      const allTenants = await db.select().from(tenants).where(ne(tenants.id, platformTenantId)).orderBy(desc(tenants.createdAt));

      let filtered = allTenants;
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(t => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
      }
      if (plan) filtered = filtered.filter(t => t.plan === plan);
      if (active !== undefined) filtered = filtered.filter(t => String(t.active) === active);

      const tenantIds = filtered.map(t => t.id);
      if (tenantIds.length === 0) return res.json([]);

      const userCounts = await db.select({
        tenantId: users.tenantId,
        count: sql<number>`count(*)::int`,
      }).from(users)
        .where(inArray(users.tenantId, tenantIds))
        .groupBy(users.tenantId);

      const outletCounts = await db.select({
        tenantId: outlets.tenantId,
        count: sql<number>`count(*)::int`,
      }).from(outlets)
        .where(inArray(outlets.tenantId, tenantIds))
        .groupBy(outlets.tenantId);

      const orderCounts = await db.select({
        tenantId: orders.tenantId,
        count: sql<number>`count(*)::int`,
      }).from(orders)
        .where(inArray(orders.tenantId, tenantIds))
        .groupBy(orders.tenantId);

      const ucMap = new Map(userCounts.map(r => [r.tenantId, r.count]));
      const ocMap = new Map(outletCounts.map(r => [r.tenantId, r.count]));
      const ordMap = new Map(orderCounts.map(r => [r.tenantId, r.count]));

      const result = filtered.map(t => ({
        ...t,
        userCount: ucMap.get(t.id) ?? 0,
        outletCount: ocMap.get(t.id) ?? 0,
        orderCount: ordMap.get(t.id) ?? 0,
      }));

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/tenants/:id", requireSuperAdmin, async (req, res) => {
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenant.id)).orderBy(users.name);
      const tenantOutlets = await db.select().from(outlets).where(eq(outlets.tenantId, tenant.id));

      const [orderStats] = await db.select({
        total: sql<number>`count(*)::int`,
      }).from(orders).where(eq(orders.tenantId, tenant.id));

      const recentAudit = await db.select().from(auditEvents)
        .where(eq(auditEvents.tenantId, tenant.id))
        .orderBy(desc(auditEvents.createdAt))
        .limit(20);

      return res.json({
        ...tenant,
        users: tenantUsers.map(safeUser),
        outlets: tenantOutlets,
        orderCount: orderStats?.total ?? 0,
        recentAuditEvents: recentAudit,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  const createTenantSchema = z.object({
    tenantName: z.string().min(2),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
    ownerName: z.string().min(2),
    ownerUsername: z.string().min(3).regex(/^[a-z0-9_]+$/, "Username must be lowercase alphanumeric with underscores"),
    ownerPassword: z.string().min(8),
    plan: z.enum(["basic", "standard", "premium", "enterprise"]).default("basic"),
    currency: z.string().default("USD"),
    timezone: z.string().default("UTC"),
    businessType: z.string().default("casual_dining"),
  });

  app.post("/api/admin/tenants", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      const parsed = createTenantSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      const { tenantName, slug, ownerName, ownerUsername, ownerPassword, plan, currency, timezone, businessType } = parsed.data;

      const existingSlug = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (existingSlug.length > 0) return res.status(409).json({ message: "Slug already taken" });

      const existingUsername = await db.select({ id: users.id }).from(users).where(eq(users.username, ownerUsername)).limit(1);
      if (existingUsername.length > 0) return res.status(409).json({ message: "Username already taken" });

      const hashedPw = await hashPassword(ownerPassword);

      const [newTenant] = await db.insert(tenants).values({
        name: tenantName,
        slug,
        plan,
        currency,
        timezone,
        businessType,
        active: true,
        moduleConfig: {},
      }).returning();

      await db.insert(outlets).values({
        tenantId: newTenant.id,
        name: "Main Branch",
        active: true,
      } as any);

      const [newOwner] = await db.insert(users).values({
        tenantId: newTenant.id,
        username: ownerUsername,
        password: hashedPw,
        name: ownerName,
        role: "owner" as any,
        active: true,
      }).returning();

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "tenant_created",
        entityType: "platform",
        entityId: newTenant.id,
        entityName: newTenant.name,
        after: { tenantName, slug, plan, ownerUsername },
        req,
      });

      return res.status(201).json({ tenant: newTenant, owner: safeUser(newOwner) });
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ message: "Slug or username already taken" });
      return res.status(500).json({ message: err.message });
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
      const adminUser = req.user as any;
      const parsed = updateTenantSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });

      const platformTenantId = await getPlatformTenantId();
      if (req.params.id === platformTenantId) return res.status(403).json({ message: "Cannot modify platform tenant" });

      const [before] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
      if (!before) return res.status(404).json({ message: "Tenant not found" });

      const [updated] = await db.update(tenants).set(parsed.data).where(eq(tenants.id, req.params.id)).returning();

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

      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/tenants/:id/suspend", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      const platformTenantId = await getPlatformTenantId();
      if (req.params.id === platformTenantId) return res.status(403).json({ message: "Cannot suspend platform tenant" });

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!tenant.active) return res.status(400).json({ message: "Tenant is already suspended" });

      const [updated] = await db.update(tenants).set({ active: false }).where(eq(tenants.id, req.params.id)).returning();

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: "tenant_suspended",
        entityType: "platform",
        entityId: req.params.id,
        entityName: tenant.name,
        metadata: { reason: req.body.reason || null },
        req,
      });

      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/tenants/:id/reactivate", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (tenant.active) return res.status(400).json({ message: "Tenant is already active" });

      const [updated] = await db.update(tenants).set({ active: true }).where(eq(tenants.id, req.params.id)).returning();

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
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ─── Cross-Tenant User Management ────────────────────────────────────────

  app.get("/api/admin/users", requireSuperAdmin, async (req, res) => {
    try {
      const platformTenantId = await getPlatformTenantId();
      const { tenantId, role, search } = req.query as Record<string, string>;

      const allUsers = await db
        .select({
          id: users.id,
          tenantId: users.tenantId,
          username: users.username,
          name: users.name,
          email: users.email,
          role: users.role,
          active: users.active,
          hourlyRate: users.hourlyRate,
          overtimeRate: users.overtimeRate,
          totpEnabled: users.totpEnabled,
          passwordChangedAt: users.passwordChangedAt,
          tenantName: tenants.name,
          tenantPlan: tenants.plan,
        })
        .from(users)
        .innerJoin(tenants, eq(users.tenantId, tenants.id))
        .where(ne(users.tenantId, platformTenantId))
        .orderBy(users.name);

      let filtered = allUsers;
      if (tenantId) filtered = filtered.filter(u => u.tenantId === tenantId);
      if (role) filtered = filtered.filter(u => u.role === role);
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(u =>
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q)
        );
      }

      return res.json(filtered);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/users/:id", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      const { active } = req.body as { active?: boolean };
      if (active === undefined) return res.status(400).json({ message: "active field is required" });

      const [target] = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!target) return res.status(404).json({ message: "User not found" });
      if ((target.role as string) === "super_admin") {
        return res.status(403).json({ message: "Cannot modify super admin accounts via this endpoint" });
      }

      const [updated] = await db.update(users).set({ active }).where(eq(users.id, req.params.id)).returning();

      await auditLog({
        tenantId: null,
        userId: adminUser.id,
        userName: adminUser.name,
        action: active ? "user_reactivated" : "user_deactivated",
        entityType: "platform",
        entityId: req.params.id,
        entityName: target.name,
        metadata: { targetTenantId: target.tenantId, targetRole: target.role },
        req,
      });

      return res.json(safeUser(updated));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/users/:id/reset-password", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      const [target] = await db.select().from(users).where(eq(users.id, req.params.id));
      if (!target) return res.status(404).json({ message: "User not found" });
      if ((target.role as string) === "super_admin") {
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

      return res.json({ tempPassword, message: "Password has been reset. Share this temporary password securely." });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ─── Impersonation ────────────────────────────────────────────────────────

  app.post("/api/admin/impersonate/:userId", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      const [target] = await db.select().from(users).where(eq(users.id, req.params.userId));
      if (!target) return res.status(404).json({ message: "User not found" });
      if ((target.role as string) === "super_admin") {
        return res.status(403).json({ message: "Cannot impersonate another super admin" });
      }
      if (!target.active) {
        return res.status(403).json({ message: "Cannot impersonate a deactivated user" });
      }

      const session = req.session as Record<string, unknown>;
      session.superAdminBackup = {
        userId: adminUser.id,
        userName: adminUser.name,
        tenantId: adminUser.tenantId,
        role: adminUser.role,
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

      req.login(target, (err) => {
        if (err) return res.status(500).json({ message: "Failed to switch session" });
        return res.json({ message: "Impersonation started", user: safeUser(target) });
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/impersonate/end", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

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

      const currentUser = req.user as any;
      await auditLog({
        tenantId: null,
        userId: backup.userId,
        userName: backup.userName,
        action: "impersonation_end",
        entityType: "platform",
        entityId: currentUser?.id,
        entityName: currentUser?.name,
        metadata: { impersonatedTenantId: currentUser?.tenantId, impersonatedRole: currentUser?.role },
        req,
      });

      delete session.superAdminBackup;

      req.login(originalAdmin, (err) => {
        if (err) return res.status(500).json({ message: "Failed to restore session" });
        return res.json({ message: "Returned to admin session", user: safeUser(originalAdmin) });
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/impersonation/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.json({ isImpersonating: false });
    const session = req.session as Record<string, unknown>;
    const backup = session.superAdminBackup as Record<string, unknown> | undefined;
    if (!backup) return res.json({ isImpersonating: false });
    return res.json({
      isImpersonating: true,
      originalAdmin: {
        userId: backup.userId,
        userName: backup.userName,
        role: backup.role,
      },
    });
  });

  // ─── Audit Log ────────────────────────────────────────────────────────────

  app.get("/api/admin/audit-log", requireSuperAdmin, async (req, res) => {
    try {
      const { tenantId, userId, action, from, to, limit } = req.query as Record<string, string>;
      const limitNum = Math.min(parseInt(limit || "100"), 500);

      const events = await db
        .select({
          id: auditEvents.id,
          tenantId: auditEvents.tenantId,
          userId: auditEvents.userId,
          userName: auditEvents.userName,
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
        .where(
          and(
            tenantId ? eq(auditEvents.tenantId, tenantId) : undefined,
            userId ? eq(auditEvents.userId, userId) : undefined,
            action ? eq(auditEvents.action, action) : undefined,
            from ? gte(auditEvents.createdAt, new Date(from)) : undefined,
            to ? lte(auditEvents.createdAt, new Date(to)) : undefined,
          )
        )
        .orderBy(desc(auditEvents.createdAt))
        .limit(limitNum);

      return res.json(events);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
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
      }).from(users).where(eq(users.role as any, "super_admin")).orderBy(users.name);
      return res.json(admins);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  const createSuperAdminSchema = z.object({
    username: z.string().min(3).regex(/^[a-z0-9_]+$/),
    name: z.string().min(2),
    email: z.string().email().optional(),
    password: z.string().min(8),
  });

  app.post("/api/admin/super-admins", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      const parsed = createSuperAdminSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });

      const platformTenantId = await getPlatformTenantId();
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, parsed.data.username)).limit(1);
      if (existing.length > 0) return res.status(409).json({ message: "Username already taken" });

      const hashedPw = await hashPassword(parsed.data.password);
      const [newAdmin] = await db.insert(users).values({
        tenantId: platformTenantId,
        username: parsed.data.username,
        password: hashedPw,
        name: parsed.data.name,
        email: parsed.data.email,
        role: "super_admin" as any,
        active: true,
      }).returning();

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

      return res.status(201).json(safeUser(newAdmin));
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ message: "Username already taken" });
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/super-admins/:id", requireSuperAdmin, async (req, res) => {
    try {
      const adminUser = req.user as any;
      if (req.params.id === adminUser.id) {
        return res.status(400).json({ message: "Cannot deactivate your own account" });
      }

      const [target] = await db.select().from(users).where(
        and(eq(users.id, req.params.id), eq(users.role as any, "super_admin"))
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
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });
}
