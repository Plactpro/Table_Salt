import { useTranslation } from "react-i18next";
import { useOutletTimezone, formatLocalTime } from "@/hooks/use-outlet-timezone";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useState, useMemo, useCallback, useEffect, useRef, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { getAllowedOrderTypes } from "@/lib/subscription";
import SupervisorApprovalDialog from "@/components/supervisor-approval-dialog";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { syncManager, type SyncStatus, type OfflineOrder } from "@/lib/sync-manager";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useRealtimeEvent } from "@/hooks/use-realtime";
import { useKotAutoDispatch } from "@/hooks/use-kot-auto-dispatch";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import VoidRequestModal from "@/components/tickets/VoidRequestModal";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, UtensilsCrossed, Package, Truck,
  StickyNote, CreditCard, Banknote, Wallet, Coffee, Beef, IceCream,
  Wine, Soup, Pizza, Salad, Sandwich, CheckCircle2, Tag, X, Percent, Link, QrCode,
  Receipt, Clock, Pause, RotateCcw, Scissors, Flame, ChevronDown, Users, Phone, User,
  MapPin, ChevronRight, Printer, AlertCircle, RefreshCw, WifiOff,
  XCircle,
} from "lucide-react";
import type { MenuCategory, MenuItem, Table, Offer, ComboOffer } from "@shared/schema";
import { selectPageData, type PaginatedResponse } from "@/lib/api-types";
import BillPreviewModal from "@/components/pos/BillPreviewModal";
import { StartShiftModal, CloseShiftDialog } from "@/components/pos/PosSessionModal";
import DeliveryQueuePanel, { DeliveryQueueButton } from "@/components/pos/DeliveryQueuePanel";
import ModificationDrawer, { type FoodModification, DEFAULT_MODIFICATION, hasModification } from "@/components/modifications/ModificationDrawer";
import { PageTitle, announceToScreenReader } from "@/lib/accessibility";
import { PosMenuSkeleton, PosCategorySkeleton } from "@/components/ui/skeletons";
import SyncErrorPanel from "@/components/sync-error-panel";
import ModifierSelectionDialog, { SelectedModifier } from "@/components/pos/ModifierSelectionDialog";
import { ALLERGENS } from "@shared/allergens";

interface EngineDiscount {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  discountType: string;
  discountAmount: number;
  description: string;
}

interface CartModifier {
  type: string;
  label: string;
  priceAdjust: number;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  basePrice: number;
  quantity: number;
  notes: string;
  isVeg: boolean | null;
  categoryId: string | null;
  isCombo?: boolean;
  comboId?: string;
  comboItems?: { menuItemId: string; name: string; price: string }[];
  originalPrice?: number;
  modifiers?: CartModifier[];
  cartKey: string;
  isAddon?: boolean;
  hsnCode?: string | null;
  foodModification?: FoodModification;
  pricingRuleReason?: string | null;
  itemDiscount?: number;
  itemDiscountType?: "flat" | "percent";
}

interface OrderTab {
  id: string;
  cart: CartItem[];
  orderType: "dine_in" | "takeaway" | "delivery";
  selectedTable: string;
  discount: string;
  orderNotes: string;
  selectedOfferId: string | null;
  dismissedRuleIds: string[];
  sentCartKeys: string[];
  heldOrderId?: string;
  heldOrderVersion?: number;
  customerName?: string;
  customerPhone?: string;
  covers?: number;
}

interface HeldTab {
  tab: OrderTab;
  heldAt: string;
  label: string;
}

type PaymentMethod = "cash" | "card" | "upi";

interface ModifierOption {
  label: string;
  priceAdjust: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  options: ModifierOption[];
}

interface MenuItemModifiersResponse {
  itemId: string;
  itemName: string;
  basePrice: string;
  groups: ModifierGroup[];
}

interface ServerHeldOrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: string;
  quantity: number;
  notes: string | null;
  modifiers: CartModifier[] | null;
  isAddon: boolean | null;
}

interface ServerHeldOrder {
  id: string;
  orderType: string;
  tableId: string | null;
  tableNumber?: number | null;
  discount: string;
  notes: string | null;
  items: ServerHeldOrderItem[];
}

const TABS_STORAGE_KEY = "pos_tabs_v2";
const HELD_TABS_STORAGE_KEY = "pos_held_tabs_v2";
const MAX_TABS = 6;

const SIZE_MODIFIERS = [
  { label: "Half", priceAdjust: -0.2 },
  { label: "Regular", priceAdjust: 0 },
  { label: "Large", priceAdjust: 0.3 },
  { label: "XL", priceAdjust: 0.5 },
];

const SPICE_MODIFIERS = [
  { label: "Mild", priceAdjust: 0 },
  { label: "Medium", priceAdjust: 0 },
  { label: "Spicy", priceAdjust: 0 },
  { label: "Extra Spicy", priceAdjust: 0 },
];

