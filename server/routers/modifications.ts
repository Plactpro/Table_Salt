import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import { pool } from "../db";
import { emitToTenant } from "../realtime";
import { z } from "zod";
import { alertEngine } from "../services/alert-engine";

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapRowToCamelCase<T>(row: Record<string, any>): T {
  if (!row) return row as T;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result as T;
}

const VALID_SPICE_LEVELS = ["NO_SPICE", "MILD", "MEDIUM", "SPICY", "EXTRA_HOT"] as const;
const VALID_SALT_LEVELS = ["LESS", "NORMAL", "EXTRA"] as const;
const MAX_REMOVALS = 5;
const MAX_NOTE_LENGTH = 150;

const saveModificationSchema = z.object({
  spiceLevel: z.enum(VALID_SPICE_LEVELS).nullable().optional(),
  saltLevel: z.enum(VALID_SALT_LEVELS).nullable().optional(),
  removedIngredients: z.array(z.string().min(1)).max(MAX_REMOVALS, `Max ${MAX_REMOVALS} removals allowed`).optional().default([]),
  hasAllergy: z.boolean().optional().default(false),
  allergyFlags: z.array(z.string().min(1)).optional().default([]),
  allergyDetails: z.string().max(300).nullable().optional(),
  specialNotes: z.string().max(MAX_NOTE_LENGTH, `Special notes must be ${MAX_NOTE_LENGTH} chars or less`).nullable().optional(),
});

