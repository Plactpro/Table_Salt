import { pool } from "../db";
import { sendTrialWarningEmail } from "./email-service";

async function getOwnerEmail(tenantId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT email FROM users WHERE tenant_id = $1 AND role = 'owner' AND email IS NOT NULL AND email <> '' ORDER BY created_at ASC LIMIT 1`,
    [tenantId]
  );
  return rows[0]?.email ?? null;
}

/**
 * PR-009: Check and send automated renewal reminder emails at D-7, D-3, D-1 before expiry.
 * Covers both trial subscriptions (trial_ends_at) and paid subscriptions (subscription_expires_at).
 * Uses idempotent sent-flag columns to prevent duplicate sends.
 */
async function checkAndSendTrialWarnings(): Promise<void> {
  try {
    // Handle trialing subscriptions (trial_ends_at)
    const { rows: trialTenants } = await pool.query(`
      SELECT id, name,
             trial_ends_at AS expires_at,
             trial_warning_sent_7d,
             trial_warning_sent_3d,
             trial_warning_sent_1d
      FROM tenants
      WHERE subscription_status = 'trialing'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > now()
    `);

    // Handle paid subscriptions (subscription_expires_at if column exists)
    let paidTenants: any[] = [];
    try {
      const result = await pool.query(`
        SELECT id, name,
               subscription_expires_at AS expires_at,
               trial_warning_sent_7d,
               trial_warning_sent_3d,
               trial_warning_sent_1d
        FROM tenants
        WHERE subscription_status IN ('active', 'past_due')
          AND subscription_expires_at IS NOT NULL
          AND subscription_expires_at > now()
      `);
      paidTenants = result.rows;
    } catch (_) {
      // Column doesn't exist yet — skip paid subscription reminders
    }

    const allTenants = [...trialTenants, ...paidTenants];

    for (const tenant of allTenants) {
      const expiresAt = new Date(tenant.expires_at);
      const now = new Date();
      const msLeft = expiresAt.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

      const ownerEmail = await getOwnerEmail(tenant.id);
      if (!ownerEmail) continue;

      if (daysLeft <= 7 && daysLeft > 3 && !tenant.trial_warning_sent_7d) {
        await sendTrialWarningEmail(ownerEmail, tenant.name, daysLeft);
        await pool.query(`UPDATE tenants SET trial_warning_sent_7d = true WHERE id = $1`, [tenant.id]);
        console.log(`[TrialWarning] Sent 7-day renewal reminder to ${tenant.name} (${daysLeft} days left)`);
      } else if (daysLeft <= 3 && daysLeft > 1 && !tenant.trial_warning_sent_3d) {
        await sendTrialWarningEmail(ownerEmail, tenant.name, daysLeft);
        await pool.query(`UPDATE tenants SET trial_warning_sent_3d = true WHERE id = $1`, [tenant.id]);
        console.log(`[TrialWarning] Sent 3-day renewal reminder to ${tenant.name} (${daysLeft} days left)`);
      } else if (daysLeft <= 1 && !tenant.trial_warning_sent_1d) {
        await sendTrialWarningEmail(ownerEmail, tenant.name, daysLeft);
        await pool.query(`UPDATE tenants SET trial_warning_sent_1d = true WHERE id = $1`, [tenant.id]);
        console.log(`[TrialWarning] Sent 1-day renewal reminder to ${tenant.name} (${daysLeft} days left)`);
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
