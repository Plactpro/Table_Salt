import { pool } from "../db";

export interface PackingChargeResult {
  applicable: boolean;
  chargeAmount: number;
  taxAmount: number;
  totalAmount: number;
  chargeType: string;
  label: string;
  breakdown: Array<{ item: string; qty: number; rate: number; amount: number; category?: string }>;
  reason?: string;
}

export async function calculatePackingCharge(
  outletId: string,
  tenantId: string,
  orderType: 'takeaway' | 'delivery',
  orderItems: Array<{ id?: string; menuItemId?: string; name: string; quantity: number; price: number; categoryId?: string }>
): Promise<PackingChargeResult> {
  const { rows: [settings] } = await pool.query(
    `SELECT * FROM outlet_packing_settings WHERE outlet_id = $1 AND tenant_id = $2 LIMIT 1`,
    [outletId, tenantId]
  );

  if (!settings) {
    return { applicable: false, chargeAmount: 0, taxAmount: 0, totalAmount: 0, chargeType: 'NONE', label: 'Packing Charge', breakdown: [] };
  }

  const enabled = orderType === 'takeaway' ? settings.takeaway_charge_enabled : settings.delivery_charge_enabled;
  if (!enabled) {
    return { applicable: false, chargeAmount: 0, taxAmount: 0, totalAmount: 0, chargeType: 'NONE', label: settings.charge_label || 'Packing Charge', breakdown: [] };
  }

  const { rows: exemptions } = await pool.query(
    `SELECT * FROM packing_charge_exemptions WHERE outlet_id = $1 AND tenant_id = $2`,
    [outletId, tenantId]
  );

  const exemptItemIds = new Set(exemptions.filter((e: any) => e.exemption_type === 'MENU_ITEM').map((e: any) => e.reference_id));
  const exemptCategoryIds = new Set(exemptions.filter((e: any) => e.exemption_type === 'CATEGORY').map((e: any) => e.reference_id));

  const chargeableItems = orderItems.filter(item =>
    !exemptItemIds.has(item.menuItemId || '') && !exemptCategoryIds.has(item.categoryId || '')
  );

  if (chargeableItems.length === 0) {
    return {
      applicable: false,
      chargeAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
      chargeType: 'NONE',
      label: settings.charge_label || 'Packing Charge',
      breakdown: [],
      reason: 'All items exempt',
    };
  }

  let charge = 0;
  let breakdown: Array<{ item: string; qty: number; rate: number; amount: number; category?: string }> = [];
  const chargeType = settings.charge_type || 'FIXED_PER_ORDER';

  if (chargeType === 'FIXED_PER_ORDER') {
    charge = Number(orderType === 'takeaway' ? settings.takeaway_charge_amount : settings.delivery_charge_amount);

  } else if (chargeType === 'FIXED_PER_ITEM') {
    const ratePerItem = Number(orderType === 'takeaway' ? settings.takeaway_per_item : settings.delivery_per_item);
    for (const item of chargeableItems) {
      const amt = item.quantity * ratePerItem;
      charge += amt;
      breakdown.push({ item: item.name, qty: item.quantity, rate: ratePerItem, amount: amt });
    }

  } else if (chargeType === 'PERCENTAGE') {
    const subtotal = chargeableItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const pct = Number(orderType === 'takeaway' ? settings.takeaway_charge_amount : settings.delivery_charge_amount);
    charge = (subtotal * pct) / 100;

  } else if (chargeType === 'PER_CATEGORY') {
    const { rows: catRates } = await pool.query(
      `SELECT * FROM packing_charge_categories WHERE outlet_id = $1 AND tenant_id = $2`,
      [outletId, tenantId]
    );
    for (const item of chargeableItems) {
      const catRate = catRates.find((r: any) =>
        Array.isArray(r.applies_to_categories) && r.applies_to_categories.includes(item.categoryId)
      );
      const rate = catRate ? Number(orderType === 'takeaway' ? catRate.takeaway_charge : catRate.delivery_charge) : 0;
      const amt = item.quantity * rate;
      charge += amt;
      if (rate > 0) {
        breakdown.push({ item: item.name, category: catRate?.category_name, qty: item.quantity, rate, amount: amt });
      }
    }
  }

  if (settings.max_charge_per_order != null && charge > Number(settings.max_charge_per_order)) {
    charge = Number(settings.max_charge_per_order);
  }

  const taxAmount = settings.packing_charge_taxable
    ? (charge * Number(settings.packing_charge_tax_pct)) / 100
    : 0;

  return {
    applicable: true,
    chargeAmount: Math.round(charge * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    totalAmount: Math.round((charge + taxAmount) * 100) / 100,
    chargeType,
    label: settings.charge_label || 'Packing Charge',
    breakdown,
  };
}
