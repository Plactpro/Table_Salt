import cron from "node-cron";
import { pool } from "../db";
import { generateAndSaveReport } from "./stock-capacity";

let schedulerTask: cron.ScheduledTask | null = null;

async function runNightlyReports(): Promise<void> {
  try {
    const today = new Date();
    const targetDate = today.toISOString().slice(0, 10);

    const { rows: tenants } = await pool.query(
      `SELECT t.id AS tenant_id, o.id AS outlet_id
       FROM tenants t
       LEFT JOIN outlets o ON o.tenant_id = t.id AND o.is_active = true
       WHERE t.active = true`
    );

    const tenantOutletPairs: { tenantId: string; outletId: string | null }[] = [];
    const tenantsSeen = new Set<string>();

    for (const row of tenants) {
      if (row.outlet_id) {
        tenantOutletPairs.push({ tenantId: row.tenant_id, outletId: row.outlet_id });
      } else if (!tenantsSeen.has(row.tenant_id)) {
        tenantOutletPairs.push({ tenantId: row.tenant_id, outletId: null });
        tenantsSeen.add(row.tenant_id);
      }
    }

    for (const pair of tenantOutletPairs) {
      try {
        await generateAndSaveReport(pair.tenantId, pair.outletId, targetDate, "SCHEDULED", "SYSTEM");
      } catch (err) {
        console.error(`[StockScheduler] Failed for tenant ${pair.tenantId}:`, err);
      }
    }

    console.log(`[StockScheduler] Nightly run complete — ${tenantOutletPairs.length} tenants processed`);
  } catch (err) {
    console.error("[StockScheduler] Nightly run failed:", err);
  }
}

export function startStockReportScheduler(): void {
  if (schedulerTask) return;

  schedulerTask = cron.schedule("0 23 * * *", async () => {
    console.log("[StockScheduler] Nightly cron triggered at 23:00");
    await runNightlyReports();
  });

  console.log("[StockScheduler] Nightly stock capacity scheduler started (node-cron: 0 23 * * *)");
}

export function stopStockReportScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
}

export { runNightlyReports };

export async function runReportsForTenant(tenantId: string, outletId?: string | null): Promise<void> {
  const targetDate = new Date().toISOString().slice(0, 10);
  try {
    if (outletId) {
      await generateAndSaveReport(tenantId, outletId, targetDate, "MANUAL", "SYSTEM");
    } else {
      const { rows: outlets } = await pool.query(
        `SELECT id FROM outlets WHERE tenant_id = $1 AND is_active = true`,
        [tenantId]
      );
      if (outlets.length > 0) {
        for (const o of outlets) {
          await generateAndSaveReport(tenantId, o.id, targetDate, "MANUAL", "SYSTEM");
        }
      } else {
        await generateAndSaveReport(tenantId, null, targetDate, "MANUAL", "SYSTEM");
      }
    }
    console.log(`[StockScheduler] Manual run complete for tenant ${tenantId}`);
  } catch (err) {
    console.error(`[StockScheduler] Manual run failed for tenant ${tenantId}:`, err);
    throw err;
  }
}
