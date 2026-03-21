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

  const groupedByCourse: Record<string, typeof items> = {};
  for (const item of items) {
    const course = item.course || "Main";
    if (!groupedByCourse[course]) groupedByCourse[course] = [];
    groupedByCourse[course].push(item);
  }
  const courseOrder = ["Starter", "starter", "Main", "main", "Dessert", "dessert", "Beverage", "beverage"];
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
          ? `<div style="font-weight:bold;text-transform:uppercase;font-size:11px;margin-bottom:2px;">-- ${course} --</div>`
          : "";
      const itemsInCourse = groupedByCourse[course]
        .map(
          (item) => `
            <div style="margin-bottom:4px;">
              <div style="display:flex;justify-content:space-between;">
                <span style="font-weight:bold;font-size:13px;">${item.name}</span>
                <span style="font-weight:bold;font-size:13px;">x${item.quantity}</span>
              </div>
              ${item.notes ? `<div style="font-size:11px;padding-left:8px;">Note: ${item.notes}</div>` : ""}
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
    font-family: monospace;
    font-size: 12px;
    width: 302px;
    max-width: 302px;
    padding: 8px;
    background: white;
    color: black;
    line-height: 1.4;
  }
  @media print {
    body { width: 100%; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
  <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:6px;">
    <div style="font-weight:bold;font-size:14px;">${restaurantName}</div>
    <div style="font-size:11px;">*** KITCHEN ORDER TICKET ***</div>
    ${station ? `<div style="font-size:11px;">Station: ${station.toUpperCase()}</div>` : ""}
  </div>
  <div style="border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
    <div style="display:flex;justify-content:space-between;">
      <span>KOT #: ${kotNumber || orderRef}</span>
      <span>${dateStr}</span>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <span>${orderLabel}</span>
      <span>${timeStr}</span>
    </div>
    <div>Order Ref: #${orderRef}</div>
  </div>
  ${itemsHtml}
  <div style="border-top:2px dashed #000;margin-top:6px;padding-top:6px;text-align:center;font-size:11px;">
    <div>Total Items: ${totalItems}</div>
    <div>*** END OF KOT ***</div>
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
}

export function renderBillHtml(opts: BillPrintOptions): string {
  const {
    restaurantName, restaurantAddress, restaurantGstin,
    billNumber, invoiceNumber, orderType, tableNumber, waiterName,
    items, subtotal, discountAmount = 0, discountReason,
    serviceCharge = 0, taxAmount = 0, taxType, taxRate,
    cgstAmount, sgstAmount, tips = 0, totalAmount,
    currency = "", paymentMethod, paidAt,
    customerName, customerGstin, loyaltyPointsEarned,
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
          <td>${item.name}${item.notes ? ` <small>(${item.notes})</small>` : ""}</td>
          <td style="text-align:center;">${item.quantity}</td>
          <td style="text-align:right;">${fmt(item.price)}</td>
          <td style="text-align:right;">${fmt(item.price * item.quantity)}</td>
        </tr>
      `
    )
    .join("");

  const taxLabel =
    taxType === "gst" && cgstAmount != null
      ? `
        <tr>
          <td colspan="3">CGST</td>
          <td style="text-align:right;">${fmt(cgstAmount)}</td>
        </tr>
        <tr>
          <td colspan="3">SGST</td>
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

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Bill - ${billNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: monospace;
    font-size: 12px;
    width: 302px;
    max-width: 302px;
    padding: 8px;
    background: white;
    color: black;
    line-height: 1.4;
  }
  table { width: 100%; border-collapse: collapse; }
  th { font-weight: bold; border-bottom: 1px dashed #000; padding: 2px 0; }
  td { padding: 1px 0; }
  .dashed { border-top: 1px dashed #000; margin: 4px 0; }
  .bold { font-weight: bold; }
  .center { text-align: center; }
  .right { text-align: right; }
  @media print {
    body { width: 100%; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
  <div class="center" style="border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:6px;">
    <div class="bold" style="font-size:14px;">${restaurantName}</div>
    ${restaurantAddress ? `<div style="font-size:11px;">${restaurantAddress}</div>` : ""}
    ${restaurantGstin ? `<div style="font-size:11px;">GSTIN: ${restaurantGstin}</div>` : ""}
    <div style="font-size:11px;">${dateStr} ${timeStr}</div>
  </div>

  <div style="margin-bottom:6px;">
    <div style="display:flex;justify-content:space-between;">
      <span>Bill: ${billNumber}</span>
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
      <th style="text-align:right;">Price</th>
      <th style="text-align:right;">Total</th>
    </tr>
    ${itemsHtml}
  </table>

  <div class="dashed"></div>

  <table>
    <tr>
      <td colspan="3">Subtotal</td>
      <td class="right">${fmt(subtotal)}</td>
    </tr>
    ${discountAmount > 0 ? `
    <tr>
      <td colspan="3">Discount${discountReason ? ` (${discountReason})` : ""}</td>
      <td class="right">-${fmt(discountAmount)}</td>
    </tr>
    ` : ""}
    ${serviceCharge > 0 ? `
    <tr>
      <td colspan="3">Service Charge</td>
      <td class="right">${fmt(serviceCharge)}</td>
    </tr>
    ` : ""}
    ${taxLabel}
    ${tips > 0 ? `
    <tr>
      <td colspan="3">Tips</td>
      <td class="right">${fmt(tips)}</td>
    </tr>
    ` : ""}
  </table>

  <div class="dashed"></div>

  <table>
    <tr class="bold" style="font-size:14px;">
      <td colspan="3">TOTAL</td>
      <td class="right">${fmt(totalAmount)}</td>
    </tr>
    ${paymentMethod ? `
    <tr>
      <td colspan="3">Paid via</td>
      <td class="right">${paymentMethod}</td>
    </tr>
    ` : ""}
  </table>

  ${loyaltyPointsEarned ? `<div class="dashed"></div><div class="center" style="font-size:11px;">Loyalty Points Earned: +${loyaltyPointsEarned}</div>` : ""}

  <div class="dashed"></div>
  <div class="center" style="font-size:11px;">
    <div>Thank you for dining with us!</div>
    <div>*** END OF BILL ***</div>
  </div>
</body>
</html>`;
}

export function printHtmlInPopup(html: string, onAfterPrint?: () => void): void {
  const win = window.open("", "_blank", "width=400,height=700");
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
