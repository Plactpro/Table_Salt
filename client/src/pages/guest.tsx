import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "wouter";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Minus, ShoppingCart, UtensilsCrossed, Leaf,
  Bell, Receipt, ChevronLeft, X, StickyNote, CheckCircle2,
  Users, Utensils, Clock, ChefHat, Send, Loader2, AlertCircle,
  CreditCard, Banknote, Smartphone, Coffee, Beef, IceCream,
  Wine, Soup, Pizza, Salad, Sandwich,
} from "lucide-react";

type GuestStep = "menu" | "item-detail" | "cart" | "bill" | "bill-split" | "payment-confirm" | "order-placed";

interface TenantInfo {
  name: string;
  currency: string;
  currencyPosition: string;
  currencyDecimals: number;
  taxRate: string;
  serviceCharge: string;
  taxType: string;
  compoundTax: boolean;
}

interface TableInfo {
  id: string;
  number: number;
  zone: string | null;
  capacity: number | null;
}

interface OutletInfo {
  id: string;
  name: string;
}

interface SessionInfo {
  id: string;
  tenantId: string;
  outletId: string | null;
  tableId: string;
  token: string;
  status: string | null;
  guestCount: number | null;
}

interface CategoryData {
  id: string;
  name: string;
  sortOrder: number | null;
}

interface MenuItemData {
  id: string;
  name: string;
  description: string | null;
  price: string;
  categoryId: string | null;
  image: string | null;
  isVeg: boolean | null;
  spicyLevel: number | null;
  available: boolean | null;
}

interface CartItemData {
  id: string;
  sessionId: string;
  menuItemId: string;
  name: string;
  price: string;
  quantity: number;
  notes: string | null;
  guestLabel: string | null;
}

