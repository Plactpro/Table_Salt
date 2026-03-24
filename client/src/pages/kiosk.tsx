import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { syncManager, type SyncStatus } from "@/lib/sync-manager";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, UtensilsCrossed, ChevronLeft,
  ChevronRight, CreditCard, Wallet, Smartphone, Store, CheckCircle,
  Clock, X, Sparkles, Package, StickyNote, Info, Wifi, WifiOff, Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type KioskStep = "welcome" | "language" | "service-type" | "table-number" | "menu" | "upsell" | "cart" | "payment" | "confirmation";
type ServiceType = "dine_in" | "takeaway";
type KioskLanguage = "en" | "ar";

interface KioskCartItem {
  cartLineId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean | null;
  categoryId: string | null;
  image?: string | null;
  description?: string | null;
  notes: string;
}

interface TenantInfo {
  name: string;
  currency: string;
  currencyPosition: "before" | "after";
  currencyDecimals: number;
  taxRate: string;
  serviceCharge: string;
  taxType: string;
  compoundTax: boolean;
}

const KIOSK_TOKEN_KEY = "kiosk_device_token";

function getKioskToken(): string {
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get("token");
  if (tokenFromUrl) {
    localStorage.setItem(KIOSK_TOKEN_KEY, tokenFromUrl);
    return tokenFromUrl;
  }
  return localStorage.getItem(KIOSK_TOKEN_KEY) || "";
}

function kioskFetch(url: string, options?: RequestInit) {
  const token = getKioskToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Kiosk-Token": token,
      ...(options?.headers || {}),
    },
  });
}

const ATTRACTOR_SLIDES = [
  { title: "Fresh Ingredients", subtitle: "Made with love, served with care", gradient: "from-emerald-600 to-teal-700" },
  { title: "Daily Specials", subtitle: "Check out today's chef recommendations", gradient: "from-amber-600 to-orange-700" },
  { title: "Quick & Easy", subtitle: "Order in seconds, ready in minutes", gradient: "from-blue-600 to-indigo-700" },
  { title: "Combo Deals", subtitle: "Save more with our combo meals", gradient: "from-purple-600 to-pink-700" },
];

