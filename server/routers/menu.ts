import type { Express } from "express";
import { storage } from "../storage";
import { requireRole, requireAuth } from "../auth";
import { requirePermission } from "../permissions";
import { can } from "../permissions";
import { auditLogFromReq } from "../audit";
import { getSecuritySettings, verifySupervisorOverride } from "./_shared";
import { pool } from "../db";
import { deleteFile } from "../services/file-storage";

export function registerMenuRoutes(app: Express): void {
  app.get("/api/menu-categories", requireAuth, async (req, res) => {
    const user = req.user as any;
    const cats = await storage.getCategoriesByTenant(user.tenantId);
    res.json(cats);
  });

  app.post("/api/menu-categories", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    const user = req.user as any;
    const cat = await storage.createCategory({ ...req.body, tenantId: user.tenantId });
    auditLogFromReq(req, { action: "category_created", entityType: "menu_category", entityId: cat.id, entityName: cat.name, after: { name: cat.name } });
    res.json(cat);
  });

  app.patch("/api/menu-categories/:id", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    const before = await storage.getCategory(req.params.id);
    const cat = await storage.updateCategory(req.params.id, req.body);
    auditLogFromReq(req, { action: "category_updated", entityType: "menu_category", entityId: req.params.id, entityName: cat.name, before: before ? { name: before.name } : undefined, after: { name: cat.name } });
    res.json(cat);
  });

  app.delete("/api/menu-categories/:id", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    const before = await storage.getCategory(req.params.id);
    await storage.deleteCategory(req.params.id);
    auditLogFromReq(req, { action: "category_deleted", entityType: "menu_category", entityId: req.params.id, entityName: before?.name || "unknown" });
    res.json({ message: "Deleted" });
  });

  app.get("/api/menu-items", requireAuth, async (req, res) => {
    const user = req.user as any;
    const items = await storage.getMenuItemsByTenant(user.tenantId);
    res.json(items);
  });

  app.get("/api/menu-items/:id/modifiers", requireAuth, async (req, res) => {
    const user = req.user as Express.User & { tenantId: string };
    const item = await storage.getMenuItem(req.params.id, user.tenantId);
    if (!item) return res.status(404).json({ message: "Menu item not found" });
    const groups = [
      {
        id: "size",
        name: "Size",
        required: false,
        options: [
          { label: "Half", priceAdjust: -0.2 },
          { label: "Regular", priceAdjust: 0 },
          { label: "Large", priceAdjust: 0.3 },
          { label: "XL", priceAdjust: 0.5 },
        ],
      },
      {
        id: "spice",
        name: "Spice Level",
        required: false,
        options: [
          { label: "Mild", priceAdjust: 0 },
          { label: "Medium", priceAdjust: 0 },
          { label: "Hot", priceAdjust: 0 },
          { label: "Extra Hot", priceAdjust: 0 },
        ],
      },
    ];
    res.json({ itemId: item.id, itemName: item.name, basePrice: item.price, groups });
  });

  app.post("/api/menu-items", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    const user = req.user as any;
    const item = await storage.createMenuItem({ ...req.body, tenantId: user.tenantId });
    auditLogFromReq(req, { action: "menu_item_created", entityType: "menu_item", entityId: item.id, entityName: item.name, after: { name: item.name, price: item.price } });
    res.json(item);
  });

  app.patch("/api/menu-items/:id", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    const user = req.user as any;
    const existing = await storage.getMenuItem(req.params.id, user.tenantId);

    if (existing && req.body.price && String(req.body.price) !== String(existing.price)) {
      const secSettings = await getSecuritySettings(user.tenantId);
      if (secSettings.requireSupervisorForPriceChange && !can(user, "change_price")) {
        if (req.body.supervisorOverride) {
          const result = await verifySupervisorOverride(req.body.supervisorOverride, user.tenantId, "change_price", req);
          if (!result.verified) return res.status(403).json({ message: result.error || "Supervisor verification failed" });
        } else {
          return res.status(403).json({ message: "Permission denied", action: "change_price", requiresSupervisor: true });
        }
      }
    }

    const { supervisorOverride: _so, ...updateData } = req.body;
    const item = await storage.updateMenuItem(req.params.id, user.tenantId, updateData);
    if (existing) auditLogFromReq(req, { action: "menu_item_updated", entityType: "menu_item", entityId: req.params.id, entityName: existing.name, before: { name: existing.name, price: existing.price }, after: updateData });
    res.json(item);
  });

  app.delete("/api/menu-items/:id", requireRole("owner", "manager"), requirePermission("manage_menu"), async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getMenuItem(req.params.id, user.tenantId);
      if (!existing) return res.status(404).json({ message: "Menu item not found" });

      const { rows: openOrders } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.menu_item_id = $1
           AND o.tenant_id = $2
           AND o.status NOT IN ('paid', 'cancelled', 'voided', 'completed', 'closed')`,
        [req.params.id, user.tenantId]
      );
      const openCount = openOrders[0]?.cnt ?? 0;
      if (openCount > 0) {
        return res.status(400).json({
          message: `Cannot delete "${existing.name}" — it is in ${openCount} open order${openCount !== 1 ? "s" : ""}`,
          inUse: true,
          count: openCount,
        });
      }

      await storage.deleteMenuItem(req.params.id, user.tenantId, user.id);
      if (existing.image) {
        deleteFile(existing.image).catch((e) => console.error("[menu] deleteFile error:", e));
      }
      auditLogFromReq(req, { action: "menu_item_deleted", entityType: "menu_item", entityId: req.params.id, entityName: existing.name });
      res.json({ message: "Deleted" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/menu-items/:id/removable-ingredients", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const item = await storage.getMenuItem(req.params.id, user.tenantId);
      if (!item) return res.status(404).json({ message: "Menu item not found" });

      const { rows } = await pool.query(
        `SELECT id, ingredient_name AS name, is_removable, sort_order
         FROM recipe_components
         WHERE menu_item_id = $1 AND is_removable = true
         ORDER BY sort_order ASC, ingredient_name ASC`,
        [req.params.id]
      );

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
