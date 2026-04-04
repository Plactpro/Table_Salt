import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  restaurantName: string;
  logoUrl?: string | null;
  dateRange?: string;
  columns: string[];
  rows: (string | number)[][];
  filename?: string;
  footerNote?: string;
}

const BRAND_COLOR: [number, number, number] = [30, 130, 115];
const HEADER_BG: [number, number, number] = [30, 130, 115];
const HEADER_TEXT: [number, number, number] = [255, 255, 255];
const ALT_ROW: [number, number, number] = [245, 251, 250];

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportToPdf(opts: PdfExportOptions): Promise<void> {
  const {
    title,
    subtitle,
    restaurantName,
    logoUrl,
    dateRange,
    columns,
    rows,
    filename = "report.pdf",
    footerNote,
  } = opts;

  const logoDataUrl = logoUrl ? await loadImageAsDataUrl(logoUrl) : null;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const now = new Date();
  const generatedAt = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, pageWidth, 24, "F");

  const LOGO_H = 14;
  const LOGO_MAX_W = 30;
  const LOGO_X = 10;
  const LOGO_Y = 5;
  let textStartX = 12;

  if (logoDataUrl) {
    try {
      const img = new Image();
      img.src = logoDataUrl;
      const ratio = img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 1;
      const logoW = Math.min(LOGO_MAX_W, LOGO_H * ratio);
      doc.addImage(logoDataUrl, LOGO_X, LOGO_Y, logoW, LOGO_H);
      textStartX = LOGO_X + logoW + 4;
    } catch {
      // logo render failed — proceed with text only
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(restaurantName, textStartX, 11);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text("Table Salt — Restaurant Management", textStartX, 17);

  doc.setTextColor(220, 240, 238);
  doc.setFontSize(8);
  doc.text(`Generated: ${generatedAt}`, pageWidth - 12, 17, { align: "right" });

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 12, 34);

  let yPos = 40;
  if (subtitle || dateRange) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    if (subtitle) {
      doc.text(subtitle, 12, yPos);
      yPos += 5;
    }
    if (dateRange) {
      doc.text(`Period: ${dateRange}`, 12, yPos);
      yPos += 3;
    }
  }

  autoTable(doc, {
    head: [columns],
    body: rows.map((row) => row.map((cell) => String(cell))),
    startY: yPos + 4,
    margin: { left: 12, right: 12 },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: HEADER_TEXT,
      fontStyle: "bold",
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: ALT_ROW,
    },
    tableLineColor: [200, 220, 218],
    tableLineWidth: 0.2,
    didDrawPage: (data) => {
      const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      const currentPage = data.pageNumber;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150, 150, 150);
      doc.text(
        `${restaurantName} — ${title} | Page ${currentPage} of ${pageCount}`,
        12,
        doc.internal.pageSize.getHeight() - 5
      );
      if (footerNote) {
        doc.text(footerNote, pageWidth - 12, doc.internal.pageSize.getHeight() - 5, { align: "right" });
      }
    },
  });

  doc.save(filename);
}

export interface ReceiptPdfOptions {
  restaurantName: string;
  billNumber: string;
  dateStr: string;
  timeStr: string;
  orderType?: string | null;
  tableNumber?: string | number | null;
  waiterName?: string | null;
  items: Array<{ name: string; quantity: number; price: number }>;
  subtotal: number;
  discountAmount?: number;
  serviceCharge?: number;
  taxAmount?: number;
  tips?: number;
  totalAmount: number;
  currency: string;
  currencyPosition?: "before" | "after";
  currencyDecimals?: number;
  paymentMethod?: string;
  customerName?: string | null;
  filename?: string;
}

/**
 * O10: Generate a receipt-shaped PDF and trigger a direct download.
 * Used by the "Download PDF" button in BillPreviewModal to avoid
 * reopening the browser print dialog.
 */
export async function exportReceiptPdf(opts: ReceiptPdfOptions): Promise<void> {
  const {
    restaurantName, billNumber, dateStr, timeStr, orderType, tableNumber, waiterName,
    items, subtotal, discountAmount = 0, serviceCharge = 0, taxAmount = 0, tips = 0,
    totalAmount, currency, currencyPosition = "before", currencyDecimals = 2,
    paymentMethod, customerName, filename = `Receipt-${billNumber}.pdf`,
  } = opts;

  const fmt = (n: number) => sharedFormatCurrency(n, currency, { position: currencyPosition, decimals: currencyDecimals });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, 200] });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 8;

  const center = (text: string, fontSize: number, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(text, pageW / 2, y, { align: "center" });
    y += fontSize * 0.4 + 1;
  };

  const line = (text: string, fontSize = 7) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "normal");
    doc.text(text, 4, y);
    y += fontSize * 0.4 + 1;
  };

  const row = (left: string, right: string, fontSize = 7, bold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(left, 4, y);
    doc.text(right, pageW - 4, y, { align: "right" });
    y += fontSize * 0.4 + 1;
  };

  const dashedLine = () => {
    doc.setLineWidth(0.1);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(4, y, pageW - 4, y);
    doc.setLineDashPattern([], 0);
    y += 2;
  };

  doc.setTextColor(30, 30, 30);
  center(restaurantName.toUpperCase(), 9, true);
  center(`Bill #${billNumber}`, 7);
  center(`${dateStr} ${timeStr}`, 7);
  if (tableNumber) center(`Table: ${tableNumber}`, 7);
  if (waiterName) center(`Served by: ${waiterName}`, 7);
  if (customerName) center(`Customer: ${customerName}`, 7);

  dashedLine();

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("Item", 4, y);
  doc.text("Qty", pageW * 0.6, y, { align: "center" });
  doc.text("Amount", pageW - 4, y, { align: "right" });
  y += 4;
  dashedLine();

  for (const item of items) {
    row(item.name.length > 20 ? item.name.slice(0, 20) + "…" : item.name, fmt(item.price * item.quantity));
    if (item.quantity > 1) line(`  ${item.quantity} x ${fmt(item.price)}`);
  }

  dashedLine();

  row("Subtotal", fmt(subtotal));
  if (discountAmount > 0) row("Discount", `-${fmt(discountAmount)}`);
  if (serviceCharge > 0) row("Service Charge", fmt(serviceCharge));
  if (taxAmount > 0) row("Tax", fmt(taxAmount));
  if (tips > 0) row("Tips", fmt(tips));

  dashedLine();
  row("TOTAL", fmt(totalAmount), 8, true);
  if (paymentMethod) row("Paid via", paymentMethod);

  y += 3;
  center("Thank you for dining with us!", 7);

  doc.save(filename);
}
