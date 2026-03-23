import type { Express } from "express";
import { pool } from "../db";
import { requireAuth, requireRole } from "../auth";
import { resolvePrice, resolvePriceBatch, type PriceContext } from "../services/price-resolution";

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

  app.get("/api/pricing/rules", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { outletId, menuItemId, isActive } = req.query;
      let query = `SELECT * FROM outlet_menu_prices WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      let idx = 2;
      if (outletId) { query += ` AND outlet_id = $${idx++}`; params.push(outletId); }
      if (menuItemId) { query += ` AND menu_item_id = $${idx++}`; params.push(menuItemId); }
      if (isActive !== undefined) { query += ` AND is_active = $${idx++}`; params.push(isActive === "true"); }
      query += ` ORDER BY priority DESC, created_at DESC`;
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pricing/rules", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const user = req.user as any;
      const {
        outletId, menuItemId, priceType, price, currency,
        orderType, timeSlotStart, timeSlotEnd, dayOfWeek,
        customerSegment, validFrom, validUntil, priority, notes,
      } = req.body;

      if (!outletId || !menuItemId || !priceType || price === undefined) {
        return res.status(400).json({ message: "outletId, menuItemId, priceType, and price are required" });
      }
      if (Number(price) <= 0) {
        return res.status(400).json({ message: "price must be greater than 0" });
      }
      if (timeSlotStart && timeSlotEnd) {
        const startM = timeSlotStart.split(":").map(Number).reduce((h: number, m: number, i: number) => i === 0 ? h * 60 : h + m, 0);
        const endM = timeSlotEnd.split(":").map(Number).reduce((h: number, m: number, i: number) => i === 0 ? h * 60 : h + m, 0);
        if (endM <= startM) {
          return res.status(400).json({ message: "time_slot_end must be after time_slot_start" });
        }
      }
      if (validFrom && validUntil && validUntil < validFrom) {
        return res.status(400).json({ message: "valid_until must be on or after valid_from" });
      }

      const { rows } = await pool.query(
        `INSERT INTO outlet_menu_prices
         (tenant_id, outlet_id, menu_item_id, price_type, price, currency, order_type,
          time_slot_start, time_slot_end, day_of_week, customer_segment, valid_from, valid_until,
          priority, is_active, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15,$16)
         RETURNING *`,
        [
          tenantId, outletId, menuItemId, priceType.toUpperCase(), Number(price).toFixed(2),
          currency || "USD", orderType || null, timeSlotStart || null, timeSlotEnd || null,
          dayOfWeek ? JSON.stringify(dayOfWeek) : null, customerSegment || null,
          validFrom || null, validUntil || null, Number(priority) || 0,
          notes || null, user.id,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/pricing/rules/:id", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { rows: existing } = await pool.query(
        `SELECT id FROM outlet_menu_prices WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, tenantId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Rule not found" });

      const {
        price, priceType, orderType, timeSlotStart, timeSlotEnd, dayOfWeek,
        customerSegment, validFrom, validUntil, priority, notes, isActive, currency,
      } = req.body;

      if (price !== undefined && Number(price) <= 0) {
        return res.status(400).json({ message: "price must be greater than 0" });
      }
      if (timeSlotStart && timeSlotEnd) {
        const startM = timeSlotStart.split(":").map(Number).reduce((h: number, m: number, i: number) => i === 0 ? h * 60 : h + m, 0);
        const endM = timeSlotEnd.split(":").map(Number).reduce((h: number, m: number, i: number) => i === 0 ? h * 60 : h + m, 0);
        if (endM <= startM) {
          return res.status(400).json({ message: "time_slot_end must be after time_slot_start" });
        }
      }
      if (validFrom && validUntil && validUntil < validFrom) {
        return res.status(400).json({ message: "valid_until must be on or after valid_from" });
      }

      const sets: string[] = ["updated_at = now()"];
      const params: any[] = [];
      let idx = 1;
      const set = (col: string, val: any) => { sets.push(`${col} = $${idx++}`); params.push(val); };

      if (price !== undefined) set("price", Number(price).toFixed(2));
      if (priceType !== undefined) set("price_type", priceType.toUpperCase());
      if (currency !== undefined) set("currency", currency);
      if (orderType !== undefined) set("order_type", orderType || null);
      if (timeSlotStart !== undefined) set("time_slot_start", timeSlotStart || null);
      if (timeSlotEnd !== undefined) set("time_slot_end", timeSlotEnd || null);
      if (dayOfWeek !== undefined) set("day_of_week", dayOfWeek ? JSON.stringify(dayOfWeek) : null);
      if (customerSegment !== undefined) set("customer_segment", customerSegment || null);
      if (validFrom !== undefined) set("valid_from", validFrom || null);
      if (validUntil !== undefined) set("valid_until", validUntil || null);
      if (priority !== undefined) set("priority", Number(priority) || 0);
      if (notes !== undefined) set("notes", notes || null);
      if (isActive !== undefined) set("is_active", Boolean(isActive));

      params.push(req.params.id, tenantId);
      const { rows } = await pool.query(
        `UPDATE outlet_menu_prices SET ${sets.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx++} RETURNING *`,
        params
      );
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/pricing/rules/:id", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { rows } = await pool.query(
        `UPDATE outlet_menu_prices SET is_active = false, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [req.params.id, tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Rule not found" });
      res.json({ success: true, id: rows[0].id });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pricing/rules/conflict-check", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { outletId, menuItemId, priceType, orderType, timeSlotStart, dayOfWeek, customerSegment, priority } = req.body;

      let query = `SELECT * FROM outlet_menu_prices
        WHERE tenant_id = $1 AND is_active = true`;
      const params: any[] = [tenantId];
      let idx = 2;
      if (outletId) { query += ` AND outlet_id = $${idx++}`; params.push(outletId); }
      if (menuItemId) { query += ` AND menu_item_id = $${idx++}`; params.push(menuItemId); }
      if (priceType) { query += ` AND price_type = $${idx++}`; params.push(priceType.toUpperCase()); }
      if (orderType !== undefined) { query += ` AND COALESCE(order_type,'') = $${idx++}`; params.push(orderType || ""); }
      if (timeSlotStart !== undefined) { query += ` AND COALESCE(time_slot_start,'') = $${idx++}`; params.push(timeSlotStart || ""); }
      if (customerSegment !== undefined) { query += ` AND COALESCE(customer_segment,'') = $${idx++}`; params.push(customerSegment || ""); }
      if (priority !== undefined) { query += ` AND priority = $${idx++}`; params.push(Number(priority) || 0); }

      const { rows } = await pool.query(query, params);
      res.json({ conflicts: rows, count: rows.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pricing/resolve", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { outletId, menuItemId, menuItemName, basePrice, orderType, customerSegment, orderId, orderItemId } = req.body;
      if (!outletId || !menuItemId || basePrice === undefined) {
        return res.status(400).json({ message: "outletId, menuItemId, and basePrice are required" });
      }
      const ctx: PriceContext = {
        tenantId,
        outletId,
        menuItemId,
        menuItemName,
        basePrice: Number(basePrice),
        orderType,
        customerSegment,
        orderId,
        orderItemId,
        currentTime: new Date(),
      };
      const resolved = await resolvePrice(ctx);
      res.json(resolved);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pricing/resolve/batch", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items must be a non-empty array" });
      }
      const contexts: PriceContext[] = items.map((item: any) => ({
        tenantId,
        outletId: item.outletId,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        basePrice: Number(item.basePrice),
        orderType: item.orderType,
        customerSegment: item.customerSegment,
        orderId: item.orderId,
        orderItemId: item.orderItemId,
        currentTime: new Date(),
      }));
      const results = await resolvePriceBatch(contexts);
      res.json(results);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

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
          const { rows: existing } = await client.query(
            `SELECT id FROM outlet_menu_prices
             WHERE tenant_id = $1 AND outlet_id = $2 AND menu_item_id = $3 AND price_type = 'OUTLET_BASE'`,
            [tenantId, outletId, menuItemId]
          );
          if (existing.length > 0) {
            const { rows } = await client.query(
              `UPDATE outlet_menu_prices SET price = $1, updated_at = now()
               WHERE id = $2 RETURNING *`,
              [Number(price).toFixed(2), existing[0].id]
            );
            results.push(rows[0]);
          } else {
            const { rows } = await client.query(
              `INSERT INTO outlet_menu_prices
               (tenant_id, outlet_id, menu_item_id, price_type, price, is_active, created_by)
               VALUES ($1,$2,$3,'OUTLET_BASE',$4,true,$5) RETURNING *`,
              [tenantId, outletId, menuItemId, Number(price).toFixed(2), user.id]
            );
            results.push(rows[0]);
          }
        }
        await client.query("COMMIT");
        res.json({ success: true, updated: results.length, items: results });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pricing/copy-outlet", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const user = req.user as any;
      const { sourceOutletId, targetOutletId, adjustmentPercent } = req.body;
      if (!sourceOutletId || !targetOutletId) {
        return res.status(400).json({ message: "sourceOutletId and targetOutletId are required" });
      }
      const adjustment = Number(adjustmentPercent) || 0;

      const client = await (await import("../db")).pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: sourceRules } = await client.query(
          `SELECT * FROM outlet_menu_prices
           WHERE tenant_id = $1 AND outlet_id = $2 AND price_type = 'OUTLET_BASE' AND is_active = true`,
          [tenantId, sourceOutletId]
        );
        const results = [];
        for (const rule of sourceRules) {
          const newPrice = Number(rule.price) * (1 + adjustment / 100);
          const { rows: existing } = await client.query(
            `SELECT id FROM outlet_menu_prices
             WHERE tenant_id = $1 AND outlet_id = $2 AND menu_item_id = $3 AND price_type = 'OUTLET_BASE'`,
            [tenantId, targetOutletId, rule.menu_item_id]
          );
          if (existing.length > 0) {
            const { rows } = await client.query(
              `UPDATE outlet_menu_prices SET price = $1, updated_at = now()
               WHERE id = $2 RETURNING *`,
              [newPrice.toFixed(2), existing[0].id]
            );
            results.push(rows[0]);
          } else {
            const { rows } = await client.query(
              `INSERT INTO outlet_menu_prices
               (tenant_id, outlet_id, menu_item_id, price_type, price, currency, is_active, created_by)
               VALUES ($1,$2,$3,'OUTLET_BASE',$4,$5,true,$6) RETURNING *`,
              [tenantId, targetOutletId, rule.menu_item_id, newPrice.toFixed(2), rule.currency || "USD", user.id]
            );
            results.push(rows[0]);
          }
        }
        await client.query("COMMIT");
        res.json({ success: true, copied: results.length, adjustmentPercent: adjustment });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pricing/import", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
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
          priceType: (row.price_type || row.priceType || "OUTLET_BASE").toUpperCase(),
          price: price.toFixed(2),
          orderType: row.order_type || row.orderType || null,
          notes: row.notes || null,
        });
      }

      if (previewOnly || errors.length > 0) {
        return res.json({ preview: valid, errors });
      }

      const client = await (await import("../db")).pool.connect();
      try {
        await client.query("BEGIN");
        const committed = [];
        for (const item of valid) {
          if (!item.outletId) {
            errors.push(`menu_item_id ${item.menuItemId}: outletId is required`);
            continue;
          }
          const { rows: existing } = await client.query(
            `SELECT id FROM outlet_menu_prices
             WHERE tenant_id=$1 AND outlet_id=$2 AND menu_item_id=$3 AND price_type=$4
             AND COALESCE(order_type,'')=$5`,
            [tenantId, item.outletId, item.menuItemId, item.priceType, item.orderType || ""]
          );
          if (existing.length > 0) {
            await client.query(
              `UPDATE outlet_menu_prices SET price=$1, updated_at=now() WHERE id=$2`,
              [item.price, existing[0].id]
            );
            committed.push(existing[0].id);
          } else {
            const { rows } = await client.query(
              `INSERT INTO outlet_menu_prices
               (tenant_id, outlet_id, menu_item_id, price_type, price, order_type, is_active, created_by, notes)
               VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8) RETURNING id`,
              [tenantId, item.outletId, item.menuItemId, item.priceType, item.price, item.orderType, user.id, item.notes]
            );
            committed.push(rows[0].id);
          }
        }
        if (errors.length > 0) {
          await client.query("ROLLBACK");
          return res.json({ preview: valid, errors });
        }
        await client.query("COMMIT");
        res.json({ success: true, imported: committed.length, errors: [] });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pricing/export", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { outletId } = req.query;
      let query = `SELECT id, tenant_id, outlet_id, menu_item_id, price_type, price, currency, order_type,
        time_slot_start, time_slot_end, day_of_week, customer_segment, valid_from, valid_until,
        priority, is_active, notes, created_at
        FROM outlet_menu_prices WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (outletId) { query += ` AND outlet_id = $2`; params.push(outletId); }
      query += ` ORDER BY outlet_id, menu_item_id, price_type`;
      const { rows } = await pool.query(query, params);
      const csv = toCSV(rows);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="pricing-rules-${tenantId}.csv"`);
      res.send(csv);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pricing/global-adjustment", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { percent, scope, outletId, categoryId, menuItemIds, roundTo: roundNearest } = req.body;
      if (percent === undefined) return res.status(400).json({ message: "percent is required" });

      const pct = Number(percent);
      const nearest = Number(roundNearest) || 0;

      let selectQuery = `SELECT id, price FROM outlet_menu_prices WHERE tenant_id = $1 AND is_active = true`;
      const params: any[] = [tenantId];
      let idx = 2;
      if (outletId) { selectQuery += ` AND outlet_id = $${idx++}`; params.push(outletId); }
      if (menuItemIds && Array.isArray(menuItemIds) && menuItemIds.length > 0) {
        selectQuery += ` AND menu_item_id = ANY($${idx++})`; params.push(menuItemIds);
      } else if (categoryId) {
        selectQuery += ` AND menu_item_id IN (SELECT id FROM menu_items WHERE tenant_id = $1 AND category_id = $${idx++})`;
        params.push(categoryId);
      }

      const { rows } = await pool.query(selectQuery, params);

      const client = await (await import("../db")).pool.connect();
      try {
        await client.query("BEGIN");
        let updated = 0;
        for (const rule of rows) {
          let newPrice = Number(rule.price) * (1 + pct / 100);
          if (nearest > 0) newPrice = roundTo(newPrice, nearest);
          newPrice = Math.max(0.01, Math.round(newPrice * 100) / 100);
          await client.query(
            `UPDATE outlet_menu_prices SET price = $1, updated_at = now() WHERE id = $2`,
            [newPrice.toFixed(2), rule.id]
          );
          updated++;
        }
        await client.query("COMMIT");
        res.json({ success: true, updated, percent: pct });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pricing/history/:menuItemId", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { outletId, limit: limitParam } = req.query;
      const limit = Math.min(parseInt(limitParam as string) || 50, 200);
      let query = `SELECT * FROM price_resolution_log WHERE tenant_id = $1 AND menu_item_id = $2`;
      const params: any[] = [tenantId, req.params.menuItemId];
      let idx = 3;
      if (outletId) { query += ` AND outlet_id = $${idx++}`; params.push(outletId); }
      query += ` ORDER BY resolved_at DESC LIMIT $${idx++}`;
      params.push(limit);
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pricing/audit", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { outletId, date } = req.query;
      const targetDate = (date as string) || new Date().toISOString().slice(0, 10);
      let query = `SELECT * FROM price_resolution_log
        WHERE tenant_id = $1 AND DATE(resolved_at) = $2`;
      const params: any[] = [tenantId, targetDate];
      let idx = 3;
      if (outletId) { query += ` AND outlet_id = $${idx++}`; params.push(outletId); }
      query += ` ORDER BY resolved_at DESC`;
      const { rows } = await pool.query(query, params);
      res.json({ date: targetDate, entries: rows, count: rows.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pricing/comparison", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;

      const { rows: outlets } = await pool.query(
        `SELECT id, name FROM outlets WHERE tenant_id = $1 AND active = true ORDER BY name`,
        [tenantId]
      );
      const { rows: items } = await pool.query(
        `SELECT id, name FROM menu_items WHERE tenant_id = $1 ORDER BY name`,
        [tenantId]
      );
      const { rows: prices } = await pool.query(
        `SELECT outlet_id, menu_item_id, price FROM outlet_menu_prices
         WHERE tenant_id = $1 AND price_type = 'OUTLET_BASE' AND is_active = true`,
        [tenantId]
      );

      const priceMap = new Map<string, number>();
      for (const p of prices) {
        priceMap.set(`${p.outlet_id}:${p.menu_item_id}`, Number(p.price));
      }

      const comparison = items.map(item => {
        const row: Record<string, any> = { menuItemId: item.id, menuItemName: item.name };
        for (const outlet of outlets) {
          row[outlet.name] = priceMap.get(`${outlet.id}:${item.id}`) ?? null;
        }
        return row;
      });

      res.json({ outlets: outlets.map(o => ({ id: o.id, name: o.name })), items: comparison });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pricing/active-rules", requireAuth, async (req, res) => {
    try {
      const tenantId = tenantGuard(req, res);
      if (!tenantId) return;
      const { outletId } = req.query;
      const today = new Date().toISOString().slice(0, 10);
      let query = `SELECT * FROM outlet_menu_prices
        WHERE tenant_id = $1 AND is_active = true
        AND (valid_from IS NULL OR valid_from <= $2)
        AND (valid_until IS NULL OR valid_until >= $2)`;
      const params: any[] = [tenantId, today];
      let idx = 3;
      if (outletId) { query += ` AND outlet_id = $${idx++}`; params.push(outletId); }
      query += ` ORDER BY priority DESC, price_type, created_at DESC`;
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
