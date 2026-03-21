export interface KotPrintOptions {
  restaurantName: string;
  kotNumber?: string;
  orderId: string;
  orderType?: string | null;
  tableNumber?: number | null;
  station?: string | null;
  sentAt: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string | null;
    course?: string | null;
  }>;
}

export function renderKotHtml(opts: KotPrintOptions): string {
  const { restaurantName, kotNumber, orderId, orderType, tableNumber, station, sentAt, items } = opts;
  const date = new Date(sentAt);
  const dateStr = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const orderRef = orderId.slice(-6).toUpperCase();

  const courseOrder = ["starter", "Starter", "main", "Main", "dessert", "Dessert", "beverage", "Beverage"];
  const groupedByCourse: Record<string, typeof items> = {};
  for (const item of items) {
    const course = item.course || "Main";
    if (!groupedByCourse[course]) groupedByCourse[course] = [];
    groupedByCourse[course].push(item);
  }
  const sortedCourses = Object.keys(groupedByCourse).sort(
    (a, b) =>
      (courseOrder.indexOf(a) === -1 ? 99 : courseOrder.indexOf(a)) -
      (courseOrder.indexOf(b) === -1 ? 99 : courseOrder.indexOf(b))
  );

  const orderLabel =
    orderType === "dine_in" && tableNumber
      ? `Table #${tableNumber}`
      : orderType === "takeaway"
      ? "Takeaway"
      : orderType === "delivery"
      ? "Delivery"
      : "Order";

  const itemsHtml = sortedCourses
    .map((course) => {
      const courseHeader =
        sortedCourses.length > 1
          ? `<div style="font-weight:bold;text-transform:uppercase;font-size:11px;margin-bottom:2px;border-bottom:1px solid #000;">-- ${course} --</div>`
          : "";
      const itemsInCourse = groupedByCourse[course]
        .map(
          (item) => `
            <div style="margin-bottom:4px;">
              <div style="display:flex;justify-content:space-between;">
                <span style="font-weight:bold;font-size:14px;">${item.name}</span>
                <span style="font-weight:bold;font-size:14px;">x${item.quantity}</span>
              </div>
              ${item.notes ? `<div style="font-size:11px;padding-left:8px;font-style:italic;">* ${item.notes}</div>` : ""}
            </div>
          `
        )
        .join("");
      return courseHeader + itemsInCourse;
    })
    .join("");

  const totalItems = items.reduce((s, i) => s + (i.quantity || 1), 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>KOT - ${orderLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 302px;
    max-width: 302px;
    padding: 8px;
    background: white;
    color: black;
    line-height: 1.5;
  }
  @media print {
    body { width: 100%; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
  <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:6px;">
    <div style="font-weight:bold;font-size:16px;letter-spacing:1px;">${restaurantName.toUpperCase()}</div>
    <div style="font-size:11px;margin-top:2px;">*** KITCHEN ORDER TICKET ***</div>
    ${station ? `<div style="font-size:11px;font-weight:bold;">STATION: ${station.toUpperCase()}</div>` : ""}
  </div>
  <div style="border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
    <div style="display:flex;justify-content:space-between;">
      <span style="font-weight:bold;">KOT #${kotNumber || orderRef}</span>
      <span>${dateStr}</span>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <span style="font-weight:bold;">${orderLabel}</span>
      <span>${timeStr}</span>
    </div>
    <div style="font-size:11px;">Ref: #${orderRef}</div>
  </div>
  <div style="margin-bottom:6px;">
    ${itemsHtml}
  </div>
  <div style="border-top:2px dashed #000;padding-top:6px;text-align:center;font-size:11px;">
    <div>Total Items: <strong>${totalItems}</strong></div>
    <div style="margin-top:4px;">*** END OF KOT ***</div>
  </div>
</body>
</html>`;
}

export interface BillPrintOptions {
  restaurantName: string;
  restaurantAddress?: string;
  restaurantGstin?: string;
  billNumber: string;
  invoiceNumber?: string | null;
  orderId: string;
  orderType?: string | null;
  tableNumber?: number | null;
  waiterName?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    notes?: string | null;
    hsnCode?: string | null;
  }>;
  subtotal: number;
  discountAmount?: number;
  discountReason?: string | null;
  serviceCharge?: number;
  taxAmount?: number;
  taxType?: string;
  taxRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  tips?: number;
  totalAmount: number;
  currency?: string;
  paymentMethod?: string;
  paidAt?: string | null;
  customerName?: string | null;
  customerGstin?: string | null;
  loyaltyPointsEarned?: number;
  digitalReceiptUrl?: string | null;
}

export function renderBillHtml(opts: BillPrintOptions): string {
  const {
    restaurantName, restaurantAddress, restaurantGstin,
    billNumber, invoiceNumber, orderType, tableNumber, waiterName,
    items, subtotal, discountAmount = 0, discountReason,
    serviceCharge = 0, taxAmount = 0, taxType, taxRate,
    cgstAmount, sgstAmount, tips = 0, totalAmount,
    currency = "₹", paymentMethod, paidAt,
    customerName, customerGstin, loyaltyPointsEarned, digitalReceiptUrl,
  } = opts;

  const now = paidAt ? new Date(paidAt) : new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const fmt = (n: number) => `${currency}${n.toFixed(2)}`;

  const orderLabel =
    orderType === "dine_in" && tableNumber
      ? `Table #${tableNumber}`
      : orderType === "takeaway"
      ? "Takeaway"
      : orderType === "delivery"
      ? "Delivery"
      : "Order";

  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td style="padding:2px 0;">${item.name}${item.notes ? ` <small><em>(${item.notes})</em></small>` : ""}${item.hsnCode ? `<br/><small style="color:#666;">HSN: ${item.hsnCode}</small>` : ""}</td>
          <td style="text-align:center;padding:2px 4px;">${item.quantity}</td>
          <td style="text-align:right;padding:2px 0;">${fmt(item.price)}</td>
          <td style="text-align:right;padding:2px 0;">${fmt(item.price * item.quantity)}</td>
        </tr>
      `
    )
    .join("");

  const taxRows =
    taxType === "gst" && (cgstAmount != null || sgstAmount != null)
      ? `
        <tr>
          <td colspan="3">CGST${taxRate ? ` (${(taxRate / 2).toFixed(1)}%)` : ""}</td>
          <td style="text-align:right;">${fmt(cgstAmount || 0)}</td>
        </tr>
        <tr>
          <td colspan="3">SGST${taxRate ? ` (${(taxRate / 2).toFixed(1)}%)` : ""}</td>
          <td style="text-align:right;">${fmt(sgstAmount || 0)}</td>
        </tr>
      `
      : taxAmount > 0
      ? `
        <tr>
          <td colspan="3">${taxType?.toUpperCase() || "Tax"}${taxRate ? ` (${taxRate}%)` : ""}</td>
          <td style="text-align:right;">${fmt(taxAmount)}</td>
        </tr>
      `
      : "";

  const qrSection = digitalReceiptUrl
    ? `<div style="text-align:center;margin-top:6px;font-size:10px;">
        <div>Scan for digital receipt:</div>
        <div style="font-family:monospace;font-size:9px;word-break:break-all;">${digitalReceiptUrl}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Bill - ${billNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 302px;
    max-width: 302px;
    padding: 8px;
    background: white;
    color: black;
    line-height: 1.5;
  }
  table { width: 100%; border-collapse: collapse; }
  th { font-weight: bold; border-bottom: 1px dashed #000; padding: 2px 0; font-size: 11px; }
  .dashed { border-top: 1px dashed #000; margin: 4px 0; }
  @media print {
    body { width: 100%; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
  <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:6px;">
    <div style="font-weight:bold;font-size:16px;letter-spacing:1px;">${restaurantName.toUpperCase()}</div>
    ${restaurantAddress ? `<div style="font-size:10px;">${restaurantAddress}</div>` : ""}
    ${restaurantGstin ? `<div style="font-size:10px;">GSTIN: ${restaurantGstin}</div>` : ""}
    <div style="font-size:11px;">${dateStr} &nbsp; ${timeStr}</div>
  </div>

  <div style="margin-bottom:6px;font-size:11px;">
    <div style="display:flex;justify-content:space-between;">
      <span><strong>Bill: ${billNumber}</strong></span>
      <span>${orderLabel}</span>
    </div>
    ${invoiceNumber ? `<div>Invoice: ${invoiceNumber}</div>` : ""}
    ${waiterName ? `<div>Served by: ${waiterName}</div>` : ""}
    ${customerName ? `<div>Customer: ${customerName}</div>` : ""}
    ${customerGstin ? `<div>Cust. GSTIN: ${customerGstin}</div>` : ""}
  </div>

  <table>
    <tr>
      <th style="text-align:left;">Item</th>
      <th style="text-align:center;">Qty</th>
      <th style="text-align:right;">Rate</th>
      <th style="text-align:right;">Amt</th>
    </tr>
    ${itemsHtml}
  </table>

  <div class="dashed"></div>

  <table>
    <tr>
      <td colspan="3">Subtotal</td>
      <td style="text-align:right;">${fmt(subtotal)}</td>
    </tr>
    ${discountAmount > 0 ? `
    <tr>
      <td colspan="3">Discount${discountReason ? ` (${discountReason})` : ""}</td>
      <td style="text-align:right;">-${fmt(discountAmount)}</td>
    </tr>
    ` : ""}
    ${serviceCharge > 0 ? `
    <tr>
      <td colspan="3">Service Charge</td>
      <td style="text-align:right;">${fmt(serviceCharge)}</td>
    </tr>
    ` : ""}
    ${taxRows}
    ${tips > 0 ? `
    <tr>
      <td colspan="3">Tips</td>
      <td style="text-align:right;">${fmt(tips)}</td>
    </tr>
    ` : ""}
  </table>

  <div class="dashed"></div>

  <table>
    <tr>
      <td colspan="3" style="font-weight:bold;font-size:14px;">TOTAL</td>
      <td style="text-align:right;font-weight:bold;font-size:14px;">${fmt(totalAmount)}</td>
    </tr>
    ${paymentMethod ? `
    <tr>
      <td colspan="3">Paid via</td>
      <td style="text-align:right;">${paymentMethod}</td>
    </tr>
    ` : ""}
  </table>

  ${loyaltyPointsEarned ? `<div class="dashed"></div><div style="text-align:center;font-size:11px;">Loyalty Points Earned: +${loyaltyPointsEarned}</div>` : ""}

  ${qrSection}

  <div class="dashed"></div>
  <div style="text-align:center;font-size:11px;">
    <div>Thank you for dining with us!</div>
    <div>*** END OF BILL ***</div>
  </div>
</body>
</html>`;
}

/**
 * Attempt to dispatch a print job to the station's network printer URL.
 * Falls back to browser popup print on failure or if no URL is configured.
 * Returns true if network dispatch succeeded, false if browser fallback was used.
 */
export async function dispatchPrint(
  html: string,
  printerUrl?: string | null,
  onSuccess?: () => void
): Promise<boolean> {
  if (printerUrl) {
    try {
      const res = await fetch(printerUrl, {
        method: "POST",
        headers: { "Content-Type": "text/html" },
        body: html,
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        onSuccess?.();
        return true;
      }
    } catch (_) {
    }
  }
  printHtmlInPopup(html, onSuccess);
  return false;
}

export function printHtmlInPopup(html: string, onAfterPrint?: () => void): void {
  const win = window.open("", "_blank", "width=420,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
    onAfterPrint?.();
  }, 300);
}
