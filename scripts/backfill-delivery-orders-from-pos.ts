// One-shot backfill: insert delivery_orders companion rows for POS-Delivery
// orders that lack one. Targets operational statuses (new, served,
// ready_to_pay) only. See audit/02-new-blockers-recon.md PR A addendum.
//
// Run: npx tsx scripts/backfill-delivery-orders-from-pos.ts
// Requires: DATABASE_URL, ENCRYPTION_KEY in env.

const STATUS_MAP = new Map<string, "pending" | "assigned" | "picked_up" | "cancelled">([
  ["new", "pending"],
  ["sent_to_kitchen", "pending"],
  ["in_progress", "assigned"],
  ["ready", "picked_up"],
  ["served", "picked_up"],
  ["ready_to_pay", "pending"],
  ["cancelled", "cancelled"],
  ["voided", "cancelled"],
]);

interface OrphanRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  status: string;
  created_at: Date;
}

async function main() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (missing.length) {
    console.error(`[backfill] Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const { db, pool } = await import("../server/db");
  const { encryptField } = await import("../server/encryption");
  const { deliveryOrders } = await import("../shared/schema");

  console.log("[backfill] Querying for orphan POS-Delivery orders...");

  const result = await pool.query<OrphanRow>(
    `SELECT o.id, o.tenant_id, o.customer_id, o.customer_name, o.customer_phone,
            o.notes, o.status::text AS status, o.created_at
     FROM orders o
     WHERE o.tenant_id IS NOT NULL
       AND o.order_type::text IN ('delivery','phone_delivery','online_delivery','third_party')
       AND o.status::text IN ('new','served','ready_to_pay')
       AND NOT EXISTS (SELECT 1 FROM delivery_orders d WHERE d.order_id = o.id)
     ORDER BY o.tenant_id, o.created_at`
  );
  const rows = result.rows;

  if (rows.length === 0) {
    console.log("[backfill] No orphans found. Nothing to do.");
    await pool.end();
    process.exit(0);
  }

  const byTenant = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let statuses = byTenant.get(r.tenant_id);
    if (!statuses) {
      statuses = new Map();
      byTenant.set(r.tenant_id, statuses);
    }
    statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
  }

  console.log(
    `[backfill] Found ${rows.length} operational orphan POS-Delivery order${rows.length === 1 ? "" : "s"} across ${byTenant.size} tenant${byTenant.size === 1 ? "" : "s"}:`
  );
  for (const [tenantId, statuses] of Array.from(byTenant.entries())) {
    let total = 0;
    for (const n of Array.from(statuses.values())) total += n;
    const breakdown = Array.from(statuses.entries()).map(([s, n]) => `${s}=${n}`).join(", ");
    console.log(`  Tenant ${tenantId}: ${total} orphan${total === 1 ? "" : "s"} (${breakdown})`);
  }

  console.log("[backfill] Starting backfill in 3 seconds... Press Ctrl+C to abort");
  await new Promise(r => setTimeout(r, 3000));

  let inserted = 0;
  let skipped = 0;
  let errored = 0;

  for (const o of rows) {
    const mappedStatus = STATUS_MAP.get(o.status);
    if (!mappedStatus) {
      console.warn(`[backfill] Unknown order status "${o.status}" for tenant=${o.tenant_id} order=${o.id}; skipping`);
      skipped++;
      continue;
    }

    try {
      const customerAddress = encryptField(o.notes || "No address");
      const customerPhone = o.customer_phone ? encryptField(o.customer_phone) : null;
      const trackingNotes = o.customer_name ? `customerName:${o.customer_name}` : null;

      await db.insert(deliveryOrders).values({
        tenantId: o.tenant_id,
        orderId: o.id,
        customerId: o.customer_id,
        customerAddress,
        customerPhone,
        status: mappedStatus,
        trackingNotes,
        createdAt: o.created_at,
      });

      inserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[backfill] INSERT failed for tenant=${o.tenant_id} order=${o.id}: ${msg}`);
      errored++;
    }
  }

  console.log(`[backfill] Complete: ${inserted} inserted, ${skipped} skipped, ${errored} errored`);

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error("[backfill] Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
