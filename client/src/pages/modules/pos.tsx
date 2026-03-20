import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
} from "lucide-react";
import type { MenuCategory, MenuItem, Table, Offer, ComboOffer } from "@shared/schema";

interface EngineDiscount {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  discountType: string;
  discountAmount: number;
  description: string;
}

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  isVeg: boolean | null;
  categoryId: string | null;
  isCombo?: boolean;
  comboId?: string;
  comboItems?: { menuItemId: string; name: string; price: string }[];
  originalPrice?: number;
}

type OrderType = "dine_in" | "takeaway" | "delivery";
type PaymentMethod = "cash" | "card" | "upi";

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
  if (scope === "category" && offer.scopeRef) {
    return cart.some((item) => item.categoryId === offer.scopeRef);
  }
  if (scope === "specific_items" && offer.scopeRef) {
    const itemIds = offer.scopeRef.split(",").map((s) => s.trim());
    return cart.some((item) => itemIds.includes(item.menuItemId));
  }
  return true;
}

interface ComboItemRef {
  menuItemId: string;
  name: string;
  price: string;
}

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
  const queryClient = useQueryClient();

  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [noteDialogItem, setNoteDialogItem] = useState<string | null>(null);
  const [itemNoteText, setItemNoteText] = useState("");
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [dismissedRuleIds, setDismissedRuleIds] = useState<Set<string>>(new Set());
  const [supervisorDialog, setSupervisorDialog] = useState<{
    open: boolean; action: string; actionLabel: string;
  } | null>(null);
  const [paymentLinkModal, setPaymentLinkModal] = useState<{
    open: boolean; url: string; qrDataUrl: string; copied: boolean; orderId?: string;
  } | null>(null);

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
    const kitchenStatuses = ["in_progress", "ready", "served"];
    if (p?.status && kitchenStatuses.includes(p.status)) {
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

  const evaluatePayload = useMemo(() => {
    if (cart.length === 0) return null;
    return {
      items: cart.map((c) => ({
        menuItemId: c.menuItemId,
        name: c.name,
        price: c.price,
        quantity: c.quantity,
        categoryId: c.categoryId || undefined,
      })),
      subtotal,
      channel: "pos",
      orderType,
    };
  }, [cart, subtotal, orderType]);

  const { data: engineResult } = useQuery<{
    appliedDiscounts: EngineDiscount[];
    totalDiscount: number;
    finalSubtotal: number;
  }>({
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

  const engineDiscount = useMemo(() => {
    return engineDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);
  }, [engineDiscounts]);

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
    if (selectedOffer.maxDiscount && disc > Number(selectedOffer.maxDiscount)) {
      disc = Number(selectedOffer.maxDiscount);
    }
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
      const existing = prev.find((c) => c.menuItemId === item.id && !c.isCombo);
      if (existing) {
        return prev.map((c) => c.menuItemId === item.id && !c.isCombo ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: parseFloat(item.price), quantity: 1, notes: "", isVeg: item.isVeg, categoryId: item.categoryId }];
    });
  }, []);

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
        menuItemId: comboCartId,
        name: `${combo.name}`,
        price: Number(combo.comboPrice),
        quantity: 1,
        notes: `Save ${fmt(savingsAmount)}`,
        isVeg: null,
        categoryId: null,
        isCombo: true,
        comboId: combo.id,
        comboItems: allComboItems,
        originalPrice: Number(combo.individualTotal),
      },
    ]);

  }, [fmt]);

  const updateQuantity = (menuItemId: string, delta: number) => {
    setCart((prev) => prev.map((c) => c.menuItemId === menuItemId ? { ...c, quantity: c.quantity + delta } : c).filter((c) => c.quantity > 0));
  };

  const removeFromCart = (menuItemId: string) => {
    setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
  };

  const openNoteDialog = (menuItemId: string) => {
    const item = cart.find((c) => c.menuItemId === menuItemId);
    setItemNoteText(item?.notes || "");
    setNoteDialogItem(menuItemId);
  };

  const saveItemNote = () => {
    if (noteDialogItem) {
      setCart((prev) => prev.map((c) => c.menuItemId === noteDialogItem ? { ...c, notes: itemNoteText } : c));
    }
    setNoteDialogItem(null);
    setItemNoteText("");
  };

  const buildOrderData = useCallback((supervisorOverride?: { username: string; password: string; otpApprovalToken?: string }) => {
    const clientOrderId = crypto.randomUUID ? crypto.randomUUID() : `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const orderItems: { menuItemId: string; name: string; quantity: number; price: string; notes: string | null; isCombo?: boolean; comboId?: string }[] = [];
    for (const c of cart) {
      if (c.isCombo && c.comboItems) {
        orderItems.push({
          menuItemId: c.comboId || c.menuItemId,
          name: c.name,
          quantity: c.quantity,
          price: c.price.toFixed(2),
          notes: c.comboItems.map((ci) => ci.name).join(", ") + (c.notes ? ` | ${c.notes}` : ""),
          isCombo: true,
          comboId: c.comboId || undefined,
        });
      } else {
        orderItems.push({
          menuItemId: c.menuItemId,
          name: c.name,
          quantity: c.quantity,
          price: c.price.toFixed(2),
          notes: c.notes || null,
        });
      }
    }

    const orderData: Record<string, unknown> = {
      channel: "pos",
      clientOrderId,
      orderType,
      tableId: isDineIn ? selectedTable || null : null,
      subtotal: subtotal.toFixed(2),
      tax: taxAmount.toFixed(2),
      discount: totalDiscount.toFixed(2),
      total: total.toFixed(2),
      notes: [orderNotes, serviceChargeAmount > 0 ? `Service Charge (${(tenantServiceChargePct * 100).toFixed(1)}%): ${serviceChargeAmount.toFixed(2)}` : null].filter(Boolean).join(" | ") || null,
      status: isDineIn ? "in_progress" : "new",
      offerId: selectedOffer?.id || null,
      manualDiscountAmount: manualDiscount > 0 ? manualDiscount.toFixed(2) : null,
      items: orderItems,
    };
    if (!isDineIn) {
      orderData.paymentMethod = paymentMethod;
    }
    if (supervisorOverride) {
      orderData.supervisorOverride = supervisorOverride;
    }
    if (dismissedRuleIds.size > 0) {
      orderData.dismissedRuleIds = Array.from(dismissedRuleIds);
    }
    return orderData;
  }, [orderType, isDineIn, selectedTable, subtotal, taxAmount, totalDiscount, total, orderNotes, serviceChargeAmount, selectedOffer, cart, paymentMethod, dismissedRuleIds]);

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
          if (errData.requiresSupervisor) {
            throw new Error("__SUPERVISOR_REQUIRED__:" + (errData.action || "apply_large_discount"));
          }
          throw new Error(errData.message || "Permission denied");
        }
        if (res.status === 409) return (await res.json()).order;
        if (!res.ok) throw new Error((await res.json()).message || "Failed");
        return res.json();
      }

      try {
        const { queued, orderId } = await syncManager.enqueueOrder(orderData);
        if (queued) {
          return { id: orderId, queued: true };
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
      if (data?.queued) {
        toast({ title: "Order queued", description: "Will sync when connection is restored" });
      } else {
        toast({ title: "Order placed successfully!" });
      }
      setCart([]);
      setDiscount("");
      setOrderNotes("");
      setSelectedTable("");
      setSelectedOffer(null);
      setDismissedRuleIds(new Set());
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

  const handlePlaceOrder = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items before placing an order", variant: "destructive" });
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
      setCart([]);
      setDiscount("");
      setOrderNotes("");
      setSelectedTable("");
      setSelectedOffer(null);
      setDismissedRuleIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    },
    onError: (err: Error) => {
      toast({ title: "Payment link failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex h-full gap-0" data-testid="pos-page">
      <div className="flex-1 flex flex-col overflow-hidden border-r">
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input data-testid="input-search-menu" placeholder="Search menu items..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button data-testid="button-category-all" variant={selectedCategory === null && !showCombos ? "default" : "outline"} size="sm" onClick={() => { setSelectedCategory(null); setShowCombos(false); }} className="transition-all duration-200 hover:scale-105">
              <UtensilsCrossed className="h-3.5 w-3.5 mr-1" /> All
            </Button>
            {activeCombos.length > 0 && (
              <Button data-testid="button-category-combos" variant={showCombos ? "default" : "outline"} size="sm" onClick={() => { setShowCombos(true); setSelectedCategory(null); }} className="transition-all duration-200 hover:scale-105 whitespace-nowrap">
                <Package className="h-3.5 w-3.5 mr-1" /> Combos
                <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">{activeCombos.length}</Badge>
              </Button>
            )}
            {categories.filter((c) => c.active !== false).map((cat) => {
              const CatIcon = getCategoryIcon(cat.name);
              return (
                <Button key={cat.id} data-testid={`button-category-${cat.id}`} variant={selectedCategory === cat.id ? "default" : "outline"} size="sm" onClick={() => { setSelectedCategory(cat.id); setShowCombos(false); }} className="whitespace-nowrap transition-all duration-200 hover:scale-105">
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
                <Package className="h-12 w-12 mb-2" />
                <p>No active combos</p>
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
                            {allComboItems.length > 3 && (
                              <span className="text-[9px] px-1 py-0 rounded bg-muted text-muted-foreground">+{allComboItems.length - 3}</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-bold text-sm text-primary" data-testid={`text-combo-price-${combo.id}`}>{fmt(combo.comboPrice)}</span>
                              <span className="text-xs text-muted-foreground line-through">{fmt(combo.individualTotal)}</span>
                            </div>
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
              <UtensilsCrossed className="h-12 w-12 mb-2" />
              <p>No items found</p>
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
                            <span className="h-4 w-4 shrink-0 ml-1 border-2 border-green-600 rounded-sm flex items-center justify-center" title="Veg" data-testid={`icon-veg-${item.id}`}>
                              <span className="w-2 h-2 rounded-full bg-green-600" />
                            </span>
                          ) : item.isVeg === false ? (
                            <span className="h-4 w-4 shrink-0 ml-1 border-2 border-red-600 rounded-sm flex items-center justify-center" title="Non-Veg" data-testid={`icon-nonveg-${item.id}`}>
                              <span className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-red-600" />
                            </span>
                          ) : null}
                        </div>
                        {item.tags && (item.tags as string[]).length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {(item.tags as string[]).slice(0, 2).map((tag, i) => (
                              <span key={i} className="text-[9px] px-1.5 py-0 rounded bg-muted text-muted-foreground">{tag}</span>
                            ))}
                            {(item.tags as string[]).length > 2 && (
                              <span className="text-[9px] px-1 py-0 rounded bg-muted text-muted-foreground">+{(item.tags as string[]).length - 2}</span>
                            )}
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

      <div className="w-[380px] flex flex-col bg-card">
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
          </div>

          <div className="flex gap-1">
            <Button data-testid="button-order-type-dine-in" variant={orderType === "dine_in" ? "default" : "outline"} size="sm" className="flex-1 transition-all duration-200" onClick={() => setOrderType("dine_in")}>
              <UtensilsCrossed className="h-3.5 w-3.5 mr-1" /> Dine-in
            </Button>
            <Button data-testid="button-order-type-takeaway" variant={orderType === "takeaway" ? "default" : "outline"} size="sm" className="flex-1 transition-all duration-200" onClick={() => setOrderType("takeaway")}>
              <Package className="h-3.5 w-3.5 mr-1" /> Takeaway
            </Button>
            <Button data-testid="button-order-type-delivery" variant={orderType === "delivery" ? "default" : "outline"} size="sm" className="flex-1 transition-all duration-200" onClick={() => setOrderType("delivery")}>
              <Truck className="h-3.5 w-3.5 mr-1" /> Delivery
            </Button>
          </div>

          {isDineIn && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3">
              <Select value={selectedTable} onValueChange={setSelectedTable}>
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
                {cart.map((item) => (
                  <motion.div key={item.menuItemId} data-testid={`cart-item-${item.menuItemId}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40, height: 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} className={`flex flex-col gap-1.5 p-2 rounded-lg border bg-background ${item.isCombo ? "border-primary/30 bg-primary/5" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          {item.isCombo ? (
                            <Package className="h-3 w-3 text-primary shrink-0" />
                          ) : item.isVeg === true ? (
                            <span className="h-3 w-3 shrink-0 border border-green-600 rounded-sm flex items-center justify-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
                            </span>
                          ) : item.isVeg === false ? (
                            <span className="h-3 w-3 shrink-0 border border-red-600 rounded-sm flex items-center justify-center">
                              <span className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-red-600" />
                            </span>
                          ) : null}
                          <span className="font-medium text-sm truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{fmt(item.price)} each</span>
                          {item.isCombo && item.originalPrice && (
                            <span className="text-xs text-muted-foreground line-through">{fmt(item.originalPrice)}</span>
                          )}
                          {item.isCombo && (
                            <Badge variant="secondary" className="text-[9px] h-4 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">Combo</Badge>
                          )}
                        </div>
                      </div>
                      <span className="font-semibold text-sm">{fmt(item.price * item.quantity)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button data-testid={`button-decrease-${item.menuItemId}`} variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.menuItemId, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <motion.span key={item.quantity} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="w-8 text-center text-sm font-medium" data-testid={`text-qty-${item.menuItemId}`}>{item.quantity}</motion.span>
                        <Button data-testid={`button-increase-${item.menuItemId}`} variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.menuItemId, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button data-testid={`button-note-${item.menuItemId}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => openNoteDialog(item.menuItemId)}>
                          <StickyNote className="h-3 w-3" />
                        </Button>
                        <Button data-testid={`button-remove-${item.menuItemId}`} variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.menuItemId)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {item.notes && !item.isCombo && <p className="text-xs text-muted-foreground italic pl-1">Note: {item.notes}</p>}
                    {item.isCombo && item.comboItems && (
                      <div className="text-xs text-muted-foreground pl-1 flex flex-wrap gap-1">
                        {item.comboItems.map((ci, i) => (
                          <span key={i} className="bg-muted px-1.5 py-0.5 rounded">{ci.name}</span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
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
                  const isSelected = selectedOffer?.id === offer.id;
                  return (
                    <Button
                      key={offer.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-7 transition-all duration-200"
                      onClick={() => setSelectedOffer(isSelected ? null : offer)}
                      data-testid={`button-offer-${offer.id}`}
                    >
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
                  <span className="text-green-700 dark:text-green-300 font-medium">
                    {selectedOffer.name}: -{fmt(offerDiscount)}
                  </span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-green-600" onClick={() => setSelectedOffer(null)} data-testid="button-remove-offer">
                    <X className="h-3 w-3" />
                  </Button>
                </motion.div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Input data-testid="input-discount" type="number" placeholder="Additional discount" value={discount} onChange={(e) => setDiscount(e.target.value)} min="0" step="0.01" />
            <Textarea data-testid="input-order-notes" placeholder="Order notes..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows={2} className="resize-none" />
          </div>

          {!isDineIn && (
            <div className="flex gap-1">
              <Button data-testid="button-payment-cash" variant={paymentMethod === "cash" ? "default" : "outline"} size="sm" className="flex-1 transition-all duration-200" onClick={() => setPaymentMethod("cash")}>
                <Banknote className="h-3.5 w-3.5 mr-1" /> Cash
              </Button>
              <Button data-testid="button-payment-card" variant={paymentMethod === "card" ? "default" : "outline"} size="sm" className="flex-1 transition-all duration-200" onClick={() => setPaymentMethod("card")}>
                <CreditCard className="h-3.5 w-3.5 mr-1" /> Card
              </Button>
              <Button data-testid="button-payment-upi" variant={paymentMethod === "upi" ? "default" : "outline"} size="sm" className="flex-1 transition-all duration-200" onClick={() => setPaymentMethod("upi")}>
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
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmt(subtotal)}</span>
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
                  <button
                    type="button"
                    className="ml-1 text-purple-400 hover:text-red-500 transition-colors"
                    data-testid={`button-dismiss-rule-${ed.ruleId}`}
                    title="Remove this auto-applied discount"
                    onClick={() => setDismissedRuleIds((prev) => new Set([...prev, ed.ruleId]))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ))}
            {manualDiscount > 0 && (
              <div className="flex justify-between text-green-600" data-testid="text-discount">
                <span>Manual Discount</span>
                <span>-{fmt(manualDiscount)}</span>
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
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>

          <Button data-testid="button-place-order" className="w-full transition-all duration-200 hover:scale-[1.02]" size="lg" onClick={handlePlaceOrder} disabled={cart.length === 0 || placeOrderMutation.isPending}>
            {placeOrderMutation.isPending ? "Placing Order..." : isDineIn ? "Send to Kitchen" : "Place Order"}
          </Button>

          {!isDineIn && paymentMethod === "card" && (
            <Button
              data-testid="button-send-payment-link"
              variant="outline"
              className="w-full transition-all duration-200"
              size="sm"
              onClick={() => sendPaymentLinkMutation.mutate()}
              disabled={cart.length === 0 || sendPaymentLinkMutation.isPending}
            >
              {sendPaymentLinkMutation.isPending ? (
                "Generating Link..."
              ) : (
                <><QrCode className="h-3.5 w-3.5 mr-1.5" /> Send Payment Link</>
              )}
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
            <div className="bg-muted rounded-lg p-3 break-all text-xs text-left font-mono" data-testid="text-payment-link-url">
              {paymentLinkModal?.url}
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant={paymentLinkModal?.copied ? "secondary" : "default"}
                onClick={() => {
                  if (paymentLinkModal?.url) {
                    navigator.clipboard.writeText(paymentLinkModal.url);
                    setPaymentLinkModal(prev => prev ? { ...prev, copied: true } : null);
                    setTimeout(() => setPaymentLinkModal(prev => prev ? { ...prev, copied: false } : null), 2000);
                  }
                }}
                data-testid="button-copy-payment-link"
              >
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
      {supervisorDialog && (
        <SupervisorApprovalDialog
          open={supervisorDialog.open}
          onOpenChange={(open) => !open && setSupervisorDialog(null)}
          action={supervisorDialog.action}
          actionLabel={supervisorDialog.actionLabel}
          onApproved={handlePosSupervisorApproved}
        />
      )}
    </div>
  );
}
