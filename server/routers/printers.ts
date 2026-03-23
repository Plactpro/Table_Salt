import type { Express } from "express";
import { pool } from "../db";
import { requireAuth, requireRole } from "../auth";
import {
  pingPrinter,
  pingAllPrinters,
  sendTestPrint,
  type Printer,
} from "../services/printer-service";

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
      res.json(rows.map(rowToPrinter));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/printers", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const {
        outletId, printerName, printerType, connectionType,
        ipAddress, port, usbDevicePath, paperWidth, charactersPerLine,
        printLanguage, counterId, isDefault, isActive,
      } = req.body;

      if (!printerName || !printerType || !connectionType) {
        return res.status(400).json({ message: "printerName, printerType, and connectionType are required" });
      }

      if (isDefault) {
        await pool.query(
          `UPDATE printers SET is_default = false WHERE tenant_id = $1 AND printer_type = $2`,
          [user.tenantId, printerType]
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
          printerName,
          printerType,
          connectionType,
          ipAddress ?? null,
          port ?? null,
          usbDevicePath ?? null,
          paperWidth ?? "80mm",
          charactersPerLine ?? 42,
          printLanguage ?? "ESC_POS",
          counterId ?? null,
          isDefault ?? false,
          isActive ?? true,
        ]
      );
      res.status(201).json(rowToPrinter(rows[0]));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/printers/:id", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows: existing } = await pool.query(
        `SELECT * FROM printers WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Printer not found" });

      const {
        outletId, printerName, printerType, connectionType,
        ipAddress, port, usbDevicePath, paperWidth, charactersPerLine,
        printLanguage, counterId, isDefault, isActive, status,
      } = req.body;

      if (isDefault) {
        const pt = printerType || existing[0].printer_type;
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
        printer_name: printerName,
        printer_type: printerType,
        connection_type: connectionType,
        ip_address: ipAddress,
        port,
        usb_device_path: usbDevicePath,
        paper_width: paperWidth,
        characters_per_line: charactersPerLine,
        print_language: printLanguage,
        counter_id: counterId,
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
      res.json(rowToPrinter(rows[0]));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/printers/:id", requireRole("owner", "manager"), async (req, res) => {
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

  app.post("/api/printers/:id/test", requireRole("owner", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { rows } = await pool.query(
        `SELECT * FROM printers WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, user.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Printer not found" });
      const printer = rowToPrinter(rows[0]);
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
      const printer = rowToPrinter(rows[0]);
      const status = await pingPrinter(printer);
      await pool.query(
        `UPDATE printers SET status = $1, last_ping_at = now() WHERE id = $2`,
        [status, printer.id]
      );
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
}
