import { PageTitle } from "@/lib/accessibility";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ClipboardList,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  TrendingDown,
  PackageSearch,
  Play,
  History,
  BadgeCheck,
  FlaskConical,
  Pencil,
  Save,
  X,
  Eye,
  Ban,
  ShoppingCart,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

// ─── Types ───────────────────────────────────────────────────────────────────
type IngredientBreakdown = {
  inventoryItemId?: string;
  ingredientName?: string;
  name?: string;
  unit: string;
  currentStock?: number;
  stockLeft?: number;
  requiredPerPortion: number;
  maxPortions?: number;
  maxPortionsFromThis?: number;
  availabilityPct?: number;
  costPrice?: number;
  status?: string;
};

type ReportItem = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  category: string;
  recipeId: string | null;
  plannedQuantity: number;
  maxPossiblePortions: number;
  bottleneckIngredient: string | null;
  bottleneckStock: number | null;
  bottleneckRequired: number | null;
  status: "SUFFICIENT" | "LIMITED" | "CRITICAL" | "UNAVAILABLE" | "NO_RECIPE";
  ingredientBreakdown: IngredientBreakdown[];
  recommendedAction: string;
  shortfallCost: number;
  isDisabled?: boolean;
  maxLimit?: number | null;
};

type Report = {
  id: string;
  tenantId: string;
  outletId: string | null;
  outletName: string | null;
  reportType: string;
  targetDate: string;
  generatedAt: string;
  generatedBy: string;
  totalItemsChecked: number;
  itemsSufficient: number;
  itemsLimited: number;
  itemsCritical: number;
  itemsUnavailable: number;
  overallStatus: "GREEN" | "AMBER" | "RED" | "YELLOW";
  totalShortfallValue: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  actionsTaken: { note: string } | null;
  items?: ReportItem[];
};

// ─── Status helpers ──────────────────────────────────────────────────────────
const STATUS_META = {
  SUFFICIENT: { label: "Sufficient", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2, dot: "bg-emerald-500" },
  LIMITED:    { label: "Limited",    color: "bg-amber-100 text-amber-800",   icon: AlertTriangle, dot: "bg-amber-400" },
  CRITICAL:   { label: "Critical",   color: "bg-red-100 text-red-800",       icon: AlertCircle,  dot: "bg-red-500" },
  UNAVAILABLE:{ label: "Unavailable",color: "bg-red-200 text-red-900",       icon: XCircle,      dot: "bg-red-700" },
  NO_RECIPE:  { label: "No Recipe",  color: "bg-slate-100 text-slate-600",   icon: FlaskConical, dot: "bg-slate-400" },
} as const;