function makeid() {
  return crypto.randomUUID ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newTab(): OrderTab {
  return {
    id: makeid(),
    cart: [],
    orderType: "dine_in",
    selectedTable: "",
    discount: "",
    orderNotes: "",
    selectedOfferId: null,
    dismissedRuleIds: [],
    sentCartKeys: [],
    customerName: "",
    customerPhone: "",
    covers: 1,
  };
}

function loadTabsFromStorage(): OrderTab[] {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OrderTab[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function saveTabsToStorage(tabs: OrderTab[]) {
  try {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  } catch {}
}

function loadHeldTabsFromStorage(): HeldTab[] {
  try {
    const raw = localStorage.getItem(HELD_TABS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as HeldTab[];
  } catch {}
  return [];
}

function saveHeldTabsToStorage(held: HeldTab[]) {
  try {
    localStorage.setItem(HELD_TABS_STORAGE_KEY, JSON.stringify(held));
  } catch {}
}

const categoryIcons: Record<string, React.ElementType> = {
  appetizers: Soup, starters: Soup, mains: Beef, main: Beef,
  desserts: IceCream, dessert: IceCream, drinks: Coffee,
  beverages: Wine, salads: Salad, pizza: Pizza, sandwiches: Sandwich,
};

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase();
  for (const [key, Icon] of Object.entries(categoryIcons)) {
    if (lower.includes(key)) return Icon;
  }
  return UtensilsCrossed;
}

function isOfferActive(offer: Offer): boolean {
  if (!offer.active) return false;
  const now = new Date();
  if (offer.startDate && new Date(offer.startDate) > now) return false;
  if (offer.endDate && new Date(offer.endDate) < now) return false;
  if (offer.usageLimit && (offer.usageCount ?? 0) >= offer.usageLimit) return false;
  return true;
}

function isHappyHourActive(offer: Offer): boolean {
  if (offer.type !== "happy_hour") return true;
  const conditions = offer.conditions as any;
  const start = conditions?.happyHourStart as string | undefined;
  const end   = conditions?.happyHourEnd   as string | undefined;
  if (!start || !end) {
    const hour = new Date().getHours();
    return hour >= 16 && hour < 19;
  }
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return cur >= sh * 60 + sm && cur < eh * 60 + em;
}

function isOfferApplicable(offer: Offer, cart: CartItem[], subtotal: number): boolean {
  if (!isOfferActive(offer)) return false;
  if (!isHappyHourActive(offer)) return false;
  if (offer.minOrderAmount && subtotal < Number(offer.minOrderAmount)) return false;
  const scope = offer.scope || "all_items";
  if (scope === "all_items" || scope === "order_total") return true;
  if (scope === "category" && offer.scopeRef) return cart.some((item) => item.categoryId === offer.scopeRef);
  if (scope === "specific_items" && offer.scopeRef) {
    const itemIds = offer.scopeRef.split(",").map((s) => s.trim());
    return cart.some((item) => itemIds.includes(item.menuItemId));
  }
  return true;
}

interface ComboItemRef { menuItemId: string; name: string; price: string; }

function isComboActive(combo: ComboOffer, userOutletId?: string | null): boolean {
  if (!combo.isActive) return false;
  const now = new Date();
  if (combo.validityStart && new Date(combo.validityStart) > now) return false;
  if (combo.validityEnd && new Date(combo.validityEnd) < now) return false;
  if (combo.timeSlots && Array.isArray(combo.timeSlots) && combo.timeSlots.length > 0) {
    const hour = now.getHours();
    const currentSlot = hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : "late_night";
    if (!combo.timeSlots.includes(currentSlot)) return false;
  }
  if (combo.outlets && Array.isArray(combo.outlets) && combo.outlets.length > 0 && userOutletId) {
    if (!combo.outlets.includes(userOutletId)) return false;
  }
  return true;
}

class PageErrorBoundary extends Component<{ children: ReactNode; label: string }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; label: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] page error:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <AlertCircle className="h-10 w-10 text-destructive opacity-60" />
          <p className="text-sm">Something went wrong loading <strong>{this.props.label}</strong>.</p>
          <button className="text-xs underline" onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function POSPage() {
  const { t: tc } = useTranslation("common");
  const { t: tp } = useTranslation("pos");
  const defaultModifierLabelMap: Record<string, string> = {
    "Half": tp("sizeHalf"), "Regular": tp("sizeRegular"), "Large": tp("sizeLarge"), "XL": tp("sizeXL"),
    "Mild": tp("spiceMild"), "Medium": tp("spiceMedium"), "Spicy": tp("spiceSpicy"), "Extra Spicy": tp("spiceExtraSpicy"),
  };
  const getModifierLabel = (label: string) => defaultModifierLabelMap[label] ?? label;
  const { user } = useAuth();
  const outletTimezone = useOutletTimezone();
  const { toast } = useToast();
  const [selectedVoidItem, setSelectedVoidItem] = useState<any>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const { dispatchKotForOrder } = useKotAutoDispatch();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
  const userOutletId = user && "outletId" in user ? (user as { outletId?: string }).outletId || null : null;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [showKbdHelp, setShowKbdHelp] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [supervisorDialog, setSupervisorDialog] = useState<{
    open: boolean; action: string; actionLabel: string;
  } | null>(null);
  const [paymentLinkModal, setPaymentLinkModal] = useState<{
    open: boolean; url: string; qrDataUrl: string; copied: boolean; orderId?: string;
  } | null>(null);
  const [posSessionId, setPosSessionId] = useState<string | null>(null);
  const posCartKey = userOutletId ? `pos_cart_${userOutletId}_${posSessionId ?? "default"}` : null;
  const [posSession, setPosSession] = useState<{ id: string; shiftName: string | null; openedAt: string } | null>(null);
  const [showStartShift, setShowStartShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [sessionElapsed, setSessionElapsed] = useState("");
  const [lastPlacedOrder, setLastPlacedOrder] = useState<{
    orderId: string;
    cart: CartItem[];
    subtotal: number;
    discountAmount: number;
    serviceChargeAmount: number;
    taxAmount: number;
    total: number;
    tableId?: string;
    tableNumber?: string | number;
  } | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [reprintManagerDialog, setReprintManagerDialog] = useState<{ open: boolean; orderId: string } | null>(null);
  const [reprintManagerLoading, setReprintManagerLoading] = useState(false);
  const [posVersionConflict, setPosVersionConflict] = useState(false);

  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    const stored = loadTabsFromStorage();
    if (stored.length > 0) return stored;
    const initialTab = newTab();
    saveTabsToStorage([initialTab]);
    return [initialTab];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const stored = loadTabsFromStorage();
    return stored[0]?.id ?? "";
  });

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);
  const activeTabIndex = useMemo(() => tabs.findIndex(t => t.id === activeTabId), [tabs, activeTabId]);

  const cart = activeTab?.cart ?? [];
  const orderType = activeTab?.orderType ?? "dine_in";
  const selectedTable = activeTab?.selectedTable ?? "";
  const discount = activeTab?.discount ?? "";
  const orderNotes = activeTab?.orderNotes ?? "";

  const updateTab = useCallback((id: string, patch: Partial<OrderTab>) => {
    setTabs(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...patch } : t);
      saveTabsToStorage(updated);
      if (posCartKey) syncManager.saveActiveCart(posCartKey, updated).catch(() => {});
      return updated;
    });
  }, [posCartKey]);

  const updateActiveTab = useCallback((patch: Partial<OrderTab>) => {
    if (!activeTabId) return;
    updateTab(activeTabId, patch);
  }, [activeTabId, updateTab]);

  const setCart = useCallback((fn: (prev: CartItem[]) => CartItem[]) => {
    setTabs(prev => {
      const updated = prev.map(t => t.id === activeTabId ? { ...t, cart: fn(t.cart) } : t);
      saveTabsToStorage(updated);
      if (posCartKey) syncManager.saveActiveCart(posCartKey, updated).catch(() => {});
      return updated;
    });
  }, [activeTabId, posCartKey]);

  const addTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      toast({ title: "Maximum tabs reached", description: `You can have up to ${MAX_TABS} order tabs open.`, variant: "destructive" });
      return;
    }
    const tab = newTab();
    setTabs(prev => {
      const updated = [...prev, tab];
      saveTabsToStorage(updated);
      if (posCartKey) syncManager.saveActiveCart(posCartKey, updated).catch(() => {});
      return updated;
    });
    setActiveTabId(tab.id);
  }, [tabs.length, toast, posCartKey]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length === 1) {
        const fresh = [newTab()];
        saveTabsToStorage(fresh);
        if (posCartKey) syncManager.saveActiveCart(posCartKey, fresh).catch(() => {});
        setActiveTabId(fresh[0].id);
        return fresh;
      }
      const idx = prev.findIndex(t => t.id === id);
      const updated = prev.filter(t => t.id !== id);
      saveTabsToStorage(updated);
      if (posCartKey) syncManager.saveActiveCart(posCartKey, updated).catch(() => {});
      if (activeTabId === id) {
        const newIdx = Math.max(0, idx - 1);
        setActiveTabId(updated[newIdx]?.id ?? updated[0].id);
      }
      return updated;
    });
  }, [activeTabId, posCartKey]);

  const requestCloseTab = useCallback((id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab && tab.cart.length > 0) {
      const sentKeys = new Set(tab.sentCartKeys);
      const hasUnsent = tab.cart.some(c => !sentKeys.has(c.cartKey));
      if (hasUnsent) {
        setCloseTabConfirm(id);
        return;
      }
    }
    closeTab(id);
  }, [tabs, closeTab]);

  const [heldTabs, setHeldTabs] = useState<HeldTab[]>(() => loadHeldTabsFromStorage());
  const [showRecall, setShowRecall] = useState(false);

  useEffect(() => { syncManager.init(); }, []);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("online");
  const [syncPending, setSyncPending] = useState(0);
  const isOffline = syncStatus === "offline";

  const [heldOrdersFromCache, setHeldOrdersFromCache] = useState(false);
  const [cachedHeldOrders, setCachedHeldOrders] = useState<ServerHeldOrder[]>([]);

  const { data: serverHeldOrdersRaw = [], isLoading: heldOrdersLoading } = useQuery<ServerHeldOrder[]>({
    queryKey: ["/api/orders/on-hold"],
    enabled: showRecall,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!heldOrdersLoading && showRecall && !isOffline && userOutletId) {
      syncManager.setOpenOrdersCache(userOutletId, serverHeldOrdersRaw).catch(() => {});
      setCachedHeldOrders(serverHeldOrdersRaw);
      setHeldOrdersFromCache(false);
    }
  }, [serverHeldOrdersRaw, heldOrdersLoading, showRecall, isOffline, userOutletId]);

  useEffect(() => {
    if (!showRecall || !userOutletId || !isOffline) return;
    syncManager.init().then(async () => {
      const snap = await syncManager.getOpenOrdersCache(userOutletId);
      if (snap && snap.orders.length > 0) {
        setCachedHeldOrders(snap.orders as ServerHeldOrder[]);
        setHeldOrdersFromCache(true);
      }
    }).catch(() => {});
  }, [showRecall, userOutletId, isOffline]);

  const [offlineQueuedOrders, setOfflineQueuedOrders] = useState<OfflineOrder[]>([]);
  useEffect(() => {
    if (!showRecall) return;
    syncManager.init().then(async () => {
      const orders = await syncManager.getOfflineOrders(userOutletId);
      setOfflineQueuedOrders(orders.filter(o => o.status === "queued"));
    }).catch(() => {});
  }, [showRecall, userOutletId]);

  const serverHeldOrders = isOffline ? cachedHeldOrders : (serverHeldOrdersRaw.length > 0 ? serverHeldOrdersRaw : cachedHeldOrders);
  const orphanedServerOrders = useMemo<ServerHeldOrder[]>(() =>
    serverHeldOrders.filter(o => !heldTabs.some(h => h.tab.heldOrderId === o.id)),
    [serverHeldOrders, heldTabs]
  );
  const [modifierItem, setModifierItem] = useState<CartItem | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);
  const [pendingMenuItem, setPendingMenuItem] = useState<any>(null);
  const [modifierSize, setModifierSize] = useState("Regular");
  const [modifierSpice, setModifierSpice] = useState("Medium");
  const [modifierExtras, setModifierExtras] = useState("");
  const [modifierNote, setModifierNote] = useState("");
  const [customizeItem, setCustomizeItem] = useState<CartItem | null>(null);

  const { data: modifierGroups } = useQuery<MenuItemModifiersResponse>({
    queryKey: ["/api/menu-items", modifierItem?.menuItemId, "modifiers"],
    queryFn: async () => {
      const res = await fetch(`/api/menu-items/${modifierItem!.menuItemId}/modifiers`);
      if (!res.ok) throw new Error("Failed to load modifiers");
      return res.json() as Promise<MenuItemModifiersResponse>;
    },
    enabled: !!modifierItem?.menuItemId,
    staleTime: 60_000,
  });

  const sizeGroup = modifierGroups?.groups.find(g => g.id === "size");
  const spiceGroup = modifierGroups?.groups.find(g => g.id === "spice");
  const [splitAssignment, setSplitAssignment] = useState<Record<string, number>>({});
  const [splitGroupCount, setSplitGroupCount] = useState(2);
  const [noteDialogItem, setNoteDialogItem] = useState<string | null>(null);
  const [itemNoteText, setItemNoteText] = useState("");
  const [closeTabConfirm, setCloseTabConfirm] = useState<string | null>(null);
  const [showDeliveryQueue, setShowDeliveryQueue] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [pendingTableId, setPendingTableId] = useState<string | null>(null); // PR-009: wrong-table confirmation
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [discountPreset, setDiscountPreset] = useState<"none" | "5" | "10" | "15" | "20" | "custom">("none");

  useEffect(() => { setDiscountPreset("none"); }, [activeTabId]);

  const [menuCacheNotice, setMenuCacheNotice] = useState<{ cachedAt: number; fromCache: boolean } | null>(null);
  const [menuRefreshing, setMenuRefreshing] = useState(false);
  const [showOfflinePaymentDialog, setShowOfflinePaymentDialog] = useState(false);
  const offlinePaymentPendingRef = useRef(false);

  useEffect(() => {
    const unsub = syncManager.subscribe((s, p) => {
      setSyncStatus(s);
      setSyncPending(p);
    });
    const unsubComplete = syncManager.onSyncComplete((count) => {
      toast({
        title: `${count} offline order${count !== 1 ? "s" : ""} synced successfully`,
        description: "All queued orders have been sent to the server.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/on-hold"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      if (userOutletId) {
        fetch("/api/orders/on-hold", { credentials: "include" })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (Array.isArray(data) && userOutletId) {
              syncManager.setOpenOrdersCache(userOutletId, data).catch(() => {});
            }
          })
          .catch(() => {});
      }
    });
    return () => { unsub(); unsubComplete(); };
  }, [toast, queryClient, userOutletId]);

  useEffect(() => {
    if (!posCartKey) return;
    let cancelled = false;
    syncManager.init().then(async () => {
      if (cancelled) return;
      try {
        const saved = await syncManager.getActiveCart(posCartKey);
        if (saved && Array.isArray(saved) && saved.length > 0) {
          const storedTabs = loadTabsFromStorage();
          const hasContent = storedTabs.some(t => t.cart.length > 0);
          if (!hasContent) {
            setTabs(saved as OrderTab[]);
            setActiveTabId((saved as OrderTab[])[0]?.id ?? "");
          }
        }
      } catch {}
    });
    return () => { cancelled = true; };
  }, [posCartKey]);

  const paymentModalRef = useRef(paymentLinkModal);
  paymentModalRef.current = paymentLinkModal;

  const handleOrderTerminal = useCallback((payload: unknown) => {
    const p = payload as { orderId?: string; status?: string } | null;
    const modal = paymentModalRef.current;
    if (!modal?.open || !modal.orderId) return;
    if (p?.orderId === modal.orderId && p?.status === "paid") {
      setPaymentLinkModal(null);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      toast({ title: "Payment received!", description: "Order has been marked as paid." });
      announceToScreenReader("Payment received! Order has been marked as paid.");
    }
  }, [queryClient, toast]);

  useRealtimeEvent("order:updated", handleOrderTerminal);
  useRealtimeEvent("order:completed", handleOrderTerminal);
  useRealtimeEvent("order:updated", useCallback((payload: unknown) => {
    const p = payload as { status?: string } | null;
    if (p?.status && ["in_progress", "ready", "served"].includes(p.status)) {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    }
  }, [queryClient]));
  useRealtimeEvent("order:item_updated", useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
  }, [queryClient]));
  useRealtimeEvent("menu:updated", useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/menu-items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/menu-categories"] });
  }, [queryClient]));

  const { data: categoriesRaw = [], isLoading: categoriesLoading, isOfflineCached: categoriesFromCache } = useCachedQuery<MenuCategory[]>(["/api/menu-categories"], "/api/menu-categories");
  const { data: menuItemsRaw = [], isLoading: menuItemsLoading, isOfflineCached: itemsFromCache, refetch: refetchMenuItems } = useCachedQuery<MenuItem[], PaginatedResponse<MenuItem>>(["/api/menu-items", "all"], "/api/menu-items?limit=500", { select: selectPageData });

  const [menuCacheData, setMenuCacheData] = useState<{ categories: MenuCategory[]; items: MenuItem[]; cachedAt: number } | null>(null);

  useEffect(() => {
    if (!categoriesLoading && !menuItemsLoading) {
      if (!categoriesFromCache && !itemsFromCache && categoriesRaw.length > 0 && userOutletId) {
        syncManager.setMenuCache(userOutletId, { categories: categoriesRaw, items: menuItemsRaw }).catch(() => {});
        setMenuCacheData(null);
        setMenuCacheNotice(null);
      }
    }
  }, [categoriesFromCache, itemsFromCache, categoriesRaw.length, menuItemsRaw.length, categoriesLoading, menuItemsLoading, userOutletId]);

  useEffect(() => {
    if (!isOffline || !userOutletId) return;
    syncManager.init().then(async () => {
      const cached = await syncManager.getMenuCache(userOutletId);
      if (cached) {
        setMenuCacheData({ categories: cached.categories as MenuCategory[], items: cached.items as MenuItem[], cachedAt: cached.cachedAt });
        setMenuCacheNotice({ cachedAt: cached.cachedAt, fromCache: true });
      }
    }).catch(() => {});
  }, [isOffline, userOutletId]);

  const categories: MenuCategory[] = (isOffline && menuCacheData) ? menuCacheData.categories : categoriesRaw;
  const menuItems: MenuItem[] = (isOffline && menuCacheData) ? menuCacheData.items : menuItemsRaw;
  const posMenuLoading = categoriesLoading || menuItemsLoading;

  const handleMenuRefresh = useCallback(async () => {
    if (isOffline || menuRefreshing) return;
    setMenuRefreshing(true);
    try {
      await refetchMenuItems();
      await queryClient.refetchQueries({ queryKey: ["/api/menu-categories"] });
      setMenuCacheNotice(null);
      toast({ title: "Menu refreshed" });
    } catch {
      toast({ title: "Menu refresh failed", description: "Could not reach the server", variant: "destructive" });
    } finally {
      setMenuRefreshing(false);
    }
  }, [isOffline, menuRefreshing, refetchMenuItems, queryClient, toast]);

  const { data: tables = [] } = useQuery<Table[]>({ queryKey: ["/api/tables"] });
  const { data: offers = [] } = useCachedQuery<Offer[]>(["/api/offers"], "/api/offers");
  const { data: comboOffers = [] } = useQuery<ComboOffer[]>({ queryKey: ["/api/combo-offers"] });

  const { data: resolvedPrices = [] } = useQuery<{ menuItemId: string; basePrice: number; resolvedPrice: number; appliedRule: string | null; ruleReason: string | null; hasRule: boolean }[]>({
    queryKey: ["/api/pricing/resolve/batch", userOutletId, orderType, menuItems.map(m => m.id).join(",")],
    queryFn: async () => {
      if (!menuItems.length || !userOutletId) return [];
      const res = await apiRequest("POST", "/api/pricing/resolve/batch", {
        items: menuItems.map(m => ({ menuItemId: m.id })),
        outletId: userOutletId,
        orderType,
        orderTime: new Date().toISOString(),
      });
      return res.json();
    },
    enabled: !!userOutletId && menuItems.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const resolvedPriceMap = useMemo(() => {
    const map = new Map<string, { resolvedPrice: number; basePrice: number; ruleReason: string | null; hasRule: boolean }>();
    for (const r of resolvedPrices) {
      map.set(r.menuItemId, { resolvedPrice: r.resolvedPrice, basePrice: r.basePrice, ruleReason: r.ruleReason, hasRule: r.hasRule });
    }
    return map;
  }, [resolvedPrices]);

  const { data: activeSessionData } = useQuery<{ id: string; shiftName: string | null; openedAt: string } | null>({
    queryKey: ["/api/pos/session"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pos/session");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (activeSessionData === undefined) return;
    if (activeSessionData) {
      setPosSessionId(activeSessionData.id);
      setPosSession(activeSessionData);
      setShowStartShift(false);
    } else {
      setPosSessionId(null);
      setPosSession(null);
      setShowStartShift(true);
    }
  }, [activeSessionData]);

  useEffect(() => {
    if (!posSession?.openedAt) { setSessionElapsed(""); return; }
    const update = () => {
      const diffMs = Date.now() - new Date(posSession.openedAt).getTime();
      const h = Math.floor(diffMs / 3_600_000);
      const m = Math.floor((diffMs % 3_600_000) / 60_000);
      setSessionElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [posSession?.openedAt]);

  const activeCombos = useMemo(() => comboOffers.filter((c) => isComboActive(c, userOutletId)), [comboOffers, userOutletId]);
  const freeTables = useMemo(() => tables.filter((t) => t.status === "free"), [tables]);

  const filteredItems = useMemo(() => {
    let items = [...menuItems];
    if (selectedCategory) items = items.filter((item) => item.categoryId === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q));
    }
    return items;
  }, [menuItems, selectedCategory, searchQuery]);

  const getPosGridCols = () => {
    if (typeof window === "undefined") return 3;
    if (window.innerWidth >= 1024) return 4;
    if (window.innerWidth >= 768) return 3;
    return 2;
  };
  const [posGridCols, setPosGridCols] = useState(getPosGridCols);
  useEffect(() => {
    const onResize = () => setPosGridCols(getPosGridCols());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const posGridRows = useMemo(() => {
    const rows: (typeof filteredItems)[] = [];
    for (let i = 0; i < filteredItems.length; i += posGridCols) {
      rows.push(filteredItems.slice(i, i + posGridCols));
    }
    return rows;
  }, [filteredItems, posGridCols]);
  const usePosVirtual = filteredItems.length > 50;
  const posMenuScrollRef = useRef<HTMLDivElement>(null);
  const posMenuVirtualizer = useVirtualizer({
    count: posGridRows.length,
    getScrollElement: () => posMenuScrollRef.current,
    estimateSize: () => 198,
    overscan: 3,
    enabled: usePosVirtual,
  });

  const subtotal = useMemo(() => cart.reduce((sum, item) => {
    const lineTotal = item.price * item.quantity;
    const disc = item.itemDiscount || 0;
    const discAmt = item.itemDiscountType === 'percent' ? lineTotal * disc / 100 : disc;
    return sum + lineTotal - discAmt;
  }, 0), [cart]);

  const selectedOffer = useMemo(() => {
    if (!activeTab?.selectedOfferId) return null;
    return offers.find(o => o.id === activeTab.selectedOfferId) || null;
  }, [activeTab?.selectedOfferId, offers]);

  const dismissedRuleIds = useMemo(() => new Set(activeTab?.dismissedRuleIds ?? []), [activeTab?.dismissedRuleIds]);

  const evaluatePayload = useMemo(() => {
    if (cart.length === 0) return null;
    return {
      items: cart.map((c) => ({ menuItemId: c.menuItemId, name: c.name, price: c.price, quantity: c.quantity, categoryId: c.categoryId || undefined, modifiers: c.modifiers?.filter((m: any) => m.type === "modifier-group").map((m: any) => ({ groupId: m.groupId, groupName: m.groupName, optionId: m.optionId, optionName: m.optionName || m.label, priceAdjustment: m.priceAdjust })) || [] })),
      subtotal, channel: "pos", orderType,
    };
  }, [cart, subtotal, orderType]);

  const { data: engineResult } = useQuery<{ appliedDiscounts: EngineDiscount[]; totalDiscount: number; finalSubtotal: number }>({
    queryKey: ["/api/promotions/evaluate", evaluatePayload],
    queryFn: async () => {
      if (!evaluatePayload) return { appliedDiscounts: [], totalDiscount: 0, finalSubtotal: subtotal };
      const res = await apiRequest("POST", "/api/promotions/evaluate", evaluatePayload);
      return res.json();
    },
    enabled: cart.length > 0,
    staleTime: 5000,
  });

  const engineDiscounts = useMemo(() => {
    const all = engineResult?.appliedDiscounts ?? [];
    return all.filter((d) => !dismissedRuleIds.has(d.ruleId));
  }, [engineResult, dismissedRuleIds]);

  const engineDiscount = useMemo(() => engineDiscounts.reduce((sum, d) => sum + d.discountAmount, 0), [engineDiscounts]);
  const SUPPORTED_OFFER_TYPES = ["percentage", "fixed_amount", "happy_hour"];
  const applicableOffers = useMemo(
    () => offers.filter((offer) => SUPPORTED_OFFER_TYPES.includes(offer.type) && isOfferApplicable(offer, cart, subtotal)),
    [offers, cart, subtotal]
  );
  const offerDiscount = useMemo(() => {
    if (!selectedOffer) return 0;
    if (!isOfferApplicable(selectedOffer, cart, subtotal)) return 0;
    let disc = 0;
    if (selectedOffer.type === "percentage" || selectedOffer.type === "happy_hour") {
      disc = subtotal * (Number(selectedOffer.value) / 100);
    } else if (selectedOffer.type === "fixed_amount") {
      disc = Number(selectedOffer.value);
    }
    if (selectedOffer.maxDiscount && disc > Number(selectedOffer.maxDiscount)) disc = Number(selectedOffer.maxDiscount);
    return Math.min(disc, subtotal);
  }, [selectedOffer, subtotal, cart]);

  const manualDiscount = useMemo(() => {
    const d = parseFloat(discount);
    return isNaN(d) ? 0 : d;
  }, [discount]);

  const totalDiscount = offerDiscount + manualDiscount + engineDiscount;
  const tenantTaxType = user?.tenant?.taxType || "vat";
  const tenantCompoundTax = user?.tenant?.compoundTax ?? false;
  const tenantServiceChargePct = Number(user?.tenant?.serviceCharge || "0") / 100;
  const taxRate = tenantTaxType === "none" ? 0 : Number(user?.tenant?.taxRate || "5") / 100;
  const afterDiscount = Math.max(0, subtotal - totalDiscount);
  const serviceChargeAmount = afterDiscount * tenantServiceChargePct;
  const taxBase = tenantCompoundTax ? afterDiscount + serviceChargeAmount : afterDiscount;
  const taxAmount = taxBase * taxRate;
  const total = afterDiscount + serviceChargeAmount + taxAmount;
  const isDineIn = orderType === "dine_in";
  const allowedTypes = getAllowedOrderTypes((user?.tenant?.businessType as any) || "casual_dining");

    const handleModifierConfirm = (modifiers: SelectedModifier[], totalAdjustment: number) => {
    if (!pendingMenuItem) return;
    const baseP = parseFloat(String(pendingMenuItem.price));
    const cartMods: any[] = modifiers.map(m => ({ type: "modifier-group" as const, label: m.optionName, priceAdjust: m.priceAdjustment, groupId: m.groupId, groupName: m.groupName, optionId: m.optionId, optionName: m.optionName }));
    setCart(prev => {
      const cartKey = Math.random().toString(36).substr(2, 9);
      return [...prev, {
        menuItemId: pendingMenuItem.id,
        name: pendingMenuItem.name,
        price: baseP + totalAdjustment,
        basePrice: baseP,
        quantity: 1,
        notes: "",
        isVeg: pendingMenuItem.isVeg ?? null,
        categoryId: pendingMenuItem.categoryId ?? null,
        cartKey,
        hsnCode: pendingMenuItem.hsnCode || null,
        modifiers: cartMods.length > 0 ? cartMods : undefined,
      }];
    });
    setPendingMenuItem(null);
  };

  const addToCart = useCallback((item: MenuItem) => {
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 600);
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id && !c.isCombo && !c.modifiers?.length);
      if (existing) {
        return prev.map((c) => c.cartKey === existing.cartKey ? { ...c, quantity: c.quantity + 1 } : c);
      }
      const cartKey = makeid();
      const resolved = resolvedPriceMap.get(item.id);
      const basePrice = parseFloat(item.price);
      const resolvedPrice = resolved?.resolvedPrice ?? basePrice;
      const ruleReason = resolved?.ruleReason ?? null;
      return [...prev, {
        menuItemId: item.id, name: item.name,
        price: resolvedPrice, basePrice,
        quantity: 1, notes: "", isVeg: item.isVeg, categoryId: item.categoryId,
        cartKey, hsnCode: item.hsnCode || null,
        originalPrice: (resolved?.hasRule && resolvedPrice !== basePrice) ? basePrice : undefined,
        ...(ruleReason ? { pricingRuleReason: ruleReason } : {}),
      }];
    });
  }, [setCart, resolvedPriceMap]);

  const addComboToCart = useCallback((combo: ComboOffer) => {
    const mainItems = (combo.mainItems as ComboItemRef[]) || [];
    const sideItems = (combo.sideItems as ComboItemRef[]) || [];
    const addonItems = (combo.addonItems as ComboItemRef[]) || [];
    const allComboItems = [...mainItems, ...sideItems, ...addonItems];
    const savingsAmount = Number(combo.individualTotal) - Number(combo.comboPrice);
    const comboCartId = `combo-${combo.id}-${Date.now()}`;
    setAddedItemId(combo.id);
    setTimeout(() => setAddedItemId(null), 600);
    setCart((prev) => [
      ...prev,
      {
        menuItemId: comboCartId, name: combo.name,
        price: Number(combo.comboPrice), basePrice: Number(combo.comboPrice),
        quantity: 1, notes: `Save ${fmt(savingsAmount)}`,
        isVeg: null, categoryId: null, isCombo: true,
        comboId: combo.id, comboItems: allComboItems,
        originalPrice: Number(combo.individualTotal),
        cartKey: makeid(),
      },
    ]);
  }, [fmt, setCart]);

  const updateQuantity = useCallback((cartKey: string, delta: number) => {
    setCart((prev) => prev.map((c) => c.cartKey === cartKey ? { ...c, quantity: c.quantity + delta } : c).filter((c) => c.quantity > 0));
  }, [setCart]);

  const removeFromCart = useCallback((cartKey: string) => {
    setCart((prev) => prev.filter((c) => c.cartKey !== cartKey));
  }, [setCart]);

  const openModifierDrawer = (item: CartItem) => {
    if (item.isCombo) return;
    setModifierItem(item);
    const sizeModifier = item.modifiers?.find(m => m.type === "size");
    const spiceModifier = item.modifiers?.find(m => m.type === "spice");
    const extraModifier = item.modifiers?.find(m => m.type === "extra");
    setModifierSize(sizeModifier?.label || "Regular");
    setModifierSpice(spiceModifier?.label || "Medium");
    setModifierExtras(extraModifier?.label || "");
    setModifierNote(item.notes || "");
  };

  const saveModifiers = () => {
    if (!modifierItem) return;
    const sizeOptions = sizeGroup?.options ?? SIZE_MODIFIERS;
    const sizeEntry = sizeOptions.find(s => s.label === modifierSize) ?? { label: "Regular", priceAdjust: 0 };
    const mods: CartModifier[] = [
      { type: "size", label: modifierSize, priceAdjust: sizeEntry.priceAdjust },
      { type: "spice", label: modifierSpice, priceAdjust: 0 },
    ];
    if (modifierExtras.trim()) {
      mods.push({ type: "extra", label: modifierExtras.trim(), priceAdjust: 0 });
    }
    const newPrice = Math.max(0, modifierItem.basePrice * (1 + sizeEntry.priceAdjust));
    setCart(prev => prev.map(c => c.cartKey === modifierItem.cartKey
      ? { ...c, modifiers: mods, price: Number(newPrice.toFixed(2)), notes: modifierNote }
      : c
    ));
    setModifierItem(null);
    setModifierNote("");
    setModifierExtras("");
  };

  const saveCartItemModification = useCallback((cartKey: string, modification: FoodModification) => {
    setCart(prev => prev.map(c => c.cartKey === cartKey ? { ...c, foodModification: modification } : c));
  }, [setCart]);

  const openNoteDialog = (cartKey: string) => {
    const item = cart.find((c) => c.cartKey === cartKey);
    setItemNoteText(item?.notes || "");
    setNoteDialogItem(cartKey);
  };

  const saveItemNote = () => {
    if (noteDialogItem) {
      setCart((prev) => prev.map((c) => c.cartKey === noteDialogItem ? { ...c, notes: itemNoteText } : c));
    }
    setNoteDialogItem(null);
    setItemNoteText("");
  };

  const holdOrderMutation = useMutation({
    mutationFn: async () => {
      const hasPlacedOrder = !!activeTab?.heldOrderId;
      if (hasPlacedOrder) {
        const version = activeTab!.heldOrderVersion;
        if (version === undefined) {
          // Fetch current version if not tracked
          const fetchRes = await apiRequest("GET", `/api/orders/${activeTab!.heldOrderId}`);
          const fetchedOrder = await fetchRes.json();
          const res = await apiRequest("PATCH", `/api/orders/${activeTab!.heldOrderId}`, { status: "on_hold", version: fetchedOrder.version });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            if ((res.status === 409 && data.code === "VERSION_CONFLICT") || (res.status === 400 && data.code === "VERSION_REQUIRED")) throw Object.assign(new Error(data.message), { isVersionConflict: true });
            throw new Error(data.message || "Failed to hold order");
          }
          const updated = await res.json();
          return { id: activeTab!.heldOrderId!, version: updated.version };
        }
        const res = await apiRequest("PATCH", `/api/orders/${activeTab!.heldOrderId}`, { status: "on_hold", version });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if ((res.status === 409 && data.code === "VERSION_CONFLICT") || (res.status === 400 && data.code === "VERSION_REQUIRED")) throw Object.assign(new Error(data.message), { isVersionConflict: true });
          throw new Error(data.message || "Failed to hold order");
        }
        const updated = await res.json();
        return { id: activeTab!.heldOrderId!, version: updated.version };
      }
      if (cart.length === 0) return null;
      const orderData = buildOrderData();
      orderData.status = "on_hold";
      const res = await apiRequest("POST", "/api/orders", orderData);
      const order = await res.json();
      return { id: order.id as string, version: order.version as number };
    },
    onSuccess: (result) => {
      const orderId = result?.id ?? activeTab!.heldOrderId;
      const tabLabel = isDineIn && selectedTable
        ? `Table ${tables.find(t => t.id === selectedTable)?.number || ""}`
        : orderType === "takeaway" ? "Takeaway" : "Delivery";
      const heldTab: OrderTab = { ...activeTab!, heldOrderId: orderId, heldOrderVersion: result?.version ?? activeTab!.heldOrderVersion };
      const held: HeldTab = { tab: heldTab, heldAt: new Date().toISOString(), label: tabLabel };
      const updated = [...heldTabs, held];
      setHeldTabs(updated);
      saveHeldTabsToStorage(updated);
      closeTab(activeTabId);
      queryClient.invalidateQueries({ queryKey: ["/api/orders/on-hold"] });
      toast({ title: "Order held", description: `${tabLabel} saved. Use Recall to restore it.` });
    },
    onError: (err: any) => {
      if (err.isVersionConflict) { setPosVersionConflict(true); return; }
      toast({ title: "Failed to hold order", description: err.message, variant: "destructive" });
    },
  });

  const holdCurrentTab = useCallback(() => {
    const hasPlacedOrder = !!activeTab?.heldOrderId;
    if (cart.length === 0 && !hasPlacedOrder) {
      toast({ title: tp("cartIsEmpty"), description: tp("nothingToHold"), variant: "destructive" });
      return;
    }
    holdOrderMutation.mutate();
  }, [cart, activeTab, holdOrderMutation, toast]);

  const recallHeldTab = (held: HeldTab) => {
    const tab = { ...held.tab, id: makeid() };
    setTabs(prev => {
      const updated = [...prev, tab];
      saveTabsToStorage(updated);
      return updated;
    });
    setActiveTabId(tab.id);
    const updatedHeld = heldTabs.filter(h => h.heldAt !== held.heldAt);
    setHeldTabs(updatedHeld);
    saveHeldTabsToStorage(updatedHeld);
    if (held.tab.heldOrderId) {
      apiRequest("PATCH", `/api/orders/${held.tab.heldOrderId}`, { status: "in_progress", version: held.tab.heldOrderVersion }).catch(() => {});
    }
    setShowRecall(false);
    toast({ title: tp("orderRecalled"), description: tp("restoredToCart", { label: held.label }) });
  };

  const deleteHeldTab = (held: HeldTab) => {
    const updatedHeld = heldTabs.filter(h => h.heldAt !== held.heldAt);
    setHeldTabs(updatedHeld);
    saveHeldTabsToStorage(updatedHeld);
  };

  const recallServerOrder = useCallback((order: ServerHeldOrder) => {
    const reconstructedCart: CartItem[] = (order.items || []).map((item: ServerHeldOrderItem) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      price: parseFloat(item.price),
      basePrice: parseFloat(item.price),
      quantity: item.quantity,
              itemDiscount: item.itemDiscount || 0,
              itemDiscountType: item.itemDiscountType || "flat",
      notes: item.notes || "",
      isVeg: null,
      categoryId: null,
      modifiers: item.modifiers || undefined,
      cartKey: makeid(),
      isAddon: item.isAddon ?? false,
    }));
    const tab: OrderTab = {
      id: makeid(),
      cart: reconstructedCart,
      orderType: (order.orderType as OrderTab["orderType"]) || "dine_in",
      selectedTable: order.tableId || "",
      discount: order.discount || "",
      orderNotes: order.notes || "",
      selectedOfferId: null,
      dismissedRuleIds: [],
      sentCartKeys: [],
      heldOrderId: order.id,
      heldOrderVersion: order.version,
    };
    setTabs(prev => { const u = [...prev, tab]; saveTabsToStorage(u); return u; });
    setActiveTabId(tab.id);
    apiRequest("PATCH", `/api/orders/${order.id}`, { status: "in_progress", version: order.version }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["/api/orders/on-hold"] });
    setShowRecall(false);
    toast({ title: "Order recalled", description: "Server order restored to cart." });
  }, [queryClient, toast]);

  const buildOrderData = useCallback((supervisorOverride?: { username: string; password: string; otpApprovalToken?: string }, tabOverride?: OrderTab) => {
    const tab = tabOverride || activeTab!;
    const clientOrderId = crypto.randomUUID ? crypto.randomUUID() : `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const sentKeys = new Set(tab.sentCartKeys);
    const tabIsDineIn = tab.orderType === "dine_in";
    const isAddonKot = sentKeys.size > 0 && tabIsDineIn;

    const itemsToSend = isAddonKot
      ? tab.cart.filter(c => !sentKeys.has(c.cartKey))
      : tab.cart;

    const orderItems: Record<string, unknown>[] = [];
    for (const c of itemsToSend) {
      const modifiersData = c.modifiers && c.modifiers.length > 0 ? c.modifiers : null;
      if (c.isCombo && c.comboItems) {
        orderItems.push({
          menuItemId: c.comboId || c.menuItemId, name: c.name,
          quantity: c.quantity, price: c.price.toFixed(2),
          notes: c.comboItems.map((ci) => ci.name).join(", ") + (c.notes ? ` | ${c.notes}` : ""),
          isCombo: true, comboId: c.comboId || undefined,
          isAddon: isAddonKot,
        });
      } else {
        const foodMod = c.foodModification;
        const hasActiveMod = foodMod && (
          foodMod.spiceLevel || foodMod.saltLevel ||
          foodMod.removedIngredients.length > 0 ||
          foodMod.allergyFlags.length > 0 ||
          foodMod.allergyDetails?.trim() ||
          foodMod.specialNotes?.trim()
        );
        orderItems.push({
          menuItemId: c.menuItemId, name: c.name,
          quantity: c.quantity, price: c.price.toFixed(2),
          notes: c.notes || null,
          modifiers: modifiersData,
          isAddon: isAddonKot,
          metadata: hasActiveMod ? { foodModification: foodMod } : undefined,
        });
      }
    }

    const tabDiscount = parseFloat(tab.discount);
    const tabManualDiscount = isNaN(tabDiscount) ? 0 : tabDiscount;
    const tabSubtotal = itemsToSend.reduce((s, c) => s + c.price * c.quantity, 0);
    const tabAfterDiscount = Math.max(0, tabSubtotal - (isAddonKot ? 0 : tabManualDiscount));
    const tabServiceCharge = tabAfterDiscount * tenantServiceChargePct;
    const tabTaxBase = tenantCompoundTax ? tabAfterDiscount + tabServiceCharge : tabAfterDiscount;
    const tabTax = tabTaxBase * taxRate;
    const tabTotal = tabAfterDiscount + tabServiceCharge + tabTax;

    const orderData: Record<string, unknown> = {
      channel: "pos", clientOrderId,
        outletId: userOutletId,
      orderType: tab.orderType,
      tableId: tabIsDineIn ? tab.selectedTable || null : null,
      subtotal: tabSubtotal.toFixed(2),
      tax: tabTax.toFixed(2),
      discount: (isAddonKot ? 0 : tabManualDiscount).toFixed(2),
      total: tabTotal.toFixed(2),
      notes: (() => {
        const parts: string[] = [];
        if (!tabIsDineIn) {
          if (tab.customerName?.trim()) parts.push(`Customer: ${tab.customerName.trim()}`);
          if (tab.customerPhone?.trim()) parts.push(`Phone: ${tab.customerPhone.trim()}`);
        }
        if (tabIsDineIn && (tab.covers ?? 1) > 1) parts.push(`Covers: ${tab.covers}`);
        if (tab.orderNotes?.trim()) parts.push(tab.orderNotes.trim());
        if (offlinePaymentPendingRef.current) parts.push("payment_pending_offline: true");
        return parts.length > 0 ? parts.join(" | ") : null;
      })(),
      status: tabIsDineIn ? "in_progress" : "new",
      items: orderItems,
      offerId: (!isAddonKot && tab.selectedOfferId) ? tab.selectedOfferId : null,
      manualDiscountAmount: (!isAddonKot && tabManualDiscount > 0) ? tabManualDiscount.toFixed(2) : null,
    };
    if (tab.heldOrderId) orderData.parentOrderId = tab.heldOrderId;
    if (!tabIsDineIn) orderData.paymentMethod = paymentMethod;
    if (!tabIsDineIn) { orderData.customerName = tab.customerName?.trim() || null; orderData.customerPhone = tab.customerPhone?.trim() || null; }
    if (supervisorOverride) orderData.supervisorOverride = supervisorOverride;
    if (!isAddonKot && tab.dismissedRuleIds.length > 0) orderData.dismissedRuleIds = tab.dismissedRuleIds;
    return orderData;
  }, [activeTab, paymentMethod, tenantServiceChargePct, tenantCompoundTax, taxRate]);

  const placeOrderMutation = useMutation({
    mutationFn: async (supervisorOverride?: { username: string; password: string; otpApprovalToken?: string }) => {
      const orderData = buildOrderData(supervisorOverride);
      if (supervisorOverride) {
        const supervisorCsrfMatch = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
        const supervisorCsrf = supervisorCsrfMatch ? decodeURIComponent(supervisorCsrfMatch[1]) : null;
        const supervisorHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (supervisorCsrf) supervisorHeaders["x-csrf-token"] = supervisorCsrf;
        // PR-001: stable idempotency key for supervisor override order creation
        if (orderData.clientOrderId) supervisorHeaders["x-idempotency-key"] = orderData.clientOrderId as string;
        const res = await fetch("/api/orders", {
          method: "POST", headers: supervisorHeaders, credentials: "include",
          body: JSON.stringify(orderData),
        });
        if (res.status === 403) {
          const errData = await res.json();
          if (errData.requiresSupervisor) throw new Error("__SUPERVISOR_REQUIRED__:" + (errData.action || "apply_large_discount"));
          throw new Error(errData.message || "Permission denied");
        }
        if (res.status === 409) return (await res.json()).order;
        if (!res.ok) throw new Error((await res.json()).message || "Failed");
        return res.json();
      }
      try {
        const { queued, orderId } = await syncManager.enqueueOrder(orderData);
        if (queued) {
          const localTicket = `LOCAL-${orderId.slice(-6).toUpperCase()}`;
          return { id: orderId, queued: true, localTicket };
        }
        return { id: orderId };
      } catch (syncErr: any) {
        if (syncErr.status === 403 && syncErr.data?.requiresSupervisor) {
          throw new Error("__SUPERVISOR_REQUIRED__:" + (syncErr.data.action || "apply_large_discount"));
        }
        throw syncErr;
      }
    },
    onSuccess: (data: any) => {
      offlinePaymentPendingRef.current = false;
      if (data?.queued) {
        const ticket = data.localTicket || `LOCAL-${data.id?.slice(-6)?.toUpperCase() || "QUEUE"}`;
        toast({ title: tp("orderQueued", { ticket }), description: tp("willSyncWhenOnline") });
        announceToScreenReader(`Order queued as ${ticket}. Will sync when connection is restored.`);
      } else {
        const isAddonKot = (activeTab?.sentCartKeys.length ?? 0) > 0 && isDineIn;
        const msg = isAddonKot ? tp("addonKotSent") : isDineIn ? tp("orderSentToKitchen") : tp("orderPlacedSuccess");
        toast({ title: msg });
        announceToScreenReader(msg);
        if (isDineIn && data?.id) {
          dispatchKotForOrder(data.id, user?.tenant?.name || "Kitchen");
        }
      }
      const tableNum = tables.find(t => t.id === selectedTable)?.number;
      const snapshot = {
        orderId: data.id, cart: [...cart],
        subtotal, discountAmount: totalDiscount,
        serviceChargeAmount, taxAmount, total,
        tableId: selectedTable || undefined, tableNumber: tableNum,
      };
      setLastPlacedOrder(snapshot);
      if (isDineIn) {
        const sentKeys = new Set(activeTab?.sentCartKeys ?? []);
        const newlySentKeys = cart.filter(c => !sentKeys.has(c.cartKey)).map(c => c.cartKey);
        const allSentKeys = [...(activeTab?.sentCartKeys ?? []), ...newlySentKeys];
        updateActiveTab({
          sentCartKeys: allSentKeys,
          heldOrderId: data.id,
          heldOrderVersion: data.version,
          discount: "",
          orderNotes: "",
          selectedOfferId: null,
          dismissedRuleIds: [],
        });
      } else {
        setShowBillModal(true);
        updateActiveTab({ cart: [], discount: "", orderNotes: "", selectedOfferId: null, dismissedRuleIds: [], sentCartKeys: [], selectedTable: "", heldOrderId: undefined });
        if (posCartKey) syncManager.clearActiveCart(posCartKey).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/combo-offers"] });
    },
    onError: (err: Error) => {
      offlinePaymentPendingRef.current = false;
      if (err.message.startsWith("__SUPERVISOR_REQUIRED__:")) {
        const action = err.message.split(":")[1];
        setSupervisorDialog({ open: true, action: action || "apply_large_discount", actionLabel: tp("applyLargeDiscount") });
        return;
      }
      toast({ title: tp("failedToPlaceOrder"), description: err.message, variant: "destructive" });
    },
  });

  const handlePosSupervisorApproved = useCallback((_supervisorId: string, credentials: { username: string; password: string }) => {
    placeOrderMutation.mutate(credentials);
    setSupervisorDialog(null);
  }, [placeOrderMutation]);

  const hasUnsentItems = useMemo(() => {
    if (cart.length === 0) return false;
    if (!activeTab?.sentCartKeys.length) return true;
    const sentKeys = new Set(activeTab.sentCartKeys);
    return cart.some(c => !sentKeys.has(c.cartKey));
  }, [cart, activeTab?.sentCartKeys]);

  const isAddonKotMode = useMemo(() => {
    return isDineIn && (activeTab?.sentCartKeys.length ?? 0) > 0;
  }, [isDineIn, activeTab?.sentCartKeys]);

  const handlePlaceOrder = () => {
    if (!hasUnsentItems) {
      toast({ title: tp("noNewItemsToSend"), description: tp("addItemsBeforeKot"), variant: "destructive" });
      return;
    }
    if (isDineIn && !selectedTable) {
      if (tables.length === 0) {
        toast({ title: tp("noTablesSetUp"), description: tp("configureTablesFirst"), variant: "destructive" });
      } else {
        toast({ title: tp("selectATable"), description: tp("chooseTableForDineIn"), variant: "destructive" });
      }
      return;
    }
    if (!isDineIn) {
      if (!activeTab?.customerName?.trim()) {
        toast({ title: "Customer name required", description: "Please enter a customer name for this order.", variant: "destructive" });
        return;
      }
      if (!activeTab?.customerPhone?.trim()) {
        toast({ title: "Customer phone required", description: "Please enter a customer phone number for this order.", variant: "destructive" });
        return;
      }
      if (isOffline) {
        setShowOfflinePaymentDialog(true);
        return;
      }
      setTenderedAmount("");
      setShowPaymentModal(true);
      return;
    }
    placeOrderMutation.mutate(undefined);
  };

  const confirmPaymentAndPlace = () => {
    setShowPaymentModal(false);
    placeOrderMutation.mutate(undefined);
  };

  const sendPaymentLinkMutation = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Cart is empty");
      const orderData = buildOrderData(undefined);
      const orderRes = await apiRequest("POST", "/api/orders", orderData);
      if (!orderRes.ok) throw new Error((await orderRes.json()).message || "Failed to place order");
      const order = await orderRes.json();
      const linkRes = await apiRequest("POST", `/api/orders/${order.id}/payment-link`, {});
      if (!linkRes.ok) throw new Error("Stripe not configured or failed to create payment link");
      const linkData = await linkRes.json() as { url: string; qrDataUrl: string; orderId: string };
      return { ...linkData, orderId: linkData.orderId ?? order.id };
    },
    onSuccess: (data) => {
      setPaymentLinkModal({ open: true, url: data.url, qrDataUrl: data.qrDataUrl, copied: false, orderId: data.orderId });
      updateActiveTab({ cart: [], discount: "", orderNotes: "", selectedOfferId: null, dismissedRuleIds: [] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    },
    onError: (err: Error) => {
      toast({ title: tp("paymentLinkFailed"), description: err.message, variant: "destructive" });
    },
  });

  const splitOrderMutation = useMutation({
    mutationFn: async (groups: CartItem[][]) => {
      const nonEmpty = groups.filter(g => g.length > 0);
      const parentOrderId: string | undefined = activeTab?.heldOrderId || undefined;
      const results: { id: string }[] = [];
      for (const group of nonEmpty) {
        const tabForGroup: OrderTab = { ...(activeTab!), id: makeid(), cart: group, sentCartKeys: [] };
        const orderData = buildOrderData(undefined, tabForGroup);
        const payload = parentOrderId ? { ...orderData, parentOrderId } : orderData;
        const res = await apiRequest("POST", "/api/orders", payload);
        if (!res.ok) throw new Error("Failed to place split order");
        results.push((await res.json()) as { id: string });
      }
      return { orders: results, groups: nonEmpty };
    },
    onSuccess: ({ orders, groups }) => {
      toast({ title: tp("ordersSplit"), description: tp("separateOrdersCreated", { count: orders.length }) });
      const currentActiveTab = activeTab!;
      const splitTabs: OrderTab[] = groups.map((group, i) => {
        const allCartKeys = group.map(c => c.cartKey);
        return {
          ...currentActiveTab,
          id: makeid(),
          cart: group,
          sentCartKeys: allCartKeys,
          heldOrderId: orders[i]?.id,
          orderNotes: `Split ${i + 1}/${orders.length}`,
        };
      });
      setTabs(prev => {
        const withoutActive = prev.filter(t => t.id !== currentActiveTab.id);
        const updated = [...withoutActive, ...splitTabs];
        saveTabsToStorage(updated);
        return updated;
      });
      if (splitTabs.length > 0) setActiveTabId(splitTabs[0].id);
      setShowSplitDialog(false);
      setSplitAssignment({});
      setSplitGroupCount(2);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    },
    onError: (err: Error) => {
      toast({ title: tp("splitFailed"), description: err.message, variant: "destructive" });
    },
  });

  const handleSplitConfirm = () => {
    const groups: CartItem[][] = Array.from({ length: splitGroupCount }, (_, i) =>
      cart.filter(c => (splitAssignment[c.cartKey] ?? 1) === i + 1)
    );
    const hasEmptyGroup = groups.some(g => g.length === 0);
    if (hasEmptyGroup) {
      toast({ title: tp("invalidSplit"), description: tp("everyGroupNeedsItem"), variant: "destructive" });
      return;
    }
    splitOrderMutation.mutate(groups);
  };

  const tabLabel = useCallback((tab: OrderTab) => {
    if (tab.orderType === "takeaway") return "Takeaway";
    if (tab.orderType === "delivery") return "Delivery";
    const tbl = tables.find(t => t.id === tab.selectedTable);
    return tbl ? `T${tbl.number}` : "Dine-in";
  }, [tables]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const inInput = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT" || (activeEl as HTMLElement).isContentEditable);

      if (e.key === "Escape") {
        if (showKbdHelp) { setShowKbdHelp(false); e.preventDefault(); return; }
        if (showBillModal) { setShowBillModal(false); e.preventDefault(); return; }
        if (modifierItem) { setModifierItem(null); e.preventDefault(); return; }
        if (noteDialogItem) { setNoteDialogItem(null); e.preventDefault(); return; }
        if (showSplitDialog) { setShowSplitDialog(false); e.preventDefault(); return; }
        if (showRecall) { setShowRecall(false); e.preventDefault(); return; }
        if (showMobileCart) { setShowMobileCart(false); e.preventDefault(); return; }
        return;
      }

      if (inInput) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "n" || e.key === "N") { e.preventDefault(); addTab(); }
        else if (e.key === "b" || e.key === "B") {
          e.preventDefault();
          const billOrderId = activeTab?.heldOrderId || lastPlacedOrder?.orderId;
          if (billOrderId) navigate(`/pos/bill/${billOrderId}`);
        }
        else if (e.key === "k" || e.key === "K") { e.preventDefault(); handlePlaceOrder(); }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowKbdHelp(prev => !prev);
        return;
      }

      if (!showBillModal) {
        if (e.key === "/" || e.key === "f") {
          e.preventDefault();
          searchInputRef.current?.focus();
          return;
        }
        if (e.key === "n") {
          e.preventDefault();
          addTab();
          return;
        }
        if (e.key === "b" && cart.length > 0) {
          e.preventDefault();
          const billOrderId = activeTab?.heldOrderId || lastPlacedOrder?.orderId;
          if (billOrderId) {
            navigate(`/pos/bill/${billOrderId}`);
          } else {
            setShowBillModal(true);
          }
          return;
        }
        const numKey = parseInt(e.key, 10);
        if (!isNaN(numKey) && numKey >= 1 && numKey <= 9) {
          e.preventDefault();
          const cards = document.querySelectorAll<HTMLElement>('[data-testid^="card-menu-item-"]');
          const target = cards[numKey - 1];
          if (target) target.focus();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addTab, modifierItem, noteDialogItem, showSplitDialog, showRecall, lastPlacedOrder, activeTab, navigate, handlePlaceOrder, showBillModal, showKbdHelp, showMobileCart, cart.length]);

  return (
    <PageErrorBoundary label="POS"><><PageTitle title={tc("pos")} /><div className="flex h-full gap-0 relative overflow-x-hidden" data-testid="pos-page">
      {showKbdHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none" aria-live="polite">
          <div className="bg-popover border border-border rounded-xl shadow-xl p-4 w-72 pointer-events-auto" data-testid="kbd-shortcut-overlay">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm" data-testid="kbd-shortcut-help">{tp("keyboardShortcuts")}</h3>
              <button onClick={() => setShowKbdHelp(false)} className="text-muted-foreground hover:text-foreground" aria-label={tp("closeKbdHelp")}><X className="h-4 w-4" /></button>
            </div>
            <table className="w-full text-xs">
              <tbody className="space-y-1">
                {[
                  ["/  or  f", tp("focusSearch")],
                  ["n", tp("newOrderTab")],
                  ["b", tp("openBill")],
                  ["1–9", tp("focusMenuItem")],
                  ["?", tp("toggleHelp")],
                  ["Esc", tp("closeModal")],
                ].map(([key, action]) => (
                  <tr key={key} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-3"><kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">{key}</kbd></td>
                    <td className="py-1.5 text-muted-foreground">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r">
        <div className="p-4 border-b space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={searchInputRef} data-testid="input-search-menu" placeholder={tp("searchMenuPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" aria-label={tp("searchMenuPlaceholder")} />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleMenuRefresh}
                  disabled={isOffline || menuRefreshing}
                  data-testid="button-refresh-menu"
                  aria-label={tp("refreshMenu")}
                >
                  <RefreshCw className={menuRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">
                  {isOffline ? tp("cannotRefreshOffline") : menuCacheNotice?.cachedAt
                    ? tp("menuUpdatedMinAgo", { n: Math.round((Date.now() - menuCacheNotice.cachedAt) / 60000) })
                    : tp("refreshMenu")}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          {menuCacheNotice?.fromCache && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2.5 py-1.5" data-testid="notice-menu-cache">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>{tp("usingCachedMenu", { n: Math.round((Date.now() - menuCacheNotice.cachedAt) / 60000) })}</span>
            </div>
          )}
          <div className="relative flex-shrink-0">
            <div className="flex gap-2 flex-nowrap overflow-x-auto pb-1 scrollbar-none">
            {posMenuLoading ? (
              <PosCategorySkeleton />
            ) : (
              <>
                <Button data-testid="button-category-all" variant={selectedCategory === null && !showCombos ? "default" : "outline"} size="sm" onClick={() => { setSelectedCategory(null); setShowCombos(false); }}>
                  <UtensilsCrossed className="h-3.5 w-3.5 mr-1" /> {tp("all")}
                </Button>
                {activeCombos.length > 0 && (
                  <Button data-testid="button-category-combos" variant={showCombos ? "default" : "outline"} size="sm" onClick={() => { setShowCombos(true); setSelectedCategory(null); }} className="whitespace-nowrap">
                    <Package className="h-3.5 w-3.5 mr-1" /> {tp("combos")}
                    <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">{activeCombos.length}</Badge>
                  </Button>
                )}
                {categories.filter((c) => c.active !== false).map((cat) => {
                  const CatIcon = getCategoryIcon(cat.name);
                  return (
                    <Button key={cat.id} data-testid={`button-category-${cat.id}`} variant={selectedCategory === cat.id ? "default" : "outline"} size="sm" onClick={() => { setSelectedCategory(cat.id); setShowCombos(false); }} className="whitespace-nowrap">
                      <CatIcon className="h-3.5 w-3.5 mr-1" /> {cat.name}
                    </Button>
                  );
                })}
              </>
            )}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {showCombos ? (
            activeCombos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Package className="h-12 w-12 mb-2" /><p>{tp("noActiveCombos")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {activeCombos.map((combo, index) => {
                  const mainItems = (combo.mainItems as ComboItemRef[]) || [];
                  const sideItems = (combo.sideItems as ComboItemRef[]) || [];
                  const addonItems = (combo.addonItems as ComboItemRef[]) || [];
                  const allComboItems = [...mainItems, ...sideItems, ...addonItems];
                  const justAdded = addedItemId === combo.id;
                  return (
                    <motion.div key={combo.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03, duration: 0.3 }}>
                      <Card data-testid={`card-combo-${combo.id}`} className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.03] relative overflow-hidden border-2 border-primary/20" onClick={() => addComboToCart(combo)}>
                        <AnimatePresence>
                          {justAdded && (
                            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center bg-primary/20 backdrop-blur-sm rounded-lg">
                              <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.4 }}>
                                <CheckCircle2 className="h-8 w-8 text-primary" />
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="h-20 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center relative">
                          <Package className="h-8 w-8 text-primary/40" />
                          <Badge className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold" data-testid={`badge-combo-save-${combo.id}`}>
                            SAVE {Number(combo.savingsPercentage).toFixed(0)}%
                          </Badge>
                        </div>
                        <CardContent className="p-3">
                          <h4 className="font-semibold text-sm leading-tight line-clamp-2 mb-1" data-testid={`text-combo-name-${combo.id}`}>{combo.name}</h4>
                          <div className="flex flex-wrap gap-0.5 mb-2">
                            {allComboItems.slice(0, 3).map((item, i) => (
                              <span key={i} className="text-[9px] px-1 py-0 rounded bg-muted text-muted-foreground">{item.name}</span>
                            ))}
                            {allComboItems.length > 3 && <span className="text-[9px] px-1 py-0 rounded bg-muted text-muted-foreground">+{allComboItems.length - 3}</span>}
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-bold text-sm text-primary" data-testid={`text-combo-price-${combo.id}`}>{fmt(combo.comboPrice)}</span>
                            <span className="text-xs text-muted-foreground line-through">{fmt(combo.individualTotal)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )
          ) : posMenuLoading ? (
            <PosMenuSkeleton />
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <UtensilsCrossed className="h-12 w-12 mb-2" /><p>No items found</p>
            </div>
          ) : usePosVirtual ? (
            <div ref={posMenuScrollRef} className="overflow-auto flex-1">
              <div style={{ height: `${posMenuVirtualizer.getTotalSize()}px`, position: "relative" }}>
                {posMenuVirtualizer.getVirtualItems().map((vRow) => (
                  <div key={vRow.index} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vRow.start}px)`, display: "grid", gridTemplateColumns: `repeat(${posGridCols}, minmax(0, 1fr))`, gap: "0.75rem", paddingBottom: "0.75rem" }}>
                    {posGridRows[vRow.index]?.map((item) => {
                      const inCart = cart.find((c) => c.menuItemId === item.id && !c.isCombo);
                      const justAdded = addedItemId === item.id;
                      const isUnavailable = item.available === false;
                      const resolvedItemPrice = resolvedPriceMap.get(item.id);
                      const hasSpecialPrice = resolvedItemPrice?.hasRule && resolvedItemPrice.resolvedPrice !== resolvedItemPrice.basePrice;
                      return (
                        <Card key={item.id} data-testid={`card-menu-item-${item.id}`} className={`transition-all duration-200 relative overflow-hidden ${isUnavailable ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:shadow-lg hover:scale-[1.02]"} ${inCart && !isUnavailable ? "border-primary/40 ring-1 ring-primary/20" : ""}`} onClick={() => !isUnavailable && addToCart(item)}>
                          <AnimatePresence>{justAdded && (<motion.div key="added" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center bg-primary/20 backdrop-blur-sm rounded-lg"><motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.4 }}><CheckCircle2 className="h-8 w-8 text-primary" /></motion.div></motion.div>)}</AnimatePresence>
                          {isUnavailable && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg"><span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-muted text-muted-foreground border">Unavailable</span></div>}
                          {item.image ? (<div className="overflow-hidden bg-muted" style={{ height: "110px" }}><img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /></div>) : (<div className="bg-muted/50 flex items-center justify-center" style={{ height: "110px" }}><UtensilsCrossed className="h-6 w-6 text-muted-foreground/40" /></div>)}
                          <CardContent className="p-2.5">
                            <div className="flex items-start justify-between mb-0.5">
                              <h4 className="font-medium text-sm leading-tight line-clamp-2 flex-1 mr-1">{item.name}</h4>
                          {item.allergenFlags && Object.values(item.allergenFlags as any).some(Boolean) && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5" title="Contains allergens">
                              {ALLERGENS.filter(a => (item.allergenFlags as any)?.[a.key]).slice(0, 5).map(a => (
                                <span key={a.key} className="text-xs" title={`Contains ${a.label}`}>{a.icon}</span>
                              ))}
                              {ALLERGENS.filter(a => (item.allergenFlags as any)?.[a.key]).length > 5 && (
                                <span className="text-xs text-muted-foreground">+{ALLERGENS.filter(a => (item.allergenFlags as any)?.[a.key]).length - 5}</span>
                              )}
                            </div>
                          )}
                              {item.isVeg === true ? (<span className="h-4 w-4 shrink-0 border-2 border-green-600 rounded-sm flex items-center justify-center mt-0.5"><span className="w-2 h-2 rounded-full bg-green-600" /></span>) : item.isVeg === false ? (<span className="h-4 w-4 shrink-0 border-2 border-red-600 rounded-sm flex items-center justify-center mt-0.5"><span className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-red-600" /></span>) : null}
                            </div>
                            {item.description && <p className="text-[10px] text-muted-foreground line-clamp-1 mb-1.5">{item.description}</p>}
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm text-primary" data-testid={`text-price-${item.id}`}>{fmt(resolvedItemPrice?.resolvedPrice ?? item.price)}</span>
                              {inCart && !isUnavailable ? (<div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}><button className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted transition-colors" onClick={() => updateQuantity(inCart.cartKey, -1)}><Minus className="h-3 w-3" /></button><span className="w-6 text-center text-sm font-semibold">{inCart.quantity}</span><button className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted transition-colors" onClick={() => updateQuantity(inCart.cartKey, 1)}><Plus className="h-3 w-3" /></button></div>) : (!isUnavailable && <button className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors" onClick={(e) => { e.stopPropagation(); setPendingMenuItem(item); setModifierDialogOpen(true); }}><Plus className="h-3.5 w-3.5 text-primary" /></button>)}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredItems.map((item, index) => {
                const inCart = cart.find((c) => c.menuItemId === item.id && !c.isCombo);
                const justAdded = addedItemId === item.id;
                const isUnavailable = item.available === false;
                const resolvedItemPrice = resolvedPriceMap.get(item.id);
                const hasSpecialPrice = resolvedItemPrice?.hasRule && resolvedItemPrice.resolvedPrice !== resolvedItemPrice.basePrice;
                return (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03, duration: 0.3 }}>
                    <Card data-testid={`card-menu-item-${item.id}`} className={`transition-all duration-200 relative overflow-hidden ${isUnavailable ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:shadow-lg hover:scale-[1.02]"} ${inCart && !isUnavailable ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
                      onClick={() => !isUnavailable && addToCart(item)}>
                      <AnimatePresence>
                        {justAdded && (
                          <motion.div key="added" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center bg-primary/20 backdrop-blur-sm rounded-lg">
                            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.4 }}>
                              <CheckCircle2 className="h-8 w-8 text-primary" />
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {isUnavailable && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg">
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-muted text-muted-foreground border">Unavailable</span>
                        </div>
                      )}
                      {item.image ? (
                        <div className="overflow-hidden bg-muted" style={{ height: "110px" }}>
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      ) : (
                        <div className="bg-muted/50 flex items-center justify-center" style={{ height: "110px" }} data-testid={`placeholder-${item.id}`}>
                          <UtensilsCrossed className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                      <CardContent className="p-2.5">
                        <div className="flex items-start justify-between mb-0.5">
                          <h4 className="font-medium text-sm leading-tight line-clamp-2 flex-1 mr-1">{item.name}</h4>
                          {item.isVeg === true ? (
                            <span className="h-4 w-4 shrink-0 border-2 border-green-600 rounded-sm flex items-center justify-center mt-0.5" data-testid={`icon-veg-${item.id}`}>
                              <span className="w-2 h-2 rounded-full bg-green-600" />
                            </span>
                          ) : item.isVeg === false ? (
                            <span className="h-4 w-4 shrink-0 border-2 border-red-600 rounded-sm flex items-center justify-center mt-0.5" data-testid={`icon-nonveg-${item.id}`}>
                              <span className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-red-600" />
                            </span>
                          ) : null}
                        </div>
                        {item.description && <p className="text-[10px] text-muted-foreground line-clamp-1 mb-1.5">{item.description}</p>}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm text-primary" data-testid={`text-price-${item.id}`}>
                              {fmt(resolvedItemPrice?.resolvedPrice ?? item.price)}
                            </span>
                            {hasSpecialPrice && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[10px] cursor-help" data-testid={`icon-pricing-tag-${item.id}`}>🏷️</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{resolvedItemPrice?.ruleReason || "Special price active"}</p>
                                    <p className="text-xs opacity-70">Base: {fmt(item.price)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {inCart && !isUnavailable ? (
                            <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                              <button className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted transition-colors" data-testid={`button-card-decrease-${item.id}`} onClick={() => updateQuantity(inCart.cartKey, -1)}><Minus className="h-3 w-3" /></button>
                              <motion.span key={inCart.quantity} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="w-6 text-center text-sm font-semibold" data-testid={`badge-qty-${item.id}`}>{inCart.quantity}</motion.span>
                              <button className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted transition-colors" data-testid={`button-card-increase-${item.id}`} onClick={() => updateQuantity(inCart.cartKey, 1)}><Plus className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            !isUnavailable && <button className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors" onClick={(e) => { e.stopPropagation(); addToCart(item); }} data-testid={`button-card-add-${item.id}`}><Plus className="h-3.5 w-3.5 text-primary" /></button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="md:hidden fixed bottom-4 right-4 z-40">
            <Button
              data-testid="button-mobile-view-cart"
              size="lg"
              className="shadow-xl rounded-full px-5 gap-2 font-semibold"
              onClick={() => setShowMobileCart(true)}
              aria-label={`View cart with ${cart.reduce((s, c) => s + c.quantity, 0)} items`}
            >
              <ShoppingCart className="h-5 w-5" />
              View Cart ({cart.reduce((s, c) => s + c.quantity, 0)})
            </Button>
          </div>
        )}
      </div>

      <Sheet open={showMobileCart} onOpenChange={setShowMobileCart}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0 md:hidden">
          <SheetHeader className="p-4 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Current Order
              {cart.length > 0 && <Badge variant="secondary">{cart.reduce((s, c) => s + c.quantity, 0)}</Badge>}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const isSent = activeTab?.sentCartKeys.includes(item.cartKey);
                  return (
                    <div key={item.cartKey} className={`flex items-center gap-3 p-2 rounded-lg border bg-background ${isSent ? "opacity-75" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{fmt(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="h-7 w-7 rounded border flex items-center justify-center" onClick={() => updateQuantity(item.cartKey, -1)} aria-label={`Decrease quantity of ${item.name}`}><Minus className="h-3 w-3" /></button>
                        <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                        <button className="h-7 w-7 rounded border flex items-center justify-center" onClick={() => updateQuantity(item.cartKey, 1)} aria-label={`Increase quantity of ${item.name}`}><Plus className="h-3 w-3" /></button>
                        <button className="h-7 w-7 rounded border flex items-center justify-center text-destructive ml-1" onClick={() => removeFromCart(item.cartKey)} aria-label={`Remove ${item.name} from cart`}><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {cart.length > 0 && (
            <div className="p-4 border-t space-y-3 shrink-0">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span><span>{fmt(total)}</span>
              </div>
              <Button className="w-full" onClick={() => { setShowMobileCart(false); handlePlaceOrder(); }} disabled={!hasUnsentItems || placeOrderMutation.isPending} data-testid="button-mobile-place-order">
                {isDineIn ? "Send to Kitchen" : `Pay — ${fmt(total)}`}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <div className="hidden md:flex w-[400px] flex-shrink-0 flex-col bg-card overflow-hidden h-full pr-2">
        <div className="border-b">
          <div className="flex items-center gap-0 px-2 pt-2 overflow-x-auto" data-testid="pos-tabs-bar">
            {tabs.map((tab, idx) => (
              <div key={tab.id} className={`flex shrink-0 items-center gap-1 px-2.5 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer border border-b-0 mr-0.5 whitespace-nowrap transition-colors ${tab.id === activeTabId ? "bg-card border-border text-foreground" : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setActiveTabId(tab.id)}
                data-testid={`pos-tab-${idx}`}
              >
                <span>{tabLabel(tab)}</span>
                {tab.cart.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{tab.cart.reduce((s, c) => s + c.quantity, 0)}</Badge>}
                {tabs.length > 1 && (
                  <button className="ml-0.5 hover:text-destructive" onClick={(e) => { e.stopPropagation(); requestCloseTab(tab.id); }} data-testid={`button-close-tab-${idx}`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            ))}
            {tabs.length < MAX_TABS && (
              <button className="px-2 py-1.5 text-muted-foreground hover:text-foreground rounded-t-lg text-xs flex items-center gap-0.5" onClick={addTab} data-testid="button-add-tab" title="New order tab (Ctrl+N)">
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
                          <div className="ml-auto flex items-center gap-1 shrink-0 pl-2">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate("/tickets")} data-testid="button-pos-history" title="Ticket History">
                  <Clock className="h-3 w-3 mr-1" /> History
                </Button>
                <DeliveryQueueButton onClick={() => setShowDeliveryQueue(true)} />
                <Button variant="outline" size="sm" className="text-xs h-7 px-2 relative" onClick={() => setShowRecall(true)} data-testid="button-recall">
                  <RotateCcw className="h-3 w-3 mr-1" /> Recall
                  {heldTabs.length > 0 && (
                    <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px]">{heldTabs.length}</Badge>
                  )}
                </Button>
                {posSessionId ? (
                  <button
                    onClick={() => setShowCloseShift(true)}
                    className="flex items-center gap-1.5 h-7 px-2 rounded-md border text-xs bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary transition-colors"
                    data-testid="button-close-shift"
                  >
                    <Clock className="h-3 w-3" />
                    <span className="font-medium">{posSession?.shiftName ?? "Shift"}</span>
                    {sessionElapsed && <span className="text-primary/70">· {sessionElapsed}</span>}
                  </button>
                ) : (
                  <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => setShowStartShift(true)} data-testid="button-start-shift">
                    <Clock className="h-3 w-3 mr-1" /> Start Shift
                  </Button>
                )}
              </div>
          </div>
        </div>

        {/* ── Sidebar top: header + order-detail partition ── */}
        <div className="p-4 border-b space-y-3">

          {/* Row 2: last-placed notification */}
          {lastPlacedOrder && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-1.5">
              <Receipt className="h-3.5 w-3.5 text-green-600 shrink-0" />
              <span className="text-xs text-green-700 dark:text-green-300 flex-1">Order placed · {fmt(lastPlacedOrder.total)}</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-green-700 hover:text-green-800 hover:bg-green-100 gap-1" onClick={async () => {
                try {
                  await fetch("/api/print/reprint", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ orderId: lastPlacedOrder.orderId, type: "kot", isReprint: true, reason: "Manual reprint from POS" }),
                  });
                  toast({ title: tc("printQueue.queued") });
                } catch (e: any) {
                  toast({ title: tp("reprintFailed"), description: e.message, variant: "destructive" });
                }
              }} data-testid="button-reprint-kot">
                <Printer className="h-3 w-3" /> KOT
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-green-700 hover:text-green-800 hover:bg-green-100 gap-1" onClick={() => {
                if (user?.role === "manager" || user?.role === "owner") {
                  setReprintManagerDialog({ open: true, orderId: lastPlacedOrder.orderId });
                } else {
                  toast({ title: tp("managerApprovalRequired"), description: tp("reprintWillBeLogged"), variant: "destructive" });
                }
              }} data-testid="button-reprint-bill">
                <Printer className="h-3 w-3" /> Bill
              </Button>
              <Button size="sm" className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => { if (lastPlacedOrder?.tableId) { navigate(`/pos/bill/${lastPlacedOrder.orderId}`); } else { setShowBillModal(true); } }} data-testid="button-open-bill">
                Bill
                <kbd className="text-[9px] opacity-75 bg-green-700 px-1 rounded">[B]</kbd>
              </Button>
              <button className="text-green-600 hover:text-green-800 ml-1" onClick={() => setLastPlacedOrder(null)} data-testid="button-dismiss-bill"><X className="h-3 w-3" /></button>
            </div>
          )}

          {/* Row 3: order-detail partition — type + table/customer */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Order Details</p>
            <div className="flex gap-1">
              {allowedTypes.includes("dine_in") && <Button data-testid="button-order-type-dine-in" variant={orderType === "dine_in" ? "default" : "outline"} size="sm" className="flex-1 text-xs" onClick={() => updateActiveTab({ orderType: "dine_in" })}>
                <UtensilsCrossed className="h-3.5 w-3.5 mr-1" /> Dine-in
              </Button>}
              {allowedTypes.includes("takeaway") && <Button data-testid="button-order-type-takeaway" variant={orderType === "takeaway" ? "default" : "outline"} size="sm" className="flex-1 text-xs" onClick={() => updateActiveTab({ orderType: "takeaway" })}>
                <Package className="h-3.5 w-3.5 mr-1" /> Takeaway
              </Button>}
              {allowedTypes.includes("delivery") && <Button data-testid="button-order-type-delivery" variant={orderType === "delivery" ? "default" : "outline"} size="sm" className="flex-1 text-xs" onClick={() => updateActiveTab({ orderType: "delivery" })}>
                <Truck className="h-3.5 w-3.5 mr-1" /> Delivery
              </Button>}
            </div>

            <AnimatePresence initial={false}>
              {isDineIn && (
                <motion.div key="dine-in-controls" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex gap-2 items-center overflow-hidden">
                  <button
                    data-testid="button-select-table"
                    onClick={() => setShowTablePicker(true)}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors text-left ${selectedTable ? "border-primary bg-primary/5 text-primary" : "border-dashed border-muted-foreground/40 hover:border-primary/50 text-muted-foreground hover:text-foreground"}`}
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">
                      {selectedTable
                        ? (() => { const t = tables.find(t => t.id === selectedTable); return t ? `Table ${t.number} — ${t.zone}` : "Table selected"; })()
                        : "Select table…"}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  </button>
                  <div className="flex items-center gap-1 bg-background rounded-md border px-2 py-1.5 shrink-0">
                    <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" onClick={() => updateActiveTab({ covers: Math.max(1, (activeTab?.covers ?? 1) - 1) })} data-testid="button-covers-decrease"><Minus className="h-3 w-3" /></button>
                    <span className="text-xs font-medium w-10 text-center" data-testid="text-covers">{activeTab?.covers ?? 1} pax</span>
                    <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" onClick={() => updateActiveTab({ covers: (activeTab?.covers ?? 1) + 1 })} data-testid="button-covers-increase"><Plus className="h-3 w-3" /></button>
                  </div>
                </motion.div>
              )}
              {!isDineIn && (
                <motion.div key="customer-fields" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="grid grid-cols-2 gap-2 overflow-hidden">
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input data-testid="input-customer-name" placeholder="Customer name" value={activeTab?.customerName ?? ""} onChange={e => updateActiveTab({ customerName: e.target.value })} className="pl-8 text-sm bg-background" />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input data-testid="input-customer-phone" placeholder="Phone" type="tel" value={activeTab?.customerPhone ?? ""} onChange={e => updateActiveTab({ customerPhone: e.target.value })} className="pl-8 text-sm bg-background" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs">Tap items to add them</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {cart.map((item) => {
                  const isSent = activeTab?.sentCartKeys.includes(item.cartKey);
                  return (
                    <motion.div key={item.cartKey} data-testid={`cart-item-${item.menuItemId}`}
                      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40, height: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className={`flex flex-col gap-1.5 p-2 rounded-lg border bg-background ${item.isCombo ? "border-primary/30 bg-primary/5" : ""} ${isSent ? "opacity-75" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.isCombo ? (
                              <Package className="h-3 w-3 text-primary shrink-0" />
                            ) : item.isVeg === true ? (
                              <span className="h-3 w-3 shrink-0 border border-green-600 rounded-sm flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-green-600" /></span>
                            ) : item.isVeg === false ? (
                              <span className="h-3 w-3 shrink-0 border border-red-600 rounded-sm flex items-center justify-center"><span className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-red-600" /></span>
                            ) : null}
                            <span className="font-medium text-sm truncate">{item.name}</span>
                            {item.isAddon && <Badge variant="outline" className="text-[9px] h-4 px-1 border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/30">Add-on</Badge>}
                            {isSent && !item.isAddon && <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground">Sent</Badge>}
                            {!item.isCombo && hasModification(item.foodModification) && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 border-violet-400 text-violet-600 bg-violet-50 dark:bg-violet-950/30" data-testid={`badge-customized-${item.menuItemId}`}>✏️ customized</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">{fmt(item.price)} each</span>
                            {item.isCombo && item.originalPrice && <span className="text-xs text-muted-foreground line-through">{fmt(item.originalPrice)}</span>}
                            {!item.isCombo && item.originalPrice && item.price !== item.basePrice && (
                              <span className="text-xs text-muted-foreground line-through">{fmt(item.originalPrice)}</span>
                            )}
                            {item.pricingRuleReason && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-teal-400 text-teal-700 bg-teal-50 dark:bg-teal-950/30 cursor-help" data-testid={`badge-pricing-rule-${item.cartKey}`}>
                                      🏷️ {item.pricingRuleReason}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <p>Special price applied: {item.pricingRuleReason}</p>
                                    {item.originalPrice && <p className="text-xs opacity-70">Original: {fmt(item.originalPrice)}</p>}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {item.modifiers?.filter(m => m.label && m.label !== "Regular" && m.label !== "Medium").map((m, i) => (
                              <Badge key={i} variant="secondary" className="text-[9px] h-4 px-1">{m.label}</Badge>
                            ))}
                          </div>
                        </div>
                        <span className="font-semibold text-sm ml-2">{fmt((() => { const lt = item.price * item.quantity; const d = item.itemDiscount || 0; return item.itemDiscountType === 'percent' ? lt - lt * d / 100 : lt - d; })())}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button data-testid={`button-decrease-${item.menuItemId}`} variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.cartKey, -1)} aria-label={`Decrease quantity of ${item.name}`}>
                            <Minus className="h-3 w-3" aria-hidden="true" />
                          </Button>
                          <motion.span key={item.quantity} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="w-8 text-center text-sm font-medium" data-testid={`text-qty-${item.menuItemId}`} aria-live="polite" aria-label={`Quantity: ${item.quantity}`}>{item.quantity}</motion.span>
                          <Button data-testid={`button-increase-${item.menuItemId}`} variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.cartKey, 1)} aria-label={`Increase quantity of ${item.name}`}>
                            <Plus className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1">
                          {!item.isCombo && (
                            <>
                              <Button
                                data-testid={`button-customize-${item.menuItemId}`}
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-violet-600 hover:bg-violet-50 flex items-center justify-center rounded"
                                onClick={() => setCustomizeItem(item)}
                                title="Customize this item"
                              >
                                ✏️
                              </Button>
                              <Button data-testid={`button-modifier-${item.menuItemId}`} variant="ghost" size="icon" className="h-9 w-9 text-primary flex items-center justify-center rounded" onClick={() => openModifierDrawer(item)} title="Modifiers & instructions" aria-label={`Modifiers and instructions for ${item.name}`}>
                                <ChevronDown className="h-3 w-3" aria-hidden="true" />
                              </Button>
                            </>
                          )}
                          <Button data-testid={`button-note-${item.menuItemId}`} variant="ghost" size="icon" className="h-9 w-9 flex items-center justify-center rounded" onClick={() => openNoteDialog(item.cartKey)} aria-label={`Add note to ${item.name}`}>
                            <StickyNote className="h-3 w-3" aria-hidden="true" />
                          </Button>
                          <Button data-testid={`button-remove-${item.menuItemId}`} variant="ghost" size="icon" className="h-9 w-9 text-destructive flex items-center justify-center rounded" onClick={() => removeFromCart(item.cartKey)} aria-label={`Remove ${item.name} from cart`}>
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </Button>
                          {isAddonKotMode && activeTab?.sentCartKeys.includes(item.cartKey) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-orange-600 hover:text-orange-700 flex items-center justify-center rounded"
                              onClick={() => {
                                setSelectedVoidItem(item);
                                setShowVoidModal(true);
                              }}
                              data-testid={`button-void-item-${item.menuItemId}`}
                              title="Void sent item"
                              aria-label={`Void ${item.name}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {item.notes && !item.isCombo && <p className="text-xs text-muted-foreground italic pl-1">{tp("noteLabel", { text: item.notes })}</p>}
                      {item.isCombo && item.comboItems && (
                        <div className="text-xs text-muted-foreground pl-1 flex flex-wrap gap-1">
                          {item.comboItems.map((ci, i) => <span key={i} className="bg-muted px-1.5 py-0.5 rounded">{ci.name}</span>)}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="border-t p-4 space-y-3 shrink-0 bg-background">
          {applicableOffers.length > 0 && (
            <div className="space-y-1.5" data-testid="offers-section">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Tag className="h-3 w-3" /> {tp("availableOffers")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {applicableOffers.map((offer) => {
                  const isSelected = activeTab?.selectedOfferId === offer.id;
                  return (
                    <Button key={offer.id} variant={isSelected ? "default" : "outline"} size="sm" className="text-xs h-7"
                      onClick={() => updateActiveTab({ selectedOfferId: isSelected ? null : offer.id })}
                      data-testid={`button-offer-${offer.id}`}>
                      {isSelected && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {(offer.type === "percentage" || offer.type === "happy_hour") ? <Percent className="h-3 w-3 mr-0.5" /> : <Tag className="h-3 w-3 mr-0.5" />}
                      {offer.name}
                      {(offer.type === "percentage" || offer.type === "happy_hour") ? ` (${offer.value}%)` : offer.type === "fixed_amount" ? ` (${fmt(offer.value)})` : ""}
                    </Button>
                  );
                })}
              </div>
              {selectedOffer && offerDiscount > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 rounded-lg px-2.5 py-1.5 text-xs">
                  <span className="text-green-700 dark:text-green-300 font-medium">{selectedOffer.name}: -{fmt(offerDiscount)}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-green-600" onClick={() => updateActiveTab({ selectedOfferId: null })} data-testid="button-remove-offer"><X className="h-3 w-3" /></Button>
                </motion.div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Textarea data-testid="input-order-notes" placeholder={tp("orderNotesPlaceholder")} value={orderNotes} onChange={(e) => updateActiveTab({ orderNotes: e.target.value })} rows={2} className="resize-none text-sm" />
          </div>

          {isDineIn && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2" data-testid="text-dine-in-info">
              <Users className="h-3.5 w-3.5 shrink-0" />
              {tp("dineInPaymentInfo")}
            </div>
          )}

          <Separator />

          <div className="space-y-1 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{tp("totals")}</p>
            <div className="flex justify-between" data-testid="text-subtotal">
              <span className="text-muted-foreground">{tp("subtotal")}</span><span>{fmt(subtotal)}</span>
            </div>
            {offerDiscount > 0 && (
              <div className="flex justify-between text-green-600" data-testid="text-offer-discount">
                <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {selectedOffer?.name}</span>
                <span>-{fmt(offerDiscount)}</span>
              </div>
            )}
            {engineDiscounts.length > 0 && engineDiscounts.map((ed) => (
              <div key={ed.ruleId} className="flex justify-between items-center text-purple-600" data-testid={`text-engine-discount-${ed.ruleId}`}>
                <span className="flex items-center gap-1 text-xs"><Percent className="h-3 w-3" /> {ed.ruleName}</span>
                <span className="flex items-center gap-1">
                  {ed.discountAmount > 0 ? `-${fmt(ed.discountAmount)}` : `+${fmt(Math.abs(ed.discountAmount))}`}
                  <button type="button" className="ml-1 text-purple-400 hover:text-red-500" data-testid={`button-dismiss-rule-${ed.ruleId}`}
                    onClick={() => updateActiveTab({ dismissedRuleIds: [...(activeTab?.dismissedRuleIds ?? []), ed.ruleId] })}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ))}
            {manualDiscount > 0 && (
              <div className="flex justify-between text-green-600" data-testid="text-discount">
                <span>{tp("manualDiscount")}</span><span>-{fmt(manualDiscount)}</span>
              </div>
            )}
            {serviceChargeAmount > 0 && (
              <div className="flex justify-between" data-testid="text-service-charge">
                <span className="text-muted-foreground">{tp("serviceChargeLabel", { pct: (tenantServiceChargePct * 100).toFixed(1) })}</span>
                <span>{fmt(serviceChargeAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between" data-testid="text-tax">
                <span className="text-muted-foreground">{tp("taxLabel", { pct: (taxRate * 100).toFixed(1) })}</span>
                <span>{fmt(taxAmount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base" data-testid="text-total" aria-live="polite" aria-atomic="true">
              <span>{tp("total")}</span><span>{fmt(total)}</span>
            </div>
          </div>

          <SyncErrorPanel className="mt-1" />

          <div className="flex gap-1.5">
            <Button data-testid="button-hold-order" variant="outline" size="sm" className="text-xs px-2.5 gap-1" onClick={holdCurrentTab} disabled={cart.length === 0 && !activeTab?.heldOrderId} title={tp("holdOrder")}>
              <Pause className="h-3.5 w-3.5" /> {tp("hold")}
            </Button>
            {cart.length >= 2 && (
              <Button data-testid="button-split-bill" variant="outline" size="sm" className="text-xs px-2.5 gap-1" onClick={() => { setSplitAssignment({}); setShowSplitDialog(true); }} title={tp("splitBillTitle")}>
                <Scissors className="h-3.5 w-3.5" /> {tp("split")}
              </Button>
            )}
            <Button data-testid="button-place-order" className="flex-1 h-10 font-semibold text-sm transition-all duration-200 hover:scale-[1.01] shadow-sm" onClick={handlePlaceOrder} disabled={!hasUnsentItems || placeOrderMutation.isPending}>
              {placeOrderMutation.isPending ? tp("sending") : isAddonKotMode ? tp("sendAddonKot") : isDineIn ? tp("sendToKitchen") : (isOffline && !isDineIn) ? tp("queueOrderOffline", { total: fmt(total) }) : tp("pay", { total: fmt(total) })}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Table Picker Dialog ───────────────────────────────────────── */}
      <Dialog open={showTablePicker} onOpenChange={setShowTablePicker}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> {tp("selectTableTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {Array.from(new Set(tables.map(t => t.zone))).sort().map(zone => (
              <div key={zone}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{zone}</p>
                <div className="grid grid-cols-4 gap-2">
                  {tables.filter(t => t.zone === zone).sort((a, b) => Number(a.number) - Number(b.number)).map(t => {
                    const isSelected = selectedTable === t.id;
                    const isFree = t.status === "free";
                    const isOccupied = t.status === "occupied";
                    const isReserved = t.status === "reserved";
                    const canSelect = isFree || isSelected;
                    return (
                      <button
                        key={t.id}
                        data-testid={`button-table-${t.id}`}
                        disabled={!canSelect}
                        onClick={() => {
                          const alreadySent = (activeTab?.sentCartKeys?.length ?? 0) > 0;
                          if (alreadySent && t.id !== selectedTable) {
                            // PR-009: Wrong-table confirmation for sent orders
                            setPendingTableId(t.id);
                            setShowTablePicker(false);
                          } else {
                            updateActiveTab({ selectedTable: t.id });
                            setShowTablePicker(false);
                          }
                        }}
                        className={`relative flex flex-col items-center justify-center h-16 rounded-lg border-2 transition-all text-sm font-semibold
                          ${isSelected ? "border-primary bg-primary text-primary-foreground shadow-lg" :
                            isFree ? "border-green-400 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 hover:border-green-500 hover:scale-[1.03] cursor-pointer" :
                            isOccupied ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 cursor-not-allowed opacity-70" :
                            isReserved ? "border-red-300 bg-red-50 dark:bg-red-950/30 text-red-400 cursor-not-allowed opacity-70" :
                            "border-muted-foreground/30 bg-muted/30 text-muted-foreground cursor-not-allowed opacity-60"}`}
                      >
                        <span className="text-base leading-none">{t.number}</span>
                        <span className="text-[10px] mt-1 font-normal opacity-75">{isFree ? `${t.capacity}p` : isOccupied ? tp("occupied") : isReserved ? tp("reserved") : t.status}</span>
                        {isSelected && <CheckCircle2 className="absolute top-1 right-1 h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {tables.length === 0 && (
              <div className="text-center py-10 text-muted-foreground" data-testid="text-no-tables-configured">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">{tp("noTablesFound")}</p>
                <p className="text-xs mt-1 mb-3">{tp("configureFloorPlan")}</p>
                <button
                  className="text-xs underline text-primary"
                  onClick={() => { setShowTablePicker(false); navigate("/tables"); }}
                  data-testid="link-go-to-tables"
                >
                  {tp("goToTables")}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-400 inline-block" />{tp("available")}</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400 inline-block" />{tp("occupied")}</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-300 inline-block" />{tp("reserved")}</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Payment Modal ─────────────────────────────────────────────── */}
      <Dialog open={showPaymentModal} onOpenChange={(o) => { if (!o) setShowPaymentModal(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> {tp("collectPayment")}
            </DialogTitle>
            <DialogDescription>{tp("selectPaymentMethodDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{tp("totalDue")}</span>
              <span className="text-2xl font-bold text-primary" data-testid="text-payment-total">{fmt(total)}</span>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{tp("paymentMethod")}</p>
              <div className="grid grid-cols-3 gap-2">
                {([["cash", Banknote, "Cash"], ["card", CreditCard, "Card"], ["upi", Wallet, "UPI"]] as const).map(([method, Icon, label]) => (
                  <button key={method} data-testid={`button-pay-${method}`}
                    onClick={() => setPaymentMethod(method)}
                    aria-pressed={paymentMethod === method}
                    className={`flex flex-col items-center gap-1 py-3 rounded-lg border-2 text-sm font-medium transition-all ${paymentMethod === method ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {paymentMethod === "cash" && (
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{tp("cashTendered")}</p>
                  <Input data-testid="input-tendered-amount" type="number" placeholder={`Enter amount ≥ ${fmt(total)}`} value={tenderedAmount} onChange={e => setTenderedAmount(e.target.value)} className="text-lg font-semibold" autoFocus />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[20, 50, 100, 200].map(amt => (
                    <button key={amt} data-testid={`button-tender-${amt}`}
                      onClick={() => setTenderedAmount(String(Math.ceil(total / amt) * amt))}
                      className="text-xs px-2.5 py-1.5 rounded border hover:bg-muted transition-colors">
                      {tenantCurrency} {amt}
                    </button>
                  ))}
                  <button data-testid="button-tender-exact" onClick={() => setTenderedAmount(parseFloat(total.toFixed(2)).toFixed(2))}
                    className="text-xs px-2.5 py-1.5 rounded border hover:bg-muted transition-colors text-primary font-medium">
                    {tp("exact")}
                  </button>
                </div>
                {tenderedAmount && parseFloat(Number(tenderedAmount).toFixed(2)) >= parseFloat(total.toFixed(2)) && (
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/30 px-3 py-2 flex items-center justify-between text-sm" data-testid="text-change-due">
                    <span className="text-muted-foreground">{tp("changeDue")}</span>
                    <span className="font-bold text-green-700 dark:text-green-400">{fmt(parseFloat((Number(tenderedAmount) - total).toFixed(2)))}</span>
                  </div>
                )}
                {tenderedAmount && parseFloat(Number(tenderedAmount).toFixed(2)) < parseFloat(total.toFixed(2)) && (
                  <p className="text-xs text-red-500 text-center">{tp("amountLessThanTotal")}</p>
                )}
              </div>
            )}
            {paymentMethod === "card" && (
              <div className="space-y-2">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 text-center">
                  {tp("processCardTerminal")}
                </div>
                <Button variant="outline" className="w-full text-xs" data-testid="button-send-payment-link-modal"
                  onClick={() => { setShowPaymentModal(false); sendPaymentLinkMutation.mutate(); }} disabled={cart.length === 0 || sendPaymentLinkMutation.isPending}>
                  <QrCode className="h-3.5 w-3.5 mr-1.5" /> {tp("sendStripePaymentLink")}
                </Button>
              </div>
            )}
            {paymentMethod === "upi" && (
              <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 px-3 py-2 text-xs text-purple-700 dark:text-purple-300 text-center">
                {tp("showUpiQr")}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPaymentModal(false)} data-testid="button-payment-cancel">{tc("cancel")}</Button>
            <Button onClick={confirmPaymentAndPlace} data-testid="button-confirm-payment"
              disabled={paymentMethod === "cash" && (tenderedAmount === "" || parseFloat(Number(tenderedAmount).toFixed(2)) < parseFloat(total.toFixed(2)))}>
              {tp("confirmPlaceOrder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentLinkModal?.open} onOpenChange={(o) => !o && setPaymentLinkModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-teal-600" /> {tp("paymentLinkReady")}</DialogTitle></DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">{tp("shareQrOrLink")}</p>
            {paymentLinkModal?.qrDataUrl && (
              <div className="flex justify-center">
                <img src={paymentLinkModal.qrDataUrl} alt="Payment QR code" className="w-48 h-48 rounded-lg border" data-testid="img-payment-qr" />
              </div>
            )}
            <div className="bg-muted rounded-lg p-3 break-all text-xs text-left font-mono" data-testid="text-payment-link-url">{paymentLinkModal?.url}</div>
            <div className="flex gap-2">
              <Button className="flex-1" variant={paymentLinkModal?.copied ? "secondary" : "default"}
                onClick={() => {
                  if (paymentLinkModal?.url) {
                    navigator.clipboard.writeText(paymentLinkModal.url);
                    setPaymentLinkModal(prev => prev ? { ...prev, copied: true } : null);
                    setTimeout(() => setPaymentLinkModal(prev => prev ? { ...prev, copied: false } : null), 2000);
                  }
                }} data-testid="button-copy-payment-link">
                <Link className="h-4 w-4 mr-1.5" />
                {paymentLinkModal?.copied ? "Copied!" : "Copy Link"}
              </Button>
              {paymentLinkModal?.url && (
                <Button variant="outline" asChild>
                  <a href={paymentLinkModal.url} target="_blank" rel="noopener noreferrer" data-testid="button-open-payment-link">Open</a>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={noteDialogItem !== null} onOpenChange={() => setNoteDialogItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tp("itemNotes")}</DialogTitle></DialogHeader>
          <Textarea data-testid="input-item-note" placeholder={tp("addSpecialInstructions")} value={itemNoteText} onChange={(e) => setItemNoteText(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNoteDialogItem(null)} data-testid="button-cancel-note">{tc("cancel")}</Button>
            <Button onClick={saveItemNote} data-testid="button-save-note">{tp("saveNote")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modifierItem} onOpenChange={(o) => !o && setModifierItem(null)}>
        <DialogContent className="max-w-sm" data-testid="dialog-modifier-drawer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              {tp("modifiersFor", { name: modifierItem?.name })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">{sizeGroup?.name ?? tp("sizeLabel")}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(sizeGroup?.options ?? SIZE_MODIFIERS).map(s => (
                  <button key={s.label}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${modifierSize === s.label ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                    onClick={() => setModifierSize(s.label)}
                    data-testid={`modifier-size-${s.label.toLowerCase()}`}
                  >
                    {getModifierLabel(s.label)}
                    {s.priceAdjust !== 0 && <span className="block text-[9px] opacity-70">{s.priceAdjust > 0 ? `+${(s.priceAdjust * 100).toFixed(0)}%` : `${(s.priceAdjust * 100).toFixed(0)}%`}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">{spiceGroup?.name ?? tp("spiceLevelLabel")}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(spiceGroup?.options ?? SPICE_MODIFIERS).map(s => (
                  <button key={s.label}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${modifierSpice === s.label ? "bg-orange-500 text-white border-orange-500" : "border-border hover:border-orange-400"}`}
                    onClick={() => setModifierSpice(s.label)}
                    data-testid={`modifier-spice-${s.label.toLowerCase().replace(" ", "-")}`}
                  >
                    {getModifierLabel(s.label)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{tp("extrasAddons")}</Label>
              <Input placeholder={tp("extrasPlaceholder")} value={modifierExtras} onChange={e => setModifierExtras(e.target.value)} className="text-sm" data-testid="input-modifier-extras" />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{tp("specialInstructions")}</Label>
              <Textarea placeholder={tp("specialInstructionsPlaceholder")} value={modifierNote} onChange={e => setModifierNote(e.target.value)} rows={2} className="resize-none text-sm" data-testid="input-modifier-note" />
            </div>
            {modifierItem && (
              <div className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
                <span className="text-muted-foreground">{tp("adjustedPrice")}</span>
                <span className="font-semibold">{fmt(Math.max(0, modifierItem.basePrice * (1 + ((sizeGroup?.options ?? SIZE_MODIFIERS).find(s => s.label === modifierSize)?.priceAdjust ?? 0))))}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setModifierItem(null)} data-testid="button-cancel-modifier">{tc("cancel")}</Button>
              <Button className="flex-1" onClick={saveModifiers} data-testid="button-save-modifier">{tp("apply")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecall} onOpenChange={setShowRecall}>
        <DialogContent className="max-w-sm" data-testid="dialog-recall">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" /> {tp("heldOrders")}</DialogTitle></DialogHeader>
          {heldOrdersFromCache && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1" data-testid="text-held-orders-stale">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>⚠️ Order list may be outdated — reconnect to refresh</span>
            </div>
          )}
          {heldOrdersLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : heldTabs.length === 0 && orphanedServerOrders.length === 0 && offlineQueuedOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No held orders</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {offlineQueuedOrders.map((order) => (
                <div key={order.localId} className="flex items-center gap-2 p-3 border border-amber-300 bg-amber-50 rounded-lg" data-testid={`held-order-offline-${order.localId}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      {order.serverId || order.localTicket}
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">Queued</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{String(order.payload.orderType || "order")} · {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
              {heldTabs.map((held, i) => (
                <div key={i} className="flex items-center gap-2 p-3 border rounded-lg" data-testid={`held-order-${i}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{held.label}</p>
                    <p className="text-xs text-muted-foreground">{held.tab.cart.length} items · {formatLocalTime(held.heldAt, outletTimezone)}</p>
                  </div>
                  <Button size="sm" className="text-xs h-7" onClick={() => recallHeldTab(held)} data-testid={`button-recall-${i}`}>{tp("recall")}</Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteHeldTab(held)} data-testid={`button-delete-held-${i}`}><X className="h-3 w-3" /></Button>
                </div>
              ))}
              {orphanedServerOrders.map((order, i) => (
                <div key={order.id} className="flex items-center gap-2 p-3 border border-dashed rounded-lg" data-testid={`held-order-server-${i}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{order.tableId ? `Table #${order.tableNumber ?? "?"}` : order.orderType}</p>
                    <p className="text-xs text-muted-foreground">{(order.items || []).length} items · {tp("fromServer")}</p>
                  </div>
                  <Button size="sm" className="text-xs h-7" onClick={() => recallServerOrder(order)} data-testid={`button-recall-server-${i}`}>{tp("recall")}</Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSplitDialog} onOpenChange={(o) => { setShowSplitDialog(o); if (!o) { setSplitAssignment({}); setSplitGroupCount(2); } }}>
        <DialogContent className="max-w-sm" data-testid="dialog-split-bill">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Scissors className="h-4 w-4 text-primary" /> {tp("splitBillDialogTitle")}</DialogTitle></DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs text-muted-foreground flex-1">{tp("assignItemsToGroups")}</p>
            <button className="px-2 py-0.5 rounded text-xs border border-border hover:bg-muted disabled:opacity-40" disabled={splitGroupCount <= 2} onClick={() => { setSplitGroupCount(n => n - 1); setSplitAssignment(prev => { const updated = { ...prev }; Object.keys(updated).forEach(k => { if (updated[k] >= splitGroupCount) updated[k] = splitGroupCount - 1; }); return updated; }); }} data-testid="button-split-remove-group">−</button>
            <span className="text-xs font-medium w-16 text-center">{tp("nGroups", { n: splitGroupCount })}</span>
            <button className="px-2 py-0.5 rounded text-xs border border-border hover:bg-muted disabled:opacity-40" disabled={splitGroupCount >= cart.length} onClick={() => setSplitGroupCount(n => n + 1)} data-testid="button-split-add-group">+</button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {cart.map((item) => {
              const group = splitAssignment[item.cartKey] ?? 1;
              return (
                <div key={item.cartKey} className="flex items-center gap-2 p-2 border rounded-lg" data-testid={`split-item-${item.menuItemId}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">×{item.quantity} · {fmt(item.price * item.quantity)}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {Array.from({ length: splitGroupCount }, (_, i) => i + 1).map(g => (
                      <button
                        key={g}
                        className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${group === g ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                        onClick={() => setSplitAssignment(prev => ({ ...prev, [item.cartKey]: g }))}
                        data-testid={`split-group${g}-${item.menuItemId}`}
                      >G{g}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={`text-xs text-muted-foreground mt-1 grid gap-1`} style={{ gridTemplateColumns: `repeat(${Math.min(splitGroupCount, 3)}, 1fr)` }}>
            {Array.from({ length: splitGroupCount }, (_, i) => i + 1).map(g => (
              <div key={g} className="bg-muted/50 rounded p-2">G{g}: {cart.filter(c => (splitAssignment[c.cartKey] ?? 1) === g).length} items</div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowSplitDialog(false)} data-testid="button-cancel-split">{tc("cancel")}</Button>
            <Button className="flex-1" onClick={handleSplitConfirm} disabled={splitOrderMutation.isPending} data-testid="button-confirm-split">
              {splitOrderMutation.isPending ? tp("splittingEllipsis") : tp("placeSplitOrders")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {supervisorDialog && (
        <SupervisorApprovalDialog
          open={supervisorDialog.open}
          onOpenChange={(open) => !open && setSupervisorDialog(null)}
          action={supervisorDialog.action}
          actionLabel={supervisorDialog.actionLabel}
          onApproved={handlePosSupervisorApproved}
        />
      )}

      <Dialog open={!!reprintManagerDialog?.open} onOpenChange={(o) => !o && setReprintManagerDialog(null)}>
        <DialogContent className="max-w-sm" data-testid="dialog-reprint-manager-approval">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" /> {tp("managerApprovalRequired")}
            </DialogTitle>
            <DialogDescription>
              {tp("reprintWillBeLogged")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            {tp("reprintBillRequest")}{" "}
            <span className="font-mono font-semibold">#{reprintManagerDialog?.orderId?.slice(-6).toUpperCase()}</span>
            {" "}{tp("willBeRecordedAuditLog")}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReprintManagerDialog(null)} data-testid="button-cancel-reprint-approval">{tc("cancel")}</Button>
            <Button
              onClick={async () => {
                if (!reprintManagerDialog?.orderId) return;
                setReprintManagerLoading(true);
                try {
                  await fetch("/api/print/reprint", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ orderId: reprintManagerDialog.orderId, type: "bill", isReprint: true, reason: "Manager-approved reprint from POS" }),
                  });
                  toast({ title: tp("reprintBillQueued"), description: tp("billSentToPrinterLogged") });
                  setReprintManagerDialog(null);
                } catch (e: any) {
                  toast({ title: tp("reprintFailed"), description: e.message, variant: "destructive" });
                } finally {
                  setReprintManagerLoading(false);
                }
              }}
              disabled={reprintManagerLoading}
              data-testid="button-confirm-reprint-approval"
            >
              {reprintManagerLoading ? tp("processing") : tp("confirmReprint")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lastPlacedOrder && (
        <BillPreviewModal
          open={showBillModal}
          onClose={() => setShowBillModal(false)}
          cart={lastPlacedOrder.cart}
          subtotal={lastPlacedOrder.subtotal}
          discountAmount={lastPlacedOrder.discountAmount}
          serviceChargeAmount={lastPlacedOrder.serviceChargeAmount}
          taxAmount={lastPlacedOrder.taxAmount}
          total={lastPlacedOrder.total}
          orderType={orderType}
          tableId={lastPlacedOrder.tableId}
          tableNumber={lastPlacedOrder.tableNumber}
          orderId={lastPlacedOrder.orderId}
          posSessionId={posSessionId || undefined}
          onPaymentComplete={() => {
            setLastPlacedOrder(null);
            setShowBillModal(false);
          }}
        />
      )}

      <StartShiftModal open={showStartShift} onSessionStarted={(sessionId) => {
        setPosSessionId(sessionId);
        setShowStartShift(false);
        queryClient.invalidateQueries({ queryKey: ["/api/pos/session"] });
      }} />
      {posSessionId && (
        <CloseShiftDialog open={showCloseShift} onClose={() => setShowCloseShift(false)} sessionId={posSessionId}
          onClosed={() => { setPosSessionId(null); setPosSession(null); setShowCloseShift(false); queryClient.invalidateQueries({ queryKey: ["/api/pos/session"] }); }} />
      )}

      <Dialog open={!!closeTabConfirm} onOpenChange={() => setCloseTabConfirm(null)}>
        <DialogContent className="max-w-xs" data-testid="dialog-close-tab-confirm">
          <DialogHeader><DialogTitle>{tp("closeTabTitle")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{tp("closeTabWarning")}</p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setCloseTabConfirm(null)} data-testid="button-cancel-close-tab">{tc("cancel")}</Button>
            <Button variant="destructive" onClick={() => { if (closeTabConfirm) { closeTab(closeTabConfirm); setCloseTabConfirm(null); } }} data-testid="button-confirm-close-tab">{tp("closeTab")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PR-009: Wrong-table confirmation dialog */}
      <Dialog open={!!pendingTableId} onOpenChange={() => setPendingTableId(null)}>
        <DialogContent className="max-w-xs" data-testid="dialog-wrong-table-confirm">
          <DialogHeader>
            <DialogTitle>Change table?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Items have already been sent to the kitchen for this order. Moving to{" "}
            <strong>Table {tables.find(t => t.id === pendingTableId)?.number}</strong>{" "}
            will change where the order is assigned. Kitchen staff will not be automatically notified.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setPendingTableId(null)} data-testid="button-cancel-wrong-table">{tc("cancel")}</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-wrong-table"
              onClick={() => {
                if (pendingTableId) {
                  updateActiveTab({ selectedTable: pendingTableId });
                  // PR-009: If this tab has a server order, PATCH it to update tableId
                  // so the TABLE_CHANGED audit event is logged server-side.
                  if (activeTab?.heldOrderId && activeTab.heldOrderVersion != null) {
                    const orderId = activeTab.heldOrderId;
                    const version = activeTab.heldOrderVersion;
                    apiRequest("PATCH", `/api/orders/${orderId}`, {
                      tableId: pendingTableId,
                      version,
                    }).then(async (res) => {
                      try {
                        const updated = await res.json();
                        if (updated?.version != null) {
                          updateActiveTab({ heldOrderVersion: updated.version });
                        }
                      } catch {}
                    }).catch(() => {
                      toast({ title: "Table update failed", description: "Could not update the order's table on the server. Please try again.", variant: "destructive" });
                    });
                  }
                  setPendingTableId(null);
                }
              }}
            >
              Move Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeliveryQueuePanel open={showDeliveryQueue} onClose={() => setShowDeliveryQueue(false)} />

      {/* ── Offline Payment Dialog ─────────────────────────────────────── */}
      <Dialog open={showOfflinePaymentDialog} onOpenChange={setShowOfflinePaymentDialog}>
        <DialogContent className="max-w-sm" data-testid="dialog-offline-payment">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-amber-500" /> Payment Unavailable Offline
            </DialogTitle>
            <DialogDescription>
              Payment requires an internet connection. You can still create the order — payment will be collected when connection is restored.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            The order will be queued and synced automatically when you reconnect. Note that payment is marked as pending.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowOfflinePaymentDialog(false)} data-testid="button-offline-payment-cancel">{tc("cancel")}</Button>
            <Button
              onClick={() => {
                setShowOfflinePaymentDialog(false);
                offlinePaymentPendingRef.current = true;
                placeOrderMutation.mutate(undefined);
              }}
              data-testid="button-offline-payment-queue"
            >
              Queue Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {customizeItem && (
        <ModificationDrawer
          open={!!customizeItem}
          onClose={() => setCustomizeItem(null)}
          itemName={customizeItem.name}
          initialModification={customizeItem.foodModification}
          onSave={(modification) => {
            saveCartItemModification(customizeItem.cartKey, modification);
            setCustomizeItem(null);
          }}
        />
      )}
      <AlertDialog open={posVersionConflict} onOpenChange={() => {}}>
        <AlertDialogContent data-testid="dialog-pos-version-conflict">
          <AlertDialogHeader>
            <AlertDialogTitle>Order Updated by Someone Else</AlertDialogTitle>
            <AlertDialogDescription>
              This order was modified by another user since you last loaded it.
              You must refresh to see the latest version before making changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              data-testid="button-pos-refresh-order"
              onClick={() => {
                setPosVersionConflict(false);
                queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
                queryClient.invalidateQueries({ queryKey: ["/api/orders/on-hold"] });
              }}
            >
              Refresh Orders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* POS-09: Void item modal for sent kitchen items */}
      {showVoidModal && selectedVoidItem && (
        <VoidRequestModal
          open={showVoidModal}
          onOpenChange={setShowVoidModal}
          orderItem={selectedVoidItem}
          onSuccess={() => {
            setShowVoidModal(false);
            setSelectedVoidItem(null);
          }}
        />
      )}
    </div></></PageErrorBoundary>
  );
}