export function registerModificationsRoutes(app: Express): void {

  app.post("/api/order-items/:id/modifications", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const orderItemId = req.params.id;

      const { rows: itemCheck } = await pool.query(
        `SELECT oi.id, oi.order_id FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = $1 AND o.tenant_id = $2`,
        [orderItemId, user.tenantId]
      );
      if (!itemCheck[0]) return res.status(404).json({ message: "Order item not found" });

      const orderId: string = itemCheck[0].order_id;

      const parsed = saveModificationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: parsed.error.format() });

      const { spiceLevel, saltLevel, removedIngredients, hasAllergy, allergyFlags, allergyDetails, specialNotes } = parsed.data;

      const derivedHasAllergy = hasAllergy || (allergyFlags && allergyFlags.length > 0);
      const trimmedNotes = specialNotes?.trim() || null;
      const trimmedAllergyDetails = allergyDetails?.trim() || null;

      const { rows } = await pool.query(
        `INSERT INTO order_item_modifications
           (tenant_id, order_item_id, order_id, spice_level, salt_level, removed_ingredients,
            has_allergy, allergy_flags, allergy_details, special_notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (order_item_id) DO UPDATE SET
           order_id = EXCLUDED.order_id,
           spice_level = EXCLUDED.spice_level,
           salt_level = EXCLUDED.salt_level,
           removed_ingredients = EXCLUDED.removed_ingredients,
           has_allergy = EXCLUDED.has_allergy,
           allergy_flags = EXCLUDED.allergy_flags,
           allergy_details = EXCLUDED.allergy_details,
           special_notes = EXCLUDED.special_notes,
           chef_acknowledged = CASE
             WHEN EXCLUDED.has_allergy <> order_item_modifications.has_allergy
               OR EXCLUDED.allergy_flags <> order_item_modifications.allergy_flags
               OR EXCLUDED.allergy_details IS DISTINCT FROM order_item_modifications.allergy_details
             THEN false
             ELSE order_item_modifications.chef_acknowledged
           END,
           acknowledged_by = CASE
             WHEN EXCLUDED.has_allergy <> order_item_modifications.has_allergy
               OR EXCLUDED.allergy_flags <> order_item_modifications.allergy_flags
               OR EXCLUDED.allergy_details IS DISTINCT FROM order_item_modifications.allergy_details
             THEN NULL
             ELSE order_item_modifications.acknowledged_by
           END,
           acknowledged_at = CASE
             WHEN EXCLUDED.has_allergy <> order_item_modifications.has_allergy
               OR EXCLUDED.allergy_flags <> order_item_modifications.allergy_flags
               OR EXCLUDED.allergy_details IS DISTINCT FROM order_item_modifications.allergy_details
             THEN NULL
             ELSE order_item_modifications.acknowledged_at
           END,
           updated_at = now()
         RETURNING *`,
        [
          user.tenantId,
          orderItemId,
          orderId,
          spiceLevel ?? null,
          saltLevel ?? null,
          removedIngredients ?? [],
          derivedHasAllergy,
          allergyFlags ?? [],
          trimmedAllergyDetails,
          trimmedNotes,
        ]
      );

      if (derivedHasAllergy) {
        emitToTenant(user.tenantId, "allergy:alert", {
          orderItemId,
          allergyFlags: allergyFlags ?? [],
          allergyDetails: allergyDetails ?? null,
          specialNotes: specialNotes ?? null,
        });
        alertEngine.trigger('ALERT-03', { tenantId: user.tenantId, outletId: (user as any).outletId ?? undefined, referenceId: orderId, message: `ALLERGY: ${allergyFlags?.join(', ') || allergyDetails || 'allergy flagged'}` }).catch(() => {});
      }

      res.status(201).json(mapRowToCamelCase(rows[0]));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/order-items/:id/modifications", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const orderItemId = req.params.id;

      const { rows: itemCheck } = await pool.query(
        `SELECT oi.id FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = $1 AND o.tenant_id = $2`,
        [orderItemId, user.tenantId]
      );
      if (!itemCheck[0]) return res.status(404).json({ message: "Order item not found" });

      const { rows } = await pool.query(
        `SELECT * FROM order_item_modifications WHERE order_item_id = $1 AND tenant_id = $2`,
        [orderItemId, user.tenantId]
      );

      res.json(rows[0] ? mapRowToCamelCase(rows[0]) : null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/order-items/:id/modifications/acknowledge", requireAuth, requireRole("kitchen", "manager", "owner", "super_admin"), async (req, res) => {
    try {
      const user = req.user as any;
      const orderItemId = req.params.id;

      const { rows: itemCheck } = await pool.query(
        `SELECT oi.id FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.id = $1 AND o.tenant_id = $2`,
        [orderItemId, user.tenantId]
      );
      if (!itemCheck[0]) return res.status(404).json({ message: "Order item not found" });

      const { rows } = await pool.query(
        `UPDATE order_item_modifications
         SET chef_acknowledged = true,
             acknowledged_by = $1,
             acknowledged_at = now(),
             updated_at = now()
         WHERE order_item_id = $2 AND tenant_id = $3
         RETURNING *`,
        [user.id, orderItemId, user.tenantId]
      );

      if (!rows[0]) return res.status(404).json({ message: "Modification record not found" });

      emitToTenant(user.tenantId, "allergy:acknowledged", {
        orderItemId,
        acknowledgedBy: user.id,
        acknowledgedByName: user.name || user.username,
      });

      res.json(mapRowToCamelCase(rows[0]));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/orders/:orderId/modifications", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { orderId } = req.params;

      const { rows: orderCheck } = await pool.query(
        `SELECT id FROM orders WHERE id = $1 AND tenant_id = $2`,
        [orderId, user.tenantId]
      );
      if (!orderCheck[0]) return res.status(404).json({ message: "Order not found" });

      const { rows } = await pool.query(
        `SELECT m.*, oi.name AS item_name, oi.quantity, oi.status AS item_status
         FROM order_item_modifications m
         JOIN order_items oi ON oi.id = m.order_item_id
         WHERE oi.order_id = $1 AND m.tenant_id = $2
         ORDER BY m.created_at ASC`,
        [orderId, user.tenantId]
      );

      res.json(rows.map(r => mapRowToCamelCase(r)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
