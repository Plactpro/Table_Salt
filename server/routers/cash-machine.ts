import type { Express, Request, Response } from "express";
import { requireAuth, requireRole } from "../auth";
import { storage } from "../storage";
import { pool } from "../db";
import { emitToTenant } from "../realtime";
import { calculateChange, generateQuickTender, buildChangeBreakdown, currencyDenominations } from "../services/cash-calculator";
import { getJurisdictionByCurrency } from "@shared/jurisdictions";

function pad(n: number, w = 4): string {
  return String(n).padStart(w, "0");
}

async function generateSessionNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const { rows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM cash_sessions WHERE tenant_id = $1 AND session_number LIKE $2`,
    [tenantId, `CS-${dateStr}-%`]
  );
  const seq = parseInt(rows[0].cnt || "0") + 1;
  return `CS-${dateStr}-${pad(seq)}`;
}

async function generatePayoutNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const { rows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM cash_payouts WHERE tenant_id = $1 AND payout_number LIKE $2`,
    [tenantId, `PYT-${dateStr}-%`]
  );
  const seq = parseInt(rows[0].cnt || "0") + 1;
  return `PYT-${dateStr}-${pad(seq)}`;
}

function computeRunningBalance(session: any): number {
  return (
    Number(session.opening_float || session.openingFloat || 0) +
    Number(session.total_cash_sales || session.totalCashSales || 0) -
    Number(session.total_cash_refunds || session.totalCashRefunds || 0) -
    Number(session.total_cash_payouts || session.totalCashPayouts || 0)
  );
}

