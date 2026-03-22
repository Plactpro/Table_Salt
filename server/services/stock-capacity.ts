import { pool } from "../db";

export type IngredientCapacity = {
  inventoryItemId: string;
  name: string;
  unit: string;
  currentStock: number;
  requiredPerPortion: number;
  maxPortions: number;
  availabilityPct: number;
  costPrice: number;
};

export type MenuItemCapacity = {
  menuItemId: string;
  menuItemName: string;
  category: string;
  recipeId: string | null;
  plannedQuantity: number;
  maxPossiblePortions: number;
  bottleneckIngredient: string | null;
  bottleneckStock: number | null;
  bottleneckRequired: number | null;
  status: "SUFFICIENT" | "LIMITED" | "CRITICAL" | "UNAVAILABLE" | "NO_RECIPE";
  ingredientBreakdown: IngredientCapacity[];
  recommendedAction: string;
  shortfallCost: number;
};

export type ReportSummary = {
  tenantId: string;
  outletId: string | null;
  targetDate: string;
  items: MenuItemCapacity[];
  totalItemsChecked: number;
  itemsSufficient: number;
  itemsLimited: number;
  itemsCritical: number;
  itemsUnavailable: number;
  overallStatus: "GREEN" | "YELLOW" | "RED";
  totalShortfallValue: number;
};

function classifyStatus(maxPortions: number, planned: number): MenuItemCapacity["status"] {
  if (maxPortions === 0) return "UNAVAILABLE";
  const pct = maxPortions / planned;
  if (pct >= 1) return "SUFFICIENT";
  if (pct >= 0.5) return "LIMITED";
  return "CRITICAL";
}

function recommendedAction(status: MenuItemCapacity["status"]): string {
  switch (status) {
    case "SUFFICIENT": return "OK";
    case "LIMITED": return "MONITOR";
    case "CRITICAL": return "REORDER_URGENT";
    case "UNAVAILABLE": return "PULL_FROM_MENU";
    case "NO_RECIPE": return "ADD_RECIPE";
    default: return "OK";
  }
}

