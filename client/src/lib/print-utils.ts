/**
 * Escape HTML special characters to prevent XSS when inserting
 * user-controlled strings into raw HTML print templates.
 */
function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function formatInTimezone(date: Date, timezone: string, dateOpts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat("en-US", { ...dateOpts, timeZone: timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", dateOpts).format(date);
  }
}

export interface KotPrintOptions {
  restaurantName: string;
  kotNumber?: string;
  orderId: string;
  orderType?: string | null;
  tableNumber?: number | null;
  station?: string | null;
  sentAt: string;
  timezone?: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string | null;
    course?: string | null;
  }>;
}

export function renderKotHtml(opts: KotPrintOptions): string {
  const { restaurantName, kotNumber, orderId, orderType, tableNumber, station, sentAt, items, timezone = "UTC" } = opts;
  const date = new Date(sentAt);
  const dateStr = formatInTimezone(date, timezone, { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = formatInTimezone(date, timezone, { hour: "2-digit", minute: "2-digit", hour12: true });
  const orderRef = esc(orderId.slice(-6).toUpperCase());

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
          ? `<div style="font-weight:bold;text-transform:uppercase;font-size:11px;margin-bottom:2px;border-bottom:1px solid #000;">-- ${esc(course)} --</div>`
          : "";
      const itemsInCourse = groupedByCourse[course]
        .map(
          (item) => `
            <div style="margin-bottom:4px;">
              <div style="display:flex;justify-content:space-between;">
                <span style="font-weight:bold;font-size:14px;">${esc(item.name)}</span>
                <span style="font-weight:bold;font-size:14px;">x${item.quantity}</span>
              </div>
              ${item.notes ? `<div style="font-size:11px;padding-left:8px;font-style:italic;">* ${esc(item.notes)}</div>` : ""}
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
<title>KOT</title>
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
    <div style="font-weight:bold;font-size:16px;letter-spacing:1px;">${esc(restaurantName).toUpperCase()}</div>
    <div style="font-size:11px;margin-top:2px;">*** KITCHEN ORDER TICKET ***</div>
    ${station ? `<div style="font-size:11px;font-weight:bold;">STATION: ${esc(station).toUpperCase()}</div>` : ""}
  </div>
  <div style="border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
    <div style="display:flex;justify-content:space-between;">
      <span style="font-weight:bold;">KOT #${kotNumber ? esc(kotNumber) : orderRef}</span>
      <span>${esc(dateStr)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <span style="font-weight:bold;">${esc(orderLabel)}</span>
      <span>${esc(timeStr)}</span>
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
  restaurantLogo?: string | null;
  billNumber: string;
  invoiceNumber?: string | null;
  orderId: string;
  orderType?: string | null;
  tableNumber?: number | null;
  waiterName?: string;
  timezone?: string;
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
    restaurantName, restaurantAddress, restaurantGstin, restaurantLogo,
    billNumber, invoiceNumber, orderType, tableNumber, waiterName,
    items, subtotal, discountAmount = 0, discountReason,
    serviceCharge = 0, taxAmount = 0, taxType, taxRate,
    cgstAmount, sgstAmount, tips = 0, totalAmount,
    currency = "₹", paymentMethod, paidAt,
    customerName, customerGstin, loyaltyPointsEarned, digitalReceiptUrl,
    timezone = "UTC",
  } = opts;

  const now = paidAt ? new Date(paidAt) : new Date();
  const dateStr = formatInTimezone(now, timezone, { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = formatInTimezone(now, timezone, { hour: "2-digit", minute: "2-digit", hour12: true });
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
          <td style="padding:2px 0;">${esc(item.name)}${item.notes ? ` <small><em>(${esc(item.notes)})</em></small>` : ""}${item.hsnCode ? `<br/><small style="color:#666;">HSN: ${esc(item.hsnCode)}</small>` : ""}</td>
          <td style="text-align:center;padding:2px 4px;">${item.quantity}</td>
          <td style="text-align:right;padding:2px 0;">${esc(fmt(item.price))}</td>
          <td style="text-align:right;padding:2px 0;">${esc(fmt(item.price * item.quantity))}</td>
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
          <td colspan="3">${esc(taxType?.toUpperCase() || "Tax")}${taxRate ? ` (${taxRate}%)` : ""}</td>
          <td style="text-align:right;">${fmt(taxAmount)}</td>
        </tr>
      `
      : "";

  const qrApiUrl = digitalReceiptUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(digitalReceiptUrl)}`
    : null;
  const digitalReceiptSection = digitalReceiptUrl
    ? `<div style="text-align:center;margin-top:6px;font-size:10px;">
        <div style="margin-bottom:4px;">Scan QR for digital receipt:</div>
        ${qrApiUrl ? `<img src="${qrApiUrl}" alt="QR Code" width="80" height="80" style="display:block;margin:0 auto 4px;" onerror="this.style.display='none'" />` : ""}
        <div style="font-family:monospace;font-size:9px;word-break:break-all;">${esc(digitalReceiptUrl)}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Bill</title>
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
    ${restaurantLogo ? `<img src="${esc(restaurantLogo)}" alt="${esc(restaurantName)}" height="48" style="display:block;margin:0 auto 4px;max-height:48px;object-fit:contain;" onerror="this.style.display='none'" />` : ""}
    <div style="font-weight:bold;font-size:16px;letter-spacing:1px;">${esc(restaurantName).toUpperCase()}</div>
    ${restaurantAddress ? `<div style="font-size:10px;">${esc(restaurantAddress)}</div>` : ""}
    ${restaurantGstin ? `<div style="font-size:10px;">GSTIN: ${esc(restaurantGstin)}</div>` : ""}
    <div style="font-size:11px;">${esc(dateStr)} &nbsp; ${esc(timeStr)}</div>
  </div>

  <div style="margin-bottom:6px;font-size:11px;">
    <div style="display:flex;justify-content:space-between;">
      <span><strong>Bill: ${esc(billNumber)}</strong></span>
      <span>${esc(orderLabel)}</span>
    </div>
    ${invoiceNumber ? `<div>Invoice: ${esc(invoiceNumber)}</div>` : ""}
    ${waiterName ? `<div>Served by: ${esc(waiterName)}</div>` : ""}
    ${customerName ? `<div>Customer: ${esc(customerName)}</div>` : ""}
    ${customerGstin ? `<div>Cust. GSTIN: ${esc(customerGstin)}</div>` : ""}
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
      <td colspan="3">Discount${discountReason ? ` (${esc(discountReason)})` : ""}</td>
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
      <td style="text-align:right;">${esc(paymentMethod)}</td>
    </tr>
    ` : ""}
  </table>

  ${loyaltyPointsEarned ? `<div class="dashed"></div><div style="text-align:center;font-size:11px;">Loyalty Points Earned: +${loyaltyPointsEarned}</div>` : ""}

  ${digitalReceiptSection}

  <div class="dashed"></div>
  <div style="text-align:center;font-size:11px;">
    <div>Thank you for dining with us!</div>
    <div>*** END OF BILL ***</div>
  </div>
</body>
</html>`;
}

/**
 * Dispatch print result enum.
 * - "network": print was sent to a network printer and accepted (HTTP 2xx)
 * - "popup": browser popup print dialog was used (fallback)
 * - "iframe": in-page hidden iframe print was used (fallback, no popup permission needed)
 * - "failed": network printer returned non-OK and all fallbacks failed
 */
export type PrintResult = "network" | "popup" | "iframe" | "failed";

/**
 * Print HTML using a hidden iframe inserted into the current document.
 * This approach does not require popup permission because it operates within
 * the same browsing context. Safe to call from async callbacks.
 */
export function printHtmlWithIframe(html: string, onAfterPrint?: () => void): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "none";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1000);
    onAfterPrint?.();
  };

  iframe.contentWindow?.addEventListener("afterprint", cleanup, { once: true });

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (_) {}
    setTimeout(cleanup, 2000);
  }, 300);
}

