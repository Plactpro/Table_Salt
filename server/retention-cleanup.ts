import { db } from "./db";
import { storage } from "./storage";
import { sql } from "drizzle-orm";

export async function runRetentionCleanup(): Promise<{ auditRowsDeleted: number; alertsDeleted: number }> {
  let auditRowsDeleted = 0;
  let alertsDeleted = 0;

  try {
    const allTenants = await db.execute(sql`SELECT id, module_config FROM tenants`);
    for (const tenant of allTenants.rows) {
      const tenantId = tenant.id as string;
      const mc = (tenant.module_config || {}) as Record<string, unknown>;

      const auditRetentionMonths = (mc.auditLogRetentionMonths as number) || 24;
      const auditCutoff = new Date();
      auditCutoff.setMonth(auditCutoff.getMonth() - auditRetentionMonths);

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

      if (mc.autoDeleteAnonymized) {
        await db.execute(
          sql`DELETE FROM customers WHERE tenant_id = ${tenantId} AND anonymized = true`
        );
      }
    }
  } catch (err) {
    console.error("Retention cleanup error:", err);
  }

  return { auditRowsDeleted, alertsDeleted };
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startRetentionScheduler() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(async () => {
    try {
      const result = await runRetentionCleanup();
      if (result.auditRowsDeleted > 0 || result.alertsDeleted > 0) {
        console.log(`[retention-cleanup] Deleted ${result.auditRowsDeleted} audit rows, ${result.alertsDeleted} old alerts`);
      }
    } catch (err) {
      console.error("[retention-cleanup] Scheduler error:", err);
    }
  }, 24 * 60 * 60 * 1000);
}
