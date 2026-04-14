import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getCsrfToken } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChefHat, RefreshCw, Users, Clock, AlertTriangle, CheckCircle2,
  LayoutGrid, ArrowRightLeft, UserCheck, Zap, Circle, Timer,
  TrendingUp, BarChart3, X, Play, Pause, ChevronDown, ChevronUp, Flag,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useTimer, formatMMSS, getTimingStatus } from "@/hooks/useTimer";
import { ALLERGENS, hasAllergens } from "@shared/allergens";
import { PageLoader } from "@/components/PageLoader";

// DEL-06: Standardize order ID display to last-6-chars uppercase across all KDS views
function shortOrderId(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

interface Assignment {
  id: string;
  menuItemName?: string;
  tableNumber?: number;
  counterName?: string;
  counterId?: string;
  chefId?: string;
  chefName?: string;
  status: string;
  assignmentType?: string;
  createdAt: string;
  assignedAt?: string;
  startedAt?: string;
  estimatedTimeMin?: number;
}

interface ChefAvailability {
  chefId: string;
  chefName?: string;
  counterId?: string;
  counterName?: string;
  status: string;
  activeTickets: number;
  shiftDate: string;
}

interface Counter {
  id: string;
  name: string;
  label?: string;
  station?: string;
  maxChefs?: number;
  isActive: boolean;
}

interface BoardData {
  byCounter: Record<string, { counter: Counter | null; assignments: Assignment[]; chefs: ChefAvailability[] }>;
  unassigned: Assignment[];
  totalLive: number;
  avgWaitMin: number;
}

interface KdsItem {
  id: string;
  name: string;
  quantity: number | null;
  status: string | null;
  cookingStatus: string | null;
  station: string | null;
  estimatedReadyAt: string | null;
  startedAt: string | null;
  courseNumber: number | null;
  prepTimeMinutes: number | null;
  is_voided?: boolean;
  voidedReason?: string | null;
  has_allergy?: boolean;
  allergy_flags?: string[] | null;
  allergy_details?: string | null;
  allergy_acknowledged?: boolean;
}

interface KdsTicket {
  id: string;
  tableNumber?: number;
  orderType?: string;
  status: string;
  createdAt: string | null;
  items: KdsItem[];
  isRush?: boolean;
}

interface KitchenSettings {
  cooking_control_mode: "auto_start" | "selective" | "course_only";
  allow_rush_override: boolean;
  rush_requires_manager_pin: boolean;
}

interface OutletOption {
  id: string;
  name: string;
}

interface AnalyticsChefRow {
  chefId: string;
  chefName?: string | null;
  total: number;
  completed: number;
  avgTimeMin?: number | null;
}

interface AnalyticsData {
  totalTickets?: number;
  avgCompletionTime?: number;
  completionRate?: number;
  perChef?: AnalyticsChefRow[];
  efficiency?: {
    autoAssignRate?: number;
    avgOrderToAssignSec?: number | null;
    avgAssignToStartSec?: number | null;
  };
}

function mapItemStatus(item: KdsItem): string {
  if (item.cookingStatus) return item.cookingStatus;
  const s = item.status ?? "pending";
  if (s === "pending") return "queued";
  if (s === "cooking") return "started";
  if (s === "done" || s === "ready") return "ready";
  if (s === "served") return "served";
  return "queued";
}

function ItemStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: "bg-gray-400",
    hold: "bg-purple-500",
    ready_to_start: "bg-amber-500 animate-pulse",
    started: "bg-blue-500",
    almost_ready: "bg-teal-500",
    ready: "bg-green-500",
    held_warm: "bg-orange-500",
    served: "bg-gray-300",
  };
  return <div className={`h-2 w-2 rounded-full ${colors[status] ?? "bg-gray-400"}`} />;
}