const OVERALL_META = {
  GREEN:  { label: "All Good",          cls: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  AMBER:  { label: "Attention Needed",  cls: "text-amber-700  bg-amber-50  border-amber-200",    dot: "bg-amber-400" },
  YELLOW: { label: "Attention Needed",  cls: "text-amber-700  bg-amber-50  border-amber-200",    dot: "bg-amber-400" },
  RED:    { label: "Critical Shortages",cls: "text-red-700    bg-red-50    border-red-200",       dot: "bg-red-500" },
};

const ACTION_LABEL: Record<string, string> = {
  OK:            "No action needed",
  MONITOR:       "Monitor stock closely",
  REORDER_URGENT:"Reorder urgently",
  PULL_FROM_MENU:"Disable from menu",
  ADD_RECIPE:    "Link a recipe",
};

// ─── CSV export ──────────────────────────────────────────────────────────────
function exportCsv(report: Report) {
  if (!report.items) return;
  const rows = [
    ["Dish","Category","Planned Qty","Max Portions","Status","Bottleneck Ingredient","Shortfall Cost","Recommended Action"],
    ...report.items.map((i) => [
      i.menuItemName, i.category, i.plannedQuantity, i.maxPossiblePortions,
      i.status, i.bottleneckIngredient || "—",
      Number(i.shortfallCost ?? 0).toFixed(2), ACTION_LABEL[i.recommendedAction] || i.recommendedAction,
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `stock-report-${report.targetDate}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Ingredient row ──────────────────────────────────────────────────────────
function IngredientRow({ ing, planned }: { ing: IngredientBreakdown; planned: number }) {
  const name = ing.ingredientName ?? ing.name ?? "Unknown";
  const maxPortions = ing.maxPortions ?? ing.maxPortionsFromThis ?? 0;
  const currentStock = ing.currentStock ?? ing.stockLeft ?? 0;
  const ok = maxPortions >= planned;
  const isBottleneck = ing.status === "BOTTLENECK";

  return (
    <TableRow className={cn(!ok && "bg-red-50/60")}>
      <TableCell className="text-sm font-medium">
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", ok ? "bg-emerald-400" : "bg-red-500")} />
          {name}
          {isBottleneck && (
            <span className="ml-1 text-[10px] font-bold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
              BOTTLENECK
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-right">
        {Number(ing.requiredPerPortion).toFixed(3)} {ing.unit}
      </TableCell>
      <TableCell className="text-sm text-right">
        {Number(currentStock).toFixed(3)} {ing.unit}
      </TableCell>
      <TableCell className={cn("text-sm text-right font-semibold", ok ? "text-emerald-700" : "text-red-700")}>
        {maxPortions}
      </TableCell>
      <TableCell className="text-center">
        {ok
          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
          : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}
      </TableCell>
    </TableRow>
  );
}

// ─── Dish row with drill-down and per-dish actions ────────────────────────────
function DishRow({ item, reportTargetDate, onMutationSuccess }: {
  item: ReportItem;
  reportTargetDate: string;
  onMutationSuccess: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editQty, setEditQty] = useState(String(item.plannedQuantity));
  const [maxInput, setMaxInput] = useState(String(item.maxLimit ?? ""));
  const qc = useQueryClient();
  const { toast } = useToast();

  const meta = STATUS_META[item.status] ?? STATUS_META.SUFFICIENT;
  const Icon = meta.icon;
  const hasIngredients = item.ingredientBreakdown && item.ingredientBreakdown.length > 0;

  const plannedQtyMut = useMutation({
    mutationFn: (qty: number) =>
      apiRequest("PUT", "/api/stock-reports/planned-quantities", {
        targetDate: reportTargetDate,
        items: [{ menuItemId: item.menuItemId, plannedQty: qty }],
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Planned quantity saved", description: "Change applies on the next report run." });
      onMutationSuccess();
    },
    onError: () => toast({ title: "Failed to save planned qty", variant: "destructive" }),
  });

  const disableMut = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/stock-reports/planned-quantities", {
        targetDate: reportTargetDate,
        items: [{ menuItemId: item.menuItemId, plannedQty: 0, isDisabled: true }],
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Dish disabled for this date" });
      onMutationSuccess();
    },
    onError: () => toast({ title: "Failed to disable dish", variant: "destructive" }),
  });

  const setMaxMut = useMutation({
    mutationFn: (maxLimit: number) =>
      apiRequest("PUT", "/api/stock-reports/planned-quantities", {
        targetDate: reportTargetDate,
        items: [{ menuItemId: item.menuItemId, plannedQty: item.plannedQuantity, maxLimit }],
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Max quantity saved" });
      onMutationSuccess();
    },
    onError: () => toast({ title: "Failed to set max quantity", variant: "destructive" }),
  });

  const handleQtyBlur = () => {
    const n = parseInt(editQty, 10);
    if (!isNaN(n) && n !== item.plannedQuantity) {
      plannedQtyMut.mutate(n);
    }
  };

  const handleRaisePo = () => {
    toast({
      title: "Purchase Order",
      description: `PO request noted for bottleneck: ${item.bottleneckIngredient ?? item.menuItemName}`,
    });
  };

  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer hover:bg-muted/30 transition-colors",
          item.status === "CRITICAL" && "bg-red-50/40",
          item.status === "UNAVAILABLE" && "bg-red-50/60"
        )}
        onClick={() => hasIngredients && setExpanded((v) => !v)}
        data-testid={`row-dish-${item.id}`}
      >
        <TableCell className="w-8 pl-3">
          {hasIngredients
            ? (expanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />)
            : <span className="w-4 h-4 block" />}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", meta.dot)} />
            <span className="font-medium text-sm" data-testid={`text-dish-name-${item.id}`}>
              {item.menuItemName}
              {item.isDisabled && <span className="ml-2 text-xs text-gray-400 italic">(disabled)</span>}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{item.category}</TableCell>
        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
          <Input
            type="number"
            min={0}
            value={editQty}
            onChange={(e) => setEditQty(e.target.value)}
            onBlur={handleQtyBlur}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-20 h-7 text-sm text-center mx-auto"
            data-testid={`input-planned-qty-${item.id}`}
          />
        </TableCell>
        <TableCell className="text-center">
          <span className={cn("font-bold text-sm", item.maxPossiblePortions < item.plannedQuantity ? "text-red-600" : "text-emerald-700")} data-testid={`text-can-make-${item.id}`}>
            {item.maxPossiblePortions}
          </span>
        </TableCell>
        <TableCell>
          <Badge className={cn("text-xs font-medium gap-1", meta.color)} variant="secondary" data-testid={`badge-status-${item.id}`}>
            <Icon className="h-3 w-3" />{meta.label}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground truncate max-w-[140px]" data-testid={`text-bottleneck-${item.id}`}>
          {item.bottleneckIngredient || "—"}
        </TableCell>
        <TableCell className="text-sm text-right">
          {Number(item.shortfallCost ?? 0) > 0
            ? <span className="text-red-600 font-medium">{Number(item.shortfallCost).toFixed(2)}</span>
            : "—"}
        </TableCell>
      </TableRow>

      {expanded && hasIngredients && (
        <TableRow data-testid={`row-expanded-${item.id}`}>
          <TableCell colSpan={8} className="bg-muted/20 px-4 py-3">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Ingredient Breakdown (vs {item.plannedQuantity} planned portions)
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead className="text-right">Req / Portion</TableHead>
                    <TableHead className="text-right">Stock Left</TableHead>
                    <TableHead className="text-right">Max Portions</TableHead>
                    <TableHead className="text-center">OK?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.ingredientBreakdown.map((ing, i) => (
                    <IngredientRow
                      key={(ing.inventoryItemId ?? ing.ingredientName ?? i)}
                      ing={ing}
                      planned={item.plannedQuantity}
                    />
                  ))}
                </TableBody>
              </Table>

              {Number(item.shortfallCost ?? 0) > 0 && (
                <p className="text-sm text-red-600 font-medium">
                  Estimated restock cost: {Number(item.shortfallCost).toFixed(2)}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRaisePo}
                  data-testid={`btn-raise-po-${item.id}`}
                >
                  <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                  Raise PO
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => disableMut.mutate()}
                  disabled={disableMut.isPending}
                  data-testid={`btn-disable-dish-${item.id}`}
                >
                  {disableMut.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    : <Ban className="h-3.5 w-3.5 mr-1" />}
                  Disable Dish
                </Button>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    placeholder="Max qty"
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                    className="w-24 h-8 text-sm"
                    data-testid={`input-max-qty-${item.id}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const n = parseInt(maxInput, 10);
                      if (!isNaN(n)) setMaxMut.mutate(n);
                    }}
                    disabled={setMaxMut.isPending}
                    data-testid={`btn-save-max-qty-${item.id}`}
                  >
                    {setMaxMut.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      : <Sliders className="h-3.5 w-3.5 mr-1" />}
                    Set Max
                  </Button>
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Acknowledge modal ────────────────────────────────────────────────────────
function AcknowledgeModal({ open, onClose, reportId }: {
  open: boolean; onClose: () => void; reportId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const ackMut = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/stock-reports/${reportId}/acknowledge`, { actionsTaken: note })
        .then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Report acknowledged" });
      qc.invalidateQueries({ queryKey: ["/api/stock-reports"] });
      qc.invalidateQueries({ queryKey: ["/api/stock-reports", reportId] });
      onClose();
    },
    onError: () => toast({ title: "Failed to acknowledge", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4" /> Acknowledge Report
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">Confirm you have reviewed this report and taken necessary action.</p>
          <Textarea
            placeholder="Optional: notes on actions taken"
            value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            data-testid="input-ack-note"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => ackMut.mutate()} disabled={ackMut.isPending} data-testid="button-confirm-ack">
            {ackMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BadgeCheck className="h-4 w-4 mr-1" />}
            Acknowledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Report detail panel ──────────────────────────────────────────────────────
function ReportDetail({ reportId }: { reportId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("modules");
  const [filter, setFilter] = useState<string>("ALL");
  const [showAck, setShowAck] = useState(false);
  const [search, setSearch] = useState("");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: ["/api/stock-reports", reportId],
    queryFn: () => apiRequest("GET", `/api/stock-reports/${reportId}`).then((r) => r.json()),
  });

  const handleItemMutationSuccess = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["/api/stock-reports", reportId] });
    qc.invalidateQueries({ queryKey: ["/api/stock-reports"] });
  }, [qc, reportId]);

  const bulkDisableMut = useMutation({
    mutationFn: () => {
      const criticalItems = (report?.items ?? []).filter(
        (i) => i.status === "CRITICAL" || i.status === "UNAVAILABLE"
      );
      return apiRequest("PUT", "/api/stock-reports/planned-quantities", {
        targetDate: report?.targetDate ?? new Date().toISOString().slice(0, 10),
        items: criticalItems.map((i) => ({
          menuItemId: i.menuItemId,
          plannedQty: 0,
          isDisabled: true,
        })),
      }).then((r) => r.json());
    },
    onSuccess: () => {
      toast({ title: "All critical dishes disabled" });
      qc.invalidateQueries({ queryKey: ["/api/stock-reports", reportId] });
    },
    onError: () => toast({ title: "Failed to disable critical dishes", variant: "destructive" }),
  });

  const filteredItems = useMemo(() => {
    if (!report?.items) return [];
    return report.items.filter((i) => {
      const matchFilter = filter === "ALL" || i.status === filter;
      const matchSearch = !search || i.menuItemName.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [report?.items, filter, search]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, ReportItem[]> = {};
    for (const item of filteredItems) {
      const cat = item.category || "Uncategorized";
      (groups[cat] = groups[cat] || []).push(item);
    }
    return groups;
  }, [filteredItems]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!report) return null;

  const overall = OVERALL_META[report.overallStatus] ?? OVERALL_META.GREEN;
  const shortfallValue = parseFloat(report.totalShortfallValue) || 0;
  const criticalCount = report.itemsCritical + report.itemsUnavailable;

  return (
    <div className="space-y-4" data-testid="report-detail">
      {/* Header card */}
      <div className={cn("rounded-xl border p-4", overall.cls)} data-testid="card-report-header">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("w-3 h-3 rounded-full", overall.dot)} />
              <span className="font-semibold text-lg" data-testid="chip-overall-status">{overall.label}</span>
              <Badge variant="outline" className="text-xs font-mono">{report.reportType}</Badge>
            </div>
            <p className="text-sm opacity-80">
              {format(new Date(report.generatedAt), "PPpp")} · {report.totalItemsChecked} dishes
              {report.outletName && ` · ${report.outletName}`}
            </p>
            {report.acknowledgedAt && (
              <p className="text-xs mt-1 opacity-70 flex items-center gap-1" data-testid="badge-acknowledged">
                <BadgeCheck className="h-3 w-3" /> Acknowledged {format(new Date(report.acknowledgedAt), "PP")}
                {report.actionsTaken?.note && ` — "${report.actionsTaken.note}"`}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!report.acknowledgedAt && (
              <Button size="sm" variant="outline" onClick={() => setShowAck(true)} data-testid="btn-acknowledge">
                <BadgeCheck className="h-4 w-4 mr-1" /> Acknowledge
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => exportCsv(report)} data-testid="btn-export-csv">
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            {criticalCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => bulkDisableMut.mutate()}
                disabled={bulkDisableMut.isPending}
                data-testid="btn-disable-all-critical"
              >
                {bulkDisableMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  : <Ban className="h-4 w-4 mr-1" />}
                Disable All Critical ({criticalCount})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["SUFFICIENT","LIMITED","CRITICAL","UNAVAILABLE"] as const).map((s) => {
          const m = STATUS_META[s];
          const Icon = m.icon;
          const count = s === "SUFFICIENT" ? report.itemsSufficient
            : s === "LIMITED" ? report.itemsLimited
            : s === "CRITICAL" ? report.itemsCritical
            : report.itemsUnavailable;
          return (
            <button
              key={s}
              className={cn("rounded-lg border p-3 text-left transition-all hover:shadow-sm", filter === s && "ring-2 ring-primary")}
              onClick={() => setFilter(filter === s ? "ALL" : s)}
              data-testid={`tile-${s.toLowerCase()}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn("h-4 w-4", m.color.split(" ")[1])} />
                <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
              </div>
              <div className="text-2xl font-bold">{count}</div>
            </button>
          );
        })}
      </div>

      {shortfallValue > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3">
          <TrendingDown className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Total Shortfall Value</p>
            <p className="text-xs text-red-600">Estimated cost to meet planned quantities</p>
          </div>
          <div className="ml-auto text-xl font-bold text-red-700" data-testid="text-restock-cost">
            {shortfallValue.toFixed(2)}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search dishes..." className="w-48 h-8 text-sm"
          value={search} onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-dishes"
        />
        <div className="flex gap-1 flex-wrap">
          {(["ALL","SUFFICIENT","LIMITED","CRITICAL","UNAVAILABLE","NO_RECIPE"] as const).map((s) => (
            <Button
              key={s} size="sm"
              variant={filter === s ? "default" : "outline"}
              className="h-7 text-xs px-2"
              onClick={() => setFilter(filter === s ? "ALL" : s)}
              data-testid={`tab-filter-${s.toLowerCase()}`}
            >
              {s === "ALL" ? "All" : STATUS_META[s]?.label ?? s}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{filteredItems.length} dishes</span>
      </div>

      {/* Grouped table */}
      {Object.keys(groupedByCategory).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground" data-testid="empty-items">
          <PackageSearch className="h-12 w-12 mb-3 opacity-40" />
          <p>No dishes match the current filter</p>
        </div>
      ) : (
        <div className="space-y-5" data-testid="section-dish-table">
          {Object.entries(groupedByCategory).map(([category, items]) => (
            <div key={category} data-testid={`section-category-${category}`}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                {category}
                <span className="text-xs normal-case font-normal">({items.length})</span>
                <span className="h-px flex-1 bg-border" />
              </h3>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-8 pl-3" />
                      <TableHead>Dish</TableHead>
                      <TableHead>{t("category")}</TableHead>
                      <TableHead className="text-center">Planned Qty</TableHead>
                      <TableHead className="text-center">Can Make</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>Bottleneck</TableHead>
                      <TableHead className="text-right">Shortfall</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <DishRow
                        key={item.id}
                        item={item}
                        reportTargetDate={report.targetDate}
                        onMutationSuccess={handleItemMutationSuccess}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAck && (
        <AcknowledgeModal open={showAck} onClose={() => setShowAck(false)} reportId={report.id} />
      )}
    </div>
  );
}

// ─── Report history sidebar item ──────────────────────────────────────────────
function ReportHistoryItem({ report, active, onClick }: {
  report: Report; active: boolean; onClick: () => void;
}) {
  const overall = OVERALL_META[report.overallStatus] ?? OVERALL_META.GREEN;
  return (
    <button
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm",
        active ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"
      )}
      onClick={onClick}
      data-testid={`btn-history-report-${report.id}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", overall.dot)} />
        <span className="font-medium text-sm">{report.targetDate}</span>
        <Badge variant="outline" className="text-xs ml-auto">{report.reportType}</Badge>
      </div>
      <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
        <span className="text-emerald-700">{report.itemsSufficient} ok</span>
        {report.itemsLimited > 0 && <span className="text-amber-600">{report.itemsLimited} limited</span>}
        {report.itemsCritical > 0 && <span className="text-red-600">{report.itemsCritical} critical</span>}
        {report.itemsUnavailable > 0 && <span className="text-red-800">{report.itemsUnavailable} unavail.</span>}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
        <span>{format(new Date(report.generatedAt), "pp")}</span>
        {report.acknowledgedAt && (
          <span className="text-emerald-600 flex items-center gap-0.5">
            <BadgeCheck className="h-3 w-3" /> Ack'd
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Live preview tab ─────────────────────────────────────────────────────────
function LivePreviewTab() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["/api/stock-reports/preview"],
    queryFn: () => apiRequest("GET", "/api/stock-reports/preview").then((r) => r.json()),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const overallStatus = (data?.overallStatus as string) || "GREEN";
  const overall = OVERALL_META[overallStatus as keyof typeof OVERALL_META] ?? OVERALL_META.GREEN;
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border p-4", overall.cls)}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("w-3 h-3 rounded-full", overall.dot)} />
              <span className="font-semibold text-lg">{overall.label}</span>
              <Badge variant="outline" className="text-xs">Live Preview · {today}</Badge>
            </div>
            <p className="text-sm opacity-80 mt-0.5">{data?.totalItemsChecked ?? 0} dishes · live stock snapshot</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="btn-refresh-preview">
            <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["SUFFICIENT","LIMITED","CRITICAL","UNAVAILABLE"] as const).map((s) => {
          const m = STATUS_META[s];
          const Icon = m.icon;
          const count = s === "SUFFICIENT" ? data?.itemsSufficient
            : s === "LIMITED" ? data?.itemsLimited
            : s === "CRITICAL" ? data?.itemsCritical
            : data?.itemsUnavailable;
          return (
            <Card key={s}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("h-4 w-4", m.color.split(" ")[1])} />
                  <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                </div>
                <div className="text-2xl font-bold" data-testid={`preview-count-${s.toLowerCase()}`}>{count ?? 0}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {data?.items && data.items.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Dish</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Planned</TableHead>
                <TableHead className="text-center">Max Portions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bottleneck</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.items as any[])
                .filter((i: any) => i.status !== "SUFFICIENT" && i.status !== "NO_RECIPE")
                .slice(0, 50)
                .map((item: any) => {
                  const m = STATUS_META[item.status as keyof typeof STATUS_META] ?? STATUS_META.SUFFICIENT;
                  const Icon = m.icon;
                  return (
                    <TableRow key={item.menuItemId} className={cn(item.status === "CRITICAL" && "bg-red-50/40")}>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", m.dot)} />
                          {item.menuItemName}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.category}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{item.plannedQuantity}</TableCell>
                      <TableCell className="text-center font-bold text-sm text-red-600">{item.maxPossiblePortions}</TableCell>
                      <TableCell>
                        <Badge className={cn("text-xs gap-1", m.color)} variant="secondary">
                          <Icon className="h-3 w-3" />{m.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[160px]">
                        {item.bottleneckIngredient || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          {data.items.filter((i: any) => i.status === "SUFFICIENT" || i.status === "NO_RECIPE").length > 0 && (
            <p className="text-xs text-muted-foreground px-4 py-2 border-t bg-muted/10">
              Showing only items with limited/critical stock. {data.items.filter((i: any) => i.status === "SUFFICIENT").length} dishes are fully sufficient.
            </p>
          )}
        </div>
      )}

      {(!data?.items || data.items.length === 0) && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <PackageSearch className="h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium">No menu items found</p>
          <p className="text-sm mt-1">Add menu items and link recipes to see capacity data.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StockReportsPage() {
  const { t } = useTranslation("modules");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("reports");

  const { data: reports = [], isLoading: reportsLoading, refetch } = useQuery<Report[]>({
    queryKey: ["/api/stock-reports"],
    queryFn: () => apiRequest("GET", "/api/stock-reports").then((r) => r.json()),
  });

  // Auto-select latest report
  useEffect(() => {
    if (!selectedReportId && reports.length > 0) {
      setSelectedReportId(reports[0].id);
    }
  }, [reports, selectedReportId]);

  const generateMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/stock-reports/generate", {
        targetDate: format(new Date(), "yyyy-MM-dd"),
      }).then((r) => r.json()),
    onSuccess: (data: Report) => {
      toast({ title: "Report generated", description: `${data.totalItemsChecked} dishes checked` });
      qc.invalidateQueries({ queryKey: ["/api/stock-reports"] });
      setSelectedReportId(data.id);
      setActiveTab("reports");
    },
    onError: () => toast({ title: "Failed to generate report", variant: "destructive" }),
  });

  const handleSelectReport = useCallback((id: string) => {
    setSelectedReportId(id);
  }, []);

  return (
    <div className="p-6 space-y-6 min-h-full" data-testid="stock-reports-page">
      <PageTitle title={t("stockReports")} />
      {/* Page header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Stock Capacity Report</h1>
            <p className="text-sm text-muted-foreground">Daily menu feasibility based on current inventory</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh-list">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button
            size="sm" onClick={() => generateMut.mutate()} disabled={generateMut.isPending}
            data-testid="btn-generate-report"
          >
            {generateMut.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
              : <Play className="h-4 w-4 mr-1" />}
            Run Now
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reports" className="gap-1.5" data-testid="tab-reports">
            <History className="h-4 w-4" /> Reports
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5" data-testid="tab-preview">
            <Eye className="h-4 w-4" /> Live Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4">
          <div className="flex gap-4 min-h-[500px]">
            {/* History sidebar */}
            <div className="w-72 flex-shrink-0 space-y-2" data-testid="panel-history">
              {reportsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : reports.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm text-center gap-2 border rounded-lg p-4" data-testid="empty-reports">
                  <ClipboardList className="h-8 w-8 opacity-40" />
                  <p>No reports yet. Click "Run Now" to generate the first report.</p>
                </div>
              ) : (
                reports.map((r) => (
                  <ReportHistoryItem
                    key={r.id} report={r}
                    active={r.id === selectedReportId}
                    onClick={() => handleSelectReport(r.id)}
                  />
                ))
              )}
            </div>

            {/* Detail panel */}
            <div className="flex-1 min-w-0">
              {!selectedReportId ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3" data-testid="select-report-prompt">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <ClipboardList className="h-8 w-8 opacity-40" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">Select a report to view details</p>
                    <p className="text-sm mt-1">Or generate a new report for today</p>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => generateMut.mutate()} disabled={generateMut.isPending}
                    data-testid="btn-generate-empty"
                  >
                    {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                    Run Now
                  </Button>
                </div>
              ) : (
                <ReportDetail reportId={selectedReportId} />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <LivePreviewTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
