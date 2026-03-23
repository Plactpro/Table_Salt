import cron from "node-cron";
import { pool } from "../db";
import { triggerWastageDailySummary } from "../routers/wastage";

let schedulerTask: cron.ScheduledTask | null = null;

export function startWastageSummaryScheduler(): void {
  if (schedulerTask) return;

  schedulerTask = cron.schedule("0 0 * * *", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    console.log(`[WastageScheduler] Running midnight daily summary aggregation for ${yesterday}`);
    try {
      const { rows: tenants } = await pool.query(`SELECT id FROM tenants WHERE active = true`);
      for (const tenant of tenants) {
        const { rows: outlets } = await pool.query(
          `SELECT id FROM outlets WHERE tenant_id = $1`, [tenant.id]
        );
        await triggerWastageDailySummary(tenant.id, null, yesterday);
        for (const outlet of outlets) {
          await triggerWastageDailySummary(tenant.id, outlet.id, yesterday);
        }
      }
      console.log(`[WastageScheduler] Done — aggregated ${tenants.length} tenant(s) for ${yesterday}`);
    } catch (err: any) {
      console.error("[WastageScheduler] Error during midnight aggregation:", err.message);
    }
  });

  console.log("[WastageScheduler] Midnight wastage summary scheduler started (0 0 * * *)");
}

export function stopWastageSummaryScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
}
