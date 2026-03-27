import net from "net";

const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private bytes: number[] = [];

  bold(): EscPosBuilder {
    this.bytes.push(ESC, 0x45, 0x01);
    return this;
  }

  boldOff(): EscPosBuilder {
    this.bytes.push(ESC, 0x45, 0x00);
    return this;
  }

  doubleWidth(): EscPosBuilder {
    this.bytes.push(ESC, 0x21, 0x20);
    return this;
  }

  doubleSize(): EscPosBuilder {
    this.bytes.push(ESC, 0x21, 0x30);
    return this;
  }

  normal(): EscPosBuilder {
    this.bytes.push(ESC, 0x21, 0x00);
    return this;
  }

  center(): EscPosBuilder {
    this.bytes.push(ESC, 0x61, 0x01);
    return this;
  }

  left(): EscPosBuilder {
    this.bytes.push(ESC, 0x61, 0x00);
    return this;
  }

  right(): EscPosBuilder {
    this.bytes.push(ESC, 0x61, 0x02);
    return this;
  }

  text(str: string): EscPosBuilder {
    for (let i = 0; i < str.length; i++) {
      this.bytes.push(str.charCodeAt(i) & 0xff);
    }
    return this;
  }

  newLine(count = 1): EscPosBuilder {
    for (let i = 0; i < count; i++) {
      this.bytes.push(0x0a);
    }
    return this;
  }

  separator(char = "-", width = 42): EscPosBuilder {
    return this.text(char.repeat(width)).newLine();
  }

  qrCode(data: string): EscPosBuilder {
    const size = 6;
    const dataLen = data.length + 3;
    const pL = dataLen & 0xff;
    const pH = (dataLen >> 8) & 0xff;
    this.bytes.push(
      GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30,
      GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30,
    );
    for (let i = 0; i < data.length; i++) {
      this.bytes.push(data.charCodeAt(i) & 0xff);
    }
    this.bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  cutPaper(): EscPosBuilder {
    this.bytes.push(GS, 0x56, 0x42, 0x00);
    return this;
  }

  openCashDrawer(): EscPosBuilder {
    this.bytes.push(ESC, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  build(): Buffer {
    return Buffer.from(this.bytes);
  }
}

export interface KOTItem {
  name: string;
  quantity: number;
  notes?: string | null;
  course?: string | null;
  isAddon?: boolean;
  modifiers?: Array<{ label?: string }>;
  allergyFlags?: string[];
}

export interface KOTOrder {
  id: string;
  orderNumber?: string | null;
  tableNumber?: number | null;
  orderType?: string | null;
  station?: string | null;
  kotSequence?: number;
  sentAt?: string;
  allergies?: string | null;
  vipNotes?: string | null;
  specialInstructions?: string | null;
  waiterName?: string | null;
}

export interface BillItem {
  name: string;
  quantity: number;
  price: string | number;
  notes?: string | null;
}

export interface JurisdictionMeta {
  taxInvoiceLabel: string;
  taxLabel: string;
  taxRegLabel: string;
  taxRegNumber?: string | null;
  splitTaxLabels?: { part1: string; part2: string } | null;
  requireTaxRegOnInvoice: boolean;
  tradeLicenseNumber?: string | null;
  tradeLicenseAuthority?: string | null;
  ccpaApplicable?: boolean;
  footerText?: string | null;
}

export interface BillData {
  billNumber?: string | null;
  invoiceNumber?: string | null;
  tableNumber?: number | null;
  waiterName?: string | null;
  subtotal: string | number;
  discountAmount?: string | number | null;
  serviceCharge?: string | number | null;
  taxAmount?: string | number | null;
  taxBreakdown?: Record<string, string> | null;
  tips?: string | number | null;
  packingCharge?: string | number | null;
  packingChargeLabel?: string | null;
  packingChargeTax?: string | number | null;
  showPackingChargeOnReceipt?: boolean;
  totalAmount: string | number;
  paymentMethod?: string | null;
  paidAt?: Date | string | null;
  covers?: number;
  jurisdictionMeta?: JurisdictionMeta | null;
}

export interface RefundPaymentData {
  id: string;
  amount: string | number;
  refundReason?: string | null;
  paymentMethod?: string | null;
  createdAt?: Date | string | null;
}

export interface PrinterInfo {
  printerName: string;
  ipAddress?: string | null;
  port?: number | null;
  connectionType: string;
  paperWidth?: string | null;
}

export interface PrintTemplate {
  headerLines?: string[];
  footerLines?: string[];
  showLogo?: boolean;
  showTaxBreakdown?: boolean;
  showItemNotes?: boolean;
  showQrCode?: boolean;
  qrCodeContent?: string | null;
  fontSize?: string;
}

function padRight(str: string, len: number): string {
  return str.substring(0, len).padEnd(len, " ");
}

function padLeft(str: string, len: number): string {
  return str.substring(0, len).padStart(len, " ");
}

function formatMoney(val: string | number | null | undefined): string {
  return Number(val ?? 0).toFixed(2);
}

export function buildKOT(
  order: KOTOrder,
  items: KOTItem[],
  modifications?: Record<string, { allergyFlags?: string[]; allergyDetails?: string; specialNotes?: string; removedIngredients?: string[] }>,
): Buffer {
  const b = new EscPosBuilder();
  const cpl = 42;
  const orderRef = order.orderNumber || order.id.slice(-8).toUpperCase();
  const kotNum = order.kotSequence ? `KOT #${order.kotSequence}` : "KOT";
  const isRush = order.vipNotes?.toLowerCase().includes("rush") || false;
  const isVIP = Boolean(order.vipNotes);

  b.center();
  if (isVIP || isRush) {
    b.doubleSize().bold().text(isRush ? "** RUSH **" : "** VIP **").normal().newLine();
  }
  b.doubleWidth().bold().text(kotNum).normal().newLine();
  b.text(`Order: ${orderRef}`).newLine();
  if (order.tableNumber) {
    b.bold().text(`Table: ${order.tableNumber}`).boldOff().newLine();
  }
  if (order.orderType && order.orderType !== "dine_in") {
    b.text(order.orderType.toUpperCase()).newLine();
  }
  if (order.station) {
    b.text(`Station: ${order.station.toUpperCase()}`).newLine();
  }
  const sentTime = order.sentAt ? new Date(order.sentAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  b.text(`Time: ${sentTime}`).newLine();
  if (order.waiterName) {
    b.text(`Waiter: ${order.waiterName}`).newLine();
  }
  b.left().separator("-", cpl);

  if (order.allergies) {
    b.bold().text("ALLERGY ALERT: ").boldOff().text(order.allergies).newLine();
    b.separator("=", cpl);
  }
  if (order.vipNotes) {
    b.bold().text("VIP: ").boldOff().text(order.vipNotes).newLine();
    b.separator("-", cpl);
  }
  if (order.specialInstructions) {
    b.text(`Note: ${order.specialInstructions}`).newLine();
    b.separator("-", cpl);
  }

  for (const item of items) {
    const qtyStr = `${item.quantity}x`;
    const nameArea = cpl - qtyStr.length - 1;
    b.bold().text(`${qtyStr} ${padRight(item.name, nameArea)}`).boldOff().newLine();
    if (item.isAddon) b.text("  [ADD-ON]").newLine();
    if (item.modifiers && item.modifiers.length > 0) {
      const modStr = item.modifiers.map(m => m.label).filter(Boolean).join(", ");
      if (modStr) b.text(`  Mods: ${modStr}`).newLine();
    }
    if (item.notes) b.text(`  Note: ${item.notes}`).newLine();
    if (item.allergyFlags && item.allergyFlags.length > 0) {
      b.bold().text(`  ALLERGY: ${item.allergyFlags.join(", ")}`).boldOff().newLine();
    }
    if (modifications) {
      const mod = modifications[item.name];
      if (mod) {
        if (mod.allergyFlags && mod.allergyFlags.length > 0) {
          b.bold().text(`  ALLERGY: ${mod.allergyFlags.join(", ")}`).boldOff().newLine();
        }
        if (mod.allergyDetails) b.text(`  ${mod.allergyDetails}`).newLine();
        if (mod.removedIngredients && mod.removedIngredients.length > 0) {
          b.text(`  Remove: ${mod.removedIngredients.join(", ")}`).newLine();
        }
        if (mod.specialNotes) b.text(`  ${mod.specialNotes}`).newLine();
      }
    }
    if (item.course) b.text(`  [${item.course.toUpperCase()}]`).newLine();
  }

  b.separator("-", cpl).newLine(3).cutPaper();
  return b.build();
}

export function buildBill(
  bill: BillData,
  order: KOTOrder,
  items: BillItem[],
  template?: PrintTemplate,
  tenantName?: string,
  payments?: RefundPaymentData[],
): Buffer {
  const b = new EscPosBuilder();
  const cpl = 42;

  b.center();
  if (template?.headerLines && template.headerLines.length > 0) {
    for (const line of template.headerLines) {
      b.text(line).newLine();
    }
  } else {
    b.doubleWidth().bold().text(tenantName || "RESTAURANT").normal().newLine();
  }
  b.separator("=", cpl);

  const billRef = bill.invoiceNumber || bill.billNumber || "N/A";
  b.text(`Invoice: ${billRef}`).newLine();
  if (order.tableNumber) b.text(`Table: ${order.tableNumber}`).newLine();
  if (bill.waiterName) b.text(`Served by: ${bill.waiterName}`).newLine();
  if (bill.covers) b.text(`Covers: ${bill.covers}`).newLine();
  const now = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  b.text(now).newLine();
  b.left().separator("-", cpl);

  for (const item of items) {
    const priceStr = formatMoney(item.price);
    const lineTotal = (Number(item.price) * item.quantity).toFixed(2);
    const namePart = `${item.quantity}x ${item.name}`;
    const space = cpl - namePart.length - lineTotal.length;
    b.text(namePart + " ".repeat(Math.max(1, space)) + lineTotal).newLine();
    if (template?.showItemNotes && item.notes) b.text(`   ${item.notes}`).newLine();
  }

  b.separator("-", cpl);
  const colW = cpl - 12;
  b.text(padRight("Subtotal", colW) + padLeft(formatMoney(bill.subtotal), 12)).newLine();
  if (Number(bill.discountAmount || 0) > 0) {
    b.text(padRight("Discount", colW) + padLeft(`-${formatMoney(bill.discountAmount)}`, 12)).newLine();
  }
  if (Number(bill.serviceCharge || 0) > 0) {
    b.text(padRight("Service Charge", colW) + padLeft(formatMoney(bill.serviceCharge), 12)).newLine();
  }
  if (Number(bill.taxAmount || 0) > 0) {
    if (template?.showTaxBreakdown && bill.taxBreakdown) {
      for (const [label, amt] of Object.entries(bill.taxBreakdown)) {
        b.text(padRight(label, colW) + padLeft(amt, 12)).newLine();
      }
    } else {
      b.text(padRight("Tax", colW) + padLeft(formatMoney(bill.taxAmount), 12)).newLine();
    }
  }
  if (Number(bill.tips || 0) > 0) {
    b.text(padRight("Tips", colW) + padLeft(formatMoney(bill.tips), 12)).newLine();
  }
  if (Number(bill.packingCharge || 0) > 0 && bill.showPackingChargeOnReceipt !== false) {
    b.text(padRight(bill.packingChargeLabel || 'Packing Charge', colW) + padLeft(formatMoney(bill.packingCharge), 12)).newLine();
  }
  b.separator("=", cpl);
  b.bold().doubleWidth().center().text(`TOTAL: ${formatMoney(bill.totalAmount)}`).normal().newLine();
  b.left();
  if (bill.paymentMethod) {
    b.text(`Payment: ${bill.paymentMethod.toUpperCase()}`).newLine();
  }

  const refunds = payments?.filter(p => Number(p.amount) < 0) ?? [];
  if (refunds.length > 0) {
    const totalRefunded = refunds.reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
    const netSettled = Number(bill.totalAmount) - totalRefunded;
    b.separator("-", cpl);
    b.bold().center().text("REFUND ISSUED").boldOff().newLine();
    b.separator("-", cpl);
    for (const r of refunds) {
      const refundDate = r.createdAt
        ? new Date(r.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "";
      b.left();
      b.text(padRight("Refund Amount:", colW) + padLeft(`-${formatMoney(Math.abs(Number(r.amount)))}`, 12)).newLine();
      if (r.refundReason) {
        const cleanReason = r.refundReason.split(" | items:")[0];
        b.text(`Reason: ${cleanReason}`).newLine();
      }
      if (refundDate) b.text(`Refunded on: ${refundDate}`).newLine();
    }
    b.separator("-", cpl);
    b.text(padRight("Net Settled:", colW) + padLeft(formatMoney(netSettled), 12)).newLine();
    b.separator("-", cpl);
  }

  if (template?.footerLines && template.footerLines.length > 0) {
    b.center();
    for (const line of template.footerLines) {
      b.text(line).newLine();
    }
  } else {
    b.center().text("Thank you for dining with us!").newLine();
  }

  if (template?.showQrCode && template.qrCodeContent) {
    b.center().qrCode(template.qrCodeContent).newLine();
  }

  b.newLine(3).cutPaper();
  return b.build();
}

export function buildLabel(order: KOTOrder, items: KOTItem[], customerName?: string): Buffer {
  const b = new EscPosBuilder();
  const cpl = 32;
  const orderRef = order.orderNumber || order.id.slice(-8).toUpperCase();

  b.center().doubleWidth().bold().text(orderRef).normal().newLine();
  if (customerName) b.text(customerName).newLine();
  if (order.orderType) b.text(order.orderType.toUpperCase()).newLine();
  b.text(new Date().toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })).newLine();
  b.left().separator("-", cpl);
  for (const item of items) {
    b.text(`${item.quantity}x ${item.name}`).newLine();
  }
  b.separator("-", cpl).newLine(2).cutPaper();
  return b.build();
}

export function buildTestPage(printer: PrinterInfo): Buffer {
  const b = new EscPosBuilder();
  const cpl = 42;
  b.center().doubleSize().bold().text("TEST PAGE").normal().newLine();
  b.separator("=", cpl);
  b.text(`Printer: ${printer.printerName}`).newLine();
  b.text(`Type: ${printer.connectionType}`).newLine();
  if (printer.ipAddress) b.text(`IP: ${printer.ipAddress}:${printer.port || 9100}`).newLine();
  b.text(`Width: ${printer.paperWidth || "80mm"}`).newLine();
  b.text(new Date().toLocaleString()).newLine();
  b.separator("=", cpl);
  b.center().text("Printer is working correctly").newLine();
  b.newLine(3).cutPaper();
  return b.build();
}

export function buildBillHtml(
  bill: BillData,
  order: KOTOrder,
  items: BillItem[],
  template?: PrintTemplate,
  tenantName?: string,
  payments?: RefundPaymentData[],
): string {
  const billRef = bill.invoiceNumber || bill.billNumber || "N/A";
  const now = new Date().toLocaleString();

  const headerHtml = (template?.headerLines && template.headerLines.length > 0)
    ? template.headerLines.map(l => `<div>${escHtml(l)}</div>`).join("")
    : `<div class="title">${escHtml(tenantName || "Restaurant")}</div>`;

  const footerHtml = (template?.footerLines && template.footerLines.length > 0)
    ? template.footerLines.map(l => `<div>${escHtml(l)}</div>`).join("")
    : "<div>Thank you for dining with us!</div>";

  const itemRows = items.map(item => {
    const lineTotal = (Number(item.price) * item.quantity).toFixed(2);
    return `<tr>
      <td>${item.quantity}x ${escHtml(item.name)}</td>
      <td class="right">${lineTotal}</td>
    </tr>`;
  }).join("");

  const jMeta = bill.jurisdictionMeta;
  const invoiceTitle = jMeta?.taxInvoiceLabel || "Invoice";
  const taxLabel = jMeta?.taxLabel || "Tax";
  const taxRegLabel = jMeta?.taxRegLabel || "Tax Reg";

  let taxBreakdownHtml: string;
  if (template?.showTaxBreakdown && bill.taxBreakdown) {
    taxBreakdownHtml = Object.entries(bill.taxBreakdown).map(([k, v]) => `<tr><td>${escHtml(k)}</td><td class="right">${v}</td></tr>`).join("");
  } else if (jMeta?.splitTaxLabels && Number(bill.taxAmount || 0) > 0) {
    const half = (Number(bill.taxAmount) / 2).toFixed(2);
    taxBreakdownHtml = `<tr><td>${escHtml(jMeta.splitTaxLabels.part1)}</td><td class="right">${half}</td></tr>
    <tr><td>${escHtml(jMeta.splitTaxLabels.part2)}</td><td class="right">${half}</td></tr>`;
  } else {
    taxBreakdownHtml = `<tr><td>${escHtml(taxLabel)}</td><td class="right">${formatMoney(bill.taxAmount)}</td></tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; margin: 0 auto; }
  .center { text-align: center; }
  .right { text-align: right; }
  .title { font-size: 18px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; }
  .total-row td { font-size: 16px; font-weight: bold; border-top: 2px solid #000; padding-top: 4px; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  @media print {
    body { width: 80mm; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
<div class="center">
  ${jMeta ? `<div style="font-size:10px;">${escHtml(invoiceTitle)}</div>` : ""}
  ${headerHtml}
  ${jMeta?.requireTaxRegOnInvoice && jMeta.taxRegNumber ? `<div style="font-size:10px;">${escHtml(taxRegLabel)}: ${escHtml(jMeta.taxRegNumber)}</div>` : ""}
  ${jMeta?.tradeLicenseNumber ? `<div style="font-size:10px;">Trade Lic: ${escHtml(jMeta.tradeLicenseNumber)}${jMeta.tradeLicenseAuthority ? ` (${escHtml(jMeta.tradeLicenseAuthority)})` : ""}</div>` : ""}
</div>
<div class="sep"></div>
<div>Ref: ${escHtml(billRef)}</div>
${order.tableNumber ? `<div>Table: ${order.tableNumber}</div>` : ""}
${bill.waiterName ? `<div>Served by: ${escHtml(bill.waiterName)}</div>` : ""}
<div>${escHtml(now)}</div>
<div class="sep"></div>
<table>
  <tbody>${itemRows}</tbody>
</table>
<div class="sep"></div>
<table>
  <tr><td>Subtotal</td><td class="right">${formatMoney(bill.subtotal)}</td></tr>
  ${Number(bill.discountAmount || 0) > 0 ? `<tr><td>Discount</td><td class="right">-${formatMoney(bill.discountAmount)}</td></tr>` : ""}
  ${Number(bill.serviceCharge || 0) > 0 ? `<tr><td>Service Charge</td><td class="right">${formatMoney(bill.serviceCharge)}</td></tr>` : ""}
  ${Number(bill.taxAmount || 0) > 0 ? taxBreakdownHtml : ""}
  ${Number(bill.tips || 0) > 0 ? `<tr><td>Tips</td><td class="right">${formatMoney(bill.tips)}</td></tr>` : ""}
  ${Number(bill.packingCharge || 0) > 0 && bill.showPackingChargeOnReceipt !== false ? `<tr><td>${escHtml(bill.packingChargeLabel || 'Packing Charge')}</td><td class="right">${formatMoney(bill.packingCharge)}</td></tr>` : ""}
  <tr class="total-row"><td>TOTAL</td><td class="right">${formatMoney(bill.totalAmount)}</td></tr>
</table>
${bill.paymentMethod ? `<div>Payment: ${escHtml(bill.paymentMethod.toUpperCase())}</div>` : ""}
${(() => {
  const refunds = payments?.filter(p => Number(p.amount) < 0) ?? [];
  if (refunds.length === 0) return "";
  const totalRefunded = refunds.reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
  const netSettled = Number(bill.totalAmount) - totalRefunded;
  return `<div class="sep"></div>
<div class="center" style="font-weight:bold;">REFUND ISSUED</div>
<div class="sep"></div>
<table>${refunds.map(r => {
  const cleanReason = (r.refundReason || "").split(" | items:")[0];
  const refundDate = r.createdAt ? new Date(r.createdAt as string).toLocaleString() : "";
  return `<tr><td>Refund Amount</td><td class="right">-${formatMoney(Math.abs(Number(r.amount)))}</td></tr>
${cleanReason ? `<tr><td colspan="2">Reason: ${escHtml(cleanReason)}</td></tr>` : ""}
${refundDate ? `<tr><td colspan="2" style="font-size:10px;">${escHtml(refundDate)}</td></tr>` : ""}`;
}).join("")}
<tr style="font-weight:bold;border-top:1px solid #000;"><td>Net Settled</td><td class="right">${formatMoney(netSettled)}</td></tr>
</table>`;
})()}
<div class="sep"></div>
<div class="center">${footerHtml}</div>
${template?.showQrCode && template.qrCodeContent ? `<div class="center" style="margin-top:8px;">[QR: ${escHtml(template.qrCodeContent)}]</div>` : ""}
<script>window.onload = function() { window.print(); setTimeout(window.close, 500); };</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildKOTHtml(order: KOTOrder, items: KOTItem[]): string {
  const orderRef = order.orderNumber || order.id.slice(-8).toUpperCase();
  const kotNum = order.kotSequence ? `KOT #${order.kotSequence}` : "KOT";
  const isVIP = Boolean(order.vipNotes);
  const sentTime = order.sentAt ? new Date(order.sentAt).toLocaleTimeString() : new Date().toLocaleTimeString();

  const itemRows = items.map(item => `
    <tr>
      <td class="qty">${item.quantity}x</td>
      <td>
        <strong>${escHtml(item.name)}</strong>
        ${item.notes ? `<div class="note">Note: ${escHtml(item.notes)}</div>` : ""}
        ${item.isAddon ? '<div class="addon">[ADD-ON]</div>' : ""}
        ${item.allergyFlags && item.allergyFlags.length > 0 ? `<div class="allergy">ALLERGY: ${escHtml(item.allergyFlags.join(", "))}</div>` : ""}
        ${item.course ? `<div class="course">[${escHtml(item.course.toUpperCase())}]</div>` : ""}
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 14px; width: 80mm; margin: 0 auto; }
  .center { text-align: center; }
  .header { background: #000; color: #fff; padding: 8px; text-align: center; }
  .vip-header { background: #b8860b; color: #fff; padding: 4px; text-align: center; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 3px 2px; vertical-align: top; }
  td.qty { width: 28px; font-weight: bold; }
  .note { font-size: 11px; color: #555; }
  .addon { font-size: 11px; color: #0066cc; }
  .allergy { font-size: 11px; color: #cc0000; font-weight: bold; }
  .course { font-size: 11px; color: #666; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  .info { font-size: 12px; }
  @media print { body { width: 80mm; } @page { margin: 0; size: 80mm auto; } }
</style>
</head>
<body>
${isVIP ? '<div class="vip-header">⭐ VIP ORDER ⭐</div>' : ""}
<div class="header">
  <div style="font-size:20px;font-weight:bold">${escHtml(kotNum)}</div>
  <div>${escHtml(orderRef)}</div>
</div>
<div class="info">
  ${order.tableNumber ? `<div>Table: <strong>${order.tableNumber}</strong></div>` : ""}
  ${order.orderType && order.orderType !== "dine_in" ? `<div>Type: ${escHtml(order.orderType.toUpperCase())}</div>` : ""}
  ${order.station ? `<div>Station: ${escHtml(order.station.toUpperCase())}</div>` : ""}
  <div>Time: ${escHtml(sentTime)}</div>
  ${order.waiterName ? `<div>Waiter: ${escHtml(order.waiterName)}</div>` : ""}
  ${order.allergies ? `<div class="allergy">⚠ ALLERGY: ${escHtml(order.allergies)}</div>` : ""}
  ${order.vipNotes ? `<div><strong>VIP: ${escHtml(order.vipNotes)}</strong></div>` : ""}
  ${order.specialInstructions ? `<div>Note: ${escHtml(order.specialInstructions)}</div>` : ""}
</div>
<div class="sep"></div>
<table><tbody>${itemRows}</tbody></table>
<div class="sep"></div>
<script>window.onload = function() { window.print(); setTimeout(window.close, 500); };</script>
</body>
</html>`;
}

export interface RefundReceiptData {
  billRef: string;
  tableNumber?: number | null;
  totalBillAmount: string | number;
  refunds: RefundPaymentData[];
  tenantName?: string;
  refundedAt?: Date | string | null;
}

export function buildRefundReceipt(data: RefundReceiptData, template?: PrintTemplate): Buffer {
  const b = new EscPosBuilder();
  const cpl = 42;
  const colW = 28;

  b.center();
  if (template?.headerLines && template.headerLines.length > 0) {
    for (const line of template.headerLines) b.text(line).newLine();
  } else {
    b.bold().text(data.tenantName || "Restaurant").boldOff().newLine();
  }
  b.text("REFUND RECEIPT").newLine();
  b.separator("=", cpl);
  b.left();
  b.text(`Bill Ref: ${data.billRef}`).newLine();
  if (data.tableNumber) b.text(`Table: ${data.tableNumber}`).newLine();
  const printTime = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  b.text(`Date: ${printTime}`).newLine();
  b.separator("-", cpl);
  b.text(padRight("Original Total:", colW) + padLeft(formatMoney(data.totalBillAmount), 12)).newLine();
  b.separator("-", cpl);

  let cumulativeRefund = 0;
  for (const r of data.refunds) {
    const refundAmt = Math.abs(Number(r.amount));
    cumulativeRefund += refundAmt;
    b.bold().text(`Refund: -${formatMoney(refundAmt)}`).boldOff().newLine();
    if (r.paymentMethod) b.text(`  Method: ${r.paymentMethod.toUpperCase()}`).newLine();
    if (r.refundReason) {
      const cleanReason = r.refundReason.split(" | items:")[0];
      b.text(`  Reason: ${cleanReason}`).newLine();
    }
    if (r.createdAt) {
      const rd = new Date(r.createdAt as string).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      b.text(`  Date: ${rd}`).newLine();
    }
  }
  b.separator("-", cpl);
  b.text(padRight("Total Refunded:", colW) + padLeft(formatMoney(cumulativeRefund), 12)).newLine();
  const netSettled = Number(data.totalBillAmount) - cumulativeRefund;
  b.bold().text(padRight("Net Settled:", colW) + padLeft(formatMoney(netSettled), 12)).boldOff().newLine();
  b.separator("=", cpl);

  if (template?.footerLines && template.footerLines.length > 0) {
    b.center();
    for (const line of template.footerLines) b.text(line).newLine();
  } else {
    b.center().text("We apologize for the inconvenience.").newLine();
  }
  b.newLine(3).cutPaper();
  return b.build();
}

export function buildRefundReceiptHtml(data: RefundReceiptData, template?: PrintTemplate): string {
  const billRef = data.billRef;
  const printTime = new Date().toLocaleString();
  const headerHtml = (template?.headerLines && template.headerLines.length > 0)
    ? template.headerLines.map(l => `<div>${escHtml(l)}</div>`).join("")
    : `<div class="title">${escHtml(data.tenantName || "Restaurant")}</div>`;
  const footerHtml = (template?.footerLines && template.footerLines.length > 0)
    ? template.footerLines.map(l => `<div>${escHtml(l)}</div>`).join("")
    : "<div>We apologize for the inconvenience.</div>";

  let cumulativeRefund = 0;
  const refundRows = data.refunds.map(r => {
    const refundAmt = Math.abs(Number(r.amount));
    cumulativeRefund += refundAmt;
    const cleanReason = (r.refundReason || "").split(" | items:")[0];
    const refundDate = r.createdAt ? new Date(r.createdAt as string).toLocaleString() : "";
    return `<tr><td><strong>Refund</strong></td><td class="right">-${formatMoney(refundAmt)}</td></tr>
${r.paymentMethod ? `<tr><td style="padding-left:8px;">Method</td><td class="right">${escHtml(r.paymentMethod.toUpperCase())}</td></tr>` : ""}
${cleanReason ? `<tr><td colspan="2" style="padding-left:8px;">Reason: ${escHtml(cleanReason)}</td></tr>` : ""}
${refundDate ? `<tr><td colspan="2" style="padding-left:8px;font-size:10px;">${escHtml(refundDate)}</td></tr>` : ""}`;
  }).join("");

  const netSettled = Number(data.totalBillAmount) - cumulativeRefund;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; margin: 0 auto; }
  .center { text-align: center; }
  .right { text-align: right; }
  .title { font-size: 18px; font-weight: bold; }
  .refund-header { font-size: 16px; font-weight: bold; color: #c00; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; }
  .total-row td { font-size: 14px; font-weight: bold; border-top: 2px solid #000; padding-top: 4px; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  @media print { body { width: 80mm; } @page { margin: 0; size: 80mm auto; } }
</style>
</head>
<body>
<div class="center">${headerHtml}</div>
<div class="center refund-header">REFUND RECEIPT</div>
<div class="sep"></div>
<div>Bill Ref: ${escHtml(billRef)}</div>
${data.tableNumber ? `<div>Table: ${data.tableNumber}</div>` : ""}
<div>${escHtml(printTime)}</div>
<div class="sep"></div>
<table>
  <tr><td>Original Total</td><td class="right">${formatMoney(data.totalBillAmount)}</td></tr>
</table>
<div class="sep"></div>
<table>${refundRows}</table>
<div class="sep"></div>
<table>
  <tr><td>Total Refunded</td><td class="right">-${formatMoney(cumulativeRefund)}</td></tr>
  <tr class="total-row"><td>Net Settled</td><td class="right">${formatMoney(netSettled)}</td></tr>
</table>
<div class="sep"></div>
<div class="center">${footerHtml}</div>
<script>window.onload = function() { window.print(); setTimeout(window.close, 500); };</script>
</body>
</html>`;
}

// ESC/POS: Open cash drawer on pin 2 (standard)
const DRAWER_OPEN_BYTES = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

/**
 * Send ESC/POS cash drawer open command over TCP to a network printer.
 * Resolves when complete or on error/timeout (best-effort, never rejects).
 */
export function openCashDrawerViaPrinter(ip: string, port = 9100): Promise<void> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const cleanup = () => { try { socket.destroy(); } catch {} resolve(); };
    socket.setTimeout(3000);
    socket.on("error", cleanup);
    socket.on("timeout", cleanup);
    socket.connect(port, ip, () => {
      socket.write(DRAWER_OPEN_BYTES, () => cleanup());
    });
  });
}
