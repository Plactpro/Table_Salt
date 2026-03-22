import type { Express } from "express";
import { requireAuth } from "../auth";
import { pool } from "../db";
import { getVapidPublicKey } from "../services/push-sender";

export function registerPushSubscriptionRoutes(app: Express) {
  app.get("/api/push/vapid-public-key", async (_req, res) => {
    const key = await getVapidPublicKey();
    if (!key) return res.status(503).json({ error: "Push notifications not configured" });
    res.json({ publicKey: key });
  });

  app.post("/api/push/subscribe", requireAuth, async (req: any, res) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "Invalid subscription object" });
      }
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      await pool.query(
        `INSERT INTO push_subscriptions (user_id, tenant_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             tenant_id = EXCLUDED.tenant_id,
             p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth`,
        [userId, tenantId, endpoint, keys.p256dh, keys.auth]
      );

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[PushSubscribe] Error:", err);
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  app.delete("/api/push/unsubscribe", requireAuth, async (req: any, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });

      await pool.query(
        `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
        [endpoint, req.user.id]
      );

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[PushUnsubscribe] Error:", err);
      res.status(500).json({ error: "Failed to remove subscription" });
    }
  });
}
