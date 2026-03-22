import { pool } from "../db";
import { emitToTenant } from "../realtime";

export type NotificationPriority = "HIGH" | "MEDIUM" | "LOW";
export type NotificationType =
  | "task_assigned"
  | "task_started"
  | "task_completed"
  | "task_verified"
  | "task_reassigned"
  | "task_reminder"
  | "task_issue"
  | "task_help"
  | "task_overdue"
  | "deadline_warning"
  | "dish_complete"
  | "all_complete"
  | "readiness_summary";

export interface CreateNotificationInput {
  tenantId: string;
  chefId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  priority?: NotificationPriority;
  relatedTaskId?: string | null;
  relatedOrderId?: string | null;
  relatedMenuItem?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  action2Url?: string | null;
  action2Label?: string | null;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function rowToCamel(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) out[snakeToCamel(key)] = row[key];
  return out;
}

export async function createNotification(input: CreateNotificationInput): Promise<Record<string, any>> {
  const { rows } = await pool.query(
    `INSERT INTO prep_notifications
     (tenant_id, chef_id, type, title, body, priority, related_task_id, related_order_id, related_menu_item, action_url, action_label, action2_url, action2_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      input.tenantId,
      input.chefId ?? null,
      input.type,
      input.title,
      input.body ?? null,
      input.priority ?? "LOW",
      input.relatedTaskId ?? null,
      input.relatedOrderId ?? null,
      input.relatedMenuItem ?? null,
      input.actionUrl ?? null,
      input.actionLabel ?? null,
      input.action2Url ?? null,
      input.action2Label ?? null,
    ]
  );
  const notif = rowToCamel(rows[0]);
  emitToTenant(input.tenantId, "prep:notification", notif);
  return notif;
}

export async function markRead(id: string, tenantId: string): Promise<void> {
  await pool.query(
    `UPDATE prep_notifications SET read_at = now() WHERE id = $1 AND tenant_id = $2 AND read_at IS NULL`,
    [id, tenantId]
  );
}

export async function markAllRead(tenantId: string, chefId?: string | null): Promise<void> {
  if (chefId) {
    await pool.query(
      `UPDATE prep_notifications SET read_at = now() WHERE tenant_id = $1 AND chef_id = $2 AND read_at IS NULL`,
      [tenantId, chefId]
    );
  } else {
    await pool.query(
      `UPDATE prep_notifications SET read_at = now() WHERE tenant_id = $1 AND read_at IS NULL`,
      [tenantId]
    );
  }
}

export async function getUnreadCount(tenantId: string, chefId?: string | null): Promise<number> {
  let query: string;
  let params: any[];
  if (chefId) {
    query = `SELECT COUNT(*)::int AS cnt FROM prep_notifications WHERE tenant_id = $1 AND (chef_id = $2 OR chef_id IS NULL) AND read_at IS NULL`;
    params = [tenantId, chefId];
  } else {
    query = `SELECT COUNT(*)::int AS cnt FROM prep_notifications WHERE tenant_id = $1 AND read_at IS NULL`;
    params = [tenantId];
  }
  const { rows } = await pool.query(query, params);
  return rows[0]?.cnt ?? 0;
}

export async function getNotifications(
  tenantId: string,
  chefId?: string | null,
  limit = 50,
  offset = 0
): Promise<{ notifications: Record<string, any>[]; total: number }> {
  let listQuery: string;
  let countQuery: string;
  let listParams: any[];
  let countParams: any[];
  if (chefId) {
    listQuery = `SELECT * FROM prep_notifications WHERE tenant_id = $1 AND (chef_id = $2 OR chef_id IS NULL) ORDER BY created_at DESC LIMIT $3 OFFSET $4`;
    listParams = [tenantId, chefId, limit, offset];
    countQuery = `SELECT COUNT(*)::int AS total FROM prep_notifications WHERE tenant_id = $1 AND (chef_id = $2 OR chef_id IS NULL)`;
    countParams = [tenantId, chefId];
  } else {
    listQuery = `SELECT * FROM prep_notifications WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    listParams = [tenantId, limit, offset];
    countQuery = `SELECT COUNT(*)::int AS total FROM prep_notifications WHERE tenant_id = $1`;
    countParams = [tenantId];
  }
  const [listRes, countRes] = await Promise.all([
    pool.query(listQuery, listParams),
    pool.query(countQuery, countParams),
  ]);
  return {
    notifications: listRes.rows.map(rowToCamel),
    total: countRes.rows[0]?.total ?? 0,
  };
}
