import { pool } from "../db";
import { alertEngine } from "./alert-engine";

export async function recalculateAvailability(resourceId: string): Promise<void> {
  // In-use: count from active assignments
  const inUseRes = await pool.query(
    `SELECT COALESCE(SUM(quantity), 0) AS cnt FROM resource_assignments
     WHERE resource_id = $1 AND status IN ('assigned', 'in_use')`,
    [resourceId]
  );
  const inUseUnits = parseInt(inUseRes.rows[0]?.cnt ?? "0", 10);

  // Cleaning: count units currently in cleaning status from resource_units
  const cleaningRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM resource_units
     WHERE resource_id = $1 AND status = 'cleaning'`,
    [resourceId]
  );
  const underCleaningUnits = parseInt(cleaningRes.rows[0]?.cnt ?? "0", 10);

  // Damaged: count units marked as damaged from resource_units
  const damagedRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM resource_units
     WHERE resource_id = $1 AND status = 'damaged'`,
    [resourceId]
  );
  const damagedUnitsFromUnits = parseInt(damagedRes.rows[0]?.cnt ?? "0", 10);

  const resourceRes = await pool.query(
    `SELECT total_units, tenant_id, outlet_id, resource_name, is_trackable FROM special_resources WHERE id = $1`,
    [resourceId]
  );
  if (!resourceRes.rows[0]) return;

  const { total_units, tenant_id, outlet_id, resource_name, is_trackable } = resourceRes.rows[0];
  const totalUnits = parseInt(total_units ?? "0", 10);

  // Use unit-level counts for trackable resources; fall back to assignment-based cleaning for non-trackable
  const damagedUnits = is_trackable ? damagedUnitsFromUnits : 0;
  const cleaningUnits = is_trackable ? underCleaningUnits : 0;
  const availableUnits = Math.max(0, totalUnits - inUseUnits - cleaningUnits - damagedUnits);

  await pool.query(
    `UPDATE special_resources
     SET available_units = $1, in_use_units = $2, under_cleaning_units = $3, damaged_units = $4, updated_at = NOW()
     WHERE id = $5`,
    [availableUnits, inUseUnits, cleaningUnits, damagedUnits, resourceId]
  );

  if (availableUnits === 0 && inUseUnits > 0) {
    alertEngine.trigger("RESOURCE_DEPLETED", {
      tenantId: tenant_id,
      outletId: outlet_id,
      message: `All units of ${resource_name} are now in use`,
      referenceId: resourceId,
    }).catch(() => {});
  }
}

interface AssignResourcesParams {
  tenantId: string;
  outletId: string;
  tableId: string;
  tableNumber?: string;
  orderId?: string;
  resources: Array<{ resourceId: string; quantity: number; assignedFor?: string }>;
  assignedBy?: string;
  assignedByName?: string;
}

