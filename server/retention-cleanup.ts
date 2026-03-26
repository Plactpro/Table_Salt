import { db, pool } from "./db";
import { sql } from "drizzle-orm";

// Tables that support soft delete and require 30-day auto-purge
const SOFT_DELETE_TABLES = [
  "menu_items", "users", "customers", "suppliers", "inventory_items",
  "valet_tickets", "purchase_orders", "recipes", "promotion_rules", "reservations",
];

export async function purgeExpiredRecycleBinItems(): Promise<number> {
  let total = 0;
  const client = await pool.connect();
  try {
    for (const table of SOFT_DELETE_TABLES) {
      const { rowCount } = await client.query(
        `DELETE FROM ${table} WHERE is_deleted = true AND deleted_at < NOW() - INTERVAL '30 days'`
      );
      total += rowCount ?? 0;
    }
    if (total > 0) {
      console.log(`[recycle-bin-purge] Permanently deleted ${total} expired soft-deleted records (>30 days)`);
    }
  } finally {
    client.release();
  }
  return total;
}

export async function runRetentionCleanup(): Promise<{ auditRowsDeleted: number; alertsDeleted: number; customersDeleted: number; healthLogsDeleted: number }> {
  let auditRowsDeleted = 0;
  let alertsDeleted = 0;
  let customersDeleted = 0;
  let healthLogsDeleted = 0;

  try {
    const allTenants = await db.execute(sql`SELECT id, module_config FROM tenants`);
    for (const tenant of allTenants.rows) {
      const tenantId = tenant.id as string;
      const mc = (tenant.module_config || {}) as Record<string, unknown>;

      const auditRetentionMonths = (mc.auditLogRetentionMonths as number) || 24;
      const dataRetentionMonths = (mc.dataRetentionMonths as number) || 36;

      if (mc.autoDeleteAnonymized) {
        const dataCutoff = new Date();
        dataCutoff.setMonth(dataCutoff.getMonth() - dataRetentionMonths);

        const custResult = await db.execute(
          sql`DELETE FROM customers WHERE tenant_id = ${tenantId} AND anonymized = true
              AND NOT EXISTS (
                SELECT 1 FROM audit_events ae
                WHERE ae.tenant_id = ${tenantId}
                AND ae.action = 'customer_anonymized'
                AND ae.entity_id = customers.id
                AND ae.created_at >= ${dataCutoff}
              )`
        );
        customersDeleted += Number(custResult.rowCount || 0);
      }

      const auditCutoff = new Date();
      auditCutoff.setMonth(auditCutoff.getMonth() - Math.max(auditRetentionMonths, dataRetentionMonths));

      const auditResult = await db.execute(
        sql`DELETE FROM audit_events WHERE tenant_id = ${tenantId} AND created_at < ${auditCutoff}`
      );
      auditRowsDeleted += Number(auditResult.rowCount || 0);

      const acknowledgedAlertCutoff = new Date();
      acknowledgedAlertCutoff.setMonth(acknowledgedAlertCutoff.getMonth() - Math.max(auditRetentionMonths, 6));
      const alertResult = await db.execute(
        sql`DELETE FROM security_alerts WHERE tenant_id = ${tenantId} AND acknowledged = true AND created_at < ${acknowledgedAlertCutoff}`
      );
      alertsDeleted += Number(alertResult.rowCount || 0);
    }
    const healthLogCutoff = new Date();
    healthLogCutoff.setDate(healthLogCutoff.getDate() - 90);
    const healthResult = await db.execute(
      sql`DELETE FROM system_health_log WHERE checked_at < ${healthLogCutoff}`
    );
    healthLogsDeleted += Number(healthResult.rowCount || 0);
  } catch (err) {
    console.error("Retention cleanup error:", err);
  }

  return { auditRowsDeleted, alertsDeleted, customersDeleted, healthLogsDeleted };
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startRetentionScheduler() {
  if (cleanupInterval) return;

  setTimeout(async () => {
    try {
      const result = await runRetentionCleanup();
      if (result.auditRowsDeleted > 0 || result.alertsDeleted > 0 || result.customersDeleted > 0 || result.healthLogsDeleted > 0) {
        console.log(`[retention-cleanup] Startup run: deleted ${result.auditRowsDeleted} audit rows, ${result.alertsDeleted} old alerts, ${result.customersDeleted} anonymized customers, ${result.healthLogsDeleted} health log entries`);
      }
      // Also purge expired soft-deleted records from recycle bin (>30 days)
      await purgeExpiredRecycleBinItems();
    } catch (err) {
      console.error("[retention-cleanup] Startup run error:", err);
    }
  }, 30000);

  cleanupInterval = setInterval(async () => {
    try {
      const result = await runRetentionCleanup();
      if (result.auditRowsDeleted > 0 || result.alertsDeleted > 0 || result.customersDeleted > 0 || result.healthLogsDeleted > 0) {
        console.log(`[retention-cleanup] Deleted ${result.auditRowsDeleted} audit rows, ${result.alertsDeleted} old alerts, ${result.customersDeleted} anonymized customers, ${result.healthLogsDeleted} health log entries`);
      }
      // Also purge expired soft-deleted records from recycle bin (>30 days)
      await purgeExpiredRecycleBinItems();
    } catch (err) {
      console.error("[retention-cleanup] Scheduler error:", err);
    }
  }, 24 * 60 * 60 * 1000);
}
