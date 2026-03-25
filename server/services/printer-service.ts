import net from "net";
import { pool } from "../db";
import { emitToTenant } from "../realtime";
import {
  buildKOT, buildBill, buildLabel, buildTestPage,
  buildKOTHtml, buildBillHtml,
  buildRefundReceipt, buildRefundReceiptHtml,
  type KOTOrder, type KOTItem, type BillData, type BillItem, type PrintTemplate,
  type RefundPaymentData, type RefundReceiptData, type JurisdictionMeta,
} from "./escpos-builder";
import { getJurisdictionByCurrency } from "../../shared/jurisdictions";

export type PrinterType = "KITCHEN" | "CASHIER" | "BAR" | "EXPEDITOR" | "LABEL" | "MANAGER";
export type ConnectionType = "NETWORK_IP" | "USB" | "BLUETOOTH" | "CLOUD" | "BROWSER";
export type PrinterStatus = "online" | "offline" | "error" | "low_paper" | "unknown";
export type PrintJobType = "kot" | "bill" | "receipt" | "label" | "report" | "test" | "reprint_kot" | "reprint_bill" | "refund_receipt";

export interface Printer {
  id: string;
  tenantId: string;
  outletId?: string | null;
  printerName: string;
  printerType: PrinterType;
  connectionType: ConnectionType;
  ipAddress?: string | null;
  port?: number | null;
  usbDevicePath?: string | null;
  paperWidth?: string | null;
  charactersPerLine?: number | null;
  printLanguage?: string | null;
  counterId?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
  status?: PrinterStatus | null;
  lastPingAt?: Date | null;
  lastPrintAt?: Date | null;
}

class NetworkPrinterHandler {
  async send(printer: Printer, data: Buffer): Promise<void> {
    const host = printer.ipAddress!;
    const port = printer.port || 9100;
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.connect(port, host, () => {
        socket.write(data, (err) => {
          if (err) { socket.destroy(); reject(err); return; }
          socket.end();
          resolve();
        });
      });
      socket.on("timeout", () => { socket.destroy(); reject(new Error("Connection timeout")); });
      socket.on("error", (err) => { socket.destroy(); reject(err); });
    });
  }
}

class BrowserPrintHandler {
  generateKotHtml(order: KOTOrder, items: KOTItem[]): string {
    return buildKOTHtml(order, items);
  }

  generateBillHtml(
    bill: BillData,
    order: KOTOrder,
    items: BillItem[],
    template?: PrintTemplate,
    tenantName?: string,
    payments?: RefundPaymentData[],
  ): string {
    return buildBillHtml(bill, order, items, template, tenantName, payments);
  }
}

class CloudPrinterHandler {
  async queue(printer: Printer, data: Buffer): Promise<string> {
    // TODO: Integrate with PrintNode / Google Cloud Print
    console.log(`[CloudPrinterHandler] Queued job for printer ${printer.printerName} (${printer.id}) — stub only`);
    return "queued via cloud";
  }
}

const networkHandler = new NetworkPrinterHandler();
const browserHandler = new BrowserPrintHandler();
const cloudHandler = new CloudPrinterHandler();

export async function pingPrinter(printer: Printer): Promise<PrinterStatus> {
  if (printer.connectionType !== "NETWORK_IP" || !printer.ipAddress) {
    return "unknown";
  }
  const host = printer.ipAddress;
  const port = printer.port || 9100;
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.connect(port, host, () => {
      socket.destroy();
      resolve("online");
    });
    socket.on("timeout", () => { socket.destroy(); resolve("offline"); });
    socket.on("error", () => { socket.destroy(); resolve("offline"); });
  });
}

export async function getPrintersByOutlet(tenantId: string, outletId?: string | null): Promise<Printer[]> {
  let query = `SELECT * FROM printers WHERE tenant_id = $1 AND is_active = true`;
  const params: unknown[] = [tenantId];
  if (outletId) {
    query += ` AND (outlet_id = $2 OR outlet_id IS NULL)`;
    params.push(outletId);
  }
  query += ` ORDER BY is_default DESC, printer_name ASC`;
  const { rows } = await pool.query(query, params);
  return rows.map(rowToPrinter);
}