export async function assignResourcesToTable(params: AssignResourcesParams): Promise<{ success: boolean; message?: string; conflicts?: any[] }> {
  const { tenantId, outletId, tableId, tableNumber, orderId, resources, assignedBy, assignedByName } = params;

  // Aggregate duplicate resourceId entries to avoid checking/inserting same resource twice
  const aggregated = Object.values(
    resources.reduce((acc: Record<string, typeof resources[0]>, r) => {
      if (acc[r.resourceId]) {
        acc[r.resourceId] = { ...acc[r.resourceId], quantity: acc[r.resourceId].quantity + r.quantity };
      } else {
        acc[r.resourceId] = { ...r };
      }
      return acc;
    }, {})
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const conflicts: any[] = [];

    for (const r of aggregated) {
      // Lock the row to prevent concurrent over-allocation
      const res = await client.query(
        `SELECT id, resource_name, available_units FROM special_resources
         WHERE id = $1 AND tenant_id = $2 AND outlet_id = $3 AND is_active = true
         FOR UPDATE`,
        [r.resourceId, tenantId, outletId]
      );
      if (!res.rows[0]) {
        conflicts.push({ resourceId: r.resourceId, message: "Resource not found in this outlet" });
        continue;
      }
      const available = parseInt(res.rows[0].available_units ?? "0", 10);
      if (available < r.quantity) {
        conflicts.push({
          resourceId: r.resourceId,
          resourceName: res.rows[0].resource_name,
          requested: r.quantity,
          available,
        });
      }
    }

    if (conflicts.length > 0) {
      await client.query("ROLLBACK");
      return { success: false, message: "Insufficient resources", conflicts };
    }

    for (const r of aggregated) {
      const nameRes = await client.query(
        `SELECT resource_name FROM special_resources WHERE id = $1 AND tenant_id = $2 AND outlet_id = $3`,
        [r.resourceId, tenantId, outletId]
      );
      const resourceName = nameRes.rows[0]?.resource_name ?? null;

      await client.query(
        `INSERT INTO resource_assignments
         (tenant_id, outlet_id, resource_id, resource_name, table_id, table_number, order_id, quantity, assigned_for, status, assigned_by, assigned_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'assigned',$10,$11)`,
        [tenantId, outletId, r.resourceId, resourceName, tableId, tableNumber ?? null, orderId ?? null, r.quantity, r.assignedFor ?? null, assignedBy ?? null, assignedByName ?? null]
      );

      // Atomically decrement available_units within the transaction to close the race window
      await client.query(
        `UPDATE special_resources
         SET available_units = GREATEST(0, available_units - $1),
             in_use_units = in_use_units + $1,
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [r.quantity, r.resourceId, tenantId]
      );
    }

    await client.query("COMMIT");

    // Full recalculate post-commit for accurate cleaning/damaged counts from resource_units
    for (const r of aggregated) {
      recalculateAvailability(r.resourceId).catch(() => {});
    }

    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function returnResourcesFromTable(tableId: string, tenantId: string, requiresCleaning = false): Promise<void> {
  const activeRes = await pool.query(
    `SELECT DISTINCT resource_id FROM resource_assignments
     WHERE table_id = $1 AND tenant_id = $2 AND status IN ('assigned', 'in_use')`,
    [tableId, tenantId]
  );

  // Always mark assignments as 'returned' to restore availability.
  // The requires_cleaning flag records that physical cleaning is needed but
  // does not block resource availability recalculation.
  await pool.query(
    `UPDATE resource_assignments
     SET status = 'returned', returned_at = NOW(), requires_cleaning = $1
     WHERE table_id = $2 AND tenant_id = $3 AND status IN ('assigned', 'in_use')`,
    [requiresCleaning, tableId, tenantId]
  );

  for (const row of activeRes.rows) {
    await recalculateAvailability(row.resource_id);
  }
}

export async function checkAvailability(
  outletId: string,
  tenantId: string,
  resources: Array<{ resourceId: string; quantity: number }>
): Promise<{ available: boolean; conflicts: any[] }> {
  // Aggregate duplicates so check reflects total requested per resource
  const aggregated = Object.values(
    resources.reduce((acc: Record<string, { resourceId: string; quantity: number }>, r) => {
      if (acc[r.resourceId]) acc[r.resourceId].quantity += r.quantity;
      else acc[r.resourceId] = { ...r };
      return acc;
    }, {})
  );

  const conflicts: any[] = [];

  for (const r of aggregated) {
    const res = await pool.query(
      `SELECT id, resource_name, available_units FROM special_resources
       WHERE id = $1 AND outlet_id = $2 AND tenant_id = $3 AND is_active = true`,
      [r.resourceId, outletId, tenantId]
    );
    if (!res.rows[0]) {
      conflicts.push({ resourceId: r.resourceId, message: "Resource not found" });
      continue;
    }
    const available = parseInt(res.rows[0].available_units ?? "0", 10);
    if (available < r.quantity) {
      conflicts.push({
        resourceId: r.resourceId,
        resourceName: res.rows[0].resource_name,
        requested: r.quantity,
        available,
      });
    }
  }

  return { available: conflicts.length === 0, conflicts };
}

export async function getResourcesForTable(tableId: string, tenantId: string): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM resource_assignments
     WHERE table_id = $1 AND tenant_id = $2 AND status IN ('assigned', 'in_use')
     ORDER BY assigned_at DESC`,
    [tableId, tenantId]
  );
  return res.rows;
}

export async function getUpcomingReservationsNeedingResources(tenantId: string, outletId: string): Promise<any[]> {
  const res = await pool.query(
    `SELECT r.id AS reservation_id, r.customer_name, r.date_time, r.resource_requirements,
            t.table_number
     FROM reservations r
     LEFT JOIN tables t ON t.id = r.table_id
     WHERE r.tenant_id = $1
       AND (t.outlet_id = $2 OR $2 IS NULL)
       AND r.date_time BETWEEN NOW() AND NOW() + INTERVAL '4 hours'
       AND r.resource_requirements IS NOT NULL
       AND r.resource_requirements != '[]'::jsonb
       AND r.status NOT IN ('completed', 'no_show')
     ORDER BY r.date_time ASC`,
    [tenantId, outletId]
  );

  return res.rows.map((row: any) => ({
    reservationId: row.reservation_id,
    customerName: row.customer_name,
    dateTime: row.date_time,
    tableNumber: row.table_number,
    resources: Array.isArray(row.resource_requirements) ? row.resource_requirements : [],
  }));
}
