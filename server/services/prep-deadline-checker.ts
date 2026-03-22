import { pool } from "../db";
import { emitToTenant } from "../realtime";
import { createNotification } from "./prep-notifications";

let deadlineTimer: ReturnType<typeof setInterval> | null = null;
let summaryTimer: ReturnType<typeof setInterval> | null = null;

const warnedKeys = new Set<string>();
const LOW_READINESS_THRESHOLD = 50;

export function startDeadlineChecker(): void {
  if (deadlineTimer) return;

  deadlineTimer = setInterval(async () => {
    try {
      const now = new Date();

      const { rows: activeTasks } = await pool.query<{
        id: string;
        tenant_id: string;
        chef_id: string | null;
        chef_name: string | null;
        menu_item_name: string | null;
        due_at: Date | null;
        started_at: Date | null;
        estimated_time_min: number | null;
        overdue_alerted: boolean | null;
      }>(
        `SELECT id, tenant_id, chef_id, chef_name, menu_item_name,
                due_at, started_at, estimated_time_min, overdue_alerted
         FROM ticket_assignments
         WHERE status IN ('assigned','in_progress')
           AND (
             due_at IS NOT NULL
             OR (started_at IS NOT NULL AND estimated_time_min IS NOT NULL)
           )`
      );

      for (const row of activeTasks) {
        let effectiveDueAt: Date | null = row.due_at;
        if (!effectiveDueAt && row.started_at && row.estimated_time_min) {
          effectiveDueAt = new Date(
            row.started_at.getTime() + row.estimated_time_min * 60_000
          );
        }
        if (!effectiveDueAt) continue;

        const remainMs = effectiveDueAt.getTime() - now.getTime();
        const remainMin = remainMs / 60_000;

        const key15 = `${row.id}:warn15`;
        const key30 = `${row.id}:warn30`;
        const keyOver = `${row.id}:overdue`;

        if (remainMin <= 0 && !row.overdue_alerted && !warnedKeys.has(keyOver)) {
          warnedKeys.add(keyOver);
          await pool.query(
            `UPDATE ticket_assignments SET overdue_alerted = true WHERE id = $1`,
            [row.id]
          );
          emitToTenant(row.tenant_id, "prep:task_overdue", {
            taskId: row.id,
            taskName: row.menu_item_name,
            chefId: row.chef_id,
            chefName: row.chef_name,
            overdueMinutes: Math.abs(Math.round(remainMin)),
            dueAt: effectiveDueAt,
          });
          await createNotification({
            tenantId: row.tenant_id,
            chefId: row.chef_id,
            type: "task_overdue",
            title: `🔴 OVERDUE: ${row.menu_item_name ?? "Task"} is past its deadline`,
            body: row.chef_name ? `Assigned to ${row.chef_name} | Not started yet` : undefined,
            priority: "HIGH",
            relatedTaskId: row.id,
            relatedMenuItem: row.menu_item_name,
            actionUrl: "/kitchen",
            actionLabel: "View Task",
          });
        } else if (remainMin > 0 && remainMin <= 15 && !warnedKeys.has(key15)) {
          warnedKeys.add(key15);
          emitToTenant(row.tenant_id, "prep:deadline_warning", {
            taskId: row.id,
            taskName: row.menu_item_name,
            chefId: row.chef_id,
            dueAt: effectiveDueAt,
            minutesLeft: Math.round(remainMin),
            threshold: 15,
          });
          await createNotification({
            tenantId: row.tenant_id,
            chefId: row.chef_id,
            type: "deadline_warning",
            title: `⏰ 15-min warning: ${row.menu_item_name ?? "Task"}`,
            body: row.chef_name
              ? `Assigned to ${row.chef_name} | Only ${Math.round(remainMin)} min remaining`
              : `Only ${Math.round(remainMin)} min remaining`,
            priority: "HIGH",
            relatedTaskId: row.id,
            relatedMenuItem: row.menu_item_name,
            actionUrl: "/kitchen",
            actionLabel: "View Task",
          });
        } else if (remainMin > 15 && remainMin <= 30 && !warnedKeys.has(key30)) {
          warnedKeys.add(key30);
          emitToTenant(row.tenant_id, "prep:deadline_warning", {
            taskId: row.id,
            taskName: row.menu_item_name,
            chefId: row.chef_id,
            dueAt: effectiveDueAt,
            minutesLeft: Math.round(remainMin),
            threshold: 30,
          });
          await createNotification({
            tenantId: row.tenant_id,
            chefId: row.chef_id,
            type: "deadline_warning",
            title: `⏰ 30-min warning: ${row.menu_item_name ?? "Task"}`,
            body: row.chef_name
              ? `Assigned to ${row.chef_name} | ${Math.round(remainMin)} min remaining`
              : `${Math.round(remainMin)} min remaining`,
            priority: "MEDIUM",
            relatedTaskId: row.id,
            relatedMenuItem: row.menu_item_name,
            actionUrl: "/kitchen",
            actionLabel: "View Task",
          });
        }
      }

      const { rows: completedRows } = await pool.query<{ id: string }>(
        `SELECT id FROM ticket_assignments WHERE status IN ('completed','verified')
         AND id = ANY($1::text[])`,
        [Array.from(warnedKeys).map(k => k.split(":")[0])]
      );
      for (const row of completedRows) {
        warnedKeys.delete(`${row.id}:warn30`);
        warnedKeys.delete(`${row.id}:warn15`);
        warnedKeys.delete(`${row.id}:overdue`);
      }
    } catch (err) {
      console.error("[PrepDeadlineChecker] Error:", err);
    }
  }, 60 * 1000);

  summaryTimer = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour < 6 || hour >= 23) return;

    try {
      const { rows: tenants } = await pool.query<{ tenant_id: string }>(
        `SELECT DISTINCT tenant_id FROM ticket_assignments
         WHERE DATE(created_at) = CURRENT_DATE`
      );

      for (const { tenant_id } of tenants) {
        const { rows } = await pool.query<{
          total: number;
          assigned: number;
          in_progress: number;
          completed: number;
          verified: number;
          overdue: number;
          issue_reported: number;
        }>(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned,
             COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
             COUNT(*) FILTER (WHERE status = 'verified')::int AS verified,
             COUNT(*) FILTER (WHERE due_at < now() AND status NOT IN ('completed','verified'))::int AS overdue,
             COUNT(*) FILTER (WHERE status = 'issue_reported')::int AS issue_reported
           FROM ticket_assignments
           WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE`,
          [tenant_id]
        );

        const summary = rows[0];
        if (!summary || summary.total === 0) continue;

        const done = summary.completed + summary.verified;
        const readinessPct = Math.round((done / summary.total) * 100);
        const lowAlert = readinessPct < LOW_READINESS_THRESHOLD;

        emitToTenant(tenant_id, "prep:readiness_summary", {
          ...summary,
          done,
          readinessPct,
          lowReadinessAlert: lowAlert,
          tenantId: tenant_id,
        });

        await createNotification({
          tenantId: tenant_id,
          chefId: null,
          type: "readiness_summary",
          title: `📊 Prep Readiness: ${readinessPct}% complete`,
          body: `${done}/${summary.total} tasks done as of ${new Date().toLocaleTimeString()}`,
          priority: lowAlert ? "HIGH" : "LOW",
          actionUrl: "/kitchen",
          actionLabel: "View Kitchen",
        });

        if (lowAlert) {
          const { rows: shiftRows } = await pool.query<{ shift_start: string; shift_date: string }>(
            `SELECT shift_start, shift_date FROM chef_roster
             WHERE tenant_id = $1 AND shift_date = CURRENT_DATE
               AND (shift_date::text || 'T' || shift_start)::timestamp > NOW()
             ORDER BY shift_start ASC LIMIT 1`,
            [tenant_id]
          );

          let hoursToShift: number | null = null;
          if (shiftRows.length > 0) {
            const shiftStartStr = `${shiftRows[0].shift_date}T${shiftRows[0].shift_start}`;
            const shiftStart = new Date(shiftStartStr);
            hoursToShift = (shiftStart.getTime() - Date.now()) / 3_600_000;
          }

          if (hoursToShift !== null && hoursToShift <= 3 && hoursToShift >= 0) {
            const lowReadinessKey = `${tenant_id}:low_readiness:${new Date().toISOString().slice(0, 10)}`;
            if (!warnedKeys.has(lowReadinessKey)) {
              warnedKeys.add(lowReadinessKey);

              const { rows: unassignedRows } = await pool.query<{ cnt: number }>(
                `SELECT COUNT(*)::int AS cnt FROM ticket_assignments
                 WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE
                   AND status = 'unassigned' AND chef_id IS NULL`,
                [tenant_id]
              );
              const unassignedCount = unassignedRows[0]?.cnt ?? 0;
              const hoursDisplay = Math.round(hoursToShift);

              emitToTenant(tenant_id, "prep:low_readiness_alert", {
                readinessPct,
                unassignedCount,
                hoursToShift: hoursDisplay,
                date: new Date().toISOString().slice(0, 10),
              });

              await createNotification({
                tenantId: tenant_id,
                chefId: null,
                type: "low_readiness_alert",
                title: `🚨 ALERT: LOW PREP READINESS — Only ${readinessPct}% complete — ${hoursDisplay}hrs to shift — ${unassignedCount} tasks still unassigned`,
                priority: "HIGH",
                actionUrl: "/kitchen-board?tab=pending",
                actionLabel: "ASSIGN ALL PENDING NOW",
              });
            }
          }
        }

        if (summary.total > 0 && done === summary.total) {
          const { rows: topRows } = await pool.query<{ chef_id: string; cnt: number }>(
            `SELECT chef_id, COUNT(*)::int AS cnt
             FROM ticket_assignments
             WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE
               AND status IN ('completed','verified') AND chef_id IS NOT NULL
             GROUP BY chef_id ORDER BY cnt DESC LIMIT 1`,
            [tenant_id]
          );
          const topPerformer = topRows[0]?.chef_id ?? null;

          emitToTenant(tenant_id, "prep:all_complete", {
            total: summary.total,
            topPerformer,
            tenantId: tenant_id,
          });
          await createNotification({
            tenantId: tenant_id,
            chefId: null,
            type: "all_complete",
            title: `🎉 All ${summary.total} prep tasks complete for today!`,
            priority: "LOW",
            actionUrl: "/kitchen",
            actionLabel: "View Kitchen",
          });
        }
      }
    } catch (err) {
      console.error("[PrepDeadlineChecker] Summary error:", err);
    }
  }, 120 * 60 * 1000);
}
