import { db, pool } from "./db";
import { sql } from "drizzle-orm";

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

      // PR-010: Audit records are NEVER permanently deleted — archival runs nightly via archiveAuditTrail().
      // No deletion of audit_events here.

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

// PR-010: Audit trail archival — move audit_events older than 12 months to audit_events_archive
async function archiveAuditTrail(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Insert into archive — ON CONFLICT DO NOTHING handles rows already archived on a prior run
    const insertResult = await client.query(`
      INSERT INTO audit_events_archive
        (id, tenant_id, user_id, user_name, action, entity_type, entity_id, entity_name,
         outlet_id, before, after, metadata, ip_address, user_agent, supervisor_id, created_at, archived_at)
      SELECT
        id, tenant_id, user_id, user_name, action, entity_type, entity_id, entity_name,
        outlet_id, before, after, metadata, ip_address, user_agent, supervisor_id, created_at, now()
      FROM audit_events
      WHERE created_at < NOW() - INTERVAL '12 months'
      ON CONFLICT (id) DO NOTHING
    `);
    const archivedCount = insertResult.rowCount ?? 0;
    // Always delete rows older than 12 months from the primary table — whether or not they were
    // just inserted (they may have been archived in a previous run via ON CONFLICT DO NOTHING).
    // This guarantees the primary table never retains rows older than 12 months.
    await client.query(`DELETE FROM audit_events WHERE created_at < NOW() - INTERVAL '12 months'`);
    await client.query("COMMIT");
    if (archivedCount > 0) {
      console.log(`[Retention] Archived ${archivedCount} audit entries to audit_events_archive`);
    }
    return archivedCount;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Retention] Audit archival error:", err);
    return 0;
  } finally {
    client.release();
  }
}

// PR-010: Auto-acknowledge low/medium priority notifications after 24h/48h respectively
// Critical and high priority alerts are NEVER auto-acknowledged
async function autoAcknowledgeNotifications(): Promise<number> {
  const client = await pool.connect();
  try {
    let total = 0;

    // Low priority (normal/low urgency): auto-acknowledge after 24 hours
    const lowResult = await client.query(`
      UPDATE alert_events
      SET is_resolved = true, auto_acknowledged = true, acknowledged_at = now()
      WHERE urgency = 'normal'
        AND is_resolved = false
        AND created_at < NOW() - INTERVAL '24 hours'
    `);
    total += lowResult.rowCount ?? 0;

    // Medium priority: auto-acknowledge after 48 hours (if a medium urgency value exists)
    const mediumResult = await client.query(`
      UPDATE alert_events
      SET is_resolved = true, auto_acknowledged = true, acknowledged_at = now()
      WHERE urgency = 'medium'
        AND is_resolved = false
        AND created_at < NOW() - INTERVAL '48 hours'
    `);
    total += mediumResult.rowCount ?? 0;

    if (total > 0) {
      console.log(`[Retention] Auto-acknowledged ${total} low/medium priority notifications`);
    }
    return total;
  } catch (err) {
    console.error("[Retention] Notification auto-acknowledge error:", err);
    return 0;
  } finally {
    client.release();
  }
}

// PR-010: Report cache cleanup
async function cleanupReportCache(): Promise<number> {
  const client = await pool.connect();
  try {
    let total = 0;

    // Delete entries where expires_at < NOW() OR older than 48 hours
    const expiredResult = await client.query(`
      DELETE FROM report_cache
      WHERE expires_at < NOW()
         OR created_at < NOW() - INTERVAL '48 hours'
    `);
    total += expiredResult.rowCount ?? 0;

    // Delete stale generating/failed entries older than 1 hour
    const staleResult = await client.query(`
      DELETE FROM report_cache
      WHERE status IN ('generating', 'failed')
        AND created_at < NOW() - INTERVAL '1 hour'
    `);
    total += staleResult.rowCount ?? 0;

    // Keep only the last 5 completed (status='ready' or 'completed') results per (tenant_id, report_type)
    const overflowResult = await client.query(`
      DELETE FROM report_cache
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (PARTITION BY tenant_id, report_type ORDER BY created_at DESC) AS rn
          FROM report_cache
          WHERE status IN ('ready', 'completed')
        ) ranked
        WHERE rn > 5
      )
    `);
    total += overflowResult.rowCount ?? 0;

    if (total > 0) {
      console.log(`[Retention] Cleaned ${total} report_cache entries`);
    }
    return total;
  } catch (err) {
    console.error("[Retention] Report cache cleanup error:", err);
    return 0;
  } finally {
    client.release();
  }
}

