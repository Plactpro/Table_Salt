import type { Express } from "express";
import { storage } from "../storage";
import { pool } from "../db";
import { requireAuth, requireRole } from "../auth";
import { routeAndPrint } from "../services/printer-service";

const VALID_PRINT_JOB_STATUSES = ["queued", "printing", "printed", "completed", "failed", "cancelled"] as const;
type PrintJobStatus = typeof VALID_PRINT_JOB_STATUSES[number];

const VALID_PRINT_JOB_TYPES = ["kot", "bill", "receipt", "label", "report", "test", "reprint_kot", "reprint_bill"] as const;
type PrintJobType = typeof VALID_PRINT_JOB_TYPES[number];

export async function getNextKotSequence(tenantId: string, orderId: string): Promise<number> {
  const existingJobs = await storage.getPrintJobsByTenant(tenantId, { referenceId: orderId });
  const kotCount = existingJobs.filter(j => j.type === "kot").length;
  return kotCount + 1;
}

export function registerPrintJobRoutes(app: Express): void {
  app.get("/api/print-jobs", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const rawStatus = req.query.status as string | undefined;
      const status: PrintJobStatus | undefined =
        rawStatus && (VALID_PRINT_JOB_STATUSES as readonly string[]).includes(rawStatus)
          ? (rawStatus as PrintJobStatus)
          : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const referenceId = req.query.referenceId as string | undefined;
      const jobs = await storage.getPrintJobsByTenant(user.tenantId, { status, limit, referenceId });
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/print/jobs", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const {
        status, printerId, jobType, isReprint, date, limit: lStr, offset: oStr,
      } = req.query as Record<string, string | undefined>;

      let query = `SELECT pj.*, p.printer_name FROM print_jobs pj
        LEFT JOIN printers p ON p.id = pj.printer_id
        WHERE pj.tenant_id = $1`;
      const params: unknown[] = [user.tenantId];
      let idx = 2;

      if (status) { query += ` AND pj.status = $${idx++}`; params.push(status); }
      if (printerId) { query += ` AND pj.printer_id = $${idx++}`; params.push(printerId); }
      if (jobType) { query += ` AND pj.type = $${idx++}`; params.push(jobType); }
      if (isReprint === "true") { query += ` AND pj.is_reprint = true`; }
      if (date) { query += ` AND pj.created_at::date = $${idx++}`; params.push(date); }

      query += ` ORDER BY pj.created_at DESC`;
      const limitN = Math.min(parseInt(lStr || "50"), 200);
      const offsetN = Math.max(parseInt(oStr || "0"), 0);
      query += ` LIMIT $${idx++} OFFSET $${idx++}`;
      params.push(limitN, offsetN);

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print-jobs", requireRole("owner", "manager", "cashier", "waiter", "kitchen"), async (req, res) => {
    try {
      const user = req.user as any;
      const { type, referenceId, station, payload } = req.body;
      if (!type || !referenceId) {
        return res.status(400).json({ message: "type and referenceId are required" });
      }
      if (!(VALID_PRINT_JOB_TYPES as readonly string[]).includes(type)) {
        return res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_PRINT_JOB_TYPES.join(", ")}` });
      }
      const job = await storage.createPrintJob({
        tenantId: user.tenantId,
        type: type as "kot" | "bill" | "receipt",
        referenceId,
        station: station ?? null,
        status: "queued",
        payload: payload ?? {},
      });
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/print-jobs/:id/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { status } = req.body;
      if (!["queued", "printed", "failed", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const job = await storage.updatePrintJob(req.params.id, user.tenantId, { status });
      if (!job) return res.status(404).json({ message: "Print job not found" });
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/print/jobs/:id/retry", requireRole("owner", "manager", "cashier"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT pj.*, p.ip_address, p.port, p.connection_type, p.printer_name, p.printer_type
         FROM print_jobs pj
         LEFT JOIN printers p ON p.id = pj.printer_id
         WHERE pj.id = $1 AND pj.tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Print job not found" });
      const job = rows[0];

      if (!["failed", "queued"].includes(job.status)) {
        return res.status(400).json({ message: `Cannot retry job with status: ${job.status}` });
      }

      if (job.attempts >= job.max_attempts) {
        return res.status(400).json({ message: "Maximum retry attempts reached" });
      }

      await pool.query(
        `UPDATE print_jobs SET status = 'queued', error_message = NULL, attempts = attempts + 1 WHERE id = $1`,
        [job.id]
      );

      res.json({ success: true, message: "Job queued for retry", jobId: job.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/print/jobs/:id/cancel", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM print_jobs WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Print job not found" });
      if (!["queued", "failed"].includes(rows[0].status)) {
        return res.status(400).json({ message: "Only queued or failed jobs can be cancelled" });
      }
      await pool.query(
        `UPDATE print_jobs SET status = 'cancelled' WHERE id = $1`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print/kot/:orderId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: orderRows } = await pool.query(
        `SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`,
        [req.params.orderId, user.tenantId]
      );
      if (orderRows.length === 0) return res.status(404).json({ message: "Order not found" });

      const result = await routeAndPrint({
        jobType: "kot",
        referenceId: req.params.orderId,
        outletId: orderRows[0].outlet_id ?? user.outletId ?? null,
        tenantId: user.tenantId,
        triggeredByName: user.name || user.username,
      });

      res.json({
        success: true,
        jobIds: result.jobIds,
        ...(result.htmlFallback ? { htmlFallback: result.htmlFallback } : {}),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print/bill/:billId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: billRows } = await pool.query(
        `SELECT * FROM bills WHERE id = $1 AND tenant_id = $2`,
        [req.params.billId, user.tenantId]
      );
      if (billRows.length === 0) return res.status(404).json({ message: "Bill not found" });

      const result = await routeAndPrint({
        jobType: "bill",
        referenceId: req.params.billId,
        outletId: billRows[0].outlet_id ?? user.outletId ?? null,
        tenantId: user.tenantId,
        triggeredByName: user.name || user.username,
      });

      res.json({
        success: true,
        jobIds: result.jobIds,
        ...(result.htmlFallback ? { htmlFallback: result.htmlFallback } : {}),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print/receipt/:billId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: billRows } = await pool.query(
        `SELECT * FROM bills WHERE id = $1 AND tenant_id = $2`,
        [req.params.billId, user.tenantId]
      );
      if (billRows.length === 0) return res.status(404).json({ message: "Bill not found" });

      const result = await routeAndPrint({
        jobType: "receipt",
        referenceId: req.params.billId,
        outletId: billRows[0].outlet_id ?? user.outletId ?? null,
        tenantId: user.tenantId,
        triggeredByName: user.name || user.username,
      });

      res.json({
        success: true,
        jobIds: result.jobIds,
        ...(result.htmlFallback ? { htmlFallback: result.htmlFallback } : {}),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print/label/:orderId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: orderRows } = await pool.query(
        `SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`,
        [req.params.orderId, user.tenantId]
      );
      if (orderRows.length === 0) return res.status(404).json({ message: "Order not found" });

      const result = await routeAndPrint({
        jobType: "label",
        referenceId: req.params.orderId,
        outletId: orderRows[0].outlet_id ?? user.outletId ?? null,
        tenantId: user.tenantId,
        triggeredByName: user.name || user.username,
      });

      res.json({
        success: true,
        jobIds: result.jobIds,
        ...(result.htmlFallback ? { htmlFallback: result.htmlFallback } : {}),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print/reprint", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { type, referenceId, reason } = req.body;
      if (!type || !referenceId) {
        return res.status(400).json({ message: "type and referenceId are required" });
      }

      const isManager = ["owner", "manager"].includes(user.role);
      if (type === "reprint_bill" && !isManager) {
        return res.status(403).json({ message: "Only managers can reprint bills" });
      }

      let outletId: string | null = user.outletId ?? null;
      if (type === "reprint_bill" || type === "receipt") {
        const { rows } = await pool.query(
          `SELECT outlet_id FROM bills WHERE id = $1 AND tenant_id = $2`,
          [referenceId, user.tenantId]
        );
        if (rows.length > 0) outletId = rows[0].outlet_id ?? outletId;
      } else {
        const { rows } = await pool.query(
          `SELECT outlet_id FROM orders WHERE id = $1 AND tenant_id = $2`,
          [referenceId, user.tenantId]
        );
        if (rows.length > 0) outletId = rows[0].outlet_id ?? outletId;
      }

      const result = await routeAndPrint({
        jobType: type as "reprint_kot" | "reprint_bill",
        referenceId,
        outletId,
        tenantId: user.tenantId,
        triggeredByName: user.name || user.username,
        isReprint: true,
        reprintReason: reason || "Manual reprint",
      });

      res.json({
        success: true,
        jobIds: result.jobIds,
        ...(result.htmlFallback ? { htmlFallback: result.htmlFallback } : {}),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/print/templates", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM printer_templates WHERE tenant_id = $1 AND is_active = true ORDER BY template_type`,
        [user.tenantId]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/print/templates/:type", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const templateType = req.params.type.toUpperCase();
      const {
        templateName, headerLines, footerLines, showLogo, logoUrl,
        showTaxBreakdown, showItemNotes, showModifications, showQrCode,
        qrCodeContent, fontSize, isActive,
      } = req.body;

      const { rows: existing } = await pool.query(
        `SELECT id FROM printer_templates WHERE tenant_id = $1 AND template_type = $2`,
        [user.tenantId, templateType]
      );

      let row;
      if (existing.length > 0) {
        const { rows } = await pool.query(
          `UPDATE printer_templates SET
            template_name = COALESCE($3, template_name),
            header_lines = COALESCE($4, header_lines),
            footer_lines = COALESCE($5, footer_lines),
            show_logo = COALESCE($6, show_logo),
            logo_url = COALESCE($7, logo_url),
            show_tax_breakdown = COALESCE($8, show_tax_breakdown),
            show_item_notes = COALESCE($9, show_item_notes),
            show_modifications = COALESCE($10, show_modifications),
            show_qr_code = COALESCE($11, show_qr_code),
            qr_code_content = COALESCE($12, qr_code_content),
            font_size = COALESCE($13, font_size),
            is_active = COALESCE($14, is_active)
           WHERE tenant_id = $1 AND template_type = $2
           RETURNING *`,
          [
            user.tenantId, templateType,
            templateName ?? null, headerLines ? JSON.stringify(headerLines) : null,
            footerLines ? JSON.stringify(footerLines) : null,
            showLogo ?? null, logoUrl ?? null, showTaxBreakdown ?? null,
            showItemNotes ?? null, showModifications ?? null, showQrCode ?? null,
            qrCodeContent ?? null, fontSize ?? null, isActive ?? null,
          ]
        );
        row = rows[0];
      } else {
        const { rows } = await pool.query(
          `INSERT INTO printer_templates
           (tenant_id, template_type, template_name, header_lines, footer_lines,
            show_logo, logo_url, show_tax_breakdown, show_item_notes, show_modifications,
            show_qr_code, qr_code_content, font_size, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [
            user.tenantId, templateType,
            templateName || `${templateType} Template`,
            JSON.stringify(headerLines || []),
            JSON.stringify(footerLines || ["Thank you for dining with us!"]),
            showLogo ?? false, logoUrl ?? null,
            showTaxBreakdown ?? true, showItemNotes ?? true,
            showModifications ?? true, showQrCode ?? false,
            qrCodeContent ?? null, fontSize ?? "normal",
            isActive ?? true,
          ]
        );
        row = rows[0];
      }
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print/templates/preview", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { templateType } = req.body;
      const { rows } = await pool.query(
        `SELECT * FROM printer_templates WHERE tenant_id = $1 AND template_type = $2`,
        [user.tenantId, (templateType || "BILL").toUpperCase()]
      );
      const template = rows[0];
      const { rows: tenantRows } = await pool.query(`SELECT name FROM tenants WHERE id = $1`, [user.tenantId]);
      const tenantName = tenantRows[0]?.name || "Restaurant";

      const { buildBillHtml } = await import("../services/escpos-builder");
      const previewHtml = buildBillHtml(
        {
          billNumber: "PREVIEW-001",
          invoiceNumber: "PREVIEW/2024/00001",
          tableNumber: 5,
          waiterName: "Demo Waiter",
          subtotal: "100.00",
          discountAmount: "10.00",
          serviceCharge: "5.00",
          taxAmount: "9.00",
          tips: "0",
          totalAmount: "104.00",
          paymentMethod: "Cash",
          covers: 2,
        },
        { id: "preview", tableNumber: 5, waiterName: "Demo Waiter" },
        [
          { name: "Grilled Salmon", quantity: 1, price: "60.00" },
          { name: "Caesar Salad", quantity: 2, price: "20.00" },
        ],
        template ? {
          headerLines: template.header_lines || [],
          footerLines: template.footer_lines || [],
          showLogo: template.show_logo,
          showTaxBreakdown: template.show_tax_breakdown,
          showItemNotes: template.show_item_notes,
          showQrCode: template.show_qr_code,
          qrCodeContent: template.qr_code_content,
          fontSize: template.font_size,
        } : undefined,
        tenantName,
      );
      res.json({ html: previewHtml });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/print/settings/:outletId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT print_settings FROM outlets WHERE id = $1 AND tenant_id = $2`,
        [req.params.outletId, user.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Outlet not found" });
      const settings = rows[0].print_settings ?? {
        autoKot: true,
        autoReceipt: true,
        autoBill: false,
        autoLabel: false,
      };
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/print/settings/:outletId", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `UPDATE outlets SET print_settings = $3 WHERE id = $1 AND tenant_id = $2 RETURNING print_settings`,
        [req.params.outletId, user.tenantId, JSON.stringify(req.body)]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Outlet not found" });
      res.json(rows[0].print_settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
