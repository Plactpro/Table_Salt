import { pool } from "../db";

export interface PriceContext {
  tenantId: string;
  outletId: string;
  menuItemId: string;
  menuItemName?: string;
  basePrice: number;
  orderType?: string;
  currentTime?: Date;
  dayOfWeek?: number;
  customerSegment?: string;
  orderId?: string;
  orderItemId?: string;
}

export interface ResolvedPrice {
  price: number;
  ruleId: string | null;
  priceType: string;
  reason: string;
  badge: string | null;
}

const PRICE_TYPE_PRIORITY: Record<string, number> = {
  EVENT: 10,
  CUSTOMER_SEGMENT: 8,
  TIME_DAY: 6,
  TIME_SLOT: 5,
  DAY_BASED: 4,
  ORDER_TYPE: 3,
  OUTLET_BASE: 2,
  GLOBAL_BASE: 1,
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function matchesOrderType(rule: any, orderType?: string): boolean {
  if (!rule.order_type) return true;
  if (!orderType) return false;
  const normalize = (s: string) => s.toLowerCase().replace(/_/g, "");
  return normalize(rule.order_type) === normalize(orderType);
}

function matchesTimeSlot(rule: any, now: Date): boolean {
  if (!rule.time_slot_start || !rule.time_slot_end) return true;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(rule.time_slot_start);
  const end = timeToMinutes(rule.time_slot_end);
  if (start <= end) {
    return currentMinutes >= start && currentMinutes < end;
  }
  return currentMinutes >= start || currentMinutes < end;
}

function matchesDayOfWeek(rule: any, now: Date): boolean {
  if (!rule.day_of_week) return true;
  const days: number[] = Array.isArray(rule.day_of_week) ? rule.day_of_week : [];
  if (days.length === 0) return true;
  const currentDay = now.getDay() === 0 ? 7 : now.getDay();
  return days.includes(currentDay);
}

function matchesCustomerSegment(rule: any, customerSegment?: string): boolean {
  if (!rule.customer_segment) return true;
  if (!customerSegment) return false;
  return rule.customer_segment.toUpperCase() === customerSegment.toUpperCase();
}

function matchesDateRange(rule: any, now: Date): boolean {
  const today = now.toISOString().slice(0, 10);
  if (rule.valid_from && today < rule.valid_from) return false;
  if (rule.valid_until && today > rule.valid_until) return false;
  return true;
}

function getBadge(priceType: string, rule: any): string | null {
  switch (priceType) {
    case "EVENT": return rule.notes || "Special Event";
    case "CUSTOMER_SEGMENT": {
      const seg = (rule.customer_segment || "").toLowerCase();
      if (seg === "loyalty") return "Loyalty Price";
      if (seg === "vip") return "VIP Price";
      if (seg === "staff") return "Staff Price";
      if (seg === "corporate") return "Corporate Rate";
      return "Member Price";
    }
    case "TIME_DAY": return rule.notes || "Time+Day Special";
    case "TIME_SLOT": return rule.notes || "Lunch Special";
    case "DAY_BASED": return rule.notes || "Day Special";
    case "ORDER_TYPE": {
      const ot = (rule.order_type || "").toLowerCase();
      if (ot.includes("delivery")) return "Delivery Price";
      if (ot.includes("takeaway")) return "Takeaway Price";
      return "Order Type Price";
    }
    case "OUTLET_BASE": return null;
    default: return null;
  }
}

async function writeResolutionLog(
  ctx: PriceContext,
  resolved: ResolvedPrice,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO price_resolution_log
       (tenant_id, outlet_id, order_id, order_item_id, menu_item_id, menu_item_name,
        base_price, resolved_price, price_rule_id, price_type_applied, resolution_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        ctx.tenantId,
        ctx.outletId,
        ctx.orderId ?? null,
        ctx.orderItemId ?? null,
        ctx.menuItemId,
        ctx.menuItemName ?? null,
        ctx.basePrice.toFixed(2),
        resolved.price.toFixed(2),
        resolved.ruleId,
        resolved.priceType,
        resolved.reason,
      ]
    );
  } catch (_) {
  }
}

