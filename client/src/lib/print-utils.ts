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

const LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  ar: "ar-SA",
  fr: "fr-FR",
};

function formatInTimezone(date: Date, timezone: string, dateOpts: Intl.DateTimeFormatOptions, language = "en"): string {
  const locale = LOCALE_MAP[language] ?? "en-US";
  try {
    return new Intl.DateTimeFormat(locale, { ...dateOpts, timeZone: timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, dateOpts).format(date);
  }
}

const KOT_LABELS: Record<string, {
  kitchenOrderTicket: string;
  station: string;
  table: string;
  takeaway: string;
  delivery: string;
  order: string;
  ref: string;
  totalItems: string;
  endOfKot: string;
  kotPrefix: string;
  htmlTitle: string;
  mainCourse: string;
}> = {
  en: {
    kitchenOrderTicket: "*** KITCHEN ORDER TICKET ***",
    station: "STATION",
    table: "Table",
    takeaway: "Takeaway",
    delivery: "Delivery",
    order: "Order",
    ref: "Ref",
    totalItems: "Total Items",
    endOfKot: "*** END OF KOT ***",
    kotPrefix: "KOT #",
    htmlTitle: "KOT",
    mainCourse: "Main",
  },
  es: {
    kitchenOrderTicket: "*** COMANDA DE COCINA ***",
    station: "ESTACIÓN",
    table: "Mesa",
    takeaway: "Para Llevar",
    delivery: "Entrega",
    order: "Pedido",
    ref: "Ref",
    totalItems: "Total Artículos",
    endOfKot: "*** FIN DE COMANDA ***",
    kotPrefix: "COMANDA #",
    htmlTitle: "Comanda",
    mainCourse: "Principal",
  },
  ar: {
    kitchenOrderTicket: "*** تذكرة طلب المطبخ ***",
    station: "المحطة",
    table: "طاولة",
    takeaway: "طلب خارجي",
    delivery: "توصيل",
    order: "طلب",
    ref: "مرجع",
    totalItems: "إجمالي الأصناف",
    endOfKot: "*** نهاية أمر الطبخ ***",
    kotPrefix: "أمر مطبخ #",
    htmlTitle: "أمر مطبخ",
    mainCourse: "رئيسي",
  },
  fr: {
    kitchenOrderTicket: "*** BON DE COMMANDE CUISINE ***",
    station: "STATION",
    table: "Table",
    takeaway: "À Emporter",
    delivery: "Livraison",
    order: "Commande",
    ref: "Réf",
    totalItems: "Total Articles",
    endOfKot: "*** FIN DU BON DE COMMANDE ***",
    kotPrefix: "BON #",
    htmlTitle: "Bon de Commande",
    mainCourse: "Plat Principal",
  },
};

const BILL_LABELS: Record<string, {
  table: string;
  takeaway: string;
  delivery: string;
  order: string;
  servedBy: string;
  customer: string;
  custGstin: string;
  item: string;
  qty: string;
  rate: string;
  amt: string;
  subtotal: string;
  discount: string;
  serviceCharge: string;
  tips: string;
  total: string;
  paidVia: string;
  loyaltyPoints: string;
  thankYou: string;
  endOfBill: string;
  invoice: string;
  bill: string;
  taxVat: string;
  hsnPrefix: string;
  gstinPrefix: string;
  cgst: string;
  sgst: string;
  scanQrMsg: string;
  htmlTitle: string;
}> = {
  en: {
    table: "Table",
    takeaway: "Takeaway",
    delivery: "Delivery",
    order: "Order",
    servedBy: "Served by",
    customer: "Customer",
    custGstin: "Cust. GSTIN",
    item: "Item",
    qty: "Qty",
    rate: "Rate",
    amt: "Amt",
    subtotal: "Subtotal",
    discount: "Discount",
    serviceCharge: "Service Charge",
    tips: "Tips",
    total: "TOTAL",
    paidVia: "Paid via",
    loyaltyPoints: "Loyalty Points Earned",
    thankYou: "Thank you for dining with us!",
    endOfBill: "*** END OF BILL ***",
    invoice: "Invoice",
    bill: "Bill",
    taxVat: "Tax",
    hsnPrefix: "HSN: ",
    gstinPrefix: "GSTIN: ",
    cgst: "CGST",
    sgst: "SGST",
    scanQrMsg: "Scan QR for digital receipt:",
    htmlTitle: "Bill",
  },
  es: {
    table: "Mesa",
    takeaway: "Para Llevar",
    delivery: "Entrega",
    order: "Pedido",
    servedBy: "Servido por",
    customer: "Cliente",
    custGstin: "GSTIN Cliente",
    item: "Artículo",
    qty: "Cant.",
    rate: "Precio",
    amt: "Importe",
    subtotal: "Subtotal",
    discount: "Descuento",
    serviceCharge: "Cargo Servicio",
    tips: "Propina",
    total: "TOTAL",
    paidVia: "Pagado con",
    loyaltyPoints: "Puntos de Fidelidad Ganados",
    thankYou: "¡Gracias por su visita!",
    endOfBill: "*** FIN DE CUENTA ***",
    invoice: "Factura",
    bill: "Cuenta",
    taxVat: "IVA",
    hsnPrefix: "HSN: ",
    gstinPrefix: "GSTIN: ",
    cgst: "CGST",
    sgst: "SGST",
    scanQrMsg: "Escanea el QR para el recibo digital:",
    htmlTitle: "Cuenta",
  },
  ar: {
    table: "طاولة",
    takeaway: "طلب خارجي",
    delivery: "توصيل",
    order: "طلب",
    servedBy: "قدّمه",
    customer: "العميل",
    custGstin: "رقم ضريبي",
    item: "الصنف",
    qty: "الكمية",
    rate: "السعر",
    amt: "المبلغ",
    subtotal: "المجموع الجزئي",
    discount: "الخصم",
    serviceCharge: "رسوم الخدمة",
    tips: "البقشيش",
    total: "الإجمالي",
    paidVia: "الدفع عبر",
    loyaltyPoints: "نقاط الولاء المكتسبة",
    thankYou: "شكراً لزيارتكم!",
    endOfBill: "*** نهاية الفاتورة ***",
    invoice: "فاتورة رسمية",
    bill: "الفاتورة",
    taxVat: "ضريبة",
    hsnPrefix: "رمز HSN: ",
    gstinPrefix: "GSTIN: ",
    cgst: "CGST",
    sgst: "SGST",
    scanQrMsg: "امسح رمز QR للإيصال الرقمي:",
    htmlTitle: "الفاتورة",
  },
  fr: {
    table: "Table",
    takeaway: "À Emporter",
    delivery: "Livraison",
    order: "Commande",
    servedBy: "Servi par",
    customer: "Client",
    custGstin: "GSTIN Client",
    item: "Article",
    qty: "Qté",
    rate: "Prix",
    amt: "Montant",
    subtotal: "Sous-total",
    discount: "Remise",
    serviceCharge: "Frais de Service",
    tips: "Pourboire",
    total: "TOTAL",
    paidVia: "Payé par",
    loyaltyPoints: "Points de Fidélité Gagnés",
    thankYou: "Merci de votre visite !",
    endOfBill: "*** FIN DE L'ADDITION ***",
    invoice: "Facture",
    bill: "Addition",
    taxVat: "TVA",
    hsnPrefix: "HSN : ",
    gstinPrefix: "GSTIN : ",
    cgst: "CGST",
    sgst: "SGST",
    scanQrMsg: "Scannez le QR pour le reçu numérique :",
    htmlTitle: "Addition",
  },
};

export interface KotPrintOptions {
  restaurantName: string;
  kotNumber?: string;
  orderId: string;
  orderType?: string | null;
  tableNumber?: number | null;
  station?: string | null;
  sentAt: string;
  timezone?: string;
  language?: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string | null;
    course?: string | null;
  }>;
}

