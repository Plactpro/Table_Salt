import { pool } from "../db";

export interface TipConfig {
  enabled: boolean;
  showOnPos: boolean;
  showOnQr: boolean;
  showOnReceipt: boolean;
  promptStyle: 'BUTTONS' | 'SLIDER' | 'INPUT' | 'NONE';
  suggestedPercentages: number[];
  allowCustom: boolean;
  tipBasis: 'SUBTOTAL' | 'TOTAL';
  distributionMethod: 'INDIVIDUAL' | 'POOL' | 'SPLIT';
  waiterSharePct: number;
  kitchenSharePct: number;
  currencySymbol: string;
}

export async function getTipConfig(outletId: string, tenantId: string): Promise<TipConfig | null> {
  const { rows } = await pool.query(
    `SELECT * FROM outlet_tip_settings WHERE outlet_id = $1 AND tenant_id = $2 LIMIT 1`,
    [outletId, tenantId]
  );
  if (!rows[0] || !rows[0].tips_enabled) return null;
  const s = rows[0];
  return {
    enabled: true,
    showOnPos: s.show_on_pos,
    showOnQr: s.show_on_qr,
    showOnReceipt: s.show_on_receipt,
    promptStyle: s.prompt_style,
    suggestedPercentages: [s.suggested_pct_1, s.suggested_pct_2, s.suggested_pct_3].filter(Boolean),
    allowCustom: s.allow_custom_amount,
    tipBasis: s.tip_basis,
    distributionMethod: s.distribution_method,
    waiterSharePct: s.waiter_share_pct,
    kitchenSharePct: s.kitchen_share_pct,
    currencySymbol: s.currency_symbol,
  };
}

export async function recordAndDistributeTip(params: {
  billId: string;
  orderId: string;
  tenantId: string;
  outletId: string;
  tipAmount: number;
  tipType: 'PERCENTAGE' | 'CUSTOM';
  tipPercentage: number | null;
  tipBasisAmount: number | null;
  waiterId: string;
  waiterName: string;
  paymentMethod: string;
  settings: any;
}): Promise<void> {
  const tipRes = await pool.query(`
    INSERT INTO bill_tips (tenant_id, outlet_id, bill_id, order_id, tip_amount, tip_type,
      tip_percentage, tip_basis_amount, payment_method, waiter_id, waiter_name, distribution_method)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (bill_id) DO NOTHING
    RETURNING *
  `, [
    params.tenantId, params.outletId, params.billId, params.orderId,
    params.tipAmount, params.tipType, params.tipPercentage, params.tipBasisAmount,
    params.paymentMethod, params.waiterId, params.waiterName,
    params.settings.distribution_method,
  ]);

  await pool.query(
    `UPDATE bills SET tip_type = $1, tip_waiter_id = $2 WHERE id = $3`,
    [params.tipType, params.waiterId, params.billId]
  );

  const tip = tipRes.rows[0];
  if (!tip) return;

  const method = params.settings.distribution_method;
  const today = new Date().toISOString().split('T')[0];

  if (method === 'INDIVIDUAL') {
    await pool.query(`
      INSERT INTO tip_distributions (tenant_id, outlet_id, bill_tip_id, staff_id, staff_name,
        staff_role, share_percentage, share_amount, distribution_date)
      VALUES ($1,$2,$3,$4,$5,'waiter',100,$6,$7)
    `, [
      params.tenantId, params.outletId, tip.id, params.waiterId,
      params.waiterName, params.tipAmount.toFixed(2), today,
    ]);

  } else if (method === 'POOL') {
    const { rows: staff } = await pool.query(`
      SELECT DISTINCT u.id, u.name, u.role FROM time_entries te
      JOIN users u ON u.id = te.user_id
      WHERE te.tenant_id = $1 AND te.outlet_id = $2
        AND te.clock_in >= CURRENT_DATE AND te.clock_out IS NULL
    `, [params.tenantId, params.outletId]);

    if (!staff.length) {
      await pool.query(`
        INSERT INTO tip_distributions (tenant_id, outlet_id, bill_tip_id, staff_id, staff_name,
          staff_role, share_percentage, share_amount, distribution_date)
        VALUES ($1,$2,$3,$4,$5,'waiter',100,$6,$7)
      `, [
        params.tenantId, params.outletId, tip.id, params.waiterId,
        params.waiterName, params.tipAmount.toFixed(2), today,
      ]);
    } else {
      const share = params.tipAmount / staff.length;
      const pct = 100 / staff.length;
      for (const s of staff) {
        await pool.query(`
          INSERT INTO tip_distributions (tenant_id, outlet_id, bill_tip_id, staff_id, staff_name,
            staff_role, share_percentage, share_amount, distribution_date)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [
          params.tenantId, params.outletId, tip.id, s.id, s.name, s.role,
          pct.toFixed(2), share.toFixed(2), today,
        ]);
      }
    }

  } else if (method === 'SPLIT') {
    const waiterPct = params.settings.waiter_share_pct || 70;
    const kitchenPct = params.settings.kitchen_share_pct || 30;
    const waiterAmt = params.tipAmount * (waiterPct / 100);
    const kitchenAmt = params.tipAmount * (kitchenPct / 100);

    await pool.query(`
      INSERT INTO tip_distributions (tenant_id, outlet_id, bill_tip_id, staff_id, staff_name,
        staff_role, share_percentage, share_amount, distribution_date)
      VALUES ($1,$2,$3,$4,$5,'waiter',$6,$7,$8)
    `, [
      params.tenantId, params.outletId, tip.id, params.waiterId,
      params.waiterName, waiterPct, waiterAmt.toFixed(2), today,
    ]);

    const { rows: chefs } = await pool.query(`
      SELECT DISTINCT u.id, u.name FROM time_entries te
      JOIN users u ON u.id = te.user_id
      WHERE te.tenant_id = $1 AND te.outlet_id = $2
        AND u.role = 'chef' AND te.clock_in >= CURRENT_DATE AND te.clock_out IS NULL
    `, [params.tenantId, params.outletId]);

    if (!chefs.length) {
      await pool.query(
        `UPDATE tip_distributions SET share_amount = $1, share_percentage = 100 WHERE bill_tip_id = $2 AND staff_id = $3`,
        [params.tipAmount.toFixed(2), tip.id, params.waiterId]
      );
    } else {
      const chefShare = kitchenAmt / chefs.length;
      const chefPct = kitchenPct / chefs.length;
      for (const c of chefs) {
        await pool.query(`
          INSERT INTO tip_distributions (tenant_id, outlet_id, bill_tip_id, staff_id, staff_name,
            staff_role, share_percentage, share_amount, distribution_date)
          VALUES ($1,$2,$3,$4,$5,'chef',$6,$7,$8)
        `, [
          params.tenantId, params.outletId, tip.id, c.id, c.name,
          chefPct.toFixed(2), chefShare.toFixed(2), today,
        ]);
      }
    }
  }

  await pool.query(
    `UPDATE bill_tips SET is_distributed = true, distributed_at = NOW() WHERE id = $1`,
    [tip.id]
  );
}
