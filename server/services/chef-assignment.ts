import { storage } from "../storage";
import { emitToTenant } from "../realtime";
import { pool } from "../db";
import { createNotification } from "./prep-notifications";
import { withJobLock, JOB_LOCK } from "../lib/job-lock";

export interface AssignmentSettings {
  mode: "full_auto" | "hybrid" | "self_assign" | "manual";
  maxTicketsPerChef: number;
  unassignedTimeoutMin: number;
  autoReassignIdleMin: number;
  considerRoster: boolean;
  considerWorkload: boolean;
  considerExperience: boolean;
  allowSelfAssign: boolean;
  allowChefReassign: boolean;
  requireReassignReason: boolean;
}

export const DEFAULT_ASSIGNMENT_SETTINGS: AssignmentSettings = {
  mode: "hybrid",
  maxTicketsPerChef: 5,
  unassignedTimeoutMin: 3,
  autoReassignIdleMin: 10,
  considerRoster: true,
  considerWorkload: true,
  considerExperience: true,
  allowSelfAssign: true,
  allowChefReassign: true,
  requireReassignReason: true,
};

async function getOutletSettings(outletId: string, tenantId: string): Promise<AssignmentSettings> {
  try {
    const { rows } = await pool.query(
      `SELECT assignment_settings FROM outlets WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [outletId, tenantId]
    );
    if (rows[0]?.assignment_settings) {
      return { ...DEFAULT_ASSIGNMENT_SETTINGS, ...rows[0].assignment_settings };
    }
  } catch {}
  return DEFAULT_ASSIGNMENT_SETTINGS;
}

function scoreChef(
  chef: { activeTickets: number; status: string },
  isRostered: boolean,
  settings: AssignmentSettings
): number {
  let score = 100;
  if (settings.considerWorkload) score -= chef.activeTickets * 20;
  if (settings.considerRoster && isRostered) score += 30;
  if (chef.status === "on_break") score -= 50;
  if (chef.status === "offline") return -999;
  return score;
}

export async function autoAssignTicket(
  tenantId: string,
  outletId: string,
  {
    orderItemId,
    orderId,
    menuItemId,
    menuItemName,
    tableNumber,
    counterId,
    counterName,
  }: {
    orderItemId?: string;
    orderId?: string;
    menuItemId?: string;
    menuItemName?: string;
    tableNumber?: number;
    counterId?: string;
    counterName?: string;
  }
): Promise<{ id: string; status: string; chefId?: string | null; chefName?: string | null }> {
  const settings = outletId ? await getOutletSettings(outletId, tenantId) : DEFAULT_ASSIGNMENT_SETTINGS;
  const today = new Date().toISOString().slice(0, 10);

  let resolvedCounterId = counterId;
  let resolvedCounterName = counterName;

  if (!resolvedCounterId && menuItemId) {
    const counters = await storage.getCounters(tenantId, outletId);
    const matched = counters.find(c =>
      Array.isArray(c.handlesCategories) && (c.handlesCategories as string[]).includes(menuItemId)
    );
    if (matched) {
      resolvedCounterId = matched.id;
      resolvedCounterName = matched.name;
    } else if (counters.length > 0) {
      resolvedCounterId = counters[0].id;
      resolvedCounterName = counters[0].name;
    }
  }

  if (settings.mode === "self_assign" || settings.mode === "manual") {
    const assignment = await storage.createAssignment({
      tenantId,
      outletId,
      orderItemId,
      orderId,
      menuItemId,
      menuItemName,
      tableNumber,
      counterId: resolvedCounterId,
      counterName: resolvedCounterName,
      status: "unassigned",
      assignmentType: "UNASSIGNED",
    });
    emitToTenant(tenantId, "chef-assignment:updated", assignment);
    return assignment;
  }

  const availability = await storage.getChefAvailability(tenantId, outletId, today);
  const roster = resolvedCounterId
    ? await storage.getRoster(tenantId, outletId, today)
    : [];
  const rosteredChefIds = new Set(
    roster.filter(r => r.counterId === resolvedCounterId).map(r => r.chefId).filter(Boolean)
  );

  const eligibleChefs = availability.filter(a =>
    a.counterId === resolvedCounterId &&
    a.status !== "offline" &&
    (a.activeTickets ?? 0) < settings.maxTicketsPerChef
  );

  if (eligibleChefs.length === 0) {
    const assignment = await storage.createAssignment({
      tenantId,
      outletId,
      orderItemId,
      orderId,
      menuItemId,
      menuItemName,
      tableNumber,
      counterId: resolvedCounterId,
      counterName: resolvedCounterName,
      status: "unassigned",
      assignmentType: "UNASSIGNED",
    });
    emitToTenant(tenantId, "chef-assignment:updated", assignment);
    return assignment;
  }

  const scored = eligibleChefs.map(chef => ({
    chef,
    score: scoreChef(chef, rosteredChefIds.has(chef.chefId), settings),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const roster2 = await storage.getRoster(tenantId, outletId, today);
  const chefRosterEntry = roster2.find(r => r.chefId === best.chef.chefId && r.counterId === resolvedCounterId);
  const chefName = chefRosterEntry?.chefName ?? best.chef.chefId;

  const assignmentType = rosteredChefIds.has(best.chef.chefId) ? "AUTO_ROSTER" : "AUTO_WORKLOAD";
  const assignment = await storage.createAssignment({
    tenantId,
    outletId,
    orderItemId,
    orderId,
    menuItemId,
    menuItemName,
    tableNumber,
    counterId: resolvedCounterId,
    counterName: resolvedCounterName,
    chefId: best.chef.chefId,
    chefName,
    assignmentType,
    assignmentScore: best.score,
    assignedAt: new Date(),
    status: "assigned",
  });

  await storage.updateChefAvailabilityStatus(
    best.chef.chefId,
    tenantId,
    today,
    best.chef.status ?? "available",
    (best.chef.activeTickets ?? 0) + 1
  );

  emitToTenant(tenantId, "chef-assignment:updated", assignment);
  return assignment;
}

export async function selfAssignTicket(
  assignmentId: string,
  chefId: string,
  chefName: string,
  tenantId: string
): Promise<{ id: string; status: string; chefId?: string | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const updated = await storage.updateAssignment(assignmentId, tenantId, {
    chefId,
    chefName,
    assignmentType: "SELF_ASSIGNED",
    assignedAt: new Date(),
    status: "assigned",
  });
  if (!updated) throw new Error("Assignment not found");
  await storage.updateChefAvailabilityStatus(chefId, tenantId, today, "available", undefined);
  emitToTenant(tenantId, "chef-assignment:updated", updated);
  createNotification({
    tenantId,
    chefId: updated.chefId,
    type: "task_assigned",
    title: `📋 New task assigned: ${updated.menuItemName ?? "Task"}`,
    body: `Assigned to ${updated.chefName ?? "you"}`,
    priority: "MEDIUM",
    relatedTaskId: updated.id,
    relatedMenuItem: updated.menuItemName,
    actionUrl: `/kitchen`,
    actionLabel: "View Task",
  }).catch(() => {});
  return updated;
}

export async function startAssignment(
  assignmentId: string,
  tenantId: string
): Promise<{ id: string; status: string }> {
  const updated = await storage.updateAssignment(assignmentId, tenantId, {
    startedAt: new Date(),
    status: "in_progress",
  });
  if (!updated) throw new Error("Assignment not found");
  emitToTenant(tenantId, "chef-assignment:updated", updated);
  emitToTenant(tenantId, "prep:task_started", {
    taskId: updated.id,
    taskName: (updated as any).menuItemName,
    chefId: (updated as any).chefId,
    chefName: (updated as any).chefName,
    startedAt: new Date().toISOString(),
  });
  createNotification({
    tenantId,
    chefId: null,
    type: "task_started",
    title: `▶️ ${(updated as any).chefName ?? "Chef"} started: ${(updated as any).menuItemName ?? "Task"}`,
    priority: "LOW",
    relatedTaskId: updated.id,
    relatedMenuItem: (updated as any).menuItemName,
    actionUrl: `/kitchen`,
    actionLabel: "View Task",
  }).catch(() => {});
  return updated;
}

export async function completeAssignment(
  assignmentId: string,
  tenantId: string
): Promise<{ id: string; status: string }> {
  const assignment = await storage.getAssignment(assignmentId, tenantId);
  if (!assignment) throw new Error("Assignment not found");
  const now = new Date();
  const actualTimeMin = assignment.startedAt
    ? Math.round((now.getTime() - assignment.startedAt.getTime()) / 60000)
    : null;
  const updated = await storage.updateAssignment(assignmentId, tenantId, {
    completedAt: now,
    status: "completed",
    actualTimeMin: actualTimeMin ?? undefined,
  });
  if (!updated) throw new Error("Assignment not found");
  if (assignment.chefId) {
    const today = new Date().toISOString().slice(0, 10);
    const avail = (await storage.getChefAvailability(tenantId, undefined, today)).find(
      a => a.chefId === assignment.chefId
    );
    if (avail) {
      await storage.updateChefAvailabilityStatus(
        assignment.chefId,
        tenantId,
        today,
        avail.status ?? "available",
        Math.max(0, (avail.activeTickets ?? 1) - 1)
      );
    }
  }
  emitToTenant(tenantId, "chef-assignment:updated", updated);
  const timeTaken = (updated as any).actualTimeMin;
  emitToTenant(tenantId, "prep:task_completed", {
    taskId: updated.id,
    taskName: assignment.menuItemName,
    chefId: assignment.chefId,
    chefName: assignment.chefName,
    completedAt: new Date().toISOString(),
    timeTaken,
  });
  createNotification({
    tenantId,
    chefId: null,
    type: "task_completed",
    title: `✅ ${assignment.chefName ?? "Chef"} completed: ${assignment.menuItemName ?? "Task"} — Verify now`,
    priority: "HIGH",
    relatedTaskId: updated.id,
    relatedMenuItem: assignment.menuItemName,
    actionUrl: `/kitchen`,
    actionLabel: "Verify Now",
  }).catch(() => {});
  checkDishComplete(tenantId, assignment.menuItemId, assignment.orderId).catch(() => {});
  checkAllPrepComplete(tenantId).catch(() => {});
  return updated;
}

async function checkDishComplete(tenantId: string, menuItemId?: string | null, orderId?: string | null) {
  if (!menuItemId || !orderId) return;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('completed','verified'))::int AS done
     FROM ticket_assignments WHERE tenant_id = $1 AND order_id = $2 AND menu_item_id = $3`,
    [tenantId, orderId, menuItemId]
  );
  const { total, done } = rows[0] ?? {};
  if (total && done && total === done) {
    const { rows: mi } = await pool.query(
      `SELECT name FROM menu_items WHERE id = $1 LIMIT 1`, [menuItemId]
    );
    const name = mi[0]?.name ?? menuItemId;
    emitToTenant(tenantId, "prep:dish_complete", { menuItemId, menuItemName: name, orderId });
    createNotification({
      tenantId, chefId: null, type: "dish_complete",
      title: `🍽️ All prep complete for: ${name} ✅`,
      priority: "LOW", relatedMenuItem: name, actionUrl: `/kitchen`, actionLabel: "View",
    }).catch(() => {});
    checkAllPrepComplete(tenantId).catch(() => {});
  }
}

async function checkAllPrepComplete(tenantId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('completed','verified'))::int AS done
     FROM ticket_assignments
     WHERE tenant_id = $1 AND DATE(created_at) = $2`,
    [tenantId, today]
  );
  const { total, done } = rows[0] ?? {};
  if (!total || total === 0 || total !== done) return;

  const { rows: topRows } = await pool.query(
    `SELECT chef_id, COUNT(*)::int AS task_count
     FROM ticket_assignments
     WHERE tenant_id = $1 AND DATE(created_at) = $2
       AND status IN ('completed','verified') AND chef_id IS NOT NULL
     GROUP BY chef_id ORDER BY task_count DESC LIMIT 1`,
    [tenantId, today]
  );
  const topPerformer = topRows[0]?.chef_id ?? null;

  emitToTenant(tenantId, "prep:all_complete", {
    total,
    topPerformer,
    date: today,
  });
  createNotification({
    tenantId, chefId: null, type: "all_complete",
    title: `🎉 All ${total} prep tasks complete for today!`,
    body: topPerformer ? `Top performer: chef ${topPerformer}` : undefined,
    priority: "LOW",
    actionUrl: `/kitchen`, actionLabel: "View Kitchen",
  }).catch(() => {});
}

export async function reassignTicket(
  assignmentId: string,
  tenantId: string,
  reason: string,
  newChefId?: string,
  newChefName?: string
): Promise<{ id: string; status: string }> {
  const assignment = await storage.getAssignment(assignmentId, tenantId);
  if (!assignment) throw new Error("Assignment not found");
  const today = new Date().toISOString().slice(0, 10);
  if (assignment.chefId) {
    const avail = (await storage.getChefAvailability(tenantId, undefined, today)).find(
      a => a.chefId === assignment.chefId
    );
    if (avail) {
      await storage.updateChefAvailabilityStatus(
        assignment.chefId,
        tenantId,
        today,
        avail.status ?? "available",
        Math.max(0, (avail.activeTickets ?? 1) - 1)
      );
    }
  }
  const updated = await storage.updateAssignment(assignmentId, tenantId, {
    chefId: newChefId ?? null,
    chefName: newChefName ?? null,
    assignmentType: "REASSIGNED",
    reassignReason: reason,
    status: newChefId ? "assigned" : "unassigned",
    assignedAt: newChefId ? new Date() : null,
  });
  if (!updated) throw new Error("Update failed");
  emitToTenant(tenantId, "chef-assignment:updated", updated);
  if (newChefId) {
    createNotification({
      tenantId, chefId: newChefId, type: "task_reassigned",
      title: `📋 New task assigned: ${assignment.menuItemName ?? "Task"} (reassigned)`,
      body: reason,
      priority: "MEDIUM",
      relatedTaskId: updated.id,
      relatedMenuItem: assignment.menuItemName,
      actionUrl: `/kitchen`, actionLabel: "View Task",
    }).catch(() => {});
  }
  return updated;
}

export async function managerAssign(
  assignmentId: string,
  tenantId: string,
  chefId: string,
  chefName: string
): Promise<{ id: string; status: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const updated = await storage.updateAssignment(assignmentId, tenantId, {
    chefId,
    chefName,
    assignmentType: "MANAGER_ASSIGNED",
    assignedAt: new Date(),
    status: "assigned",
  });
  if (!updated) throw new Error("Assignment not found");
  await storage.updateChefAvailabilityStatus(chefId, tenantId, today, "available", undefined);
  emitToTenant(tenantId, "chef-assignment:updated", updated);
  createNotification({
    tenantId, chefId, type: "task_assigned",
    title: `📋 New task assigned: ${(updated as any).menuItemName ?? "Task"}`,
    body: `Assigned by manager`,
    priority: "MEDIUM",
    relatedTaskId: updated.id,
    relatedMenuItem: (updated as any).menuItemName,
    actionUrl: `/kitchen`, actionLabel: "View Task",
  }).catch(() => {});
  return updated;
}

export async function verifyAssignment(
  assignmentId: string,
  tenantId: string,
  verifiedBy: string,
  qualityScore?: number,
  feedback?: string
): Promise<{ id: string; status: string }> {
  const assignment = await storage.getAssignment(assignmentId, tenantId);
  if (!assignment) throw new Error("Assignment not found");
  await pool.query(
    `UPDATE ticket_assignments SET status = 'verified', verified_at = now(), verified_by = $1, quality_score = $2, verification_feedback = $3 WHERE id = $4 AND tenant_id = $5`,
    [verifiedBy, qualityScore ?? null, feedback ?? null, assignmentId, tenantId]
  );
  const updated = { id: assignmentId, status: "verified" };
  emitToTenant(tenantId, "chef-assignment:updated", updated);
  emitToTenant(tenantId, "prep:task_verified", {
    taskId: assignmentId,
    taskName: assignment.menuItemName,
    chefId: assignment.chefId,
    verifiedBy,
    qualityScore,
  });
  if (assignment.chefId) {
    createNotification({
      tenantId, chefId: assignment.chefId, type: "task_verified",
      title: `⭐ Your task was verified: ${assignment.menuItemName ?? "Task"}${qualityScore ? ` (${qualityScore}/5)` : ""}`,
      body: feedback,
      priority: "LOW",
      relatedTaskId: assignmentId,
      relatedMenuItem: assignment.menuItemName,
    }).catch(() => {});
  }
  checkDishComplete(tenantId, assignment.menuItemId, assignment.orderId).catch(() => {});
  checkAllPrepComplete(tenantId).catch(() => {});
  return updated;
}

export async function reportIssue(
  assignmentId: string,
  tenantId: string,
  note: string
): Promise<{ id: string }> {
  const assignment = await storage.getAssignment(assignmentId, tenantId);
  if (!assignment) throw new Error("Assignment not found");
  await pool.query(
    `UPDATE ticket_assignments SET status = 'issue_reported', issue_note = $1 WHERE id = $2 AND tenant_id = $3`,
    [note, assignmentId, tenantId]
  );
  const updated = { id: assignmentId, status: "issue_reported" };
  emitToTenant(tenantId, "chef-assignment:updated", updated);
  emitToTenant(tenantId, "prep:task_issue", {
    taskId: assignmentId, taskName: assignment.menuItemName,
    chefId: assignment.chefId, note,
  });
  createNotification({
    tenantId, chefId: null, type: "task_issue",
    title: `⚠️ Issue reported on: ${assignment.menuItemName ?? "Task"}`,
    body: note,
    priority: "HIGH",
    relatedTaskId: assignmentId,
    relatedMenuItem: assignment.menuItemName,
    actionUrl: `/kitchen`, actionLabel: "Review",
  }).catch(() => {});
  return updated;
}

export async function requestHelp(
  assignmentId: string,
  tenantId: string
): Promise<{ id: string }> {
  const assignment = await storage.getAssignment(assignmentId, tenantId);
  if (!assignment) throw new Error("Assignment not found");
  await pool.query(
    `UPDATE ticket_assignments SET help_requested = true WHERE id = $1 AND tenant_id = $2`,
    [assignmentId, tenantId]
  );
  emitToTenant(tenantId, "prep:task_help", {
    taskId: assignmentId, taskName: assignment.menuItemName,
    chefId: assignment.chefId, chefName: assignment.chefName,
  });
  createNotification({
    tenantId, chefId: null, type: "task_help",
    title: `🆘 ${assignment.chefName ?? "Chef"} needs help on: ${assignment.menuItemName ?? "Task"}`,
    priority: "HIGH",
    relatedTaskId: assignmentId,
    relatedMenuItem: assignment.menuItemName,
    actionUrl: `/kitchen`, actionLabel: "Go Help",
  }).catch(() => {});
  return { id: assignmentId };
}

export async function rebalanceAssignments(tenantId: string, outletId: string): Promise<{ moved: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const settings = await getOutletSettings(outletId, tenantId);
  const liveAssignments = await storage.getLiveAssignments(tenantId, outletId);
  const availability = await storage.getChefAvailability(tenantId, outletId, today);

  const avMap = new Map(availability.map(a => [a.chefId, a]));
  let moved = 0;

  const overloaded = availability.filter(a => (a.activeTickets ?? 0) > settings.maxTicketsPerChef);
  const idle = availability.filter(a => (a.activeTickets ?? 0) === 0 && a.status === "available");

  for (const over of overloaded) {
    if (idle.length === 0) break;
    const targetChef = idle[0];
    const ticketsToMove = liveAssignments.filter(
      a => a.chefId === over.chefId && a.status === "assigned"
    ).slice(0, 1);
    for (const t of ticketsToMove) {
      await storage.updateAssignment(t.id, tenantId, {
        chefId: targetChef.chefId,
        assignmentType: "REASSIGNED",
        reassignReason: "Manager rebalance",
        assignedAt: new Date(),
      });
      moved++;
    }
    idle.shift();
  }

  if (moved > 0) emitToTenant(tenantId, "chef-assignment:rebalanced", { outletId, moved });
  return { moved };
}

let escalationTimer: ReturnType<typeof setInterval> | null = null;

export function startEscalationChecker(): void {
  if (escalationTimer) return;
  escalationTimer = setInterval(() => {
    withJobLock(JOB_LOCK.CHEF_ESCALATION, async () => {
      const { rows: outlets } = await pool.query(
        `SELECT DISTINCT outlet_id, tenant_id FROM ticket_assignments WHERE status = 'unassigned' AND created_at < NOW() - INTERVAL '3 minutes'`
      );
      for (const row of outlets) {
        if (!row.outlet_id || !row.tenant_id) continue;
        const settings = await getOutletSettings(row.outlet_id, row.tenant_id);
        const { rows: overdue } = await pool.query(
          `SELECT id, menu_item_name, counter_name FROM ticket_assignments WHERE tenant_id = $1 AND outlet_id = $2 AND status = 'unassigned' AND created_at < NOW() - INTERVAL '${settings.unassignedTimeoutMin} minutes'`,
          [row.tenant_id, row.outlet_id]
        );
        if (overdue.length > 0) {
          emitToTenant(row.tenant_id, "chef-assignment:escalation", {
            type: "unassigned_timeout",
            outletId: row.outlet_id,
            count: overdue.length,
            tickets: overdue,
          });
        }
      }
    }).catch(err => console.error("[escalation-checker]", err));
  }, 60_000);
}
