import { pool } from "../db";
import { sendTrialWarningEmail } from "./email-service";

async function getOwnerEmail(tenantId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT email FROM users WHERE tenant_id = $1 AND role = 'owner' AND email IS NOT NULL AND email <> '' ORDER BY created_at ASC LIMIT 1`,
    [tenantId]
  );
  return rows[0]?.email ?? null;
}

async function checkAndSendTrialWarnings(): Promise<void> {
  try {
    const { rows: tenants } = await pool.query(`
      SELECT id, name,
             trial_ends_at,
             trial_warning_sent_7d,
             trial_warning_sent_3d,
             trial_warning_sent_1d
      FROM tenants
      WHERE subscription_status = 'trialing'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > now()
    `);

    for (const tenant of tenants) {
      const trialEnd = new Date(tenant.trial_ends_at);
      const now = new Date();
      const msLeft = trialEnd.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

      const ownerEmail = await getOwnerEmail(tenant.id);
      if (!ownerEmail) continue;

      if (daysLeft <= 7 && daysLeft > 3 && !tenant.trial_warning_sent_7d) {
        await sendTrialWarningEmail(ownerEmail, tenant.name, daysLeft);
        await pool.query(`UPDATE tenants SET trial_warning_sent_7d = true WHERE id = $1`, [tenant.id]);
        console.log(`[TrialWarning] Sent 7-day warning to ${tenant.name} (${daysLeft} days left)`);
      } else if (daysLeft <= 3 && daysLeft > 1 && !tenant.trial_warning_sent_3d) {
        await sendTrialWarningEmail(ownerEmail, tenant.name, daysLeft);
        await pool.query(`UPDATE tenants SET trial_warning_sent_3d = true WHERE id = $1`, [tenant.id]);
        console.log(`[TrialWarning] Sent 3-day warning to ${tenant.name} (${daysLeft} days left)`);
      } else if (daysLeft <= 1 && !tenant.trial_warning_sent_1d) {
        await sendTrialWarningEmail(ownerEmail, tenant.name, daysLeft);
        await pool.query(`UPDATE tenants SET trial_warning_sent_1d = true WHERE id = $1`, [tenant.id]);
        console.log(`[TrialWarning] Sent 1-day warning to ${tenant.name} (${daysLeft} days left)`);
      }
    }
  } catch (err: any) {
    console.error("[TrialWarning] Scheduler error:", err.message);
  }
}

export function startTrialWarningScheduler(): void {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;

  const run = () => checkAndSendTrialWarnings().catch((err) => {
    console.error("[TrialWarning] Unhandled error:", err.message);
  });

  run();
  setInterval(run, CHECK_INTERVAL_MS);
  console.log("[TrialWarning] Trial warning scheduler started — checks every hour");
}
