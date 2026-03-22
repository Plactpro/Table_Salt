import { pool } from "../db";

async function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: { user, pass },
  });
}

function buildDigestHtml(data: {
  date: string;
  outletName: string;
  completed: number;
  verified: number;
  total: number;
  overdue: number;
  failed: number;
  issues: number;
  topPerformerName: string | null;
  topPerformerCount: number;
  totalPrepHours: number;
  totalPrepMins: number;
}): string {
  const completedPct = data.total > 0 ? Math.round((data.verified / data.total) * 100) : 0;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 20px; }
    .card { background: #fff; border-radius: 8px; max-width: 600px; margin: 0 auto; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h1 { font-size: 20px; color: #1a1a1a; margin: 0 0 4px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    td { padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
    td:first-child { color: #555; }
    td:last-child { font-weight: 600; color: #1a1a1a; text-align: right; }
    .progress-bar { background: #e8e8e8; border-radius: 4px; height: 8px; margin-top: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: #22c55e; border-radius: 4px; }
    .footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📊 Pre-Prep Shift Digest</h1>
    <div class="subtitle">${data.outletName} &mdash; ${data.date}</div>
    <table>
      <tr><td>✅ Verified</td><td>${data.verified} / ${data.total} tasks (${completedPct}%)</td></tr>
      <tr>
        <td colspan="2">
          <div class="progress-bar"><div class="progress-fill" style="width:${completedPct}%"></div></div>
        </td>
      </tr>
      <tr><td>✔️ Completed</td><td>${data.completed} tasks</td></tr>
      <tr><td>🔴 Overdue</td><td>${data.overdue} tasks</td></tr>
      <tr><td>❌ Failed</td><td>${data.failed} tasks</td></tr>
      <tr><td>⚠️ Issues Raised</td><td>${data.issues}</td></tr>
      ${data.topPerformerName ? `<tr><td>🏆 Top Chef</td><td>${data.topPerformerName} (${data.topPerformerCount} tasks)</td></tr>` : ""}
      <tr><td>⏱️ Total Prep Time</td><td>${data.totalPrepHours}h ${data.totalPrepMins}m</td></tr>
    </table>
    <div class="footer">Table Salt &mdash; Pre-Prep Management</div>
  </div>
</body>
</html>`;
}

async function buildDigestData(tenantId: string, outletId: string | null, dateStr: string) {
  const dateStart = `${dateStr} 00:00:00`;
  const dateEnd = `${dateStr} 23:59:59`;

  const { rows: taskStats } = await pool.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'verified')::int AS verified,
      COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM ticket_assignments
     WHERE tenant_id = $1
       AND ($2::text IS NULL OR outlet_id = $2)
       AND created_at BETWEEN $3 AND $4`,
    [tenantId, outletId, dateStart, dateEnd]
  );

  const { rows: issueStats } = await pool.query(
    `SELECT COUNT(*)::int AS issues
     FROM prep_notifications
     WHERE tenant_id = $1
       AND type IN ('task_issue', 'task_help')
       AND created_at BETWEEN $2 AND $3`,
    [tenantId, dateStart, dateEnd]
  );

  const { rows: topPerformer } = await pool.query(
    `SELECT ta.chef_id, u.name AS chef_name, COUNT(*)::int AS cnt
     FROM ticket_assignments ta
     LEFT JOIN users u ON u.id::text = ta.chef_id
     WHERE ta.tenant_id = $1
       AND ta.status = 'verified'
       AND ta.created_at BETWEEN $2 AND $3
     GROUP BY ta.chef_id, u.name
     ORDER BY cnt DESC
     LIMIT 1`,
    [tenantId, dateStart, dateEnd]
  );

  const { rows: prepTime } = await pool.query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60), 0)::int AS total_mins
     FROM ticket_assignments
     WHERE tenant_id = $1
       AND started_at IS NOT NULL
       AND completed_at IS NOT NULL
       AND created_at BETWEEN $2 AND $3`,
    [tenantId, dateStart, dateEnd]
  );

  const stats = taskStats[0] ?? { total: 0, completed: 0, verified: 0, overdue: 0, failed: 0 };
  const totalMins = prepTime[0]?.total_mins ?? 0;

  return {
    completed: stats.completed,
    verified: stats.verified,
    total: stats.total,
    overdue: stats.overdue,
    failed: stats.failed,
    issues: issueStats[0]?.issues ?? 0,
    topPerformerName: topPerformer[0]?.chef_name ?? null,
    topPerformerCount: topPerformer[0]?.cnt ?? 0,
    totalPrepHours: Math.floor(totalMins / 60),
    totalPrepMins: totalMins % 60,
  };
}

async function sendDigestForTenant(tenantId: string, outletId: string | null, outletName: string) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const digestData = await buildDigestData(tenantId, outletId, dateStr);

  const subject = `📊 Pre-Prep Shift Digest — ${dateStr} — ${outletName}`;
  const html = buildDigestHtml({
    date: dateStr,
    outletName,
    ...digestData,
  });

  const text = [
    `Pre-Prep Shift Digest — ${outletName} — ${dateStr}`,
    `✅ Verified: ${digestData.verified} / ${digestData.total} tasks`,
    `✔️ Completed: ${digestData.completed} tasks`,
    `🔴 Overdue: ${digestData.overdue} tasks`,
    `❌ Failed: ${digestData.failed} tasks`,
    `⚠️  Issues: ${digestData.issues} raised`,
    digestData.topPerformerName ? `🏆 Top Chef: ${digestData.topPerformerName} (${digestData.topPerformerCount} tasks)` : "",
    `⏱️  Total prep time: ${digestData.totalPrepHours}h ${digestData.totalPrepMins}m`,
  ].filter(Boolean).join("\n");

  const { rows: recipients } = await pool.query(
    `SELECT DISTINCT u.email
     FROM users u
     WHERE u.tenant_id = $1
       AND u.role IN ('owner', 'manager', 'chef')
       AND u.email IS NOT NULL
       AND u.email <> ''`,
    [tenantId]
  );

  const emails = recipients.map((r: any) => r.email).filter(Boolean);

  const transport = await getSmtpTransport();
  const from = process.env.SMTP_FROM || "noreply@tablesalt.app";

  if (!transport) {
    console.log(`[ShiftDigest] SMTP not configured — logging digest to console`);
    console.log(`[ShiftDigest] Subject: ${subject}`);
    console.log(`[ShiftDigest] Recipients: ${emails.join(", ") || "(none)"}`);
    console.log(`[ShiftDigest]\n${text}`);
    return;
  }

  if (emails.length === 0) {
    console.log(`[ShiftDigest] No recipients for tenant ${tenantId} — skipping email`);
    return;
  }

  for (const email of emails) {
    try {
      await transport.sendMail({
        from,
        to: email,
        subject,
        text,
        html,
      });
      console.log(`[ShiftDigest] Sent to ${email}`);
    } catch (err: any) {
      console.error(`[ShiftDigest] Failed to send to ${email}: ${err.message}`);
    }
  }
}

function getHourInTimezone(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    return hourPart ? parseInt(hourPart.value, 10) : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

function parseShiftEndHour(): number {
  const val = process.env.SHIFT_END_HOUR;
  if (val) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0 && n <= 23) return n;
  }
  return 22;
}

const firedKeys = new Set<string>();

export function startShiftDigestScheduler(): void {
  const shiftEndHour = parseShiftEndHour();

  const check = async () => {
    try {
      const { rows: tenants } = await pool.query(
        `SELECT t.id, t.name, t.timezone,
                o.id AS outlet_id,
                COALESCE(o.name, t.name) AS outlet_name
         FROM tenants t
         LEFT JOIN outlets o ON o.tenant_id = t.id
         WHERE t.active = true`
      );

      const entries: Array<{ tenantId: string; outletId: string | null; outletName: string; timezone: string | null }> = [];

      if (tenants.length === 0) {
        const { rows: allTenants } = await pool.query(
          `SELECT id, name, timezone FROM tenants WHERE active = true`
        );
        for (const t of allTenants) {
          entries.push({ tenantId: t.id, outletId: null, outletName: t.name, timezone: t.timezone ?? null });
        }
      } else {
        const seen = new Set<string>();
        for (const row of tenants) {
          const key = `${row.id}-${row.outlet_id ?? "null"}`;
          if (seen.has(key)) continue;
          seen.add(key);
          entries.push({ tenantId: row.id, outletId: row.outlet_id ?? null, outletName: row.outlet_name, timezone: row.timezone ?? null });
        }
      }

      for (const entry of entries) {
        const tz = entry.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const currentHour = getHourInTimezone(tz);
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const firedKey = `${entry.tenantId}-${entry.outletId ?? "null"}-${dateStr}`;

        if (currentHour !== shiftEndHour) continue;
        if (firedKeys.has(firedKey)) continue;

        firedKeys.add(firedKey);
        console.log(`[ShiftDigest] Sending digest for ${entry.outletName} (tz: ${tz})`);
        await sendDigestForTenant(entry.tenantId, entry.outletId, entry.outletName);
      }
    } catch (err: any) {
      console.error("[ShiftDigest] Scheduler error:", err.message);
    }
  };

  const intervalMs = 60 * 1000;
  setInterval(check, intervalMs);
  console.log(`[ShiftDigest] Scheduler started — will fire daily at ${shiftEndHour}:00 per outlet timezone`);
}
