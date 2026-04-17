import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { pool } from "../db";

type AuthUser = {
  id: string;
  tenantId: string;
  name: string;
  role: string;
  outletId?: string;
};

function getUser(req: Request): AuthUser {
  return req.user as AuthUser;
}

const MANAGER_ROLES = ["owner", "franchise_owner", "hq_admin", "manager", "outlet_manager"];

async function ensureTipSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tip_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      outlet_id varchar(36) NOT NULL UNIQUE,
      tenant_id varchar(36) NOT NULL,
      tips_enabled boolean NOT NULL DEFAULT false,
      show_on_pos boolean NOT NULL DEFAULT true,
      show_on_qr boolean NOT NULL DEFAULT true,
      show_on_receipt boolean NOT NULL DEFAULT true,
      prompt_style text NOT NULL DEFAULT 'BUTTONS',
      suggested_pct_1 int NOT NULL DEFAULT 5,
      suggested_pct_2 int NOT NULL DEFAULT 10,
      suggested_pct_3 int NOT NULL DEFAULT 15,
      allow_custom boolean NOT NULL DEFAULT true,
      tip_basis text NOT NULL DEFAULT 'SUBTOTAL',
      distribution_method text NOT NULL DEFAULT 'INDIVIDUAL',
      waiter_share_pct int NOT NULL DEFAULT 70,
      kitchen_share_pct int NOT NULL DEFAULT 30,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tip_distributions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id varchar(36) NOT NULL,
      outlet_id varchar(36),
      order_id varchar(36),
      waiter_id varchar(36),
      waiter_name text,
      amount decimal(10,2) NOT NULL DEFAULT 0,
      bill_number text,
      is_paid boolean NOT NULL DEFAULT false,
      paid_at timestamptz,
      created_at timestamptz DEFAULT now()
    )
  `);
}

ensureTipSettingsTable().catch(err => console.error("[Tips] Table setup error:", err));

function buildTipSettings(row: any) {
  return {
    tipsEnabled: row.tips_enabled,
    showOnPos: row.show_on_pos,
    showOnQr: row.show_on_qr,
    showOnReceipt: row.show_on_receipt,
    promptStyle: row.prompt_style as "BUTTONS" | "INPUT" | "NONE",
    suggestedPct1: row.suggested_pct_1,
    suggestedPct2: row.suggested_pct_2,
    suggestedPct3: row.suggested_pct_3,
    suggestedPercentages: [row.suggested_pct_1, row.suggested_pct_2, row.suggested_pct_3].filter(Boolean),
    allowCustom: row.allow_custom,
    tipBasis: row.tip_basis as "SUBTOTAL" | "TOTAL",
    distributionMethod: row.distribution_method as "INDIVIDUAL" | "POOL" | "SPLIT",
    waiterSharePct: row.waiter_share_pct,
    kitchenSharePct: row.kitchen_share_pct,
  };
}

const DEFAULT_SETTINGS = {
  tipsEnabled: false,
  showOnPos: true,
  showOnQr: true,
  showOnReceipt: true,
  promptStyle: "BUTTONS",
  suggestedPct1: 5,
  suggestedPct2: 10,
  suggestedPct3: 15,
  suggestedPercentages: [5, 10, 15],
  allowCustom: true,
  tipBasis: "SUBTOTAL",
  distributionMethod: "INDIVIDUAL",
  waiterSharePct: 70,
  kitchenSharePct: 30,
};

export function registerTipsRoutes(app: Express) {
  app.get("/api/tips/settings/:outletId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!MANAGER_ROLES.includes(user.role)) return res.status(403).json({ message: "Forbidden" });

      const { outletId } = req.params;
      const result = await pool.query(
        "SELECT * FROM tip_settings WHERE outlet_id = $1 AND tenant_id = $2",
        [outletId, user.tenantId]
      );

      if (result.rows.length === 0) return res.json(DEFAULT_SETTINGS);
      return res.json(buildTipSettings(result.rows[0]));
    } catch (err) {
      console.error("[Tips] GET settings error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/tips/settings/:outletId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!MANAGER_ROLES.includes(user.role)) return res.status(403).json({ message: "Forbidden" });

      const { outletId } = req.params;
      const {
        tipsEnabled, showOnPos, showOnQr, showOnReceipt, promptStyle,
        suggestedPct1, suggestedPct2, suggestedPct3,
        allowCustom, tipBasis, distributionMethod, waiterSharePct, kitchenSharePct,
      } = req.body;

      await pool.query(`
        INSERT INTO tip_settings (
          outlet_id, tenant_id,
          tips_enabled, show_on_pos, show_on_qr, show_on_receipt,
          prompt_style, suggested_pct_1, suggested_pct_2, suggested_pct_3,
          allow_custom, tip_basis, distribution_method, waiter_share_pct, kitchen_share_pct,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
        ON CONFLICT (outlet_id) DO UPDATE SET
          tips_enabled = EXCLUDED.tips_enabled,
          show_on_pos = EXCLUDED.show_on_pos,
          show_on_qr = EXCLUDED.show_on_qr,
          show_on_receipt = EXCLUDED.show_on_receipt,
          prompt_style = EXCLUDED.prompt_style,
          suggested_pct_1 = EXCLUDED.suggested_pct_1,
          suggested_pct_2 = EXCLUDED.suggested_pct_2,
          suggested_pct_3 = EXCLUDED.suggested_pct_3,
          allow_custom = EXCLUDED.allow_custom,
          tip_basis = EXCLUDED.tip_basis,
          distribution_method = EXCLUDED.distribution_method,
          waiter_share_pct = EXCLUDED.waiter_share_pct,
          kitchen_share_pct = EXCLUDED.kitchen_share_pct,
          updated_at = now()
      `, [
        outletId, user.tenantId,
        tipsEnabled ?? false, showOnPos ?? true, showOnQr ?? true, showOnReceipt ?? true,
        promptStyle ?? "BUTTONS",
        suggestedPct1 ?? 5, suggestedPct2 ?? 10, suggestedPct3 ?? 15,
        allowCustom ?? true, tipBasis ?? "SUBTOTAL",
        distributionMethod ?? "INDIVIDUAL",
        waiterSharePct ?? 70, kitchenSharePct ?? 30,
      ]);

      res.json({ success: true });
    } catch (err) {
      console.error("[Tips] POST settings error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/tips/config/:outletId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { outletId } = req.params;
      const result = await pool.query(
        "SELECT * FROM tip_settings WHERE outlet_id = $1",
        [outletId]
      );

      if (result.rows.length === 0) return res.json(null);
      const s = buildTipSettings(result.rows[0]);
      if (!s.tipsEnabled) return res.json(null);
      return res.json(s);
    } catch (err) {
      console.error("[Tips] GET config error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/guest/session/:sessionId/tip-config", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const sessionRes = await pool.query(
        "SELECT outlet_id FROM table_sessions WHERE id = $1",
        [sessionId]
      );
      if (sessionRes.rows.length === 0) return res.json(null);

      const outletId = sessionRes.rows[0].outlet_id;
      if (!outletId) return res.json(null);

      const settingsRes = await pool.query(
        "SELECT * FROM tip_settings WHERE outlet_id = $1",
        [outletId]
      );
      if (settingsRes.rows.length === 0) return res.json(null);

      const s = buildTipSettings(settingsRes.rows[0]);
      if (!s.tipsEnabled || !s.showOnQr) return res.json(null);

      return res.json({
        tipsEnabled: s.tipsEnabled,
        showOnQr: s.showOnQr,
        promptStyle: s.promptStyle,
        suggestedPercentages: s.suggestedPercentages,
        allowCustom: s.allowCustom,
        tipBasis: s.tipBasis,
      });
    } catch (err) {
      console.error("[Tips] GET guest tip-config error:", err);
      res.json(null);
    }
  });

  app.get("/api/tips/my-tips", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);

      const nowUtc = new Date();
      const todayStart = new Date(nowUtc);
      todayStart.setHours(0, 0, 0, 0);

      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      const monthStart = new Date(nowUtc.getFullYear(), nowUtc.getMonth(), 1);

      const result = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN created_at >= $2 THEN amount ELSE 0 END), 0) AS today,
          COUNT(CASE WHEN created_at >= $2 THEN 1 END) AS today_count,
          COALESCE(SUM(CASE WHEN created_at >= $3 THEN amount ELSE 0 END), 0) AS week,
          COALESCE(SUM(CASE WHEN created_at >= $4 THEN amount ELSE 0 END), 0) AS month
        FROM tip_distributions
        WHERE waiter_id = $1 AND tenant_id = $5
      `, [user.id, todayStart, weekStart, monthStart, user.tenantId]);

      const row = result.rows[0];

      const recentResult = await pool.query(`
        SELECT id, amount, bill_number, created_at, is_paid
        FROM tip_distributions
        WHERE waiter_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT 10
      `, [user.id, user.tenantId]);

      const todayAmount = parseFloat(row.today) || 0;
      if (todayAmount === 0 && recentResult.rows.length === 0) {
        return res.json(null);
      }

      return res.json({
        today: todayAmount,
        todayCount: parseInt(row.today_count) || 0,
        week: parseFloat(row.week) || 0,
        month: parseFloat(row.month) || 0,
        recent: recentResult.rows.map(r => ({
          id: r.id,
          amount: parseFloat(r.amount),
          billNumber: r.bill_number,
          createdAt: r.created_at,
          isPaid: r.is_paid,
        })),
      });
    } catch (err) {
      console.error("[Tips] GET my-tips error:", err);
      res.json(null);
    }
  });

  app.get("/api/tips/report", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!MANAGER_ROLES.includes(user.role)) return res.status(403).json({ message: "Forbidden" });

      const { dateFrom, dateTo, date, outletId } = req.query as Record<string, string>;

      const effectiveDateFrom = dateFrom || date || new Date().toISOString().split("T")[0];
      const effectiveDateTo = dateTo || date || new Date().toISOString().split("T")[0];

      const fromTs = new Date(effectiveDateFrom + "T00:00:00");
      const toTs = new Date(effectiveDateTo + "T23:59:59");

      let baseWhere = "WHERE td.tenant_id = $1 AND td.created_at >= $2 AND td.created_at <= $3";
      const params: any[] = [user.tenantId, fromTs, toTs];

      if (outletId) {
        baseWhere += ` AND td.outlet_id = $${params.length + 1}`;
        params.push(outletId);
      }

      const summaryResult = await pool.query(`
        SELECT
          COALESCE(SUM(amount), 0) AS total_tips,
          COUNT(*) AS tips_count,
          COALESCE(SUM(CASE WHEN is_paid = false THEN amount ELSE 0 END), 0) AS pending_payouts,
          COALESCE(SUM(CASE WHEN is_paid = true THEN amount ELSE 0 END), 0) AS paid_payouts,
          COALESCE(AVG(NULLIF(amount, 0)), 0) AS avg_tip
        FROM tip_distributions td
        ${baseWhere}
      `, params);

      const byWaiterResult = await pool.query(`
        SELECT
          td.waiter_id,
          td.waiter_name,
          COALESCE(SUM(td.amount), 0) AS total_tips,
          COUNT(*) AS tips_count,
          COALESCE(SUM(CASE WHEN td.is_paid = false THEN td.amount ELSE 0 END), 0) AS pending_amount,
          COALESCE(SUM(CASE WHEN td.is_paid = true THEN td.amount ELSE 0 END), 0) AS paid_amount
        FROM tip_distributions td
        ${baseWhere}
        AND td.waiter_id IS NOT NULL
        GROUP BY td.waiter_id, td.waiter_name
        ORDER BY total_tips DESC
      `, params);

      const byHourResult = await pool.query(`
        SELECT
          EXTRACT(HOUR FROM created_at) AS hour,
          COALESCE(SUM(amount), 0) AS total
        FROM tip_distributions td
        ${baseWhere}
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `, params);

      const txResult = await pool.query(`
        SELECT
          td.id, td.amount, td.bill_number, td.waiter_name,
          td.created_at, td.is_paid, td.paid_at
        FROM tip_distributions td
        ${baseWhere}
        ORDER BY td.created_at DESC
        LIMIT 100
      `, params);

      const summary = summaryResult.rows[0];
      const byWaiter = byWaiterResult.rows.map(r => ({
        waiterId: r.waiter_id,
        waiterName: r.waiter_name || "Unknown",
        totalTips: parseFloat(r.total_tips),
        tipsCount: parseInt(r.tips_count),
        pendingAmount: parseFloat(r.pending_amount),
        paidAmount: parseFloat(r.paid_amount),
      }));

      const topWaiter = byWaiter.length > 0 ? { name: byWaiter[0].waiterName, amount: byWaiter[0].totalTips } : undefined;

      return res.json({
        totalTips: parseFloat(summary.total_tips),
        tipsCount: parseInt(summary.tips_count),
        pendingPayouts: parseFloat(summary.pending_payouts),
        paidPayouts: parseFloat(summary.paid_payouts),
        avgTip: parseFloat(summary.avg_tip),
        topWaiter,
        byWaiter,
        byHour: byHourResult.rows.map(r => ({
          hour: parseInt(r.hour),
          total: parseFloat(r.total),
        })),
        transactions: txResult.rows.map(r => ({
          id: r.id,
          amount: parseFloat(r.amount),
          billNumber: r.bill_number,
          waiterName: r.waiter_name,
          createdAt: r.created_at,
          isPaid: r.is_paid,
          paidAt: r.paid_at,
        })),
      });
    } catch (err) {
      console.error("[Tips] GET report error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/tips/distributions", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!MANAGER_ROLES.includes(user.role)) return res.status(403).json({ message: "Forbidden" });

      const { date, isPaid, waiterId } = req.query as Record<string, string>;

      let where = "WHERE tenant_id = $1";
      const params: any[] = [user.tenantId];

      if (date) {
        const fromTs = new Date(date + "T00:00:00");
        const toTs = new Date(date + "T23:59:59");
        where += ` AND created_at >= $${params.length + 1} AND created_at <= $${params.length + 2}`;
        params.push(fromTs, toTs);
      }

      if (isPaid !== undefined) {
        where += ` AND is_paid = $${params.length + 1}`;
        params.push(isPaid === "true");
      }

      if (waiterId) {
        where += ` AND waiter_id = $${params.length + 1}`;
        params.push(waiterId);
      }

      const result = await pool.query(`
        SELECT id, waiter_id, waiter_name, amount, bill_number, is_paid, paid_at, created_at, order_id
        FROM tip_distributions
        ${where}
        ORDER BY created_at DESC
        LIMIT 200
      `, params);

      return res.json(result.rows.map(r => ({
        id: r.id,
        waiterId: r.waiter_id,
        waiterName: r.waiter_name,
        amount: parseFloat(r.amount),
        billNumber: r.bill_number,
        isPaid: r.is_paid,
        paidAt: r.paid_at,
        createdAt: r.created_at,
        orderId: r.order_id,
      })));
    } catch (err) {
      console.error("[Tips] GET distributions error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/tips/distributions/:id/pay", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = getUser(req);
      if (!MANAGER_ROLES.includes(user.role)) return res.status(403).json({ message: "Forbidden" });

      const { id } = req.params;

      await pool.query(
        "UPDATE tip_distributions SET is_paid = true, paid_at = now() WHERE id = $1 AND tenant_id = $2",
        [id, user.tenantId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("[Tips] PATCH distributions pay error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/tips/distributions/pay", requireAuth, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const user = getUser(req);
      if (!MANAGER_ROLES.includes(user.role)) { client.release(); return res.status(403).json({ message: "Forbidden" }); }

      const { waiterId, dateFrom, dateTo } = req.body;

      await client.query("BEGIN");

      let where = "tenant_id = $1 AND is_paid = false";
      const params: any[] = [user.tenantId];

      if (waiterId) {
        where += ` AND waiter_id = $${params.length + 1}`;
        params.push(waiterId);
      }

      if (dateFrom) {
        where += ` AND created_at >= $${params.length + 1}`;
        params.push(new Date(dateFrom + "T00:00:00"));
      }

      if (dateTo) {
        where += ` AND created_at <= $${params.length + 1}`;
        params.push(new Date(dateTo + "T23:59:59"));
      }

      // Lock matching rows to prevent concurrent payout
      const result = await client.query(
        `UPDATE tip_distributions SET is_paid = true, paid_at = now() WHERE ${where} AND is_paid = false RETURNING id`,
        params
      );

      await client.query("COMMIT");
      res.json({ success: true, updated: result.rowCount });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[Tips] POST distributions pay error:", err);
      res.status(500).json({ message: "Internal server error" });
    } finally {
      client.release();
    }
  });
}
