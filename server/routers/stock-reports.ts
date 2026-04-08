import type { Express } from "express";
import { requireAuth } from "../auth";
import { pool } from "../db";
import { generateAndSaveReport, calculateMenuCapacity } from "../services/stock-capacity";
import { runNightlyReports, runReportsForTenant } from "../services/stock-report-scheduler";

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function rowToCamel(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    out[snakeToCamel(key)] =
      val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)
        ? rowToCamel(val)
        : val;
  }
  return out;
}

function rowsToCamel(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map(rowToCamel);
}

async function upsertPlannedQty(
  tenantId: string,
  outletId: string | null,
  menuItemId: string,
  plannedDate: string,
  plannedQty: number,
  isDisabled: boolean,
  maxLimit: number | null,
  createdBy: string,
  disabledReason?: string | null
): Promise<Record<string, any>> {
  const outletFilter = outletId ? "AND outlet_id = $4" : "AND outlet_id IS NULL";
  const params: any[] = [tenantId, menuItemId, plannedDate];
  if (outletId) params.push(outletId);

  const existingIdx = params.length + 1;
  const { rows: existing } = await pool.query(
    `SELECT id FROM daily_planned_quantities
     WHERE tenant_id = $1 AND menu_item_id = $2 AND planned_date = $3 ${outletFilter}
     LIMIT 1`,
    params
  );

  if (existing.length > 0) {
    const sets: string[] = ["planned_qty = $2", "is_disabled = $3", "max_limit = $4", "updated_at = now()"];
    const upParams: any[] = [existing[0].id, plannedQty, isDisabled, maxLimit];
    if (disabledReason !== undefined) {
      upParams.push(disabledReason);
      sets.push(`disabled_reason = $${upParams.length}`);
    }
    const { rows } = await pool.query(
      `UPDATE daily_planned_quantities SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
      upParams
    );
    return rows[0];
  } else {
    const { rows } = await pool.query(
      `INSERT INTO daily_planned_quantities
       (tenant_id, outlet_id, menu_item_id, planned_date, planned_qty, is_disabled, max_limit, disabled_reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tenantId, outletId, menuItemId, plannedDate, plannedQty, isDisabled, maxLimit,
       disabledReason ?? null, createdBy]
    );
    return rows[0];
  }
}

async function validateOutletBelongsToTenant(tenantId: string, outletId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT id FROM outlets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [outletId, tenantId]
  );
  return rows.length > 0;
}

