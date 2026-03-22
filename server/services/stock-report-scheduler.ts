import { pool } from "../db";
import { generateAndSaveReport } from "./stock-capacity";

let schedulerInterval: NodeJS.Timeout | null = null;

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
  if (schedulerInterval) return;

  schedulerInterval = setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 23 && now.getMinutes() === 0) {
      await runNightlyReports();
    }
  }, 60_000);

  console.log("[StockScheduler] Nightly stock capacity scheduler started (triggers at 23:00)");
}

export function stopStockReportScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

export { runNightlyReports };