function rowToPrinter(row: Record<string, unknown>): Printer {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    outletId: row.outlet_id as string | null,
    printerName: row.printer_name as string,
    printerType: row.printer_type as PrinterType,
    connectionType: row.connection_type as ConnectionType,
    ipAddress: row.ip_address as string | null,
    port: row.port as number | null,
    usbDevicePath: row.usb_device_path as string | null,
    paperWidth: row.paper_width as string | null,
    charactersPerLine: row.characters_per_line as number | null,
    printLanguage: row.print_language as string | null,
    counterId: row.counter_id as string | null,
    isDefault: row.is_default as boolean | null,
    isActive: row.is_active as boolean | null,
    status: row.status as PrinterStatus | null,
    lastPingAt: row.last_ping_at ? new Date(row.last_ping_at as string) : null,
    lastPrintAt: row.last_print_at ? new Date(row.last_print_at as string) : null,
  };
}

async function createPrintJobRecord(params: {
  tenantId: string;
  outletId?: string | null;
  printerId?: string | null;
  type: string;
  referenceId: string;
  content?: string | null;
  contentFormat?: string | null;
  payload?: unknown;
  status?: string;
  maxAttempts?: number;
  triggeredByName?: string | null;
  isReprint?: boolean;
  reprintReason?: string | null;
}): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO print_jobs
     (tenant_id, outlet_id, printer_id, type, reference_id, content, content_format,
      payload, status, max_attempts, triggered_by_name, is_reprint, reprint_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      params.tenantId,
      params.outletId ?? null,
      params.printerId ?? null,
      params.type,
      params.referenceId,
      params.content ?? null,
      params.contentFormat ?? null,
      JSON.stringify(params.payload ?? {}),
      params.status ?? "queued",
      params.maxAttempts ?? 3,
      params.triggeredByName ?? null,
      params.isReprint ?? false,
      params.reprintReason ?? null,
    ]
  );
  return rows[0].id;
}

async function markJobStatus(jobId: string, status: string, errorMessage?: string): Promise<void> {
  if (status === "printing") {
    await pool.query(
      `UPDATE print_jobs SET status = $1, started_at = now(), attempts = attempts + 1 WHERE id = $2`,
      [status, jobId]
    );
  } else if (status === "completed") {
    await pool.query(
      `UPDATE print_jobs SET status = $1, completed_at = now() WHERE id = $2`,
      [status, jobId]
    );
  } else {
    await pool.query(
      `UPDATE print_jobs SET status = $1, error_message = $2 WHERE id = $3`,
      [status, errorMessage ?? null, jobId]
    );
  }
}

