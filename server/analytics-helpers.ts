export interface OrderData {
  id: string;
  total: string | null;
  subtotal: string | null;
  tax: string | null;
  discount: string | null;
  orderType: string | null;
  status: string | null;
  outletId: string | null;
  createdAt: Date | string | null;
}

export interface OrderItemData {
  id: string;
  orderId: string | null;
  menuItemId: string | null;
  name: string | null;
  quantity: number | null;
  price: string | null;
}

export function isVoidOrCancelled(status: string | null): boolean {
  return status === "void" || status === "voided" || status === "cancelled";
}

export function filterOrdersByDateRange(orders: OrderData[], from: Date, to: Date): OrderData[] {
  return orders.filter(o => {
    if (!o.createdAt) return false;
    const d = new Date(o.createdAt);
    return d >= from && d <= to;
  });
}

export function filterValidOrders(orders: OrderData[]): OrderData[] {
  return orders.filter(o => !isVoidOrCancelled(o.status));
}

export function computeRevenueByDay(orders: OrderData[]): Record<string, { date: string; revenue: number; count: number }> {
  const byDay: Record<string, { date: string; revenue: number; count: number }> = {};
  for (const o of orders) {
    if (!o.createdAt || isVoidOrCancelled(o.status)) continue;
    const dateStr = new Date(o.createdAt).toISOString().split("T")[0];
    if (!byDay[dateStr]) byDay[dateStr] = { date: dateStr, revenue: 0, count: 0 };
    byDay[dateStr].revenue += Number(o.total) || 0;
    byDay[dateStr].count++;
  }
  return byDay;
}

export function computeHourlySales(orders: OrderData[]): { hour: number; revenue: number; count: number }[] {
  const hourly: Record<number, { hour: number; revenue: number; count: number }> = {};
  for (let h = 0; h < 24; h++) hourly[h] = { hour: h, revenue: 0, count: 0 };
  for (const o of orders) {
    if (!o.createdAt || isVoidOrCancelled(o.status)) continue;
    const h = new Date(o.createdAt).getHours();
    const rev = Number(o.total) || 0;
    hourly[h].revenue += rev;
    hourly[h].count++;
  }
  return Object.values(hourly).filter(h => h.count > 0);
}

export function computeChannelMix(orders: OrderData[]): { channel: string; revenue: number; count: number }[] {
  const mix: Record<string, { channel: string; revenue: number; count: number }> = {};
  for (const o of orders) {
    if (isVoidOrCancelled(o.status)) continue;
    const ch = o.orderType || "dine_in";
    if (!mix[ch]) mix[ch] = { channel: ch, revenue: 0, count: 0 };
    mix[ch].revenue += Number(o.total) || 0;
    mix[ch].count++;
  }
  return Object.values(mix);
}

export function computeHeatmap(orders: OrderData[]): { day: string; hour: number; value: number }[] {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const heat: Record<string, Record<number, number>> = {};
  days.forEach(d => { heat[d] = {}; for (let h = 0; h < 24; h++) heat[d][h] = 0; });
  for (const o of orders) {
    if (!o.createdAt || isVoidOrCancelled(o.status)) continue;
    const d = new Date(o.createdAt);
    heat[days[d.getDay()]][d.getHours()] += Number(o.total) || 0;
  }
  const result: { day: string; hour: number; value: number }[] = [];
  for (const day of days) {
    for (let h = 0; h < 24; h++) {
      if (heat[day][h] > 0) result.push({ day, hour: h, value: Math.round(heat[day][h]) });
    }
  }
  return result;
}

