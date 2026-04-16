import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Utensils, Flame, CheckCircle2, Clock, ChefHat, User, LayoutGrid,
  Play, Pause, Zap, AlertTriangle, Lock, Bell,
} from "lucide-react";
import { useTimer, useOrderAgeTimer, formatMMSS, getTimingStatus } from "@/hooks/useTimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCsrfToken } from "@/lib/queryClient";

interface KDSWallItem {
  id: string;
  name: string;
  quantity: number | null;
  status: string | null;
  cookingStatus: string | null;
  station: string | null;
  course: string | null;
  estimatedReadyAt: string | null;
  startedAt: string | null;
  prepTimeMinutes: number | null;
  courseNumber: number | null;
  is_voided?: boolean;
}

interface KDSWallTicket {
  id: string;
  tableId: string | null;
  tableNumber?: number;
  status: string;
  createdAt: string | null;
  orderType: string | null;
  channel: string | null;
  items: KDSWallItem[];
  assignedChefName?: string | null;
  counterName?: string | null;
  counterId?: string | null;
  assignmentStatus?: string | null;
  estimatedReadyAt?: string | null;
  waiterName?: string | null;
}

interface KitchenSettings {
  cooking_control_mode: "auto_start" | "selective" | "course_only";
  show_timing_suggestions: boolean;
  alert_overdue_minutes: number;
  allow_rush_override: boolean;
  rush_requires_manager_pin: boolean;
  auto_hold_bar_items: boolean;
}

function mapItemCookingStatus(item: KDSWallItem): string {
  if (item.cookingStatus) return item.cookingStatus;
  const s = item.status ?? "pending";
  if (s === "pending") return "queued";
  if (s === "cooking") return "started";
  if (s === "done" || s === "ready") return "ready";
  if (s === "served") return "served";
  return "queued";
}

function ItemStatusBadge({ itemId, status }: { itemId: string; status: string }) {
  const { t: tk } = useTranslation("kitchen");
  const cfg: Record<string, { label: string; cls: string }> = {
    queued: { label: tk("statusQueued"), cls: "bg-gray-700 text-gray-300" },
    hold: { label: tk("statusOnHold"), cls: "bg-purple-900 text-purple-200 animate-pulse" },
    ready_to_start: { label: tk("statusStartNow"), cls: "bg-amber-800 text-amber-100 animate-pulse" },
    started: { label: tk("statusCooking"), cls: "bg-blue-900 text-blue-100" },
    almost_ready: { label: tk("statusAlmostReady"), cls: "bg-teal-900 text-teal-100" },
    ready: { label: tk("statusReadyCheck"), cls: "bg-green-900 text-green-100" },
    held_warm: { label: tk("statusKeptWarm"), cls: "bg-orange-900 text-orange-100" },
    served: { label: tk("served"), cls: "bg-gray-800 text-gray-500" },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-gray-700 text-gray-400" };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${c.cls}`}
      data-testid={`status-${itemId}`}
    >
      {c.label}
    </span>
  );
}

function CountdownTimer({ estimatedReadyAt, itemId }: { estimatedReadyAt: string; itemId: string }) {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(estimatedReadyAt).getTime() - Date.now()) / 1000))
  );
  useEffect(() => {
    const iv = setInterval(() => {
      setSecsLeft(Math.max(0, Math.floor((new Date(estimatedReadyAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  }, [estimatedReadyAt]);

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const overdue = secsLeft === 0;
  return (
    <span
      className={`text-sm font-mono tabular-nums ${overdue ? "text-red-400 font-bold animate-pulse" : "text-blue-300"}`}
      data-testid={`timer-${itemId}`}
    >
      {overdue ? "▶ overdue" : `⏱️ ${mins}:${secs.toString().padStart(2, "0")} left`}
    </span>
  );
}

function ItemTimerCell({ item, itemId }: { item: KDSWallItem; itemId: string }) {
  const { t: tk } = useTranslation("kitchen");
  const cs = mapItemCookingStatus(item);
  const elapsedSec = useTimer(item.startedAt);
  const estimatedSec = (item.prepTimeMinutes ?? 0) * 60;

  if (cs === "started" || cs === "almost_ready") {
    const status = getTimingStatus(elapsedSec, estimatedSec);
    const remainingSec = Math.max(0, estimatedSec - elapsedSec);
    const chipConfig = {
      fast: { label: tk("timingFast"), cls: "bg-green-900 text-green-300" },
      approaching: { label: tk("timingApproaching"), cls: "bg-amber-900 text-amber-300" },
      over: { label: tk("timingOverTime"), cls: "bg-red-900 text-red-300" },
      very_late: { label: tk("timingVeryLate"), cls: "bg-red-900 text-red-300 animate-pulse" },
    };
    const chip = chipConfig[status];
    return (
      <div className="space-y-0.5" data-testid={`time-cell-${itemId}`}>
        <div className="text-sm font-mono tabular-nums text-white">
          ⏱️ {formatMMSS(remainingSec)} {tk("left")}
        </div>
        {item.prepTimeMinutes && (
          <div className="text-xs text-gray-500">{tk("est")}: {item.prepTimeMinutes} {tk("minUnit")}</div>
        )}
        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${chip.cls}`}>{chip.label}</span>
      </div>
    );
  }

  if (cs === "queued" || cs === "ready_to_start") {
    const isOverdue = cs === "ready_to_start";
    return (
      <div data-testid={`time-cell-${itemId}`}>
        {isOverdue ? (
          <span className="text-amber-400 text-xs font-bold animate-pulse">{tk("statusStartNow")}</span>
        ) : (
          <span className="text-gray-500 text-xs">
            {item.prepTimeMinutes ? `~${item.prepTimeMinutes} ${tk("minUnit")}` : tk("statusQueued")}
          </span>
        )}
      </div>
    );
  }

  if (cs === "ready") {
    return (
      <div className="space-y-0.5" data-testid={`time-cell-${itemId}`}>
        <div className="text-green-400 text-sm font-mono">✅ {formatMMSS(elapsedSec)}</div>
        {estimatedSec > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${elapsedSec <= estimatedSec ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-400"}`}>
            {elapsedSec <= estimatedSec ? tk("timingFastShort") : tk("timingOnTime")}
          </span>
        )}
      </div>
    );
  }

  return <span className="text-gray-600 text-xs" data-testid={`time-cell-${itemId}`}>—</span>;
}

function OrderAgeTimer({ createdAt, ticketId }: { createdAt: string | null; ticketId: string }) {
  const { t: tk } = useTranslation("kitchen");
  const elapsed = useOrderAgeTimer(createdAt);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  const colorCls = mins < 15 ? "text-green-400" : mins < 20 ? "text-amber-400" : "text-red-400";

  return (
    <span
      className={`text-xs font-mono tabular-nums font-semibold ${colorCls}`}
      data-testid={`order-age-${ticketId}`}
    >
      {tk("orderAge2", { mins, secs: secs.toString().padStart(2, "0") })}
    </span>
  );
}

function useElapsedMinutes(createdAt: string | null): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!createdAt) return;
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, [createdAt]);
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function getTimeColor(mins: number) {
  if (mins < 5) return "text-green-400";
  if (mins < 15) return "text-amber-400";
  return "text-red-400";
}

function getTimeBg(mins: number) {
  if (mins >= 15) return "bg-red-950/40 border-red-700";
  if (mins >= 5) return "bg-amber-950/30 border-amber-700";
  return "bg-gray-800/60 border-gray-600";
}

function formatElapsed(mins: number) {
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

declare global { interface Window { webkitAudioContext?: typeof AudioContext } }

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "square";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) {}
}

