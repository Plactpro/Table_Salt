import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChefHat, Flame, CheckCircle2, Utensils, Clock, LogIn, LogOut, CheckCircle, AlertCircle,
  Maximize2, Minimize2, RotateCcw, Coffee, IceCream, Beef, CookingPot, Filter,
  AlertTriangle, X, Package, Trash2, CheckSquare, Monitor, Copy, RefreshCw, ExternalLink,
  Printer, UserCheck, ArrowRightLeft, CircleDot, ChevronDown, ChevronUp, FileText, WifiOff, Sun, Moon,
} from "lucide-react";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { renderKotHtml, dispatchPrint } from "@/lib/print-utils";
import i18n from "@/i18n/index";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InventoryItem } from "@shared/schema";
import KdsModificationDisplay from "@/components/modifications/KdsModificationDisplay";

interface KDSOrderItem {
  id: string;
  name: string;
  quantity: number | null;
  notes: string | null;
  status: string | null;
  station: string | null;
  course: string | null;
  startedAt: string | null;
  readyAt: string | null;
  menuItemId?: string | null;
  isAddon?: boolean | null;
  metadata?: { foodModification?: import("@/components/modifications/ModificationDrawer").FoodModification } | null;
}

interface KDSTicket {
  id: string;
  tableId: string | null;
  status: string;
  createdAt: string | null;
  orderType: string | null;
  channel: string | null;
  tableNumber?: number;
  items: KDSOrderItem[];
}

interface KitchenStation {
  id: string;
  name: string;
  displayName: string;
  color: string;
  sortOrder: number;
  active: boolean;
  printerUrl?: string | null;
}

interface RecipeCheckIngredient {
  id: string;
  inventoryItemId: string;
  name: string;
  required: number;
  available: number;
  unit: string;
  sufficient: boolean;
  status: "ok" | "low" | "out";
}

interface RecipeCheckItem {
  orderItemId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  noRecipe?: boolean;
  recipeId: string | null;
  recipeName: string | null;
  ingredients: RecipeCheckIngredient[];
}

interface RecipeCheckResponse {
  items: RecipeCheckItem[];
  hasUnlinkedItems: boolean;
}

const STATION_ICONS: Record<string, LucideIcon> = {
  grill: Beef,
  main: CookingPot,
  fryer: Flame,
  cold: IceCream,
  pastry: Coffee,
  bar: Coffee,
};

const COURSE_ORDER: Record<string, number> = {
  starter: 1, main: 2, dessert: 3, beverage: 4,
};

function useElapsedMinutes(createdAt: string | null): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!createdAt) return;
    const iv = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(iv);
  }, [createdAt]);
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatElapsed(mins: number): string {
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function getTimeColor(mins: number): string {
  if (mins < 5) return "text-green-600 dark:text-green-400";
  if (mins < 15) return "text-amber-500 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getTimeBorder(mins: number): string {
  if (mins < 5) return "border-l-green-500";
  if (mins < 15) return "border-l-amber-500";
  return "border-l-red-500";
}

function getTimeBg(mins: number): string {
  if (mins >= 15) return "bg-red-50 dark:bg-red-950/30";
  if (mins >= 5) return "bg-amber-50 dark:bg-amber-950/20";
  return "";
}

function KitchenClockCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t: tk } = useTranslation("kitchen");
  const [elapsed, setElapsed] = useState("");

  const { data: attendanceStatus, isLoading } = useQuery<any>({
    queryKey: ["/api/attendance/status"],
    refetchInterval: 30000,
  });

  const isClockedIn = attendanceStatus && !attendanceStatus.clockOut;
  const isClockedOut = attendanceStatus && attendanceStatus.clockOut;

  useEffect(() => {
    if (!isClockedIn) { setElapsed(""); return; }
    const update = () => {
      const diff = Date.now() - new Date(attendanceStatus.clockIn).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${h}h ${m}m`);
    };
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [isClockedIn, attendanceStatus?.clockIn]);

  const clockInMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/attendance/clock-in", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: tk("toastClockedIn") }); },
    onError: (e: Error) => { toast({ title: tk("toastError"), description: e.message, variant: "destructive" }); },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/attendance/clock-out", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: tk("toastClockedOut") }); },
    onError: (e: Error) => { toast({ title: tk("toastError"), description: e.message, variant: "destructive" }); },
  });

  if (isLoading) return null;

  return (
    <div data-testid="card-clock-in-out" className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${isClockedIn ? "border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"}`}>
      {isClockedIn ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-orange-600" />}
      <span className="text-sm font-medium" data-testid="text-attendance-status">
        {isClockedIn ? tk("clockedIn") : isClockedOut ? tk("clockedOut") : tk("notClockedIn")}
      </span>
      {isClockedIn && elapsed && <span className="text-xs text-muted-foreground">({elapsed})</span>}
      {isClockedIn && attendanceStatus.status === "late" && <Badge className="bg-amber-100 text-amber-700 text-xs"><AlertCircle className="h-3 w-3 mr-1" />{tk("late")}</Badge>}
      {!isClockedIn && !isClockedOut && (
        <Button size="sm" onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending} className="bg-green-600 hover:bg-green-700 gap-1 h-7 text-xs" data-testid="button-clock-in">
          <LogIn className="h-3 w-3" /> {tk("clockIn")}
        </Button>
      )}
      {isClockedIn && (
        <Button size="sm" variant="outline" onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending} className="border-red-300 text-red-600 gap-1 h-7 text-xs" data-testid="button-clock-out">
          <LogOut className="h-3 w-3" /> {tk("clockOut")}
        </Button>
      )}
    </div>
  );
}

