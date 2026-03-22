import webpush from "web-push";
import { pool } from "../db";

let initialized = false;
let vapidPublicKey: string | null = null;

async function loadOrGenerateVapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM platform_settings_kv WHERE key IN ('vapid_public_key', 'vapid_private_key')`
    );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    if (map.vapid_public_key && map.vapid_private_key) {
      return { publicKey: map.vapid_public_key, privateKey: map.vapid_private_key };
    }

    const keys = webpush.generateVAPIDKeys();
    await pool.query(
      `INSERT INTO platform_settings_kv (key, value) VALUES ('vapid_public_key', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [keys.publicKey]
    );
    await pool.query(
      `INSERT INTO platform_settings_kv (key, value) VALUES ('vapid_private_key', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [keys.privateKey]
    );
    console.log("[PushSender] Generated and stored new VAPID keys");
    return keys;
  } catch (err: any) {
    console.warn("[PushSender] Failed to load/generate VAPID keys:", err.message);
    return null;
  }
}

async function ensureInit(): Promise<boolean> {
  if (initialized) return true;

  let pubKey = process.env.VAPID_PUBLIC_KEY;
  let privKey = process.env.VAPID_PRIVATE_KEY;

  if (!pubKey || !privKey) {
    const dbKeys = await loadOrGenerateVapidKeys();
    if (!dbKeys) return false;
    pubKey = dbKeys.publicKey;
    privKey = dbKeys.privateKey;
  }

  const subject = process.env.VAPID_SUBJECT || "mailto:admin@tablesalt.app";
  webpush.setVapidDetails(subject, pubKey, privKey);
  vapidPublicKey = pubKey;
  initialized = true;
  return true;
}

export async function getVapidPublicKey(): Promise<string | null> {
  await ensureInit();
  return vapidPublicKey;
}

export interface PushPayload {
  title: string;
  body?: string;
  icon?: string;
  data?: Record<string, any>;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const ready = await ensureInit();
  if (!ready) return;

  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );

  if (rows.length === 0) return;

  const notification = JSON.stringify(payload);

  await Promise.allSettled(
    rows.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, notification);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query(
            `DELETE FROM push_subscriptions WHERE endpoint = $1`,
            [row.endpoint]
          );
        } else {
          console.warn(`[PushSender] Failed to send push to endpoint: ${err.message}`);
        }
      }
    })
  );
}

export async function sendPushToTenant(tenantId: string, payload: PushPayload): Promise<void> {
  const ready = await ensureInit();
  if (!ready) return;

  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id = $1`,
    [tenantId]
  );

  if (rows.length === 0) return;

  const notification = JSON.stringify(payload);

  await Promise.allSettled(
    rows.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, notification);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query(
            `DELETE FROM push_subscriptions WHERE endpoint = $1`,
            [row.endpoint]
          );
        }
      }
    })
  );
}
