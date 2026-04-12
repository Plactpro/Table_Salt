import { pool } from "../db";
import { sendEmail } from "./email-service";

export async function sendReservationReminders(): Promise<void> {
  let sent24h = 0;
  let sent2h = 0;

  // ── 24-hour reminders ────────────────────────────────────────────────────
  const { rows: rows24h } = await pool.query(`
    SELECT r.*, t.name AS restaurant_name
    FROM reservations r
    JOIN tenants t ON t.id = r.tenant_id
    WHERE r.status IN ('confirmed', 'pending')
      AND r.reminder_24h_sent = false
      AND r.date_time BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
      AND r.customer_email IS NOT NULL
  `);

  for (const row of rows24h) {
    try {
      const dt = new Date(row.date_time).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:auto">
          <h2 style="color:#1B4332">Reservation Reminder 🍽️</h2>
          <p>Hi ${row.customer_name || "there"},</p>
          <p>This is a reminder that you have a reservation at <strong>${row.restaurant_name}</strong> <strong>tomorrow</strong>.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr><td style="padding:8px;font-weight:bold;color:#555">Date &amp; Time</td><td style="padding:8px">${dt}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;color:#555">Guests</td><td style="padding:8px">${row.guests}</td></tr>
            ${row.notes ? `<tr><td style="padding:8px;font-weight:bold;color:#555">Notes</td><td style="padding:8px">${row.notes}</td></tr>` : ""}
          </table>
          <p style="color:#888;font-size:13px">If you need to cancel or modify, please contact us as soon as possible.</p>
        </div>`;
      await sendEmail({
        to: row.customer_email,
        subject: `Reminder: Your reservation at ${row.restaurant_name} tomorrow`,
        html,
        text: `Reminder: You have a reservation at ${row.restaurant_name} on ${dt} for ${row.guests} guest(s).`,
      });
      await pool.query(
        `UPDATE reservations SET reminder_24h_sent = true, reminder_sent_at = NOW() WHERE id = $1`,
        [row.id],
      );
      sent24h++;
    } catch (e: any) {
      console.error(`[Reminders] 24h send failed for reservation ${row.id}:`, e.message);
    }
  }

  // ── 2-hour reminders ─────────────────────────────────────────────────────
  const { rows: rows2h } = await pool.query(`
    SELECT r.*, t.name AS restaurant_name
    FROM reservations r
    JOIN tenants t ON t.id = r.tenant_id
    WHERE r.status IN ('confirmed', 'pending')
      AND r.reminder_2h_sent = false
      AND r.date_time BETWEEN NOW() + INTERVAL '1 hour 45 minutes' AND NOW() + INTERVAL '2 hours 15 minutes'
      AND r.customer_email IS NOT NULL
  `);

  for (const row of rows2h) {
    try {
      const dt = new Date(row.date_time).toLocaleString("en-GB", { timeStyle: "short" });
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:auto">
          <h2 style="color:#1B4332">Your Table is Ready Soon 🍽️</h2>
          <p>Hi ${row.customer_name || "there"},</p>
          <p>Your reservation at <strong>${row.restaurant_name}</strong> is in approximately <strong>2 hours</strong> (${dt}).</p>
          <p>We look forward to welcoming you and your party of <strong>${row.guests}</strong>.</p>
          <p style="color:#888;font-size:13px">If you need to cancel, please contact us immediately.</p>
        </div>`;
      await sendEmail({
        to: row.customer_email,
        subject: `Your reservation at ${row.restaurant_name} is in 2 hours`,
        html,
        text: `Your reservation at ${row.restaurant_name} is in 2 hours (${dt}) for ${row.guests} guest(s).`,
      });
      await pool.query(
        `UPDATE reservations SET reminder_2h_sent = true, reminder_sent_at = NOW() WHERE id = $1`,
        [row.id],
      );
      sent2h++;
    } catch (e: any) {
      console.error(`[Reminders] 2h send failed for reservation ${row.id}:`, e.message);
    }
  }

  console.log(`[Reminders] Sent: ${sent24h} 24h reminder(s), ${sent2h} 2h reminder(s)`);
}
