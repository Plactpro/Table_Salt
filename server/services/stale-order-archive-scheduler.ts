import cron from "node-cron";
import { pool } from "../db";
import { auditLog } from "../audit";
import { emitToTenant } from "../realtime";
import { withJobLock, JOB_LOCK } from "../lib/job-lock";

let schedulerTask: cron.ScheduledTask | null = null;

async function archiveStaleOrdersForTenant(tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const staleStatuses = ["new", "in_progress", "sent_to_kitchen", "ready"];
  const result = await pool.query(
    `UPDATE orders
     SET status = 'cancelled', notes = COALESCE(NULLIF(notes, ''), '') || CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE ' | ' END || 'Auto-archived: stale order'
     WHERE tenant_id = $1
       AND status::text = ANY($2::text[])
       AND created_at < $3
     RETURNING id`,
    [tenantId, staleStatuses, cutoff]
  );
  const archived = result.rowCount ?? 0;
  await auditLog({
    tenantId,
    userName: "SYSTEM",
    action: "STALE_ORDERS_ARCHIVED",
    entityType: "orders",
    metadata: { archived, cutoff: cutoff.toISOString(), trigger: "scheduler" },
  });
  if (archived > 0) {
    emitToTenant(tenantId, "order:stale_archived", { count: archived });
  }
  return archived;
}

async function runNightlySweep(): Promise<void> {
  const { rows: tenants } = await pool.query(
    `SELECT id FROM tenants WHERE active = true`
  );
  let totalArchived = 0;
  for (const tenant of tenants) {
    try {
      const n = await archiveStaleOrdersForTenant(tenant.id);
      if (n > 0) {
        console.log(`[StaleOrderArchive] Archived ${n} orders for tenant ${tenant.id}`);
      }
      totalArchived += n;
    } catch (err) {
      console.error(`[StaleOrderArchive] Failed for tenant ${tenant.id}:`, err);
    }
  }
  console.log(
    `[StaleOrderArchive] Done — ${tenants.length} tenant(s), ${totalArchived} archived total`
  );
}

export function startStaleOrderArchiveScheduler(): void {
  if (schedulerTask) return;
  schedulerTask = cron.schedule("0 4 * * *", () => {
    withJobLock(JOB_LOCK.STALE_ORDER_ARCHIVE, async () => {
      console.log("[StaleOrderArchive] Nightly sweep triggered at 04:00 UTC");
      await runNightlySweep();
    }).catch(err =>
      console.error("[StaleOrderArchive] Lock/run error:", err)
    );
  });
  console.log(
    "[StaleOrderArchive] Scheduler started (node-cron: 0 4 * * * UTC)"
  );
}

export function stopStaleOrderArchiveScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
}

export { runNightlySweep, archiveStaleOrdersForTenant };
