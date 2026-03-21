import { storage } from "../storage";
import { emitToTenant } from "../realtime";
import { pool } from "../db";

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

async function getOutletSettings(outletId: string): Promise<AssignmentSettings> {
  try {
    const { rows } = await pool.query(
      `SELECT assignment_settings FROM outlets WHERE id = $1 LIMIT 1`,
      [outletId]
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
  const settings = outletId ? await getOutletSettings(outletId) : DEFAULT_ASSIGNMENT_SETTINGS;
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
  return updated;
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
  return updated;
}

export async function rebalanceAssignments(tenantId: string, outletId: string): Promise<{ moved: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const settings = await getOutletSettings(outletId);
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
  escalationTimer = setInterval(async () => {
    try {
      const { rows: outlets } = await pool.query(
        `SELECT DISTINCT outlet_id, tenant_id FROM ticket_assignments WHERE status = 'unassigned' AND created_at < NOW() - INTERVAL '3 minutes'`
      );
      for (const row of outlets) {
        if (!row.outlet_id || !row.tenant_id) continue;
        const settings = await getOutletSettings(row.outlet_id);
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
    } catch (err) {
      console.error("[escalation-checker]", err);
    }
  }, 60_000);
}
