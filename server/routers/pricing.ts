import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { pool } from "../db";
import { MenuCache } from "../lib/menu-cache";

function tenantGuard(req: any, res: any): string | null {
  const user = req.user as any;
  if (!user?.tenantId) { res.status(401).json({ message: "Unauthorized" }); return null; }
  return user.tenantId;
}

function roundTo(value: number, nearest: number): number {
  if (nearest <= 0) return value;
  return Math.round(value / nearest) * nearest;
}

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").trim(); });
    return obj;
  });
}

function toCSV(rows: any[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h] ?? "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","));
  }
  return lines.join("\n");
}

export function registerPricingRoutes(app: Express): void {

  // ─── Outlets ───────────────────────────────────────────────────────────────
  app.get("/api/pricing/outlets", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      res.json(outlets);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Overrides (per-outlet item price overrides) ───────────────────────────
  app.get("/api/pricing/overrides", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.query;
      if (!outletId || typeof outletId !== "string") {
        return res.status(400).json({ message: "outletId is required" });
      }
      const overrides = await storage.getOutletMenuOverrides(outletId, user.tenantId);
      res.json(overrides);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pricing/overrides", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, menuItemId, overridePrice, available } = req.body;
      if (!outletId || !menuItemId) {
        return res.status(400).json({ message: "outletId and menuItemId are required" });
      }
      const existing = await storage.getOutletMenuOverrides(outletId, user.tenantId);
      const existingOverride = existing.find(o => o.menuItemId === menuItemId);
      if (existingOverride) {
        const updated = await storage.updateOutletMenuOverride(existingOverride.id, user.tenantId, {
          overridePrice: overridePrice != null ? String(overridePrice) : existingOverride.overridePrice,
          available: available !== undefined ? available : existingOverride.available,
        });
        return res.json(updated);
      }
      const override = await storage.createOutletMenuOverride({
        tenantId: user.tenantId,
        outletId,
        menuItemId,
        overridePrice: overridePrice != null ? String(overridePrice) : null,
        available: available !== undefined ? available : true,
      });
      res.json(override);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pricing/overrides/bulk", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, updates } = req.body;
      if (!outletId || !Array.isArray(updates)) {
        return res.status(400).json({ message: "outletId and updates array are required" });
      }
      const existing = await storage.getOutletMenuOverrides(outletId, user.tenantId);
      const existingMap = new Map(existing.map(o => [o.menuItemId, o]));
      const results = [];
      for (const update of updates) {
        const { menuItemId, overridePrice, available } = update;
        if (!menuItemId) continue;
        const existingOverride = existingMap.get(menuItemId);
        if (existingOverride) {
          const updated = await storage.updateOutletMenuOverride(existingOverride.id, user.tenantId, {
            overridePrice: overridePrice != null ? String(overridePrice) : existingOverride.overridePrice,
            available: available !== undefined ? available : existingOverride.available,
          });
          results.push(updated);
        } else {
          const created = await storage.createOutletMenuOverride({
            tenantId: user.tenantId,
            outletId,
            menuItemId,
            overridePrice: overridePrice != null ? String(overridePrice) : null,
            available: available !== undefined ? available : true,
          });
          results.push(created);
        }
      }
      res.json({ updated: results.length, results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Price Rules (named adjustment rules) ─────────────────────────────────
  app.get("/api/pricing/rules", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.query;
      const { rows } = await pool.query(
        `SELECT * FROM price_rules WHERE tenant_id = $1 ${outletId ? "AND (outlet_id = $2 OR outlet_id IS NULL)" : ""} ORDER BY priority DESC, created_at DESC`,
        outletId ? [user.tenantId, outletId] : [user.tenantId]
      );
      res.json(rows);
    } catch (err: any) {
      if (err.message?.includes("price_rules") && err.message?.includes("does not exist")) {
        return res.json([]);
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pricing/rules", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const {
        name, outletId, ruleType, conditionValue, adjustmentType, adjustmentValue,
        applyTo, applyToRef, priority, validFrom, validTo, active
      } = req.body;
      if (!name || !ruleType || !adjustmentType || adjustmentValue == null) {
        return res.status(400).json({ message: "name, ruleType, adjustmentType, and adjustmentValue are required" });
      }
      await pool.query(
        `CREATE TABLE IF NOT EXISTS price_rules (
          id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(36) NOT NULL,
          outlet_id VARCHAR(36),
          name TEXT NOT NULL,
          rule_type TEXT NOT NULL,
          condition_value JSONB,
          adjustment_type TEXT NOT NULL,
          adjustment_value DECIMAL(10,2) NOT NULL,
          apply_to TEXT DEFAULT 'all',
          apply_to_ref TEXT,
          priority INTEGER DEFAULT 0,
          valid_from TIMESTAMP,
          valid_to TIMESTAMP,
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          created_by VARCHAR(36)
        )`
      );
      const { rows } = await pool.query(
        `INSERT INTO price_rules (tenant_id, outlet_id, name, rule_type, condition_value, adjustment_type, adjustment_value, apply_to, apply_to_ref, priority, valid_from, valid_to, active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          user.tenantId,
          outletId || null,
          name,
          ruleType,
          conditionValue ? JSON.stringify(conditionValue) : null,
          adjustmentType,
          adjustmentValue,
          applyTo || "all",
          applyToRef || null,
          priority || 0,
          validFrom || null,
          validTo || null,
          active !== false,
          user.id,
        ]
      );
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/pricing/rules/:id", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      const allowed = ["name", "rule_type", "condition_value", "adjustment_type", "adjustment_value", "apply_to", "apply_to_ref", "priority", "valid_from", "valid_to", "active", "outlet_id"];
      const mapping: Record<string, string> = {
        ruleType: "rule_type", conditionValue: "condition_value", adjustmentType: "adjustment_type",
        adjustmentValue: "adjustment_value", applyTo: "apply_to", applyToRef: "apply_to_ref",
        validFrom: "valid_from", validTo: "valid_to", outletId: "outlet_id",
      };
      for (const [key, val] of Object.entries(req.body)) {
        const col = mapping[key] || key;
        if (allowed.includes(col)) {
          fields.push(`${col} = $${idx++}`);
          values.push(val);
        }
      }
      if (!fields.length) return res.status(400).json({ message: "No valid fields to update" });
      values.push(req.params.id, user.tenantId);
      const { rows } = await pool.query(
        `UPDATE price_rules SET ${fields.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx++} RETURNING *`,
        values
      );
      if (!rows.length) return res.status(404).json({ message: "Rule not found" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/pricing/rules/:id", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      await pool.query("DELETE FROM price_rules WHERE id = $1 AND tenant_id = $2", [req.params.id, user.tenantId]);
      res.json({ message: "Deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Conflict check for named rules ───────────────────────────────────────
  app.post("/api/pricing/conflict-check", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, ruleType, conditionValue, applyTo, applyToRef, excludeRuleId } = req.body;

      let conflicts: any[] = [];
      try {
        const { rows } = await pool.query(
          `SELECT * FROM price_rules WHERE tenant_id = $1 AND (outlet_id = $2 OR outlet_id IS NULL) AND active = true
           AND rule_type = $3 ${excludeRuleId ? "AND id != $4" : ""}`,
          excludeRuleId ? [user.tenantId, outletId || null, ruleType, excludeRuleId] : [user.tenantId, outletId || null, ruleType]
        );
        conflicts = rows.filter((r: any) => {
          if (applyTo === "all" || r.apply_to === "all") return true;
          if (applyTo === r.apply_to && applyToRef === r.apply_to_ref) return true;
          return false;
        });
      } catch {}

      res.json({
        hasConflicts: conflicts.length > 0,
        conflicts: conflicts.map((c: any) => ({ id: c.id, name: c.name, priority: c.priority })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Price Resolution (single item) ───────────────────────────────────────
  app.post("/api/pricing/resolve", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { menuItemId, outletId, orderType, orderTime } = req.body;
      if (!menuItemId) return res.status(400).json({ message: "menuItemId is required" });

      const menuItem = await storage.getMenuItem(menuItemId, user.tenantId);
      if (!menuItem) {
        return res.status(404).json({ message: "Menu item not found" });
      }

      let resolvedPrice = Number(menuItem.price);
      let appliedRule: string | null = null;
      let ruleReason: string | null = null;

      if (outletId) {
        const overrides = await storage.getOutletMenuOverrides(outletId, user.tenantId);
        const override = overrides.find(o => o.menuItemId === menuItemId);
        if (override?.overridePrice) {
          resolvedPrice = Number(override.overridePrice);
        }
      }

      if (outletId) {
        try {
          const { rows: rules } = await pool.query(
            `SELECT * FROM price_rules WHERE tenant_id = $1 AND (outlet_id = $2 OR outlet_id IS NULL) AND active = true
             AND (valid_from IS NULL OR valid_from <= NOW()) AND (valid_to IS NULL OR valid_to >= NOW())
             ORDER BY priority DESC LIMIT 20`,
            [user.tenantId, outletId]
          );

          const now = orderTime ? new Date(orderTime) : new Date();
          for (const rule of rules) {
            let matches = false;
            if (rule.apply_to === "specific_item" && rule.apply_to_ref !== menuItemId) continue;
            if (rule.apply_to === "category" && rule.apply_to_ref !== menuItem.categoryId) continue;

            if (rule.rule_type === "ORDER_TYPE" && orderType) {
              const cv = rule.condition_value as { orderType?: string } | null;
              matches = !cv?.orderType || cv.orderType === orderType;
            } else if (rule.rule_type === "TIME_SLOT") {
              const cv = rule.condition_value as { startTime?: string; endTime?: string } | null;
              if (cv?.startTime && cv?.endTime) {
                const hour = now.getHours();
                const minute = now.getMinutes();
                const current = hour * 60 + minute;
                const [sh, sm] = (cv.startTime || "00:00").split(":").map(Number);
                const [eh, em] = (cv.endTime || "23:59").split(":").map(Number);
                const start = sh * 60 + (sm || 0);
                const end = eh * 60 + (em || 0);
                matches = current >= start && current <= end;
              } else {
                matches = true;
              }
            } else if (rule.rule_type === "DAY_BASED") {
              const cv = rule.condition_value as { days?: number[] } | null;
              if (cv?.days && Array.isArray(cv.days)) {
                matches = cv.days.includes(now.getDay());
              } else {
                matches = true;
              }
            } else if (rule.rule_type === "OUTLET_BASE") {
              matches = true;
            } else {
              matches = true;
            }

            if (matches) {
              const adj = Number(rule.adjustment_value);
              if (rule.adjustment_type === "fixed") {
                resolvedPrice = adj;
              } else if (rule.adjustment_type === "increase_pct") {
                resolvedPrice = resolvedPrice * (1 + adj / 100);
              } else if (rule.adjustment_type === "decrease_pct") {
                resolvedPrice = resolvedPrice * (1 - adj / 100);
              } else if (rule.adjustment_type === "increase_fixed") {
                resolvedPrice = resolvedPrice + adj;
              } else if (rule.adjustment_type === "decrease_fixed") {
                resolvedPrice = resolvedPrice - adj;
              }
              resolvedPrice = Math.max(0, resolvedPrice);
              appliedRule = rule.id;
              ruleReason = rule.name;
              break;
            }
          }
        } catch {
        }
      }

      res.json({
        menuItemId,
        basePrice: Number(menuItem.price),
        resolvedPrice: Math.round(resolvedPrice * 100) / 100,
        appliedRule,
        ruleReason,
        hasRule: appliedRule !== null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Public guest pricing resolution (for QR ordering without auth) ────────
  app.post("/api/guest/pricing/resolve/batch", async (req, res) => {
    try {
      const { items, outletId, orderType, orderTime } = req.body;
      if (!Array.isArray(items) || !outletId) return res.status(400).json({ message: "items and outletId are required" });

      const outlet = await storage.getOutlet(outletId);
      if (!outlet) return res.status(404).json({ message: "Outlet not found" });
      const tenantId = outlet.tenantId;

      const menuItemsList = await storage.getMenuItemsByTenant(tenantId);
      const menuMap = new Map(menuItemsList.map(m => [m.id, m]));

      const overrides = await storage.getOutletMenuOverrides(outletId, tenantId);
      const overrideMap = new Map(overrides.map(o => [o.menuItemId, o.overridePrice]));

      let rules: any[] = [];
      try {
        const { rows } = await pool.query(
          `SELECT * FROM price_rules WHERE tenant_id = $1 AND (outlet_id = $2 OR outlet_id IS NULL) AND active = true
           AND (valid_from IS NULL OR valid_from <= NOW()) AND (valid_to IS NULL OR valid_to >= NOW())
           ORDER BY priority DESC LIMIT 50`,
          [tenantId, outletId]
        );
        rules = rows;
      } catch {}

      const now = orderTime ? new Date(orderTime) : new Date();
      const results: any[] = [];

      for (const reqItem of items) {
        const { menuItemId } = reqItem;
        const menuItem = menuMap.get(menuItemId);
        if (!menuItem) continue;

        let resolvedPrice = Number(menuItem.price);
        let appliedRule: string | null = null;
        let ruleReason: string | null = null;

        const overridePrice = overrideMap.get(menuItemId);
        if (overridePrice) resolvedPrice = Number(overridePrice);

        for (const rule of rules) {
          let matches = false;
          if (rule.apply_to === "specific_item" && rule.apply_to_ref !== menuItemId) continue;
          if (rule.apply_to === "category" && rule.apply_to_ref !== menuItem.categoryId) continue;

          if (rule.rule_type === "ORDER_TYPE" && orderType) {
            const cv = rule.condition_value as { orderType?: string } | null;
            matches = !cv?.orderType || cv.orderType === orderType;
          } else if (rule.rule_type === "TIME_SLOT") {
            const cv = rule.condition_value as { startTime?: string; endTime?: string } | null;
            if (cv?.startTime && cv?.endTime) {
              const hour = now.getHours();
              const minute = now.getMinutes();
              const current = hour * 60 + minute;
              const [sh, sm] = (cv.startTime || "00:00").split(":").map(Number);
              const [eh, em] = (cv.endTime || "23:59").split(":").map(Number);
              const start = sh * 60 + (sm || 0);
              const end = eh * 60 + (em || 0);
              matches = current >= start && current <= end;
            } else matches = true;
          } else if (rule.rule_type === "DAY_BASED") {
            const cv = rule.condition_value as { days?: number[] } | null;
            matches = cv?.days && Array.isArray(cv.days) ? cv.days.includes(now.getDay()) : true;
          } else {
            matches = true;
          }

          if (matches) {
            const adj = Number(rule.adjustment_value);
            if (rule.adjustment_type === "fixed") resolvedPrice = adj;
            else if (rule.adjustment_type === "increase_pct") resolvedPrice = resolvedPrice * (1 + adj / 100);
            else if (rule.adjustment_type === "decrease_pct") resolvedPrice = resolvedPrice * (1 - adj / 100);
            else if (rule.adjustment_type === "increase_fixed") resolvedPrice = resolvedPrice + adj;
            else if (rule.adjustment_type === "decrease_fixed") resolvedPrice = resolvedPrice - adj;
            resolvedPrice = Math.max(0, resolvedPrice);
            appliedRule = rule.id;
            ruleReason = rule.name;
            break;
          }
        }

        results.push({
          menuItemId,
          basePrice: Number(menuItem.price),
          resolvedPrice: Math.round(resolvedPrice * 100) / 100,
          appliedRule,
          ruleReason,
          hasRule: appliedRule !== null,
        });
      }

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Price Resolution Batch (authed, for POS) ─────────────────────────────
  app.post("/api/pricing/resolve/batch", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { items, outletId, orderType, orderTime } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ message: "items array is required" });

      const menuItemsList = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItemsList.map(m => [m.id, m]));

      let overrideMap = new Map<string, string | null>();
      if (outletId) {
        const overrides = await storage.getOutletMenuOverrides(outletId, user.tenantId);
        overrideMap = new Map(overrides.map(o => [o.menuItemId, o.overridePrice]));
      }

      let rules: any[] = [];
      if (outletId) {
        try {
          const { rows } = await pool.query(
            `SELECT * FROM price_rules WHERE tenant_id = $1 AND (outlet_id = $2 OR outlet_id IS NULL) AND active = true
             AND (valid_from IS NULL OR valid_from <= NOW()) AND (valid_to IS NULL OR valid_to >= NOW())
             ORDER BY priority DESC LIMIT 50`,
            [user.tenantId, outletId]
          );
          rules = rows;
        } catch {}
      }

      const now = orderTime ? new Date(orderTime) : new Date();
      const results: any[] = [];

      for (const reqItem of items) {
        const { menuItemId } = reqItem;
        const menuItem = menuMap.get(menuItemId);
        if (!menuItem) continue;

        let resolvedPrice = Number(menuItem.price);
        let appliedRule: string | null = null;
        let ruleReason: string | null = null;

        const overridePrice = overrideMap.get(menuItemId);
        if (overridePrice) resolvedPrice = Number(overridePrice);

        for (const rule of rules) {
          let matches = false;
          if (rule.apply_to === "specific_item" && rule.apply_to_ref !== menuItemId) continue;
          if (rule.apply_to === "category" && rule.apply_to_ref !== menuItem.categoryId) continue;

          if (rule.rule_type === "ORDER_TYPE" && orderType) {
            const cv = rule.condition_value as { orderType?: string } | null;
            matches = !cv?.orderType || cv.orderType === orderType;
          } else if (rule.rule_type === "TIME_SLOT") {
            const cv = rule.condition_value as { startTime?: string; endTime?: string } | null;
            if (cv?.startTime && cv?.endTime) {
              const hour = now.getHours();
              const minute = now.getMinutes();
              const current = hour * 60 + minute;
              const [sh, sm] = (cv.startTime || "00:00").split(":").map(Number);
              const [eh, em] = (cv.endTime || "23:59").split(":").map(Number);
              const start = sh * 60 + (sm || 0);
              const end = eh * 60 + (em || 0);
              matches = current >= start && current <= end;
            } else {
              matches = true;
            }
          } else if (rule.rule_type === "DAY_BASED") {
            const cv = rule.condition_value as { days?: number[] } | null;
            if (cv?.days && Array.isArray(cv.days)) {
              matches = cv.days.includes(now.getDay());
            } else {
              matches = true;
            }
          } else {
            matches = true;
          }

          if (matches) {
            const adj = Number(rule.adjustment_value);
            if (rule.adjustment_type === "fixed") {
              resolvedPrice = adj;
            } else if (rule.adjustment_type === "increase_pct") {
              resolvedPrice = resolvedPrice * (1 + adj / 100);
            } else if (rule.adjustment_type === "decrease_pct") {
              resolvedPrice = resolvedPrice * (1 - adj / 100);
            } else if (rule.adjustment_type === "increase_fixed") {
              resolvedPrice = resolvedPrice + adj;
            } else if (rule.adjustment_type === "decrease_fixed") {
              resolvedPrice = resolvedPrice - adj;
            }
            resolvedPrice = Math.max(0, resolvedPrice);
            appliedRule = rule.id;
            ruleReason = rule.name;
            break;
          }
        }

        results.push({
          menuItemId,
          basePrice: Number(menuItem.price),
          resolvedPrice: Math.round(resolvedPrice * 100) / 100,
          appliedRule,
          ruleReason,
          hasRule: appliedRule !== null,
        });
      }

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Bulk update (HEAD feature: direct outlet_menu_prices table) ──────────
  app.post("/api/pricing/bulk-update", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const user = req.user as any;
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items must be a non-empty array" });
      }

      const client = await (await import("../db")).pool.connect();
      try {
        await client.query("BEGIN");
        const results = [];
        for (const item of items) {
          const { menuItemId, outletId, price } = item;
          if (!menuItemId || !outletId || !price || Number(price) <= 0) {
            throw new Error(`Invalid item: ${JSON.stringify(item)}`);
          }
          const existing = await storage.getOutletMenuOverrides(outletId, tenantId);
          const existingOverride = existing.find(o => o.menuItemId === menuItemId);
          if (existingOverride) {
            const updated = await storage.updateOutletMenuOverride(existingOverride.id, tenantId, {
              overridePrice: String(Number(price).toFixed(2)),
            });
            results.push(updated);
          } else {
            const created = await storage.createOutletMenuOverride({
              tenantId,
              outletId,
              menuItemId,
              overridePrice: String(Number(price).toFixed(2)),
              available: true,
            });
            results.push(created);
          }
        }
        await client.query("COMMIT");
        MenuCache.invalidateByTenant(tenantId);
        res.json({ success: true, updated: results.length, items: results });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Copy Outlet (preview) ─────────────────────────────────────────────────
  app.get("/api/pricing/copy-outlet", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { sourceOutletId, targetOutletId, adjustmentPct } = req.query;
      if (!sourceOutletId || !targetOutletId) {
        return res.status(400).json({ message: "sourceOutletId and targetOutletId are required" });
      }
      const sourceOverrides = await storage.getOutletMenuOverrides(sourceOutletId as string, user.tenantId);
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItems.map(m => [m.id, m]));
      const adjustment = adjustmentPct ? Number(adjustmentPct) : 0;

      const preview = sourceOverrides.map(o => {
        const item = menuMap.get(o.menuItemId);
        const basePrice = Number(o.overridePrice || item?.price || 0);
        const newPrice = adjustment !== 0 ? basePrice * (1 + adjustment / 100) : basePrice;
        return {
          menuItemId: o.menuItemId,
          menuItemName: item?.name || "Unknown",
          sourcePrice: basePrice,
          newPrice: Math.round(newPrice * 100) / 100,
        };
      });
      res.json({ preview });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Copy Outlet (execute) ─────────────────────────────────────────────────
  app.post("/api/pricing/copy-outlet", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { sourceOutletId, targetOutletId, adjustmentPct, categoryId } = req.body;
      if (!sourceOutletId || !targetOutletId) {
        return res.status(400).json({ message: "sourceOutletId and targetOutletId are required" });
      }
      const sourceOverrides = await storage.getOutletMenuOverrides(sourceOutletId, user.tenantId);
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      const menuMap = new Map(menuItems.map(m => [m.id, m]));
      const adjustment = adjustmentPct ? Number(adjustmentPct) : 0;

      const filtered = sourceOverrides.filter(o => {
        if (categoryId) {
          const item = menuMap.get(o.menuItemId);
          return item?.categoryId === categoryId;
        }
        return true;
      });

      let copied = 0;
      for (const o of filtered) {
        const basePrice = Number(o.overridePrice || menuMap.get(o.menuItemId)?.price || 0);
        const newPrice = adjustment !== 0 ? basePrice * (1 + adjustment / 100) : basePrice;
        const targetOverrides = await storage.getOutletMenuOverrides(targetOutletId, user.tenantId);
        const existing = targetOverrides.find(x => x.menuItemId === o.menuItemId);
        if (existing) {
          await storage.updateOutletMenuOverride(existing.id, user.tenantId, {
            overridePrice: String(Math.round(newPrice * 100) / 100),
          });
        } else {
          await storage.createOutletMenuOverride({
            tenantId: user.tenantId,
            outletId: targetOutletId,
            menuItemId: o.menuItemId,
            overridePrice: String(Math.round(newPrice * 100) / 100),
            available: o.available,
          });
        }
        copied++;
      }

      res.json({ copied });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── CSV Import ────────────────────────────────────────────────────────────
  app.post("/api/pricing/import", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { csvBody, preview: previewOnly, outletId } = req.body;
      if (!csvBody) return res.status(400).json({ message: "csvBody is required" });

      const parsed = parseCSV(csvBody);
      const errors: string[] = [];
      const valid: any[] = [];

      for (let i = 0; i < parsed.length; i++) {
        const row = parsed[i];
        const lineNum = i + 2;
        if (!row.menu_item_id && !row.menuItemId) {
          errors.push(`Line ${lineNum}: menu_item_id is required`);
          continue;
        }
        const price = Number(row.price);
        if (isNaN(price) || price <= 0) {
          errors.push(`Line ${lineNum}: price must be a positive number`);
          continue;
        }
        valid.push({
          menuItemId: row.menu_item_id || row.menuItemId,
          outletId: row.outlet_id || row.outletId || outletId,
          price: price.toFixed(2),
          orderType: row.order_type || row.orderType || null,
          notes: row.notes || null,
        });
      }

      if (previewOnly || errors.length > 0) {
        return res.json({ preview: valid, errors });
      }

      const committed = [];
      for (const item of valid) {
        if (!item.outletId) {
          errors.push(`menu_item_id ${item.menuItemId}: outletId is required`);
          continue;
        }
        const existing = await storage.getOutletMenuOverrides(item.outletId, user.tenantId);
        const existingOverride = existing.find(o => o.menuItemId === item.menuItemId);
        if (existingOverride) {
          const updated = await storage.updateOutletMenuOverride(existingOverride.id, user.tenantId, {
            overridePrice: item.price,
          });
          committed.push(updated);
        } else {
          const created = await storage.createOutletMenuOverride({
            tenantId: user.tenantId,
            outletId: item.outletId,
            menuItemId: item.menuItemId,
            overridePrice: item.price,
            available: true,
          });
          committed.push(created);
        }
      }

      if (errors.length > 0) {
        return res.json({ preview: valid, errors });
      }
      res.json({ success: true, imported: committed.length, errors: [] });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── CSV Export ────────────────────────────────────────────────────────────
  app.get("/api/pricing/export", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.query;
      const outlets = outletId
        ? [await storage.getOutlet(outletId as string)].filter(Boolean)
        : await storage.getOutletsByTenant(user.tenantId);

      const rows: any[] = [];
      for (const outlet of outlets as any[]) {
        if (!outlet) continue;
        const overrides = await storage.getOutletMenuOverrides(outlet.id, user.tenantId);
        const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
        const menuMap = new Map(menuItems.map(m => [m.id, m]));
        for (const o of overrides) {
          const item = menuMap.get(o.menuItemId);
          rows.push({
            outlet_id: outlet.id,
            outlet_name: outlet.name,
            menu_item_id: o.menuItemId,
            menu_item_name: item?.name || "",
            override_price: o.overridePrice || "",
            available: o.available,
          });
        }
      }

      const csv = toCSV(rows);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="pricing-overrides.csv"`);
      res.send(csv);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ─── Global Adjustment ────────────────────────────────────────────────────
  app.post("/api/pricing/global-adjustment", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId, categoryId, menuItemId, adjustmentType, adjustmentValue, roundTo: roundToVal } = req.body;
      if (!adjustmentType || adjustmentValue == null) {
        return res.status(400).json({ message: "adjustmentType and adjustmentValue are required" });
      }

      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);
      let targetItems = menuItems;
      if (menuItemId) targetItems = menuItems.filter(m => m.id === menuItemId);
      else if (categoryId) targetItems = menuItems.filter(m => m.categoryId === categoryId);

      const outlets = outletId ? [await storage.getOutlet(outletId)] : await storage.getOutletsByTenant(user.tenantId);
      const validOutlets = outlets.filter(Boolean) as any[];

      let adjustedCount = 0;
      for (const outlet of validOutlets) {
        const existingOverrides = await storage.getOutletMenuOverrides(outlet.id, user.tenantId);
        const overrideMap = new Map(existingOverrides.map(o => [o.menuItemId, o]));
        for (const item of targetItems) {
          const currentOverride = overrideMap.get(item.id);
          const currentPrice = currentOverride?.overridePrice ? Number(currentOverride.overridePrice) : Number(item.price);
          let newPrice = currentPrice;
          if (adjustmentType === "increase_pct") newPrice = currentPrice * (1 + Number(adjustmentValue) / 100);
          else if (adjustmentType === "decrease_pct") newPrice = currentPrice * (1 - Number(adjustmentValue) / 100);
          else if (adjustmentType === "increase_fixed") newPrice = currentPrice + Number(adjustmentValue);
          else if (adjustmentType === "decrease_fixed") newPrice = currentPrice - Number(adjustmentValue);
          newPrice = Math.max(0, newPrice);
          if (roundToVal) {
            newPrice = roundTo(newPrice, Number(roundToVal));
          }

          if (currentOverride) {
            await storage.updateOutletMenuOverride(currentOverride.id, user.tenantId, {
              overridePrice: String(Math.round(newPrice * 100) / 100),
            });
          } else {
            await storage.createOutletMenuOverride({
              tenantId: user.tenantId,
              outletId: outlet.id,
              menuItemId: item.id,
              overridePrice: String(Math.round(newPrice * 100) / 100),
              available: true,
            });
          }
          adjustedCount++;
        }
      }

      res.json({ adjusted: adjustedCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Cross-outlet price comparison ────────────────────────────────────────
  app.get("/api/pricing/comparison", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const menuItems = await storage.getMenuItemsByTenant(user.tenantId);

      const allOverrides: any[] = [];
      for (const outlet of outlets) {
        const overrides = await storage.getOutletMenuOverrides(outlet.id, user.tenantId);
        for (const o of overrides) {
          allOverrides.push({ ...o, outletName: outlet.name });
        }
      }

      const overrideMap = new Map<string, Map<string, string | null>>();
      for (const o of allOverrides) {
        if (!overrideMap.has(o.menuItemId)) overrideMap.set(o.menuItemId, new Map());
        overrideMap.get(o.menuItemId)!.set(o.outletId, o.overridePrice);
      }

      const comparison = menuItems.map(item => {
        const outletPrices: Record<string, number | null> = {};
        for (const outlet of outlets) {
          const override = overrideMap.get(item.id)?.get(outlet.id);
          outletPrices[outlet.id] = override != null ? Number(override) : Number(item.price);
        }
        const prices = Object.values(outletPrices).filter(p => p != null) as number[];
        const maxPrice = prices.length ? Math.max(...prices) : Number(item.price);
        const minPrice = prices.length ? Math.min(...prices) : Number(item.price);
        const basePrice = Number(item.price);
        const maxVariance = basePrice > 0 ? ((maxPrice - basePrice) / basePrice) * 100 : 0;

        return {
          menuItemId: item.id,
          menuItemName: item.name,
          basePrice,
          outletPrices,
          maxPrice,
          minPrice,
          maxVariance: Math.round(maxVariance),
        };
      });

      res.json({
        outlets: outlets.map(o => ({ id: o.id, name: o.name })),
        comparison,
        insights: generateInsights(comparison, outlets),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Dish view (per-item outlet breakdown) ────────────────────────────────
  app.get("/api/pricing/dish-view/:menuItemId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { menuItemId } = req.params;
      const menuItem = await storage.getMenuItem(menuItemId, user.tenantId);
      if (!menuItem) {
        return res.status(404).json({ message: "Menu item not found" });
      }
      const outlets = await storage.getOutletsByTenant(user.tenantId);
      const result = [];
      for (const outlet of outlets) {
        const overrides = await storage.getOutletMenuOverrides(outlet.id, user.tenantId);
        const override = overrides.find(o => o.menuItemId === menuItemId);
        let rules: any[] = [];
        try {
          const { rows } = await pool.query(
            `SELECT * FROM price_rules WHERE tenant_id = $1 AND outlet_id = $2 AND active = true ORDER BY priority DESC LIMIT 5`,
            [user.tenantId, outlet.id]
          );
          rules = rows;
        } catch {}
        result.push({
          outletId: outlet.id,
          outletName: outlet.name,
          basePrice: Number(menuItem.price),
          overridePrice: override?.overridePrice ? Number(override.overridePrice) : null,
          effectivePrice: override?.overridePrice ? Number(override.overridePrice) : Number(menuItem.price),
          rulesCount: rules.length,
          ruleSummary: rules.slice(0, 2).map((r: any) => r.name).join(", ") || null,
        });
      }
      res.json({ menuItem, outlets: result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Active rules (HEAD feature, from outlet_menu_prices if table exists) ─
  app.get("/api/pricing/active-rules", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.query;
      try {
        const today = new Date().toISOString().slice(0, 10);
        let query = `SELECT * FROM price_rules
          WHERE tenant_id = $1 AND active = true
          AND (valid_from IS NULL OR valid_from <= $2)
          AND (valid_to IS NULL OR valid_to >= $2)`;
        const params: any[] = [user.tenantId, today];
        let idx = 3;
        if (outletId) { query += ` AND (outlet_id = $${idx++} OR outlet_id IS NULL)`; params.push(outletId); }
        query += ` ORDER BY priority DESC, created_at DESC`;
        const { rows } = await pool.query(query, params);
        res.json(rows);
      } catch {
        res.json([]);
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}

function generateInsights(
  comparison: { menuItemName: string; basePrice: number; maxPrice: number; minPrice: number; maxVariance: number }[],
  outlets: { id: string; name: string }[]
): string[] {
  const insights: string[] = [];
  const highVariance = comparison.filter(c => c.maxVariance > 50);
  if (highVariance.length > 0) {
    insights.push(`${highVariance.length} item(s) have prices 50%+ above base (e.g., "${highVariance[0].menuItemName}")`);
  }
  if (outlets.length > 1) {
    insights.push(`Comparing prices across ${outlets.length} outlets`);
  }
  const noOverrides = comparison.filter(c => c.maxPrice === c.basePrice && c.minPrice === c.basePrice);
  if (noOverrides.length === comparison.length) {
    insights.push("All items use base pricing — no outlet-specific overrides set yet");
  }
  return insights;
}
