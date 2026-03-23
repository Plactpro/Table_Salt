import type { Express } from "express";
import { pool } from "../db";
import { requireAuth, requireRole } from "../auth";
import {
  pingPrinter,
  pingAllPrinters,
  sendTestPrint,
  type Printer,
} from "../services/printer-service";
import { alertEngine } from "../services/alert-engine";

function rowToPrinter(row: Record<string, unknown>): Printer {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    outletId: row.outlet_id as string | null,
    printerName: row.printer_name as string,
    printerType: row.printer_type as Printer["printerType"],
    connectionType: row.connection_type as Printer["connectionType"],
    ipAddress: row.ip_address as string | null,
    port: row.port as number | null,
    usbDevicePath: row.usb_device_path as string | null,
    paperWidth: row.paper_width as string | null,
    charactersPerLine: row.characters_per_line as number | null,
    printLanguage: row.print_language as string | null,
    counterId: row.counter_id as string | null,
    isDefault: row.is_default as boolean | null,
    isActive: row.is_active as boolean | null,
    status: row.status as Printer["status"] | null,
    lastPingAt: row.last_ping_at ? new Date(row.last_ping_at as string) : null,
    lastPrintAt: row.last_print_at ? new Date(row.last_print_at as string) : null,
  };
}

function printerToFrontend(p: Printer & { autoKotPrint?: boolean; autoReceiptPrint?: boolean }): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    KITCHEN: "kitchen", CASHIER: "cashier", LABEL: "label",
    BAR: "bar", EXPEDITOR: "kitchen", MANAGER: "cashier",
  };
  const connMap: Record<string, string> = {
    NETWORK_IP: "network", USB: "usb", BLUETOOTH: "usb", CLOUD: "network", BROWSER: "browser",
  };
  return {
    id: p.id,
    name: p.printerName,
    type: typeMap[p.printerType] ?? p.printerType.toLowerCase(),
    connectionType: connMap[p.connectionType] ?? p.connectionType.toLowerCase(),
    ipAddress: p.ipAddress,
    port: p.port,
    paperWidth: p.paperWidth ?? "80mm",
    isDefault: p.isDefault ?? false,
    status: p.status ?? "unknown",
    stationId: p.counterId,
    autoKotPrint: p.autoKotPrint ?? false,
    autoReceiptPrint: p.autoReceiptPrint ?? false,
    tenantId: p.tenantId,
  };
}

const printTemplateStore: Map<string, Record<string, unknown>> = new Map();

