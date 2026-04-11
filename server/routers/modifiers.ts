import type { Express } from "express";
import { requireRole, requireAuth } from "../auth";
import { pool } from "../db";

export function registerModifiersRoutes(app: Express): void {

  // ENDPOINT 1 — GET /api/modifier-groups
  app.get("/api/modifier-groups", requireAuth, async (req, res) => {
    try {
      const tenantId = (req.user as any).tenantId;

      const { rows: groups } = await pool.query(
        `SELECT id, name, selection_type, is_required, min_selections, max_selections, sort_order, is_active, created_at
         FROM modifier_groups
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY sort_order ASC, name ASC`,
        [tenantId]
      );

      const groupIds = groups.map((g: any) => g.id);
      let options: any[] = [];
      if (groupIds.length > 0) {
        const { rows } = await pool.query(
          `SELECT id, group_id, name, price_adjustment, is_default, sort_order
           FROM modifier_options
           WHERE group_id = ANY($1::varchar[]) AND is_active = true
           ORDER BY sort_order ASC`,
          [groupIds]
        );
        options = rows;
      }

      const result = groups.map((g: any) => ({
        id: g.id,
        name: g.name,
        selectionType: g.selection_type,
        isRequired: g.is_required,
        minSelections: g.min_selections,
        maxSelections: g.max_selections,
        sortOrder: g.sort_order,
        isActive: g.is_active,
        options: options
          .filter((o: any) => o.group_id === g.id)
          .map((o: any) => ({
            id: o.id,
            groupId: o.group_id,
            name: o.name,
            priceAdjustment: parseFloat(o.price_adjustment ?? '0'),
            isDefault: o.is_default,
            sortOrder: o.sort_order,
          }))
      }));

      res.json(result);
    } catch (err: any) {
      console.error('[modifiers] GET groups:', err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ENDPOINT 2 — POST /api/modifier-groups
  app.post("/api/modifier-groups", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const tenantId = (req.user as any).tenantId;
      const {
        name, selectionType = "single",
        isRequired = false, minSelections = 0,
        maxSelections = 1, sortOrder = 0,
        options = [],
      } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({ message: "Group name is required" });
      }

      const { rows: [group] } = await pool.query(
        `INSERT INTO modifier_groups (tenant_id, name, selection_type, is_required, min_selections, max_selections, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [tenantId, name.trim(), selectionType, isRequired, minSelections, maxSelections, sortOrder]
      );

      const insertedOptions = [];
      for (const opt of options) {
        const { rows: [option] } = await pool.query(
          `INSERT INTO modifier_options (group_id, tenant_id, name, price_adjustment, is_default, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [group.id, tenantId, opt.name, opt.priceAdjustment ?? 0, opt.isDefault ?? false, opt.sortOrder ?? 0]
        );
        insertedOptions.push(option);
      }

      res.status(201).json({ ...group, options: insertedOptions });
    } catch (err: any) {
      console.error('[modifiers] POST group:', err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ENDPOINT 3 — PATCH /api/modifier-groups/:id
  app.patch("/api/modifier-groups/:id", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = (req.user as any).tenantId;
      const {
        name, selectionType, isRequired,
        minSelections, maxSelections,
        sortOrder, isActive, options,
      } = req.body;

      const { rows: [group] } = await pool.query(
        `UPDATE modifier_groups SET
          name = COALESCE($1, name),
          selection_type = COALESCE($2, selection_type),
          is_required = COALESCE($3, is_required),
          min_selections = COALESCE($4, min_selections),
          max_selections = COALESCE($5, max_selections),
          sort_order = COALESCE($6, sort_order),
          is_active = COALESCE($7, is_active)
         WHERE id = $8 AND tenant_id = $9
         RETURNING *`,
        [name, selectionType, isRequired, minSelections, maxSelections, sortOrder, isActive, id, tenantId]
      );

      if (!group) {
        return res.status(404).json({ message: "Modifier group not found" });
      }

      if (options && Array.isArray(options)) {
        for (const opt of options) {
          if (opt.id) {
            await pool.query(
              `UPDATE modifier_options SET
                name = COALESCE($1, name),
                price_adjustment = COALESCE($2, price_adjustment),
                is_default = COALESCE($3, is_default),
                sort_order = COALESCE($4, sort_order),
                is_active = COALESCE($5, is_active)
               WHERE id = $6 AND group_id = $7`,
              [opt.name, opt.priceAdjustment, opt.isDefault, opt.sortOrder, opt.isActive, opt.id, id]
            );
          } else {
            await pool.query(
              `INSERT INTO modifier_options (group_id, tenant_id, name, price_adjustment, is_default, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [id, tenantId, opt.name, opt.priceAdjustment ?? 0, opt.isDefault ?? false, opt.sortOrder ?? 0]
            );
          }
        }
      }

      res.json({ ...group, options });
    } catch (err: any) {
      console.error('[modifiers] PATCH group:', err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ENDPOINT 4 — DELETE /api/modifier-groups/:id
  app.delete("/api/modifier-groups/:id", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = (req.user as any).tenantId;

      await pool.query(
        `UPDATE modifier_groups SET is_active = false WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      await pool.query(
        `UPDATE modifier_options SET is_active = false WHERE group_id = $1`,
        [id]
      );

      await pool.query(
        `DELETE FROM menu_item_modifier_groups WHERE group_id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      res.json({ success: true });
    } catch (err: any) {
      console.error('[modifiers] DELETE group:', err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ENDPOINT 5 — GET /api/menu-items/:id/modifiers
  app.get("/api/menu-items/:id/modifier-groups", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = (req.user as any).tenantId;

      const { rows: links } = await pool.query(
        `SELECT
          mimg.id as link_id,
          mimg.sort_order as link_sort_order,
          mg.id, mg.name, mg.selection_type,
          mg.is_required, mg.min_selections,
          mg.max_selections, mg.sort_order
         FROM menu_item_modifier_groups mimg
         JOIN modifier_groups mg ON mg.id = mimg.group_id
         WHERE mimg.menu_item_id = $1
         AND mimg.tenant_id = $2
         AND mg.is_active = true
         ORDER BY mimg.sort_order ASC`,
        [id, tenantId]
      );

      const groupIds = links.map((l: any) => l.id);
      let options: any[] = [];
      if (groupIds.length > 0) {
        const { rows } = await pool.query(
          `SELECT id, group_id, name, price_adjustment, is_default, sort_order
           FROM modifier_options
           WHERE group_id = ANY($1::varchar[]) AND is_active = true
           ORDER BY sort_order ASC`,
          [groupIds]
        );
        options = rows;
      }

      const result = links.map((g: any) => ({
        linkId: g.link_id,
        id: g.id,
        name: g.name,
        selectionType: g.selection_type,
        isRequired: g.is_required,
        minSelections: g.min_selections,
        maxSelections: g.max_selections,
        sortOrder: g.link_sort_order,
        options: options
          .filter((o: any) => o.group_id === g.id)
          .map((o: any) => ({
            id: o.id,
            groupId: o.group_id,
            name: o.name,
            priceAdjustment: parseFloat(o.price_adjustment ?? '0'),
            isDefault: o.is_default,
            sortOrder: o.sort_order,
          }))
      }));

      res.json(result);
    } catch (err: any) {
      console.error('[modifiers] GET item modifiers:', err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ENDPOINT 6 — POST /api/menu-items/:id/modifiers
  app.post("/api/menu-items/:id/modifier-groups", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const { id } = req.params;
      const tenantId = (req.user as any).tenantId;
      const { groupIds = [] } = req.body;

      await pool.query(
        `DELETE FROM menu_item_modifier_groups WHERE menu_item_id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      for (let i = 0; i < groupIds.length; i++) {
        await pool.query(
          `INSERT INTO menu_item_modifier_groups (menu_item_id, group_id, tenant_id, sort_order)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (menu_item_id, group_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
          [id, groupIds[i], tenantId, i]
        );
      }

      res.json({ success: true, menuItemId: id, linkedGroups: groupIds.length });
    } catch (err: any) {
      console.error('[modifiers] POST item modifiers:', err.message);
      res.status(500).json({ message: err.message });
    }
  });

}