export default function KioskPage() {
  const [step, setStep] = useState<KioskStep>("welcome");
  const [serviceType, setServiceType] = useState<ServiceType>("takeaway");
  const [language, setLanguage] = useState<KioskLanguage>("en");
  const [cart, setCart] = useState<KioskCartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("card");
  const [orderResult, setOrderResult] = useState<any>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [itemDetailModal, setItemDetailModal] = useState<any>(null);
  const [itemNoteText, setItemNoteText] = useState("");
  const [itemDetailQty, setItemDetailQty] = useState(1);
  const [noteEditItem, setNoteEditItem] = useState<string | null>(null);
  const [noteEditText, setNoteEditText] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [showUpsellStep, setShowUpsellStep] = useState(false);
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("online");
  const [syncPending, setSyncPending] = useState(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = getKioskToken();

  useEffect(() => {
    syncManager.init();
    const unsub = syncManager.subscribe((status, pending) => {
      setSyncStatus(status);
      setSyncPending(pending);
    });
    return unsub;
  }, []);

  const { data: menuData } = useCachedQuery(
    ["kiosk-menu", token],
    "/api/kiosk/menu",
    { enabled: !!token, staleTime: 60000, customFetcher: kioskFetch }
  );

  const { data: tenantInfo } = useCachedQuery<TenantInfo>(
    ["kiosk-tenant", token],
    "/api/kiosk/tenant-info",
    { enabled: !!token, staleTime: 60000, customFetcher: kioskFetch }
  );

  const { data: deviceConfig } = useCachedQuery(
    ["kiosk-device-config", token],
    "/api/kiosk/device-config",
    { enabled: !!token, staleTime: 60000, customFetcher: kioskFetch }
  );

  const idleTimeoutMs = (deviceConfig?.settings?.idleTimeout || 120) * 1000;
  const confirmResetMs = (deviceConfig?.settings?.confirmTimeout || 15) * 1000;

  const { data: upsellRules = [] } = useCachedQuery(
    ["kiosk-upsells", token],
    "/api/kiosk/upsells",
    { enabled: !!token, staleTime: 60000, customFetcher: kioskFetch }
  );

  const { data: gatewayConfig } = useQuery({
    queryKey: ["/api/platform/gateway-config"],
    queryFn: async () => {
      const res = await fetch("/api/platform/gateway-config");
      if (!res.ok) return { activePaymentGateway: "stripe" };
      return res.json();
    },
    staleTime: 60_000,
  });
  const activeGateway: "stripe" | "razorpay" | "both" = gatewayConfig?.activePaymentGateway ?? "stripe";

  const categories = menuData?.categories || [];
  const menuItems = menuData?.items || [];

  const fmt = useCallback((val: number | string) => {
    if (!tenantInfo) return `${val}`;
    return sharedFormatCurrency(val, tenantInfo.currency?.toUpperCase() || "USD", {
      position: tenantInfo.currencyPosition || "before",
      decimals: tenantInfo.currencyDecimals ?? 2,
    });
  }, [tenantInfo]);

  const filteredItems = useMemo(() => {
    let items = menuItems.filter((item: any) => item.available !== false);
    if (selectedCategory) items = items.filter((item: any) => item.categoryId === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((item: any) => item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q));
    }
    return items;
  }, [menuItems, selectedCategory, searchQuery]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const taxRate = tenantInfo ? Number(tenantInfo.taxRate || 0) / 100 : 0;
  const serviceChargeRate = tenantInfo ? Number(tenantInfo.serviceCharge || 0) / 100 : 0;
  const serviceChargeAmount = subtotal * serviceChargeRate;
  const taxBase = tenantInfo?.compoundTax ? subtotal + serviceChargeAmount : subtotal;
  const taxAmount = taxBase * taxRate;
  const total = subtotal + serviceChargeAmount + taxAmount;

  const upsellSuggestions = useMemo(() => {
    if (cart.length === 0) return [];
    const cartItemIds = new Set(cart.map(c => c.menuItemId));
    const cartCategoryIds = new Set(cart.map(c => c.categoryId).filter(Boolean));
    const suggestions: any[] = [];
    for (const rule of upsellRules) {
      if (cartItemIds.has(rule.suggestItemId)) continue;
      const matchesItem = rule.triggerItemId && cartItemIds.has(rule.triggerItemId);
      const matchesCategory = rule.triggerCategoryId && cartCategoryIds.has(rule.triggerCategoryId);
      if (matchesItem || matchesCategory) {
        const suggestItem = menuItems.find((m: any) => m.id === rule.suggestItemId);
        if (suggestItem) {
          suggestions.push({ ...rule, suggestItem });
        }
      }
    }
    return suggestions.slice(0, 3);
  }, [cart, upsellRules, menuItems]);

  const resetKiosk = useCallback(() => {
    setStep("welcome");
    setCart([]);
    setSelectedCategory(null);
    setSearchQuery("");
    setOrderResult(null);
    setServiceType("takeaway");
    setItemDetailModal(null);
    setTableNumber("");
    setPromoCode("");
    setLoyaltyPhone("");
    setShowUpsellStep(false);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (step !== "welcome" && step !== "confirmation") {
      idleTimerRef.current = setTimeout(resetKiosk, idleTimeoutMs);
    }
  }, [step, resetKiosk, idleTimeoutMs]);

  useEffect(() => {
    resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [step, resetIdleTimer]);

  useEffect(() => {
    const handler = () => resetIdleTimer();
    window.addEventListener("touchstart", handler);
    window.addEventListener("click", handler);
    return () => {
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("click", handler);
    };
  }, [resetIdleTimer]);

  const nextCartLineId = useRef(1);

  const addToCart = useCallback((item: any, notes?: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id && c.notes === (notes || ""));
      if (existing) {
        return prev.map(c => c.cartLineId === existing.cartLineId ? { ...c, quantity: c.quantity + 1 } : c);
      }
      if (!notes) {
        const existingNoNotes = prev.find(c => c.menuItemId === item.id && !c.notes);
        if (existingNoNotes) {
          return prev.map(c => c.cartLineId === existingNoNotes.cartLineId ? { ...c, quantity: c.quantity + 1 } : c);
        }
      }
      const lineId = `line-${nextCartLineId.current++}`;
      return [...prev, {
        cartLineId: lineId,
        menuItemId: item.id,
        name: item.name,
        price: parseFloat(item.price),
        quantity: 1,
        isVeg: item.isVeg,
        categoryId: item.categoryId,
        image: item.image,
        description: item.description,
        notes: notes || "",
      }];
    });
  }, []);

  const updateQuantity = useCallback((cartLineId: string, delta: number) => {
    setCart(prev => prev.map(c => c.cartLineId === cartLineId ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0));
  }, []);

  const removeFromCart = useCallback((cartLineId: string) => {
    setCart(prev => prev.filter(c => c.cartLineId !== cartLineId));
  }, []);

  const updateCartNotes = useCallback((cartLineId: string, notes: string) => {
    setCart(prev => prev.map(c => c.cartLineId === cartLineId ? { ...c, notes } : c));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment_success") === "1") {
      const orderId = params.get("orderId") || "";
      setOrderResult({ tokenNumber: orderId.slice(0, 6).toUpperCase(), stripePayment: true });
      setStep("confirmation");
      const url = new URL(window.location.href);
      url.searchParams.delete("payment_success");
      url.searchParams.delete("orderId");
      window.history.replaceState({}, "", url.toString());
      setTimeout(() => resetKiosk(), confirmResetMs);
    }
    if (params.get("payment_cancelled") === "1") {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment_cancelled");
      url.searchParams.delete("orderId");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const placeOrder = useCallback(async () => {
    setIsPlacingOrder(true);
    try {
      const useRazorpay = activeGateway === "razorpay"
        ? (paymentMethod === "card" || paymentMethod === "upi")
        : activeGateway === "both"
          ? paymentMethod === "upi"
          : false;
      const useStripe = (activeGateway === "stripe" || activeGateway === "both") && (paymentMethod === "card" || paymentMethod === "wallet");

      if (useStripe) {
        const clientOrderId = crypto.randomUUID ? crypto.randomUUID() : `kiosk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const res = await kioskFetch("/api/kiosk/payment-session", {
          method: "POST",
          body: JSON.stringify({
            items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity, notes: c.notes || undefined })),
            serviceType,
            clientOrderId,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            window.location.href = data.url;
            return;
          }
        }
      }

      if (useRazorpay) {
        const clientOrderId = crypto.randomUUID ? crypto.randomUUID() : `kiosk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const res = await kioskFetch("/api/kiosk/razorpay-payment", {
          method: "POST",
          body: JSON.stringify({
            items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity, notes: c.notes || undefined })),
            serviceType,
            clientOrderId,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.shortUrl) {
            setOrderResult({ tokenNumber: data.orderId?.slice(0, 6).toUpperCase() || "OK", razorpayUrl: data.shortUrl, orderId: data.orderId, linkId: data.paymentLinkId });
            setStep("confirmation");
            setCart([]);
            setTimeout(() => resetKiosk(), confirmResetMs);
            return;
          }
        }
      }

      const clientOrderId = crypto.randomUUID ? crypto.randomUUID() : `kiosk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payload = {
        items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity, notes: c.notes || undefined })),
        paymentMethod,
        serviceType,
        clientOrderId,
      };

      const { queued, responseData } = await syncManager.enqueueKioskOrder(payload, token);

      if (queued) {
        setOrderResult({ tokenNumber: "QUEUED", queued: true });
      } else {
        setOrderResult(responseData || { tokenNumber: "OK" });
      }
      setStep("confirmation");
      setCart([]);
      setTimeout(() => resetKiosk(), confirmResetMs);
    } catch (err) {
      console.error("Order failed", err);
    } finally {
      setIsPlacingOrder(false);
    }
  }, [cart, paymentMethod, serviceType, resetKiosk, token, activeGateway]);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center text-white" data-testid="kiosk-no-token">
        <div className="text-center space-y-4">
          <Store className="h-16 w-16 mx-auto opacity-50" />
          <h1 className="text-2xl font-bold">Kiosk Not Configured</h1>
          <p className="text-slate-400">Please provide a device token via URL parameter: ?token=YOUR_TOKEN</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 text-white select-none overflow-hidden" data-testid="kiosk-page" onClick={resetIdleTimer}>
      <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-sm" data-testid="kiosk-sync-indicator">
        {syncStatus === "online" && <Wifi className="h-3.5 w-3.5 text-green-400" />}
        {syncStatus === "offline" && <WifiOff className="h-3.5 w-3.5 text-red-400" />}
        {syncStatus === "syncing" && <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />}
        {syncPending > 0 && (
          <span className="text-xs text-white/80">{syncPending} pending</span>
        )}
      </div>
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <WelcomeScreen key="welcome" onStart={() => setStep("language")} tenantName={tenantInfo?.name || "Restaurant"} />
        )}
        {step === "language" && (
          <LanguageScreen
            key="language"
            onSelect={(lang) => { setLanguage(lang); setStep("service-type"); }}
            onBack={resetKiosk}
          />
        )}
        {step === "service-type" && (
          <ServiceTypeScreen
            key="service-type"
            onSelect={(t) => { setServiceType(t); setStep(t === "dine_in" ? "table-number" : "menu"); }}
            onBack={() => setStep("language")}
          />
        )}
        {step === "table-number" && (
          <TableNumberScreen
            key="table-number"
            tableNumber={tableNumber}
            onTableNumberChange={setTableNumber}
            onContinue={() => setStep("menu")}
            onBack={() => setStep("service-type")}
          />
        )}
        {step === "menu" && (
          <MenuScreen
            key="menu"
            categories={categories}
            items={filteredItems}
            selectedCategory={selectedCategory}
            searchQuery={searchQuery}
            cart={cart}
            cartCount={cartCount}
            subtotal={subtotal}
            serviceType={serviceType}
            upsellSuggestions={upsellSuggestions}
            fmt={fmt}
            onSelectCategory={setSelectedCategory}
            onSearchChange={setSearchQuery}
            onAddToCart={addToCart}
            onUpdateQuantity={updateQuantity}
            onRemoveFromCart={removeFromCart}
            onViewCart={() => { if (upsellSuggestions.length > 0 && !showUpsellStep) { setShowUpsellStep(true); setStep("upsell"); } else { setStep("cart"); } }}
            onBack={() => setStep(serviceType === "dine_in" ? "table-number" : "service-type")}
            onItemDetail={(item) => { setItemDetailModal(item); setItemDetailQty(1); setItemNoteText(""); }}
          />
        )}
        {step === "upsell" && upsellSuggestions.length > 0 && (
          <UpsellInterstitialScreen
            key="upsell"
            suggestions={upsellSuggestions}
            fmt={fmt}
            onAddItem={(item) => { addToCart(item); }}
            onSkip={() => { setShowUpsellStep(false); setStep("cart"); }}
            onViewCart={() => { setShowUpsellStep(false); setStep("cart"); }}
          />
        )}
        {step === "cart" && (
          <CartScreen
            key="cart"
            cart={cart}
            subtotal={subtotal}
            serviceChargeAmount={serviceChargeAmount}
            taxAmount={taxAmount}
            total={total}
            serviceChargeRate={serviceChargeRate}
            taxRate={taxRate}
            serviceType={serviceType}
            promoCode={promoCode}
            loyaltyPhone={loyaltyPhone}
            fmt={fmt}
            onPromoCodeChange={setPromoCode}
            onLoyaltyPhoneChange={setLoyaltyPhone}
            onUpdateQuantity={updateQuantity}
            onRemoveFromCart={removeFromCart}
            onEditNote={(cartLineId) => { setNoteEditItem(cartLineId); setNoteEditText(cart.find(c => c.cartLineId === cartLineId)?.notes || ""); }}
            onBack={() => setStep("menu")}
            onCheckout={() => setStep("payment")}
          />
        )}
        {step === "payment" && (
          <PaymentScreen
            key="payment"
            total={total}
            paymentMethod={paymentMethod}
            isPlacing={isPlacingOrder}
            fmt={fmt}
            onSelectMethod={setPaymentMethod}
            onBack={() => setStep("cart")}
            onConfirm={placeOrder}
            activeGateway={activeGateway}
          />
        )}
        {step === "confirmation" && (
          <ConfirmationScreen
            key="confirmation"
            orderResult={orderResult}
            serviceType={serviceType}
            fmt={fmt}
            onNewOrder={resetKiosk}
            kioskToken={token}
          />
        )}
      </AnimatePresence>

      {itemDetailModal && (
        <ItemDetailModal
          item={itemDetailModal}
          fmt={fmt}
          cart={cart}
          noteText={itemNoteText}
          quantity={itemDetailQty}
          onNoteChange={setItemNoteText}
          onQuantityChange={setItemDetailQty}
          onClose={() => { setItemDetailModal(null); setItemNoteText(""); setItemDetailQty(1); }}
          onAddToCart={(item, notes, qty) => {
            for (let i = 0; i < qty; i++) addToCart(item, notes);
            setItemDetailModal(null); setItemNoteText(""); setItemDetailQty(1);
          }}
        />
      )}

      {noteEditItem && (
        <Dialog open={true} onOpenChange={() => setNoteEditItem(null)}>
          <DialogContent className="bg-slate-800 border-white/10 text-white max-w-md">
            <DialogHeader>
              <DialogTitle>Special Instructions</DialogTitle>
            </DialogHeader>
            <Textarea
              data-testid="textarea-kiosk-note"
              value={noteEditText}
              onChange={e => setNoteEditText(e.target.value)}
              placeholder="e.g. No onions, extra spicy..."
              className="bg-white/10 border-white/20 text-white placeholder:text-slate-400 min-h-[100px]"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setNoteEditItem(null)} className="text-white border-white/20">Cancel</Button>
              <Button onClick={() => { updateCartNotes(noteEditItem, noteEditText); setNoteEditItem(null); }} className="bg-teal-500 hover:bg-teal-400" data-testid="button-kiosk-save-note">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function WelcomeScreen({ onStart, tenantName }: { onStart: () => void; tenantName: string }) {
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex(prev => (prev + 1) % ATTRACTOR_SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const slide = ATTRACTOR_SLIDES[slideIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center p-8 relative"
      data-testid="kiosk-welcome"
      onClick={onStart}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={slideIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          className={`absolute inset-0 bg-gradient-to-br ${slide.gradient} opacity-20`}
        />
      </AnimatePresence>

      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        className="mb-8 z-10"
      >
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-2xl shadow-teal-500/30">
          <UtensilsCrossed className="h-16 w-16 text-white" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-5xl font-bold mb-4 text-center z-10"
        data-testid="text-restaurant-name"
      >
        {tenantName}
      </motion.h1>

      <AnimatePresence mode="wait">
        <motion.div
          key={slideIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="text-center mb-8 z-10"
        >
          <p className="text-2xl font-semibold text-teal-300">{slide.title}</p>
          <p className="text-lg text-slate-300 mt-1">{slide.subtitle}</p>
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-2 mb-8 z-10">
        {ATTRACTOR_SLIDES.map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === slideIndex ? "bg-teal-400 w-6" : "bg-white/30"}`} />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="z-10"
      >
        <Button
          data-testid="button-start-order"
          onClick={onStart}
          size="lg"
          className="text-2xl px-16 py-8 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 shadow-2xl shadow-teal-500/40 border-0 font-bold"
        >
          <Sparkles className="h-8 w-8 mr-3" />
          Tap to Order
        </Button>
      </motion.div>

      <motion.p
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="mt-8 text-slate-400 text-lg z-10"
      >
        Touch anywhere to begin
      </motion.p>
    </motion.div>
  );
}

function LanguageScreen({ onSelect, onBack }: { onSelect: (lang: KioskLanguage) => void; onBack: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="min-h-screen flex flex-col items-center justify-center p-8"
      data-testid="kiosk-language"
    >
      <Button variant="ghost" onClick={onBack} className="absolute top-6 left-6 text-white hover:bg-white/10 rounded-xl" data-testid="button-kiosk-lang-back">
        <ChevronLeft className="h-6 w-6 mr-1" /> Back
      </Button>

      <h2 className="text-3xl font-bold mb-4">Select Language</h2>
      <p className="text-lg text-slate-400 mb-12">اختر اللغة</p>

      <div className="flex gap-8">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Card
            data-testid="card-lang-en"
            className="w-56 h-56 cursor-pointer bg-white/5 border-white/10 hover:bg-white/10 transition-all"
            onClick={() => onSelect("en")}
          >
            <CardContent className="flex flex-col items-center justify-center h-full p-8">
              <span className="text-5xl mb-4">🇬🇧</span>
              <p className="text-2xl font-bold text-white">English</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Card
            data-testid="card-lang-ar"
            className="w-56 h-56 cursor-pointer bg-white/5 border-white/10 hover:bg-white/10 transition-all"
            onClick={() => onSelect("ar")}
          >
            <CardContent className="flex flex-col items-center justify-center h-full p-8">
              <span className="text-5xl mb-4">🇦🇪</span>
              <p className="text-2xl font-bold text-white">العربية</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

function TableNumberScreen({ tableNumber, onTableNumberChange, onContinue, onBack }: {
  tableNumber: string;
  onTableNumberChange: (v: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="min-h-screen flex flex-col items-center justify-center p-8"
      data-testid="kiosk-table-number"
    >
      <Button variant="ghost" onClick={onBack} className="absolute top-6 left-6 text-white hover:bg-white/10 rounded-xl" data-testid="button-kiosk-table-back">
        <ChevronLeft className="h-6 w-6 mr-1" /> Back
      </Button>

      <UtensilsCrossed className="h-16 w-16 text-teal-400 mb-6" />
      <h2 className="text-3xl font-bold mb-2">Enter Your Table Number</h2>
      <p className="text-lg text-slate-400 mb-8">Check the number on your table tent</p>

      <Input
        data-testid="input-table-number"
        value={tableNumber}
        onChange={e => onTableNumberChange(e.target.value)}
        placeholder="e.g. 5"
        className="w-48 text-center text-4xl py-6 bg-white/10 border-white/20 text-white placeholder:text-slate-400 rounded-xl mb-8"
        autoFocus
      />

      <div className="flex gap-4">
        <Button
          variant="outline"
          onClick={onContinue}
          className="px-8 py-4 text-white border-white/20 hover:bg-white/10 rounded-xl"
          data-testid="button-skip-table"
        >
          Skip
        </Button>
        <Button
          data-testid="button-confirm-table"
          onClick={onContinue}
          disabled={!tableNumber.trim()}
          className="px-12 py-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 rounded-xl font-bold text-lg"
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}

function ServiceTypeScreen({ onSelect, onBack }: { onSelect: (t: ServiceType) => void; onBack: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="min-h-screen flex flex-col items-center justify-center p-8"
      data-testid="kiosk-service-type"
    >
      <Button variant="ghost" onClick={onBack} className="absolute top-6 left-6 text-white hover:bg-white/10 rounded-xl" data-testid="button-kiosk-service-back">
        <ChevronLeft className="h-6 w-6 mr-1" /> Back
      </Button>

      <h2 className="text-3xl font-bold mb-12">How would you like your order?</h2>

      <div className="flex gap-8">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Card
            data-testid="card-service-dine-in"
            className="w-64 h-64 cursor-pointer bg-white/5 border-white/10 hover:bg-white/10 transition-all"
            onClick={() => onSelect("dine_in")}
          >
            <CardContent className="flex flex-col items-center justify-center h-full p-8">
              <UtensilsCrossed className="h-16 w-16 text-teal-400 mb-4" />
              <p className="text-2xl font-bold text-white">Dine In</p>
              <p className="text-sm text-slate-400 mt-2 text-center">Eat at the restaurant</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Card
            data-testid="card-service-takeaway"
            className="w-64 h-64 cursor-pointer bg-white/5 border-white/10 hover:bg-white/10 transition-all"
            onClick={() => onSelect("takeaway")}
          >
            <CardContent className="flex flex-col items-center justify-center h-full p-8">
              <Package className="h-16 w-16 text-amber-400 mb-4" />
              <p className="text-2xl font-bold text-white">Takeaway</p>
              <p className="text-sm text-slate-400 mt-2 text-center">Take your order to go</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

function UpsellInterstitialScreen({
  suggestions, fmt, onAddItem, onSkip, onViewCart,
}: {
  suggestions: any[];
  fmt: (val: number | string) => string;
  onAddItem: (item: any) => void;
  onSkip: () => void;
  onViewCart: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      className="min-h-screen flex flex-col items-center justify-center p-8"
      data-testid="kiosk-upsell"
    >
      <Sparkles className="h-12 w-12 text-yellow-400 mb-4" />
      <h2 className="text-3xl font-bold mb-2">Make It Even Better!</h2>
      <p className="text-lg text-slate-400 mb-8">Add these popular items to your order</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mb-10">
        {suggestions.map((s: any) => (
          <motion.div key={s.id} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Card
              data-testid={`card-upsell-interstitial-${s.suggestItem.id}`}
              className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30 cursor-pointer hover:border-amber-400 transition-all"
              onClick={() => { onAddItem(s.suggestItem); onViewCart(); }}
            >
              <CardContent className="p-6 text-center">
                {s.suggestItem.image ? (
                  <div className="h-24 w-24 mx-auto mb-3 rounded-lg overflow-hidden">
                    <img src={s.suggestItem.image} alt={s.suggestItem.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-24 w-24 mx-auto mb-3 rounded-lg bg-slate-700 flex items-center justify-center">
                    <UtensilsCrossed className="h-8 w-8 text-slate-400" />
                  </div>
                )}
                <h3 className="font-bold text-white text-lg">{s.suggestItem.name}</h3>
                <p className="text-sm text-amber-300 mt-1">{s.label}</p>
                <p className="text-lg font-bold text-white mt-2">{fmt(s.suggestItem.price)}</p>
                <Button className="mt-3 bg-amber-500 hover:bg-amber-400 w-full" data-testid={`button-upsell-add-${s.suggestItem.id}`}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Button
        data-testid="button-upsell-skip"
        variant="outline"
        onClick={onSkip}
        className="text-white border-white/20 hover:bg-white/10 px-12 py-4 rounded-xl text-lg"
      >
        No Thanks, Continue to Cart <ChevronRight className="h-5 w-5 ml-2" />
      </Button>
    </motion.div>
  );
}

function ItemDetailModal({
  item, fmt, cart, noteText, quantity, onNoteChange, onQuantityChange, onClose, onAddToCart,
}: {
  item: any;
  fmt: (val: number | string) => string;
  cart: KioskCartItem[];
  noteText: string;
  quantity: number;
  onNoteChange: (v: string) => void;
  onQuantityChange: (v: number) => void;
  onClose: () => void;
  onAddToCart: (item: any, notes: string, qty: number) => void;
}) {
  const totalInCart = cart.filter(c => c.menuItemId === item.id).reduce((s, c) => s + c.quantity, 0);
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-white/10 text-white max-w-lg" data-testid="dialog-item-detail">
        {item.image && (
          <div className="h-48 -mx-6 -mt-6 overflow-hidden rounded-t-lg">
            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
          </div>
        )}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {item.isVeg === true ? (
              <span className="h-5 w-5 shrink-0 border-2 border-green-500 rounded-sm flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              </span>
            ) : item.isVeg === false ? (
              <span className="h-5 w-5 shrink-0 border-2 border-red-500 rounded-sm flex items-center justify-center">
                <span className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[7px] border-l-transparent border-r-transparent border-b-red-500" />
              </span>
            ) : null}
            {item.name}
          </DialogTitle>
        </DialogHeader>
        {item.description && <p className="text-slate-300">{item.description}</p>}
        <p className="text-2xl font-bold text-teal-400">{fmt(item.price)}</p>

        {item.spicyLevel > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-sm text-slate-400">Spice Level:</span>
            {Array.from({ length: item.spicyLevel }).map((_, i) => (
              <span key={i} className="text-red-400">🌶️</span>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm text-slate-400">Quantity</label>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full text-white border-white/20"
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              data-testid="button-detail-qty-minus"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-2xl font-bold w-12 text-center" data-testid="text-detail-qty">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full text-white border-white/20"
              onClick={() => onQuantityChange(quantity + 1)}
              data-testid="button-detail-qty-plus"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-slate-400 flex items-center gap-1">
            <StickyNote className="h-3 w-3" /> Special instructions
          </label>
          <Textarea
            data-testid="textarea-item-note"
            value={noteText}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="e.g. No onions, extra spicy, well-done..."
            className="bg-white/10 border-white/20 text-white placeholder:text-slate-400"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 text-white border-white/20">Cancel</Button>
          <Button
            data-testid="button-add-from-detail"
            onClick={() => onAddToCart(item, noteText, quantity)}
            className="flex-[2] bg-teal-500 hover:bg-teal-400 font-bold"
          >
            <Plus className="h-4 w-4 mr-1" /> Add {quantity > 1 ? `${quantity} ` : ""}to Cart{totalInCart > 0 ? ` (${totalInCart} already)` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MenuScreen({
  categories, items, selectedCategory, searchQuery, cart, cartCount, subtotal,
  serviceType, upsellSuggestions, fmt, onSelectCategory, onSearchChange, onAddToCart,
  onUpdateQuantity, onRemoveFromCart, onViewCart, onBack, onItemDetail,
}: {
  categories: any[];
  items: any[];
  selectedCategory: string | null;
  searchQuery: string;
  cart: KioskCartItem[];
  cartCount: number;
  subtotal: number;
  serviceType: ServiceType;
  upsellSuggestions: any[];
  fmt: (val: number | string) => string;
  onSelectCategory: (id: string | null) => void;
  onSearchChange: (q: string) => void;
  onAddToCart: (item: any) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveFromCart: (id: string) => void;
  onViewCart: () => void;
  onBack: () => void;
  onItemDetail: (item: any) => void;
}) {
  const [addedItemId, setAddedItemId] = useState<string | null>(null);

  const handleAdd = (item: any) => {
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 500);
    onAddToCart(item);
  };

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -300, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="min-h-screen flex flex-col"
      data-testid="kiosk-menu"
    >
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-white/10 rounded-xl h-12 w-12" data-testid="button-kiosk-back">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Menu</h2>
          <p className="text-sm text-slate-400 flex items-center gap-1">
            {serviceType === "dine_in" ? <UtensilsCrossed className="h-3 w-3" /> : <Package className="h-3 w-3" />}
            {serviceType === "dine_in" ? "Dine In" : "Takeaway"}
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            data-testid="input-kiosk-search"
            placeholder="Search menu..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-slate-400 rounded-xl"
          />
        </div>
      </div>

      <div className="px-6 pb-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Button
            data-testid="button-kiosk-category-all"
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectCategory(null)}
            className={`rounded-xl whitespace-nowrap px-5 py-2 text-sm font-medium ${
              selectedCategory === null
                ? "bg-teal-500 hover:bg-teal-400 text-white border-0"
                : "bg-white/10 border-white/20 text-white hover:bg-white/20"
            }`}
          >
            All Items
          </Button>
          {categories.map((cat: any) => (
            <Button
              key={cat.id}
              data-testid={`button-kiosk-category-${cat.id}`}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              size="sm"
              onClick={() => onSelectCategory(cat.id)}
              className={`rounded-xl whitespace-nowrap px-5 py-2 text-sm font-medium ${
                selectedCategory === cat.id
                  ? "bg-teal-500 hover:bg-teal-400 text-white border-0"
                  : "bg-white/10 border-white/20 text-white hover:bg-white/20"
              }`}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-32">
        {upsellSuggestions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400" /> You might also like
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {upsellSuggestions.map((s: any) => (
                <Card
                  key={s.id}
                  className="min-w-[180px] bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/30 cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => handleAdd(s.suggestItem)}
                  data-testid={`card-upsell-${s.suggestItem.id}`}
                >
                  <CardContent className="p-4">
                    <p className="font-medium text-sm text-white">{s.suggestItem.name}</p>
                    <p className="text-xs text-yellow-300 mt-1">{s.label}</p>
                    <p className="text-sm font-bold text-white mt-2">{fmt(s.suggestItem.price)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <UtensilsCrossed className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg">No items found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item: any) => {
              const inCart = cart.find(c => c.menuItemId === item.id);
              const totalQty = cart.filter(c => c.menuItemId === item.id).reduce((s, c) => s + c.quantity, 0);
              const justAdded = addedItemId === item.id;
              return (
                <motion.div key={item.id} whileTap={{ scale: 0.95 }} layout>
                  <Card
                    data-testid={`card-kiosk-item-${item.id}`}
                    className={`cursor-pointer transition-all duration-200 overflow-hidden relative ${
                      inCart ? "ring-2 ring-teal-400 bg-slate-800/80" : "bg-slate-800/50 hover:bg-slate-700/50"
                    } border-white/10`}
                    onClick={() => handleAdd(item)}
                  >
                    <AnimatePresence>
                      {justAdded && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="absolute inset-0 z-10 flex items-center justify-center bg-teal-500/30 backdrop-blur-sm"
                        >
                          <CheckCircle className="h-10 w-10 text-teal-400" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 z-20 h-7 w-7 text-slate-400 hover:text-white hover:bg-white/20 rounded-full"
                      onClick={e => { e.stopPropagation(); onItemDetail(item); }}
                      data-testid={`button-item-detail-${item.id}`}
                    >
                      <Info className="h-4 w-4" />
                    </Button>

                    {item.image ? (
                      <div className="h-28 overflow-hidden bg-slate-700">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                    ) : (
                      <div className="h-28 bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center">
                        <UtensilsCrossed className="h-8 w-8 text-slate-400" />
                      </div>
                    )}

                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="font-semibold text-sm leading-tight line-clamp-2 text-white">{item.name}</h4>
                        {item.isVeg === true ? (
                          <span className="h-4 w-4 shrink-0 border-2 border-green-500 rounded-sm flex items-center justify-center ml-1">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                          </span>
                        ) : item.isVeg === false ? (
                          <span className="h-4 w-4 shrink-0 border-2 border-red-500 rounded-sm flex items-center justify-center ml-1">
                            <span className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-red-500" />
                          </span>
                        ) : null}
                      </div>
                      {item.description && <p className="text-xs text-slate-400 line-clamp-1 mb-2">{item.description}</p>}
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-teal-400" data-testid={`text-kiosk-price-${item.id}`}>{fmt(item.price)}</span>
                        {inCart && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-white hover:bg-white/20 rounded-full"
                              onClick={e => { e.stopPropagation(); onUpdateQuantity(inCart.cartLineId, -1); }}
                              data-testid={`button-kiosk-decrease-${item.id}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Badge className="bg-teal-500 text-white px-2" data-testid={`badge-kiosk-qty-${item.id}`}>{totalQty}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-white hover:bg-white/20 rounded-full"
                              onClick={e => { e.stopPropagation(); onUpdateQuantity(inCart.cartLineId, 1); }}
                              data-testid={`button-kiosk-increase-${item.id}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
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

      {cartCount > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent pt-12"
        >
          <Button
            data-testid="button-kiosk-view-cart"
            onClick={onViewCart}
            className="w-full py-6 text-lg rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 shadow-xl font-bold"
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            View Cart ({cartCount} items) — {fmt(subtotal)}
            <ChevronRight className="h-5 w-5 ml-2" />
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}

function CartScreen({
  cart, subtotal, serviceChargeAmount, taxAmount, total, serviceChargeRate, taxRate,
  serviceType, promoCode, loyaltyPhone, fmt, onPromoCodeChange, onLoyaltyPhoneChange, onUpdateQuantity, onRemoveFromCart, onEditNote, onBack, onCheckout,
}: {
  cart: KioskCartItem[];
  subtotal: number;
  serviceChargeAmount: number;
  taxAmount: number;
  total: number;
  serviceChargeRate: number;
  taxRate: number;
  serviceType: ServiceType;
  promoCode: string;
  loyaltyPhone: string;
  fmt: (val: number | string) => string;
  onPromoCodeChange: (v: string) => void;
  onLoyaltyPhoneChange: (v: string) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveFromCart: (id: string) => void;
  onEditNote: (id: string) => void;
  onBack: () => void;
  onCheckout: () => void;
}) {
  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -300, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="min-h-screen flex flex-col"
      data-testid="kiosk-cart"
    >
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-white/10 rounded-xl h-12 w-12" data-testid="button-kiosk-cart-back">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Your Order</h2>
          <p className="text-sm text-slate-400 flex items-center gap-1">
            {serviceType === "dine_in" ? <UtensilsCrossed className="h-3 w-3" /> : <Package className="h-3 w-3" />}
            {serviceType === "dine_in" ? "Dine In" : "Takeaway"}
          </p>
        </div>
        <ShoppingCart className="h-6 w-6 text-teal-400" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <ShoppingCart className="h-16 w-16 mb-4 opacity-50" />
            <p className="text-lg">Your cart is empty</p>
            <Button variant="outline" onClick={onBack} className="mt-4 text-white border-white/20" data-testid="button-kiosk-browse">
              Browse Menu
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {cart.map(item => (
                <motion.div
                  key={item.cartLineId}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40, height: 0 }}
                  className="bg-white/5 rounded-xl p-4 border border-white/10"
                  data-testid={`kiosk-cart-item-${item.cartLineId}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {item.isVeg === true ? (
                          <span className="h-4 w-4 shrink-0 border-2 border-green-500 rounded-sm flex items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                          </span>
                        ) : item.isVeg === false ? (
                          <span className="h-4 w-4 shrink-0 border-2 border-red-500 rounded-sm flex items-center justify-center">
                            <span className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-l-transparent border-r-transparent border-b-red-500" />
                          </span>
                        ) : null}
                        <h4 className="font-semibold text-white">{item.name}</h4>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">{fmt(item.price)} each</p>
                      {item.notes && (
                        <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                          <StickyNote className="h-3 w-3" /> {item.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => onUpdateQuantity(item.cartLineId, -1)}
                        data-testid={`button-kiosk-cart-decrease-${item.cartLineId}`}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="text-lg font-bold w-8 text-center" data-testid={`text-kiosk-cart-qty-${item.cartLineId}`}>{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => onUpdateQuantity(item.cartLineId, 1)}
                        data-testid={`button-kiosk-cart-increase-${item.cartLineId}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="text-right min-w-[80px]">
                      <p className="font-bold text-teal-400">{fmt(item.price * item.quantity)}</p>
                    </div>

                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-amber-400 hover:bg-amber-500/20 rounded-full"
                        onClick={() => onEditNote(item.cartLineId)}
                        data-testid={`button-kiosk-cart-note-${item.cartLineId}`}
                      >
                        <StickyNote className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-full"
                        onClick={() => onRemoveFromCart(item.cartLineId)}
                        data-testid={`button-kiosk-cart-remove-${item.cartLineId}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="px-6 pb-6">
          <div className="space-y-3 mb-4">
            <div className="flex gap-2">
              <Input
                data-testid="input-promo-code"
                placeholder="Have a promo code?"
                value={promoCode}
                onChange={e => onPromoCodeChange(e.target.value.toUpperCase())}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-400 rounded-xl"
              />
              <Button
                data-testid="button-apply-promo"
                variant="outline"
                className="text-white border-white/20 hover:bg-white/10 rounded-xl whitespace-nowrap"
                disabled={!promoCode.trim()}
              >
                Apply
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                data-testid="input-loyalty-phone"
                placeholder="Loyalty member? Enter phone number"
                value={loyaltyPhone}
                onChange={e => onLoyaltyPhoneChange(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-400 rounded-xl"
                type="tel"
              />
              <Button
                data-testid="button-lookup-loyalty"
                variant="outline"
                className="text-white border-white/20 hover:bg-white/10 rounded-xl whitespace-nowrap"
                disabled={!loyaltyPhone.trim()}
              >
                Look Up
              </Button>
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-5 border border-white/10 space-y-3 mb-4">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal</span>
              <span data-testid="text-kiosk-subtotal">{fmt(subtotal)}</span>
            </div>
            {serviceChargeRate > 0 && (
              <div className="flex justify-between text-slate-300">
                <span>Service Charge ({(serviceChargeRate * 100).toFixed(1)}%)</span>
                <span>{fmt(serviceChargeAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-slate-300">
                <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
                <span>{fmt(taxAmount)}</span>
              </div>
            )}
            <div className="border-t border-white/10 pt-3 flex justify-between text-xl font-bold">
              <span>Total</span>
              <span className="text-teal-400" data-testid="text-kiosk-total">{fmt(total)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onBack}
              className="flex-1 py-5 rounded-xl text-white border-white/20 hover:bg-white/10 text-lg"
              data-testid="button-kiosk-add-more"
            >
              <Plus className="h-5 w-5 mr-2" /> Add More
            </Button>
            <Button
              onClick={onCheckout}
              className="flex-[2] py-5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-lg font-bold"
              data-testid="button-kiosk-checkout"
            >
              Checkout <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function PaymentScreen({
  total, paymentMethod, isPlacing, fmt, onSelectMethod, onBack, onConfirm, activeGateway,
}: {
  total: number;
  paymentMethod: string;
  isPlacing: boolean;
  fmt: (val: number | string) => string;
  onSelectMethod: (m: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  activeGateway: "stripe" | "razorpay" | "both";
}) {
  const stripeAvailable = activeGateway === "stripe" || activeGateway === "both";
  const razorpayAvailable = activeGateway === "razorpay" || activeGateway === "both";

  const cardDesc = stripeAvailable && razorpayAvailable
    ? "Card / UPI (gateway auto-selected)"
    : stripeAvailable
      ? "Tap or insert card (Stripe)"
      : "Card / UPI via Razorpay";

  const upiDesc = razorpayAvailable ? "Scan QR code via Razorpay" : "Scan QR code to pay";

  const methods = [
    { id: "card", label: "Card", icon: CreditCard, desc: cardDesc, enabled: stripeAvailable || razorpayAvailable },
    { id: "upi", label: "UPI / QR", icon: Smartphone, desc: upiDesc, enabled: razorpayAvailable },
    { id: "wallet", label: "Digital Wallet", icon: Wallet, desc: "Apple Pay, Google Pay", enabled: stripeAvailable },
    { id: "counter", label: "Pay at Counter", icon: Store, desc: "Pay when collecting", enabled: true },
  ].filter(m => m.enabled);

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -300, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="min-h-screen flex flex-col"
      data-testid="kiosk-payment"
    >
      <div className="px-6 pt-6 pb-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-white/10 rounded-xl h-12 w-12" data-testid="button-kiosk-payment-back">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h2 className="text-2xl font-bold flex-1">Payment</h2>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-center mb-10">
          <p className="text-slate-400 text-lg mb-2">Total Amount</p>
          <p className="text-5xl font-bold text-teal-400" data-testid="text-kiosk-payment-total">{fmt(total)}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full max-w-lg mb-10">
          {methods.map(m => (
            <Card
              key={m.id}
              data-testid={`card-payment-${m.id}`}
              className={`cursor-pointer transition-all duration-200 ${
                paymentMethod === m.id
                  ? "ring-2 ring-teal-400 bg-teal-500/20 border-teal-400"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
              onClick={() => onSelectMethod(m.id)}
            >
              <CardContent className="p-6 text-center">
                <m.icon className={`h-10 w-10 mx-auto mb-3 ${paymentMethod === m.id ? "text-teal-400" : "text-slate-400"}`} />
                <p className="font-semibold text-white">{m.label}</p>
                <p className="text-xs text-slate-400 mt-1">{m.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button
          data-testid="button-kiosk-confirm-payment"
          onClick={onConfirm}
          disabled={isPlacing}
          className="w-full max-w-lg py-6 text-xl rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 shadow-xl font-bold disabled:opacity-50"
        >
          {isPlacing ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
              <Clock className="h-6 w-6" />
            </motion.div>
          ) : (
            <>
              <CheckCircle className="h-6 w-6 mr-2" /> Confirm & Pay
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}

function ConfirmationScreen({
  orderResult, serviceType, fmt, onNewOrder, kioskToken,
}: {
  orderResult: any;
  serviceType: ServiceType;
  fmt: (val: number | string) => string;
  onNewOrder: () => void;
  kioskToken: string;
}) {
  const [pollStatus, setPollStatus] = useState<"pending" | "paid" | "cancelled">("pending");

  useEffect(() => {
    if (!orderResult?.razorpayUrl || !orderResult?.linkId || !orderResult?.orderId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/kiosk/razorpay-payment-status/${orderResult.orderId}?linkId=${encodeURIComponent(orderResult.linkId)}`,
          { headers: { "x-kiosk-token": kioskToken } }
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setPollStatus(data.status === "paid" ? "paid" : data.status === "cancelled" ? "cancelled" : "pending");
        }
      } catch { }
    };

    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [orderResult?.razorpayUrl, orderResult?.linkId, orderResult?.orderId, kioskToken]);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center px-6"
      data-testid="kiosk-confirmation"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1] }}
        transition={{ duration: 0.6 }}
        className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center mb-8 shadow-2xl shadow-teal-500/40"
      >
        <CheckCircle className="h-16 w-16 text-white" />
      </motion.div>

      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-4xl font-bold mb-4"
      >
        {orderResult?.queued ? "Order Saved!" : "Order Confirmed!"}
      </motion.h1>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-white/10 rounded-2xl p-8 text-center mb-8 border border-white/10"
      >
        <p className="text-slate-300 mb-2">{orderResult?.queued ? "Order Queued" : "Your Token Number"}</p>
        <p className="text-6xl font-bold text-teal-400 font-mono" data-testid="text-kiosk-token-number">
          {orderResult?.queued ? "⏳" : (orderResult?.tokenNumber || orderResult?.orderNumber || "---")}
        </p>
        <p className="text-slate-400 mt-4 text-sm">
          {orderResult?.queued
            ? "Your order has been saved and will be sent when connectivity is restored."
            : orderResult?.razorpayUrl
              ? "Scan the QR code or use the link below to complete your payment."
              : serviceType === "dine_in"
                ? "Please take a seat. Your order will be served to you."
                : "Please wait at the counter for your order."}
        </p>
        {orderResult?.total && (
          <p className="text-lg text-white mt-4">Total: {fmt(orderResult.total)}</p>
        )}
        {orderResult?.razorpayUrl && (
          <div className="mt-6 space-y-3">
            {pollStatus === "paid" ? (
              <div data-testid="status-razorpay-paid" className="flex items-center gap-2 justify-center text-green-400 font-semibold">
                <CheckCircle className="h-5 w-5" /> Payment received!
              </div>
            ) : pollStatus === "cancelled" ? (
              <div data-testid="status-razorpay-cancelled" className="text-red-400 font-semibold">Payment link expired or cancelled.</div>
            ) : (
              <>
                <a
                  href={orderResult.razorpayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-razorpay-payment"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Pay via Razorpay
                </a>
                <p className="text-xs text-slate-400 break-all">{orderResult.razorpayUrl}</p>
                <p data-testid="status-razorpay-pending" className="text-xs text-slate-500 animate-pulse">Waiting for payment confirmation...</p>
              </>
            )}
          </div>
        )}
      </motion.div>

      <motion.p
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="text-slate-400 mb-6"
      >
        This screen will reset automatically...
      </motion.p>

      <Button
        data-testid="button-kiosk-new-order"
        onClick={onNewOrder}
        variant="outline"
        className="text-white border-white/20 hover:bg-white/10 px-8 py-4 rounded-xl text-lg"
      >
        Start New Order
      </Button>
    </motion.div>
  );
}
