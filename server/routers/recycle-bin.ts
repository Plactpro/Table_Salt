import type { Express } from "express";
import { pool } from "../db";
import { requireRole } from "../auth";

// ─── Recycle Bin Router ────────────────────────────────────────────────────
// Provides GET (list/grouped deleted items), POST restore, DELETE permanent purge.
// Restricted to owner/manager only. Items are auto-purged after 30 days (admin-migrations.ts).

const TABLES: Record<string, { table: string; labelCol: string }> = {
  menu_items:       { table: "menu_items",       labelCol: "name" },
  users:            { table: "users",             labelCol: "name" },
  customers:        { table: "customers",         labelCol: "name" },
  suppliers:        { table: "suppliers",         labelCol: "name" },
  inventory_items:  { table: "inventory_items",   labelCol: "name" },
  valet_tickets:    { table: "valet_tickets",     labelCol: "ticket_number" },
  purchase_orders:  { table: "purchase_orders",   labelCol: "po_number" },
  recipes:          { table: "recipes",           labelCol: "name" },
  promotion_rules:  { table: "promotion_rules",   labelCol: "name" },
  reservations:     { table: "reservations",      labelCol: "customer_name" },
};

// Days until permanent auto-purge
const PURGE_AFTER_DAYS = 30;
const WARN_DAYS_BEFORE_PURGE = 7;

export function registerRecycleBinRoutes(app: Express): void {
  // GET /api/recycle-bin — list all soft-deleted rows grouped by entity type
  app.get("/api/recycle-bin", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const grouped: Record<string, any[]> = {};

      for (const [entityType, cfg] of Object.entries(TABLES)) {
        const { rows } = await pool.query(
          `SELECT t.id, t.${cfg.labelCol} AS label, t.deleted_at, t.deleted_by,
                  u.name AS deleted_by_name,
                  EXTRACT(EPOCH FROM (t.deleted_at + INTERVAL '${PURGE_AFTER_DAYS} days' - NOW())) AS seconds_until_purge
           FROM ${cfg.table} t
           LEFT JOIN users u ON u.id = t.deleted_by
           WHERE t.tenant_id = $1 AND t.is_deleted = true
           ORDER BY t.deleted_at DESC
           LIMIT 100`,
          [user.tenantId]
        );
        grouped[entityType] = rows.map(r => ({
          id: r.id,
          label: r.label,
          entityType,
          deletedAt: r.deleted_at,
          deletedBy: r.deleted_by_name || r.deleted_by || null,
          secondsUntilPurge: Math.max(0, Math.round(Number(r.seconds_until_purge) || 0)),
          expiresWithin7Days: Number(r.seconds_until_purge) < WARN_DAYS_BEFORE_PURGE * 86400,
        }));
      }

      // Also return a flat list sorted by deletedAt for convenience
      const flat = Object.values(grouped).flat().sort((a, b) =>
        new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
      );

      res.json({ grouped, items: flat });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POST /api/recycle-bin/restore — restore by entityType + id
  app.post("/api/recycle-bin/restore", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { entityType, id } = req.body;
      const cfg = TABLES[entityType];
      if (!cfg) return res.status(400).json({ message: "Unknown entity type" });
      if (!id) return res.status(400).json({ message: "Missing id" });

      const { rowCount } = await pool.query(
        `UPDATE ${cfg.table} SET is_deleted = false, deleted_at = NULL, deleted_by = NULL
         WHERE id = $1 AND tenant_id = $2 AND is_deleted = true`,
        [id, user.tenantId]
      );
      if ((rowCount ?? 0) === 0) return res.status(404).json({ message: "Item not found or already restored" });
      res.json({ message: "Restored" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // DELETE /api/recycle-bin/permanent — permanently hard-delete (owner only)
  app.delete("/api/recycle-bin/permanent", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { entityType, id } = req.body;
      const cfg = TABLES[entityType];
      if (!cfg) return res.status(400).json({ message: "Unknown entity type" });
      if (!id) return res.status(400).json({ message: "Missing id" });

      const { rowCount } = await pool.query(
        `DELETE FROM ${cfg.table} WHERE id = $1 AND tenant_id = $2 AND is_deleted = true`,
        [id, user.tenantId]
      );
      if ((rowCount ?? 0) === 0) return res.status(404).json({ message: "Item not found or not in recycle bin" });
      res.json({ message: "Permanently deleted" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Keep path-param variants as aliases for backward compatibility
  app.post("/api/recycle-bin/:entityType/:id/restore", requireRole("owner", "manager"), async (req, res) => {
    req.body = { entityType: req.params.entityType, id: req.params.id };
    return res.redirect(307, "/api/recycle-bin/restore");
  });

  app.delete("/api/recycle-bin/:entityType/:id", requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const cfg = TABLES[req.params.entityType];
      if (!cfg) return res.status(400).json({ message: "Unknown entity type" });

      const { rowCount } = await pool.query(
        `DELETE FROM ${cfg.table} WHERE id = $1 AND tenant_id = $2 AND is_deleted = true`,
        [req.params.id, user.tenantId]
      );
      if ((rowCount ?? 0) === 0) return res.status(404).json({ message: "Item not found or not in recycle bin" });
      res.json({ message: "Permanently deleted" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