interface BillData {
  items: any[];
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  restaurantName: string;
  tableNumber: number;
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

export default function GuestPage() {
  const params = useParams<{ outletId: string; tableToken: string }>();
  const outletId = params?.outletId || "";
  const tableToken = params?.tableToken || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<GuestStep>("menu");

  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [table, setTable] = useState<TableInfo | null>(null);
  const [outlet, setOutlet] = useState<OutletInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemData[]>([]);
  const [cart, setCart] = useState<CartItemData[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [guestLabel, setGuestLabel] = useState("Guest 1");

  const [bill, setBill] = useState<BillData | null>(null);
  const [orderPlacedData, setOrderPlacedData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [callingServer, setCallingServer] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);

  const [splitMode, setSplitMode] = useState<"equal" | "by-item">("equal");
  const [splitCount, setSplitCount] = useState(2);
  const [selectedSplitItems, setSelectedSplitItems] = useState<Set<number>>(new Set());
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const fmt = useCallback((val: number | string) => {
    if (!tenant) return String(val);
    return sharedFormatCurrency(val, tenant.currency, {
      position: tenant.currencyPosition as "before" | "after",
      decimals: tenant.currencyDecimals,
    });
  }, [tenant]);

  useEffect(() => {
    if (!outletId || !tableToken) {
      setError("Invalid QR code link");
      setLoading(false);
      return;
    }
    fetch(`/api/guest/${outletId}/${tableToken}`)
      .then(r => {
        if (!r.ok) throw new Error("Table not found");
        return r.json();
      })
      .then(data => {
        setTenant(data.tenant);
        setTable(data.table);
        setOutlet(data.outlet);
        setSession(data.session);
        setCategories(data.categories);
        setMenuItems(data.items);
        setCart(data.cart || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [outletId, tableToken]);

  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (selectedCategory) items = items.filter(i => i.categoryId === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    return items;
  }, [menuItems, selectedCategory, searchQuery]);

  const cartTotal = useMemo(() => cart.reduce((s, ci) => s + Number(ci.price) * ci.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, ci) => s + ci.quantity, 0), [cart]);

  const addToCart = useCallback(async (item: MenuItemData, qty: number, notes: string) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/guest/session/${session.id}/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: item.id,
          quantity: qty,
          notes: notes || null,
          guestLabel,
        }),
      });
      if (!res.ok) throw new Error("Failed to add item");
      const newItem = await res.json();
      setCart(prev => [...prev, newItem]);
      setAddedItemId(item.id);
      setTimeout(() => setAddedItemId(null), 800);
    } catch (err) {
      console.error(err);
    }
  }, [session]);

  const removeCartItem = useCallback(async (itemId: string) => {
    if (!session) return;
    try {
      await fetch(`/api/guest/cart/${itemId}?sessionId=${session.id}`, { method: "DELETE" });
      setCart(prev => prev.filter(ci => ci.id !== itemId));
    } catch (err) { console.error(err); }
  }, [session]);

  const updateCartItemQty = useCallback(async (itemId: string, newQty: number) => {
    if (!session) return;
    if (newQty <= 0) {
      removeCartItem(itemId);
      return;
    }
    try {
      const res = await fetch(`/api/guest/cart/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty, sessionId: session.id }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setCart(prev => prev.map(ci => ci.id === itemId ? { ...ci, quantity: updated.quantity } : ci));
    } catch (err) { console.error(err); }
  }, [session, removeCartItem]);

  const placeOrder = useCallback(async () => {
    if (!session || cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/guest/session/${session.id}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to place order");
      const data = await res.json();
      setOrderPlacedData(data);
      setCart([]);
      setStep("order-placed");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }, [session, cart]);

  const callServer = useCallback(async () => {
    if (!session) return;
    setCallingServer(true);
    try {
      await fetch(`/api/guest/session/${session.id}/call-server`, { method: "POST" });
      setTimeout(() => setCallingServer(false), 3000);
    } catch { setCallingServer(false); }
  }, [session]);

  const requestBill = useCallback(async (navigateTo?: GuestStep) => {
    if (!session) return;
    setRequestingBill(true);
    try {
      await fetch(`/api/guest/session/${session.id}/request-bill`, { method: "POST" });
      const res = await fetch(`/api/guest/session/${session.id}/bill`);
      if (res.ok) {
        const data = await res.json();
        setBill(data);
        setStep(navigateTo || "bill");
      }
    } catch (err) { console.error(err); }
    finally { setRequestingBill(false); }
  }, [session]);

  const viewBill = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/guest/session/${session.id}/bill`);
      if (res.ok) {
        const data = await res.json();
        setBill(data);
        setStep("bill");
      }
    } catch (err) { console.error(err); }
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50" data-testid="guest-loading">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-teal-600 mx-auto" />
          <p className="text-teal-800 font-medium">Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-6" data-testid="guest-error">
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-red-800">Oops!</h2>
          <p className="text-red-600">{error}</p>
          <p className="text-sm text-gray-500">Please scan the QR code again or ask your server for help.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto relative" data-testid="guest-page">
      <header className="bg-white border-b sticky top-0 z-30 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step !== "menu" && (
              <button onClick={() => setStep("menu")} className="p-1.5 rounded-full hover:bg-gray-100" data-testid="button-back-menu">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <h1 className="font-bold text-lg leading-tight" data-testid="text-restaurant-name">{tenant?.name}</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{outlet?.name} · Table {table?.number} {table?.zone ? `(${table.zone})` : ""}</span>
                <select
                  value={guestLabel}
                  onChange={e => setGuestLabel(e.target.value)}
                  className="bg-teal-50 text-teal-700 rounded px-1.5 py-0.5 text-xs font-medium border-0 outline-none cursor-pointer"
                  data-testid="select-guest-label"
                >
                  {[1,2,3,4,5,6].map(n => (
                    <option key={n} value={`Guest ${n}`}>Guest {n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={callServer}
              disabled={callingServer}
              className={`p-2 rounded-full transition-colors ${callingServer ? "bg-amber-100 text-amber-600" : "hover:bg-gray-100 text-gray-600"}`}
              data-testid="button-call-server"
            >
              <Bell className={`h-5 w-5 ${callingServer ? "animate-bounce" : ""}`} />
            </button>
            <button onClick={viewBill} className="p-2 rounded-full hover:bg-gray-100 text-gray-600" data-testid="button-view-bill">
              <Receipt className="h-5 w-5" />
            </button>
          </div>
        </div>
        {callingServer && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm text-amber-700 text-center">
            Server has been notified! They'll be with you shortly.
          </motion.div>
        )}
      </header>

      <AnimatePresence mode="wait">
        {step === "menu" && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
            <div className="bg-white border-b px-4 py-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search menu..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  data-testid="input-search-guest-menu"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${!selectedCategory ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-700"}`}
                  data-testid="button-guest-category-all"
                >
                  <UtensilsCrossed className="h-3.5 w-3.5" /> All
                </button>
                {categories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map(cat => {
                  const CatIcon = getCategoryIcon(cat.name);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${selectedCategory === cat.id ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-700"}`}
                      data-testid={`button-guest-category-${cat.id}`}
                    >
                      <CatIcon className="h-3.5 w-3.5" /> {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pb-24">
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <UtensilsCrossed className="h-12 w-12 mb-3" />
                  <p className="font-medium">No items found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredItems.map(item => {
                    const justAdded = addedItemId === item.id;
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl border shadow-sm overflow-hidden"
                        data-testid={`card-guest-item-${item.id}`}
                      >
                        <div
                          className="flex cursor-pointer"
                          onClick={() => {
                            setSelectedItem(item);
                            setItemQuantity(1);
                            setItemNotes("");
                            setStep("item-detail");
                          }}
                        >
                          {item.image ? (
                            <div className="w-24 h-24 shrink-0 bg-gray-100">
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            </div>
                          ) : (
                            <div className="w-24 h-24 shrink-0 bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center">
                              <UtensilsCrossed className="h-8 w-8 text-teal-300" />
                            </div>
                          )}
                          <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                            <div>
                              <div className="flex items-center gap-1">
                                <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                                {item.isVeg && <Leaf className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                              </div>
                              {item.description && <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{item.description}</p>}
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="font-bold text-teal-700" data-testid={`text-guest-price-${item.id}`}>{fmt(item.price)}</span>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  addToCart(item, 1, "");
                                }}
                                className="bg-teal-600 text-white rounded-full p-1.5 hover:bg-teal-700 transition-transform active:scale-90"
                                data-testid={`button-guest-add-${item.id}`}
                              >
                                {justAdded ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {step === "item-detail" && selectedItem && (
          <motion.div key="item-detail" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col bg-white">
            <div className="relative">
              {selectedItem.image ? (
                <div className="h-56 bg-gray-100">
                  <img src={selectedItem.image} alt={selectedItem.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-56 bg-gradient-to-br from-teal-50 to-emerald-100 flex items-center justify-center">
                  <UtensilsCrossed className="h-16 w-16 text-teal-300" />
                </div>
              )}
              <button
                onClick={() => setStep("menu")}
                className="absolute top-4 left-4 bg-white/90 backdrop-blur rounded-full p-2 shadow"
                data-testid="button-close-item-detail"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 p-5 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">{selectedItem.name}</h2>
                  {selectedItem.isVeg && <Leaf className="h-5 w-5 text-green-600" />}
                </div>
                {selectedItem.description && <p className="text-gray-500 text-sm mt-1">{selectedItem.description}</p>}
                <p className="text-2xl font-bold text-teal-700 mt-3" data-testid="text-item-detail-price">{fmt(selectedItem.price)}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  <StickyNote className="h-4 w-4 inline mr-1" /> Special Instructions
                </label>
                <textarea
                  value={itemNotes}
                  onChange={e => setItemNotes(e.target.value)}
                  placeholder="e.g., No onions, extra spicy..."
                  className="w-full border rounded-lg p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  data-testid="input-item-notes"
                />
              </div>

              <div className="flex items-center justify-center gap-6 py-3">
                <button
                  onClick={() => setItemQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-full border-2 border-teal-600 text-teal-600 flex items-center justify-center hover:bg-teal-50 active:scale-90 transition-transform"
                  data-testid="button-item-qty-minus"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span className="text-2xl font-bold w-10 text-center" data-testid="text-item-qty">{itemQuantity}</span>
                <button
                  onClick={() => setItemQuantity(q => q + 1)}
                  className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center hover:bg-teal-700 active:scale-90 transition-transform"
                  data-testid="button-item-qty-plus"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-4 border-t bg-white">
              <button
                onClick={() => {
                  addToCart(selectedItem, itemQuantity, itemNotes);
                  setStep("menu");
                }}
                className="w-full bg-teal-600 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-teal-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                data-testid="button-add-to-cart-confirm"
              >
                <Plus className="h-5 w-5" /> Add to Cart · {fmt(Number(selectedItem.price) * itemQuantity)}
              </button>
            </div>
          </motion.div>
        )}

        {step === "cart" && (
          <motion.div key="cart" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 pb-32">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-teal-600" /> Your Order
              </h2>

              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <ShoppingCart className="h-12 w-12 mb-3" />
                  <p className="font-medium">Your cart is empty</p>
                  <p className="text-sm mt-1">Add items from the menu to get started</p>
                  <button onClick={() => setStep("menu")} className="mt-4 text-teal-600 font-medium text-sm" data-testid="button-browse-menu">
                    Browse Menu
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(ci => (
                    <div key={ci.id} className="bg-white rounded-xl border p-3 shadow-sm" data-testid={`guest-cart-item-${ci.id}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm">{ci.name}</p>
                            {ci.guestLabel && ci.guestLabel !== "Guest 1" && (
                              <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">{ci.guestLabel}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{fmt(ci.price)} each</p>
                          {ci.notes && <p className="text-xs text-teal-600 mt-0.5 italic">{ci.notes}</p>}
                        </div>
                        <p className="font-bold text-sm" data-testid={`text-cart-line-total-${ci.id}`}>{fmt(Number(ci.price) * ci.quantity)}</p>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateCartItemQty(ci.id, ci.quantity - 1)}
                            className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-50"
                            data-testid={`button-cart-minus-${ci.id}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="font-medium text-sm w-6 text-center">{ci.quantity}</span>
                          <button
                            onClick={() => updateCartItemQty(ci.id, ci.quantity + 1)}
                            className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-50"
                            data-testid={`button-cart-plus-${ci.id}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeCartItem(ci.id)}
                          className="text-red-500 text-xs font-medium hover:text-red-600"
                          data-testid={`button-cart-remove-${ci.id}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="bg-white rounded-xl border p-4 mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-medium" data-testid="text-cart-subtotal">{fmt(cartTotal)}</span>
                    </div>
                    {tenant && Number(tenant.taxRate) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Tax ({tenant.taxRate}%)</span>
                        <span className="font-medium">{fmt(cartTotal * Number(tenant.taxRate) / 100)}</span>
                      </div>
                    )}
                    {tenant && Number(tenant.serviceCharge) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Service ({tenant.serviceCharge}%)</span>
                        <span className="font-medium">{fmt(cartTotal * Number(tenant.serviceCharge) / 100)}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold">
                      <span>Estimated Total</span>
                      <span className="text-teal-700" data-testid="text-cart-total">
                        {fmt(cartTotal * (1 + Number(tenant?.taxRate || 0) / 100 + Number(tenant?.serviceCharge || 0) / 100))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t max-w-lg mx-auto">
                <button
                  onClick={placeOrder}
                  disabled={submitting}
                  className="w-full bg-teal-600 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-teal-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  data-testid="button-place-order"
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  {submitting ? "Placing Order..." : "Place Order"}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === "bill" && bill && (
          <motion.div key="bill" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex-1 p-4 pb-24">
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-teal-600 text-white p-4 text-center">
                <Receipt className="h-8 w-8 mx-auto mb-2" />
                <h2 className="text-lg font-bold">{bill.restaurantName}</h2>
                <p className="text-teal-100 text-sm">Table {bill.tableNumber}</p>
              </div>

              <div className="p-4 space-y-3">
                {bill.items.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No items ordered yet</p>
                ) : (
                  <>
                    {bill.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm border-b pb-2" data-testid={`bill-item-${idx}`}>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-gray-500 text-xs">x{item.quantity}</p>
                        </div>
                        <p className="font-medium">{fmt(Number(item.price) * (item.quantity || 1))}</p>
                      </div>
                    ))}
                  </>
                )}

                <div className="pt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span>{fmt(bill.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tax</span>
                    <span>{fmt(bill.tax)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-teal-700" data-testid="text-bill-total">{fmt(bill.total)}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t space-y-2">
                <button
                  onClick={() => {
                    setPaymentConfirmed(false);
                    requestBill("payment-confirm");
                  }}
                  disabled={requestingBill}
                  className="w-full bg-teal-600 text-white py-3 rounded-xl font-medium hover:bg-teal-700 flex items-center justify-center gap-2 disabled:opacity-50"
                  data-testid="button-request-bill-payment"
                >
                  {requestingBill ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Request Bill & Pay
                </button>
                <button
                  onClick={() => { setSplitMode("equal"); setSplitCount(2); setSelectedSplitItems(new Set()); setStep("bill-split"); }}
                  className="w-full border border-teal-600 text-teal-600 py-3 rounded-xl font-medium hover:bg-teal-50 flex items-center justify-center gap-2"
                  data-testid="button-split-bill"
                >
                  <Users className="h-4 w-4" /> Split Bill
                </button>
                <button onClick={() => setStep("menu")} className="w-full text-teal-600 py-2 text-sm font-medium" data-testid="button-back-to-menu">
                  Back to Menu
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === "bill-split" && bill && (
          <motion.div key="bill-split" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex-1 p-4 pb-24">
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-teal-600 text-white p-4 text-center">
                <Users className="h-8 w-8 mx-auto mb-2" />
                <h2 className="text-lg font-bold">Split Bill</h2>
              </div>

              <div className="p-4 space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => setSplitMode("equal")}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${splitMode === "equal" ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-700 border-gray-200"}`}
                    data-testid="button-split-equal"
                  >
                    Split Equally
                  </button>
                  <button
                    onClick={() => setSplitMode("by-item")}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${splitMode === "by-item" ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-700 border-gray-200"}`}
                    data-testid="button-split-by-item"
                  >
                    By Item
                  </button>
                </div>

                {splitMode === "equal" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Number of people</span>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setSplitCount(c => Math.max(2, c - 1))} className="w-8 h-8 rounded-full border flex items-center justify-center" data-testid="button-split-minus">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="font-bold text-lg w-8 text-center" data-testid="text-split-count">{splitCount}</span>
                        <button onClick={() => setSplitCount(c => Math.min(20, c + 1))} className="w-8 h-8 rounded-full border flex items-center justify-center" data-testid="button-split-plus">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-teal-50 rounded-xl p-4 text-center space-y-1">
                      <p className="text-sm text-gray-500">Each person pays</p>
                      <p className="text-3xl font-bold text-teal-700" data-testid="text-split-amount">{fmt(Number(bill.total) / splitCount)}</p>
                      <p className="text-xs text-gray-400">Total: {fmt(bill.total)} ÷ {splitCount}</p>
                    </div>
                  </div>
                )}

                {splitMode === "by-item" && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">Select items for your share:</p>
                    {bill.items.map((item: any, idx: number) => {
                      const selected = selectedSplitItems.has(idx);
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            const next = new Set(selectedSplitItems);
                            if (selected) next.delete(idx); else next.add(idx);
                            setSelectedSplitItems(next);
                          }}
                          className={`w-full flex justify-between items-center text-sm p-3 rounded-lg border transition-colors text-left ${selected ? "bg-teal-50 border-teal-300" : "border-gray-200"}`}
                          data-testid={`button-split-item-${idx}`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selected ? "bg-teal-600 border-teal-600 text-white" : "border-gray-300"}`}>
                              {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </div>
                            <span>{item.name} x{item.quantity}</span>
                          </div>
                          <span className="font-medium">{fmt(Number(item.price) * (item.quantity || 1))}</span>
                        </button>
                      );
                    })}

                    {selectedSplitItems.size > 0 && (
                      <div className="bg-teal-50 rounded-xl p-4 text-center space-y-1">
                        <p className="text-sm text-gray-500">Your share</p>
                        <p className="text-3xl font-bold text-teal-700" data-testid="text-split-share">
                          {fmt(bill.items.reduce((s: number, item: any, idx: number) => selectedSplitItems.has(idx) ? s + Number(item.price) * (item.quantity || 1) : s, 0) * (1 + Number(tenant?.taxRate || 0) / 100))}
                        </p>
                        <p className="text-xs text-gray-400">{selectedSplitItems.size} item{selectedSplitItems.size > 1 ? "s" : ""} selected (incl. tax)</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 border-t space-y-2">
                <button onClick={() => setStep("bill")} className="w-full text-teal-600 py-2 text-sm font-medium" data-testid="button-back-to-bill">
                  Back to Full Bill
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === "payment-confirm" && bill && (
          <motion.div key="payment-confirm" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl border shadow-lg p-8 text-center max-w-sm w-full" data-testid="payment-confirm-card">
              {!paymentConfirmed ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="h-8 w-8 text-teal-600" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">Payment Requested</h2>
                  <p className="text-gray-500 text-sm mb-6">Your server has been notified. Please choose a payment method:</p>

                  <div className="bg-teal-50 rounded-xl p-4 mb-6">
                    <p className="text-sm text-gray-500">Amount Due</p>
                    <p className="text-3xl font-bold text-teal-700" data-testid="text-payment-total">{fmt(bill.total)}</p>
                  </div>

                  <div className="space-y-2 mb-6">
                    <button
                      onClick={() => setPaymentConfirmed(true)}
                      className="w-full bg-teal-600 text-white py-3 rounded-xl font-medium hover:bg-teal-700 flex items-center justify-center gap-2"
                      data-testid="button-pay-card"
                    >
                      <CreditCard className="h-4 w-4" /> Pay with Card
                    </button>
                    <button
                      onClick={() => setPaymentConfirmed(true)}
                      className="w-full border border-gray-200 py-3 rounded-xl font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
                      data-testid="button-pay-cash"
                    >
                      <Banknote className="h-4 w-4" /> Pay with Cash
                    </button>
                    <button
                      onClick={() => setPaymentConfirmed(true)}
                      className="w-full border border-gray-200 py-3 rounded-xl font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
                      data-testid="button-pay-mobile"
                    >
                      <Smartphone className="h-4 w-4" /> Mobile Payment
                    </button>
                  </div>

                  <button onClick={() => setStep("bill")} className="text-teal-600 text-sm font-medium" data-testid="button-back-from-payment">
                    Back to Bill
                  </button>
                </>
              ) : (
                <>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ duration: 0.5 }}>
                    <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="h-10 w-10 text-green-600" />
                    </div>
                  </motion.div>
                  <h2 className="text-2xl font-bold mb-2">Payment Received!</h2>
                  <p className="text-gray-500 mb-4">Thank you for dining with us at {bill.restaurantName}!</p>
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <p className="text-sm text-gray-500">Amount Paid</p>
                    <p className="text-2xl font-bold text-green-600" data-testid="text-payment-confirmed-total">{fmt(bill.total)}</p>
                  </div>
                  <p className="text-xs text-gray-400">A receipt has been prepared. Please ask your server if you need a printed copy.</p>
                </>
              )}
            </div>
          </motion.div>
        )}

        {step === "order-placed" && (
          <motion.div key="order-placed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl border shadow-lg p-8 text-center max-w-sm w-full" data-testid="order-placed-card">
              <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ delay: 0.2, duration: 0.5 }}>
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
              </motion.div>
              <h2 className="text-2xl font-bold mb-2">Order Placed!</h2>
              <p className="text-gray-500 mb-6">Your order has been sent to the kitchen. Sit back and relax!</p>

              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 text-teal-600 mb-2">
                  <ChefHat className="h-5 w-5" />
                  <span className="font-medium">Being Prepared</span>
                </div>
                <div className="flex items-center justify-center gap-1 text-gray-400 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>Estimated: 15-25 min</span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => setStep("menu")}
                  className="w-full bg-teal-600 text-white py-3 rounded-xl font-medium hover:bg-teal-700"
                  data-testid="button-order-more"
                >
                  Order More Items
                </button>
                <button
                  onClick={viewBill}
                  className="w-full border border-teal-600 text-teal-600 py-3 rounded-xl font-medium hover:bg-teal-50"
                  data-testid="button-view-bill-after-order"
                >
                  View Bill
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {step === "menu" && cartCount > 0 && (
        <motion.div
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 p-4 max-w-lg mx-auto z-20"
        >
          <button
            onClick={() => setStep("cart")}
            className="w-full bg-teal-600 text-white py-3.5 rounded-xl font-semibold shadow-lg hover:bg-teal-700 active:scale-[0.98] transition-all flex items-center justify-between px-5"
            data-testid="button-view-cart"
          >
            <div className="flex items-center gap-2">
              <div className="bg-teal-500 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
                {cartCount}
              </div>
              <span>View Cart</span>
            </div>
            <span className="font-bold">{fmt(cartTotal)}</span>
          </button>
        </motion.div>
      )}
    </div>
  );
}