// PR-010: Manual-pending payment digest — fire in-app alert for tenants with pending offline payments
async function fireManualPendingDigest(): Promise<void> {
  const client = await pool.connect();
  try {
    // Find tenants with unresolved manual_pending payments in the last 7 days
    const { rows: tenantRows } = await client.query(`
      SELECT
        bp.tenant_id,
        COUNT(*) AS pending_count,
        json_agg(json_build_object(
          'billId', b.id,
          'billNumber', b.bill_number,
          'amount', bp.amount,
          'createdAt', bp.created_at
        ) ORDER BY bp.created_at DESC) AS payments
      FROM bill_payments bp
      JOIN bills b ON b.id = bp.bill_id
      WHERE bp.payment_method = 'manual_pending'
        AND bp.gateway_status = 'gateway_down'
        AND bp.is_refund = false
        AND bp.created_at >= NOW() - INTERVAL '7 days'
        AND b.payment_status != 'paid'
      GROUP BY bp.tenant_id
    `);

    for (const row of tenantRows) {
      const tenantId = row.tenant_id as string;
      const pendingCount = Number(row.pending_count);
      const payments = row.payments as Array<{ billNumber: string; amount: string; createdAt: string }>;

      const paymentList = payments.slice(0, 10).map(p =>
        `#${p.billNumber} (${p.amount})`
      ).join(", ");

      const message = `Action required: ${pendingCount} payment(s) recorded offline during a gateway outage. Please collect or verify these payments: ${paymentList}`;

      // Insert in-app alert for owner/manager roles (store via alert_events)
      await client.query(`
        INSERT INTO alert_events (id, tenant_id, alert_code, urgency, message, target_roles, is_resolved, created_at)
        VALUES (gen_random_uuid(), $1, 'MANUAL-PENDING-DIGEST', 'high', $2, '["owner","manager","outlet_manager"]'::jsonb, false, now())
      `, [tenantId, message]);
    }

    if (tenantRows.length > 0) {
      console.log(`[Retention] Fired manual-pending payment digest for ${tenantRows.length} tenant(s)`);
    }
  } catch (err) {
    console.error("[Retention] Manual pending digest error:", err);
  } finally {
    client.release();
  }
}

// PR-010: Full nightly retention job — audit archival + notification triage + report cache cleanup + payment digest
export async function runNightlyRetention(): Promise<void> {
  console.log("[Retention] Running nightly retention job...");
  await archiveAuditTrail();
  await autoAcknowledgeNotifications();
  await cleanupReportCache();
  await fireManualPendingDigest();
  console.log("[Retention] Nightly retention job complete.");
}

// Track last run date to prevent double-runs
let lastRetentionRunDate = "";
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function checkAndRunNightlyRetention(): void {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const today = now.toISOString().slice(0, 10);

  // Run once per day whenever the 02:xx UTC hour is detected and no run has happened today.
  // The 30-minute check cadence guarantees the job fires within the 02:xx window regardless
  // of when the process started (satisfying "02:00–02:59 UTC, one run per day").
  if (utcHour === 2 && lastRetentionRunDate !== today) {
    lastRetentionRunDate = today;
    runNightlyRetention().catch(err => {
      console.error("[Retention] Nightly retention job error:", err);
    });
  }
}

export function startRetentionScheduler() {
  if (cleanupInterval) return;

  // Run regular cleanup + recycle-bin purge on startup (after 30s delay)
  setTimeout(async () => {
    try {
      const result = await runRetentionCleanup();
      if (result.auditRowsDeleted > 0 || result.alertsDeleted > 0 || result.customersDeleted > 0 || result.healthLogsDeleted > 0) {
        console.log(`[retention-cleanup] Startup run: deleted ${result.auditRowsDeleted} audit rows, ${result.alertsDeleted} old alerts, ${result.customersDeleted} anonymized customers, ${result.healthLogsDeleted} health log entries`);
      }
      await purgeExpiredRecycleBinItems();
    } catch (err) {
      console.error("[retention-cleanup] Startup run error:", err);
    }
  }, 30000);

  // Check nightly retention immediately on process start (in case we missed the 02:00 window)
  checkAndRunNightlyRetention();

  // PR-010: Check every 30 minutes if it's time for nightly retention (02:00–02:59 UTC)
  cleanupInterval = setInterval(() => {
    // Run regular cleanup
    runRetentionCleanup().then(result => {
      if (result.auditRowsDeleted > 0 || result.alertsDeleted > 0 || result.customersDeleted > 0 || result.healthLogsDeleted > 0) {
        console.log(`[retention-cleanup] Deleted ${result.auditRowsDeleted} audit rows, ${result.alertsDeleted} old alerts, ${result.customersDeleted} anonymized customers, ${result.healthLogsDeleted} health log entries`);
      }
      return purgeExpiredRecycleBinItems();
    }).catch(err => {
      console.error("[retention-cleanup] Scheduler error:", err);
    });

    // Check if nightly job should run
    checkAndRunNightlyRetention();
  }, 30 * 60 * 1000);
}