export function renderKotHtml(opts: KotPrintOptions): string {
  const { restaurantName, kotNumber, orderId, orderType, tableNumber, station, sentAt, items, timezone = "UTC", language = "en" } = opts;
  const labels = KOT_LABELS[language] ?? KOT_LABELS.en;
  const date = new Date(sentAt);
  const dateStr = formatInTimezone(date, timezone, { day: "2-digit", month: "short", year: "numeric" }, language);
  const timeStr = formatInTimezone(date, timezone, { hour: "2-digit", minute: "2-digit", hour12: true }, language);
  const orderRef = esc(orderId.slice(-6).toUpperCase());

  const courseOrder = ["starter", "Starter", "main", "Main", "dessert", "Dessert", "beverage", "Beverage"];
  const groupedByCourse: Record<string, typeof items> = {};
  for (const item of items) {
    const course = item.course || labels.mainCourse;
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
      ? `${labels.table} #${tableNumber}`
      : orderType === "takeaway"
      ? labels.takeaway
      : orderType === "delivery"
      ? labels.delivery
      : labels.order;

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
<title>${esc(labels.htmlTitle)}</title>
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
    <div style="font-size:11px;margin-top:2px;">${labels.kitchenOrderTicket}</div>
    ${station ? `<div style="font-size:11px;font-weight:bold;">${labels.station}: ${esc(station).toUpperCase()}</div>` : ""}
  </div>
  <div style="border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px;">
    <div style="display:flex;justify-content:space-between;">
      <span style="font-weight:bold;">${esc(labels.kotPrefix)}${kotNumber ? esc(kotNumber) : orderRef}</span>
      <span>${esc(dateStr)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <span style="font-weight:bold;">${esc(orderLabel)}</span>
      <span>${esc(timeStr)}</span>
    </div>
    <div style="font-size:11px;">${labels.ref}: #${orderRef}</div>
  </div>
  <div style="margin-bottom:6px;">
    ${itemsHtml}
  </div>
  <div style="border-top:2px dashed #000;padding-top:6px;text-align:center;font-size:11px;">
    <div>${labels.totalItems}: <strong>${totalItems}</strong></div>
    <div style="margin-top:4px;">${labels.endOfKot}</div>
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
  /** O7: Pre-generated QR code data URL for reliable rendering in print contexts */
  qrDataUrl?: string | null;
  language?: string;
}

export function renderBillHtml(opts: BillPrintOptions): string {
  const {
    restaurantName, restaurantAddress, restaurantGstin, restaurantLogo,
    billNumber, invoiceNumber, orderType, tableNumber, waiterName,
    items, subtotal, discountAmount = 0, discountReason,
    serviceCharge = 0, taxAmount = 0, taxType, taxRate,
    cgstAmount, sgstAmount, tips = 0, totalAmount,
    currency = "USD", paymentMethod, paidAt,
    customerName, customerGstin, loyaltyPointsEarned, digitalReceiptUrl, qrDataUrl,
    timezone = "UTC", language = "en",
  } = opts;

  const labels = BILL_LABELS[language] ?? BILL_LABELS.en;
  const now = paidAt ? new Date(paidAt) : new Date();
  const dateStr = formatInTimezone(now, timezone, { day: "2-digit", month: "short", year: "numeric" }, language);
  const timeStr = formatInTimezone(now, timezone, { hour: "2-digit", minute: "2-digit", hour12: true }, language);
  // O7: Use Intl.NumberFormat to produce the correct currency symbol from the tenant currency code
  const locale = LOCALE_MAP[language] ?? "en-US";
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    } catch {
      return `${currency}${n.toFixed(2)}`;
    }
  };

  const orderLabel =
    orderType === "dine_in" && tableNumber
      ? `${labels.table} #${tableNumber}`
      : orderType === "takeaway"
      ? labels.takeaway
      : orderType === "delivery"
      ? labels.delivery
      : labels.order;

  const itemsHtml = items
    .map(
      (item) => `
        <tr>
          <td style="padding:2px 0;">${esc(item.name)}${item.notes ? ` <small><em>(${esc(item.notes)})</em></small>` : ""}${item.hsnCode ? `<br/><small style="color:#666;">${esc(labels.hsnPrefix)}${esc(item.hsnCode)}</small>` : ""}</td>
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
          <td colspan="3">${esc(labels.cgst)}${taxRate ? ` (${(taxRate / 2).toFixed(1)}%)` : ""}</td>
          <td style="text-align:right;">${fmt(cgstAmount || 0)}</td>
        </tr>
        <tr>
          <td colspan="3">${esc(labels.sgst)}${taxRate ? ` (${(taxRate / 2).toFixed(1)}%)` : ""}</td>
          <td style="text-align:right;">${fmt(sgstAmount || 0)}</td>
        </tr>
      `
      : taxAmount > 0
      ? `
        <tr>
          <td colspan="3">${esc(taxType?.toUpperCase() || labels.taxVat)}${taxRate ? ` (${taxRate}%)` : ""}</td>
          <td style="text-align:right;">${fmt(taxAmount)}</td>
        </tr>
      `
      : "";

  // O7: Prefer pre-generated data URL (works in print); fall back to external API only if no data URL provided
  const qrImgSrc = qrDataUrl
    ? qrDataUrl
    : digitalReceiptUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(digitalReceiptUrl)}`
      : null;
  const digitalReceiptSection = digitalReceiptUrl
    ? `<div style="text-align:center;margin-top:6px;font-size:10px;">
        <div style="margin-bottom:4px;">${esc(labels.scanQrMsg)}</div>
        ${qrImgSrc ? `<img src="${qrImgSrc}" alt="QR Code" width="80" height="80" style="display:block;margin:0 auto 4px;" />` : ""}
        <div style="font-family:monospace;font-size:9px;word-break:break-all;">${esc(digitalReceiptUrl)}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${esc(labels.htmlTitle)}</title>
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
    ${restaurantGstin ? `<div style="font-size:10px;">${esc(labels.gstinPrefix)}${esc(restaurantGstin)}</div>` : ""}
    <div style="font-size:11px;">${esc(dateStr)} &nbsp; ${esc(timeStr)}</div>
  </div>

  <div style="margin-bottom:6px;font-size:11px;">
    <div style="display:flex;justify-content:space-between;">
      <span><strong>${labels.bill}: ${esc(billNumber)}</strong></span>
      <span>${esc(orderLabel)}</span>
    </div>
    ${invoiceNumber ? `<div>${labels.invoice}: ${esc(invoiceNumber)}</div>` : ""}
    ${waiterName ? `<div>${labels.servedBy}: ${esc(waiterName)}</div>` : ""}
    ${customerName ? `<div>${labels.customer}: ${esc(customerName)}</div>` : ""}
    ${customerGstin ? `<div>${labels.custGstin}: ${esc(customerGstin)}</div>` : ""}
  </div>

  <table>
    <tr>
      <th style="text-align:left;">${labels.item}</th>
      <th style="text-align:center;">${labels.qty}</th>
      <th style="text-align:right;">${labels.rate}</th>
      <th style="text-align:right;">${labels.amt}</th>
    </tr>
    ${itemsHtml}
  </table>

  <div class="dashed"></div>

  <table>
    <tr>
      <td colspan="3">${labels.subtotal}</td>
      <td style="text-align:right;">${fmt(subtotal)}</td>
    </tr>
    ${discountAmount > 0 ? `
    <tr>
      <td colspan="3">${labels.discount}${discountReason ? ` (${esc(discountReason)})` : ""}</td>
      <td style="text-align:right;">-${fmt(discountAmount)}</td>
    </tr>
    ` : ""}
    ${serviceCharge > 0 ? `
    <tr>
      <td colspan="3">${labels.serviceCharge}</td>
      <td style="text-align:right;">${fmt(serviceCharge)}</td>
    </tr>
    ` : ""}
    ${taxRows}
    ${tips > 0 ? `
    <tr>
      <td colspan="3">${labels.tips}</td>
      <td style="text-align:right;">${fmt(tips)}</td>
    </tr>
    ` : ""}
  </table>

  <div class="dashed"></div>

  <table>
    <tr>
      <td colspan="3" style="font-weight:bold;font-size:14px;">${labels.total}</td>
      <td style="text-align:right;font-weight:bold;font-size:14px;">${fmt(totalAmount)}</td>
    </tr>
    ${paymentMethod ? `
    <tr>
      <td colspan="3">${labels.paidVia}</td>
      <td style="text-align:right;">${esc(paymentMethod)}</td>
    </tr>
    ` : ""}
  </table>

  ${loyaltyPointsEarned ? `<div class="dashed"></div><div style="text-align:center;font-size:11px;">${labels.loyaltyPoints}: +${loyaltyPointsEarned}</div>` : ""}

  ${digitalReceiptSection}

  <div class="dashed"></div>
  <div style="text-align:center;font-size:11px;">
    <div>${labels.thankYou}</div>
    <div>${labels.endOfBill}</div>
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
