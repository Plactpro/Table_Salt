import { db } from "../db";
import { orders } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { emitToTenant } from "../realtime";
import { withJobLock, JOB_LOCK } from "../lib/job-lock";

let schedulerInterval: NodeJS.Timeout | null = null;

async function releaseAdvanceOrders() {
  try {
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);

    const scheduledOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, "on_hold"),
          sql`${orders.notes} LIKE '%[ADVANCE]%'`,
          lte(orders.estimatedReadyAt, thirtyMinutesFromNow)
        )
      );

    for (const order of scheduledOrders) {
      await db
        .update(orders)
        .set({ status: "new" })
        .where(eq(orders.id, order.id));

      const orderNumber = order.id.slice(-6).toUpperCase();
      const scheduledTime = order.estimatedReadyAt
        ? new Date(order.estimatedReadyAt).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "N/A";

      emitToTenant(order.tenantId, "coordination:order_updated", {
        orderId: order.id,
        status: "new",
        message: `Auto-released: Advance order ${orderNumber} — scheduled for ${scheduledTime}`,
      });

      emitToTenant(order.tenantId, "kitchen:new_order", {
        orderId: order.id,
        orderNumber,
        orderType: order.orderType,
        notes: order.notes,
      });

      console.log(
        `[AdvanceOrderScheduler] Auto-released order ${order.id} scheduled for ${scheduledTime}`
      );
    }
  } catch (err: any) {
    console.error("[AdvanceOrderScheduler] Error:", err.message);
  }
}

export function startAdvanceOrderScheduler() {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    withJobLock(JOB_LOCK.ADVANCE_ORDER, releaseAdvanceOrders).catch(err =>
      console.error("[AdvanceOrderScheduler] Lock/run error:", err));
  }, 5 * 60 * 1000);
  console.log("[AdvanceOrderScheduler] Started — checking every 5 minutes");
}

export function stopAdvanceOrderScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
