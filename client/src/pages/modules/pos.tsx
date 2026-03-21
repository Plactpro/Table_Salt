import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import SupervisorApprovalDialog from "@/components/supervisor-approval-dialog";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { syncManager } from "@/lib/sync-manager";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useRealtimeEvent } from "@/hooks/use-realtime";
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, UtensilsCrossed, Package, Truck,
  StickyNote, CreditCard, Banknote, Wallet, Coffee, Beef, IceCream,
  Wine, Soup, Pizza, Salad, Sandwich, CheckCircle2, Tag, X, Percent, Link, QrCode,
  Receipt, Clock, Pause, RotateCcw, Scissors, Flame, ChevronDown,
} from "lucide-react";
import type { MenuCategory, MenuItem, Table, Offer, ComboOffer } from "@shared/schema";
import BillPreviewModal from "@/components/pos/BillPreviewModal";
import { StartShiftModal, CloseShiftDialog } from "@/components/pos/PosSessionModal";

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
  const now = new Date();
  const hour = now.getHours();
  return hour >= 16 && hour < 19;
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

export default function POSPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [supervisorDialog, setSupervisorDialog] = useState<{
    open: boolean; action: string; actionLabel: string;
  } | null>(null);
  const [paymentLinkModal, setPaymentLinkModal] = useState<{
    open: boolean; url: string; qrDataUrl: string; copied: boolean; orderId?: string;
  } | null>(null);
  const [posSessionId, setPosSessionId] = useState<string | null>(null);
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
      return updated;
    });
  }, []);

  const updateActiveTab = useCallback((patch: Partial<OrderTab>) => {
    if (!activeTabId) return;
    updateTab(activeTabId, patch);
  }, [activeTabId, updateTab]);

  const setCart = useCallback((fn: (prev: CartItem[]) => CartItem[]) => {
    setTabs(prev => {
      const updated = prev.map(t => t.id === activeTabId ? { ...t, cart: fn(t.cart) } : t);
      saveTabsToStorage(updated);
      return updated;
    });
  }, [activeTabId]);

  const addTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      toast({ title: "Maximum tabs reached", description: `You can have up to ${MAX_TABS} order tabs open.`, variant: "destructive" });
      return;
    }
    const tab = newTab();
    setTabs(prev => {
      const updated = [...prev, tab];
      saveTabsToStorage(updated);
      return updated;
    });
    setActiveTabId(tab.id);
  }, [tabs.length, toast]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length === 1) {
        const fresh = [newTab()];
        saveTabsToStorage(fresh);
        setActiveTabId(fresh[0].id);
        return fresh;
      }
      const idx = prev.findIndex(t => t.id === id);
      const updated = prev.filter(t => t.id !== id);
      saveTabsToStorage(updated);
      if (activeTabId === id) {
        const newIdx = Math.max(0, idx - 1);
        setActiveTabId(updated[newIdx]?.id ?? updated[0].id);
      }
      return updated;
    });
  }, [activeTabId]);

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

  const { data: serverHeldOrders = [] } = useQuery<ServerHeldOrder[]>({
    queryKey: ["/api/orders/on-hold"],
    enabled: showRecall,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const orphanedServerOrders = useMemo<ServerHeldOrder[]>(() =>
    serverHeldOrders.filter(o => !heldTabs.some(h => h.tab.heldOrderId === o.id)),
    [serverHeldOrders, heldTabs]
  );
  const [modifierItem, setModifierItem] = useState<CartItem | null>(null);
  const [modifierSize, setModifierSize] = useState("Regular");
  const [modifierSpice, setModifierSpice] = useState("Medium");
  const [modifierExtras, setModifierExtras] = useState("");
  const [modifierNote, setModifierNote] = useState("");

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
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitAssignment, setSplitAssignment] = useState<Record<string, number>>({});
  const [splitGroupCount, setSplitGroupCount] = useState(2);
  const [noteDialogItem, setNoteDialogItem] = useState<string | null>(null);
  const [itemNoteText, setItemNoteText] = useState("");
  const [closeTabConfirm, setCloseTabConfirm] = useState<string | null>(null);

  useEffect(() => { syncManager.init(); }, []);

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

  const { data: categories = [] } = useCachedQuery<MenuCategory[]>(["/api/menu-categories"], "/api/menu-categories");
  const { data: menuItems = [] } = useCachedQuery<MenuItem[]>(["/api/menu-items"], "/api/menu-items");
  const { data: tables = [] } = useQuery<Table[]>({ queryKey: ["/api/tables"] });
  const { data: offers = [] } = useCachedQuery<Offer[]>(["/api/offers"], "/api/offers");
  const { data: comboOffers = [] } = useQuery<ComboOffer[]>({ queryKey: ["/api/combo-offers"] });

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

  const userOutletId = user && "outletId" in user ? (user as { outletId?: string }).outletId || null : null;
  const activeCombos = useMemo(() => comboOffers.filter((c) => isComboActive(c, userOutletId)), [comboOffers, userOutletId]);
  const freeTables = useMemo(() => tables.filter((t) => t.status === "free"), [tables]);

  const filteredItems = useMemo(() => {
    let items = menuItems.filter((item) => item.available !== false);
    if (selectedCategory) items = items.filter((item) => item.categoryId === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q));
    }
    return items;
  }, [menuItems, selectedCategory, searchQuery]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

  const selectedOffer = useMemo(() => {
    if (!activeTab?.selectedOfferId) return null;
    return offers.find(o => o.id === activeTab.selectedOfferId) || null;
  }, [activeTab?.selectedOfferId, offers]);

  const dismissedRuleIds = useMemo(() => new Set(activeTab?.dismissedRuleIds ?? []), [activeTab?.dismissedRuleIds]);

  const evaluatePayload = useMemo(() => {
    if (cart.length === 0) return null;
    return {
      items: cart.map((c) => ({ menuItemId: c.menuItemId, name: c.name, price: c.price, quantity: c.quantity, categoryId: c.categoryId || undefined })),
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

  const addToCart = useCallback((item: MenuItem) => {
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 600);
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id && !c.isCombo && !c.modifiers?.length);
      if (existing) {
        return prev.map((c) => c.cartKey === existing.cartKey ? { ...c, quantity: c.quantity + 1 } : c);
      }
      const cartKey = makeid();
      return [...prev, {
        menuItemId: item.id, name: item.name,
        price: parseFloat(item.price), basePrice: parseFloat(item.price),
        quantity: 1, notes: "", isVeg: item.isVeg, categoryId: item.categoryId,
        cartKey, hsnCode: item.hsnCode || null,
      }];
    });
  }, [setCart]);

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
        await apiRequest("PATCH", `/api/orders/${activeTab!.heldOrderId}`, { status: "on_hold" });
        return activeTab!.heldOrderId!;
      }
      if (cart.length === 0) return null;
      const orderData = buildOrderData();
      orderData.status = "on_hold";
      const res = await apiRequest("POST", "/api/orders", orderData);
      const order = await res.json();
      return order.id as string;
    },
    onSuccess: (orderId) => {
      const tabLabel = isDineIn && selectedTable
        ? `Table ${tables.find(t => t.id === selectedTable)?.number || ""}`
        : orderType === "takeaway" ? "Takeaway" : "Delivery";
      const heldTab: OrderTab = { ...activeTab!, heldOrderId: orderId ?? activeTab!.heldOrderId };
      const held: HeldTab = { tab: heldTab, heldAt: new Date().toISOString(), label: tabLabel };
      const updated = [...heldTabs, held];
      setHeldTabs(updated);
      saveHeldTabsToStorage(updated);
      closeTab(activeTabId);
      queryClient.invalidateQueries({ queryKey: ["/api/orders/on-hold"] });
      toast({ title: "Order held", description: `${tabLabel} saved. Use Recall to restore it.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to hold order", description: err.message, variant: "destructive" });
    },
  });

  const holdCurrentTab = useCallback(() => {
    const hasPlacedOrder = !!activeTab?.heldOrderId;
    if (cart.length === 0 && !hasPlacedOrder) {
      toast({ title: "Cart is empty", description: "Nothing to hold.", variant: "destructive" });
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
      apiRequest("PATCH", `/api/orders/${held.tab.heldOrderId}`, { status: "in_progress" }).catch(() => {});
    }
    setShowRecall(false);
    toast({ title: "Order recalled", description: `${held.label} restored to cart.` });
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
    };
    setTabs(prev => { const u = [...prev, tab]; saveTabsToStorage(u); return u; });
    setActiveTabId(tab.id);
    apiRequest("PATCH", `/api/orders/${order.id}`, { status: "in_progress" }).catch(() => {});
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
        orderItems.push({
          menuItemId: c.menuItemId, name: c.name,
          quantity: c.quantity, price: c.price.toFixed(2),
          notes: c.notes || null,
          modifiers: modifiersData,
          isAddon: isAddonKot,
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
      orderType: tab.orderType,
      tableId: tabIsDineIn ? tab.selectedTable || null : null,
      subtotal: tabSubtotal.toFixed(2),
      tax: tabTax.toFixed(2),
      discount: (isAddonKot ? 0 : tabManualDiscount).toFixed(2),
      total: tabTotal.toFixed(2),
      notes: tab.orderNotes || null,
      status: tabIsDineIn ? "in_progress" : "new",
      items: orderItems,
      offerId: (!isAddonKot && tab.selectedOfferId) ? tab.selectedOfferId : null,
      manualDiscountAmount: (!isAddonKot && tabManualDiscount > 0) ? tabManualDiscount.toFixed(2) : null,
    };
    if (tab.heldOrderId) orderData.parentOrderId = tab.heldOrderId;
    if (!tabIsDineIn) orderData.paymentMethod = paymentMethod;
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
        if (queued) return { id: orderId, queued: true };
        return { id: orderId };
      } catch (syncErr: any) {
        if (syncErr.status === 403 && syncErr.data?.requiresSupervisor) {
          throw new Error("__SUPERVISOR_REQUIRED__:" + (syncErr.data.action || "apply_large_discount"));
        }
        throw syncErr;
      }
    },
    onSuccess: (data: any) => {
      if (data?.queued) {
        toast({ title: "Order queued", description: "Will sync when connection is restored" });
      } else {
        const isAddonKot = (activeTab?.sentCartKeys.length ?? 0) > 0 && isDineIn;
        toast({ title: isAddonKot ? "Add-on KOT sent!" : isDineIn ? "Order sent to kitchen!" : "Order placed!" });
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
          discount: "",
          orderNotes: "",
          selectedOfferId: null,
          dismissedRuleIds: [],
        });
      } else {
        setShowBillModal(true);
        updateActiveTab({ cart: [], discount: "", orderNotes: "", selectedOfferId: null, dismissedRuleIds: [], sentCartKeys: [], selectedTable: "", heldOrderId: undefined });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/combo-offers"] });
    },
    onError: (err: Error) => {
      if (err.message.startsWith("__SUPERVISOR_REQUIRED__:")) {
        const action = err.message.split(":")[1];
        setSupervisorDialog({ open: true, action: action || "apply_large_discount", actionLabel: "Apply Large Discount" });
        return;
      }
      toast({ title: "Failed to place order", description: err.message, variant: "destructive" });
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
      toast({ title: "No new items to send", description: "Add items to the cart before sending another KOT", variant: "destructive" });
      return;
    }
    if (isDineIn && !selectedTable) {
      toast({ title: "Select a table", description: "Choose a table for dine-in orders", variant: "destructive" });
      return;
    }
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
      toast({ title: "Payment link failed", description: err.message, variant: "destructive" });
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
      toast({ title: "Orders split!", description: `${orders.length} separate orders created.` });
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
      toast({ title: "Split failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSplitConfirm = () => {
    const groups: CartItem[][] = Array.from({ length: splitGroupCount }, (_, i) =>
      cart.filter(c => (splitAssignment[c.cartKey] ?? 1) === i + 1)
    );
    const hasEmptyGroup = groups.some(g => g.length === 0);
    if (hasEmptyGroup) {
      toast({ title: "Invalid split", description: "Every group must have at least one item.", variant: "destructive" });
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
        if (modifierItem) { setModifierItem(null); e.preventDefault(); return; }
        if (noteDialogItem) { setNoteDialogItem(null); e.preventDefault(); return; }
        if (showSplitDialog) { setShowSplitDialog(false); e.preventDefault(); return; }
        if (showRecall) { setShowRecall(false); e.preventDefault(); return; }
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addTab, modifierItem, noteDialogItem, showSplitDialog, showRecall, lastPlacedOrder, activeTab, navigate, handlePlaceOrder]);

  return (
    <div className="flex h-full gap-0" data-testid="pos-page">
      <div className="flex-1 flex flex-col overflow-hidden border-r">
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="input-search-menu" placeholder="Search menu items..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button data-testid="button-category-all" variant={selectedCategory === null && !showCombos ? "default" : "outline"} size="sm" onClick={() => { setSelectedCategory(null); setShowCombos(false); }}>
              <UtensilsCrossed className="h-3.5 w-3.5 mr-1" /> All
            </Button>
            {activeCombos.length > 0 && (
              <Button data-testid="button-category-combos" variant={showCombos ? "default" : "outline"} size="sm" onClick={() => { setShowCombos(true); setSelectedCategory(null); }} className="whitespace-nowrap">
                <Package className="h-3.5 w-3.5 mr-1" /> Combos
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
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {showCombos ? (
            activeCombos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Package className="h-12 w-12 mb-2" /><p>No active combos</p>
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
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <UtensilsCrossed className="h-12 w-12 mb-2" /><p>No items found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredItems.map((item, index) => {
                const inCart = cart.find((c) => c.menuItemId === item.id && !c.isCombo);
                const justAdded = addedItemId === item.id;
                return (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03, duration: 0.3 }}>
                    <Card data-testid={`card-menu-item-${item.id}`} className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.03] relative overflow-hidden" onClick={() => addToCart(item)}>
                      <AnimatePresence>
                        {justAdded && (
                          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center bg-primary/20 backdrop-blur-sm rounded-lg">
                            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.4 }}>
                              <CheckCircle2 className="h-8 w-8 text-primary" />
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {item.image ? (
                        <div className="h-20 overflow-hidden bg-muted">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      ) : (
                        <div className="h-20 bg-muted/50 flex items-center justify-center" data-testid={`placeholder-${item.id}`}>
                          <UtensilsCrossed className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="font-medium text-sm leading-tight line-clamp-2">{item.name}</h4>
                          {item.isVeg === true ? (
                            <span className="h-4 w-4 shrink-0 ml-1 border-2 border-green-600 rounded-sm flex items-center justify-center" data-testid={`icon-veg-${item.id}`}>
                              <span className="w-2 h-2 rounded-full bg-green-600" />
                            </span>
                          ) : item.isVeg === false ? (
                            <span className="h-4 w-4 shrink-0 ml-1 border-2 border-red-600 rounded-sm flex items-center justify-center" data-testid={`icon-nonveg-${item.id}`}>
                              <span className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-red-600" />
                            </span>
                          ) : null}
                        </div>
                        {item.tags && (item.tags as string[]).length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {(item.tags as string[]).slice(0, 2).map((tag, i) => <span key={i} className="text-[9px] px-1.5 py-0 rounded bg-muted text-muted-foreground">{tag}</span>)}
                            {(item.tags as string[]).length > 2 && <span className="text-[9px] px-1 py-0 rounded bg-muted text-muted-foreground">+{(item.tags as string[]).length - 2}</span>}
                          </div>
                        )}
                        {item.description && <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{item.description}</p>}
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm" data-testid={`text-price-${item.id}`}>{fmt(item.price)}</span>
                          {inCart && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} key={inCart.quantity}>
                              <Badge variant="default" className="text-xs" data-testid={`badge-qty-${item.id}`}>{inCart.quantity}</Badge>
                            </motion.div>
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
      </div>

      <div className="w-[400px] flex flex-col bg-card">
        <div className="border-b">
          <div className="flex items-center gap-0 px-2 pt-2 overflow-x-auto" data-testid="pos-tabs-bar">
            {tabs.map((tab, idx) => (
              <div key={tab.id} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer border border-b-0 mr-0.5 whitespace-nowrap transition-colors ${tab.id === activeTabId ? "bg-card border-border text-foreground" : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"}`}
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
          </div>
        </div>

        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-heading font-semibold text-lg">Current Order</h2>
            {cart.length > 0 && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} key={cart.reduce((s, c) => s + c.quantity, 0)}>
                <Badge variant="secondary" data-testid="badge-cart-count">{cart.reduce((s, c) => s + c.quantity, 0)}</Badge>
              </motion.div>
            )}
            <div className="ml-auto flex items-center gap-1">
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

          {lastPlacedOrder && (
            <div className="mb-2 flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-1.5">
              <Receipt className="h-3.5 w-3.5 text-green-600 shrink-0" />
              <span className="text-xs text-green-700 dark:text-green-300 flex-1">Order placed · {fmt(lastPlacedOrder.total)}</span>
              <Button size="sm" className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => { if (lastPlacedOrder?.tableId) { navigate(`/pos/bill/${lastPlacedOrder.orderId}`); } else { setShowBillModal(true); } }} data-testid="button-open-bill">Bill</Button>
              <button className="text-green-600 hover:text-green-800 ml-1" onClick={() => setLastPlacedOrder(null)} data-testid="button-dismiss-bill"><X className="h-3 w-3" /></button>
            </div>
          )}

          <div className="flex gap-1">
            <Button data-testid="button-order-type-dine-in" variant={orderType === "dine_in" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => updateActiveTab({ orderType: "dine_in" })}>
              <UtensilsCrossed className="h-3.5 w-3.5 mr-1" /> Dine-in
            </Button>
            <Button data-testid="button-order-type-takeaway" variant={orderType === "takeaway" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => updateActiveTab({ orderType: "takeaway" })}>
              <Package className="h-3.5 w-3.5 mr-1" /> Takeaway
            </Button>
            <Button data-testid="button-order-type-delivery" variant={orderType === "delivery" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => updateActiveTab({ orderType: "delivery" })}>
              <Truck className="h-3.5 w-3.5 mr-1" /> Delivery
            </Button>
          </div>

          {isDineIn && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3">
              <Select value={selectedTable} onValueChange={(v) => updateActiveTab({ selectedTable: v })}>
                <SelectTrigger data-testid="select-table"><SelectValue placeholder="Select table..." /></SelectTrigger>
                <SelectContent>
                  {freeTables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>Table {t.number} ({t.zone} - {t.capacity} seats)</SelectItem>
                  ))}
                  {freeTables.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No free tables</div>}
                </SelectContent>
              </Select>
            </motion.div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">{fmt(item.price)} each</span>
                            {item.isCombo && item.originalPrice && <span className="text-xs text-muted-foreground line-through">{fmt(item.originalPrice)}</span>}
                            {item.modifiers?.filter(m => m.label && m.label !== "Regular" && m.label !== "Medium").map((m, i) => (
                              <Badge key={i} variant="secondary" className="text-[9px] h-4 px-1">{m.label}</Badge>
                            ))}
                          </div>
                        </div>
                        <span className="font-semibold text-sm ml-2">{fmt(item.price * item.quantity)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button data-testid={`button-decrease-${item.menuItemId}`} variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.cartKey, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <motion.span key={item.quantity} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="w-8 text-center text-sm font-medium" data-testid={`text-qty-${item.menuItemId}`}>{item.quantity}</motion.span>
                          <Button data-testid={`button-increase-${item.menuItemId}`} variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.cartKey, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1">
                          {!item.isCombo && (
                            <Button data-testid={`button-modifier-${item.menuItemId}`} variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => openModifierDrawer(item)} title="Modifiers & instructions">
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          )}
                          <Button data-testid={`button-note-${item.menuItemId}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => openNoteDialog(item.cartKey)}>
                            <StickyNote className="h-3 w-3" />
                          </Button>
                          <Button data-testid={`button-remove-${item.menuItemId}`} variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.cartKey)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {item.notes && !item.isCombo && <p className="text-xs text-muted-foreground italic pl-1">Note: {item.notes}</p>}
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

        <div className="border-t p-4 space-y-3">
          {applicableOffers.length > 0 && (
            <div className="space-y-1.5" data-testid="offers-section">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Tag className="h-3 w-3" /> Available Offers
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
            <Input data-testid="input-discount" type="number" placeholder="Additional discount" value={discount} onChange={(e) => updateActiveTab({ discount: e.target.value })} min="0" step="0.01" />
            <Textarea data-testid="input-order-notes" placeholder="Order notes..." value={orderNotes} onChange={(e) => updateActiveTab({ orderNotes: e.target.value })} rows={2} className="resize-none" />
          </div>

          {!isDineIn && (
            <div className="flex gap-1">
              <Button data-testid="button-payment-cash" variant={paymentMethod === "cash" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setPaymentMethod("cash")}>
                <Banknote className="h-3.5 w-3.5 mr-1" /> Cash
              </Button>
              <Button data-testid="button-payment-card" variant={paymentMethod === "card" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setPaymentMethod("card")}>
                <CreditCard className="h-3.5 w-3.5 mr-1" /> Card
              </Button>
              <Button data-testid="button-payment-upi" variant={paymentMethod === "upi" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setPaymentMethod("upi")}>
                <Wallet className="h-3.5 w-3.5 mr-1" /> UPI
              </Button>
            </div>
          )}

          {isDineIn && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300" data-testid="text-dine-in-info">
              Dine-in orders start as In Progress. Payment is collected when the guest is ready to pay.
            </div>
          )}

          <Separator />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between" data-testid="text-subtotal">
              <span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span>
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
                <span>Manual Discount</span><span>-{fmt(manualDiscount)}</span>
              </div>
            )}
            {serviceChargeAmount > 0 && (
              <div className="flex justify-between" data-testid="text-service-charge">
                <span className="text-muted-foreground">Service Charge ({(tenantServiceChargePct * 100).toFixed(1)}%)</span>
                <span>{fmt(serviceChargeAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between" data-testid="text-tax">
                <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(1)}%)</span>
                <span>{fmt(taxAmount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-base" data-testid="text-total">
              <span>Total</span><span>{fmt(total)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button data-testid="button-hold-order" variant="outline" size="sm" className="text-xs px-3" onClick={holdCurrentTab} disabled={cart.length === 0 && !activeTab?.heldOrderId} title="Hold order">
              <Pause className="h-3.5 w-3.5 mr-1" /> Hold
            </Button>
            {cart.length >= 2 && (
              <Button data-testid="button-split-bill" variant="outline" size="sm" className="text-xs px-3" onClick={() => { setSplitAssignment({}); setShowSplitDialog(true); }} title="Split bill">
                <Scissors className="h-3.5 w-3.5 mr-1" /> Split
              </Button>
            )}
            <Button data-testid="button-place-order" className="flex-1 transition-all duration-200 hover:scale-[1.02]" size="lg" onClick={handlePlaceOrder} disabled={!hasUnsentItems || placeOrderMutation.isPending}>
              {placeOrderMutation.isPending ? "Sending..." : isAddonKotMode ? "Send Add-on KOT" : isDineIn ? "Send to Kitchen" : "Place Order"}
            </Button>
          </div>

          {!isDineIn && paymentMethod === "card" && (
            <Button data-testid="button-send-payment-link" variant="outline" className="w-full" size="sm"
              onClick={() => sendPaymentLinkMutation.mutate()} disabled={cart.length === 0 || sendPaymentLinkMutation.isPending}>
              {sendPaymentLinkMutation.isPending ? "Generating Link..." : <><QrCode className="h-3.5 w-3.5 mr-1.5" /> Send Payment Link</>}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={!!paymentLinkModal?.open} onOpenChange={(o) => !o && setPaymentLinkModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-teal-600" /> Payment Link Ready</DialogTitle></DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">Share this QR code or link with the customer to collect payment via Stripe.</p>
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
          <DialogHeader><DialogTitle>Item Notes</DialogTitle></DialogHeader>
          <Textarea data-testid="input-item-note" placeholder="Add special instructions..." value={itemNoteText} onChange={(e) => setItemNoteText(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNoteDialogItem(null)} data-testid="button-cancel-note">Cancel</Button>
            <Button onClick={saveItemNote} data-testid="button-save-note">Save Note</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modifierItem} onOpenChange={(o) => !o && setModifierItem(null)}>
        <DialogContent className="max-w-sm" data-testid="dialog-modifier-drawer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              {modifierItem?.name} — Modifiers
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">{sizeGroup?.name ?? "Size"}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(sizeGroup?.options ?? SIZE_MODIFIERS).map(s => (
                  <button key={s.label}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${modifierSize === s.label ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}
                    onClick={() => setModifierSize(s.label)}
                    data-testid={`modifier-size-${s.label.toLowerCase()}`}
                  >
                    {s.label}
                    {s.priceAdjust !== 0 && <span className="block text-[9px] opacity-70">{s.priceAdjust > 0 ? `+${(s.priceAdjust * 100).toFixed(0)}%` : `${(s.priceAdjust * 100).toFixed(0)}%`}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">{spiceGroup?.name ?? "Spice Level"}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(spiceGroup?.options ?? SPICE_MODIFIERS).map(s => (
                  <button key={s.label}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${modifierSpice === s.label ? "bg-orange-500 text-white border-orange-500" : "border-border hover:border-orange-400"}`}
                    onClick={() => setModifierSpice(s.label)}
                    data-testid={`modifier-spice-${s.label.toLowerCase().replace(" ", "-")}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Extras / Add-ons</Label>
              <Input placeholder="e.g. Extra cheese, No onions" value={modifierExtras} onChange={e => setModifierExtras(e.target.value)} className="text-sm" data-testid="input-modifier-extras" />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Special Instructions</Label>
              <Textarea placeholder="Any special prep instructions..." value={modifierNote} onChange={e => setModifierNote(e.target.value)} rows={2} className="resize-none text-sm" data-testid="input-modifier-note" />
            </div>
            {modifierItem && (
              <div className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
                <span className="text-muted-foreground">Adjusted price</span>
                <span className="font-semibold">{fmt(Math.max(0, modifierItem.basePrice * (1 + ((sizeGroup?.options ?? SIZE_MODIFIERS).find(s => s.label === modifierSize)?.priceAdjust ?? 0))))}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setModifierItem(null)} data-testid="button-cancel-modifier">Cancel</Button>
              <Button className="flex-1" onClick={saveModifiers} data-testid="button-save-modifier">Apply</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecall} onOpenChange={setShowRecall}>
        <DialogContent className="max-w-sm" data-testid="dialog-recall">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" /> Held Orders</DialogTitle></DialogHeader>
          {heldTabs.length === 0 && orphanedServerOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No held orders</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {heldTabs.map((held, i) => (
                <div key={i} className="flex items-center gap-2 p-3 border rounded-lg" data-testid={`held-order-${i}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{held.label}</p>
                    <p className="text-xs text-muted-foreground">{held.tab.cart.length} items · {new Date(held.heldAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <Button size="sm" className="text-xs h-7" onClick={() => recallHeldTab(held)} data-testid={`button-recall-${i}`}>Recall</Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteHeldTab(held)} data-testid={`button-delete-held-${i}`}><X className="h-3 w-3" /></Button>
                </div>
              ))}
              {orphanedServerOrders.map((order, i) => (
                <div key={order.id} className="flex items-center gap-2 p-3 border border-dashed rounded-lg" data-testid={`held-order-server-${i}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{order.tableId ? `Table #${order.tableNumber ?? "?"}` : order.orderType}</p>
                    <p className="text-xs text-muted-foreground">{(order.items || []).length} items · from server</p>
                  </div>
                  <Button size="sm" className="text-xs h-7" onClick={() => recallServerOrder(order)} data-testid={`button-recall-server-${i}`}>Recall</Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSplitDialog} onOpenChange={(o) => { setShowSplitDialog(o); if (!o) { setSplitAssignment({}); setSplitGroupCount(2); } }}>
        <DialogContent className="max-w-sm" data-testid="dialog-split-bill">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Scissors className="h-4 w-4 text-primary" /> Split Bill</DialogTitle></DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs text-muted-foreground flex-1">Assign items to groups. Each group becomes a separate order.</p>
            <button className="px-2 py-0.5 rounded text-xs border border-border hover:bg-muted disabled:opacity-40" disabled={splitGroupCount <= 2} onClick={() => { setSplitGroupCount(n => n - 1); setSplitAssignment(prev => { const updated = { ...prev }; Object.keys(updated).forEach(k => { if (updated[k] >= splitGroupCount) updated[k] = splitGroupCount - 1; }); return updated; }); }} data-testid="button-split-remove-group">−</button>
            <span className="text-xs font-medium w-16 text-center">{splitGroupCount} Groups</span>
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
            <Button variant="outline" className="flex-1" onClick={() => setShowSplitDialog(false)} data-testid="button-cancel-split">Cancel</Button>
            <Button className="flex-1" onClick={handleSplitConfirm} disabled={splitOrderMutation.isPending} data-testid="button-confirm-split">
              {splitOrderMutation.isPending ? "Splitting..." : "Place Split Orders"}
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
          <DialogHeader><DialogTitle>Close tab?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This tab has unsent items that haven't been sent to the kitchen yet. Close anyway?</p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setCloseTabConfirm(null)} data-testid="button-cancel-close-tab">Cancel</Button>
            <Button variant="destructive" onClick={() => { if (closeTabConfirm) { closeTab(closeTabConfirm); setCloseTabConfirm(null); } }} data-testid="button-confirm-close-tab">Close Tab</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