async function sendToPrinter(printer: Printer, data: Buffer, jobId: string): Promise<void> {
  await markJobStatus(jobId, "printing");
  try {
    if (printer.connectionType === "NETWORK_IP") {
      await networkHandler.send(printer, data);
    } else if (printer.connectionType === "CLOUD") {
      await cloudHandler.queue(printer, data);
    } else {
      // USB / BLUETOOTH → browser fallback (handled at route level)
      console.log(`[PrinterService] Non-network printer ${printer.printerName} — browser fallback`);
    }
    await markJobStatus(jobId, "completed");
    await pool.query(`UPDATE printers SET last_print_at = now(), status = 'online' WHERE id = $1`, [printer.id]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await markJobStatus(jobId, "failed", msg);
    await pool.query(`UPDATE printers SET status = 'error' WHERE id = $1`, [printer.id]);
    throw err;
  }
}

export async function routeAndPrint(params: {
  jobType: PrintJobType;
  referenceId: string;
  outletId: string | null;
  tenantId: string;
  triggeredByName?: string;
  isReprint?: boolean;
  reprintReason?: string;
  payload?: Record<string, unknown>;
}): Promise<{ jobIds: string[]; htmlFallback?: string }> {
  const { jobType, referenceId, outletId, tenantId, triggeredByName, isReprint, reprintReason, payload: inputPayload } = params;

  const printers = await getPrintersByOutlet(tenantId, outletId);
  const results: { jobIds: string[]; htmlFallback?: string } = { jobIds: [] };

  if (jobType === "kot" || jobType === "reprint_kot") {
    const { rows: orderRows } = await pool.query(
      `SELECT o.*, t.number AS table_number, t.name AS table_name
       FROM orders o
       LEFT JOIN tables t ON t.id = o.table_id
       WHERE o.id = $1`,
      [referenceId]
    );
    if (orderRows.length === 0) return results;
    const orderRow = orderRows[0];

    const { rows: itemRows } = await pool.query(
      `SELECT oi.*, mi.station FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = $1`,
      [referenceId]
    );

    const order: KOTOrder = {
      id: orderRow.id,
      orderNumber: orderRow.order_number,
      tableNumber: orderRow.table_number ?? null,
      orderType: orderRow.order_type,
      allergies: orderRow.allergies,
      vipNotes: orderRow.vip_notes,
      specialInstructions: orderRow.special_instructions,
      waiterName: orderRow.waiter_name,
    };

    const counterGroups = new Map<string | null, KOTItem[]>();
    for (const item of itemRows) {
      const counterId = item.counter_id ?? null;
      if (!counterGroups.has(counterId)) counterGroups.set(counterId, []);
      counterGroups.get(counterId)!.push({
        name: item.name,
        quantity: item.quantity,
        notes: item.notes,
        course: item.course,
        isAddon: item.is_addon,
      });
    }

    const kitchenPrinters = printers.filter(p => p.printerType === "KITCHEN" || p.printerType === "EXPEDITOR");
    let jobCreated = false;

    for (const [counterId, items] of counterGroups) {
      let targetPrinter: Printer | undefined;
      if (counterId) {
        targetPrinter = printers.find(p => p.counterId === counterId && p.isActive);
      }
      if (!targetPrinter) {
        targetPrinter = kitchenPrinters[0] ?? printers[0];
      }

      if (!targetPrinter) continue;

      const kotOrder = { ...order, station: counterId ? undefined : order.orderType };
      let htmlFallback: string | undefined;
      let escposData: Buffer | undefined;

      if (targetPrinter.connectionType === "BROWSER" || targetPrinter.connectionType === "USB" || targetPrinter.connectionType === "BLUETOOTH") {
        htmlFallback = browserHandler.generateKotHtml(kotOrder, items);
        results.htmlFallback = htmlFallback;
      } else {
        try {
          escposData = buildKOT(kotOrder, items);
        } catch (_) {
          htmlFallback = browserHandler.generateKotHtml(kotOrder, items);
          results.htmlFallback = htmlFallback;
        }
      }

      const jobId = await createPrintJobRecord({
        tenantId,
        outletId,
        printerId: targetPrinter.id,
        type: jobType,
        referenceId,
        content: htmlFallback ?? null,
        contentFormat: htmlFallback ? "html" : "escpos",
        payload: { items, order: kotOrder },
        triggeredByName,
        isReprint,
        reprintReason,
      });
      results.jobIds.push(jobId);
      jobCreated = true;

      if (escposData) {
        sendToPrinter(targetPrinter, escposData, jobId).catch(err => {
          console.error(`[PrinterService] KOT print failed for job ${jobId}:`, err);
        });
      }
    }

    if (!jobCreated) {
      const allItems: KOTItem[] = itemRows.map((item: Record<string, unknown>) => ({
        name: item.name as string,
        quantity: item.quantity as number,
        notes: item.notes as string | null,
        course: item.course as string | null,
        isAddon: item.is_addon as boolean,
      }));
      const htmlFallback = browserHandler.generateKotHtml(order, allItems);
      results.htmlFallback = htmlFallback;
      const jobId = await createPrintJobRecord({
        tenantId,
        outletId,
        printerId: null,
        type: jobType,
        referenceId,
        content: htmlFallback,
        contentFormat: "html",
        payload: { items: allItems, order },
        triggeredByName,
        isReprint,
        reprintReason,
      });
      results.jobIds.push(jobId);
    }
  } else if (jobType === "bill" || jobType === "receipt" || jobType === "reprint_bill") {
    const { rows: billRows } = await pool.query(
      `SELECT b.*, o.order_number, t.number AS table_number
       FROM bills b
       LEFT JOIN orders o ON o.id = b.order_id
       LEFT JOIN tables t ON t.id = b.table_id
       WHERE b.id = $1`,
      [referenceId]
    );
    if (billRows.length === 0) return results;
    const billRow = billRows[0];

    const { rows: itemRows } = await pool.query(
      `SELECT oi.* FROM order_items oi WHERE oi.order_id = $1`,
      [billRow.order_id]
    );

    // Fetch packing settings to check show_on_receipt
    let showPackingOnReceipt = true;
    if (billRow.packing_charge && Number(billRow.packing_charge) > 0 && billRow.outlet_id) {
      try {
        const { rows: packingSettingsRows } = await pool.query(
          `SELECT show_on_receipt FROM outlet_packing_settings WHERE outlet_id = $1 AND tenant_id = $2 LIMIT 1`,
          [billRow.outlet_id, billRow.tenant_id]
        );
        if (packingSettingsRows[0]) {
          showPackingOnReceipt = packingSettingsRows[0].show_on_receipt !== false;
        }
      } catch (_) {}
    }

    let jurisdictionMeta: JurisdictionMeta | null = null;
    const billOutletId = billRow.outlet_id ?? outletId;
    if (billOutletId) {
      try {
        const { rows: outletRows } = await pool.query(
          `SELECT currency_code, tax_registration_number, vat_registered,
                  trade_license_number, trade_license_authority,
                  regulatory_footer_text
           FROM outlets WHERE id = $1 LIMIT 1`,
          [billOutletId]
        );
        if (outletRows[0]) {
          const outletRow = outletRows[0];
          const jConfig = getJurisdictionByCurrency(outletRow.currency_code || "USD");
          jurisdictionMeta = {
            taxInvoiceLabel: jConfig.taxInvoiceLabel,
            taxLabel: jConfig.taxLabel,
            taxRegLabel: jConfig.taxRegLabel,
            taxRegNumber: outletRow.tax_registration_number || null,
            splitTaxLabels: jConfig.splitTaxLabels || null,
            requireTaxRegOnInvoice: jConfig.requireTaxRegOnInvoice,
            tradeLicenseNumber: outletRow.trade_license_number || null,
            tradeLicenseAuthority: outletRow.trade_license_authority || null,
            ccpaApplicable: jConfig.ccpaApplicable,
            footerText: outletRow.regulatory_footer_text || null,
          };
        }
      } catch (_) {}
    }

    const bill: BillData = {
      billNumber: billRow.bill_number,
      invoiceNumber: billRow.invoice_number,
      tableNumber: billRow.table_number,
      waiterName: billRow.waiter_name,
      subtotal: billRow.subtotal,
      discountAmount: billRow.discount_amount,
      serviceCharge: billRow.service_charge,
      taxAmount: billRow.tax_amount,
      taxBreakdown: billRow.tax_breakdown,
      tips: billRow.tips,
      packingCharge: billRow.packing_charge,
      packingChargeLabel: billRow.packing_charge_label,
      packingChargeTax: billRow.packing_charge_tax,
      showPackingChargeOnReceipt: showPackingOnReceipt,
      totalAmount: billRow.total_amount,
      paymentMethod: null,
      covers: billRow.covers,
      jurisdictionMeta,
    };

    const order: KOTOrder = {
      id: billRow.order_id,
      orderNumber: billRow.order_number,
      tableNumber: billRow.table_number,
      waiterName: billRow.waiter_name,
    };

    const items: BillItem[] = itemRows.map((r: Record<string, unknown>) => ({
      name: r.name as string,
      quantity: r.quantity as number,
      price: r.price as string,
      notes: r.notes as string | null,
    }));

    const { rows: tenantRows } = await pool.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);
    const tenantName = tenantRows[0]?.name;

    // Fetch refund payments so they appear on reprinted bills
    const { rows: refundPaymentRows } = await pool.query(
      `SELECT id, amount, refund_reason, payment_method, created_at FROM bill_payments WHERE bill_id = $1 AND is_refund = true ORDER BY created_at ASC`,
      [billRow.id]
    );
    const billRefundPayments: RefundPaymentData[] = refundPaymentRows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      amount: r.amount as string,
      refundReason: r.refund_reason as string | null,
      paymentMethod: r.payment_method as string | null,
      createdAt: r.created_at as Date | null,
    }));

    const cashierPrinter = printers.find(p => p.printerType === "CASHIER" && p.isDefault) ?? printers.find(p => p.printerType === "CASHIER");
    let targetPrinter = cashierPrinter ?? printers[0];

    let htmlFallback: string | undefined;
    let escposData: Buffer | undefined;

    if (!targetPrinter || targetPrinter.connectionType === "BROWSER" || targetPrinter.connectionType === "USB" || targetPrinter.connectionType === "BLUETOOTH") {
      htmlFallback = browserHandler.generateBillHtml(bill, order, items, undefined, tenantName, billRefundPayments.length > 0 ? billRefundPayments : undefined);
      results.htmlFallback = htmlFallback;
    } else {
      try {
        escposData = buildBill(bill, order, items, undefined, tenantName, billRefundPayments.length > 0 ? billRefundPayments : undefined);
      } catch (_) {
        htmlFallback = browserHandler.generateBillHtml(bill, order, items, undefined, tenantName, billRefundPayments.length > 0 ? billRefundPayments : undefined);
        results.htmlFallback = htmlFallback;
      }
    }

    const jobId = await createPrintJobRecord({
      tenantId,
      outletId,
      printerId: targetPrinter?.id ?? null,
      type: jobType,
      referenceId,
      content: htmlFallback ?? null,
      contentFormat: htmlFallback ? "html" : "escpos",
      payload: { bill, order, items },
      triggeredByName,
      isReprint,
      reprintReason,
    });
    results.jobIds.push(jobId);

    if (escposData && targetPrinter) {
      sendToPrinter(targetPrinter, escposData, jobId).catch(err => {
        console.error(`[PrinterService] Bill print failed for job ${jobId}:`, err);
      });
    }
  } else if (jobType === "refund_receipt") {
    // referenceId is the bill ID; inputPayload.refundPaymentId narrows to the specific refund to print
    const { rows: billRows } = await pool.query(
      `SELECT b.*, o.order_number, t.number AS table_number
       FROM bills b
       LEFT JOIN orders o ON o.id = b.order_id
       LEFT JOIN tables t ON t.id = b.table_id
       WHERE b.id = $1`,
      [referenceId]
    );
    if (billRows.length === 0) return results;
    const billRow = billRows[0];

    const refundPaymentId = inputPayload?.refundPaymentId as string | undefined;
    let paymentQuery: string;
    let paymentParams: unknown[];

    if (refundPaymentId) {
      // Print only the specific refund payment
      paymentQuery = `SELECT * FROM bill_payments WHERE id = $1 AND bill_id = $2 AND is_refund = true`;
      paymentParams = [refundPaymentId, referenceId];
    } else {
      // Fallback: print only the most recent refund
      paymentQuery = `SELECT * FROM bill_payments WHERE bill_id = $1 AND is_refund = true ORDER BY created_at DESC LIMIT 1`;
      paymentParams = [referenceId];
    }

    const { rows: paymentRows } = await pool.query(paymentQuery, paymentParams);
    if (paymentRows.length === 0) {
      throw new Error(refundPaymentId
        ? `Refund payment ${refundPaymentId} not found for bill ${referenceId}`
        : `No refund payments found for bill ${referenceId}`);
    }

    const { rows: tenantRows } = await pool.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);
    const tenantName = tenantRows[0]?.name;

    const refunds: RefundPaymentData[] = paymentRows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      amount: r.amount as string,
      refundReason: r.refund_reason as string | null,
      paymentMethod: r.payment_method as string | null,
      createdAt: r.created_at as Date | null,
    }));

    const refundData: RefundReceiptData = {
      billRef: billRow.invoice_number || billRow.bill_number || billRow.id,
      tableNumber: billRow.table_number,
      totalBillAmount: billRow.total_amount,
      refunds,
      tenantName,
    };

    const cashierPrinter = printers.find(p => p.printerType === "CASHIER" && p.isDefault) ?? printers.find(p => p.printerType === "CASHIER");

    let htmlFallback: string | undefined;
    let escposData: Buffer | undefined;
    let targetPrinter: (typeof printers)[0] | undefined;

    if (!cashierPrinter) {
      // No CASHIER printer configured — force browser fallback
      htmlFallback = buildRefundReceiptHtml(refundData);
      results.htmlFallback = htmlFallback;
    } else if (cashierPrinter.connectionType === "BROWSER" || cashierPrinter.connectionType === "USB" || cashierPrinter.connectionType === "BLUETOOTH") {
      htmlFallback = buildRefundReceiptHtml(refundData);
      results.htmlFallback = htmlFallback;
      targetPrinter = cashierPrinter;
    } else {
      targetPrinter = cashierPrinter;
      try {
        escposData = buildRefundReceipt(refundData);
      } catch (_) {
        htmlFallback = buildRefundReceiptHtml(refundData);
        results.htmlFallback = htmlFallback;
      }
    }

    const jobId = await createPrintJobRecord({
      tenantId,
      outletId,
      printerId: targetPrinter?.id ?? null,
      type: jobType,
      referenceId,
      content: htmlFallback ?? null,
      contentFormat: htmlFallback ? "html" : "escpos",
      payload: { refundData },
      triggeredByName,
    });
    results.jobIds.push(jobId);

    if (escposData && targetPrinter) {
      sendToPrinter(targetPrinter, escposData, jobId).catch(err => {
        console.error(`[PrinterService] Refund receipt print failed for job ${jobId}:`, err);
      });
    }
  } else if (jobType === "label") {
    const { rows: orderRows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [referenceId]);
    if (orderRows.length === 0) return results;
    const orderRow = orderRows[0];

    const { rows: itemRows } = await pool.query(`SELECT * FROM order_items WHERE order_id = $1`, [referenceId]);

    const order: KOTOrder = {
      id: orderRow.id,
      orderNumber: orderRow.order_number,
      orderType: orderRow.order_type,
    };

    const items: KOTItem[] = itemRows.map((r: Record<string, unknown>) => ({
      name: r.name as string,
      quantity: r.quantity as number,
    }));

    const labelPrinter = printers.find(p => p.printerType === "LABEL");
    let targetPrinter = labelPrinter ?? printers[0];
    let htmlFallback: string | undefined;
    let escposData: Buffer | undefined;

    if (!targetPrinter || targetPrinter.connectionType === "BROWSER" || targetPrinter.connectionType === "USB") {
      htmlFallback = browserHandler.generateKotHtml(order, items);
      results.htmlFallback = htmlFallback;
    } else {
      try {
        escposData = buildLabel(order, items);
      } catch (_) {
        htmlFallback = browserHandler.generateKotHtml(order, items);
        results.htmlFallback = htmlFallback;
      }
    }

    const jobId = await createPrintJobRecord({
      tenantId, outletId,
      printerId: targetPrinter?.id ?? null,
      type: jobType,
      referenceId,
      content: htmlFallback ?? null,
      contentFormat: htmlFallback ? "html" : "escpos",
      payload: { order, items },
      triggeredByName,
      isReprint,
      reprintReason,
    });
    results.jobIds.push(jobId);

    if (escposData && targetPrinter) {
      sendToPrinter(targetPrinter, escposData, jobId).catch(err => {
        console.error(`[PrinterService] Label print failed for job ${jobId}:`, err);
      });
    }
  }

  return results;
}

