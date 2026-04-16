import { pool } from "../db";

/**
 * Wraps a background job tick in a Postgres advisory lock so that only one
 * instance executes the job at a time in a multi-instance deployment.
 *
 * Returns true if the lock was acquired and the job ran, false if another
 * instance already holds the lock (tick skipped).
 */
export async function withJobLock(jobId: number, fn: () => Promise<void>): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT pg_try_advisory_xact_lock($1) AS acquired", [jobId]);
    if (!rows[0].acquired) {
      await client.query("ROLLBACK");
      return false;
    }
    await fn();
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Stable lock IDs for each background job — do not reuse or renumber. */
export const JOB_LOCK = {
  DAILY_REPORT:       191001,
  STOCK_REPORT:       191002,
  WASTAGE_SUMMARY:    191003,
  SHIFT_DIGEST:       191004,
  ADVANCE_ORDER:      191005,
  RETENTION_CLEANUP:  191006,
  WEBHOOK_MONITOR:    191007,
  CHEF_ESCALATION:    191008,
  COORDINATION_RULES: 191009,
  PRINTER_MONITOR:    191010,
} as const;
