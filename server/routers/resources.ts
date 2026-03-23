import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { pool } from "../db";
import { emitToTenant } from "../realtime";
import {
  assignResourcesToTable,
  returnResourcesFromTable,
  checkAvailability,
  recalculateAvailability,
  getUpcomingReservationsNeedingResources,
} from "../services/resource-service";

export function registerResourceRoutes(app: Express): void {
  // GET /api/resources?outletId=... — list all resources for outlet (owner/manager only)
  app.get("/api/resources", requireRole("owner", "manager"), async (req: any, res: any) => {
    const user = req.user as any;
    const outletId = req.query.outletId as string;
    if (!outletId) return res.status(400).json({ message: "outletId required" });
    const resources = await storage.getSpecialResourcesByOutlet(user.tenantId, outletId);
    res.json(resources);
  });

  // POST /api/resources — create resource
  app.post("/api/resources", requireRole("owner", "manager"), async (req: any, res: any) => {
    const user = req.user as any;
    const { outletId, resourceCode, resourceName, resourceIcon, totalUnits, isTrackable, requiresSetupTime, notes } = req.body;
    if (!outletId || !resourceCode || !resourceName) {
      return res.status(400).json({ message: "outletId, resourceCode, and resourceName are required" });
    }

    const resource = await storage.createSpecialResource({
      tenantId: user.tenantId,
      outletId,
      resourceCode,
      resourceName,
      resourceIcon: resourceIcon ?? "🪑",
      totalUnits: totalUnits ?? 0,
      availableUnits: totalUnits ?? 0,
      isTrackable: isTrackable ?? true,
      requiresSetupTime: requiresSetupTime ?? 0,
      notes: notes ?? null,
      isActive: true,
    });

    // Auto-generate unit codes if trackable and totalUnits > 0
    if ((isTrackable ?? true) && (totalUnits ?? 0) > 0) {
      // Derive prefix from resource_code initials: HIGH_CHAIR -> HC, BOOSTER_SEAT -> BS
      const prefix = resourceCode.split(/[_\s]+/).map((w: string) => w[0] ?? "").join("").toUpperCase().slice(0, 3) || resourceCode.slice(0, 2).toUpperCase();
      for (let i = 1; i <= totalUnits; i++) {
        const unitCode = `${prefix}-${String(i).padStart(2, "0")}`;
        await storage.createResourceUnit({
          tenantId: user.tenantId,
          outletId,
          resourceId: resource.id,
          unitCode,
          unitName: `${resourceName} ${i}`,
          status: "available",
        });
      }
    }

    res.status(201).json(resource);
  });

  // PATCH /api/resources/:id — update resource
  app.patch("/api/resources/:id", requireRole("owner", "manager"), async (req: any, res: any) => {
    const user = req.user as any;
    const updated = await storage.updateSpecialResource(req.params.id, user.tenantId, req.body);
    if (!updated) return res.status(404).json({ message: "Resource not found" });
    await recalculateAvailability(req.params.id);
    res.json(updated);
  });

  // DELETE /api/resources/:id — soft delete
  app.delete("/api/resources/:id", requireRole("owner", "manager"), async (req: any, res: any) => {
    const user = req.user as any;
    await storage.deleteSpecialResource(req.params.id, user.tenantId);
    res.json({ message: "Resource deactivated" });
  });

  // GET /api/resources/availability?outletId=...
  app.get("/api/resources/availability", requireAuth, async (req: any, res: any) => {
    const user = req.user as any;
    const outletId = req.query.outletId as string;
    if (!outletId) return res.status(400).json({ message: "outletId required" });

    const { rows } = await pool.query(
      `SELECT sr.*,
        COALESCE(asgn.in_use_qty, 0) AS live_in_use,
        COALESCE(units_agg.cleaning_cnt, 0) AS live_cleaning,
        COALESCE(units_agg.damaged_cnt, 0) AS live_damaged,
        GREATEST(0,
          sr.total_units
          - COALESCE(asgn.in_use_qty, 0)
          - COALESCE(units_agg.cleaning_cnt, 0)
          - COALESCE(units_agg.damaged_cnt, 0)
        ) AS live_available
       FROM special_resources sr
       LEFT JOIN (
         SELECT resource_id,
           SUM(CASE WHEN status IN ('assigned','in_use') THEN quantity ELSE 0 END) AS in_use_qty
         FROM resource_assignments
         WHERE tenant_id = $1
         GROUP BY resource_id
       ) asgn ON asgn.resource_id = sr.id
       LEFT JOIN (
         SELECT resource_id,
           COUNT(*) FILTER (WHERE status = 'cleaning') AS cleaning_cnt,
           COUNT(*) FILTER (WHERE status = 'damaged') AS damaged_cnt
         FROM resource_units
         WHERE tenant_id = $1
         GROUP BY resource_id
       ) units_agg ON units_agg.resource_id = sr.id
       WHERE sr.tenant_id = $1 AND sr.outlet_id = $2 AND sr.is_active = true
       ORDER BY sr.resource_name ASC`,
      [user.tenantId, outletId]
    );

    res.json(rows.map((r: any) => {
      const liveInUse = parseInt(r.live_in_use ?? "0", 10);
      const liveCleaning = parseInt(r.live_cleaning ?? "0", 10);
      const liveDamaged = parseInt(r.live_damaged ?? "0", 10);
      const liveAvailable = parseInt(r.live_available ?? "0", 10);
      return {
        id: r.id,
        tenantId: r.tenant_id,
        outletId: r.outlet_id,
        resourceCode: r.resource_code,
        resourceName: r.resource_name,
        resourceIcon: r.resource_icon,
        totalUnits: r.total_units,
        availableUnits: liveAvailable,
        inUseUnits: liveInUse,
        underCleaningUnits: liveCleaning,
        damagedUnits: liveDamaged,
        isTrackable: r.is_trackable,
        requiresSetupTime: r.requires_setup_time,
        notes: r.notes,
        isActive: r.is_active,
      };
    }));
  });

  // POST /api/resources/check-availability
  app.post("/api/resources/check-availability", requireAuth, async (req: any, res: any) => {
    const user = req.user as any;
    const { outletId, resources } = req.body;
    if (!outletId || !Array.isArray(resources)) {
      return res.status(400).json({ message: "outletId and resources array required" });
    }
    // Normalize: accept either quantity or qty; reject invalid quantities
    const normalized = resources.map((r: any) => ({
      resourceId: r.resourceId,
      quantity: Math.max(1, parseInt(r.quantity ?? r.qty ?? "1", 10) || 1),
    }));
    const result = await checkAvailability(outletId, user.tenantId, normalized);
    res.json(result);
  });

  // GET /api/resources/:id/units
  app.get("/api/resources/:id/units", requireAuth, async (req: any, res: any) => {
    const user = req.user as any;
    const units = await storage.getResourceUnitsByResource(req.params.id, user.tenantId);
    res.json(units);
  });

  // POST /api/resources/:id/units
  app.post("/api/resources/:id/units", requireRole("owner", "manager"), async (req: any, res: any) => {
    const user = req.user as any;
    const { unitCode, unitName, status, notes } = req.body;
    if (!unitCode) return res.status(400).json({ message: "unitCode required" });

    const resourceRes = await pool.query(
      `SELECT outlet_id FROM special_resources WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, user.tenantId]
    );
    if (!resourceRes.rows[0]) return res.status(404).json({ message: "Resource not found" });

    const unit = await storage.createResourceUnit({
      tenantId: user.tenantId,
      outletId: resourceRes.rows[0].outlet_id,
      resourceId: req.params.id,
      unitCode,
      unitName: unitName ?? null,
      status: status ?? "available",
      notes: notes ?? null,
    });

    // Increment total_units on the parent resource and recalculate availability
    await pool.query(
      `UPDATE special_resources SET total_units = total_units + 1, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, user.tenantId]
    );
    recalculateAvailability(req.params.id).catch(() => {});

    res.status(201).json(unit);
  });

  // PATCH /api/resources/units/:unitId — manager+ required for status/inventory changes
  app.patch("/api/resources/units/:unitId", requireRole("owner", "manager", "supervisor"), async (req: any, res: any) => {
    const user = req.user as any;
    const updated = await storage.updateResourceUnit(req.params.unitId, req.body, user.tenantId);
    if (!updated) return res.status(404).json({ message: "Unit not found" });
    // Recalculate availability if status changed (damaged/cleaning/available affect counts)
    if (req.body.status !== undefined) {
      await recalculateAvailability(updated.resourceId);
    }
    res.json(updated);
  });

  // POST /api/resources/assign — supervisor+ required for resource operations
  app.post("/api/resources/assign", requireRole("owner", "manager", "supervisor"), async (req: any, res: any) => {
    const user = req.user as any;
    const { outletId, tableId, tableNumber, orderId, resources } = req.body;
    if (!outletId || !tableId || !Array.isArray(resources) || resources.length === 0) {
      return res.status(400).json({ message: "outletId, tableId, and resources array required" });
    }

    // Validate and clamp quantities — reject any resource without a valid resourceId
    const normalizedResources = resources.map((r: any) => ({
      ...r,
      quantity: Math.max(1, parseInt(r.quantity ?? r.qty ?? "1", 10) || 1),
    }));
    if (normalizedResources.some((r: any) => !r.resourceId)) {
      return res.status(400).json({ message: "Each resource must include resourceId" });
    }

    const result = await assignResourcesToTable({
      tenantId: user.tenantId,
      outletId,
      tableId,
      tableNumber,
      orderId,
      resources: normalizedResources,
      assignedBy: user.id,
      assignedByName: user.name ?? user.username,
    });

    if (!result.success) {
      return res.status(409).json({ message: result.message, conflicts: result.conflicts });
    }

    emitToTenant(user.tenantId, "resource:updated", { outletId });
    res.status(201).json({ message: "Resources assigned successfully" });
  });

  // POST /api/resources/return — supervisor+ required
  app.post("/api/resources/return", requireRole("owner", "manager", "supervisor"), async (req: any, res: any) => {
    const user = req.user as any;
    const { tableId, requiresCleaning, outletId } = req.body;
    if (!tableId) return res.status(400).json({ message: "tableId required" });

    await returnResourcesFromTable(tableId, user.tenantId, requiresCleaning ?? false);
    emitToTenant(user.tenantId, "resource:updated", { outletId });
    res.json({ message: "Resources returned successfully" });
  });

  // PATCH /api/resources/assignments/:id — supervisor+ required
  app.patch("/api/resources/assignments/:id", requireRole("owner", "manager", "supervisor"), async (req: any, res: any) => {
    const user = req.user as any;
    const updated = await storage.updateResourceAssignment(req.params.id, req.body, user.tenantId);
    if (!updated) return res.status(404).json({ message: "Assignment not found" });
    // Recalculate if status or quantity changed — both affect live availability counts
    if (req.body.status !== undefined || req.body.quantity !== undefined) {
      await recalculateAvailability(updated.resourceId);
    }
    res.json(updated);
  });

  // GET /api/resources/cleaning?outletId=...
  app.get("/api/resources/cleaning", requireAuth, async (req: any, res: any) => {
    const user = req.user as any;
    const outletId = req.query.outletId as string;
    if (!outletId) return res.status(400).json({ message: "outletId required" });
    const logs = await storage.getResourceCleaningLog(outletId, user.tenantId);
    res.json(logs);
  });

  // POST /api/resources/cleaning
  app.post("/api/resources/cleaning", requireAuth, async (req: any, res: any) => {
    const user = req.user as any;
    const { resourceUnitId, cleaningType, completedAt, notes } = req.body;
    if (!resourceUnitId) return res.status(400).json({ message: "resourceUnitId required" });

    const unitRes = await pool.query(
      `SELECT ru.unit_code, ru.resource_id, sr.resource_name FROM resource_units ru
       JOIN special_resources sr ON sr.id = ru.resource_id
       WHERE ru.id = $1 AND ru.tenant_id = $2`,
      [resourceUnitId, user.tenantId]
    );
    if (!unitRes.rows[0]) return res.status(404).json({ message: "Resource unit not found" });
    const unit = unitRes.rows[0];

    const log = await storage.createResourceCleaningLog({
      tenantId: user.tenantId,
      resourceUnitId,
      unitCode: unit.unit_code ?? null,
      resourceName: unit.resource_name ?? null,
      cleaningType: cleaningType ?? "STANDARD",
      completedAt: completedAt ? new Date(completedAt) : null,
      cleanedBy: user.id,
      cleanedByName: user.name ?? user.username,
      notes: notes ?? null,
    });

    if (completedAt) {
      await storage.updateResourceUnit(resourceUnitId, {
        status: "available",
        lastCleanedAt: new Date(completedAt),
      }, user.tenantId);
    } else {
      await storage.updateResourceUnit(resourceUnitId, { status: "cleaning" }, user.tenantId);
    }

    // Recalculate availability — cleaning start/end changes unit status counts
    await recalculateAvailability(unit.resource_id);

    res.status(201).json(log);
  });

  // GET /api/resources/upcoming-needs?outletId=...
  app.get("/api/resources/upcoming-needs", requireAuth, async (req: any, res: any) => {
    const user = req.user as any;
    const outletId = req.query.outletId as string;
    if (!outletId) return res.status(400).json({ message: "outletId required" });
    const data = await getUpcomingReservationsNeedingResources(user.tenantId, outletId);
    res.json(data);
  });
}