function HoldDialog({
  open, onClose, item, ticketId, siblingItems, onHeld,
}: {
  open: boolean;
  onClose: () => void;
  item: KDSWallItem | null;
  ticketId: string;
  siblingItems: KDSWallItem[];
  onHeld: () => void;
}) {
  const { t: tk } = useTranslation("kitchen");
  const [holdType, setHoldType] = useState<"manual" | "item" | "minutes">("manual");
  const [holdItemId, setHoldItemId] = useState("");
  const [holdMinutes, setHoldMinutes] = useState(5);
  const [holdReason, setHoldReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!item) return;
    setLoading(true);
    try {
      const body: { holdReason: string; holdUntilItemId?: string; holdUntilMinutes?: number } = { holdReason };
      if (holdType === "item") body.holdUntilItemId = holdItemId;
      if (holdType === "minutes") body.holdUntilMinutes = holdMinutes;
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

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent data-testid="dialog-hold">
        <DialogHeader>
          <DialogTitle>{tk("holdItem")}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">
              {item.name} — {ticketId.slice(-4).toUpperCase()}
            </p>
            <div className="space-y-2">
              <Label>{tk("holdUntil")}:</Label>
              {([
                { value: "manual" as const, label: tk("holdManual") },
                { value: "item" as const, label: tk("holdUntilItemReady") },
                { value: "minutes" as const, label: tk("holdInNMinutes") },
              ] satisfies { value: "manual" | "item" | "minutes"; label: string }[]).map(opt => (
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
            {holdType === "item" && (
              <div>
                <Label>{tk("waitForItem")}:</Label>
                <Select value={holdItemId} onValueChange={setHoldItemId}>
                  <SelectTrigger data-testid="select-hold-until-item">
                    <SelectValue placeholder={tk("selectIngredient")} />
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
                <Label>{tk("holdForMinutes")}:</Label>
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
              <Label>{tk("reasonOptional")}:</Label>
              <Input
                value={holdReason}
                onChange={e => setHoldReason(e.target.value)}
                placeholder={tk("holdReasonPlaceholder")}
                data-testid="input-hold-reason"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{tk("cancel")}</Button>
          <Button onClick={submit} disabled={loading || (holdType === "item" && !holdItemId)}>
            {tk("holdItem")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RushDialog({
  open, onClose, ticket, requiresPin, onRushed,
}: {
  open: boolean;
  onClose: () => void;
  ticket: KDSWallTicket | null;
  requiresPin: boolean;
  onRushed: () => void;
}) {
  const { t: tk } = useTranslation("kitchen");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!ticket) return;
    setLoading(true);
    try {
      const csrf = getCsrfToken();
      const hdrs: Record<string, string> = { "Content-Type": "application/json" };
      if (csrf) hdrs["x-csrf-token"] = csrf;
      const res = await fetch(`/api/kds/orders/${ticket.id}/rush`, {
        method: "PUT",
        headers: hdrs,
        body: JSON.stringify({ managerPin: pin }),
        credentials: "include",
      });
      if (!res.ok) {
        for (const item of ticket.items) {
          if (mapItemCookingStatus(item) !== "ready" && mapItemCookingStatus(item) !== "served") {
            try {
              await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "cooking" }), credentials: "include" });
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
    setLoading(false);
    setPin("");
    onRushed();
    onClose();
  }

  return (
    <AlertDialog open={open} onOpenChange={v => !v && onClose()}>
      <AlertDialogContent data-testid="dialog-rush">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-destructive" />
            {tk("rushOrder")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {tk("rushDesc", {
              ref: ticket?.tableNumber ? tk("tableRef", { n: ticket.tableNumber }) : `#${ticket?.id.slice(-4).toUpperCase()}`,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requiresPin && (
          <div className="py-2">
            <Label>{tk("managerPin")}:</Label>
            <Input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder={tk("enterPin")}
              data-testid="input-rush-pin"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{tk("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={submit}
            disabled={loading || (requiresPin && !pin)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-rush"
          >
            <Zap className="h-4 w-4 mr-1" />{tk("rushAllItems")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ItemRow({
  item, ticket, mode, settings, onRefresh, courseLocked,
}: {
  item: KDSWallItem;
  ticket: KDSWallTicket;
  mode: string;
  settings: KitchenSettings;
  onRefresh: () => void;
  courseLocked?: boolean;
}) {
  const { t: tk } = useTranslation("kitchen");
  const [startLoading, setStartLoading] = useState(false);
  const [readyLoading, setReadyLoading] = useState(false);
  const [startTooltip, setStartTooltip] = useState<string | null>(null);
  const [showHold, setShowHold] = useState(false);

  const cs = mapItemCookingStatus(item);
  const isStartable = cs === "queued" || cs === "ready_to_start";
  const isCooking = cs === "started";
  const isReady = cs === "ready" || cs === "almost_ready";
  const isTerminal = cs === "served";

  const isOverdue = cs === "ready_to_start";

  async function handleStart() {
    setStartLoading(true);
    const csrf = getCsrfToken();
    const hdrs: Record<string, string> = { "Content-Type": "application/json" };
    if (csrf) hdrs["x-csrf-token"] = csrf;
    try {
      const res = await fetch(`/api/kds/items/${item.id}/start`, { method: "PUT", headers: hdrs, body: JSON.stringify({}), credentials: "include" });
      if (!res.ok) {
        await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "cooking" }), credentials: "include" });
        setStartTooltip(tk("started"));
      } else {
        const data = await res.json();
        if (data.earlyMinutes > 0) setStartTooltip(tk("startedEarly", { n: data.earlyMinutes }));
        else if (data.earlyMinutes < 0) setStartTooltip(tk("startedLate", { n: Math.abs(data.earlyMinutes) }));
        else setStartTooltip(tk("started"));
      }
      setTimeout(() => setStartTooltip(null), 3000);
    } catch (_) {
      try { await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "cooking" }), credentials: "include" }); } catch (_) {}
    }
    setStartLoading(false);
    onRefresh();
  }

  async function handleReady() {
    setReadyLoading(true);
    const csrf = getCsrfToken();
    const hdrs: Record<string, string> = { "Content-Type": "application/json" };
    if (csrf) hdrs["x-csrf-token"] = csrf;
    try {
      const res = await fetch(`/api/kds/items/${item.id}/ready`, { method: "PUT", headers: hdrs, credentials: "include" });
      if (!res.ok) {
        await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "ready" }), credentials: "include" });
      }
    } catch (_) {
      try { await fetch(`/api/kds/order-items/${item.id}/status`, { method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "ready" }), credentials: "include" }); } catch (_) {}
    }
    setReadyLoading(false);
    onRefresh();
  }

  return (
    <>
      <tr
        className={`border-b border-gray-700/50 ${isOverdue ? "bg-amber-950/30" : ""} ${cs === "ready" ? "bg-green-950/20" : ""}`}
        data-testid={`row-item-${item.id}`}
      >
        <td className="py-1.5 px-2">
          <div className="text-sm font-medium text-white">{item.quantity !== null && item.quantity > 1 ? `${item.quantity}×` : ""} {item.name}</div>
        </td>
        <td className="py-1.5 px-2 text-xs text-gray-400">
          {item.prepTimeMinutes ? `${item.prepTimeMinutes}m` : "—"}
        </td>
        <td className="py-1.5 px-2">
          <ItemStatusBadge itemId={item.id} status={cs} />
        </td>
        <td className="py-1.5 px-2">
          {isCooking && item.estimatedReadyAt ? (
            <CountdownTimer estimatedReadyAt={item.estimatedReadyAt} itemId={item.id} />
          ) : cs === "ready_to_start" ? (
            <span className="text-amber-400 text-sm font-medium animate-pulse">▶ {tk("overdueBadge")}</span>
          ) : cs === "queued" && item.prepTimeMinutes ? (
            <span className="text-gray-500 text-xs">{tk("suggested")}</span>
          ) : (
            <span className="text-gray-600 text-xs">—</span>
          )}
        </td>
        <td className="py-1.5 px-2 min-w-[110px]">
          <ItemTimerCell item={item} itemId={item.id} />
        </td>
        <td className="py-1.5 px-2">
          <div className="flex items-center gap-1.5 relative">
            {startTooltip && (
              <div className="absolute -top-7 left-0 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                {startTooltip}
              </div>
            )}
            {courseLocked && (
              <span className="flex items-center gap-1 text-yellow-500 text-xs">
                <Lock className="h-3 w-3" /> {tk("locked")}
              </span>
            )}
            {!courseLocked && isStartable && !isTerminal && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 bg-green-950 border-green-700 text-green-300 hover:bg-green-900"
                onClick={handleStart}
                disabled={startLoading}
                data-testid={`button-start-${item.id}`}
              >
                <Play className="h-3 w-3 mr-1" />{tk("start").toUpperCase()}
              </Button>
            )}
            {!courseLocked && (isStartable || cs === "queued") && !isTerminal && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 bg-purple-950 border-purple-700 text-purple-300 hover:bg-purple-900"
                onClick={() => setShowHold(true)}
                data-testid={`button-hold-${item.id}`}
              >
                <Pause className="h-3 w-3 mr-1" />{tk("holdItem")}
              </Button>
            )}
            {!courseLocked && (isCooking || isReady) && !isTerminal && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 bg-green-950 border-green-700 text-green-300 hover:bg-green-900"
                onClick={handleReady}
                disabled={readyLoading}
                data-testid={`button-ready-${item.id}`}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />{tk("markReady").toUpperCase()}
              </Button>
            )}
          </div>
        </td>
      </tr>
      <HoldDialog
        open={showHold}
        onClose={() => setShowHold(false)}
        item={item}
        ticketId={ticket.id}
        siblingItems={ticket.items}
        onHeld={onRefresh}
      />
    </>
  );
}

function SelectiveTicketCard({
  ticket, settings, onRefresh,
}: {
  ticket: KDSWallTicket;
  settings: KitchenSettings;
  onRefresh: () => void;
}) {
  const { t: tk } = useTranslation("kitchen");
  const mins = useElapsedMinutes(ticket.createdAt);
  const timeColor = getTimeColor(mins);
  const [showRush, setShowRush] = useState(false);
  const ageSec = useOrderAgeTimer(ticket.createdAt);
  const ageMins = Math.floor(ageSec / 60);
  const cardFlash = ageMins > 25;

  const allItems = ticket.items.filter(i => mapItemCookingStatus(i) !== "served" && !i.is_voided);
  const readyItems = allItems.filter(i => ["ready", "almost_ready", "served"].includes(mapItemCookingStatus(i)));
  const allReady = allItems.length > 0 && readyItems.length === allItems.length;

  const label = ticket.tableNumber
    ? tk("tableRef", { n: ticket.tableNumber })
    : ticket.orderType === "takeaway"
    ? tk("takeaway")
    : `#${ticket.id.slice(-4).toUpperCase()}`;

  const byCourse = ticket.items.filter(i => !i.is_voided).reduce<Record<string | number, KDSWallItem[]>>((acc, item) => {
    const k = item.courseNumber ?? item.course ?? 0;
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});

  const hasCourses = Object.keys(byCourse).length > 1 || (Object.keys(byCourse)[0] !== "0" && Object.keys(byCourse)[0] !== undefined);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25 }}
      className={`rounded-2xl border-2 p-4 space-y-3 ${allReady ? "border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]" : cardFlash ? "bg-gray-800/60 border-red-600 animate-pulse" : "bg-gray-800/60 border-gray-600"}`}
      data-testid={`wall-ticket-${ticket.id.slice(-4)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-2xl font-black text-white tracking-tight" data-testid={`wall-table-${ticket.id.slice(-4)}`}>
            {label}
          </span>
          {ticket.channel && (
            <span className="ml-2 text-xs text-gray-400 capitalize">{ticket.channel}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <OrderAgeTimer createdAt={ticket.createdAt} ticketId={ticket.id} />
          <div className={`flex items-center gap-1 ${timeColor}`}>
            <Clock className="h-4 w-4" />
            <span className="text-lg font-bold tabular-nums">{formatElapsed(mins)}</span>
          </div>
          {settings.allow_rush_override && (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs px-2"
              onClick={() => setShowRush(true)}
              data-testid={`button-rush-${ticket.id}`}
            >
              <Zap className="h-3 w-3 mr-1" />{tk("rush")}
            </Button>
          )}
        </div>
      </div>

      {ticket.waiterName && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <User className="h-3 w-3" />
          <span>{ticket.waiterName}</span>
        </div>
      )}

      {allReady && (
        <div className="text-center py-1 text-green-400 font-bold text-sm tracking-wide animate-pulse">
          ✅ ORDER COMPLETE
        </div>
      )}

      <div className="overflow-x-auto">
        {Object.entries(byCourse).sort(([a], [b]) => Number(a) - Number(b)).map(([courseKey, courseItems], courseIndex) => {
          const cn = Number(courseKey);
          const prevCourseKey = String(cn - 1);
          const prevCourseItems = byCourse[prevCourseKey] || [];
          const prevCourseFired = prevCourseItems.length === 0 || prevCourseItems.every(pi => {
            const cs = mapItemCookingStatus(pi);
            return cs === "ready" || cs === "almost_ready" || cs === "served" || cs === "held_warm";
          });
          const isLocked = cn > 1 && !prevCourseFired && settings.cooking_control_mode === "course_only";
          return (
            <div key={courseKey}>
              {hasCourses && cn > 0 && (
                <div className={`flex items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wider ${isLocked ? "text-yellow-600" : "text-gray-400"}`}>
                  {isLocked ? <Lock className="h-3 w-3 text-yellow-500" /> : <Utensils className="h-3 w-3" />}
                  Course {cn}
                  {isLocked && <span className="text-yellow-500 normal-case font-normal">(waiting for course {cn - 1})</span>}
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-700">
                    <th className="text-left py-1 px-2 font-medium">Item</th>
                    <th className="text-left py-1 px-2 font-medium">Prep</th>
                    <th className="text-left py-1 px-2 font-medium">Status</th>
                    <th className="text-left py-1 px-2 font-medium">Timing</th>
                    <th className="text-left py-1 px-2 font-medium">Time</th>
                    <th className="text-left py-1 px-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {courseItems.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      ticket={ticket}
                      mode={settings.cooking_control_mode}
                      settings={settings}
                      onRefresh={onRefresh}
                      courseLocked={isLocked}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-700">
        {ticket.estimatedReadyAt && (
          <span>All ready by {new Date(ticket.estimatedReadyAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-24 bg-gray-700 rounded-full h-2" data-testid={`progress-order-${ticket.id}`}>
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: allItems.length > 0 ? `${(readyItems.length / allItems.length) * 100}%` : "0%" }}
            />
          </div>
          <span>{readyItems.length}/{allItems.length} ready</span>
        </div>
      </div>

      <RushDialog
        open={showRush}
        onClose={() => setShowRush(false)}
        ticket={ticket}
        requiresPin={settings.rush_requires_manager_pin}
        onRushed={onRefresh}
      />
    </motion.div>
  );
}

function WallTicketCard({ ticket }: { ticket: KDSWallTicket }) {
  const { t: tk } = useTranslation("kitchen");
  const mins = useElapsedMinutes(ticket.createdAt);
  const timeColor = getTimeColor(mins);
  const cardBg = getTimeBg(mins);
  const label = ticket.tableNumber
    ? tk("tableRef", { n: ticket.tableNumber })
    : ticket.orderType === "takeaway"
    ? tk("takeaway")
    : `#${ticket.id.slice(-4).toUpperCase()}`;

  const isUnassigned = !ticket.assignedChefName || ticket.assignmentStatus === "unassigned";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25 }}
      className={`rounded-2xl border-2 p-4 space-y-3 ${isUnassigned ? "bg-red-950/60 border-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.4)] animate-pulse" : cardBg}`}
      data-testid={`wall-ticket-${ticket.id.slice(-4)}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-4xl font-black text-white tracking-tight" data-testid={`wall-table-${ticket.id.slice(-4)}`}>
          {label}
        </span>
        <div className={`flex items-center gap-1.5 ${timeColor}`}>
          <Clock className="h-5 w-5" />
          <span className="text-2xl font-bold tabular-nums">{formatElapsed(mins)}</span>
        </div>
      </div>

      {ticket.assignedChefName && !isUnassigned ? (
        <div className="flex items-center gap-1.5" data-testid={`wall-chef-${ticket.id.slice(-4)}`}>
          <User className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold text-primary">{ticket.assignedChefName}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5" data-testid={`wall-unassigned-${ticket.id.slice(-4)}`}>
          <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-400 font-medium">{tk("unassigned")}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {ticket.items.filter(i => i.status !== "served" && !i.is_voided).map(item => (
          <div key={item.id} className="flex items-center gap-2 text-gray-200">
            <span className="text-lg font-semibold text-white">{item.quantity ?? 1}×</span>
            <span className="text-lg">{item.name}</span>
            {item.station && (
              <Badge variant="outline" className="text-xs border-gray-500 text-gray-400 ml-auto shrink-0">
                {item.station}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function buildWsUrl(qp: URLSearchParams): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/ws`;
  const token = qp.get("token");
  if (token) return `${base}?token=${encodeURIComponent(token)}`;
  return base;
}