export async function retryFailedJobs(outletId: string, tenantId: string): Promise<number> {
  const { rows: failedJobs } = await pool.query(
    `SELECT pj.*, p.ip_address, p.port, p.connection_type, p.printer_name, p.printer_type
     FROM print_jobs pj
     LEFT JOIN printers p ON p.id = pj.printer_id
     WHERE pj.tenant_id = $1
       AND (pj.outlet_id = $2 OR pj.outlet_id IS NULL)
       AND pj.status IN ('queued', 'failed')
       AND pj.attempts < pj.max_attempts`,
    [tenantId, outletId]
  );

  let retried = 0;
  for (const job of failedJobs) {
    try {
      if (job.connection_type === "NETWORK_IP" && job.ip_address) {
        const printer: Printer = {
          id: job.printer_id,
          tenantId,
          outletId,
          printerName: job.printer_name,
          printerType: job.printer_type,
          connectionType: job.connection_type,
          ipAddress: job.ip_address,
          port: job.port,
        };
        const data = job.content ? Buffer.from(job.content) : Buffer.from("");
        await sendToPrinter(printer, data, job.id);
        retried++;
      }
    } catch (_) {
    }
  }
  return retried;
}

export async function pingAllPrinters(tenantId: string, outletId?: string | null): Promise<Array<{ id: string; name: string; status: PrinterStatus }>> {
  const printers = await getPrintersByOutlet(tenantId, outletId);
  const results: Array<{ id: string; name: string; status: PrinterStatus }> = [];

  for (const printer of printers) {
    const status = await pingPrinter(printer);
    const previousStatus = printer.status;
    await pool.query(
      `UPDATE printers SET status = $1, last_ping_at = now() WHERE id = $2`,
      [status, printer.id]
    );
    if (status !== previousStatus && (printer.printerType === "KITCHEN" || printer.printerType === "CASHIER") && status === "offline") {
      emitToTenant(tenantId, "printer:status_changed", {
        printerId: printer.id,
        printerName: printer.printerName,
        status,
        alert: `Critical printer "${printer.printerName}" went offline`,
      });
    }
    results.push({ id: printer.id, name: printer.printerName, status });
  }

  return results;
}

