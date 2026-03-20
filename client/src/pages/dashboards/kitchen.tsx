import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChefHat, Flame, CheckCircle2, Utensils, Clock, LogIn, LogOut, CheckCircle, AlertCircle,
  Maximize2, Minimize2, RotateCcw, Coffee, IceCream, Beef, CookingPot, Filter,
  AlertTriangle, X, Package, Trash2, CheckSquare, Monitor, Copy, RefreshCw, ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useCallback } from "react";
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
  recipeId: string;
  recipeName: string;
  ingredients: RecipeCheckIngredient[];
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: "Clocked In" }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const clockOutMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/attendance/clock-out", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] }); toast({ title: "Clocked Out" }); },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  if (isLoading) return null;

  return (
    <div data-testid="card-clock-in-out" className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${isClockedIn ? "border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"}`}>
      {isClockedIn ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-orange-600" />}
      <span className="text-sm font-medium" data-testid="text-attendance-status">
        {isClockedIn ? "Clocked In" : isClockedOut ? "Shift Complete" : "Not Clocked In"}
      </span>
      {isClockedIn && elapsed && <span className="text-xs text-muted-foreground">({elapsed})</span>}
      {isClockedIn && attendanceStatus.status === "late" && <Badge className="bg-amber-100 text-amber-700 text-xs"><AlertCircle className="h-3 w-3 mr-1" />Late</Badge>}
      {!isClockedIn && !isClockedOut && (
        <Button size="sm" onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending} className="bg-green-600 hover:bg-green-700 gap-1 h-7 text-xs" data-testid="button-clock-in">
          <LogIn className="h-3 w-3" /> Clock In
        </Button>
      )}
      {isClockedIn && (
        <Button size="sm" variant="outline" onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending} className="border-red-300 text-red-600 gap-1 h-7 text-xs" data-testid="button-clock-out">
          <LogOut className="h-3 w-3" /> Clock Out
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
  const url = station
    ? `/api/kds/recipe-check/${orderId}?station=${encodeURIComponent(station)}`
    : `/api/kds/recipe-check/${orderId}`;
  const { data: recipeItems = [], isLoading } = useQuery<RecipeCheckItem[]>({
    queryKey: ["/api/kds/recipe-check", orderId, station],
    queryFn: () => fetch(url, { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });

  const allIngredients = recipeItems.flatMap(r => r.ingredients);
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
            Recipe Check — Start Cooking
          </DialogTitle>
          <DialogDescription>
            Review ingredients and stock levels before confirming.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : recipeItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No recipes linked. Chef can proceed directly.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hasInsufficient && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" data-testid="warning-insufficient-stock">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 dark:text-red-300">
                  <p className="font-medium">Insufficient stock detected</p>
                  {outIngredients.length > 0 && (
                    <p className="text-xs mt-1">Out of stock: {outIngredients.map(i => i.name).join(", ")}</p>
                  )}
                  {lowIngredients.length > 0 && (
                    <p className="text-xs mt-1">Low stock: {lowIngredients.map(i => `${i.name} (${i.available}${i.unit} of ${i.required}${i.unit} needed)`).join(", ")}</p>
                  )}
                </div>
              </div>
            )}

            {recipeItems.map(ri => (
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
                        <span className="text-muted-foreground">Need: <span className="font-semibold text-foreground">{ing.required}{ing.unit}</span></span>
                        <span className={`font-semibold ${stockColor(ing.status)}`}>
                          Stock: {ing.available}{ing.unit} {ing.status === "ok" ? "✅" : ing.status === "low" ? "⚠️" : "❌"}
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
                <AlertTriangle className="h-4 w-4" /> Proceed Anyway
              </Button>
              <Button variant="outline" className="w-full" onClick={onClose} data-testid="button-cancel-start">
                <X className="h-4 w-4 mr-2" /> Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 gap-2"
                onClick={() => onConfirm(false)}
                data-testid="button-confirm-start"
              >
                <Flame className="h-4 w-4" /> Confirm & Start Cooking
              </Button>
              <Button variant="ghost" className="w-full" onClick={onClose} data-testid="button-cancel-start">
                Cancel
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
      toast({ title: "Wastage reported", description: "Stock deducted and logged." });
      setInventoryItemId(""); setQuantity(""); setReason("");
      onClose();
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-wastage">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" /> Report Wastage
          </DialogTitle>
          <DialogDescription>Log wasted or spoiled ingredients. Stock will be deducted.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wastage-ingredient">Ingredient</Label>
            <Select value={inventoryItemId} onValueChange={setInventoryItemId}>
              <SelectTrigger id="wastage-ingredient" data-testid="select-wastage-ingredient">
                <SelectValue placeholder="Select ingredient..." />
              </SelectTrigger>
              <SelectContent>
                {inventory.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.unit}) — Stock: {item.currentStock}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wastage-qty">Quantity Wasted</Label>
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
            <Label htmlFor="wastage-reason">Reason (optional)</Label>
            <Textarea
              id="wastage-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Spoilage, Overcooked, Dropped..."
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
            <Trash2 className="h-4 w-4" /> Report Wastage
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-wastage">Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KDSTicketCard({ ticket, stationFilter, onItemStatus, onBulkStatus, onStartWithRecipeCheck }: {
  ticket: KDSTicket;
  stationFilter: string | null;
  onItemStatus: (itemId: string, status: string) => void;
  onBulkStatus: (orderId: string, status: string, station?: string) => void;
  onStartWithRecipeCheck: (orderId: string, station: string | null) => void;
}) {
  const mins = useElapsedMinutes(ticket.createdAt);
  const timeColor = getTimeColor(mins);
  const timeBorder = getTimeBorder(mins);
  const timeBg = getTimeBg(mins);
  const isNew = ticket.status === "new" || ticket.status === "sent_to_kitchen";
  const isLate = mins >= 15;
  const [confirmReady, setConfirmReady] = useState<string | null>(null);

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
        className={`overflow-hidden border-l-4 ${timeBorder} ${timeBg} transition-all duration-200 ${isLate && !allReady ? "animate-pulse ring-2 ring-red-400/50" : ""} ${isNew ? "animate-[kds-flash_1.5s_ease-in-out_3] ring-2 ring-primary/40" : ""}`}
        data-testid={`kds-ticket-${ticket.id.slice(-4)}`}
      >
        <CardHeader className="p-3 pb-1.5 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
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
          </div>
          <div className={`flex items-center gap-1 text-xs font-mono tabular-nums font-semibold ${timeColor}`}>
            <Clock className="h-3 w-3" />
            {formatElapsed(mins)}
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
              {courseItems.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className={`font-medium ${item.status === "ready" ? "line-through text-muted-foreground" : ""}`}>
                      {item.quantity}× {item.name}
                    </span>
                    {item.notes && <span className="text-xs text-red-600 dark:text-red-400 font-medium italic truncate">⚠ {item.notes}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(!item.status || item.status === "pending") && (
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs hover:bg-orange-100" onClick={() => onItemStatus(item.id, "cooking")} data-testid={`btn-start-${item.id.slice(-4)}`}>
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
              ))}
            </div>
          ))}

          <div className="flex items-center justify-end gap-1.5 pt-1 border-t">
            {allPending && (
              hasRecipe ? (
                <Button size="sm" className="h-7 text-xs gap-1 bg-orange-500 hover:bg-orange-600" onClick={() => onStartWithRecipeCheck(ticket.id, stationFilter)} data-testid={`btn-start-all-${ticket.id.slice(-4)}`}>
                  <Flame className="h-3 w-3" /> Start All
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs gap-1 bg-orange-500 hover:bg-orange-600" onClick={() => onBulkStatus(ticket.id, "cooking", stationFilter || undefined)} data-testid={`btn-start-all-${ticket.id.slice(-4)}`}>
                  <Flame className="h-3 w-3" /> Start All
                </Button>
              )
            )}
            {allCooking && (
              <>
                <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => setConfirmReady(stationFilter || "__all")} data-testid={`btn-ready-all-${ticket.id.slice(-4)}`}>
                  <CheckCircle2 className="h-3 w-3" /> All Ready
                </Button>
                <AlertDialog open={!!confirmReady} onOpenChange={(open) => !open && setConfirmReady(null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Mark all as ready?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Confirm that all items for {ticket.tableNumber ? `Table ${ticket.tableNumber}` : `Order ${ticket.id.slice(-6).toUpperCase()}`} are ready to serve.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-ready">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="button-confirm-ready"
                        onClick={() => {
                          onBulkStatus(ticket.id, "ready", confirmReady === "__all" ? undefined : (confirmReady ?? undefined));
                          setConfirmReady(null);
                        }}
                      >
                        Yes, Mark Ready
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {someReady && !allReady && !allCooking && !allPending && (
              <Badge variant="outline" className="text-xs text-orange-600">Partial</Badge>
            )}
            {allReady && (
              <Button size="sm" className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700" onClick={() => onBulkStatus(ticket.id, "served", stationFilter || undefined)} data-testid={`btn-served-all-${ticket.id.slice(-4)}`}>
                <Utensils className="h-3 w-3" /> Served
              </Button>
            )}
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

export default function KitchenDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, tenant } = useAuth();
  const [selectedStation, setSelectedStation] = useState<string | null>(() => {
    return localStorage.getItem("kds_station") || null;
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [recipeCheckState, setRecipeCheckState] = useState<{ orderId: string; station: string | null } | null>(null);
  const [wastageOpen, setWastageOpen] = useState(false);

  useEffect(() => {
    if (selectedStation) localStorage.setItem("kds_station", selectedStation);
    else localStorage.removeItem("kds_station");
  }, [selectedStation]);

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
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.35);
      });
    } catch (_) {}
  }, []);

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
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setRecipeCheckState(null);
      toast({ title: "Cooking started", description: "Stock deducted and KOT logged." });
    },
    onError: (e: Error) => {
      const err = e as any;
      if (err.status === 409) {
        toast({ title: "Stock Warning", description: "Some ingredients are insufficient. Check the recipe drawer.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  const [wallPopoverOpen, setWallPopoverOpen] = useState(false);

  const regenerateWallTokenMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kds/wall-token/regenerate").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kds/wall-token"] });
      refetchWallToken();
      toast({ title: "Wall screen link regenerated", description: "Share the new link. The old link is now invalid." });
    },
    onError: (e: Error) => { toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const wallScreenUrl = wallTokenData?.token
    ? `${window.location.origin}/kds/wall?token=${wallTokenData.token}`
    : undefined;

  const copyWallLink = useCallback(() => {
    if (wallScreenUrl) {
      navigator.clipboard.writeText(wallScreenUrl);
      toast({ title: "Link copied!", description: "Share it with kitchen staff to view the wall screen." });
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
    if (!selectedStation) return tickets;
    return tickets.filter(t => t.items.some(i => i.station === selectedStation));
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
    { key: "new", title: "NEW", tickets: newTickets, icon: Utensils, color: "teal" },
    { key: "cooking", title: "COOKING", tickets: inProgressTickets, icon: Flame, color: "orange" },
    { key: "ready", title: "READY", tickets: readyTickets, icon: CheckCircle2, color: "green" },
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

      <Dialog open={wallPopoverOpen} onOpenChange={setWallPopoverOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-wall-link">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-600" />
              Wall Screen Sharing
            </DialogTitle>
            <DialogDescription>
              Share this secure link with kitchen staff to view the live order display. The link works without login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {wallScreenUrl ? (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Shareable Link</Label>
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
                      Copy
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
                    Open Wall Screen
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => regenerateWallTokenMutation.mutate()}
                    disabled={regenerateWallTokenMutation.isPending}
                    data-testid="button-regenerate-wall-token"
                    title="Revoke old link and generate a new one"
                  >
                    <RefreshCw className={`h-4 w-4 ${regenerateWallTokenMutation.isPending ? "animate-spin" : ""}`} />
                    Regenerate Link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Regenerating creates a new link and immediately invalidates the old one.
                </p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">Loading link…</div>
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
            <h1 className="text-xl font-heading font-bold" data-testid="text-dashboard-title">Kitchen Display System</h1>
            <p className="text-muted-foreground text-sm">
              {filteredTickets.length} active ticket{filteredTickets.length !== 1 ? "s" : ""}
              {selectedStation && ` · ${stations.find(s => s.name === selectedStation)?.displayName || selectedStation}`}
            </p>
          </div>
        </motion.div>

        <div className="flex items-center gap-2">
          <KitchenClockCard />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWastageOpen(true)}
            className="h-8 gap-1 border-red-200 text-red-600 hover:bg-red-50"
            data-testid="button-report-wastage"
          >
            <Trash2 className="h-3.5 w-3.5" /> Wastage
          </Button>
          <Button size="sm" variant="outline" onClick={toggleFullscreen} className="h-8 gap-1" data-testid="button-fullscreen">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? "Exit" : "Full"}
          </Button>
          {tenant?.id && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(wallScreenUrl || `/kds/wall?tenantId=${tenant.id}`, "_blank")}
                className="h-8 gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                data-testid="button-wall-screen"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Wall Screen
              </Button>
              {(user?.role === "owner" || user?.role === "manager") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWallPopoverOpen(true)}
                  className="h-8 gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                  data-testid="button-wall-share"
                  title="Share wall screen link"
                >
                  <Monitor className="h-3.5 w-3.5" /> Share Link
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={selectedStation === null ? "default" : "outline"}
          className="h-8 text-xs shrink-0 gap-1"
          onClick={() => setSelectedStation(null)}
          data-testid="btn-station-all"
        >
          <Filter className="h-3 w-3" />
          All Stations
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
                      No tickets
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
