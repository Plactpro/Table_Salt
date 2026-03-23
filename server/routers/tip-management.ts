import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import { pool } from "../db";
import { getTipConfig } from "../services/tip-service";

function rowToCamel(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = row[key];
  }
  return result;
}

function rowsToCamel(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map(rowToCamel);
}

export function registerTipManagementRoutes(app: Express) {
  // GET tip settings for an outlet (owner/manager)
  app.get("/api/tips/settings/:outletId", requireAuth, requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const { rows } = await pool.query(
        `SELECT * FROM outlet_tip_settings WHERE outlet_id = $1 AND tenant_id = $2 LIMIT 1`,
        [outletId, user.tenantId]
      );
      if (!rows[0]) {
        return res.json({
          outletId,
          tipsEnabled: false,
          showOnPos: true,
          showOnQr: false,
          showOnReceipt: true,
          promptStyle: "BUTTONS",
          suggestedPct1: 5,
          suggestedPct2: 10,
          suggestedPct3: 15,
          allowCustomAmount: true,
          tipBasis: "SUBTOTAL",
          distributionMethod: "INDIVIDUAL",
          waiterSharePct: 70,
          kitchenSharePct: 30,
          tipIsTaxable: false,
          currencyCode: "INR",
          currencySymbol: "₹",
        });
      }
      res.json(rowToCamel(rows[0]));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST upsert tip settings (owner only)
  app.post("/api/tips/settings/:outletId", requireAuth, requireRole("owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { outletId } = req.params;
      const {
        tipsEnabled, showOnPos, showOnQr, showOnReceipt, promptStyle,
        suggestedPct1, suggestedPct2, suggestedPct3, allowCustomAmount,
        tipBasis, distributionMethod, waiterSharePct, kitchenSharePct,
        tipIsTaxable, currencyCode, currencySymbol,
      } = req.body;

      if (distributionMethod === "SPLIT") {
        const wPct = Number(waiterSharePct ?? 70);
        const kPct = Number(kitchenSharePct ?? 30);
        if (Math.abs(wPct + kPct - 100) > 0.01) {
          return res.status(400).json({ message: "waiterSharePct + kitchenSharePct must equal 100 for SPLIT method" });
        }
      }

      const { rows } = await pool.query(`
        INSERT INTO outlet_tip_settings (
          tenant_id, outlet_id, tips_enabled, show_on_pos, show_on_qr, show_on_receipt,
          prompt_style, suggested_pct_1, suggested_pct_2, suggested_pct_3, allow_custom_amount,
          tip_basis, distribution_method, waiter_share_pct, kitchen_share_pct,
          tip_is_taxable, currency_code, currency_symbol, updated_by, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
        ON CONFLICT (tenant_id, outlet_id) DO UPDATE SET
          tips_enabled = EXCLUDED.tips_enabled,
          show_on_pos = EXCLUDED.show_on_pos,
          show_on_qr = EXCLUDED.show_on_qr,
          show_on_receipt = EXCLUDED.show_on_receipt,
          prompt_style = EXCLUDED.prompt_style,
          suggested_pct_1 = EXCLUDED.suggested_pct_1,
          suggested_pct_2 = EXCLUDED.suggested_pct_2,
          suggested_pct_3 = EXCLUDED.suggested_pct_3,
          allow_custom_amount = EXCLUDED.allow_custom_amount,
          tip_basis = EXCLUDED.tip_basis,
          distribution_method = EXCLUDED.distribution_method,
          waiter_share_pct = EXCLUDED.waiter_share_pct,
          kitchen_share_pct = EXCLUDED.kitchen_share_pct,
          tip_is_taxable = EXCLUDED.tip_is_taxable,
          currency_code = EXCLUDED.currency_code,
          currency_symbol = EXCLUDED.currency_symbol,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING *
      `, [
        user.tenantId, outletId,
        tipsEnabled ?? false, showOnPos ?? true, showOnQr ?? false, showOnReceipt ?? true,
        promptStyle || "BUTTONS",
        suggestedPct1 ?? 5, suggestedPct2 ?? 10, suggestedPct3 ?? 15,
        allowCustomAmount ?? true,
        tipBasis || "SUBTOTAL",
        distributionMethod || "INDIVIDUAL",
        waiterSharePct ?? 70, kitchenSharePct ?? 30,
        tipIsTaxable ?? false,
        currencyCode || "INR", currencySymbol || "₹",
        user.id,
      ]);

      res.json(rowToCamel(rows[0]));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET public tip config (no auth — used by QR and POS frontend)
  app.get("/api/tips/config/:outletId", async (req, res) => {
    try {
      const { outletId } = req.params;
      const { rows } = await pool.query(
        `SELECT tenant_id FROM outlets WHERE id = $1 LIMIT 1`,
        [outletId]
      );
      if (!rows[0]) return res.json(null);
      const config = await getTipConfig(outletId, rows[0].tenant_id);
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET tip report (manager/owner)
  app.get("/api/tips/report", requireAuth, requireRole("manager", "owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const outletId = req.query.outletId as string | undefined;

      const outletFilter = outletId ? `AND outlet_id = '${outletId}'` : "";

      const summaryRes = await pool.query(`
        SELECT
          COALESCE(SUM(tip_amount), 0) AS total_tips,
          COUNT(*) AS total_transactions,
          COALESCE(AVG(tip_amount), 0) AS avg_tip_per_bill
        FROM bill_tips
        WHERE tenant_id = $1
          AND DATE(created_at) = $2
          ${outletFilter}
      `, [user.tenantId, date]);

      const byMethodRes = await pool.query(`
        SELECT payment_method, SUM(tip_amount) AS total
        FROM bill_tips
        WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
        GROUP BY payment_method
      `, [user.tenantId, date]);

      const byWaiterRes = await pool.query(`
        SELECT waiter_id, waiter_name, SUM(tip_amount) AS total_tips, COUNT(*) AS count
        FROM bill_tips
        WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
        GROUP BY waiter_id, waiter_name
        ORDER BY total_tips DESC
      `, [user.tenantId, date]);

      const byHourRes = await pool.query(`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, SUM(tip_amount) AS tips
        FROM bill_tips
        WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
        GROUP BY hour
        ORDER BY hour
      `, [user.tenantId, date]);

      const recentRes = await pool.query(`
        SELECT bill_id, tip_amount AS amount, waiter_name, created_at AS time
        FROM bill_tips
        WHERE tenant_id = $1 AND DATE(created_at) = $2 ${outletFilter}
        ORDER BY created_at DESC
        LIMIT 20
      `, [user.tenantId, date]);

      const s = summaryRes.rows[0];
      const byMethod: Record<string, number> = {};
      for (const r of byMethodRes.rows) {
        byMethod[r.payment_method || "CASH"] = Number(r.total);
      }

      res.json({
        totalTips: Number(s.total_tips),
        totalTransactions: Number(s.total_transactions),
        avgTipPerBill: Number(s.avg_tip_per_bill),
        byMethod,
        byWaiter: byWaiterRes.rows.map(r => ({
          waiterId: r.waiter_id,
          waiterName: r.waiter_name,
          totalTips: Number(r.total_tips),
          count: Number(r.count),
        })),
        byHour: byHourRes.rows.map(r => ({ hour: r.hour, tips: Number(r.tips) })),
        recentTips: recentRes.rows.map(r => ({
          billId: r.bill_id,
          amount: Number(r.amount),
          waiterName: r.waiter_name,
          time: r.time,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET my tips (waiter/cashier)
  app.get("/api/tips/my-tips", requireAuth, requireRole("waiter", "cashier"), async (req, res) => {
    try {
      const user = req.user as any;

      const todayRes = await pool.query(`
        SELECT COALESCE(SUM(share_amount), 0) AS total, COUNT(*) AS count
        FROM tip_distributions
        WHERE tenant_id = $1 AND staff_id = $2 AND distribution_date = CURRENT_DATE
      `, [user.tenantId, user.id]);

      const weekRes = await pool.query(`
        SELECT COALESCE(SUM(share_amount), 0) AS total
        FROM tip_distributions
        WHERE tenant_id = $1 AND staff_id = $2 AND distribution_date >= CURRENT_DATE - INTERVAL '7 days'
      `, [user.tenantId, user.id]);

      const monthRes = await pool.query(`
        SELECT COALESCE(SUM(share_amount), 0) AS total
        FROM tip_distributions
        WHERE tenant_id = $1 AND staff_id = $2
          AND distribution_date >= DATE_TRUNC('month', CURRENT_DATE)
      `, [user.tenantId, user.id]);

      const recentRes = await pool.query(`
        SELECT td.share_amount AS amount, bt.bill_id AS bill_ref,
               td.created_at AS time, td.is_paid
        FROM tip_distributions td
        JOIN bill_tips bt ON bt.id = td.bill_tip_id
        WHERE td.tenant_id = $1 AND td.staff_id = $2
        ORDER BY td.created_at DESC
        LIMIT 20
      `, [user.tenantId, user.id]);

      res.json({
        todayTotal: Number(todayRes.rows[0].total),
        todayCount: Number(todayRes.rows[0].count),
        weekTotal: Number(weekRes.rows[0].total),
        monthTotal: Number(monthRes.rows[0].total),
        recentTips: recentRes.rows.map(r => ({
          amount: Number(r.amount),
          billRef: r.bill_ref,
          time: r.time,
          isPaid: r.is_paid,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET distributions list (manager/owner)
  app.get("/api/tips/distributions", requireAuth, requireRole("manager", "owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { staffId, date, isPaid } = req.query as Record<string, string>;

      const conditions: string[] = [`td.tenant_id = $1`];
      const values: any[] = [user.tenantId];
      let i = 2;

      if (staffId) { conditions.push(`td.staff_id = $${i++}`); values.push(staffId); }
      if (date) { conditions.push(`td.distribution_date = $${i++}`); values.push(date); }
      if (isPaid !== undefined) { conditions.push(`td.is_paid = $${i++}`); values.push(isPaid === "true"); }

      const { rows } = await pool.query(`
        SELECT td.*, bt.bill_id, bt.tip_amount AS total_tip_amount
        FROM tip_distributions td
        JOIN bill_tips bt ON bt.id = td.bill_tip_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY td.created_at DESC
        LIMIT 200
      `, values);

      res.json(rowsToCamel(rows));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // PATCH mark distribution paid (manager/owner)
  app.patch("/api/tips/distributions/:id/pay", requireAuth, requireRole("manager", "owner"), async (req, res) => {
    try {
      const user = req.user as any;
      const { id } = req.params;
      const { rows } = await pool.query(`
        UPDATE tip_distributions
        SET is_paid = true, paid_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *
      `, [id, user.tenantId]);
      if (!rows[0]) return res.status(404).json({ message: "Distribution not found" });
      res.json(rowToCamel(rows[0]));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