function buildApiUrl(qp: URLSearchParams): string {
  const token = qp.get("token");
  if (token) return `/api/kds/wall-tickets?token=${encodeURIComponent(token)}`;
  return "/api/kds/wall-tickets";
}

const REFRESH_EVENTS = new Set([
  "order:new", "order:updated", "order:completed", "order:item_updated",
  "chef-assignment:updated", "chef-assignment:rebalanced", "counter:updated",
  "kds:item_started", "kds:item_held", "kds:item_ready", "kds:order_rushed",
  "kds:course_fired", "kds:hold_released",
]);

const ALL_KDS_EVENTS = new Set([
  "order:new", "order:updated", "order:completed", "order:item_updated",
  "chef-assignment:updated", "chef-assignment:rebalanced", "counter:updated",
  "kds:item_started", "kds:item_held", "kds:item_ready", "kds:order_rushed",
  "kds:course_fired", "kds:hold_released",
  "kds:item_overdue",
  "kds:manager_alert",
]);

function useWallWebSocket(wsUrl: string, onEvent: (event: string, payload?: unknown) => void, onConnected: (v: boolean) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    if (!wsUrl) return;
    let ws: WebSocket | null = null;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          delay = 1000;
          onConnectedRef.current(true);
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data as string) as { event: string; payload?: unknown };
            if (ALL_KDS_EVENTS.has(msg.event)) onEventRef.current(msg.event, msg.payload);
          } catch (_) {}
        };

        ws.onclose = () => {
          ws = null;
          onConnectedRef.current(false);
          if (unmounted) return;
          timer = setTimeout(() => {
            delay = Math.min(delay * 2, 30000);
            connect();
          }, delay);
        };

        ws.onerror = () => ws?.close();
      } catch (_) {}
    }

    connect();

    return () => {
      unmounted = true;
      if (timer) clearTimeout(timer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [wsUrl]);
}