/**
 * Attempt to dispatch a print job to the station's network printer URL.
 * Falls back to in-page iframe print if no URL is configured or network fails.
 * The iframe approach avoids popup blocking since it runs within the same browsing context.
 *
 * Callbacks:
 *   onNetworkSuccess  — called only when the network printer accepts the job (HTTP 2xx)
 *   onPopupPrint      — called after the iframe print completes (fallback path)
 *   onFailure         — not used in current implementation (kept for API compatibility)
 *
 * Returns the PrintResult indicating which path was taken.
 */
export async function dispatchPrint(
  html: string,
  printerUrl?: string | null,
  options?: {
    onNetworkSuccess?: () => void;
    onPopupPrint?: () => void;
    onFailure?: () => void;
  }
): Promise<PrintResult> {
  const { onNetworkSuccess, onPopupPrint } = options ?? {};

  if (printerUrl) {
    try {
      const res = await fetch(printerUrl, {
        method: "POST",
        headers: { "Content-Type": "text/html" },
        body: html,
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        onNetworkSuccess?.();
        return "network";
      }
    } catch (_) {
    }
  }

  printHtmlWithIframe(html, onPopupPrint);
  return "iframe";
}

/**
 * Open a browser popup with the HTML content and trigger the print dialog.
 * Returns true if the popup was opened, false if it was blocked.
 */
export function printHtmlInPopup(html: string, onAfterPrint?: () => void): boolean {
  const win = window.open("", "_blank", "width=420,height=700");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
    onAfterPrint?.();
  }, 300);
  return true;
}