function RecipeCheckDrawer({
  open, onClose, orderId, station, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  station: string | null;
  onConfirm: (force: boolean) => void;
}) {
  const { t: tk } = useTranslation("kitchen");
  const url = station
    ? `/api/kds/recipe-check/${orderId}?station=${encodeURIComponent(station)}`
    : `/api/kds/recipe-check/${orderId}`;
  const { data: recipeCheckData, isLoading } = useQuery<RecipeCheckResponse>({
    queryKey: ["/api/kds/recipe-check", orderId, station],
    queryFn: () => fetch(url, { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });

  const recipeItems = recipeCheckData?.items ?? [];
  const linkedItems = recipeItems.filter(r => !r.noRecipe);
  const unlinkedItems = recipeItems.filter(r => r.noRecipe);
  const allIngredients = linkedItems.flatMap(r => r.ingredients);
  const hasInsufficient = allIngredients.some(i => !i.sufficient);
  const outIngredients = allIngredients.filter(i => i.status === "out");
  const lowIngredients = allIngredients.filter(i => i.status === "low");

  const stockColor = (status: string) => {
    if (status === "ok") return "text-green-600 dark:text-green-400";
    if (status === "low") return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const stockBg = (status: string) => {
    if (status === "ok") return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
    if (status === "low") return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="dialog-recipe-check">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            {tk("recipeCheckTitle")}
          </DialogTitle>
          <DialogDescription>
            {tk("recipeCheckDesc")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : recipeItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{tk("noRecipesLinked")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hasInsufficient && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" data-testid="warning-insufficient-stock">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 dark:text-red-300">
                  <p className="font-medium">{tk("insufficientStockDetected")}</p>
                  {outIngredients.length > 0 && (
                    <p className="text-xs mt-1">{tk("outOfStock", { items: outIngredients.map(i => i.name).join(", ") })}</p>
                  )}
                  {lowIngredients.length > 0 && (
                    <p className="text-xs mt-1">{tk("lowStock", { items: lowIngredients.map(i => `${i.name} (${i.available}${i.unit} of ${i.required}${i.unit} needed)`).join(", ") })}</p>
                  )}
                </div>
              </div>
            )}

            {unlinkedItems.length > 0 && (
              <div className="space-y-1.5" data-testid="warning-no-recipe">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{tk("noRecipeNoStock")}</p>
                {unlinkedItems.map(u => (
                  <div key={u.orderItemId} className="flex items-center justify-between px-3 py-2 rounded-md border bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{u.quantity}× {u.menuItemName}</span>
                    <Badge variant="outline" className="text-xs text-slate-500 border-slate-300 gap-1" data-testid={`badge-no-recipe-${u.menuItemId}`}>
                      <AlertTriangle className="h-2.5 w-2.5" /> {tk("noRecipeBadge")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {linkedItems.map(ri => (
              <div key={ri.orderItemId} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{ri.quantity}× {ri.menuItemName}</span>
                  <Badge variant="outline" className="text-xs">{ri.recipeName}</Badge>
                </div>
                <div className="space-y-1.5">
                  {ri.ingredients.map(ing => (
                    <div key={ing.id} className={`flex items-center justify-between px-3 py-2 rounded-md border text-sm ${stockBg(ing.status)}`} data-testid={`ingredient-row-${ing.inventoryItemId}`}>
                      <div className="flex items-center gap-2">
                        <CheckSquare className={`h-3.5 w-3.5 ${stockColor(ing.status)}`} />
                        <span>{ing.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                        <span className="text-muted-foreground">{tk("need")} <span className="font-semibold text-foreground">{ing.required}{ing.unit}</span></span>
                        <span className={`font-semibold ${stockColor(ing.status)}`}>
                          {tk("stock")} {ing.available}{ing.unit} {ing.status === "ok" ? "✅" : ing.status === "low" ? "⚠️" : "❌"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2 border-t">
          {hasInsufficient ? (
            <>
              <Button
                className="w-full bg-orange-500 hover:bg-orange-600 gap-2"
                onClick={() => onConfirm(true)}
                data-testid="button-proceed-anyway"
              >
                <AlertTriangle className="h-4 w-4" /> {tk("proceedAnyway")}
              </Button>
              <Button variant="outline" className="w-full" onClick={onClose} data-testid="button-cancel-start">
                <X className="h-4 w-4 mr-2" /> {tk("cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 gap-2"
                onClick={() => onConfirm(false)}
                data-testid="button-confirm-start"
              >
                <Flame className="h-4 w-4" />
                {linkedItems.length === 0 ? tk("startCookingNoCheck") : tk("confirmStartCooking")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={onClose} data-testid="button-cancel-start">
                {tk("cancel")}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WastageModal({ open, onClose, station }: { open: boolean; onClose: () => void; station: string | null }) {
  const { toast } = useToast();
  const { t: tk } = useTranslation("kitchen");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const { data: inventoryRes } = useQuery<{ data: InventoryItem[] }>({
    queryKey: ["/api/inventory", "all"],
    queryFn: () => apiRequest("GET", "/api/inventory?limit=200").then(r => r.json()),
    enabled: open,
  });
  const inventory = inventoryRes?.data ?? [];

  const wastageMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/kds/wastage", { inventoryItemId, quantity: Number(quantity), reason, station });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: tk("toastWastageReported"), description: tk("toastWastageDesc") });
      setInventoryItemId(""); setQuantity(""); setReason("");
      onClose();
    },
    onError: (e: Error) => { toast({ title: tk("toastError"), description: e.message, variant: "destructive" }); },
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-wastage">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" /> {tk("reportWastage")}
          </DialogTitle>
          <DialogDescription>{tk("reportWastageDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wastage-ingredient">{tk("ingredient")}</Label>
            <Select value={inventoryItemId} onValueChange={setInventoryItemId}>
              <SelectTrigger id="wastage-ingredient" data-testid="select-wastage-ingredient">
                <SelectValue placeholder={tk("selectIngredient")} />
              </SelectTrigger>
              <SelectContent>
                {inventory.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.unit}) — {tk("stock")} {item.currentStock}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wastage-qty">{tk("quantityWasted")}</Label>
            <Input
              id="wastage-qty"
              type="number"
              min="0"
              step="0.01"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="e.g. 250"
              data-testid="input-wastage-quantity"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wastage-reason">{tk("reasonOptional")}</Label>
            <Textarea
              id="wastage-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={tk("reasonPlaceholder")}
              rows={2}
              data-testid="input-wastage-reason"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Button
            className="flex-1 bg-destructive hover:bg-destructive/90 gap-2"
            onClick={() => wastageMutation.mutate()}
            disabled={!inventoryItemId || !quantity || wastageMutation.isPending}
            data-testid="button-submit-wastage"
          >
            <Trash2 className="h-4 w-4" /> {tk("reportWastage")}
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-wastage">{tk("cancel")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const KDS_STALE_THRESHOLD_HOURS = 8;

function KDSTicketCard({ ticket, stationFilter, onItemStatus, onBulkStatus, onStartWithRecipeCheck, restaurantName, stationPrinterUrl, hasPrintQueued }: {
  ticket: KDSTicket;
  stationFilter: string | null;
  onItemStatus: (itemId: string, status: string) => void;
  onBulkStatus: (orderId: string, status: string, station?: string) => void;
  onStartWithRecipeCheck: (orderId: string, station: string | null) => void;
  restaurantName?: string;
  stationPrinterUrl?: string | null;
  hasPrintQueued?: boolean;
}) {
  const mins = useElapsedMinutes(ticket.createdAt);
  const isStale = mins >= KDS_STALE_THRESHOLD_HOURS * 60;
  const timeColor = isStale ? "text-muted-foreground" : getTimeColor(mins);
  const timeBorder = isStale ? "border-l-gray-400" : getTimeBorder(mins);
  const timeBg = isStale ? "bg-gray-50 dark:bg-gray-900/20" : getTimeBg(mins);
  const isNew = ticket.status === "new" || ticket.status === "sent_to_kitchen";
  const { tenant: cardTenant } = useAuth();
  const { t: tk } = useTranslation("kitchen");
  const printLanguage = cardTenant?.defaultLanguage || i18n.language || "en";
  const isLate = !isStale && mins >= 15;
  const [confirmReady, setConfirmReady] = useState<string | null>(null);
  const [acknowledgedAllergyItems, setAcknowledgedAllergyItems] = useState<Set<string>>(new Set());

  const hasAnyAllergy = ticket.items.some(i => {
    const mod = i.metadata?.foodModification;
    return mod && (mod.allergyFlags.length > 0 || mod.allergyDetails?.trim());
  });
  const allAllergiesAcknowledged = !hasAnyAllergy || ticket.items
    .filter(i => {
      const mod = i.metadata?.foodModification;
      return mod && (mod.allergyFlags.length > 0 || mod.allergyDetails?.trim());
    })
    .every(i => acknowledgedAllergyItems.has(i.id));

  const handleReprintKOT = useCallback(async () => {
    const printItems = (stationFilter
      ? ticket.items.filter(i => i.station === stationFilter)
      : ticket.items
    ).map(i => ({
      name: i.name,
      quantity: i.quantity ?? 1,
      notes: i.notes,
      course: i.course,
    }));

    const payload = {
      orderId: ticket.id,
      orderType: ticket.orderType,
      tableNumber: ticket.tableNumber,
      station: stationFilter,
      sentAt: ticket.createdAt || new Date().toISOString(),
      items: printItems,
    };

    let jobId: string | undefined;
    try {
      const res = await apiRequest("POST", "/api/print-jobs", {
        type: "kot",
        referenceId: ticket.id,
        station: stationFilter,
        payload,
      });
      const job = await res.json();
      jobId = job?.id;
    } catch (_) {}

    try {
      await fetch("/api/print/reprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId: ticket.id, type: "kot", isReprint: true, reason: "KDS reprint" }),
      });
    } catch (_) {}

    const html = renderKotHtml({
      restaurantName: restaurantName || "Kitchen",
      kotNumber: ticket.id.slice(-6).toUpperCase(),
      orderId: ticket.id,
      orderType: ticket.orderType,
      tableNumber: ticket.tableNumber,
      station: stationFilter,
      sentAt: ticket.createdAt || new Date().toISOString(),
      items: printItems,
      language: printLanguage,
    });

    await dispatchPrint(html, stationPrinterUrl, {
      onNetworkSuccess: () => {
        if (jobId) apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "printed" }).catch(() => {});
      },
      onPopupPrint: () => {
        if (jobId) apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "printed" }).catch(() => {});
      },
      onFailure: () => {
        if (jobId) apiRequest("PATCH", `/api/print-jobs/${jobId}/status`, { status: "failed" }).catch(() => {});
      },
    });
  }, [ticket, stationFilter, restaurantName, stationPrinterUrl]);

  const filteredItems = stationFilter
    ? ticket.items.filter(i => i.station === stationFilter)
    : ticket.items;

  const groupedByCourse = useMemo(() => {
    const groups: Record<string, KDSOrderItem[]> = {};
    for (const item of filteredItems) {
      const course = item.course || "other";
      if (!groups[course]) groups[course] = [];
      groups[course].push(item);
    }
    return Object.entries(groups).sort((a, b) => (COURSE_ORDER[a[0]] || 99) - (COURSE_ORDER[b[0]] || 99));
  }, [filteredItems]);

  const allPending = filteredItems.every(i => !i.status || i.status === "pending");
  const allCooking = filteredItems.every(i => i.status === "cooking");
  const allReady = filteredItems.every(i => i.status === "ready");
  const someReady = filteredItems.some(i => i.status === "ready");

  if (filteredItems.length === 0) return null;

  const hasRecipe = filteredItems.some(i => i.menuItemId);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ duration: 0.2 }}
      layout
    >
      <Card
        className={`overflow-hidden border-l-4 ${timeBorder} ${timeBg} transition-all duration-200 ${isStale ? "opacity-60" : ""} ${isLate && !allReady ? "animate-pulse ring-2 ring-red-400/50" : ""} ${isNew && !isStale ? "animate-[kds-flash_1.5s_ease-in-out_3] ring-2 ring-primary/40" : ""}`}
        data-testid={`kds-ticket-${ticket.id.slice(-4)}`}
      >
        <CardHeader className="p-3 pb-1.5 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs font-mono gap-1">
              #{ticket.id.slice(-4)}
            </Badge>
            {ticket.tableNumber && (
              <Badge variant="outline" className="text-xs font-semibold">
                T{ticket.tableNumber}
              </Badge>
            )}
            {ticket.orderType && ticket.orderType !== "dine_in" && (
              <Badge className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                {ticket.orderType.replace("_", " ")}
              </Badge>
            )}
            {ticket.channel === "kiosk" && (
              <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">KIOSK</Badge>
            )}
            {isStale && (
              <Badge className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-300 dark:border-gray-600" data-testid={`badge-stale-${ticket.id.slice(-4)}`}>
                {tk("staleCheckStatus")}
              </Badge>
            )}
            {hasPrintQueued && (
              <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 gap-1" data-testid={`badge-print-queued-${ticket.id.slice(-4)}`}>
                <Printer className="h-2.5 w-2.5" />
                {tk("printQueued")}
              </Badge>
            )}
          </div>
          <div className={`flex items-center gap-1 text-xs font-mono tabular-nums font-semibold ${timeColor}`}>
            <Clock className="h-3 w-3" />
            {isStale ? tk("stale") : formatElapsed(mins)}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          {groupedByCourse.map(([course, courseItems]) => (
            <div key={course} className="space-y-1">
              {groupedByCourse.length > 1 && (
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-dashed pb-0.5 mb-1">
                  {course}
                </div>
              )}
              {courseItems.map(item => {
                const itemMod = item.metadata?.foodModification;
                const itemHasAllergy = itemMod && (itemMod.allergyFlags.length > 0 || itemMod.allergyDetails?.trim());
                const itemAllergyAck = acknowledgedAllergyItems.has(item.id);
                return (
                  <div key={item.id} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                        <span className={`font-medium ${item.status === "ready" ? "line-through text-muted-foreground" : ""}`}>
                          {item.quantity}× {item.name}
                        </span>
                        {item.isAddon && (
                          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-bold bg-orange-500 text-white shrink-0" data-testid={`badge-addon-${item.id.slice(-4)}`}>
                            ADD-ON
                          </span>
                        )}
                        {item.notes && <span className="text-xs text-red-600 dark:text-red-400 font-medium italic truncate">⚠ {item.notes}</span>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(!item.status || item.status === "pending") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs hover:bg-orange-100"
                            disabled={!!itemHasAllergy && !itemAllergyAck}
                            onClick={() => onItemStatus(item.id, "cooking")}
                            data-testid={`btn-start-${item.id.slice(-4)}`}
                          >
                            <Flame className="h-3 w-3 text-orange-500" />
                          </Button>
                        )}
                        {item.status === "cooking" && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs hover:bg-green-100" onClick={() => onItemStatus(item.id, "ready")} data-testid={`btn-ready-${item.id.slice(-4)}`}>
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          </Button>
                        )}
                        {item.status === "ready" && (
                          <>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs hover:bg-blue-100" onClick={() => onItemStatus(item.id, "served")} data-testid={`btn-served-${item.id.slice(-4)}`}>
                              <Utensils className="h-3 w-3 text-blue-600" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs hover:bg-yellow-100" onClick={() => onItemStatus(item.id, "recalled")} data-testid={`btn-recall-${item.id.slice(-4)}`}>
                              <RotateCcw className="h-3 w-3 text-yellow-600" />
                            </Button>
                          </>
                        )}
                        <StatusDot status={item.status} />
                      </div>
                    </div>
                    {itemMod && (
                      <KdsModificationDisplay
                        modification={itemMod}
                        acknowledged={itemAllergyAck}
                        onAllergyAcknowledge={itemHasAllergy ? () => {
                          setAcknowledgedAllergyItems(prev => new Set(Array.from(prev).concat(item.id)));
                          apiRequest("PATCH", `/api/order-items/${item.id}/modifications/acknowledge`, {}).catch(() => {});
                        } : undefined}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="flex items-center justify-between gap-1.5 pt-1 border-t">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={handleReprintKOT}
              title="Reprint KOT"
              data-testid={`btn-reprint-kot-${ticket.id.slice(-4)}`}
            >
              <Printer className="h-3 w-3" /> KOT
            </Button>
            <div className="flex items-center gap-1.5">
            {allPending && (
              hasRecipe ? (
                <Button size="sm" className="h-7 text-xs gap-1 bg-orange-500 hover:bg-orange-600" onClick={() => onStartWithRecipeCheck(ticket.id, stationFilter)} data-testid={`btn-start-all-${ticket.id.slice(-4)}`}>
                  <Flame className="h-3 w-3" /> {tk("startAll")}
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs gap-1 bg-orange-500 hover:bg-orange-600" onClick={() => onBulkStatus(ticket.id, "cooking", stationFilter || undefined)} data-testid={`btn-start-all-${ticket.id.slice(-4)}`}>
                  <Flame className="h-3 w-3" /> {tk("startAll")}
                </Button>
              )
            )}
            {allCooking && (
              <>
                <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => setConfirmReady(stationFilter || "__all")} data-testid={`btn-ready-all-${ticket.id.slice(-4)}`}>
                  <CheckCircle2 className="h-3 w-3" /> {tk("allReady")}
                </Button>
                <AlertDialog open={!!confirmReady} onOpenChange={(open) => !open && setConfirmReady(null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{tk("markAllReadyTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {tk("markAllReadyDesc", { ref: ticket.tableNumber ? tk("tableRef", { n: ticket.tableNumber }) : tk("orderRef", { n: ticket.id.slice(-6).toUpperCase() }) })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-ready">{tk("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="button-confirm-ready"
                        onClick={() => {
                          onBulkStatus(ticket.id, "ready", confirmReady === "__all" ? undefined : (confirmReady ?? undefined));
                          setConfirmReady(null);
                        }}
                      >
                        {tk("yesMarkReady")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {someReady && !allReady && !allCooking && !allPending && (
              <Badge variant="outline" className="text-xs text-orange-600">{tk("partial")}</Badge>
            )}
            {allReady && (
              <Button size="sm" className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700" onClick={() => onBulkStatus(ticket.id, "served", stationFilter || undefined)} data-testid={`btn-served-all-${ticket.id.slice(-4)}`}>
                <Utensils className="h-3 w-3" /> {tk("served")}
              </Button>
            )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatusDot({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-300",
    cooking: "bg-orange-500 animate-pulse",
    ready: "bg-green-500",
    served: "bg-blue-500",
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status || "pending"] || "bg-gray-300"}`} />;
}

interface PrinterDevice {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "error" | "unknown";
  ipAddress?: string;
  port?: number;
}

function PrinterStatusMiniBar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reconnecting, setReconnecting] = useState<Record<string, boolean>>({});
  const { data: printers = [] } = useQuery<PrinterDevice[]>({
    queryKey: ["/api/printers"],
    queryFn: () => fetch("/api/printers", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: printerHealth = [] } = useQuery<PrinterDevice[]>({
    queryKey: ["/api/printers/status"],
    queryFn: () => fetch("/api/printers/status", { credentials: "include" }).then(r => r.json()).catch(() => []),
    refetchInterval: 120000,
    staleTime: 60000,
  });

  useRealtimeEvent("printer:status_changed", useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/printers/status"] });
  }, [queryClient]));

  if (printers.length === 0) return null;

  const statusColor: Record<string, string> = {
    online: "bg-green-500",
    offline: "bg-gray-400",
    error: "bg-red-500 animate-pulse",
    unknown: "bg-yellow-400",
    low_paper: "bg-amber-400 animate-pulse",
    low_ink: "bg-amber-400",
    paper_jam: "bg-red-500 animate-pulse",
  };
  const statusLabel: Record<string, string> = {
    online: "Online",
    offline: "Offline",
    error: "Error",
    unknown: "Unknown",
    low_paper: "Low Paper",
    low_ink: "Low Ink",
    paper_jam: "Paper Jam",
  };

  const isWarningStatus = (status: string) => status === "low_paper" || status === "low_ink";
  const isErrorStatus = (status: string) => status === "error" || status === "offline" || status === "paper_jam";

  const onlineCount = printers.filter(p => p.status === "online").length;
  const errorCount = printers.filter(p => p.status === "error").length;

  const healthMap = new Map(printerHealth.map(p => [p.id, p]));
  const offlinePrinters = printers.filter(p => {
    const hp = healthMap.get(p.id);
    return isErrorStatus(hp?.status ?? p.status);
  });
  const warningPrinters = printers.filter(p => {
    const hp = healthMap.get(p.id);
    return isWarningStatus(hp?.status ?? p.status);
  });

  const handleReconnect = async (p: PrinterDevice) => {
    setReconnecting(prev => ({ ...prev, [p.id]: true }));
    try {
      const printerUrl = p.ipAddress ? `http://${p.ipAddress}:${p.port || 9100}` : null;
      if (printerUrl) {
        await fetch(printerUrl, { method: "GET", signal: AbortSignal.timeout(3000) }).catch(() => {});
      }
      await apiRequest("PATCH", `/api/printers/${p.id}/reconnect`, {}).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/printers/status"] });
      toast({ title: "Reconnecting", description: `Attempting to reconnect ${p.name}...` });
    } catch (_) {
      toast({ title: "Reconnect failed", description: `Could not reach ${p.name}. Check network.`, variant: "destructive" });
    } finally {
      setReconnecting(prev => ({ ...prev, [p.id]: false }));
    }
  };

  return (
    <div className="space-y-1.5" data-testid="printer-status-section">
      {offlinePrinters.map(p => (
        <div
          key={`banner-${p.id}`}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300"
          data-testid={`banner-printer-offline-${p.id}`}
        >
          <div className="flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Printer &ldquo;{p.name}&rdquo; is offline — KOTs are queued</span>
          </div>
          <button
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 border border-red-300 dark:border-red-700 flex items-center gap-1 disabled:opacity-50"
            onClick={() => handleReconnect(p)}
            disabled={reconnecting[p.id]}
            data-testid={`button-banner-reconnect-${p.id}`}
          >
            <RefreshCw className={`h-3 w-3 ${reconnecting[p.id] ? "animate-spin" : ""}`} />
            {reconnecting[p.id] ? "Reconnecting..." : "Reconnect"}
          </button>
        </div>
      ))}
      {warningPrinters.map(p => (
        <div
          key={`banner-warn-${p.id}`}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300"
          data-testid={`banner-printer-warning-${p.id}`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">Printer &ldquo;{p.name}&rdquo; — {statusLabel[p.status] ?? p.status}. Please refill soon.</span>
        </div>
      ))}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border text-xs overflow-x-auto" data-testid="printer-status-minibar">
        <Printer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground shrink-0">Printers:</span>
        {printers.map(p => {
          const effectiveStatus = healthMap.get(p.id)?.status ?? p.status;
          const isErr = isErrorStatus(effectiveStatus);
          const isWarn = isWarningStatus(effectiveStatus);
          const printerUrl = p.ipAddress ? `http://${p.ipAddress}:${p.port || 9100}` : null;
          const tooltipText = isErr && printerUrl
            ? `Cannot reach printer at ${printerUrl}. Check network connection or update printer settings.`
            : isErr
            ? `Printer is ${effectiveStatus}. Check network connection or update printer settings.`
            : isWarn
            ? `${statusLabel[effectiveStatus] ?? effectiveStatus} — please refill soon.`
            : undefined;
          return (
            <div key={p.id} className="flex items-center gap-1 shrink-0" data-testid={`printer-status-${p.id}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${statusColor[effectiveStatus] || "bg-gray-400"}`} />
              <span className="font-medium" title={tooltipText}>{p.name}</span>
              <span className={`${isWarn ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>({statusLabel[effectiveStatus] || effectiveStatus})</span>
              {isErr && (
                <button
                  className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 hover:bg-red-200 border border-red-300 flex items-center gap-0.5 disabled:opacity-50"
                  onClick={() => handleReconnect(p)}
                  disabled={reconnecting[p.id]}
                  title={tooltipText}
                  data-testid={`button-reconnect-printer-${p.id}`}
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${reconnecting[p.id] ? "animate-spin" : ""}`} />
                  {reconnecting[p.id] ? "..." : "Reconnect"}
                </button>
              )}
            </div>
          );
        })}
        {offlinePrinters.length > 0 && (
          <span className="ml-auto shrink-0 text-red-600 font-medium">{offlinePrinters.length} offline</span>
        )}
        {offlinePrinters.length === 0 && warningPrinters.length > 0 && (
          <span className="ml-auto shrink-0 text-amber-600 font-medium">{warningPrinters.length} warning</span>
        )}
        {offlinePrinters.length === 0 && warningPrinters.length === 0 && (
          <span className="ml-auto shrink-0 text-green-600">{onlineCount}/{printers.length} online</span>
        )}
      </div>
    </div>
  );
}

export default function KitchenDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, tenant } = useAuth();
  const { t: tk } = useTranslation("kitchen");
  const printLanguage = tenant?.defaultLanguage || i18n.language || "en";
  const [, navigate] = useLocation();
  const [selectedStation, setSelectedStation] = useState<string | null>(() => {
    return localStorage.getItem("kds_station") || null;
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [recipeCheckState, setRecipeCheckState] = useState<{ orderId: string; station: string | null } | null>(null);
  const [wastageOpen, setWastageOpen] = useState(false);
  const [stationSettingsOpen, setStationSettingsOpen] = useState(false);
  const [editingPrinterUrl, setEditingPrinterUrl] = useState<Record<string, string>>({});
  const [showAssignments, setShowAssignments] = useState(false);

  const { status: wakeLockStatus } = useWakeLock(true);

  const { data: kitchenPrinters = [] } = useQuery<Array<{ id: string; type: string; isDefault: boolean }>>({
    queryKey: ["/api/printers"],
    queryFn: () => fetch("/api/printers", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
    staleTime: 5 * 60000,
    refetchInterval: 5 * 60000,
  });
  const kitchenPrinterId = useMemo(() => {
    const kitchen = kitchenPrinters.find(p => p.type === "kitchen");
    return kitchen?.id ?? kitchenPrinters[0]?.id ?? null;
  }, [kitchenPrinters]);

  const { data: pendingPrinterJobs = [] } = useQuery<Array<{ id: string; reference_id: string | null; status: string }>>({
    queryKey: ["/api/print-jobs/pending", kitchenPrinterId],
    queryFn: () => fetch(`/api/print-jobs/pending/${kitchenPrinterId}`, { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
    enabled: !!kitchenPrinterId,
    refetchInterval: 90000,
    staleTime: 30000,
  });

  const { data: queuedPrintJobs = [] } = useQuery<Array<{ id: string; referenceId: string | null; status: string }>>({
    queryKey: ["/api/print-jobs", "queued"],
    queryFn: () => fetch("/api/print-jobs?status=queued", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
    refetchInterval: 90000,
    staleTime: 30000,
  });

  const queuedOrderIds = useMemo(() => {
    const fromQueue = queuedPrintJobs.map(j => j.referenceId).filter(Boolean) as string[];
    const fromPrinter = pendingPrinterJobs.map(j => j.reference_id).filter(Boolean) as string[];
    return new Set([...fromQueue, ...fromPrinter]);
  }, [queuedPrintJobs, pendingPrinterJobs]);

  const { data: completedJobs = [] } = useQuery<Array<{ id: string; reference_id: string | null; status: string }>>({
    queryKey: ["/api/print/jobs", "completed"],
    queryFn: () => fetch("/api/print/jobs?status=completed&limit=100", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
    refetchInterval: 90000,
    staleTime: 30000,
  });
  const prevCompletedCountRef = useRef<number | null>(null);
  useEffect(() => {
    const current = completedJobs.length;
    if (prevCompletedCountRef.current !== null && current > prevCompletedCountRef.current) {
      const newlyCompleted = current - prevCompletedCountRef.current;
      toast({
        title: `KOT Printed ✓`,
        description: `${newlyCompleted} print job${newlyCompleted > 1 ? "s" : ""} completed successfully.`,
      });
    }
    prevCompletedCountRef.current = current;
  }, [completedJobs.length, toast]);

  const today = new Date().toISOString().slice(0, 10);

  const { data: myAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/assignments/live", "mine"],
    queryFn: () => apiRequest("GET", "/api/assignments/live").then(r => r.json()),
    refetchInterval: 20000,
    enabled: user?.role === "kitchen",
  });

  const { data: assignmentPool = [] } = useQuery<any[]>({
    queryKey: ["/api/assignments/board"],
    queryFn: () => apiRequest("GET", "/api/assignments/board").then(r => r.json()).then(d => d.unassigned ?? []),
    refetchInterval: 20000,
    enabled: user?.role === "kitchen" && showAssignments,
  });

  const selfAssignMut = useMutation({
    mutationFn: (assignmentId: string) => apiRequest("POST", "/api/assignments/self-assign", { assignmentId }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assignments/live"] }); toast({ title: "Ticket self-assigned" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startMut = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/assignments/${id}/start`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/assignments/live"] }),
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/assignments/${id}/complete`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/assignments/live"] }),
  });

  const checkInMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/chef-availability/check-in", { chefId: user?.id }).then(r => r.json()),
    onSuccess: () => toast({ title: tk("toastCheckedInShift") }),
  });

  const myActiveAssignments = myAssignments.filter((a: any) => a.chefId === user?.id && a.status !== "completed");
  const myActiveCount = myActiveAssignments.length;

  useEffect(() => {
    if (selectedStation) localStorage.setItem("kds_station", selectedStation);
    else localStorage.removeItem("kds_station");
  }, [selectedStation]);

  // PR-009: KDS 4-hour background refresh to clear any stale ticket data.
  const [kdsRefreshing, setKdsRefreshing] = useState(false);
  useEffect(() => {
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const id = setInterval(() => {
      setKdsRefreshing(true);
      queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
      setTimeout(() => setKdsRefreshing(false), 2000);
    }, FOUR_HOURS);
    return () => clearInterval(id);
  }, [queryClient]);

  const ticketsUrl = selectedStation ? `/api/kds/tickets?station=${encodeURIComponent(selectedStation)}` : "/api/kds/tickets";
  const { data: tickets = [], isLoading } = useQuery<KDSTicket[]>({
    queryKey: ["/api/kds/tickets", selectedStation],
    queryFn: () => fetch(ticketsUrl, { credentials: "include" }).then(r => r.json()),
  });

  const { data: wallTokenData, refetch: refetchWallToken } = useQuery<{ token: string }>({
    queryKey: ["/api/kds/wall-token"],
    queryFn: () => apiRequest("GET", "/api/kds/wall-token").then(r => r.json()),
    enabled: !!(user?.role === "owner" || user?.role === "manager"),
    staleTime: 60000,
  });

  const playChime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch (_) {}
  }, []);

  const playAllergyAlert = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "square";
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playTone(660, 0, 0.15);
      playTone(880, 0.2, 0.15);
      playTone(660, 0.4, 0.15);
    } catch (_) {}
  }, []);

  useRealtimeEvent("allergy:alert", useCallback((payload: unknown) => {
    const p = payload as { itemName?: string; allergies?: string[] } | null;
    playAllergyAlert();
    queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
    toast({
      title: tk("allergyAlertTitle"),
      description: p?.itemName
        ? `${p.itemName}${p?.allergies?.length ? ` — ${p.allergies.join(", ")}` : ""}`
        : tk("allergyAlertDesc"),
      variant: "destructive",
      duration: 8000,
    });
  }, [queryClient, playAllergyAlert, toast]));

  useRealtimeEvent("allergy:acknowledged", useCallback((payload: unknown) => {
    const p = payload as { orderItemId?: string; acknowledgedByName?: string } | null;
    queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
    toast({
      title: "Allergy Acknowledged",
      description: p?.acknowledgedByName
        ? `Chef ${p.acknowledgedByName} acknowledged the allergy alert`
        : "Allergy alert has been acknowledged",
      duration: 4000,
    });
  }, [queryClient, toast]));

  useRealtimeEvent("order:new", useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
    playChime();
  }, [queryClient, playChime]));

  useRealtimeEvent("order:updated", useCallback((payload: unknown) => {
    const p = payload as { orderId?: string; status?: string } | null;
    if (!p?.orderId) return;
    queryClient.setQueryData(["/api/kds/tickets", selectedStation], (old: KDSTicket[] | undefined) => {
      if (!old) return old;
      return old.map(t => t.id === p.orderId ? { ...t, status: p.status ?? t.status } : t);
    });
  }, [queryClient, selectedStation]));

  useRealtimeEvent("order:completed", useCallback((payload: unknown) => {
    const p = payload as { orderId?: string; status?: string } | null;
    if (!p?.orderId) return;
    queryClient.setQueryData(["/api/kds/tickets", selectedStation], (old: KDSTicket[] | undefined) => {
      if (!old) return old;
      return old.filter(t => t.id !== p.orderId);
    });
  }, [queryClient, selectedStation]));

  useRealtimeEvent("order:item_updated", useCallback((payload: unknown) => {
    const p = payload as { itemId?: string; orderId?: string; status?: string; orderStatus?: string } | null;
    if (!p?.orderId) return;
    queryClient.setQueryData(["/api/kds/tickets", selectedStation], (old: KDSTicket[] | undefined) => {
      if (!old) return old;
      return old.map(t => {
        if (t.id !== p.orderId) return t;
        const updatedStatus = p.orderStatus ?? t.status;
        const updatedItems = p.itemId
          ? t.items.map(i => i.id === p.itemId ? { ...i, status: p.status ?? i.status } : i)
          : t.items;
        return { ...t, status: updatedStatus, items: updatedItems };
      });
    });
  }, [queryClient, selectedStation]));

  const { data: stations = [] } = useQuery<KitchenStation[]>({
    queryKey: ["/api/kitchen-stations"],
  });

  const itemStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      await apiRequest("PATCH", `/api/kds/order-items/${itemId}/status`, { status });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] }); queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, station }: { orderId: string; status: string; station?: string }) => {
      await apiRequest("PATCH", `/api/kds/orders/${orderId}/items-status`, { status, station });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (e: Error) => { toast({ title: tk("toastError"), description: e.message, variant: "destructive" }); },
  });

  const startWithDeductionMutation = useMutation({
    mutationFn: async ({ orderId, station, force }: { orderId: string; station: string | null; force: boolean }) => {
      const res = await apiRequest("POST", `/api/kds/orders/${orderId}/start`, { station, force });
      if (!res.ok) {
        const data = await res.json();
        throw Object.assign(new Error(data.message), { status: res.status, data });
      }
      return res.json();
    },
    onSuccess: async (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setRecipeCheckState(null);
      toast({ title: tk("toastCookingStarted"), description: tk("toastCookingStartedDesc") });

      try {
        const res = await fetch(
          `/api/print-jobs?referenceId=${encodeURIComponent(vars.orderId)}&status=queued`,
          { credentials: "include" }
        );
        if (res.ok) {
          const jobs: Array<{ id: string; type: string; station: string | null; payload: any }> = await res.json();
          const kotJobs = jobs.filter(j => j.type === "kot");
          let printedCount = 0;
          let failedCount = 0;
          let usedNetworkPrinter = false;
          for (const job of kotJobs) {
            const stationPrinterUrl = job.station
              ? (queryClient.getQueryData<KitchenStation[]>(["/api/kitchen-stations"]) || [])
                  .find(s => s.name === job.station)?.printerUrl ?? null
              : null;
            const p = job.payload || {};
            const html = renderKotHtml({
              restaurantName: user?.tenant?.name || "Kitchen",
              kotNumber: p.orderId?.slice(-6).toUpperCase(),
              orderId: p.orderId || vars.orderId,
              orderType: p.orderType,
              tableNumber: p.tableNumber,
              station: p.station || job.station,
              sentAt: p.sentAt || new Date().toISOString(),
              items: p.items || [],
              language: printLanguage,
            });
            const result = await dispatchPrint(html, stationPrinterUrl, {
              onNetworkSuccess: () => {
                apiRequest("PATCH", `/api/print-jobs/${job.id}/status`, { status: "printed" }).catch(() => {});
              },
              onPopupPrint: () => {
                apiRequest("PATCH", `/api/print-jobs/${job.id}/status`, { status: "printed" }).catch(() => {});
              },
              onFailure: () => {
                apiRequest("PATCH", `/api/print-jobs/${job.id}/status`, { status: "failed" }).catch(() => {});
              },
            });
            if (stationPrinterUrl) usedNetworkPrinter = true;
            if (result === "failed") { failedCount++; } else { printedCount++; }
          }
          if (kotJobs.length > 0) {
            if (failedCount > 0 && printedCount === 0) {
              toast({ title: tk("toastKotPrintFailed"), description: tk("toastKotPrintFailedDesc"), variant: "destructive" });
            } else if (failedCount > 0) {
              toast({ title: tk("toastKotPartiallyPrinted"), description: tk("toastKotPartiallyPrintedDesc", { printed: printedCount, failed: failedCount }), variant: "destructive" });
            } else {
              toast({ title: tk("toastKotPrinted"), description: tk("toastKotPrintedDesc", { count: printedCount, dest: usedNetworkPrinter ? tk("networkPrinter") : tk("browserPrintDialog") }) });
            }
          }
        }
      } catch (_) {}
    },
    onError: (e: Error) => {
      const err = e as any;
      if (err.status === 409) {
        toast({ title: tk("toastStockWarning"), description: tk("toastStockWarningDesc"), variant: "destructive" });
      } else {
        toast({ title: tk("toastError"), description: e.message, variant: "destructive" });
      }
    },
  });

  const [wallPopoverOpen, setWallPopoverOpen] = useState(false);

  const regenerateWallTokenMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kds/wall-token/regenerate").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds/wall-token"] });
      refetchWallToken();
      toast({ title: tk("toastWallLinkRegenerated"), description: tk("toastWallLinkRegeneratedDesc") });
    },
    onError: (e: Error) => { toast({ title: tk("toastError"), description: e.message, variant: "destructive" }); },
  });

  const updateStationMutation = useMutation({
    mutationFn: async ({ id, printerUrl }: { id: string; printerUrl: string }) => {
      const res = await apiRequest("PATCH", `/api/kitchen-stations/${id}`, { printerUrl: printerUrl || null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen-stations"] });
      toast({ title: tk("toastStationUpdated"), description: tk("toastStationUpdatedDesc") });
    },
    onError: (e: Error) => { toast({ title: tk("toastError"), description: e.message, variant: "destructive" }); },
  });

  const wallScreenUrl = wallTokenData?.token
    ? `${window.location.origin}/kds/wall?token=${wallTokenData.token}`
    : undefined;

  const copyWallLink = useCallback(() => {
    if (wallScreenUrl) {
      navigator.clipboard.writeText(wallScreenUrl);
      toast({ title: tk("toastLinkCopied"), description: tk("toastLinkCopiedDesc") });
    }
  }, [wallScreenUrl, toast]);

  const handleItemStatus = useCallback((itemId: string, status: string) => {
    itemStatusMutation.mutate({ itemId, status });
  }, [itemStatusMutation]);

  const handleBulkStatus = useCallback((orderId: string, status: string, station?: string) => {
    bulkStatusMutation.mutate({ orderId, status, station });
  }, [bulkStatusMutation]);

  const handleStartWithRecipeCheck = useCallback((orderId: string, station: string | null) => {
    setRecipeCheckState({ orderId, station });
  }, []);

  const handleRecipeConfirm = useCallback((force: boolean) => {
    if (!recipeCheckState) return;
    startWithDeductionMutation.mutate({ orderId: recipeCheckState.orderId, station: recipeCheckState.station, force });
  }, [recipeCheckState, startWithDeductionMutation]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const filteredTickets = useMemo(() => {
    const ticketList = Array.isArray(tickets) ? tickets : [];
    if (!selectedStation) return ticketList;
    return ticketList.filter(t => t.items.some(i => i.station === selectedStation));
  }, [tickets, selectedStation]);

  const newTickets = filteredTickets.filter(t => t.status === "new" || t.status === "sent_to_kitchen");
  const inProgressTickets = filteredTickets.filter(t => t.status === "in_progress");
  const readyTickets = filteredTickets.filter(t => t.status === "ready");

  const stationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tickets) {
      if (t.status === "ready") continue;
      for (const i of t.items) {
        if (i.station && i.status !== "ready" && i.status !== "served") {
          counts[i.station] = (counts[i.station] || 0) + 1;
        }
      }
    }
    return counts;
  }, [tickets]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const columns = [
    { key: "new", title: tk("colNew"), tickets: newTickets, icon: Utensils, color: "teal" },
    { key: "cooking", title: tk("colCooking"), tickets: inProgressTickets, icon: Flame, color: "orange" },
    { key: "ready", title: tk("colReady"), tickets: readyTickets, icon: CheckCircle2, color: "green" },
  ];

  return (
    <div className="space-y-3" data-testid="dashboard-kitchen">
      <RecipeCheckDrawer
        open={!!recipeCheckState}
        onClose={() => setRecipeCheckState(null)}
        orderId={recipeCheckState?.orderId || ""}
        station={recipeCheckState?.station || null}
        onConfirm={handleRecipeConfirm}
      />
      <WastageModal open={wastageOpen} onClose={() => setWastageOpen(false)} station={selectedStation} />

      <Dialog open={stationSettingsOpen} onOpenChange={setStationSettingsOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-station-settings">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-violet-600" />
              {tk("stationPrinterSettings")}
            </DialogTitle>
            <DialogDescription>
              {tk("stationPrinterSettingsDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto">
            {stations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{tk("noStationsConfigured")}</p>
            ) : (
              stations.map(station => (
                <div key={station.id} className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ background: station.color }}
                    />
                    {station.displayName}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="http://192.168.1.100:9100 (optional)"
                      value={editingPrinterUrl[station.id] ?? (station.printerUrl || "")}
                      onChange={e =>
                        setEditingPrinterUrl(prev => ({ ...prev, [station.id]: e.target.value }))
                      }
                      className="font-mono text-xs"
                      data-testid={`input-printer-url-${station.name}`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateStationMutation.isPending}
                      onClick={() =>
                        updateStationMutation.mutate({
                          id: station.id,
                          printerUrl: editingPrinterUrl[station.id] ?? (station.printerUrl || ""),
                        })
                      }
                      data-testid={`button-save-printer-url-${station.name}`}
                    >
                      {tk("save")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={wallPopoverOpen} onOpenChange={setWallPopoverOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-wall-link">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-600" />
              {tk("wallScreenSharing")}
            </DialogTitle>
            <DialogDescription>
              {tk("wallScreenSharingDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {wallScreenUrl ? (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">{tk("shareableLink")}</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={wallScreenUrl}
                      className="font-mono text-xs"
                      data-testid="input-wall-link"
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <Button variant="outline" size="sm" className="shrink-0 gap-1" onClick={copyWallLink} data-testid="button-copy-wall-link">
                      <Copy className="h-4 w-4" />
                      {tk("copy")}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => window.open(wallScreenUrl, "_blank")}
                    data-testid="button-open-wall"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {tk("openWallScreen")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => regenerateWallTokenMutation.mutate()}
                    disabled={regenerateWallTokenMutation.isPending}
                    data-testid="button-regenerate-wall-token"
                    title={tk("regenerateLinkTitle")}
                  >
                    <RefreshCw className={`h-4 w-4 ${regenerateWallTokenMutation.isPending ? "animate-spin" : ""}`} />
                    {tk("regenerateLink")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tk("regenerateLinkNote")}
                </p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">{tk("loadingLink")}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10">
            <ChefHat className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold" data-testid="text-dashboard-title">{tk("pageTitle")}</h1>
            <p className="text-muted-foreground text-sm">
              {tk("activeTickets", { count: filteredTickets.length })}
              {selectedStation && ` · ${stations.find(s => s.name === selectedStation)?.displayName || selectedStation}`}
            </p>
          </div>
        </motion.div>

        <div className="flex items-center gap-2">
          {/* PR-009: Station selector dropdown in header for fast switching */}
          {stations.filter(s => s.active).length > 0 && (
            <Select
              value={selectedStation ?? "all"}
              onValueChange={(v) => setSelectedStation(v === "all" ? null : v)}
            >
              <SelectTrigger
                className="h-8 w-40 text-xs shrink-0"
                data-testid="select-kds-station-dropdown"
              >
                <SelectValue placeholder={tk("allStations")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-station-all">{tk("allStations")}</SelectItem>
                {stations.filter(s => s.active).map(station => (
                  <SelectItem
                    key={station.id}
                    value={station.name}
                    data-testid={`option-station-${station.name}`}
                  >
                    {station.displayName}
                    {(stationCounts[station.name] ?? 0) > 0 && ` (${stationCounts[station.name]})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {kdsRefreshing && (
            <span className="text-xs text-muted-foreground animate-pulse" data-testid="text-kds-refreshing">{tk("refreshing")}</span>
          )}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${wakeLockStatus === "active" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800" : "bg-muted text-muted-foreground border-border"}`}
            title={wakeLockStatus === "active" ? tk("wakeLockActiveTitle") : wakeLockStatus === "unavailable" ? tk("wakeLockUnavailableTitle") : tk("wakeLockInactiveTitle")}
            data-testid="badge-wake-lock-status"
          >
            {wakeLockStatus === "active" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
            {wakeLockStatus === "active" ? tk("screenAwake") : tk("screenMaySleep")}
          </span>
          <KitchenClockCard />
          {(user?.role === "owner" || user?.role === "manager") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStationSettingsOpen(true)}
              className="h-8 gap-1 border-violet-200 text-violet-600 hover:bg-violet-50"
              data-testid="button-station-settings"
              title={tk("stationPrinterSettings")}
            >
              <Printer className="h-3.5 w-3.5" /> {tk("printers")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWastageOpen(true)}
            className="h-8 gap-1 border-red-200 text-red-600 hover:bg-red-50"
            data-testid="button-report-wastage"
          >
            <Trash2 className="h-3.5 w-3.5" /> {tk("wastage")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/wastage-log")}
            className="h-8 gap-1 border-orange-200 text-orange-600 hover:bg-orange-50"
            data-testid="button-full-wastage-log"
          >
            <FileText className="h-3.5 w-3.5" /> {tk("fullLog")}
          </Button>
          <Button size="sm" variant="outline" onClick={toggleFullscreen} className="h-8 gap-1" data-testid="button-fullscreen">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? tk("exit") : tk("full")}
          </Button>
          {tenant?.id && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(wallScreenUrl || "/kds/wall", "_blank")}
                className="h-8 gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                data-testid="button-wall-screen"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {tk("wallScreen")}
              </Button>
              {(user?.role === "owner" || user?.role === "manager") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWallPopoverOpen(true)}
                  className="h-8 gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                  data-testid="button-wall-share"
                  title={tk("shareWallScreenLink")}
                >
                  <Monitor className="h-3.5 w-3.5" /> {tk("shareLink")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <PrinterStatusMiniBar />

      {user?.role === "kitchen" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={showAssignments ? "default" : "outline"}
              className="h-8 text-xs gap-1"
              onClick={() => setShowAssignments(v => !v)}
              data-testid="button-toggle-assignments"
            >
              <UserCheck className="h-3.5 w-3.5" />
              {tk("myTickets")}
              {myActiveCount > 0 && (
                <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px] bg-primary text-white">{myActiveCount}</Badge>
              )}
              {showAssignments ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={() => checkInMut.mutate()}
              disabled={checkInMut.isPending}
              data-testid="button-chef-checkin"
            >
              <CircleDot className="h-3.5 w-3.5 text-green-500" />
              {tk("checkIn")}
            </Button>
          </div>

          <AnimatePresence>
            {showAssignments && (
              <motion.div
                key="assignment-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-muted/40 rounded-xl p-3 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{tk("myActiveTickets")}</div>
                    {myActiveAssignments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{tk("noTicketsAssigned")}</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {myActiveAssignments.map((a: any) => (
                          <div key={a.id} className={`rounded-lg border p-2.5 text-xs space-y-1.5 ${
                            a.status === "in_progress" ? "bg-blue-50 border-blue-200" : "bg-yellow-50 border-yellow-200"
                          }`} data-testid={`my-ticket-${a.id}`}>
                            <div className="font-medium">{a.menuItemName ?? tk("ticket")}</div>
                            {a.tableNumber && <div className="text-muted-foreground">{tk("tableRef", { n: a.tableNumber })}</div>}
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {a.counterName ?? "—"}
                              {" · "}{a.status}
                            </div>
                            <div className="flex gap-1">
                              {a.status === "assigned" && (
                                <Button size="sm" className="h-6 text-[10px] px-2" variant="outline" onClick={() => startMut.mutate(a.id)} data-testid={`button-start-${a.id}`}>
                                  {tk("start")}
                                </Button>
                              )}
                              {(a.status === "assigned" || a.status === "in_progress") && (
                                <Button size="sm" className="h-6 text-[10px] px-2" variant="outline" onClick={() => completeMut.mutate(a.id)} data-testid={`button-done-${a.id}`}>
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> {tk("done")}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(assignmentPool as any[]).length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{tk("availablePool")}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {(assignmentPool as any[]).slice(0, 6).map((a: any) => (
                          <div key={a.id} className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs space-y-1.5" data-testid={`pool-ticket-${a.id}`}>
                            <div className="font-medium">{a.menuItemName ?? tk("ticket")}</div>
                            {a.tableNumber && <div className="text-muted-foreground">{tk("tableRef", { n: a.tableNumber })}</div>}
                            <div className="text-muted-foreground">{a.counterName ?? "—"}</div>
                            <Button size="sm" className="h-6 text-[10px] px-2" variant="outline" onClick={() => selfAssignMut.mutate(a.id)} data-testid={`button-selfassign-${a.id}`}>
                              <ArrowRightLeft className="h-3 w-3 mr-0.5" /> {tk("take")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={selectedStation === null ? "default" : "outline"}
          className="h-8 text-xs shrink-0 gap-1"
          onClick={() => setSelectedStation(null)}
          data-testid="btn-station-all"
        >
          <Filter className="h-3 w-3" />
          {tk("allStations")}
          <Badge variant="secondary" className="ml-1 text-[10px] h-4 min-w-4 px-1">{tickets.filter(t => t.status !== "ready").length}</Badge>
        </Button>
        {stations.filter(s => s.active).map(station => {
          const StationIcon = STATION_ICONS[station.name] || CookingPot;
          const count = stationCounts[station.name] || 0;
          return (
            <Button
              key={station.id}
              size="sm"
              variant={selectedStation === station.name ? "default" : "outline"}
              className="h-8 text-xs shrink-0 gap-1"
              onClick={() => setSelectedStation(station.name === selectedStation ? null : station.name)}
              data-testid={`btn-station-${station.name}`}
              style={selectedStation === station.name ? { backgroundColor: station.color, borderColor: station.color } : {}}
            >
              <StationIcon className="h-3 w-3" />
              {station.displayName}
              {count > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4 min-w-4 px-1">{count}</Badge>}
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col, colIdx) => {
          const ColIcon = col.icon;
          const colorMap: Record<string, { border: string; headerBg: string; headerText: string; badge: string }> = {
            teal: { border: "border-t-teal-600", headerBg: "bg-teal-50 dark:bg-teal-950/40", headerText: "text-teal-700 dark:text-teal-300", badge: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
            orange: { border: "border-t-orange-500", headerBg: "bg-orange-50 dark:bg-orange-950/40", headerText: "text-orange-700 dark:text-orange-300", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
            green: { border: "border-t-green-500", headerBg: "bg-green-50 dark:bg-green-950/40", headerText: "text-green-700 dark:text-green-300", badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
          };
          const cm = colorMap[col.color];
          return (
            <motion.div
              key={col.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: colIdx * 0.08 }}
              className={`space-y-3 border-t-4 ${cm.border} pt-0 rounded-xl overflow-hidden`}
            >
              <div className={`flex items-center justify-between p-3 ${cm.headerBg} rounded-b-lg`}>
                <div className="flex items-center gap-2">
                  <ColIcon className={`h-4 w-4 ${cm.headerText}`} />
                  <h2 className={`font-heading font-semibold text-sm uppercase tracking-wide ${cm.headerText}`}>
                    {col.title}
                  </h2>
                </div>
                <Badge className={`${cm.badge} font-mono text-xs`}>
                  {col.tickets.length}
                </Badge>
              </div>
              <div className="space-y-3 px-1 pb-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                <AnimatePresence mode="popLayout">
                  {col.tickets.length === 0 ? (
                    <motion.p
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-muted-foreground text-center py-8"
                    >
                      {tk("noTickets")}
                    </motion.p>
                  ) : (
                    col.tickets.map(ticket => (
                      <KDSTicketCard
                        key={ticket.id}
                        ticket={ticket}
                        stationFilter={selectedStation}
                        onItemStatus={handleItemStatus}
                        onBulkStatus={handleBulkStatus}
                        onStartWithRecipeCheck={handleStartWithRecipeCheck}
                        restaurantName={tenant?.name || "Restaurant"}
                        stationPrinterUrl={selectedStation ? stations.find(s => s.name === selectedStation)?.printerUrl : null}
                        hasPrintQueued={queuedOrderIds.has(ticket.id)}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