function groupByCounter(tickets: KDSWallTicket[], unassignedLabel = "Unassigned"): { counterId: string | null; counterName: string; tickets: KDSWallTicket[] }[] {
  const map = new Map<string, { counterId: string | null; counterName: string; tickets: KDSWallTicket[] }>();
  for (const t of tickets) {
    const key = t.counterId ?? "__unassigned__";
    if (!map.has(key)) {
      map.set(key, { counterId: t.counterId ?? null, counterName: t.counterName ?? unassignedLabel, tickets: [] });
    }
    map.get(key)!.tickets.push(t);
  }
  const result = Array.from(map.values());
  result.sort((a, b) => {
    if (!a.counterId) return 1;
    if (!b.counterId) return -1;
    return a.counterName.localeCompare(b.counterName);
  });
  return result;
}

interface ChefAlert {
  id: string;
  type: "overdue" | "upcoming" | "ok" | "hold_released";
  message: string;
  itemId?: string;
  ticketId?: string;
  expiresAt: number;
}

function ChefAlertsPanel({
  alerts, onDismiss, allOnTrack,
}: {
  alerts: ChefAlert[];
  onDismiss: (id: string) => void;
  allOnTrack?: boolean;
}) {
  const { t: tk } = useTranslation("kitchen");
  function scrollToTicket(ticketId?: string) {
    if (!ticketId) return;
    const shortId = ticketId.slice(-4);
    const el = document.querySelector(`[data-testid="wall-ticket-${shortId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-yellow-400");
      setTimeout(() => el.classList.remove("ring-2", "ring-yellow-400"), 2000);
    }
  }

  if (alerts.length === 0 && !allOnTrack) return null;

  if (alerts.length === 0 && allOnTrack) {
    return (
      <div
        className="fixed top-4 right-4 z-50 rounded-xl p-3 shadow-lg flex items-center gap-2 text-sm font-medium bg-green-900 text-green-100 border border-green-600"
        data-testid="chef-alert-all-on-track"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {tk("allOnTrack")}
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm" data-testid="chef-alerts-panel">
      {alerts.slice(0, 5).map(a => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          className={`rounded-xl p-3 shadow-lg flex items-start gap-2 text-sm font-medium cursor-pointer ${
            a.type === "overdue" ? "bg-red-900 text-red-100 border border-red-600" :
            a.type === "upcoming" ? "bg-amber-900 text-amber-100 border border-amber-600" :
            a.type === "hold_released" ? "bg-blue-900 text-blue-100 border border-blue-600" :
            "bg-green-900 text-green-100 border border-green-600"
          }`}
          data-testid={`chef-alert-${a.id}`}
          onClick={() => scrollToTicket(a.ticketId)}
          title={a.ticketId ? "Click to scroll to ticket" : undefined}
        >
          {a.type === "overdue" && <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          {a.type === "upcoming" && <Clock className="h-4 w-4 shrink-0 mt-0.5" />}
          {a.type === "hold_released" && <Bell className="h-4 w-4 shrink-0 mt-0.5" />}
          {a.type === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
          <div className="flex-1">{a.message}</div>
          <button
            onClick={e => { e.stopPropagation(); onDismiss(a.id); }}
            className="opacity-60 hover:opacity-100 shrink-0"
            data-testid={`button-dismiss-alert-${a.id}`}
          >✕</button>
        </motion.div>
      ))}
    </div>
  );
}

export default function KdsWallScreen() {
  const { t: tk } = useTranslation("kitchen");
  const [location] = useLocation();
  const qsRaw = location.includes("?") ? location.split("?")[1] : window.location.search.slice(1);
  const qp = new URLSearchParams(qsRaw);
  const hasAccess = true;
  const apiUrl = buildApiUrl(qp);
  const wsUrl = buildWsUrl(qp);
  const showCounters = qp.get("counters") === "1";

  const [tickets, setTickets] = useState<KDSWallTicket[]>([]);
  const [refireTicketIds, setRefireTicketIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(new Date());
  const [wsConnected, setWsConnected] = useState(false);
  const [kitchenSettings, setKitchenSettings] = useState<KitchenSettings>({
    cooking_control_mode: "auto_start",
    show_timing_suggestions: true,
    alert_overdue_minutes: 3,
    allow_rush_override: true,
    rush_requires_manager_pin: false,
    auto_hold_bar_items: false,
  });
  const [alerts, setAlerts] = useState<ChefAlert[]>([]);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const hasInteractedRef = useRef(false);

  const isSelectiveMode = kitchenSettings.cooking_control_mode === "selective" || kitchenSettings.cooking_control_mode === "course_only";

  const playChime = useCallback(() => {
    if (!hasInteractedRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.4);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.45);
      });
    } catch (_) {}
  }, []);

  useEffect(() => {
    function markInteracted() { hasInteractedRef.current = true; }
    window.addEventListener("click", markInteracted, { once: true });
    window.addEventListener("keydown", markInteracted, { once: true });
    return () => {
      window.removeEventListener("click", markInteracted);
      window.removeEventListener("keydown", markInteracted);
    };
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const token = qp.get("token");
      const params = token ? `?token=${encodeURIComponent(token)}` : "";
      const res = await fetch(`/api/kitchen-settings${params}`);
      if (res.ok) {
        const data = await res.json();
        setKitchenSettings(s => ({ ...s, ...data }));
      }
    } catch (_) {}
  }, [apiUrl]);

  const fetchTickets = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) return;
      const data: KDSWallTicket[] = await res.json();
      if (!Array.isArray(data)) return;

      const newIds = new Set(data.map(t => t.id));
      const hasNewTicket = data.some(t => !prevIdsRef.current.has(t.id));
      if (hasNewTicket && prevIdsRef.current.size > 0) playChime();
      prevIdsRef.current = newIds;
      setTickets(data);
    } catch (_) {}
  }, [apiUrl, playChime]);

  function handleWsEvent(event: string, rawPayload?: unknown) {
    if (REFRESH_EVENTS.has(event)) fetchTickets();
    if (event === "kds:item_overdue" && rawPayload) {
      const payload = rawPayload as { itemId?: string; itemName?: string; overdueMinutes?: number; orderId?: string };
      const alertId = `overdue-${payload.itemId ?? ""}-${Date.now()}`;
      const msg = tk("alertOverdue", { name: payload.itemName ?? tk("item"), mins: payload.overdueMinutes ?? 1 });
      setAlerts(prev => [...prev.filter(a => a.id !== alertId), {
        id: alertId, type: "overdue", message: msg,
        itemId: payload.itemId, ticketId: payload.orderId,
        expiresAt: Date.now() + 10000,
      }]);
      if (hasInteractedRef.current) playBeep();
    } else if (event === "kds:hold_released" && rawPayload) {
      const payload = rawPayload as { itemId?: string; itemName?: string; holdItemName?: string };
      const alertId = `hold-${payload.itemId ?? ""}-${Date.now()}`;
      setAlerts(prev => [...prev, {
        id: alertId, type: "hold_released",
        message: tk("alertHoldReleased", { ready: payload.holdItemName ?? tk("item"), next: payload.itemName ?? tk("nextItem") }),
        itemId: payload.itemId, expiresAt: Date.now() + 10000,
      }]);
    } else if (event === "kds:manager_alert" && rawPayload) {
      const payload = rawPayload as { message?: string };
      const alertId = `manager-${Date.now()}`;
      setAlerts(prev => [...prev, {
        id: alertId, type: "overdue", message: payload.message ?? tk("managerAlert"),
        expiresAt: Date.now() + 15000,
      }]);
    } else if (event === "kds:refire_ticket" && rawPayload) {
      const payload = rawPayload as { orderNumber?: string; itemName?: string; orderId?: string };
      const alertId = `refire-${Date.now()}`;
      setAlerts(prev => [...prev, {
        id: alertId, type: "overdue",
        message: tk("alertRefire", { name: payload.itemName ?? tk("item"), order: payload.orderNumber ?? "" }),
        expiresAt: Date.now() + 20000,
      }]);
      if (payload.orderId) {
        setRefireTicketIds(prev => { const next = new Set(prev); next.add(payload.orderId!); return next; });
        setTimeout(() => {
          setRefireTicketIds(prev => { const next = new Set(prev); next.delete(payload.orderId!); return next; });
        }, 5 * 60 * 1000);
      }
      fetchTickets();
    }
  }

  useWallWebSocket(wsUrl, handleWsEvent, setWsConnected);

  useEffect(() => {
    fetchTickets();
    fetchSettings();
    const interval = setInterval(fetchTickets, 8000);
    return () => clearInterval(interval);
  }, [fetchTickets, fetchSettings]);

  useEffect(() => {
    const iv = setInterval(() => {
      setNow(new Date());
      setAlerts(prev => prev.filter(a => a.expiresAt > Date.now()));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const sortWithRefireFirst = (arr: KDSWallTicket[]) =>
    [...arr].sort((a, b) => (refireTicketIds.has(b.id) ? 1 : 0) - (refireTicketIds.has(a.id) ? 1 : 0));

  const newTickets = sortWithRefireFirst(tickets.filter(t => t.status === "new" || t.status === "sent_to_kitchen"));
  const cookingTickets = sortWithRefireFirst(tickets.filter(t => t.status === "in_progress"));
  const readyTickets = tickets.filter(t => t.status === "ready");

  const allActiveItems = isSelectiveMode ? tickets.flatMap(t => (t.items || []).filter(i => !i.is_voided)) : [];
  const overdueItemIds = new Set(alerts.filter(a => a.type === "overdue" && a.itemId).map(a => a.itemId!));

  useEffect(() => {
    if (!isSelectiveMode || !kitchenSettings.show_timing_suggestions) return;
    const nowMs = Date.now();
    const upcomingMs = 120000;
    tickets.forEach(ticket => {
      (ticket.items || []).forEach(item => {
        const cs = mapItemCookingStatus(item);
        if (cs !== "queued" && cs !== "ready_to_start") return;
        const eta = item.estimatedReadyAt ? new Date(item.estimatedReadyAt).getTime() : null;
        if (!eta) return;
        const timeToStartMs = eta - nowMs - (item.prepTimeMinutes || 0) * 60000;
        if (timeToStartMs > 0 && timeToStartMs < upcomingMs) {
          const alertId = `upcoming-${item.id}`;
          if (!alerts.find(a => a.id === alertId)) {
            const mins = Math.ceil(timeToStartMs / 60000);
            setAlerts(prev => [...prev.filter(a => a.id !== alertId), {
              id: alertId,
              type: "upcoming",
              message: tk("alertUpcoming", { name: item.name, mins }),
              itemId: item.id,
              ticketId: ticket.id,
              expiresAt: nowMs + upcomingMs,
            }]);
          }
        }
      });
    });
  }, [now, tickets, isSelectiveMode, kitchenSettings.show_timing_suggestions]);

  const allOnTrack = isSelectiveMode &&
    allActiveItems.length > 0 &&
    alerts.filter(a => a.type === "overdue" || a.type === "upcoming").length === 0;

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white text-2xl" data-testid="kds-wall-screen">
        {tk("unauthorized")}
      </div>
    );
  }

  const statusColumns = [
    { key: "new", title: tk("colNew"), tickets: newTickets, icon: Utensils, headerColor: "text-teal-400", borderColor: "border-t-teal-500", badgeClass: "bg-teal-900 text-teal-300" },
    { key: "cooking", title: tk("colCooking"), tickets: cookingTickets, icon: Flame, headerColor: "text-orange-400", borderColor: "border-t-orange-500", badgeClass: "bg-orange-900 text-orange-300" },
    { key: "ready", title: tk("colReady"), tickets: readyTickets, icon: CheckCircle2, headerColor: "text-green-400", borderColor: "border-t-green-500", badgeClass: "bg-green-900 text-green-300" },
  ];

  const counterGroups = showCounters ? groupByCounter(tickets.filter(t => t.status !== "ready"), tk("unassigned")) : [];
  const colCount = showCounters ? Math.max(counterGroups.length, 1) : 3;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" data-testid="kds-wall-screen">
      <AnimatePresence>
        <ChefAlertsPanel
          alerts={alerts}
          onDismiss={id => setAlerts(prev => prev.filter(a => a.id !== id))}
          allOnTrack={allOnTrack}
        />
      </AnimatePresence>

      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/20">
            <ChefHat className="h-7 w-7 text-primary" />
          </div>
          <span className="text-2xl font-black tracking-tight">{tk("kitchenDisplay")}</span>
          {showCounters && (
            <Badge className="bg-primary/20 text-primary border-primary/40 text-xs">
              <LayoutGrid className="h-3 w-3 mr-1" />{tk("counterMode")}
            </Badge>
          )}
          {isSelectiveMode && (
            <Badge className="bg-blue-900 text-blue-300 border-blue-700 text-xs">
              {tk("itemControlMode")}
            </Badge>
          )}
          <span
            className={`ml-3 text-xs px-2 py-0.5 rounded-full font-medium ${wsConnected ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}
            data-testid="ws-status"
            title={wsConnected ? tk("liveWebSocket") : tk("pollingEvery8s")}
          >
            {wsConnected ? tk("live") : tk("polling")}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span data-testid="wall-total-count"><span className="text-white font-bold text-lg">{tickets.length}</span> {tk("ticketsLabel")}</span>
            <span>|</span>
            <span data-testid="wall-unassigned-count">
              <span className="text-amber-400 font-bold">{tickets.filter(t => !t.assignedChefName || t.assignmentStatus === "unassigned").length}</span> {tk("unassigned").toLowerCase()}
            </span>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-bold text-white tabular-nums" data-testid="wall-clock">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="text-gray-400 text-sm">{now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</div>
          </div>
        </div>
      </div>

      {showCounters ? (
        <div
          className="flex-1 overflow-x-auto"
          style={{ display: "grid", gridTemplateColumns: `repeat(${colCount}, minmax(280px, 1fr))` }}
          data-testid="wall-counters-grid"
        >
          {counterGroups.length === 0 ? (
            <div className="col-span-full flex items-center justify-center text-gray-600 text-xl py-24">
              {tk("noActiveTickets")}
            </div>
          ) : (
            counterGroups.map((grp) => (
              <div key={grp.counterId ?? "unassigned"} className="flex flex-col border-r border-gray-800 last:border-r-0 border-t-4 border-t-primary" data-testid={`wall-counter-col-${grp.counterId ?? "unassigned"}`}>
                <div className="px-5 py-3 bg-gray-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChefHat className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-black text-primary uppercase tracking-wide">{grp.counterName}</h2>
                  </div>
                  <span className="text-lg font-bold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary">
                    {grp.tickets.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <AnimatePresence mode="popLayout">
                    {grp.tickets.length === 0 ? (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-gray-600 text-base py-10">
                        {tk("noTickets")}
                      </motion.div>
                    ) : (
                      grp.tickets.map(ticket => (
                        <div key={ticket.id} className="space-y-1">
                          {refireTicketIds.has(ticket.id) && (
                            <div className="flex items-center gap-2 px-2 py-1 rounded-t-lg bg-orange-700 text-white font-black text-xs uppercase tracking-widest">
                              🔥🔥 {tk("refire")}
                              <span className="ml-auto px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">{tk("highPriority")}</span>
                            </div>
                          )}
                          {isSelectiveMode ? (
                            <SelectiveTicketCard ticket={ticket} settings={kitchenSettings} onRefresh={fetchTickets} />
                          ) : (
                            <WallTicketCard ticket={ticket} />
                          )}
                        </div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-3 gap-0 divide-x divide-gray-800">
          {statusColumns.map((col) => {
            const ColIcon = col.icon;
            return (
              <div key={col.key} className={`flex flex-col border-t-4 ${col.borderColor}`} data-testid={`wall-col-${col.key}`}>
                <div className="px-6 py-4 bg-gray-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ColIcon className={`h-6 w-6 ${col.headerColor}`} />
                    <h2 className={`text-xl font-black uppercase tracking-widest ${col.headerColor}`}>
                      {col.title}
                    </h2>
                  </div>
                  <span className={`text-xl font-bold px-3 py-1 rounded-full ${col.badgeClass}`} data-testid={`wall-count-${col.key}`}>
                    {col.tickets.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <AnimatePresence mode="popLayout">
                    {col.tickets.length === 0 ? (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center text-gray-600 text-lg py-16"
                      >
                        {tk("noTickets")}
                      </motion.div>
                    ) : (
                      col.tickets.map(ticket => (
                        <div key={ticket.id} className="space-y-1">
                          {refireTicketIds.has(ticket.id) && (
                            <div className="flex items-center gap-2 px-2 py-1 rounded-t-lg bg-orange-700 text-white font-black text-xs uppercase tracking-widest">
                              🔥🔥 {tk("refire")}
                              <span className="ml-auto px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">{tk("highPriority")}</span>
                            </div>
                          )}
                          {isSelectiveMode ? (
                            <SelectiveTicketCard ticket={ticket} settings={kitchenSettings} onRefresh={fetchTickets} />
                          ) : (
                            <WallTicketCard ticket={ticket} />
                          )}
                        </div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