const pingIntervals = new Map<string, ReturnType<typeof setInterval>>();
const retryIntervals = new Map<string, ReturnType<typeof setInterval>>();

export function startPrinterMonitor(tenantId: string, outletId: string): void {
  const key = `${tenantId}:${outletId}`;
  if (!pingIntervals.has(key)) {
    const interval = setInterval(() => {
      pingAllPrinters(tenantId, outletId).catch(err => {
        console.error(`[PrinterService] Ping monitor error for ${key}:`, err);
      });
    }, 2 * 60 * 1000);
    pingIntervals.set(key, interval);
  }

  if (!retryIntervals.has(key)) {
    const interval = setInterval(() => {
      retryFailedJobs(outletId, tenantId).catch(err => {
        console.error(`[PrinterService] Retry worker error for ${key}:`, err);
      });
    }, 30 * 1000);
    retryIntervals.set(key, interval);
  }
}

export async function sendTestPrint(printer: Printer): Promise<{ success: boolean; message: string; html?: string }> {
  const data = buildTestPage(printer);

  if (printer.connectionType === "BROWSER" || printer.connectionType === "USB" || printer.connectionType === "BLUETOOTH") {
    const html = `<!DOCTYPE html><html><head><style>body{font-family:monospace;width:80mm;}</style></head><body><pre>${Buffer.from(data).toString("utf8").replace(/[^\x20-\x7e\n]/g, "?")}</pre><script>window.print();</script></body></html>`;
    return { success: true, message: "Browser print HTML generated", html };
  }

  try {
    await networkHandler.send(printer, data);
    return { success: true, message: "Test page sent successfully" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Print failed: ${msg}` };
  }
}
