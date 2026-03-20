import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
