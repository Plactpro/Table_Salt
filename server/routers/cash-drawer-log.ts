import type { Express } from "express";
import { requireAuth, requireRole } from "../auth";
import { pool } from "../db";
import { openCashDrawerViaPrinter } from "../services/escpos-builder";

/**
 * Shared internal helper — records a cash drawer event and optionally fires
 * the ESC/POS pulse to the hardware drawer.  Callable from any route without
 * going through the HTTP layer.
 */
export async function logCashDrawerEvent(opts: {
  tenantId: string;
  cashierId: string;
  cashierName: string;
  eventType: "SALE" | "VOID" | "REFUND" | "MANUAL" | "OTHER";
  billId?: string | null;
  orderId?: string | null;
  amount?: number | null;
  runningBalance?: number | null;
  sessionId?: string | null;
}): Promise<void> {
  const {
    tenantId, cashierId, cashierName, eventType,
    billId = null, orderId = null, amount = null, runningBalance = null,
  } = opts;

  let sessionId = opts.sessionId ?? null;
  if (!sessionId) {
    const { rows } = await pool.query(
      `SELECT id FROM cash_sessions WHERE tenant_id = $1 AND cashier_id = $2 AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
      [tenantId, cashierId]
    );
    sessionId = rows[0]?.id ?? null;
  }
  if (!sessionId) return;

  const { rows } = await pool.query(
    `INSERT INTO cash_drawer_events
       (tenant_id, outlet_id, session_id, event_type, bill_id, order_id, amount, running_balance, performed_by, performed_by_name, is_manual)
     SELECT $1, cs.outlet_id, $2, $3, $4, $5, $6, $7, $8, $9, $10
     FROM cash_sessions cs WHERE cs.id = $2 AND cs.tenant_id = $1
     RETURNING *, (SELECT outlet_id FROM cash_sessions WHERE id = $2) AS outlet_id`,
    [tenantId, sessionId, eventType, billId, orderId, amount, runningBalance,
     cashierId, cashierName, eventType === "MANUAL"]
  );

  const outletId: string | null = rows[0]?.outlet_id ?? null;
  if (outletId) {
    pool.query(
      `SELECT ip_address, port FROM printers
       WHERE tenant_id = $1 AND outlet_id = $2
         AND is_active = true AND connection_type = 'NETWORK_IP' AND ip_address IS NOT NULL
       ORDER BY is_default DESC LIMIT 1`,
      [tenantId, outletId]
    ).then(({ rows: printers }) => {
      if (printers[0]?.ip_address) {
        openCashDrawerViaPrinter(printers[0].ip_address as string, (printers[0].port as number) ?? 9100).catch(() => {});
      }
    }).catch(() => {});
  }
}

export function registerCashDrawerLogRoutes(app: Express): void {

  app.get("/api/outlets/:id/idle-timeout", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT idle_timeout_minutes FROM outlets WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Outlet not found" });
      res.json({ idleTimeoutMinutes: rows[0].idle_timeout_minutes ?? 30 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message });
    }
  });

  app.put("/api/outlets/:id/idle-timeout", requireRole("owner", "franchise_owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { idleTimeoutMinutes } = req.body;
      const validOptions = [0, 10, 15, 30, 45, 60];
      if (!validOptions.includes(Number(idleTimeoutMinutes))) {
        return res.status(400).json({ message: `idleTimeoutMinutes must be one of: ${validOptions.join(", ")} (0 = Never)` });
      }
      const { rows } = await pool.query(
        `UPDATE outlets SET idle_timeout_minutes = $1 WHERE id = $2 AND tenant_id = $3 RETURNING idle_timeout_minutes`,
        [Number(idleTimeoutMinutes), req.params.id, user.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Outlet not found" });
      res.json({ idleTimeoutMinutes: rows[0].idle_timeout_minutes });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message });
    }
  });
  app.get("/api/cash-drawer/log", requireRole("owner", "franchise_owner", "hq_admin", "manager", "outlet_manager", "accountant"), async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string || "50"), 200);
      const offset = Math.max(parseInt(req.query.offset as string || "0"), 0);
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      let query = `
        SELECT
          cde.id,
          cde.tenant_id,
          cde.outlet_id,
          cde.session_id,
          cde.event_type,
          cde.order_id,
          cde.bill_id,
          cde.reference_number,
          cde.amount,
          cde.running_balance,
          cde.performed_by,
          cde.performed_by_name,
          cde.reason,
          cde.is_manual,
          cde.created_at,
          o.name AS outlet_name
        FROM cash_drawer_events cde
        LEFT JOIN outlets o ON o.id = cde.outlet_id
        WHERE cde.tenant_id = $1
      `;
      const params: unknown[] = [user.tenantId];
      let idx = 2;

      if (outletId) {
        query += ` AND cde.outlet_id = $${idx++}`;
        params.push(outletId);
      }
      if (from) {
        query += ` AND cde.created_at >= $${idx++}`;
        params.push(from);
      }
      if (to) {
        query += ` AND cde.created_at <= $${idx++}`;
        params.push(to);
      }

      const countQuery = query.replace(
        /SELECT[\s\S]*?FROM/,
        "SELECT COUNT(*) AS total FROM"
      );
      const [{ rows: countRows }, { rows }] = await Promise.all([
        pool.query(countQuery, params),
        pool.query(
          query + ` ORDER BY cde.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
          [...params, limit, offset]
        ),
      ]);

      res.json({
        total: parseInt(countRows[0]?.total || "0"),
        events: rows,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message });
    }
  });

  app.post("/api/cash-drawer/open", requireRole("owner", "manager", "outlet_manager", "cashier", "waiter"), async (req, res) => {
    try {
      const user = req.user as any;
      const { sessionId, reason, billId, orderId, amount } = req.body;

      const validReasons = ["SALE", "MANUAL", "VOID", "REFUND", "OTHER"];
      const eventReason: "SALE" | "MANUAL" | "VOID" | "REFUND" | "OTHER" = validReasons.includes(reason) ? reason : "MANUAL";

      let sessionIdToUse = sessionId;
      if (!sessionIdToUse) {
        const { rows: sessionRows } = await pool.query(
          `SELECT id FROM cash_sessions WHERE tenant_id = $1 AND cashier_id = $2 AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
          [user.tenantId, user.id]
        );
        sessionIdToUse = sessionRows[0]?.id ?? null;
      }

      if (!sessionIdToUse) {
        return res.status(400).json({ message: "No active cash session found" });
      }

      const { rows } = await pool.query(
        `INSERT INTO cash_drawer_events
          (tenant_id, outlet_id, session_id, event_type, bill_id, order_id, amount, performed_by, performed_by_name, reason, is_manual)
         SELECT $1, cs.outlet_id, $2, $3, $4, $5, $6, $7, $8, $9, $10
         FROM cash_sessions cs WHERE cs.id = $2 AND cs.tenant_id = $1
         RETURNING *`,
        [
          user.tenantId,
          sessionIdToUse,
          eventReason,
          billId ?? null,
          orderId ?? null,
          amount ?? null,
          user.id,
          user.name || user.username,
          eventReason,
          eventReason === "MANUAL",
        ]
      );

      if (rows.length === 0) {
        return res.status(400).json({ message: "Cash session not found or does not belong to this tenant" });
      }

      if (eventReason === "MANUAL") {
        // Record when the manual-open event was created
        const manualOpenTime = (rows[0]?.created_at as Date | null | undefined) ?? new Date();
        setTimeout(async () => {
          try {
            // Check for any transactional event (SALE, VOID, REFUND) in the 60s window
            // BEFORE the manual open — if none found, this is an unassociated manual open
            const windowStart = new Date(manualOpenTime.getTime() - 60000).toISOString();
            const { rows: recent } = await pool.query(
              `SELECT id FROM cash_drawer_events
               WHERE tenant_id = $1 AND session_id = $2
                 AND event_type IN ('SALE', 'VOID', 'REFUND')
                 AND created_at >= $3
                 AND created_at <= $4`,
              [user.tenantId, sessionIdToUse, windowStart, manualOpenTime.toISOString()]
            );
            if (recent.length === 0) {
              await pool.query(
                `INSERT INTO system_events (event_type, name, message, created_at)
                 VALUES ('SECURITY', 'MANUAL_DRAWER_OPEN', $1, now())`,
                [`Tenant ${user.tenantId}: cash drawer opened manually by ${user.name || user.username} with no associated transaction in the 60s prior`]
              );
            }
          } catch {}
        }, 5000);
      }

      const event = rows[0];

      // Attempt to physically open the cash drawer via ESC/POS over the network receipt printer
      if (event?.outlet_id) {
        pool.query(
          `SELECT ip_address, port FROM printers
           WHERE tenant_id = $1 AND outlet_id = $2
             AND is_active = true AND connection_type = 'NETWORK_IP'
             AND ip_address IS NOT NULL
           ORDER BY is_default DESC, created_at ASC LIMIT 1`,
          [user.tenantId, event.outlet_id]
        ).then(({ rows: printerRows }) => {
          if (printerRows.length > 0 && printerRows[0].ip_address) {
            openCashDrawerViaPrinter(printerRows[0].ip_address as string, (printerRows[0].port as number) ?? 9100).catch(() => {});
          }
        }).catch(() => {});
      }

      res.json({ success: true, event });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ message });
    }
  });
}