function ItemCountdown({ estimatedReadyAt, itemId }: { estimatedReadyAt: string; itemId: string }) {
  const [secLeft, setSecLeft] = useState(() => Math.round((new Date(estimatedReadyAt).getTime() - Date.now()) / 1000));
  useEffect(() => {
    const iv = setInterval(() => setSecLeft(Math.round((new Date(estimatedReadyAt).getTime() - Date.now()) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [estimatedReadyAt]);
  if (secLeft <= 0) return <span className="text-red-500 font-bold animate-pulse text-[10px]" data-testid={`timer-${itemId}`}>OVERDUE</span>;
  const m = Math.floor(secLeft / 60), s = secLeft % 60;
  const color = secLeft < 120 ? "text-amber-600" : "text-blue-600";
  return <span className={`${color} font-mono text-[10px]`} data-testid={`timer-${itemId}`}>{m}:{s.toString().padStart(2, "0")}</span>;
}

type HoldType = "manual" | "item" | "minutes";

function KdsHoldDialog({
  open, item, siblingItems, onClose, onHeld,
}: {
  open: boolean;
  item: KdsItem | null;
  siblingItems?: KdsItem[];
  onClose: () => void;
  onHeld: () => void;
}) {
  const [holdType, setHoldType] = useState<HoldType>("manual");
  const [holdItemId, setHoldItemId] = useState("");
  const [holdMinutes, setHoldMinutes] = useState(5);
  const [holdReason, setHoldReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!item) return;
    setLoading(true);
    const body: { holdReason: string; holdUntilItemId?: string; holdUntilMinutes?: number } = { holdReason };
    if (holdType === "item") body.holdUntilItemId = holdItemId;
    if (holdType === "minutes") body.holdUntilMinutes = holdMinutes;
    try {
      const csrf = getCsrfToken();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (csrf) hdrs["x-csrf-token"] = csrf;
      const res = await fetch(`/api/kds/items/${item.id}/hold`, { method: "PUT", headers: hdrs, body: JSON.stringify(body), credentials: "include" });
      if (!res.ok) {
        await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "pending" }), credentials: "include" });
      }
    } catch (_) {}
    setLoading(false);
    onHeld();
    onClose();
  }

  const holdOptions: { value: HoldType; label: string }[] = [
    { value: "manual", label: "Hold until I manually start it" },
    { value: "item", label: "Hold until another item is ready" },
    { value: "minutes", label: "Hold for N minutes" },
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent data-testid="dialog-hold">
        <DialogHeader><DialogTitle>HOLD ITEM</DialogTitle></DialogHeader>
        {item && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{item.name}</p>
            <div className="space-y-2">
              <Label>Hold until:</Label>
              {holdOptions.map(opt => (
                <div
                  key={opt.value}
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${holdType === opt.value ? "border-primary bg-primary/10" : "border-border"}`}
                  onClick={() => setHoldType(opt.value)}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${holdType === opt.value ? "border-primary" : "border-muted-foreground"}`}>
                    {holdType === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <span className="text-sm">{opt.label}</span>
                </div>
              ))}
            </div>
            {holdType === "item" && siblingItems && siblingItems.length > 1 && (
              <div>
                <Label>Wait for item:</Label>
                <Select value={holdItemId} onValueChange={setHoldItemId}>
                  <SelectTrigger data-testid="select-hold-until-item">
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {siblingItems.filter(i => i.id !== item.id).map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {holdType === "minutes" && (
              <div>
                <Label>Hold for (minutes):</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={holdMinutes}
                  onChange={e => setHoldMinutes(+e.target.value)}
                  data-testid="input-hold-minutes"
                />
              </div>
            )}
            <div>
              <Label>Reason (optional):</Label>
              <Input
                value={holdReason}
                onChange={e => setHoldReason(e.target.value)}
                placeholder="Why is this on hold?"
                data-testid="input-hold-reason"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading || (holdType === "item" && !holdItemId)}>
            HOLD ITEM
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KdsRushDialog({
  open, ticketId, ticketLabel, requiresPin, onClose, onRushed,
}: {
  open: boolean;
  ticketId: string;
  ticketLabel: string;
  requiresPin: boolean;
  onClose: () => void;
  onRushed: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState("");

  async function submit() {
    setLoading(true);
    try {
      const body: { managerPin?: string } = requiresPin && pin ? { managerPin: pin } : {};
      const csrf = getCsrfToken();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (csrf) hdrs["x-csrf-token"] = csrf;
      const res = await fetch(`/api/kds/orders/${ticketId}/rush`, { method: "PUT", headers: hdrs, body: JSON.stringify(body), credentials: "include" });
      if (!res.ok) {
        await fetch(`/api/orders/${ticketId}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "rush" }), credentials: "include" });
      }
    } catch (_) {}
    setLoading(false);
    onRushed();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent data-testid="dialog-rush">
        <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Zap className="h-4 w-4" />RUSH Order</DialogTitle></DialogHeader>
        <p className="text-sm">Mark <strong>{ticketLabel}</strong> as RUSH? All items will be expedited.</p>
        {requiresPin && (
          <div>
            <Label>Manager PIN:</Label>
            <Input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="Enter PIN"
              data-testid="input-rush-pin"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={loading || (requiresPin && !pin)} data-testid="button-confirm-rush">
            <Zap className="h-4 w-4 mr-1" />RUSH
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KdsItemRow({
  item, siblingItems, onRefresh, courseLocked, ticketStatus,
}: {
  item: KdsItem;
  siblingItems?: KdsItem[];
  onRefresh: () => void;
  courseLocked?: boolean;
  ticketStatus?: string;
}) {
  const [loading, setLoading] = useState(false);
  const canStart = ticketStatus === "new" || ticketStatus === "sent_to_kitchen";
  const [showHold, setShowHold] = useState(false);
  // ALL-02: optimistic local acknowledged state (synced from server via item.allergy_acknowledged)
  const [allergyAcked, setAllergyAcked] = useState(item.allergy_acknowledged ?? false);
  const [ackLoading, setAckLoading] = useState(false);
  const cs = mapItemStatus(item);

  async function startItem() {
    setLoading(true);
    try {
      const csrf = getCsrfToken();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (csrf) hdrs["x-csrf-token"] = csrf;
      const res = await fetch(`/api/kds/items/${item.id}/start`, { method: "PUT", headers: hdrs, credentials: "include" });
      if (!res.ok) {
        await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "cooking" }), credentials: "include" });
      }
    } catch (_) {}
    setLoading(false);
    onRefresh();
  }

  async function readyItem() {
    setLoading(true);
    try {
      const csrf = getCsrfToken();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (csrf) hdrs["x-csrf-token"] = csrf;
      const res = await fetch(`/api/kds/items/${item.id}/ready`, { method: "PUT", headers: hdrs, credentials: "include" });
      if (!res.ok) {
        await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "ready" }), credentials: "include" });
      }
    } catch (_) {}
    setLoading(false);
    onRefresh();
  }

  // ALL-02: persist allergy acknowledgment to DB
  async function acknowledgeAllergy() {
    if (allergyAcked || ackLoading) return;
    setAckLoading(true);
    setAllergyAcked(true); // optimistic
    try {
      const csrf = getCsrfToken();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (csrf) hdrs["x-csrf-token"] = csrf;
      await fetch(`/api/kds/items/${item.id}/acknowledge-allergy`, {
        method: "PATCH",
        headers: hdrs,
        credentials: "include",
      });
    } catch (_) {}
    setAckLoading(false);
    onRefresh();
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 py-1 text-xs border-b last:border-0" data-testid={`row-item-${item.id}`}>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <ItemStatusDot status={cs} />
          <span className={item.is_voided ? "truncate font-medium line-through opacity-60" : "truncate font-medium"}>{item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</span>
          {item.is_voided && (
            <div className="px-1.5 py-0.5 bg-red-100 rounded text-[10px] text-red-700 flex-shrink-0">
              <span className="font-semibold">VOID</span>
              {item.voidedReason && <span className="ml-1 font-normal">— {item.voidedReason}</span>}
            </div>
          )}
          {cs === "started" && item.estimatedReadyAt && (
            <ItemCountdown estimatedReadyAt={item.estimatedReadyAt} itemId={item.id} />
          )}
        </div>
        {/* ALL-02: Allergy badge — clickable to acknowledge; persists to DB */}
        {item.has_allergy && (
          <button
            onClick={acknowledgeAllergy}
            disabled={allergyAcked || ackLoading}
            className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 font-semibold border transition-colors ${
              allergyAcked
                ? "bg-green-100 border-green-300 text-green-700 cursor-default"
                : "bg-red-100 border-red-200 text-red-700 animate-pulse cursor-pointer hover:bg-red-200"
            }`}
            title={allergyAcked ? "Allergy acknowledged" : "Tap to acknowledge allergy"}
            data-testid={`allergy-alert-${item.id}`}
          >
            {allergyAcked
              ? `✓ ALLERGY${item.allergy_flags?.length ? `: ${item.allergy_flags.join(", ")}` : ""}`
              : `⚠ ALLERGY${item.allergy_flags?.length ? `: ${item.allergy_flags.join(", ")}` : ""}`}
          </button>
        )}
                    {/* Structured Allergen Display */}
                    {item.allergen_flags && Object.values(item.allergen_flags as any).some(Boolean) && (
                      <div className="mt-1 p-1.5 bg-red-50 border border-red-300 rounded text-xs">
                        <span className="font-bold text-red-700 uppercase tracking-wide text-xs">⚠️ ALLERGENS:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {ALLERGENS.filter(a => (item.allergen_flags as any)?.[a.key]).map(a => (
                            <span key={a.key} className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-medium">{a.icon} {a.label}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.allergen_may_contain && Object.values(item.allergen_may_contain as any).some(Boolean) && (
                      <div className="mt-1 p-1.5 bg-amber-50 border border-amber-300 rounded text-xs">
                        <span className="font-bold text-amber-700 text-xs">⚠️ MAY CONTAIN:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {ALLERGENS.filter(a => (item.allergen_may_contain as any)?.[a.key]).map(a => (
                            <span key={a.key} className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">{a.icon} {a.label}</span>
                          ))}
                        </div>
                      </div>
                    )}
        <div className="flex items-center gap-1 shrink-0" data-testid={`status-${item.id}`}>
          {!item.is_voided && (courseLocked ? (
            <span className="text-yellow-500 text-[10px]">🔒</span>
          ) : canStart && (cs === "queued" || cs === "ready_to_start") ? (
            <>
              <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={startItem} disabled={loading} data-testid={`button-start-${item.id}`}>
                <Play className="h-2.5 w-2.5 mr-0.5" />Start
              </Button>
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1 text-purple-600" onClick={() => setShowHold(true)} data-testid={`button-hold-${item.id}`}>
                <Pause className="h-2.5 w-2.5" />
              </Button>
            </>
          ) : cs === "started" || cs === "almost_ready" ? (
            <>
              <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5 text-green-700" onClick={readyItem} disabled={loading} data-testid={`button-ready-${item.id}`}>
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Ready
              </Button>
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1 text-purple-600" onClick={() => setShowHold(true)} data-testid={`button-hold-${item.id}`}>
                <Pause className="h-2.5 w-2.5" />
              </Button>
            </>
          ) : null)}
        </div>
      </div>
      <KdsHoldDialog
        open={showHold}
        item={item}
        siblingItems={siblingItems}
        onClose={() => setShowHold(false)}
        onHeld={onRefresh}
      />
    </>
  );
}

function CookingControlTicket({
  ticket, onRefresh, rushRequiresPin,
}: {
  ticket: KdsTicket;
  onRefresh: () => void;
  rushRequiresPin?: boolean;
}) {
  const [showRush, setShowRush] = useState(false);
  // DEL-06: Standardized order ID label — table number, order type, or last-6-char shortId
  const label = ticket.tableNumber
    ? `Table ${ticket.tableNumber}`
    : ticket.orderType === "takeaway"
    ? "Takeaway"
    : shortOrderId(ticket.id);
  const items = (ticket.items ?? []).filter(i => mapItemStatus(i) !== "served" && !i.is_voided);
  const readyCount = items.filter(i => mapItemStatus(i) === "ready").length;

  const byCourse = items.reduce<Record<string, KdsItem[]>>((acc, item) => {
    const key = String(item.courseNumber ?? 0);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});
  const hasCourses = Object.keys(byCourse).some(k => k !== "0");

  return (
    <>
      <Card className={`${ticket.isRush ? "border-red-500 border-2 ring-2 ring-red-200 bg-red-50/30" : readyCount === items.length && items.length > 0 ? "border-green-300 bg-green-50/50" : ""}`} data-testid={`ticket-ctrl-${ticket.id}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>{label}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-normal text-muted-foreground">{readyCount}/{items.length} ready</span>
              {(ticket.status === "new" || ticket.status === "sent_to_kitchen") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-1.5 text-destructive hover:text-destructive"
                onClick={() => setShowRush(true)}
                data-testid={`button-rush-${ticket.id}`}
              >
                <Zap className="h-3 w-3 mr-0.5" />RUSH
              </Button>
              )}
            </div>
          </CardTitle>
          <div className="w-full bg-gray-200 rounded-full h-1.5" data-testid={`progress-order-${ticket.id}`}>
            <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: items.length > 0 ? `${(readyCount / items.length) * 100}%` : "0%" }} />
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          {hasCourses ? (
            Object.entries(byCourse).sort(([a], [b]) => Number(a) - Number(b)).map(([courseKey, courseItems]) => {
              const cn = Number(courseKey);
              const prevKey = String(cn - 1);
              const prevItems = byCourse[prevKey] || [];
              const prevFired = prevItems.length === 0 || prevItems.every(pi => {
                const s = mapItemStatus(pi);
                return s === "ready" || s === "served";
              });
              const isLocked = cn > 1 && !prevFired;
              return (
                <div key={courseKey}>
                  {cn > 0 && (
                    <div className={`text-[10px] font-semibold uppercase tracking-wider py-0.5 ${isLocked ? "text-yellow-600" : "text-muted-foreground"}`}>
                      {isLocked ? "🔒 " : ""}Course {cn}{isLocked ? " (waiting)" : ""}
                    </div>
                  )}
                  {courseItems.map(item => (
                    <KdsItemRow
                      key={item.id}
                      item={item}
                      siblingItems={courseItems}
                      onRefresh={onRefresh}
                      courseLocked={isLocked}
                      ticketStatus={ticket.status}
                    />
                  ))}
                </div>
              );
            })
          ) : (
            items.map(item => (
              <KdsItemRow key={item.id} item={item} siblingItems={items} onRefresh={onRefresh} ticketStatus={ticket.status} />
            ))
          )}
          {items.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">All items served</p>}
        </CardContent>
      </Card>
      <KdsRushDialog
        open={showRush}
        ticketId={ticket.id}
        ticketLabel={label}
        requiresPin={rushRequiresPin ?? false}
        onClose={() => setShowRush(false)}
        onRushed={onRefresh}
      />
    </>
  );
}

const STATUS_CONFIG = {
  unassigned: { label: "Unassigned", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", icon: AlertTriangle },
  assigned: { label: "Assigned", color: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-500", icon: UserCheck },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500", icon: Timer },
  completed: { label: "Done", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500", icon: CheckCircle2 },
};

const CHEF_STATUS_COLOR: Record<string, string> = {
  available: "bg-green-500",
  on_break: "bg-yellow-500",
  busy: "bg-blue-500",
  offline: "bg-gray-400",
};

const ASSIGNMENT_TYPE_LABEL: Record<string, string> = {
  AUTO_ROSTER: "Roster",
  AUTO_WORKLOAD: "Workload",
  SELF_ASSIGNED: "Self",
  MANAGER_ASSIGNED: "Manager",
  REASSIGNED: "Reassigned",
  UNASSIGNED: "—",
};

function TicketCard({
  assignment,
  chefs,
  onAction,
}: {
  assignment: Assignment;
  chefs: ChefAvailability[];
  onAction: (action: string, a: Assignment) => void;
}) {
  const sc = STATUS_CONFIG[assignment.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.unassigned;
  const Icon = sc.icon;
  const waitMins = assignment.createdAt
    ? Math.floor((Date.now() - new Date(assignment.createdAt).getTime()) / 60000)
    : 0;

  return (
    <div
      className={`rounded-lg border p-3 ${sc.color} space-y-2 relative`}
      data-testid={`ticket-${assignment.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{assignment.menuItemName ?? "Ticket"}</div>
          {assignment.tableNumber && (
            <div className="text-xs opacity-75">Table {assignment.tableNumber}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className={`h-2 w-2 rounded-full ${sc.dot}`} />
          <span className="text-xs font-medium">{sc.label}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 opacity-75">
          <Clock className="h-3 w-3" />
          {waitMins}m ago
        </div>
        {assignment.assignmentType && assignment.assignmentType !== "UNASSIGNED" && (
          <Badge variant="outline" className="text-[10px] py-0">
            {ASSIGNMENT_TYPE_LABEL[assignment.assignmentType] ?? assignment.assignmentType}
          </Badge>
        )}
      </div>

      {assignment.chefName && (
        <div className="flex items-center gap-1 text-xs">
          <ChefHat className="h-3 w-3" />
          <span>{assignment.chefName}</span>
        </div>
      )}

      <div className="flex gap-1 flex-wrap">
        {assignment.status === "unassigned" && (
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onAction("assign", assignment)} data-testid={`button-assign-${assignment.id}`}>
            Assign
          </Button>
        )}
        {assignment.status === "assigned" && (
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onAction("reassign", assignment)} data-testid={`button-reassign-${assignment.id}`}>
            <ArrowRightLeft className="h-3 w-3 mr-1" />Reassign
          </Button>
        )}
        {(assignment.status === "assigned" || assignment.status === "in_progress") && (
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => onAction("complete", assignment)} data-testid={`button-complete-${assignment.id}`}>
            <CheckCircle2 className="h-3 w-3 mr-1" />Done
          </Button>
        )}
      </div>
    </div>
  );
}

function ChefPill({ chef }: { chef: ChefAvailability }) {
  const dot = CHEF_STATUS_COLOR[chef.status] ?? "bg-gray-400";
  return (
    <div className="flex items-center gap-1.5 bg-white/60 rounded-full px-2.5 py-1 text-xs border" data-testid={`chef-pill-${chef.chefId}`}>
      <div className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="font-medium">{chef.chefName ?? chef.chefId}</span>
      {chef.activeTickets > 0 && <span className="text-muted-foreground">({chef.activeTickets})</span>}
    </div>
  );
}

function ActiveItemRow({ item, onRefresh }: { item: KdsItem; onRefresh: () => void }) {
  const elapsed = useTimer(item.startedAt);
  const estimatedSec = (item.prepTimeMinutes ?? 0) * 60;
  const status = getTimingStatus(elapsed, estimatedSec);
  const isOverdue = elapsed > estimatedSec && estimatedSec > 0;
  const overdueSec = Math.max(0, elapsed - estimatedSec);
  const remainingSec = Math.max(0, estimatedSec - elapsed);
  const [showFlagDialog, setShowFlagDialog] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [flagLoading, setFlagLoading] = useState(false);

  const chipConfig = {
    fast: "text-green-600",
    approaching: "text-amber-600",
    over: "text-red-600",
    very_late: "text-red-600 animate-pulse",
  };

  async function handleFlagIssue() {
    setFlagLoading(true);
    try {
      const csrf = getCsrfToken();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (csrf) hdrs["x-csrf-token"] = csrf;
      await fetch(`/api/kds/order-items/${item.id}/status`, {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({ notes: flagNote }),
        credentials: "include",
      });
    } catch (_) {}
    setFlagLoading(false);
    setShowFlagDialog(false);
    setFlagNote("");
    onRefresh();
  }

  async function handleReady() {
    try {
      const csrf = getCsrfToken();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (csrf) hdrs["x-csrf-token"] = csrf;
      const res = await fetch(`/api/kds/items/${item.id}/ready`, { method: "PUT", headers: hdrs, credentials: "include" });
      if (!res.ok) {
        await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "ready" }), credentials: "include" });
      }
    } catch (_) {}
    onRefresh();
  }

  return (
    <>
      <div className={`rounded-lg border p-3 space-y-2 ${isOverdue ? "border-red-300 bg-red-50/50" : "border-border"}`} data-testid={`active-item-${item.id}`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{item.name}</span>
                    {item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                      <div className="mt-0.5 space-y-0.5" data-testid="modifier-group-kds">
                        {(item.modifiers as any[]).map((mod: any, idx: number) => (
                          <div key={idx} className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            {"→"} {mod.optionName || mod.label}
                          </div>
                        ))}
                      </div>
                    )}
          <Badge variant="outline" className="text-xs">T-{item.courseNumber ?? "?"}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          Started: {formatMMSS(elapsed)} ago
        </div>
        <div className={`text-xs font-medium ${chipConfig[status]}`}>
          Est: {item.prepTimeMinutes ?? "?"} min |{" "}
          {isOverdue
            ? `🔴 OVERDUE ${formatMMSS(overdueSec)}`
            : `🟢 ${formatMMSS(remainingSec)} remaining`}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs px-2 text-green-700"
            onClick={handleReady}
            data-testid={`button-chef-ready-${item.id}`}
          >
            <CheckCircle2 className="h-3 w-3 mr-0.5" />MARK READY
          </Button>
          {isOverdue && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2 text-amber-700"
              onClick={() => setShowFlagDialog(true)}
              data-testid={`button-flag-${item.id}`}
            >
              <Flag className="h-3 w-3 mr-0.5" />FLAG ISSUE
            </Button>
          )}
        </div>
      </div>
      <Dialog open={showFlagDialog} onOpenChange={v => !v && setShowFlagDialog(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Flag Delay Issue</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{item.name} — reason for delay:</p>
            <Textarea
              value={flagNote}
              onChange={e => setFlagNote(e.target.value)}
              placeholder="e.g. Equipment issue, ran out of ingredient..."
              rows={3}
              data-testid="input-flag-note"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowFlagDialog(false)}>Cancel</Button>
            <Button onClick={handleFlagIssue} disabled={flagLoading || !flagNote} data-testid="button-submit-flag">
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChefStatsPanel({
  chefId, chefName, counterName, kdsTickets, onRefresh,
}: {
  chefId: string;
  chefName?: string;
  counterName?: string;
  kdsTickets: KdsTicket[];
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const { data: chefStats } = useQuery<any>({
    queryKey: ["/api/time-performance/by-chef", chefId, today],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/time-performance/by-chef?chefId=${chefId}&date=${today}`, { credentials: "include" });
        if (res.ok) return res.json();
      } catch (_) {}
      return null;
    },
    refetchInterval: 30000,
  });

  const activeItems: KdsItem[] = (kdsTickets ?? []).flatMap(t =>
    (t.items ?? []).filter(i => {
      const cs = mapItemStatus(i);
      return cs === "started" || cs === "almost_ready";
    })
  );

  const stats = chefStats?.summary ?? null;
  const dishCount = stats?.totalDishes ?? 0;
  const avgTime = stats?.avgTimeMin ? Number(stats.avgTimeMin).toFixed(1) : "—";
  const onTimePct = stats?.onTimePct != null ? `${Math.round(stats.onTimePct)}%` : "—";
  const bestTime = stats?.bestTimeMin ? `${stats.bestTimeMin} min` : "—";
  const targetMin = stats?.targetMin ?? 15;

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="panel-chef-stats">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-primary" />
            <span>{chefName ?? chefId}{counterName ? ` — ${counterName}` : ""}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </CardTitle>
        {!collapsed && (
          <div className="text-xs text-muted-foreground">
            Today: <span data-testid="text-chef-dish-count" className="font-semibold text-foreground">{dishCount} dishes</span>
            {" | "}Avg: <span data-testid="text-chef-avg-time" className="font-semibold text-foreground">{avgTime} min</span>
          </div>
        )}
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-3">
          {activeItems.length > 0 ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">My Active Items</div>
              <div className="space-y-2">
                {activeItems.map(item => (
                  <ActiveItemRow key={item.id} item={item} onRefresh={onRefresh} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">No active items</div>
          )}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">My Shift Stats</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Best time:</span> <span className="font-medium">{bestTime}</span></div>
              <div><span className="text-muted-foreground">Avg today:</span> <span className="font-medium">{avgTime} min</span></div>
              <div><span className="text-muted-foreground">Target:</span> <span className="font-medium">{targetMin} min</span></div>
              <div>
                <span className="text-muted-foreground">On time:</span>{" "}
                <span className="font-medium" data-testid="text-chef-on-time-pct">{onTimePct}</span>
                {stats?.onTimePct >= 90 && <span className="ml-1">✅</span>}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function KitchenBoardPage() {
    const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: outlets = [] } = useQuery<OutletOption[]>({ queryKey: ["/api/outlets"] });
  const [outletId, setOutletId] = useState<string>("");
  const selectedOutletId = outletId || outlets[0]?.id;

  const [actionDialog, setActionDialog] = useState<{ type: string; assignment: Assignment } | null>(null);
  const [assignChefId, setAssignChefId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [view, setView] = useState<"board" | "analytics" | "cooking">("board");
  const [boardAlerts, setBoardAlerts] = useState<Array<{ id: string; message: string; type: "overdue" | "hold_released" }>>([]);

  const { data: kdsSettings } = useQuery<KitchenSettings>({
    queryKey: ["/api/kitchen-settings"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/kitchen-settings");
        if (res.ok) return res.json();
      } catch (_) {}
      return { cooking_control_mode: "auto_start", allow_rush_override: true, rush_requires_manager_pin: false };
    },
  });

  const { data: kdsTickets = [], refetch: refetchKds } = useQuery<KdsTicket[]>({
    queryKey: ["/api/kds/tickets"],
    queryFn: () => apiRequest("GET", "/api/kds/tickets").then(r => r.json()),
    enabled: view === "cooking",
    refetchInterval: view === "cooking" ? 15000 : false,
  });

  const invalidateKds = useCallback(() => {
    if (view === "cooking") qc.invalidateQueries({ queryKey: ["/api/kds/tickets"] });
  }, [view, qc]);

  useRealtimeEvent("order:new", invalidateKds);
  useRealtimeEvent("order:updated", invalidateKds);
  useRealtimeEvent("order:item_updated", invalidateKds);
  useRealtimeEvent("kds:item_started", invalidateKds);
  useRealtimeEvent("kds:item_ready", invalidateKds);
  useRealtimeEvent("kds:item_held", invalidateKds);
  useRealtimeEvent("kds:order_rushed", (payload: any) => {
    invalidateKds();
    toast({
      title: "🚨 Rush Order",
      // DEL-06: toast now shows last-6-char shortId
      description: `Order ${shortOrderId(String(payload?.orderId ?? ""))} marked as RUSH`,
      variant: "destructive",
    });
  });
  useRealtimeEvent("kds:course_fired", invalidateKds);
  useRealtimeEvent("kds:hold_released", invalidateKds);
  useRealtimeEvent("kds:refire_ticket", invalidateKds);
  useRealtimeEvent("void_request:new", (payload) => {
    toast({
      title: "Void Requested",
      description: `${(payload).requestedBy ?? "Staff"}: ${(payload).itemName ?? "item"} - ${(payload).voidReason ?? ""}`,
      variant: "destructive",
      duration: 10000,
    });
    invalidateKds();
  });

  const { data: board, isLoading, refetch } = useQuery<BoardData>({
    queryKey: ["/api/assignments/board", selectedOutletId],
    queryFn: () => apiRequest("GET", `/api/assignments/board?outletId=${selectedOutletId}`).then(r => r.json()),
    enabled: !!selectedOutletId,
    refetchInterval: 30000,
  });

  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ["/api/assignments/analytics"],
    queryFn: () => apiRequest("GET", "/api/assignments/analytics?range=7d").then(r => r.json()),
    enabled: view === "analytics",
  });

  const { data: liveChefs = [] } = useQuery<ChefAvailability[]>({
    queryKey: ["/api/chef-availability/live", selectedOutletId],
    queryFn: () => apiRequest("GET", `/api/chef-availability/live?outletId=${selectedOutletId}`).then(r => r.json()),
    enabled: !!selectedOutletId,
    refetchInterval: 15000,
  });

  useRealtimeEvent("chef-assignment:updated", () => {
    qc.invalidateQueries({ queryKey: ["/api/assignments/board"] });
    qc.invalidateQueries({ queryKey: ["/api/chef-availability/live"] });
  });
  useRealtimeEvent("chef-availability:changed", () => {
    qc.invalidateQueries({ queryKey: ["/api/chef-availability/live"] });
  });
  useRealtimeEvent("chef-assignment:rebalanced", () => {
    qc.invalidateQueries({ queryKey: ["/api/assignments/board"] });
  });
  useRealtimeEvent("kds:item_overdue", (rawPayload: unknown) => {
    if (view !== "cooking") return;
    const payload = rawPayload as { itemId?: string; itemName?: string; overdueMinutes?: number };
    const alertId = `overdue-${payload.itemId ?? ""}-${Date.now()}`;
    const msg = `Start ${payload.itemName ?? "item"} NOW — ${payload.overdueMinutes ?? 1} min overdue`;
    setBoardAlerts(prev => [...prev.filter(a => a.id !== alertId).slice(-4), { id: alertId, message: msg, type: "overdue" }]);
    setTimeout(() => setBoardAlerts(prev => prev.filter(a => a.id !== alertId)), 10000);
  });
  useRealtimeEvent("kds:hold_released", (rawPayload: unknown) => {
    if (view !== "cooking") return;
    const payload = rawPayload as { itemName?: string; holdItemName?: string };
    const alertId = `hold-${Date.now()}`;
    const msg = `${payload.holdItemName ?? "Item"} ready — start ${payload.itemName ?? "next item"} now`;
    setBoardAlerts(prev => [...prev.slice(-4), { id: alertId, message: msg, type: "hold_released" }]);
    setTimeout(() => setBoardAlerts(prev => prev.filter(a => a.id !== alertId)), 10000);
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/assignments/${id}/complete`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assignments/board"] }); toast({ title: "Ticket marked done" }); },
  });

  const managerAssignMut = useMutation({
    mutationFn: ({ id, chefId, chefName }: { id: string; chefId: string; chefName?: string }) =>
      apiRequest("PUT", `/api/assignments/${id}/manager-assign`, { chefId, chefName }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assignments/board"] }); setActionDialog(null); toast({ title: "Chef assigned" }); },
  });

  const reassignMut = useMutation({
    mutationFn: ({ id, reason, chefId, chefName }: { id: string; reason: string; chefId?: string; chefName?: string }) =>
      apiRequest("PUT", `/api/assignments/${id}/reassign`, { reason, chefId, chefName }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assignments/board"] }); setActionDialog(null); toast({ title: "Ticket reassigned" }); },
  });

  const rebalanceMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/assignments/rebalance", { outletId: selectedOutletId }).then(r => r.json()),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["/api/assignments/board"] }); toast({ title: `Rebalanced — ${d?.moved ?? 0} tickets moved` }); },
  });

  function handleAction(action: string, assignment: Assignment) {
    if (action === "complete") {
      completeMut.mutate(assignment.id);
    } else {
      setAssignChefId("");
      setReassignReason("");
      setActionDialog({ type: action, assignment });
    }
  }

  function submitAction() {
    if (!actionDialog) return;
    const chef = liveChefs.find(c => c.chefId === assignChefId);
    if (actionDialog.type === "assign") {
      if (!assignChefId) return;
      managerAssignMut.mutate({ id: actionDialog.assignment.id, chefId: assignChefId, chefName: chef?.chefName });
    } else {
      if (!reassignReason) return;
      const newChef = liveChefs.find(c => c.chefId === assignChefId);
      reassignMut.mutate({ id: actionDialog.assignment.id, reason: reassignReason, chefId: assignChefId || undefined, chefName: newChef?.chefName });
    }
  }


    // Auth loading guard
  if (authLoading || !user) return <PageLoader />;
  const allCounters = board ? Object.values(board.byCounter) : [];
  const unassignedCount = board?.unassigned?.length ?? 0;
  const totalLive = board?.totalLive ?? 0;
  const onlineChefs = liveChefs.filter(c => c.status !== "offline").length;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="heading-kitchen-board">Kitchen Board</h1>
            <p className="text-xs text-muted-foreground">Live chef assignment view</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {outlets.length > 1 && (
            <Select value={selectedOutletId} onValueChange={setOutletId}>
              <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-outlet-board"><SelectValue /></SelectTrigger>
              <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => setView(v => v === "board" ? "analytics" : v === "analytics" ? "cooking" : "board")} data-testid="button-toggle-view">
            {view === "board" ? <><BarChart3 className="h-4 w-4 mr-1" />Analytics</> : view === "analytics" ? <><Play className="h-4 w-4 mr-1" />Cooking</> : <><LayoutGrid className="h-4 w-4 mr-1" />Board</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => rebalanceMut.mutate()} disabled={rebalanceMut.isPending} data-testid="button-rebalance">
            <Zap className="h-4 w-4 mr-1" />Rebalance
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh-board">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Live Tickets", value: totalLive, icon: Timer, color: "text-blue-600" },
          { label: "Unassigned", value: unassignedCount, icon: AlertTriangle, color: unassignedCount > 0 ? "text-red-600" : "text-muted-foreground" },
          { label: "Chefs Online", value: onlineChefs, icon: Users, color: "text-green-600" },
          { label: "Avg Wait", value: `${board?.avgWaitMin ?? 0}m`, icon: Clock, color: "text-primary" },
        ].map(stat => (
          <Card key={stat.label} className="p-4" data-testid={`stat-${stat.label.toLowerCase().replace(" ", "-")}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              </div>
              <stat.icon className={`h-6 w-6 ${stat.color} opacity-60`} />
            </div>
          </Card>
        ))}
      </div>

      {liveChefs.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium">Chefs on shift:</span>
          {liveChefs.map(chef => <ChefPill key={chef.chefId} chef={chef} />)}
        </div>
      )}

      {view === "cooking" && user?.role === "chef" && (
        <ChefStatsPanel
          chefId={user.id}
          chefName={user.name ?? user.username}
          counterName={liveChefs.find(c => c.chefId === user.id)?.counterName}
          kdsTickets={kdsTickets}
          onRefresh={refetchKds}
        />
      )}

      {view === "cooking" ? (
        <div className="space-y-4">
          {boardAlerts.length > 0 && (
            <div className="space-y-1.5" data-testid="chef-alerts-panel">
              {boardAlerts.map(a => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg text-sm font-medium border ${
                    a.type === "overdue" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                  data-testid={`chef-alert-${a.id}`}
                >
                  <span>{a.message}</span>
                  <button onClick={() => setBoardAlerts(prev => prev.filter(b => b.id !== a.id))} className="opacity-60 hover:opacity-100 ml-2">✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Item Cooking Control</span>
            {kdsSettings && kdsSettings.cooking_control_mode !== "auto_start" && (
              <Badge className="text-xs">
                {kdsSettings.cooking_control_mode === "selective" ? "Selective Mode" : "Course Mode"}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetchKds()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {kdsTickets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No active orders
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...kdsTickets].sort((a, b) => {
                if (a.isRush && !b.isRush) return -1;
                if (!a.isRush && b.isRush) return 1;
                return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
              }).filter(t => ["new", "sent_to_kitchen", "in_progress"].includes(t.status)).map(ticket => (
                <CookingControlTicket
                  key={ticket.id}
                  ticket={ticket}
                  onRefresh={refetchKds}
                  rushRequiresPin={kdsSettings?.rush_requires_manager_pin}
                />
              ))}
            </div>
          )}
        </div>
      ) : view === "analytics" ? (
        <div className="space-y-4">
          {analytics ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Auto-Assign Rate</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">{analytics.efficiency?.autoAssignRate ?? 0}%</div>
                    <div className="text-xs text-muted-foreground mt-1">Of all assigned tickets</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Order→Assign</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">
                      {analytics.efficiency?.avgOrderToAssignSec != null ? `${Math.round(analytics.efficiency.avgOrderToAssignSec / 60)}m` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Time to assign ticket</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Assign→Start</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-600">
                      {analytics.efficiency?.avgAssignToStartSec != null ? `${Math.round(analytics.efficiency.avgAssignToStartSec / 60)}m` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Time to start cooking</div>
                  </CardContent>
                </Card>
              </div>
              {(analytics.perChef?.length ?? 0) > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Per Chef</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(analytics.perChef ?? []).map((c) => (
                        <div key={c.chefId} className="flex items-center justify-between py-1 border-b last:border-0" data-testid={`analytics-chef-${c.chefId}`}>
                          <div className="text-sm font-medium">{c.chefName ?? c.chefId}</div>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>{c.total} tickets</span>
                            <span>{c.completed} done</span>
                            <span>{c.avgTimeMin ? `${c.avgTimeMin}m avg` : "—"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <TrendingUp className="h-8 w-8 opacity-40" />
            </div>
          )}
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-60 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {unassignedCount > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Unassigned Tickets ({unassignedCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(board?.unassigned ?? []).map(a => (
                    <TicketCard key={a.id} assignment={a} chefs={liveChefs} onAction={handleAction} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {allCounters.map(({ counter, assignments, chefs }) => {
              const name = counter?.name ?? "Unknown Counter";
              const active = assignments.filter(a => a.status !== "completed");
              return (
                <Card key={counter?.id ?? name} data-testid={`counter-column-${counter?.id}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <ChefHat className="h-4 w-4 text-primary" />
                        {name}
                      </span>
                      <Badge variant="outline">{active.length} active</Badge>
                    </CardTitle>
                    {chefs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {chefs.map(c => <ChefPill key={c.chefId} chef={c} />)}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
                    {active.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        All clear
                      </div>
                    ) : (
                      active.map(a => (
                        <TicketCard key={a.id} assignment={a} chefs={liveChefs} onAction={handleAction} />
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!actionDialog} onOpenChange={v => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "assign" ? "Assign Chef" : "Reassign Ticket"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-2">
                Ticket: <strong>{actionDialog?.assignment.menuItemName}</strong>
                {actionDialog?.assignment.tableNumber && ` — Table ${actionDialog.assignment.tableNumber}`}
              </div>
            </div>
            <div>
              <Label>Select Chef</Label>
              <Select value={assignChefId} onValueChange={setAssignChefId}>
                <SelectTrigger data-testid="select-assign-chef">
                  <SelectValue placeholder="Choose a chef" />
                </SelectTrigger>
                <SelectContent>
                  {liveChefs.filter(c => c.status !== "offline").map(c => (
                    <SelectItem key={c.chefId} value={c.chefId}>
                      {c.chefName ?? c.chefId} — {c.activeTickets} active
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {actionDialog?.type === "reassign" && (
              <div>
                <Label>Reason *</Label>
                <Input
                  value={reassignReason}
                  onChange={e => setReassignReason(e.target.value)}
                  placeholder="Why is this being reassigned?"
                  data-testid="input-reassign-reason"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={submitAction}
              disabled={
                (actionDialog?.type === "assign" && !assignChefId) ||
                (actionDialog?.type === "reassign" && !reassignReason) ||
                managerAssignMut.isPending || reassignMut.isPending
              }
              data-testid="button-confirm-action"
            >
              {actionDialog?.type === "assign" ? "Assign" : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
