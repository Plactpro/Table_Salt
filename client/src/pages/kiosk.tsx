import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, UtensilsCrossed, ChevronLeft,
  ChevronRight, CreditCard, Wallet, Smartphone, Store, Leaf, CheckCircle,
  Clock, X, Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";

type KioskStep = "welcome" | "menu" | "cart" | "payment" | "confirmation";

interface KioskCartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean | null;
  categoryId: string | null;
  image?: string | null;
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

export default function KioskPage() {
  const [step, setStep] = useState<KioskStep>("welcome");
  const [cart, setCart] = useState<KioskCartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("card");
  const [orderResult, setOrderResult] = useState<any>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = getKioskToken();

  const { data: menuData } = useQuery({
    queryKey: ["kiosk-menu", token],
    queryFn: async () => {
      const res = await kioskFetch("/api/kiosk/menu");
      if (!res.ok) throw new Error("Failed to load menu");
      return res.json();
    },
    enabled: !!token,
    staleTime: 60000,
  });

  const { data: tenantInfo } = useQuery<TenantInfo>({
    queryKey: ["kiosk-tenant", token],
    queryFn: async () => {
      const res = await kioskFetch("/api/kiosk/tenant-info");
      if (!res.ok) throw new Error("Failed to load tenant info");
      return res.json();
    },
    enabled: !!token,
    staleTime: 60000,
  });

  const { data: upsellRules = [] } = useQuery({
    queryKey: ["kiosk-upsells", token],
    queryFn: async () => {
      const res = await kioskFetch("/api/kiosk/upsells");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
    staleTime: 60000,
  });

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

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (step !== "welcome" && step !== "confirmation") {
      idleTimerRef.current = setTimeout(() => {
        setStep("welcome");
        setCart([]);
        setSelectedCategory(null);
        setSearchQuery("");
        setOrderResult(null);
      }, 120000);
    }
  }, [step]);

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

  const addToCart = useCallback((item: any) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id);
      if (existing) {
        return prev.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        menuItemId: item.id,
        name: item.name,
        price: parseFloat(item.price),
        quantity: 1,
        isVeg: item.isVeg,
        categoryId: item.categoryId,
        image: item.image,
      }];
    });
  }, []);

  const updateQuantity = useCallback((menuItemId: string, delta: number) => {
    setCart(prev => prev.map(c => c.menuItemId === menuItemId ? { ...c, quantity: c.quantity + delta } : c).filter(c => c.quantity > 0));
  }, []);

  const removeFromCart = useCallback((menuItemId: string) => {
    setCart(prev => prev.filter(c => c.menuItemId !== menuItemId));
  }, []);

  const placeOrder = useCallback(async () => {
    setIsPlacingOrder(true);
    try {
      const res = await kioskFetch("/api/kiosk/order", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
          paymentMethod,
        }),
      });
      if (!res.ok) throw new Error("Failed to place order");
      const result = await res.json();
      setOrderResult(result);
      setStep("confirmation");
      setCart([]);
      setTimeout(() => {
        setStep("welcome");
        setOrderResult(null);
      }, 15000);
    } catch (err) {
      console.error("Order failed", err);
    } finally {
      setIsPlacingOrder(false);
    }
  }, [cart, paymentMethod]);

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
      <AnimatePresence mode="wait">
        {step === "welcome" && (
          <WelcomeScreen key="welcome" onStart={() => setStep("menu")} tenantName={tenantInfo?.name || "Restaurant"} />
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
            upsellSuggestions={upsellSuggestions}
            fmt={fmt}
            onSelectCategory={setSelectedCategory}
            onSearchChange={setSearchQuery}
            onAddToCart={addToCart}
            onUpdateQuantity={updateQuantity}
            onRemoveFromCart={removeFromCart}
            onViewCart={() => setStep("cart")}
            onBack={() => { setStep("welcome"); setCart([]); setSearchQuery(""); setSelectedCategory(null); }}
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
            fmt={fmt}
            onUpdateQuantity={updateQuantity}
            onRemoveFromCart={removeFromCart}
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
          />
        )}
        {step === "confirmation" && (
          <ConfirmationScreen
            key="confirmation"
            orderResult={orderResult}
            fmt={fmt}
            onNewOrder={() => { setStep("welcome"); setOrderResult(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function WelcomeScreen({ onStart, tenantName }: { onStart: () => void; tenantName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center p-8"
      data-testid="kiosk-welcome"
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        className="mb-8"
      >
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-2xl shadow-teal-500/30">
          <UtensilsCrossed className="h-16 w-16 text-white" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-5xl font-bold mb-4 text-center"
        data-testid="text-restaurant-name"
      >
        {tenantName}
      </motion.h1>

      <motion.p
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-xl text-slate-300 mb-12 text-center"
      >
        Self-Ordering Kiosk
      </motion.p>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6 }}
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
        className="mt-8 text-slate-400 text-lg"
      >
        Touch screen to begin
      </motion.p>
    </motion.div>
  );
}

function MenuScreen({
  categories, items, selectedCategory, searchQuery, cart, cartCount, subtotal,
  upsellSuggestions, fmt, onSelectCategory, onSearchChange, onAddToCart,
  onUpdateQuantity, onRemoveFromCart, onViewCart, onBack,
}: {
  categories: any[];
  items: any[];
  selectedCategory: string | null;
  searchQuery: string;
  cart: KioskCartItem[];
  cartCount: number;
  subtotal: number;
  upsellSuggestions: any[];
  fmt: (val: number | string) => string;
  onSelectCategory: (id: string | null) => void;
  onSearchChange: (q: string) => void;
  onAddToCart: (item: any) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveFromCart: (id: string) => void;
  onViewCart: () => void;
  onBack: () => void;
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
        <h2 className="text-2xl font-bold flex-1">Menu</h2>
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
              const justAdded = addedItemId === item.id;
              return (
                <motion.div
                  key={item.id}
                  whileTap={{ scale: 0.95 }}
                  layout
                >
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
                        {item.isVeg && <Leaf className="h-4 w-4 text-green-400 shrink-0 ml-1" />}
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
                              onClick={e => { e.stopPropagation(); onUpdateQuantity(item.id, -1); }}
                              data-testid={`button-kiosk-decrease-${item.id}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Badge className="bg-teal-500 text-white px-2" data-testid={`badge-kiosk-qty-${item.id}`}>{inCart.quantity}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-white hover:bg-white/20 rounded-full"
                              onClick={e => { e.stopPropagation(); onUpdateQuantity(item.id, 1); }}
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
  fmt, onUpdateQuantity, onRemoveFromCart, onBack, onCheckout,
}: {
  cart: KioskCartItem[];
  subtotal: number;
  serviceChargeAmount: number;
  taxAmount: number;
  total: number;
  serviceChargeRate: number;
  taxRate: number;
  fmt: (val: number | string) => string;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveFromCart: (id: string) => void;
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
        <h2 className="text-2xl font-bold flex-1">Your Order</h2>
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
                  key={item.menuItemId}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40, height: 0 }}
                  className="bg-white/5 rounded-xl p-4 border border-white/10"
                  data-testid={`kiosk-cart-item-${item.menuItemId}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {item.isVeg && <Leaf className="h-4 w-4 text-green-400" />}
                        <h4 className="font-semibold text-white">{item.name}</h4>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">{fmt(item.price)} each</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => onUpdateQuantity(item.menuItemId, -1)}
                        data-testid={`button-kiosk-cart-decrease-${item.menuItemId}`}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="text-lg font-bold w-8 text-center" data-testid={`text-kiosk-cart-qty-${item.menuItemId}`}>{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => onUpdateQuantity(item.menuItemId, 1)}
                        data-testid={`button-kiosk-cart-increase-${item.menuItemId}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="text-right min-w-[80px]">
                      <p className="font-bold text-teal-400">{fmt(item.price * item.quantity)}</p>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-full"
                      onClick={() => onRemoveFromCart(item.menuItemId)}
                      data-testid={`button-kiosk-cart-remove-${item.menuItemId}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="px-6 pb-6">
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
  total, paymentMethod, isPlacing, fmt, onSelectMethod, onBack, onConfirm,
}: {
  total: number;
  paymentMethod: string;
  isPlacing: boolean;
  fmt: (val: number | string) => string;
  onSelectMethod: (m: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const methods = [
    { id: "card", label: "Card", icon: CreditCard, desc: "Tap or insert card" },
    { id: "upi", label: "UPI / QR", icon: Smartphone, desc: "Scan QR code to pay" },
    { id: "wallet", label: "Digital Wallet", icon: Wallet, desc: "Apple Pay, Google Pay" },
    { id: "counter", label: "Pay at Counter", icon: Store, desc: "Pay when collecting" },
  ];

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
  orderResult, fmt, onNewOrder,
}: {
  orderResult: any;
  fmt: (val: number | string) => string;
  onNewOrder: () => void;
}) {
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
        Order Confirmed!
      </motion.h1>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-white/10 rounded-2xl p-8 text-center mb-8 border border-white/10"
      >
        <p className="text-slate-300 mb-2">Your Token Number</p>
        <p className="text-6xl font-bold text-teal-400 font-mono" data-testid="text-kiosk-token-number">
          {orderResult?.tokenNumber || orderResult?.orderNumber || "---"}
        </p>
        <p className="text-slate-400 mt-4 text-sm">Please remember this number to collect your order</p>
        {orderResult?.total && (
          <p className="text-lg text-white mt-4">Total: {fmt(orderResult.total)}</p>
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