export async function resolvePrice(ctx: PriceContext): Promise<ResolvedPrice> {
  const now = ctx.currentTime ?? new Date();

  const { rows } = await pool.query(
    `SELECT * FROM outlet_menu_prices
     WHERE tenant_id = $1 AND outlet_id = $2 AND menu_item_id = $3 AND is_active = true
     ORDER BY priority DESC, created_at ASC`,
    [ctx.tenantId, ctx.outletId, ctx.menuItemId]
  );

  const candidates: Array<{ rule: any; typePriority: number }> = [];

  for (const rule of rows) {
    const pt = rule.price_type?.toUpperCase() as string;

    if (!matchesDateRange(rule, now)) continue;
    if (!matchesOrderType(rule, ctx.orderType)) continue;
    if (!matchesTimeSlot(rule, now)) continue;
    if (!matchesDayOfWeek(rule, now)) continue;
    if (!matchesCustomerSegment(rule, ctx.customerSegment)) continue;

    let effectivePriceType = pt;
    if (pt === "OUTLET_BASE") {
      effectivePriceType = "OUTLET_BASE";
    } else if (pt === "ORDER_TYPE") {
      effectivePriceType = "ORDER_TYPE";
    } else if (pt === "TIME_SLOT") {
      if (rule.time_slot_start && rule.day_of_week) {
        effectivePriceType = "TIME_DAY";
      } else {
        effectivePriceType = "TIME_SLOT";
      }
    } else if (pt === "DAY_BASED") {
      effectivePriceType = "DAY_BASED";
    } else if (pt === "CUSTOMER_SEGMENT") {
      effectivePriceType = "CUSTOMER_SEGMENT";
    } else if (pt === "EVENT") {
      effectivePriceType = "EVENT";
    }

    const typePriority = PRICE_TYPE_PRIORITY[effectivePriceType] ?? 0;
    candidates.push({ rule, typePriority });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const typeDiff = b.typePriority - a.typePriority;
      if (typeDiff !== 0) return typeDiff;
      return (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
    });

    const best = candidates[0];
    const { rule } = best;
    const pt = rule.price_type?.toUpperCase();
    const resolvedPt = candidates[0].typePriority === PRICE_TYPE_PRIORITY["TIME_DAY"] && pt === "TIME_SLOT"
      ? "TIME_DAY"
      : pt;

    const resolved: ResolvedPrice = {
      price: Number(rule.price),
      ruleId: rule.id,
      priceType: resolvedPt,
      reason: `${resolvedPt} rule matched (priority ${rule.priority ?? 0})`,
      badge: getBadge(resolvedPt, rule),
    };

    setImmediate(() => writeResolutionLog(ctx, resolved));
    return resolved;
  }

  const fallback: ResolvedPrice = {
    price: ctx.basePrice,
    ruleId: null,
    priceType: "GLOBAL_BASE",
    reason: "No matching price rule — global base price used",
    badge: null,
  };
  setImmediate(() => writeResolutionLog(ctx, fallback));
  return fallback;
}

export async function resolvePriceBatch(items: PriceContext[]): Promise<ResolvedPrice[]> {
  if (items.length === 0) return [];

  const tenantId = items[0].tenantId;
  const outletId = items[0].outletId;
  const menuItemIds = [...new Set(items.map(i => i.menuItemId))];

  const { rows } = await pool.query(
    `SELECT * FROM outlet_menu_prices
     WHERE tenant_id = $1 AND outlet_id = $2 AND menu_item_id = ANY($3) AND is_active = true
     ORDER BY priority DESC, created_at ASC`,
    [tenantId, outletId, menuItemIds]
  );

  const rulesByItem = new Map<string, any[]>();
  for (const r of rows) {
    if (!rulesByItem.has(r.menu_item_id)) rulesByItem.set(r.menu_item_id, []);
    rulesByItem.get(r.menu_item_id)!.push(r);
  }

  return Promise.all(
    items.map(ctx => resolvePrice({ ...ctx, currentTime: ctx.currentTime ?? new Date() }))
  );
}
