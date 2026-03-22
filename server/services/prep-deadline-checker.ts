import { pool } from "../db";
import { emitToTenant } from "../realtime";
import { createNotification } from "./prep-notifications";

let deadlineTimer: ReturnType<typeof setInterval> | null = null;
let summaryTimer: ReturnType<typeof setInterval> | null = null;

export function startDeadlineChecker(): void {
  if (deadlineTimer) return;

  deadlineTimer = setInterval(async () => {
    try {
      const now = new Date();

      const { rows: overdue } = await pool.query<{
        id: string;
        tenant_id: string;
        chef_id: string | null;
        chef_name: string | null;
        menu_item_name: string | null;
        due_at: Date;
      }>(
        `SELECT id, tenant_id, chef_id, chef_name, menu_item_name, due_at
         FROM ticket_assignments
         WHERE status IN ('assigned','in_progress')
           AND due_at IS NOT NULL
           AND due_at < $1
           AND (overdue_alerted = false OR overdue_alerted IS NULL)`,
        [now]
      );

      for (const row of overdue) {
        await pool.query(
          `UPDATE ticket_assignments SET overdue_alerted = true WHERE id = $1`,
          [row.id]
        );
        emitToTenant(row.tenant_id, "prep:task_overdue", {
          taskId: row.id,
          taskName: row.menu_item_name,
          chefId: row.chef_id,
          chefName: row.chef_name,
          dueAt: row.due_at,
        });
        await createNotification({
          tenantId: row.tenant_id,
          chefId: row.chef_id,
          type: "task_overdue",
          title: `🔴 OVERDUE: ${row.menu_item_name ?? "Task"} is past its deadline`,
          body: row.chef_name ? `Assigned to ${row.chef_name}` : undefined,
          priority: "HIGH",
          relatedTaskId: row.id,
          relatedMenuItem: row.menu_item_name,
          actionUrl: "/kitchen",
          actionLabel: "View Task",
        });
      }

      const fiveMin = new Date(now.getTime() + 5 * 60 * 1000);
      const { rows: soon } = await pool.query<{
        id: string;
        tenant_id: string;
        chef_id: string | null;
        chef_name: string | null;
        menu_item_name: string | null;
        due_at: Date;
      }>(
        `SELECT id, tenant_id, chef_id, chef_name, menu_item_name, due_at
         FROM ticket_assignments
         WHERE status IN ('assigned','in_progress')
           AND due_at IS NOT NULL
           AND due_at >= $1 AND due_at < $2
           AND (overdue_alerted = false OR overdue_alerted IS NULL)`,
        [now, fiveMin]
      );

      for (const row of soon) {
        emitToTenant(row.tenant_id, "prep:deadline_warning", {
          taskId: row.id,
          taskName: row.menu_item_name,
          chefId: row.chef_id,
          dueAt: row.due_at,
          minutesLeft: Math.round((row.due_at.getTime() - now.getTime()) / 60000),
        });
        await createNotification({
          tenantId: row.tenant_id,
          chefId: row.chef_id,
          type: "deadline_warning",
          title: `⏰ Deadline in 5 min: ${row.menu_item_name ?? "Task"}`,
          priority: "HIGH",
          relatedTaskId: row.id,
          relatedMenuItem: row.menu_item_name,
          actionUrl: "/kitchen",
          actionLabel: "View Task",
        });
      }
    } catch (err) {
      console.error("[PrepDeadlineChecker] Error:", err);
    }
  }, 60 * 1000);

  summaryTimer = setInterval(async () => {
    try {
      const { rows: tenants } = await pool.query<{ tenant_id: string }>(
        `SELECT DISTINCT tenant_id FROM ticket_assignments WHERE status IN ('assigned','in_progress','completed','verified','issue_reported')`
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
             COUNT(*) FILTER (WHERE status IN ('completed','verified'))::int AS completed,
             COUNT(*) FILTER (WHERE status = 'verified')::int AS verified,
             COUNT(*) FILTER (WHERE due_at < now() AND status NOT IN ('completed','verified'))::int AS overdue,
             COUNT(*) FILTER (WHERE status = 'issue_reported')::int AS issue_reported
           FROM ticket_assignments
           WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE`,
          [tenant_id]
        );

        const summary = rows[0];
        if (!summary || summary.total === 0) continue;

        emitToTenant(tenant_id, "prep:readiness_summary", { ...summary, tenantId: tenant_id });

        if (summary.total > 0 && summary.completed === summary.total) {
          emitToTenant(tenant_id, "prep:all_complete", {
            total: summary.total,
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