export function computeTopItems(
  orderItems: OrderItemData[],
  menuItems: { id: string; name: string }[],
  validOrderIds: Set<string>,
  limit = 10,
): { name: string; quantity: number; revenue: number }[] {
  const menuMap = new Map(menuItems.map(m => [m.id, m]));
  const itemSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
  for (const oi of orderItems) {
    if (!oi.orderId || !validOrderIds.has(oi.orderId)) continue;
    const mi = menuMap.get(oi.menuItemId || "");
    const name = mi?.name || oi.name || "Unknown";
    if (!itemSales[name]) itemSales[name] = { name, quantity: 0, revenue: 0 };
    itemSales[name].quantity += oi.quantity || 1;
    itemSales[name].revenue += Number(oi.price || 0) * (oi.quantity || 1);
  }
  return Object.values(itemSales).sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

export function computeFinanceTotals(orders: OrderData[]) {
  let netSales = 0, totalTax = 0, totalDiscount = 0, voidCount = 0, voidAmount = 0;
  const dailyFinance: Record<string, { date: string; netSales: number; tax: number; discount: number; gross: number }> = {};

  for (const o of orders) {
    if (!o.createdAt) continue;
    const dateStr = new Date(o.createdAt).toISOString().split("T")[0];
    if (!dailyFinance[dateStr]) dailyFinance[dateStr] = { date: dateStr, netSales: 0, tax: 0, discount: 0, gross: 0 };
    if (isVoidOrCancelled(o.status)) {
      voidCount++;
      voidAmount += Number(o.total) || 0;
      continue;
    }
    const sub = Number(o.subtotal) || 0;
    const tax = Number(o.tax) || 0;
    const disc = Number(o.discount) || 0;
    const total = Number(o.total) || 0;
    netSales += sub;
    totalTax += tax;
    totalDiscount += disc;
    dailyFinance[dateStr].netSales += sub;
    dailyFinance[dateStr].tax += tax;
    dailyFinance[dateStr].discount += disc;
    dailyFinance[dateStr].gross += total;
  }

  return { netSales, totalTax, totalDiscount, voidCount, voidAmount, dailyFinance };
}

export function computeWeeklyForecast(orders: OrderData[], weeks = 8, outletId?: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  let historical = orders.filter(o => {
    if (!o.createdAt) return false;
    const d = new Date(o.createdAt);
    return d >= cutoff && d <= now && !isVoidOrCancelled(o.status);
  });
  if (outletId) historical = historical.filter(o => o.outletId === outletId);

  const dayBuckets: Record<number, { revenue: number[]; orders: number[] }> = {};
  for (let d = 0; d < 7; d++) dayBuckets[d] = { revenue: [], orders: [] };
  const weeklyData: Record<string, Record<number, { revenue: number; count: number }>> = {};

  for (const o of historical) {
    const d = new Date(o.createdAt!);
    const weekKey = `${d.getFullYear()}-W${Math.ceil((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`;
    const dow = d.getDay();
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = {};
      for (let i = 0; i < 7; i++) weeklyData[weekKey][i] = { revenue: 0, count: 0 };
    }
    weeklyData[weekKey][dow].revenue += Number(o.total) || 0;
    weeklyData[weekKey][dow].count++;
  }

  for (const wk of Object.values(weeklyData)) {
    for (let d = 0; d < 7; d++) {
      dayBuckets[d].revenue.push(wk[d].revenue);
      dayBuckets[d].orders.push(wk[d].count);
    }
  }

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const forecast = days.map((name, i) => {
    const revArr = dayBuckets[i].revenue;
    const ordArr = dayBuckets[i].orders;
    const avgRev = revArr.length > 0 ? revArr.reduce((s, v) => s + v, 0) / revArr.length : 0;
    const avgOrd = ordArr.length > 0 ? ordArr.reduce((s, v) => s + v, 0) / ordArr.length : 0;
    return { day: name, forecastRevenue: Math.round(avgRev * 100) / 100, forecastOrders: Math.round(avgOrd), weeksOfData: revArr.length };
  });

  return {
    forecast,
    totalForecastRevenue: Math.round(forecast.reduce((s, f) => s + f.forecastRevenue, 0) * 100) / 100,
    totalForecastOrders: forecast.reduce((s, f) => s + f.forecastOrders, 0),
    weeksAnalyzed: Object.keys(weeklyData).length,
  };
}
