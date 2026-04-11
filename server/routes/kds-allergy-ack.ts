/**
 * ALL-02: PATCH /api/kds/items/:id/acknowledge-allergy
 *
 * Persists chef allergy acknowledgment into order_item_modifications.
 * Sets allergy_acknowledged_at = now() and allergy_acknowledged_by = chef user id.
 * Also sets the legacy chef_acknowledged = true column for backwards compat.
 *
 * Returns the updated modification row (or a success stub if no modification row exists).
 */
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth";

const router = Router();

router.patch("/api/kds/items/:id/acknowledge-allergy", requireAuth, async (req, res) => {
  try {
    const { id: orderItemId } = req.params;
    const userId = (req as any).user?.id ?? null;
    const tenantId = (req as any).user?.tenantId ?? null;

    // Upsert: update existing modification row, or insert a minimal one if absent
    const result = await pool.query(
      `UPDATE order_item_modifications
       SET
         allergy_acknowledged_at = now(),
         allergy_acknowledged_by = $1,
         chef_acknowledged       = true,
         acknowledged_by         = $1,
         acknowledged_at         = now(),
         updated_at              = now()
       WHERE order_item_id = $2
         AND ($3::varchar IS NULL OR tenant_id = $3)
       RETURNING id, allergy_acknowledged_at, allergy_acknowledged_by`,
      [userId, orderItemId, tenantId]
    );

    if (result.rowCount === 0) {
      // No modification row yet — create a minimal acknowledgment-only row
      const insertResult = await pool.query(
        `INSERT INTO order_item_modifications
           (tenant_id, order_item_id, has_allergy, chef_acknowledged, acknowledged_by,
            acknowledged_at, allergy_acknowledged_at, allergy_acknowledged_by)
         VALUES ($1, $2, true, true, $3, now(), now(), $3)
         ON CONFLICT (order_item_id) DO UPDATE SET
           allergy_acknowledged_at = now(),
           allergy_acknowledged_by = $3,
           chef_acknowledged       = true,
           acknowledged_by         = $3,
           acknowledged_at         = now(),
           updated_at              = now()
         RETURNING id, allergy_acknowledged_at, allergy_acknowledged_by`,
        [tenantId, orderItemId, userId]
      );
      return res.json({ ok: true, ...insertResult.rows[0] });
    }

    return res.json({ ok: true, ...result.rows[0] });
  } catch (err) {
    console.error("[ALL-02] allergy ack error:", err);
    res.status(500).json({ error: "Failed to acknowledge allergy" });
  }
});

export default router;