export function registerCashMachineRoutes(app: Express): void {

  // ── Calculate change (no auth required — pure calculation) ─────────────
  app.post("/api/cash-sessions/calculate-change", async (req: Request, res: Response) => {
    try {
      const { amountDue, tendered, currencyCode, roundingRule } = req.body;
      if (amountDue == null || tendered == null) {
        return res.status(400).json({ message: "amountDue and tendered are required" });
      }
      const rule = roundingRule || "NONE";
      const result = calculateChange(Number(amountDue), Number(tendered), rule);
      const config = currencyDenominations[currencyCode as keyof typeof currencyDenominations];
      const symbol = config ? (currencyCode === "INR" ? "₹" : currencyCode) : currencyCode || "";
      const breakdown = config ? buildChangeBreakdown(result.change, config, symbol) : [];
      const quickTender = config ? generateQuickTender(Number(amountDue), config) : [];
      res.json({ ...result, breakdown, quickTender });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Active session ──────────────────────────────────────────────────────
  app.get("/api/cash-sessions/active", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getActiveCashSession(user.tenantId, user.id);
      if (!session) return res.json(null);
      const runningBalance = computeRunningBalance(session);
      res.json({ ...session, runningBalance });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Open session ────────────────────────────────────────────────────────
  app.post("/api/cash-sessions/open", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { openingFloat, openingFloatBreakdown, shiftName } = req.body;

      const existing = await storage.getActiveCashSession(user.tenantId, user.id);
      if (existing) {
        return res.status(400).json({ message: "You already have an active cash session" });
      }

      const activePosSession = await pool.query(
        `SELECT id FROM pos_sessions WHERE tenant_id = $1 AND waiter_id = $2 AND closed_at IS NULL LIMIT 1`,
        [user.tenantId, user.id]
      );
      const posSessionId = activePosSession.rows[0]?.id || null;

      const outletResult = await pool.query(
        `SELECT id, currency_code, currency_symbol FROM outlets WHERE tenant_id = $1 LIMIT 1`,
        [user.tenantId]
      );
      const outlet = outletResult.rows[0];

      const sessionNumber = await generateSessionNumber(user.tenantId);
      const floatNum = Number(openingFloat || 0);

      const session = await storage.createCashSession({
        tenantId: user.tenantId,
        outletId: outlet?.id || null,
        posSessionId,
        sessionNumber,
        cashierId: user.id,
        cashierName: user.name || user.username,
        currencyCode: outlet?.currency_code || "INR",
        currencySymbol: outlet?.currency_symbol || "₹",
        status: "open",
        openingFloat: String(floatNum),
        openingFloatBreakdown: openingFloatBreakdown || null,
        expectedClosingCash: String(floatNum),
        notes: shiftName || null,
      });

      const runningBalance = floatNum;
      await storage.createCashDrawerEvent({
        tenantId: user.tenantId,
        outletId: outlet?.id || null,
        sessionId: session.id,
        eventType: "OPENING",
        amount: String(floatNum),
        runningBalance: String(runningBalance),
        performedBy: user.id,
        performedByName: user.name || user.username,
        reason: `Opening float: ${shiftName || ""}`,
        isManual: false,
      });

      emitToTenant(user.tenantId, "cash_session:opened", { session });
      res.status(201).json({ ...session, runningBalance });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Record payment (called by billing after cash payment) ───────────────
  app.post("/api/cash-sessions/record-payment", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { sessionId, orderId, billId, referenceNumber, amount, tenderedAmount, changeGiven, changeBreakdown } = req.body;
      if (!sessionId || amount == null) {
        return res.status(400).json({ message: "sessionId and amount are required" });
      }

      const session = await storage.getCashSession(sessionId);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }

      await pool.query(
        `UPDATE cash_sessions SET
           total_cash_sales = total_cash_sales + $1,
           total_transactions = total_transactions + 1,
           expected_closing_cash = opening_float + total_cash_sales + $1 - total_cash_refunds - total_cash_payouts
         WHERE id = $2`,
        [Number(amount), sessionId]
      );

      const updatedSession = await storage.getCashSession(sessionId);
      const runningBalance = computeRunningBalance(updatedSession!);

      await storage.createCashDrawerEvent({
        tenantId: user.tenantId,
        outletId: session.outletId,
        sessionId,
        eventType: "SALE",
        orderId: orderId || null,
        billId: billId || null,
        referenceNumber: referenceNumber || null,
        amount: String(amount),
        tenderedAmount: tenderedAmount != null ? String(tenderedAmount) : null,
        changeGiven: changeGiven != null ? String(changeGiven) : null,
        changeBreakdown: changeBreakdown || null,
        runningBalance: String(runningBalance),
        performedBy: user.id,
        performedByName: user.name || user.username,
        isManual: false,
      });

      emitToTenant(user.tenantId, "cash_session:payment", { sessionId, amount, runningBalance });
      res.json({ sessionId, runningBalance });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── List sessions ───────────────────────────────────────────────────────
  app.get("/api/cash-sessions", requireAuth, requireRole("owner", "manager", "outlet_manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { status, date, cashierId } = req.query as Record<string, string>;
      const sessions = await storage.getCashSessions(user.tenantId, { status, date, cashierId });
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Session detail ──────────────────────────────────────────────────────
  app.get("/api/cash-sessions/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }
      const runningBalance = computeRunningBalance(session);
      res.json({ ...session, runningBalance });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Session events ──────────────────────────────────────────────────────
  app.get("/api/cash-sessions/:id/events", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }
      const events = await storage.getCashDrawerEvents(req.params.id);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Session payouts ─────────────────────────────────────────────────────
  app.get("/api/cash-sessions/:id/payouts", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }
      const payouts = await storage.getCashPayouts(req.params.id);
      res.json(payouts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Close session ───────────────────────────────────────────────────────
  app.post("/api/cash-sessions/:id/close", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }
      if (session.status !== "open") {
        return res.status(400).json({ message: "Session is not open" });
      }

      const { physicalCash, closingBreakdown, varianceReason, notes } = req.body;
      const physicalCashAmount = Number(physicalCash ?? 0);

      const expectedClosingCash =
        Number(session.openingFloat || 0) +
        Number(session.totalCashSales || 0) -
        Number(session.totalCashRefunds || 0) -
        Number(session.totalCashPayouts || 0);
      const cashVariance = physicalCashAmount - expectedClosingCash;

      if (Math.abs(cashVariance) > 50 && !varianceReason) {
        return res.status(400).json({
          message: `Variance of ${cashVariance.toFixed(2)} exceeds threshold. Please provide a varianceReason.`,
        });
      }

      const updated = await storage.updateCashSession(req.params.id, {
        status: "closed",
        physicalClosingCash: String(physicalCashAmount),
        closingBreakdown: closingBreakdown || null,
        cashVariance: String(cashVariance.toFixed(2)),
        varianceReason: varianceReason || null,
        expectedClosingCash: String(expectedClosingCash.toFixed(2)),
        closedAt: new Date(),
        notes: notes || session.notes,
      });

      await storage.createCashDrawerEvent({
        tenantId: user.tenantId,
        outletId: session.outletId,
        sessionId: req.params.id,
        eventType: "CLOSING",
        amount: String(physicalCashAmount),
        runningBalance: String(physicalCashAmount),
        performedBy: user.id,
        performedByName: user.name || user.username,
        reason: varianceReason || null,
        isManual: false,
      });

      emitToTenant(user.tenantId, "cash_session:closed", {
        session: updated,
        cashVariance,
        expectedClosingCash,
        physicalCash: physicalCashAmount,
      });

      res.json({ ...updated, cashVariance, expectedClosingCash });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Approve session ─────────────────────────────────────────────────────
  app.post("/api/cash-sessions/:id/approve", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }
      const updated = await storage.updateCashSession(req.params.id, {
        approvedBy: user.id,
        approvedAt: new Date(),
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Manual open event ───────────────────────────────────────────────────
  app.post("/api/cash-sessions/:id/manual-open", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ message: "reason is required" });

      const runningBalance = computeRunningBalance(session);
      const event = await storage.createCashDrawerEvent({
        tenantId: user.tenantId,
        outletId: session.outletId,
        sessionId: req.params.id,
        eventType: "MANUAL_OPEN",
        runningBalance: String(runningBalance),
        performedBy: user.id,
        performedByName: user.name || user.username,
        reason,
        isManual: true,
      });
      res.status(201).json(event);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Float adjust ────────────────────────────────────────────────────────
  app.post("/api/cash-sessions/:id/float-adjust", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }
      const { type, amount, reason } = req.body;
      if (!type || amount == null || !reason) {
        return res.status(400).json({ message: "type, amount and reason are required" });
      }

      const eventType = type === "add" ? "FLOAT_ADD" : "FLOAT_REMOVE";
      const sign = type === "add" ? 1 : -1;

      if (type === "add") {
        await pool.query(
          `UPDATE cash_sessions SET opening_float = opening_float + $1 WHERE id = $2`,
          [Number(amount), req.params.id]
        );
      } else {
        await pool.query(
          `UPDATE cash_sessions SET total_cash_payouts = total_cash_payouts + $1 WHERE id = $2`,
          [Number(amount), req.params.id]
        );
      }

      const updatedSession = await storage.getCashSession(req.params.id);
      const runningBalance = computeRunningBalance(updatedSession!);

      const event = await storage.createCashDrawerEvent({
        tenantId: user.tenantId,
        outletId: session.outletId,
        sessionId: req.params.id,
        eventType,
        amount: String(amount),
        runningBalance: String(runningBalance),
        performedBy: user.id,
        performedByName: user.name || user.username,
        reason,
        isManual: true,
      });

      res.status(201).json({ event, runningBalance });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Create payout ───────────────────────────────────────────────────────
  app.post("/api/cash-sessions/:id/payouts", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }
      if (session.status !== "open") {
        return res.status(400).json({ message: "Session is not open" });
      }

      const { payoutType, amount, recipient, reason, approvedBy } = req.body;
      if (!payoutType || amount == null || !reason) {
        return res.status(400).json({ message: "payoutType, amount and reason are required" });
      }

      const runningBalance = computeRunningBalance(session);
      if (Number(amount) > runningBalance) {
        return res.status(400).json({
          message: `Cannot payout ${amount} — only ${runningBalance.toFixed(2)} in drawer`,
        });
      }

      const payoutNumber = await generatePayoutNumber(user.tenantId);

      await pool.query(
        `UPDATE cash_sessions SET total_cash_payouts = total_cash_payouts + $1 WHERE id = $2`,
        [Number(amount), req.params.id]
      );

      const updatedSession = await storage.getCashSession(req.params.id);
      const newBalance = computeRunningBalance(updatedSession!);

      const payout = await storage.createCashPayout({
        tenantId: user.tenantId,
        outletId: session.outletId,
        sessionId: req.params.id,
        payoutNumber,
        payoutType,
        amount: String(amount),
        recipient: recipient || null,
        reason,
        approvedBy: approvedBy || null,
        performedBy: user.id,
      });

      await storage.createCashDrawerEvent({
        tenantId: user.tenantId,
        outletId: session.outletId,
        sessionId: req.params.id,
        eventType: "PAYOUT",
        amount: String(amount),
        runningBalance: String(newBalance),
        performedBy: user.id,
        performedByName: user.name || user.username,
        reason,
        isManual: true,
      });

      res.status(201).json({ payout, runningBalance: newBalance });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Cash handover ───────────────────────────────────────────────────────
  app.post("/api/cash-sessions/:id/handover", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const session = await storage.getCashSession(req.params.id);
      if (!session || session.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Session not found" });
      }

      const { amountHandedOver, denominationBreakdown, receivedByName, notes } = req.body;
      if (amountHandedOver == null) {
        return res.status(400).json({ message: "amountHandedOver is required" });
      }

      const handoverCount = await pool.query(
        `SELECT COUNT(*) as cnt FROM cash_handovers WHERE session_id = $1`,
        [req.params.id]
      );
      const seq = parseInt(handoverCount.rows[0].cnt || "0") + 1;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const handoverNumber = `HND-${today}-${pad(seq)}`;

      const handover = await storage.createCashHandover({
        tenantId: user.tenantId,
        outletId: session.outletId,
        sessionId: req.params.id,
        handoverNumber,
        amountHandedOver: String(amountHandedOver),
        denominationBreakdown: denominationBreakdown || null,
        handedBy: user.id,
        handedByName: user.name || user.username,
        receivedByName: receivedByName || null,
        notes: notes || null,
      });

      res.status(201).json(handover);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Outlet currency settings ────────────────────────────────────────────
  app.get("/api/outlets/:id/currency-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const settings = await storage.getOutletCurrencySettings(req.params.id);
      if (!settings) return res.status(404).json({ message: "Outlet not found" });
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/outlets/:id/currency-settings", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { currencyCode, currencySymbol, currencyName, currencyPosition, decimalPlaces, denominationConfig, cashRounding } = req.body;

      const jurisdiction = currencyCode ? getJurisdictionByCurrency(currencyCode) : null;

      const outletResult = await pool.query(
        `SELECT outlet_tax_rate FROM outlets WHERE id = $1`,
        [req.params.id]
      );
      const currentTaxRate = outletResult.rows[0]?.outlet_tax_rate;

      const updated = await storage.updateOutletCurrencySettings(req.params.id, {
        currencyCode,
        currencySymbol,
        currencyName,
        currencyPosition,
        decimalPlaces,
        denominationConfig,
        cashRounding,
      });

      if (currencyCode && jurisdiction) {
        await pool.query(
          `UPDATE outlets SET
            jurisdiction_code = $1,
            outlet_tax_rate = CASE WHEN outlet_tax_rate IS NULL THEN $2 ELSE outlet_tax_rate END
          WHERE id = $3`,
          [currencyCode, jurisdiction.defaultTaxRate, req.params.id]
        );
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Outlet jurisdiction settings ────────────────────────────────────────
  app.get("/api/outlets/:id/jurisdiction", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT currency_code, tax_registration_number, vat_registered, outlet_tax_rate,
                trade_license_number, trade_license_authority, trade_license_expiry,
                company_registration_no, grievance_officer_name, grievance_officer_email,
                regulatory_footer_text, invoice_additional_info
         FROM outlets WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (!rows[0]) return res.status(404).json({ message: "Outlet not found" });
      const outlet = rows[0];
      const jurisdiction = getJurisdictionByCurrency(outlet.currency_code);
      res.json({
        jurisdiction,
        savedFields: {
          taxRegistrationNumber: outlet.tax_registration_number,
          vatRegistered: outlet.vat_registered,
          outletTaxRate: outlet.outlet_tax_rate,
          tradeLicenseNumber: outlet.trade_license_number,
          tradeLicenseAuthority: outlet.trade_license_authority,
          tradeLicenseExpiry: outlet.trade_license_expiry,
          companyRegistrationNo: outlet.company_registration_no,
          grievanceOfficerName: outlet.grievance_officer_name,
          grievanceOfficerEmail: outlet.grievance_officer_email,
          regulatoryFooterText: outlet.regulatory_footer_text,
          invoiceAdditionalInfo: outlet.invoice_additional_info,
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/outlets/:id/jurisdiction", requireAuth, requireRole("owner", "manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const {
        taxRegistrationNumber, vatRegistered, outletTaxRate,
        tradeLicenseNumber, tradeLicenseAuthority, tradeLicenseExpiry,
        companyRegistrationNo, grievanceOfficerName, grievanceOfficerEmail,
        regulatoryFooterText, invoiceAdditionalInfo,
      } = req.body;

      const { rows } = await pool.query(
        `UPDATE outlets SET
          tax_registration_number = $1,
          vat_registered = $2,
          outlet_tax_rate = $3,
          trade_license_number = $4,
          trade_license_authority = $5,
          trade_license_expiry = $6,
          company_registration_no = $7,
          grievance_officer_name = $8,
          grievance_officer_email = $9,
          regulatory_footer_text = $10,
          invoice_additional_info = $11,
          jurisdiction_code = currency_code
        WHERE id = $12 AND tenant_id = $13
        RETURNING *`,
        [
          taxRegistrationNumber || null,
          vatRegistered ?? false,
          outletTaxRate != null ? Number(outletTaxRate) : null,
          tradeLicenseNumber || null,
          tradeLicenseAuthority || null,
          tradeLicenseExpiry || null,
          companyRegistrationNo || null,
          grievanceOfficerName || null,
          grievanceOfficerEmail || null,
          regulatoryFooterText || null,
          invoiceAdditionalInfo || null,
          req.params.id,
          user.tenantId,
        ]
      );

      if (!rows[0]) return res.status(404).json({ message: "Outlet not found" });

      await pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.tenantId, user.id, 'outlet_jurisdiction_updated', 'outlet', req.params.id,
         JSON.stringify({ outletId: req.params.id })]
      ).catch(() => {});

      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