export async function calculateMenuCapacity(
  tenantId: string,
  outletId: string | null,
  targetDate: string,
  generatedBy: string = "SYSTEM"
): Promise<ReportSummary> {
  const dateLabel = targetDate;

  const { rows: plannedRows } = await pool.query(
    `SELECT menu_item_id, planned_qty, is_disabled, max_limit
     FROM daily_planned_quantities
     WHERE tenant_id = $1 AND planned_date = $2 ${outletId ? "AND outlet_id = $3" : ""}`,
    outletId ? [tenantId, dateLabel, outletId] : [tenantId, dateLabel]
  );
  const plannedMap = new Map<string, { qty: number; isDisabled: boolean; maxLimit: number | null }>();
  for (const r of plannedRows) {
    plannedMap.set(r.menu_item_id, { qty: r.planned_qty, isDisabled: r.is_disabled, maxLimit: r.max_limit });
  }

  const { rows: menuItems } = await pool.query(
    `SELECT mi.id, mi.name, mc.name AS category
     FROM menu_items mi
     LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE mi.tenant_id = $1 AND mi.available = true
     ORDER BY mc.name, mi.name`,
    [tenantId]
  );

  const { rows: recipes } = await pool.query(
    `SELECT r.id, r.menu_item_id
     FROM recipes r
     WHERE r.tenant_id = $1 AND r.active = true`,
    [tenantId]
  );
  const recipeByMenuItem = new Map<string, string>();
  for (const r of recipes) {
    if (!recipeByMenuItem.has(r.menu_item_id)) {
      recipeByMenuItem.set(r.menu_item_id, r.id);
    }
  }

  const recipeIds = [...new Set(recipes.map((r) => r.id))];
  let ingredientMap = new Map<string, { inventoryItemId: string; name: string; unit: string; currentStock: number; requiredPerPortion: number; costPrice: number }[]>();

  if (recipeIds.length > 0) {
    const { rows: ingRows } = await pool.query(
      `SELECT ri.recipe_id, ri.inventory_item_id, ii.name, ii.unit, ii.current_stock, ri.quantity AS req_per_portion, ii.cost_price
       FROM recipe_ingredients ri
       JOIN inventory_items ii ON ii.id = ri.inventory_item_id
       WHERE ri.recipe_id = ANY($1)`,
      [recipeIds]
    );
    for (const row of ingRows) {
      const list = ingredientMap.get(row.recipe_id) || [];
      list.push({
        inventoryItemId: row.inventory_item_id,
        name: row.name,
        unit: row.unit,
        currentStock: parseFloat(row.current_stock) || 0,
        requiredPerPortion: parseFloat(row.req_per_portion) || 0,
        costPrice: parseFloat(row.cost_price) || 0,
      });
      ingredientMap.set(row.recipe_id, list);
    }
  }

  const items: MenuItemCapacity[] = [];

  for (const mi of menuItems) {
    const planned = plannedMap.get(mi.id)?.qty ?? 20;
    const recipeId = recipeByMenuItem.get(mi.id) ?? null;

    if (!recipeId) {
      items.push({
        menuItemId: mi.id,
        menuItemName: mi.name,
        category: mi.category || "Uncategorized",
        recipeId: null,
        plannedQuantity: planned,
        maxPossiblePortions: 0,
        bottleneckIngredient: null,
        bottleneckStock: null,
        bottleneckRequired: null,
        status: "NO_RECIPE",
        ingredientBreakdown: [],
        recommendedAction: "ADD_RECIPE",
        shortfallCost: 0,
      });
      continue;
    }

    const ings = ingredientMap.get(recipeId) || [];

    const breakdown: IngredientCapacity[] = ings.map((ing) => {
      const maxPortions = ing.requiredPerPortion > 0 ? Math.floor(ing.currentStock / ing.requiredPerPortion) : 9999;
      return {
        inventoryItemId: ing.inventoryItemId,
        name: ing.name,
        unit: ing.unit,
        currentStock: ing.currentStock,
        requiredPerPortion: ing.requiredPerPortion,
        maxPortions,
        availabilityPct: planned > 0 ? Math.min(100, Math.round((maxPortions / planned) * 100)) : 100,
        costPrice: ing.costPrice,
      };
    });

    let maxPossible = ings.length === 0 ? 9999 : Math.min(...breakdown.map((b) => b.maxPortions));
    if (ings.length === 0) maxPossible = 0;

    const bottleneck = breakdown.length > 0 ? breakdown.reduce((a, b) => (a.maxPortions < b.maxPortions ? a : b)) : null;
    const status = ings.length === 0 ? "UNAVAILABLE" : classifyStatus(maxPossible, planned);

    let shortfallCost = 0;
    if (maxPossible < planned && bottleneck) {
      const portionsNeeded = planned - maxPossible;
      shortfallCost = portionsNeeded * bottleneck.requiredPerPortion * bottleneck.costPrice;
    }

    items.push({
      menuItemId: mi.id,
      menuItemName: mi.name,
      category: mi.category || "Uncategorized",
      recipeId,
      plannedQuantity: planned,
      maxPossiblePortions: maxPossible === 9999 ? 999 : maxPossible,
      bottleneckIngredient: bottleneck?.name ?? null,
      bottleneckStock: bottleneck?.currentStock ?? null,
      bottleneckRequired: bottleneck ? bottleneck.requiredPerPortion * planned : null,
      status,
      ingredientBreakdown: breakdown,
      recommendedAction: recommendedAction(status),
      shortfallCost: Math.round(shortfallCost * 100) / 100,
    });
  }

  const itemsSufficient = items.filter((i) => i.status === "SUFFICIENT").length;
  const itemsLimited = items.filter((i) => i.status === "LIMITED").length;
  const itemsCritical = items.filter((i) => i.status === "CRITICAL").length;
  const itemsUnavailable = items.filter((i) => i.status === "UNAVAILABLE").length;
  const totalShortfallValue = items.reduce((s, i) => s + i.shortfallCost, 0);

  let overallStatus: "GREEN" | "YELLOW" | "RED" = "GREEN";
  if (itemsCritical > 0 || itemsUnavailable > 2) overallStatus = "RED";
  else if (itemsLimited > 0 || itemsUnavailable > 0) overallStatus = "YELLOW";

  return {
    tenantId,
    outletId,
    targetDate,
    items,
    totalItemsChecked: items.length,
    itemsSufficient,
    itemsLimited,
    itemsCritical,
    itemsUnavailable,
    overallStatus,
    totalShortfallValue: Math.round(totalShortfallValue * 100) / 100,
  };
}

export async function generateAndSaveReport(
  tenantId: string,
  outletId: string | null,
  targetDate: string,
  reportType: "SCHEDULED" | "MANUAL" | "ADHOC" = "MANUAL",
  generatedBy: string = "SYSTEM"
): Promise<string> {
  const summary = await calculateMenuCapacity(tenantId, outletId, targetDate, generatedBy);

  const { rows: rptRows } = await pool.query(
    `INSERT INTO stock_check_reports
     (tenant_id, outlet_id, report_type, target_date, generated_by,
      total_items_checked, items_sufficient, items_limited, items_critical,
      items_unavailable, overall_status, total_shortfall_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      tenantId, outletId, reportType, targetDate, generatedBy,
      summary.totalItemsChecked, summary.itemsSufficient, summary.itemsLimited,
      summary.itemsCritical, summary.itemsUnavailable, summary.overallStatus,
      summary.totalShortfallValue,
    ]
  );
  const reportId = rptRows[0].id;

  for (const item of summary.items) {
    await pool.query(
      `INSERT INTO stock_check_report_items
       (report_id, tenant_id, menu_item_id, menu_item_name, category, recipe_id,
        planned_quantity, max_possible_portions, bottleneck_ingredient, bottleneck_stock,
        bottleneck_required, status, ingredient_breakdown, recommended_action, shortfall_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        reportId, tenantId, item.menuItemId, item.menuItemName, item.category,
        item.recipeId, item.plannedQuantity, item.maxPossiblePortions,
        item.bottleneckIngredient, item.bottleneckStock, item.bottleneckRequired,
        item.status, JSON.stringify(item.ingredientBreakdown),
        item.recommendedAction, item.shortfallCost,
      ]
    );
  }

  return reportId;
}
