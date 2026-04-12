import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Download } from "lucide-react";

export default function AccountingExport() {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState("json");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleExport = async () => {
    if (!from || !to) { setError("Please select date range"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch(
        `/api/reports/export/accounting?from=${from}&to=${to}&format=${format}`,
        { credentials: "include" }
      );
      if (format === "json") {
        const data = await res.json();
        setResult(data);
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `export_${from}_${to}.${format === "quickbooks" ? "iif" : "csv"}`;
        a.click();
        window.URL.revokeObjectURL(url);
        setResult({ message: `Downloaded ${format} file` });
      }
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <FileSpreadsheet className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Accounting Export</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="text-sm font-medium">From Date</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md" />
        </div>
        <div>
          <label className="text-sm font-medium">To Date</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md" />
        </div>
        <div>
          <label className="text-sm font-medium">Format</label>
          <select value={format} onChange={e => setFormat(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md">
            <option value="json">JSON (Preview)</option>
            <option value="quickbooks">QuickBooks IIF</option>
            <option value="xero">Xero CSV</option>
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={handleExport} disabled={loading}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            <Download className="h-4 w-4" />
            {loading ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
      {error && <div className="text-red-500 text-sm">{error}</div>}
      {result && format === "json" && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">{result.count} bills found</p>
          <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96">
            {JSON.stringify(result.bills?.slice(0, 5), null, 2)}
          </pre>
          {result.count > 5 && <p className="text-xs text-muted-foreground mt-1">Showing first 5 of {result.count}</p>}
        </div>
      )}
      {result && format !== "json" && (
        <div className="text-green-600 text-sm mt-2">{result.message}</div>
      )}
    </div>
  );
}
