import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Package } from "lucide-react";

interface BreakageItem {
  itemId: string;
  itemName: string;
  category: string;
  breakagePieces: number;
  totalValue: number;
  currentStock: number;
  percentOfStock: number;
  costPerPiece: number;
}

interface BreakageByCause {
  cause: string;
  pieces: number;
  percent: number;
}

interface BreakageByStaff {
  staffName: string;
  incidents: number;
}

interface BreakageReport {
  items: BreakageItem[];
  byCause: BreakageByCause[];
  byStaff: BreakageByStaff[];
  totalPieces: number;
  totalValue: number;
  month: number;
  year: number;
}

interface Outlet { id: string; name: string; }

function getStatusEmoji(pct: number) {
  if (pct > 15) return "🔴";
  if (pct >= 5) return "🟡";
  return "🟢";
}

function getStatusClass(pct: number) {
  if (pct > 15) return "text-red-600 font-semibold";
  if (pct >= 5) return "text-amber-600 font-semibold";
  return "text-green-600";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function CrockeryBreakageReport() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year] = useState(String(now.getFullYear()));
  const [outletId, setOutletId] = useState("");

  const fmt = (v: number) => {
    const tenant = user?.tenant;
    return formatCurrency(v, tenant?.currency || "AED", tenant?.currencyPosition || "before", tenant?.currencyDecimals ?? 2);
  };

  const { data: outletsRes } = useQuery<{ data: Outlet[] } | Outlet[]>({ queryKey: ["/api/outlets"] });
  const outlets: Outlet[] = Array.isArray(outletsRes) ? outletsRes : ((outletsRes as { data: Outlet[] } | undefined)?.data ?? []);

  const params = new URLSearchParams({ year, month });
  if (outletId) params.set("outletId", outletId);

  const { data: report, isLoading, isError } = useQuery<BreakageReport>({
    queryKey: ["/api/reports/breakage-monthly", year, month, outletId],
    queryFn: async () => {
      const res = await fetch(`/api/reports/breakage-monthly?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load breakage report");
      return res.json();
    },
    retry: false,
  });

  const selectedOutletName = outletId ? outlets.find(o => o.id === outletId)?.name : "All Outlets";
  const selectedMonthName = MONTHS[parseInt(month) - 1];

  return (
    <div className="space-y-6" data-testid="page-breakage-report">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Monthly Breakage Report</h2>
          <p className="text-muted-foreground text-sm">{selectedMonthName} {year} · {selectedOutletName}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-40" data-testid="select-breakage-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m} {year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={outletId || "__all"} onValueChange={v => setOutletId(v === "__all" ? "" : v)}>
            <SelectTrigger className="w-48" data-testid="select-breakage-outlet">
              <SelectValue placeholder="All Outlets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Outlets</SelectItem>
              {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Breakage report data is not available yet.</p>
            <p className="text-xs mt-1">This report will populate once crockery items are tracked and damage records exist.</p>
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Breakage by Item</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {report.items.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No breakage recorded for this period.</div>
              ) : (
                <Table data-testid="table-breakage-items">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Breakage</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">% of Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.items.map(item => (
                      <TableRow key={item.itemId} data-testid={`row-breakage-${item.itemId}`}>
                        <TableCell className="font-medium">{item.itemName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.breakagePieces} pcs</TableCell>
                        <TableCell className="text-right">{fmt(item.totalValue)}</TableCell>
                        <TableCell className={`text-right ${getStatusClass(item.percentOfStock)}`}>
                          {item.percentOfStock.toFixed(1)}% {getStatusEmoji(item.percentOfStock)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold" data-testid="text-breakage-total">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right">{report.totalPieces} pcs</TableCell>
                      <TableCell className="text-right">{fmt(report.totalValue)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="section-by-cause">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">By Cause</CardTitle>
              </CardHeader>
              <CardContent>
                {report.byCause.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cause data available.</p>
                ) : (
                  <div className="space-y-2">
                    {report.byCause.map(c => (
                      <div key={c.cause} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {c.cause === "UNKNOWN" && <Badge variant="destructive" className="text-xs">Investigate</Badge>}
                          {c.cause.replace(/_/g, " ").toLowerCase().replace(/^\w/, ch => ch.toUpperCase())}
                        </span>
                        <span className="font-medium">{c.pieces} pcs ({c.percent.toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="section-by-staff">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">By Staff (where recorded)</CardTitle>
              </CardHeader>
              <CardContent>
                {report.byStaff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No staff data available.</p>
                ) : (
                  <div className="space-y-2">
                    {report.byStaff.map(s => (
                      <div key={s.staffName} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {s.staffName === "Unknown" && <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">Record needed</Badge>}
                          {s.staffName}
                        </span>
                        <span className="font-medium">{s.incidents} incident{s.incidents !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