export function registerPrinterRoutes(app: Express): void {
  app.get("/api/printers", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      let query = `SELECT * FROM printers WHERE tenant_id = $1`;
      const params: unknown[] = [user.tenantId];
      if (outletId) {
        query += ` AND (outlet_id = $2 OR outlet_id IS NULL)`;
        params.push(outletId);
      }
      query += ` ORDER BY is_default DESC, printer_name ASC`;
      const { rows } = await pool.query(query, params);
      res.json(rows.map(r => printerToFrontend(rowToPrinter(r))));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/printers", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const {
        name, printerName,
        type, printerType,
        connectionType,
        ipAddress, port, usbDevicePath, paperWidth, charactersPerLine,
        printLanguage, counterId, stationId, isDefault, isActive,
        outletId,
      } = req.body;

      const resolvedName = printerName || name;
      const resolvedType = printerType || (type ? type.toUpperCase() : undefined);
      const resolvedConn = connectionType ? connectionType.toUpperCase().replace("NETWORK", "NETWORK_IP").replace("BROWSER", "BROWSER") : "BROWSER";

      if (!resolvedName) {
        return res.status(400).json({ message: "name is required" });
      }
      const validTypes = ["KITCHEN", "CASHIER", "LABEL", "BAR", "EXPEDITOR", "MANAGER"];
      const finalType = resolvedType || "KITCHEN";
      if (!validTypes.includes(finalType)) {
        return res.status(400).json({ message: "Invalid printer type" });
      }

      const validConns = ["NETWORK_IP", "USB", "BLUETOOTH", "CLOUD", "BROWSER"];
      const finalConn = validConns.includes(resolvedConn) ? resolvedConn : "BROWSER";

      if (isDefault) {
        await pool.query(
          `UPDATE printers SET is_default = false WHERE tenant_id = $1 AND printer_type = $2`,
          [user.tenantId, finalType]
        );
      }

      const { rows } = await pool.query(
        `INSERT INTO printers
         (tenant_id, outlet_id, printer_name, printer_type, connection_type,
          ip_address, port, usb_device_path, paper_width, characters_per_line,
          print_language, counter_id, is_default, is_active, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'unknown')
         RETURNING *`,
        [
          user.tenantId,
          outletId ?? null,
          resolvedName,
          finalType,
          finalConn,
          ipAddress ?? null,
          port ?? null,
          usbDevicePath ?? null,
          paperWidth ?? "80mm",
          charactersPerLine ?? 42,
          printLanguage ?? "ESC_POS",
          counterId ?? stationId ?? null,
          isDefault ?? false,
          isActive ?? true,
        ]
      );
      res.status(201).json(printerToFrontend(rowToPrinter(rows[0])));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/printers/:id", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: existing } = await pool.query(
        `SELECT * FROM printers WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Printer not found" });

      const {
        name, printerName, type, printerType,
        connectionType, ipAddress, port, usbDevicePath, paperWidth, charactersPerLine,
        printLanguage, counterId, stationId, isDefault, isActive, status, outletId,
      } = req.body;

      const resolvedName = printerName || name;
      const resolvedType = printerType || (type ? type.toUpperCase() : undefined);
      const resolvedConn = connectionType
        ? connectionType.toUpperCase().replace("NETWORK", "NETWORK_IP")
        : undefined;

      if (resolvedType || isDefault) {
        const pt = resolvedType || existing[0].printer_type;
        await pool.query(
          `UPDATE printers SET is_default = false WHERE tenant_id = $1 AND printer_type = $2 AND id != $3`,
          [user.tenantId, pt, req.params.id]
        );
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const fields: Record<string, unknown> = {
        outlet_id: outletId,
        printer_name: resolvedName,
        printer_type: resolvedType,
        connection_type: resolvedConn,
        ip_address: ipAddress,
        port,
        usb_device_path: usbDevicePath,
        paper_width: paperWidth,
        characters_per_line: charactersPerLine,
        print_language: printLanguage,
        counter_id: counterId ?? stationId,
        is_default: isDefault,
        is_active: isActive,
        status,
      };

      for (const [col, val] of Object.entries(fields)) {
        if (val !== undefined) {
          setClauses.push(`${col} = $${idx++}`);
          params.push(val);
        }
      }

      if (setClauses.length === 0) return res.status(400).json({ message: "No fields to update" });

      params.push(req.params.id, user.tenantId);
      const { rows } = await pool.query(
        `UPDATE printers SET ${setClauses.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
        params
      );
      res.json(printerToFrontend(rowToPrinter(rows[0])));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/printers/:id", requireRole("owner", "manager", "outlet_manager", "cashier"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: existing } = await pool.query(
        `SELECT * FROM printers WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Printer not found" });

      const {
        name, printerName, type, printerType,
        connectionType, ipAddress, port, usbDevicePath, paperWidth,
        counterId, stationId, isDefault, isActive, status,
        autoKotPrint, autoReceiptPrint,
      } = req.body;

      const resolvedName = printerName || name;
      const resolvedType = printerType || (type ? type.toUpperCase() : undefined);
      const resolvedConn = connectionType
        ? connectionType.toUpperCase().replace("NETWORK", "NETWORK_IP")
        : undefined;

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const fields: Record<string, unknown> = {
        printer_name: resolvedName,
        printer_type: resolvedType,
        connection_type: resolvedConn,
        ip_address: ipAddress,
        port,
        usb_device_path: usbDevicePath,
        paper_width: paperWidth,
        counter_id: counterId ?? stationId,
        is_default: isDefault,
        is_active: isActive,
        status,
      };

      for (const [col, val] of Object.entries(fields)) {
        if (val !== undefined) {
          setClauses.push(`${col} = $${idx++}`);
          params.push(val);
        }
      }

      if (setClauses.length === 0) return res.json(printerToFrontend(rowToPrinter(existing[0])));

      params.push(req.params.id, user.tenantId);
      const { rows } = await pool.query(
        `UPDATE printers SET ${setClauses.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
        params
      );
      res.json(printerToFrontend(rowToPrinter(rows[0])));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/printers/:id", requireRole("owner", "manager", "outlet_manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rowCount } = await pool.query(
        `DELETE FROM printers WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (rowCount === 0) return res.status(404).json({ message: "Printer not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/printers/:id/test", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM printers WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Printer not found" });
      const printer = rowToPrinter(rows[0]);
      if (printer.connectionType !== "NETWORK_IP" || !printer.ipAddress) {
        return res.json({
          success: true,
          message: "Browser print — no network test needed",
          fallback: true,
          html: generateTestPageHtml(printer.printerName),
        });
      }
      const result = await sendTestPrint(printer);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/printers/:id/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM printers WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Printer not found" });
      const prevStatus = rows[0].status;
      const printer = rowToPrinter(rows[0]);
      const status = await pingPrinter(printer);
      await pool.query(
        `UPDATE printers SET status = $1, last_ping_at = now() WHERE id = $2`,
        [status, printer.id]
      );
      if (status === 'offline' && prevStatus !== 'offline') {
        const printerType = (rows[0].printer_type as string ?? '').toLowerCase();
        const alertCode = printerType === 'kitchen' ? 'ALERT-07' : 'ALERT-08';
        alertEngine.trigger(alertCode, { tenantId: user.tenantId, outletId: rows[0].outlet_id as string ?? undefined, referenceId: printer.id, message: `${printerType || 'receipt'} printer offline: ${printer.printerName}` }).catch(() => {});
      }
      res.json({ id: printer.id, name: printer.printerName, status, lastPingAt: new Date() });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/printers/status-all", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const outletId = req.query.outletId as string | undefined;
      const results = await pingAllPrinters(user.tenantId, outletId);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/print/templates", requireAuth, (req, res) => {
    const user = req.user as any;
    const templates = printTemplateStore.get(user.tenantId) || {};
    res.json(templates);
  });

  app.post("/api/print/templates/:type", requireRole("owner", "manager", "outlet_manager"), (req, res) => {
    const user = req.user as any;
    const { type } = req.params;
    if (!["kot", "bill"].includes(type)) return res.status(400).json({ message: "Invalid template type" });
    const existing = printTemplateStore.get(user.tenantId) || {};
    const updated = { ...existing, [type]: req.body };
    printTemplateStore.set(user.tenantId, updated);
    res.json(updated);
  });

  app.post("/api/print/reprint", requireAuth, async (req, res) => {
    try {
      const { orderId, billId, type, reason, isReprint } = req.body;
      if (!type || !["kot", "bill", "receipt"].includes(type)) {
        return res.status(400).json({ message: "Valid type (kot/bill/receipt) is required" });
      }
      res.json({ success: true, queued: true, type, orderId, billId, isReprint: !!isReprint, reason: reason || "reprint" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print/bill/:billId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { billId } = req.params;
      const { rows } = await pool.query(
        `SELECT p.* FROM printers p WHERE p.tenant_id = $1 AND p.printer_type IN ('CASHIER','MANAGER') AND p.is_active = true ORDER BY p.is_default DESC LIMIT 1`,
        [user.tenantId]
      );
      if (rows.length === 0) {
        return res.json({ fallback: true, html: generateFallbackReceiptHtml(billId, "bill") });
      }
      const printer = rowToPrinter(rows[0]);
      if (printer.connectionType === "BROWSER" || !printer.ipAddress) {
        return res.json({ fallback: true, html: generateFallbackReceiptHtml(billId, "bill") });
      }
      res.json({ success: true, queued: true, billId, printerName: printer.printerName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/print/receipt/:billId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { billId } = req.params;
      const { rows } = await pool.query(
        `SELECT p.* FROM printers p WHERE p.tenant_id = $1 AND p.printer_type IN ('CASHIER','MANAGER') AND p.is_active = true ORDER BY p.is_default DESC LIMIT 1`,
        [user.tenantId]
      );
      if (rows.length === 0) {
        return res.json({ fallback: true, html: generateFallbackReceiptHtml(billId, "receipt") });
      }
      const printer = rowToPrinter(rows[0]);
      if (printer.connectionType === "BROWSER" || !printer.ipAddress) {
        return res.json({ fallback: true, html: generateFallbackReceiptHtml(billId, "receipt") });
      }
      res.json({ success: true, queued: true, billId, printerName: printer.printerName });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}

function generateTestPageHtml(printerName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Test Print</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 302px; max-width: 302px; padding: 8px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .big { font-size: 16px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  @media print { * { color: black !important; } }
</style>
</head>
<body>
  <div class="center bold big">TEST PRINT</div>
  <div class="sep"></div>
  <div class="center">${printerName}</div>
  <div class="center">${new Date().toLocaleString()}</div>
  <div class="sep"></div>
  <div class="center">Printer is working correctly</div>
  <div class="center">Connection OK</div>
  <div class="sep"></div>
  <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }</script>
</body>
</html>`;
}

function generateFallbackReceiptHtml(refId: string, type: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${type === "bill" ? "Bill" : "Receipt"}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; max-width: 80mm; padding: 8px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  @media print { * { color: black !important; } }
</style>
</head>
<body>
  <div class="center bold">RECEIPT</div>
  <div class="sep"></div>
  <div class="center">Ref: ${refId.slice(-6).toUpperCase()}</div>
  <div class="center">${new Date().toLocaleString()}</div>
  <div class="sep"></div>
  <div class="center">[Browser Print Fallback]</div>
  <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); }</script>
</body>
</html>`;
}