export function registerStockReportsRoutes(app: Express): void {
  const ALLOWED_ROLES = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"];

  function checkRole(req: any, res: any): boolean {
    if (!ALLOWED_ROLES.includes(req.user?.role)) {
      res.status(403).json({ error: "Forbidden" });
      return false;
    }
    return true;
  }

  // GET /api/stock-reports/scheduler/status — must be BEFORE /:id
  app.get("/api/stock-reports/scheduler/status", requireAuth, (req: any, res) => {
    if (!checkRole(req, res)) return;
    res.json({
      status: "running",
      schedule: "0 23 * * *",
      description: "Nightly stock capacity reports scheduled at 23:00 for all active tenants",
    });
  });

  // POST /api/stock-reports/scheduler/run-now — tenant-scoped manual trigger
  app.post("/api/stock-reports/scheduler/run-now", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { outletId } = req.body as { outletId?: string };

      if (outletId) {
        const valid = await validateOutletBelongsToTenant(tenantId, outletId);
        if (!valid) return res.status(403).json({ error: "Outlet does not belong to your tenant" });
      }

      await runReportsForTenant(tenantId, outletId ?? null);
      res.json({ ok: true, message: "Stock capacity reports generated for your outlets" });
    } catch (err) {
      console.error("[stock-reports] scheduler run-now error:", err);
      res.status(500).json({ error: "Failed to generate reports" });
    }
  });

  // GET /api/stock-reports — list reports for tenant
  app.get("/api/stock-reports", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const { outletId, limit = "30", offset = "0" } = req.query as Record<string, string>;
      const tenantId = req.user.tenantId;

      let query = `
        SELECT r.*, o.name AS outlet_name
        FROM stock_check_reports r
        LEFT JOIN outlets o ON o.id = r.outlet_id
        WHERE r.tenant_id = $1
      `;
      const params: any[] = [tenantId];
      if (outletId) {
        params.push(outletId);
        query += ` AND r.outlet_id = $${params.length}`;
      }
      query += ` ORDER BY r.generated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), parseInt(offset));

      const { rows } = await pool.query(query, params);
      res.json(rowsToCamel(rows));
    } catch (err) {
      console.error("[stock-reports] list error:", err);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // GET /api/stock-reports/latest — specific routes must come BEFORE /:id
  app.get("/api/stock-reports/latest", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const { outletId } = req.query as Record<string, string>;
      const tenantId = req.user.tenantId;

      let query = `
        SELECT r.*, o.name AS outlet_name
        FROM stock_check_reports r
        LEFT JOIN outlets o ON o.id = r.outlet_id
        WHERE r.tenant_id = $1
      `;
      const params: any[] = [tenantId];
      if (outletId) {
        params.push(outletId);
        query += ` AND r.outlet_id = $${params.length}`;
      }
      query += ` ORDER BY r.generated_at DESC LIMIT 1`;

      const { rows } = await pool.query(query, params);
      res.json(rows[0] ? rowToCamel(rows[0]) : null);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch latest report" });
    }
  });

  // GET /api/stock-reports/preview — live preview without saving (must be BEFORE /:id)
  app.get("/api/stock-reports/preview", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const { outletId, targetDate } = req.query as Record<string, string>;
      const tenantId = req.user.tenantId;

      if (outletId) {
        const valid = await validateOutletBelongsToTenant(tenantId, outletId);
        if (!valid) return res.status(403).json({ error: "Outlet does not belong to your tenant" });
      }

      const date = targetDate || new Date().toISOString().slice(0, 10);
      const summary = await calculateMenuCapacity(tenantId, outletId || null, date);
      res.json(summary);
    } catch (err) {
      console.error("[stock-reports] preview error:", err);
      res.status(500).json({ error: "Failed to preview capacity" });
    }
  });

  // GET /api/stock-reports/:id — generic ID route (must come AFTER specific named routes)
  app.get("/api/stock-reports/:id", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      const { rows: rpt } = await pool.query(
        `SELECT r.*, o.name AS outlet_name
         FROM stock_check_reports r
         LEFT JOIN outlets o ON o.id = r.outlet_id
         WHERE r.id = $1 AND r.tenant_id = $2`,
        [id, tenantId]
      );
      if (!rpt[0]) return res.status(404).json({ error: "Report not found" });

      const { rows: items } = await pool.query(
        `SELECT * FROM stock_check_report_items WHERE report_id = $1 ORDER BY category, menu_item_name`,
        [id]
      );

      res.json({ ...rowToCamel(rpt[0]), items: rowsToCamel(items) });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // POST /api/stock-reports/generate — generate a new report on demand
  app.post("/api/stock-reports/generate", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { outletId, targetDate } = req.body as { outletId?: string; targetDate?: string };

      if (outletId) {
        const valid = await validateOutletBelongsToTenant(tenantId, outletId);
        if (!valid) return res.status(403).json({ error: "Outlet does not belong to your tenant" });
      }

      const date = targetDate || new Date().toISOString().slice(0, 10);
      const reportId = await generateAndSaveReport(
        tenantId,
        outletId || null,
        date,
        "MANUAL",
        req.user.id
      );

      const { rows } = await pool.query(
        `SELECT r.*, o.name AS outlet_name FROM stock_check_reports r
         LEFT JOIN outlets o ON o.id = r.outlet_id WHERE r.id = $1`,
        [reportId]
      );
      const { rows: items } = await pool.query(
        `SELECT * FROM stock_check_report_items WHERE report_id = $1 ORDER BY category, menu_item_name`,
        [reportId]
      );

      res.json({ ...rowToCamel(rows[0]), items: rowsToCamel(items) });
    } catch (err) {
      console.error("[stock-reports] generate error:", err);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // PUT /api/stock-reports/:id/acknowledge
  app.put("/api/stock-reports/:id/acknowledge", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { actionsTaken } = req.body as { actionsTaken?: string };

      const { rows } = await pool.query(
        `UPDATE stock_check_reports
         SET acknowledged_by = $1, acknowledged_at = now(), actions_taken = $2
         WHERE id = $3 AND tenant_id = $4 RETURNING *`,
        [req.user.id, actionsTaken ? JSON.stringify({ note: actionsTaken }) : null, id, tenantId]
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      res.status(500).json({ error: "Failed to acknowledge" });
    }
  });

  // PATCH /api/stock-reports/:id/acknowledge — alias for backward compat
  app.patch("/api/stock-reports/:id/acknowledge", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { actionsTaken } = req.body as { actionsTaken?: string };

      const { rows } = await pool.query(
        `UPDATE stock_check_reports
         SET acknowledged_by = $1, acknowledged_at = now(), actions_taken = $2
         WHERE id = $3 AND tenant_id = $4 RETURNING *`,
        [req.user.id, actionsTaken ? JSON.stringify({ note: actionsTaken }) : null, id, tenantId]
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      res.status(500).json({ error: "Failed to acknowledge" });
    }
  });

  // PUT /api/stock-reports/items/:id/disable — disable a menu item for a day
  app.put("/api/stock-reports/items/:id/disable", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { isDisabled = true, reason } = req.body as { isDisabled?: boolean; reason?: string };

      const { rows: itemRows } = await pool.query(
        `SELECT ri.*, r.target_date, r.outlet_id AS report_outlet_id
         FROM stock_check_report_items ri
         JOIN stock_check_reports r ON r.id = ri.report_id
         WHERE ri.id = $1 AND ri.tenant_id = $2`,
        [id, tenantId]
      );
      if (!itemRows[0]) return res.status(404).json({ error: "Item not found" });

      const item = itemRows[0];

      await pool.query(
        `UPDATE stock_check_report_items SET is_disabled = $1 WHERE id = $2 AND tenant_id = $3`,
        [isDisabled, id, tenantId]
      );

      await upsertPlannedQty(
        tenantId,
        item.report_outlet_id ?? null,
        item.menu_item_id,
        item.target_date,
        item.planned_quantity ?? 20,
        isDisabled,
        item.max_limit ?? null,
        req.user.id,
        reason ?? null
      );

      res.json({ ok: true, id, isDisabled });
    } catch (err) {
      console.error("[stock-reports] disable item error:", err);
      res.status(500).json({ error: "Failed to disable item" });
    }
  });

  // PUT /api/stock-reports/items/:id/set-max — set max serving limit for a day
  app.put("/api/stock-reports/items/:id/set-max", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { maxLimit } = req.body as { maxLimit: number };

      if (maxLimit == null || typeof maxLimit !== "number") {
        return res.status(400).json({ error: "maxLimit (number) is required" });
      }

      const { rows: itemRows } = await pool.query(
        `SELECT ri.*, r.target_date, r.outlet_id AS report_outlet_id
         FROM stock_check_report_items ri
         JOIN stock_check_reports r ON r.id = ri.report_id
         WHERE ri.id = $1 AND ri.tenant_id = $2`,
        [id, tenantId]
      );
      if (!itemRows[0]) return res.status(404).json({ error: "Item not found" });

      const item = itemRows[0];

      await pool.query(
        `UPDATE stock_check_report_items SET max_limit = $1 WHERE id = $2 AND tenant_id = $3`,
        [maxLimit, id, tenantId]
      );

      await upsertPlannedQty(
        tenantId,
        item.report_outlet_id ?? null,
        item.menu_item_id,
        item.target_date,
        item.planned_quantity ?? 20,
        item.is_disabled ?? false,
        maxLimit,
        req.user.id
      );

      res.json({ ok: true, id, maxLimit });
    } catch (err) {
      console.error("[stock-reports] set-max error:", err);
      res.status(500).json({ error: "Failed to set max limit" });
    }
  });

  // ─── /api/planned-quantities routes ───────────────────────────────────────

  // GET /api/planned-quantities — fetch by date + outletId
  app.get("/api/planned-quantities", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const { targetDate, outletId } = req.query as Record<string, string>;
      const tenantId = req.user.tenantId;
      const date = targetDate || new Date().toISOString().slice(0, 10);

      if (outletId) {
        const valid = await validateOutletBelongsToTenant(tenantId, outletId);
        if (!valid) return res.status(403).json({ error: "Outlet does not belong to your tenant" });
      }

      const { rows } = await pool.query(
        `SELECT dpq.*, mi.name AS menu_item_name
         FROM daily_planned_quantities dpq
         JOIN menu_items mi ON mi.id = dpq.menu_item_id
         WHERE dpq.tenant_id = $1 AND dpq.planned_date = $2 ${outletId ? "AND dpq.outlet_id = $3" : "AND dpq.outlet_id IS NULL"}
         ORDER BY mi.name`,
        outletId ? [tenantId, date, outletId] : [tenantId, date]
      );
      res.json(rowsToCamel(rows));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch planned quantities" });
    }
  });

  // POST /api/planned-quantities — create or bulk-upsert
  app.post("/api/planned-quantities", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const body = req.body as {
        items?: { menuItemId: string; plannedQty: number; isDisabled?: boolean; maxLimit?: number }[];
        menuItemId?: string;
        plannedQty?: number;
        targetDate?: string;
        outletId?: string;
        isDisabled?: boolean;
        maxLimit?: number;
      };

      const targetDate = body.targetDate || new Date().toISOString().slice(0, 10);
      const outletId = body.outletId || null;

      if (outletId) {
        const valid = await validateOutletBelongsToTenant(tenantId, outletId);
        if (!valid) return res.status(403).json({ error: "Outlet does not belong to your tenant" });
      }

      if (Array.isArray(body.items)) {
        for (const item of body.items) {
          await upsertPlannedQty(
            tenantId, outletId, item.menuItemId, targetDate,
            item.plannedQty, item.isDisabled ?? false, item.maxLimit ?? null, req.user.id
          );
        }
        res.json({ ok: true, updated: body.items.length });
      } else if (body.menuItemId && body.plannedQty != null) {
        const row = await upsertPlannedQty(
          tenantId, outletId, body.menuItemId, targetDate,
          body.plannedQty, body.isDisabled ?? false, body.maxLimit ?? null, req.user.id
        );
        res.json(rowToCamel(row));
      } else {
        res.status(400).json({ error: "Provide items[] array or menuItemId+plannedQty" });
      }
    } catch (err) {
      console.error("[planned-quantities] POST error:", err);
      res.status(500).json({ error: "Failed to save planned quantities" });
    }
  });

  // PUT /api/planned-quantities/:id — update a single planned quantity record
  app.put("/api/planned-quantities/:id", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { plannedQty, isDisabled, maxLimit, disabledReason } = req.body as {
        plannedQty?: number;
        isDisabled?: boolean;
        maxLimit?: number | null;
        disabledReason?: string;
      };

      const sets: string[] = ["updated_at = now()"];
      const params: any[] = [id, tenantId];

      if (plannedQty != null) { params.push(plannedQty); sets.push(`planned_qty = $${params.length}`); }
      if (isDisabled != null) { params.push(isDisabled); sets.push(`is_disabled = $${params.length}`); }
      if (maxLimit !== undefined) { params.push(maxLimit); sets.push(`max_limit = $${params.length}`); }
      if (disabledReason != null) { params.push(disabledReason); sets.push(`disabled_reason = $${params.length}`); }

      const { rows } = await pool.query(
        `UPDATE daily_planned_quantities SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        params
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      res.json(rowToCamel(rows[0]));
    } catch (err) {
      res.status(500).json({ error: "Failed to update planned quantity" });
    }
  });

  // Backward-compat: GET /api/stock-reports/planned-quantities
  app.get("/api/stock-reports/planned-quantities", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const { targetDate, outletId } = req.query as Record<string, string>;
      const tenantId = req.user.tenantId;
      const date = targetDate || new Date().toISOString().slice(0, 10);

      const { rows } = await pool.query(
        `SELECT dpq.*, mi.name AS menu_item_name
         FROM daily_planned_quantities dpq
         JOIN menu_items mi ON mi.id = dpq.menu_item_id
         WHERE dpq.tenant_id = $1 AND dpq.planned_date = $2 ${outletId ? "AND dpq.outlet_id = $3" : ""}
         ORDER BY mi.name`,
        outletId ? [tenantId, date, outletId] : [tenantId, date]
      );
      res.json(rowsToCamel(rows));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch planned quantities" });
    }
  });

  // PUT /api/stock-reports/planned-quantities — upsert planned quantities (batch)
  app.put("/api/stock-reports/planned-quantities", requireAuth, async (req: any, res) => {
    if (!checkRole(req, res)) return;
    try {
      const tenantId = req.user.tenantId;
      const { items, targetDate, outletId } = req.body as {
        items: { menuItemId: string; plannedQty: number; isDisabled?: boolean; maxLimit?: number }[];
        targetDate: string;
        outletId?: string;
      };

      if (!Array.isArray(items) || !targetDate) {
        return res.status(400).json({ error: "items[] and targetDate are required" });
      }

      const resolvedOutletId = outletId || null;
      if (resolvedOutletId) {
        const valid = await validateOutletBelongsToTenant(tenantId, resolvedOutletId);
        if (!valid) return res.status(403).json({ error: "Outlet does not belong to your tenant" });
      }

      for (const item of items) {
        await upsertPlannedQty(
          tenantId, resolvedOutletId, item.menuItemId, targetDate,
          item.plannedQty, item.isDisabled ?? false, item.maxLimit ?? null, req.user.id
        );
      }
      res.json({ ok: true, updated: items.length });
    } catch (err) {
      console.error("[stock-reports] planned-quantities PUT error:", err);
      res.status(500).json({ error: "Failed to save planned quantities" });
    }
  });

  // POST /api/stock-reports/trigger-nightly
  app.post("/api/stock-reports/trigger-nightly", requireAuth, async (req: any, res) => {
    if (req.user?.role !== "owner" && req.user?.role !== "franchise_owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      await runNightlyReports();
      res.json({ ok: true, message: "Nightly stock reports triggered" });
    } catch (err) {
      res.status(500).json({ error: "Failed to trigger nightly reports" });
    }
  });

  // DELETE /api/stock-reports/:id
  app.delete("/api/stock-reports/:id", requireAuth, async (req: any, res) => {
    if (req.user?.role !== "owner" && req.user?.role !== "franchise_owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
      await pool.query(`DELETE FROM stock_check_reports WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete report" });
    }
  });
}
