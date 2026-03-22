import type { Express } from "express";
import { requireAuth } from "../auth";
import { pool } from "../db";
import { generateAndSaveReport, calculateMenuCapacity } from "../services/stock-capacity";
import { runNightlyReports } from "../services/stock-report-scheduler";

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

export function registerStockReportsRoutes(app: Express): void {
  const ALLOWED_ROLES = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"];

  function checkRole(req: any, res: any): boolean {
    if (!ALLOWED_ROLES.includes(req.user?.role)) {
      res.status(403).json({ error: "Forbidden" });
      return false;
    }
    return true;
  }

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
      const date = targetDate || new Date().toISOString().slice(0, 10);

      const summary = await calculateMenuCapacity(tenantId, outletId || null, date);
      res.json(summary);
    } catch (err) {
      console.error("[stock-reports] preview error:", err);
      res.status(500).json({ error: "Failed to preview capacity" });
    }
  });

  // GET /api/stock-reports/planned-quantities — must be BEFORE /:id
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

  // PATCH /api/stock-reports/:id/acknowledge
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

  // PUT /api/stock-reports/planned-quantities — upsert planned quantities
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

      for (const item of items) {
        await pool.query(
          `INSERT INTO daily_planned_quantities
           (tenant_id, outlet_id, menu_item_id, planned_date, planned_qty, is_disabled, max_limit, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (tenant_id, menu_item_id, planned_date) DO UPDATE
           SET planned_qty = EXCLUDED.planned_qty,
               is_disabled = EXCLUDED.is_disabled,
               max_limit = EXCLUDED.max_limit,
               updated_at = now()`,
          [tenantId, outletId || null, item.menuItemId, targetDate, item.plannedQty,
           item.isDisabled ?? false, item.maxLimit ?? null, req.user.id]
        );
      }
      res.json({ ok: true, updated: items.length });
    } catch (err) {
      console.error("[stock-reports] planned-quantities PUT error:", err);
      res.status(500).json({ error: "Failed to save planned quantities" });
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
