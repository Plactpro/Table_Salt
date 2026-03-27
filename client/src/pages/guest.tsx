import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PageTitle } from "@/lib/accessibility";
import { useParams } from "wouter";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Minus, ShoppingCart, UtensilsCrossed, Leaf,
  Bell, Receipt, ChevronLeft, X, StickyNote, CheckCircle2,
  Users, Utensils, Clock, ChefHat, Send, Loader2, AlertCircle,
  CreditCard, Banknote, Smartphone, Coffee, Beef, IceCream,
  Wine, Soup, Pizza, Salad, Sandwich, Phone, UserPlus, Columns2,
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

// WebP-optimized image URL — adds format=webp and w= for CDN/proxy pipelines
function toWebPUrl(src: string | null | undefined, width = 400): string | undefined {
  if (!src) return undefined;
  try {
    const url = new URL(src, window.location.href);
    // Only transform absolute http(s) URLs pointing to image hosts
    if (!url.protocol.startsWith("http")) return src;
    // If already has format param, return as-is
    if (url.searchParams.has("format") || url.searchParams.has("w")) return src;
    url.searchParams.set("format", "webp");
    url.searchParams.set("w", String(width));
    return url.toString();
  } catch {
    return src;
  }
}

const MENU_CACHE_KEY = "ts_guest_menu_cache";
const MENU_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

interface MenuCache {
  outletId: string;
  data: { categories: CategoryData[]; items: MenuItemData[] };
  ts: number;
}

function readMenuCache(outletId: string): MenuCache | null {
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY);
    if (!raw) return null;
    const cache: MenuCache = JSON.parse(raw);
    if (cache.outletId !== outletId) return null;
    if (Date.now() - cache.ts > MENU_CACHE_TTL) return null;
    return cache;
  } catch { return null; }
}

function writeMenuCache(outletId: string, data: { categories: CategoryData[]; items: MenuItemData[] }) {
  try {
    const cache: MenuCache = { outletId, data, ts: Date.now() };
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// Waiter alert button for error states — sends a call_server request for identifiable tokens
// Uses the standard POST /api/table-requests contract: { token, requestType }
function WaiterAlertButton({ tableToken, label = "Alert a Waiter" }: { tableToken: string; outletId: string; label?: string }) {
  const [sent, setSent] = useState(false);
  const [alerting, setAlerting] = useState(false);

  const callWaiter = async () => {
    setAlerting(true);
    try {
      // POST /api/table-requests expects { token: <qrToken>, requestType: <type> }
      await fetch("/api/table-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tableToken, requestType: "call_server", guestNote: "Waiter needed (from QR page)" }),
      });
      setSent(true);
    } catch {} finally {
      setAlerting(false);
    }
  };

  if (sent) {
    return (
      <div className="inline-flex items-center gap-2 bg-gray-100 text-gray-600 px-5 py-2.5 rounded-xl text-sm" data-testid="status-waiter-alerted">
        <Bell className="h-4 w-4" /> Waiter alerted — they'll be right over
      </div>
    );
  }

  return (
    <button
      onClick={callWaiter}
      disabled={alerting}
      className="inline-flex items-center gap-2 bg-amber-500 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-amber-600 disabled:opacity-60"
      data-testid="button-call-waiter-error"
    >
      <Bell className="h-4 w-4" />
      {alerting ? "Alerting…" : label}
    </button>
  );
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
  // per-category item cache for progressive loading
  const [categoryItemsCache, setCategoryItemsCache] = useState<Record<string, MenuItemData[]>>({});
  const [catItemsLoading, setCatItemsLoading] = useState(false);
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
  const [guestTipPct, setGuestTipPct] = useState(0);
  const [guestCustomTip, setGuestCustomTip] = useState("");
  const [guestTipConfig, setGuestTipConfig] = useState<{
    tipsEnabled: boolean;
    showOnQr: boolean;
    promptStyle: "BUTTONS" | "INPUT" | "NONE";
    suggestedPercentages: number[];
    allowCustom: boolean;
    tipBasis: "SUBTOTAL" | "TOTAL";
  } | null>(null);
  const [stripeRedirecting, setStripeRedirecting] = useState(false);
  const [razorpayRedirecting, setRazorpayRedirecting] = useState(false);
  const [razorpayUrl, setRazorpayUrl] = useState<string | null>(null);
  const [razorpayLinkId, setRazorpayLinkId] = useState<string | null>(null);
  const [razorpayPollStatus, setRazorpayPollStatus] = useState<"pending" | "paid" | "cancelled">("pending");
  const [activeGateway, setActiveGateway] = useState<"stripe" | "razorpay" | "both">("stripe");
  const [packingChargeGuest, setPackingChargeGuest] = useState<{ applicable: boolean; total: number; label: string } | null>(null);
  const packingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // multi-customer session join/separate dialog
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [tableSessionInfo, setTableSessionInfo] = useState<{
    sessionExists: boolean;
    sessionToken: string | null;
    orderCount: number;
    canJoin: boolean;
    tableNumber: number;
    tableZone: string | null;
    outletHours: { open: string; close: string; isOpen: boolean; nextOpenTime: string | null };
  } | null>(null);
  const [joinSessionChoice, setJoinSessionChoice] = useState<"join" | "separate" | null>(null);
  const [sessionJoining, setSessionJoining] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [restaurantInfo, setRestaurantInfo] = useState<{ restaurantName: string | null; phone: string | null; logoUrl: string | null } | null>(null);
  const [menuLoadError, setMenuLoadError] = useState<string | null>(null);
  const [usingCachedMenu, setUsingCachedMenu] = useState(false);

  // shared table session items (items placed by others at the same table in join mode)
  interface GuestSharedItem { id: number; order_id: number; menu_item_id: string; name: string; quantity: number; price: string; notes: string | null; guest_name: string | null; }
  const [guestSharedItems, setGuestSharedItems] = useState<GuestSharedItem[]>([]);

  const refreshGuestSharedItems = useCallback(() => {
    const choice = sessionStorage.getItem(`qr_session_choice_${tableToken}`);
    if (choice !== "join" || !tableToken) return;
    fetch(`/api/qr/table/${encodeURIComponent(tableToken)}/session/items`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setGuestSharedItems(data.items ?? []))
      .catch(() => {});
  }, [tableToken]);

  const fmt = useCallback((val: number | string) => {
    if (!tenant) return String(val);
    return sharedFormatCurrency(val, tenant.currency, {
      position: tenant.currencyPosition as "before" | "after",
      decimals: tenant.currencyDecimals,
    });
  }, [tenant]);

  useEffect(() => {
    fetch("/api/platform/gateway-config")
      .then(r => r.ok ? r.json() : { activePaymentGateway: "stripe" })
      .then(data => setActiveGateway(data.activePaymentGateway ?? "stripe"))
      .catch(() => setActiveGateway("stripe"));
  }, []);

  useEffect(() => {
    if (!session?.id) return;
    fetch(`/api/guest/session/${session.id}/tip-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setGuestTipConfig(data))
      .catch(() => {});
  }, [session?.id]);

  useEffect(() => {
    if (!razorpayLinkId || !outletId || !tableToken || razorpayPollStatus !== "pending") return;
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/guest/razorpay-payment-status?linkId=${encodeURIComponent(razorpayLinkId)}&outletId=${encodeURIComponent(outletId)}&tableToken=${encodeURIComponent(tableToken)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (!stopped) {
            if (data.status === "paid") { setRazorpayPollStatus("paid"); setPaymentConfirmed(true); setRazorpayUrl(null); }
            else if (data.status === "cancelled") { setRazorpayPollStatus("cancelled"); }
          }
        }
      } catch { }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => { stopped = true; clearInterval(interval); };
  }, [razorpayLinkId, outletId, tableToken, razorpayPollStatus]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("payment_success") === "1") {
      setPaymentConfirmed(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("payment_success");
      window.history.replaceState({}, "", url.toString());
    }
    if (urlParams.get("payment_cancelled") === "1") {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment_cancelled");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (!outletId || !tableToken) {
      setError("Invalid QR code link");
      setErrorCode("INVALID_TOKEN");
      setLoading(false);
      return;
    }

    // Check for existing table session (multi-customer join flow)
    // Restore session choice from sessionStorage to avoid repeated dialogs
    const savedChoice = sessionStorage.getItem(`qr_session_choice_${tableToken}`);
    if (savedChoice === "join" || savedChoice === "separate") {
      setJoinSessionChoice(savedChoice as "join" | "separate");
    }

    // check for cached menu for instant first paint (stale-while-revalidate)
    const cachedMenu = readMenuCache(outletId);
    if (cachedMenu) {
      setCategories(cachedMenu.data.categories);
      setMenuItems(cachedMenu.data.items);
      // Pre-populate per-category cache from localStorage data
      const catCache: Record<string, MenuItemData[]> = {};
      for (const cat of cachedMenu.data.categories) {
        const catItems = cachedMenu.data.items.filter(i => i.categoryId === cat.id);
        if (catItems.length) catCache[cat.id] = catItems;
      }
      setCategoryItemsCache(catCache);
      setUsingCachedMenu(true);
    }

    // progressive loading — load session/table first, categories second (fast payloads)
    // Items are fetched per-category on-demand in a separate effect below
    const sessionPromise = fetch(`/api/guest/${outletId}/${tableToken}`)
      .then(r => {
        if (!r.ok) {
          return r.json().then((e: any) => Promise.reject({ message: e.message || "Table not found", code: e.errorCode || "TABLE_NOT_FOUND" }));
        }
        return r.json();
      });

    const categoriesPromise = fetch(`/api/guest/menu/${outletId}/categories`)
      .then(r => r.ok ? r.json() : { categories: [] });

    Promise.all([sessionPromise, categoriesPromise])
      .then(([data, catData]) => {
        setTenant(data.tenant);
        setTable(data.table);
        setOutlet(data.outlet);
        setSession(data.session);
        setCart(data.cart || []);
        setLoading(false);
        setMenuLoadError(null);
        setUsingCachedMenu(false);

        // Use progressively-loaded categories (fast endpoint), fall back to session endpoint categories
        const cats: CategoryData[] = catData.categories?.length ? catData.categories : (data.categories || []);
        setCategories(cats);

        if (!catData.categories?.length && data.items?.length) {
          // Fallback: full menu from session endpoint (no progressive endpoint available)
          setMenuItems(data.items);
          writeMenuCache(outletId, { categories: data.categories || [], items: data.items });
          // Pre-populate per-category cache so progressive effect doesn't re-fetch
          const catCache: Record<string, MenuItemData[]> = {};
          for (const cat of (data.categories || [])) {
            const catItems = data.items.filter((i: MenuItemData) => i.categoryId === cat.id);
            if (catItems.length) catCache[cat.id] = catItems;
          }
          setCategoryItemsCache(catCache);
        } else if (catData.categories?.length) {
          // Progressive: auto-select first category to trigger immediate item loading
          // This prevents "No items found" flash on initial render with empty menuItems
          setSelectedCategory(cats[0]?.id ?? null);
          // Cache categories now; items will be added to cache per-category as they load
          writeMenuCache(outletId, { categories: cats, items: menuItems });
        }

        // After loading, fetch restaurant info and check for active QR sessions
        // Pass outletId as fallback so invalid-token screen always has a callable contact path
        fetch(`/api/qr/restaurant-info?token=${encodeURIComponent(tableToken)}&outletId=${encodeURIComponent(outletId)}`)
          .then(r => r.ok ? r.json() : null)
          .then(info => { if (info) setRestaurantInfo(info); })
          .catch(() => {});

        // Check for active table session (multi-customer flow + outlet hours)
        fetch(`/api/qr/table/${encodeURIComponent(tableToken)}/session`)
          .then(r => r.ok ? r.json() : null)
          .then(info => {
            if (!info) return;
            setTableSessionInfo(info);
            // Show kitchen-closed error if outlet is outside operating hours
            if (info.outletHours && !info.outletHours.isOpen) {
              setError("Kitchen is currently closed");
              setErrorCode("KITCHEN_CLOSED");
              setLoading(false);
              return;
            }
            // Show join dialog only if session exists and no prior choice
            if (!savedChoice && info.sessionExists && info.canJoin) {
              setShowJoinDialog(true);
            } else if (!savedChoice && info.sessionExists && !info.canJoin) {
              // session exists but table is non-joinable (e.g. all orders paid, party leaving)
              setError("This table is currently occupied by another party and is not accepting new orders.");
              setErrorCode("TABLE_UNAVAILABLE");
              setLoading(false);
            } else if (!savedChoice && !info.sessionExists) {
              // First diner — auto-create a session so subsequent diners can join
              fetch(`/api/qr/table/${encodeURIComponent(tableToken)}/session/start`, { method: "POST" })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data?.session) {
                    sessionStorage.setItem(`qr_session_choice_${tableToken}`, "separate");
                    setJoinSessionChoice("separate");
                  }
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
      })
      .catch((err: { message: string; code?: string }) => {
        const isCritical = !cachedMenu;
        if (isCritical) {
          // No cached menu — show full error
          setError(err.message || "Unable to load table information");
          setErrorCode(err.code || null);
          setLoading(false);
        } else {
          // We have cached data — show a non-blocking retry banner
          setMenuLoadError(err.message || "Menu could not be refreshed. Showing cached menu.");
          setLoading(false);
        }
        // Fetch restaurant info for the error state (best effort)
        fetch(`/api/qr/restaurant-info?token=${encodeURIComponent(tableToken)}&outletId=${encodeURIComponent(outletId)}`)
          .then(r => r.ok ? r.json() : null)
          .then(info => { if (info) setRestaurantInfo(info); })
          .catch(() => {});
      });
  }, [outletId, tableToken]);

  // Progressive per-category item loading
  useEffect(() => {
    if (!outletId || !selectedCategory) return;
    // If we already have items for this category in cache, skip fetch
    if (categoryItemsCache[selectedCategory]) return;
    // If menuItems is already populated with items for this category (from full load), skip
    const existingItems = menuItems.filter(i => i.categoryId === selectedCategory);
    if (existingItems.length > 0) {
      setCategoryItemsCache(prev => ({ ...prev, [selectedCategory]: existingItems }));
      return;
    }
    setCatItemsLoading(true);
    fetch(`/api/guest/menu/${outletId}/categories/${selectedCategory}/items`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => {
        const items: MenuItemData[] = data.items ?? [];
        setCategoryItemsCache(prev => {
          const updated = { ...prev, [selectedCategory]: items };
          // Merge into flat menuItems list for search cross-category support
          setMenuItems(all => {
            const newIds = new Set(items.map(i => i.id));
            const kept = all.filter(i => !newIds.has(i.id));
            return [...kept, ...items];
          });
          return updated;
        });
      })
      .catch(() => {})
      .finally(() => setCatItemsLoading(false));
  }, [outletId, selectedCategory]);

  const filteredItems = useMemo(() => {
    // When a category is selected, prefer per-category cache for progressive loading
    let items: MenuItemData[];
    if (selectedCategory) {
      items = categoryItemsCache[selectedCategory] ?? menuItems.filter(i => i.categoryId === selectedCategory);
    } else {
      items = menuItems;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    return items;
  }, [menuItems, categoryItemsCache, selectedCategory, searchQuery]);

  const cartTotal = useMemo(() => cart.reduce((s, ci) => s + Number(ci.price) * ci.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, ci) => s + ci.quantity, 0), [cart]);

  useEffect(() => {
    if (!outletId || cart.length === 0) { setPackingChargeGuest(null); return; }
    if (packingTimerRef.current) clearTimeout(packingTimerRef.current);
    packingTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/packing/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            outletId,
            orderType: "takeaway",
            items: cart.map(ci => ({ menuItemId: ci.menuItemId, name: ci.name, price: ci.price, quantity: ci.quantity })),
          }),
        });
        if (res.ok) { const data = await res.json(); setPackingChargeGuest(data); }
      } catch { }
    }, 300);
    return () => { if (packingTimerRef.current) clearTimeout(packingTimerRef.current); };
  }, [outletId, cart]);

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
      const sessionChoice = sessionStorage.getItem(`qr_session_choice_${tableToken}`);

      // true join semantics — add items directly to the existing shared order
      if (sessionChoice === "join" && tableToken) {
        const sharedOrderRes = await fetch(`/api/qr/table/${encodeURIComponent(tableToken)}/session/shared-order`);
        const sharedOrderData = sharedOrderRes.ok ? await sharedOrderRes.json() : {};
        const sharedOrderId = sharedOrderData.sharedOrderId;

        if (sharedOrderId) {
          const addRes = await fetch(`/api/qr/table/${encodeURIComponent(tableToken)}/session/add-to-shared-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestSessionId: session.id, sharedOrderId }),
          });
          if (!addRes.ok) throw new Error("Failed to add items to table order");
          setOrderPlacedData({ orderId: sharedOrderId, joinedSharedOrder: true });
          setCart([]);
          setStep("order-placed");
          return;
        }
        // No shared order yet — fall through to create own and register it for future joiners
      }

      // Default path: create own order
      const res = await fetch(`/api/guest/session/${session.id}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to place order");
      const data = await res.json();
      const orderId = data.orderId ?? data.id ?? data.order?.id ?? null;

      // Register this new order in the shared session so future joiners can merge into it
      if (orderId && tableToken) {
        fetch(`/api/qr/table/${encodeURIComponent(tableToken)}/session/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        }).catch(() => {});
      }

      setOrderPlacedData(data);
      setCart([]);
      setStep("order-placed");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }, [session, cart, tableToken]);

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

  const payWithStripe = useCallback(async () => {
    if (!session || !bill) return;
    setStripeRedirecting(true);
    try {
      const res = await fetch("/api/guest/payment-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          outletId,
          tableToken,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
      setPaymentConfirmed(true);
    } catch (err) {
      console.error("Stripe payment error:", err);
      setPaymentConfirmed(true);
    } finally {
      setStripeRedirecting(false);
    }
  }, [session, bill, outletId, tableToken]);

  const payWithRazorpay = useCallback(async () => {
    if (!session || !bill) return;
    setRazorpayRedirecting(true);
    try {
      const res = await fetch("/api/guest/razorpay-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, outletId, tableToken }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.shortUrl) {
          setRazorpayUrl(data.shortUrl);
          setRazorpayLinkId(data.paymentLinkId || null);
          setRazorpayPollStatus("pending");
          return;
        }
      }
      setPaymentConfirmed(true);
    } catch (err) {
      console.error("Razorpay payment error:", err);
      setPaymentConfirmed(true);
    } finally {
      setRazorpayRedirecting(false);
    }
  }, [session, bill, outletId, tableToken]);

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
    const isInvalidToken = errorCode === "INVALID_TOKEN" || !tableToken || !outletId;
    const isKitchenClosed = errorCode === "KITCHEN_CLOSED";
    const hours = tableSessionInfo?.outletHours;

    return (
      <div
        className={`min-h-screen flex items-center justify-center p-6 ${isKitchenClosed ? "bg-gradient-to-br from-amber-50 to-orange-50" : "bg-gradient-to-br from-red-50 to-orange-50"}`}
        data-testid="guest-error"
      >
        <div className="text-center space-y-5 max-w-sm w-full">
          {restaurantInfo?.logoUrl && (
            <img
              src={restaurantInfo.logoUrl}
              alt={restaurantInfo.restaurantName || "Restaurant"}
              width={80}
              height={80}
              loading="lazy"
              className="h-16 w-auto mx-auto object-contain"
            />
          )}
          <AlertCircle className={`h-12 w-12 mx-auto ${isKitchenClosed ? "text-amber-500" : "text-red-500"}`} />
          <div>
            <h2 className={`text-xl font-bold ${isKitchenClosed ? "text-amber-800" : "text-red-800"}`}>
              {isKitchenClosed
                ? "Kitchen Closed"
                : isInvalidToken
                ? "QR Code Not Valid"
                : "Table Unavailable"}
            </h2>
            <p className={`mt-2 text-sm ${isKitchenClosed ? "text-amber-700" : "text-red-600"}`}>
              {isKitchenClosed
                ? hours?.nextOpenTime
                  ? `We're currently closed. We reopen ${hours.nextOpenTime}.`
                  : "We're currently closed for the day. Please contact us for opening times."
                : isInvalidToken
                ? "This QR code is no longer valid. Please ask your server for a new one."
                : error}
            </p>
          </div>
          <p className="text-sm text-gray-500">
            {isKitchenClosed
              ? "You can still call us or ask your server for assistance."
              : isInvalidToken
              ? "Your server can provide a new QR code for your table."
              : "Please speak with our staff for assistance."}
          </p>
          <div className="flex flex-col gap-2 items-center w-full">
            {/* Waiter alert for identifiable tokens (kitchen-closed or table-unavailable) */}
            {!isInvalidToken && tableToken && outletId && (
              <WaiterAlertButton
                tableToken={tableToken}
                outletId={outletId}
                label="Alert a Waiter"
              />
            )}
            {restaurantInfo?.phone ? (
              <a
                href={`tel:${restaurantInfo.phone}`}
                className="inline-flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-teal-700"
                data-testid="link-call-restaurant"
              >
                <Phone className="h-4 w-4" />
                Call {restaurantInfo.restaurantName || "Restaurant"}
              </a>
            ) : isInvalidToken ? (
              <p className="text-sm text-gray-400">Please ask your server for help.</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto relative" data-testid="guest-page">
      <PageTitle title="Self-Order" />

      {/* Cached menu retry banner */}
      {menuLoadError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex flex-col gap-1 text-xs text-amber-800" data-testid="banner-menu-retry">
          <div className="flex items-center justify-between gap-2">
            <span>⚠ Showing cached menu. {menuLoadError}</span>
            <button
              onClick={() => {
                setMenuLoadError(null);
                setUsingCachedMenu(false);
                window.location.reload();
              }}
              className="font-semibold underline shrink-0"
              data-testid="button-retry-menu"
            >
              Retry
            </button>
          </div>
          {/* waiter alert in menu-load-failed state when table is identifiable */}
          {tableToken && outletId && (
            <WaiterAlertButton
              tableToken={tableToken}
              outletId={outletId}
              label="Need help? Alert a Waiter"
            />
          )}
        </div>
      )}

      {/* Join/Separate dialog for multi-customer table ordering */}
      {showJoinDialog && tableSessionInfo?.sessionExists && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          data-testid="dialog-join-or-separate"
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
                <Users className="h-7 w-7 text-teal-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Table Already Has an Open Order</h2>
              <p className="text-sm text-gray-500">
                Your table already has{" "}
                {tableSessionInfo.orderCount > 0
                  ? `${tableSessionInfo.orderCount} active order${tableSessionInfo.orderCount > 1 ? "s" : ""}`
                  : "an active order"}
                . Would you like to add to it or start a separate order?
              </p>
            </div>
            <div className="space-y-3">
              <button
                className="w-full flex items-center gap-3 bg-teal-600 text-white px-4 py-3 rounded-xl font-medium hover:bg-teal-700 transition-colors disabled:opacity-60"
                disabled={sessionJoining}
                onClick={async () => {
                  setSessionJoining(true);
                  try {
                    const res = await fetch(`/api/qr/table/${encodeURIComponent(tableToken!)}/session/start`, { method: "POST" });
                    if (res.ok) {
                      const data = await res.json();
                      sessionStorage.setItem(`qr_session_choice_${tableToken}`, "join");
                      sessionStorage.setItem(`qr_session_token_${tableToken}`, data.session?.session_token ?? "");
                    } else {
                      sessionStorage.setItem(`qr_session_choice_${tableToken}`, "join");
                    }
                  } catch {
                    sessionStorage.setItem(`qr_session_choice_${tableToken}`, "join");
                  }
                  setSessionJoining(false);
                  setJoinSessionChoice("join");
                  setShowJoinDialog(false);
                }}
                data-testid="button-join-table-order"
              >
                <UserPlus className="h-5 w-5 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Add to Table's Order</div>
                  <div className="text-xs text-teal-100">Your items join the shared order</div>
                </div>
              </button>
              <button
                className="w-full flex items-center gap-3 border border-gray-200 text-gray-700 px-4 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                onClick={() => {
                  sessionStorage.setItem(`qr_session_choice_${tableToken}`, "separate");
                  setJoinSessionChoice("separate");
                  setShowJoinDialog(false);
                }}
                data-testid="button-start-separate-order"
              >
                <Columns2 className="h-5 w-5 shrink-0" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Start My Own Order</div>
                  <div className="text-xs text-gray-400">A separate order (waiter can merge at billing)</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

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
              {catItemsLoading ? (
                <div className="flex items-center justify-center py-16" data-testid="loader-category-items">
                  <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                </div>
              ) : filteredItems.length === 0 ? (
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
                            <div className="w-24 h-24 shrink-0 bg-gray-100 overflow-hidden">
                              <img
                                src={toWebPUrl(item.image, 192)}
                                alt={item.name}
                                width={96}
                                height={96}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                onError={e => {
                                  const el = e.target as HTMLImageElement;
                                  // Fallback to original URL if WebP fails
                                  if (el.src !== item.image) { el.src = item.image; return; }
                                  el.style.display = "none";
                                  const parent = el.parentElement;
                                  if (parent) {
                                    parent.classList.add("from-teal-50", "to-emerald-50", "bg-gradient-to-br", "flex", "items-center", "justify-center");
                                  }
                                }}
                              />
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
                <div className="h-56 bg-gray-100 overflow-hidden">
                  <img
                    src={toWebPUrl(selectedItem.image, 800)}
                    alt={selectedItem.name}
                    width={600}
                    height={224}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      if (el.src !== selectedItem.image) { el.src = selectedItem.image; return; }
                      el.style.display = "none";
                    }}
                  />
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
                {joinSessionChoice === "join" && (
                  <span className="ml-auto text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5" data-testid="badge-guest-join-mode">
                    Shared Table
                  </span>
                )}
              </h2>

              {/* Shared session items — "Others at your table" in join mode */}
              {joinSessionChoice === "join" && guestSharedItems.length > 0 && (
                <div className="bg-teal-50 rounded-xl p-3 border border-teal-100 mb-4" data-testid="section-guest-shared-items">
                  <p className="text-xs font-semibold text-teal-700 mb-2 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Others at your table
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {guestSharedItems.map(si => (
                      <div key={si.id} data-testid={`guest-shared-item-${si.id}`} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 flex-1 min-w-0 truncate">
                          {si.name} <span className="text-gray-400">×{si.quantity}</span>
                        </span>
                        <span className="text-gray-500 text-xs ml-2 shrink-0">{fmt(Number(si.price) * si.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-teal-600 mt-2 italic">These items were added by others — you can only remove your own items below.</p>
                </div>
              )}

              {joinSessionChoice === "join" && guestSharedItems.length > 0 && cart.length > 0 && (
                <p className="text-xs font-semibold text-gray-500 mb-2" data-testid="label-guest-my-items">Your items</p>
              )}

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
                    {packingChargeGuest?.applicable && (
                      <div className="flex justify-between text-sm" data-testid="text-qr-packing-charge">
                        <span className="text-gray-500">📦 {packingChargeGuest.label}</span>
                        <span className="font-medium">{fmt(packingChargeGuest.total)}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold">
                      <span>Estimated Total</span>
                      <span className="text-teal-700" data-testid="text-qr-total-with-packing">
                        {fmt(cartTotal * (1 + Number(tenant?.taxRate || 0) / 100 + Number(tenant?.serviceCharge || 0) / 100) + (packingChargeGuest?.applicable ? packingChargeGuest.total : 0))}
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

                  {guestTipConfig && guestTipConfig.tipsEnabled && guestTipConfig.showOnQr && guestTipConfig.promptStyle !== "NONE" && bill && (
                    <div className="mb-6 text-left" data-testid="section-guest-tip">
                      <p className="text-sm font-semibold mb-2 text-gray-700">Would you like to add a tip?</p>
                      <div className="flex gap-2 flex-wrap mb-2">
                        {guestTipConfig.promptStyle === "BUTTONS" && (
                          <>
                            <button
                              className={`px-3 py-1.5 rounded-xl border text-sm font-medium ${guestTipPct === 0 && !guestCustomTip ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-700 border-gray-200"}`}
                              onClick={() => { setGuestTipPct(0); setGuestCustomTip(""); }}
                              data-testid="button-guest-no-tip"
                            >
                              No Tip
                            </button>
                            {(guestTipConfig.suggestedPercentages || [5, 10, 15]).map(pct => {
                              const basis = guestTipConfig.tipBasis === "TOTAL" ? bill.total : bill.subtotal;
                              return (
                                <button
                                  key={pct}
                                  className={`px-3 py-1.5 rounded-xl border text-sm font-medium ${guestTipPct === pct && !guestCustomTip ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-700 border-gray-200"}`}
                                  onClick={() => { setGuestTipPct(pct); setGuestCustomTip(""); }}
                                  data-testid={`button-guest-tip-pct-${pct}`}
                                >
                                  {pct}% ({fmt(basis * pct / 100)})
                                </button>
                              );
                            })}
                          </>
                        )}
                        {guestTipConfig.promptStyle === "INPUT" && (
                          <button
                            className={`px-3 py-1.5 rounded-xl border text-sm font-medium ${guestTipPct === 0 && !guestCustomTip ? "bg-teal-600 text-white border-teal-600" : "bg-white text-gray-700 border-gray-200"}`}
                            onClick={() => { setGuestTipPct(0); setGuestCustomTip(""); }}
                            data-testid="button-guest-no-tip"
                          >
                            No Tip
                          </button>
                        )}
                      </div>
                      {(guestTipConfig.allowCustom || guestTipConfig.promptStyle === "INPUT") && (
                        <input
                          type="number"
                          placeholder="Custom tip amount"
                          value={guestCustomTip}
                          onChange={e => { setGuestCustomTip(e.target.value); setGuestTipPct(0); }}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                          min="0"
                          step="0.01"
                          data-testid="input-guest-custom-tip"
                        />
                      )}
                      {(guestTipPct > 0 || parseFloat(guestCustomTip || "0") > 0) && (
                        <p className="text-sm text-teal-600 font-semibold mt-1" data-testid="text-guest-tip-amount">
                          Tip: {fmt(guestCustomTip ? parseFloat(guestCustomTip) || 0 : (guestTipConfig.tipBasis === "TOTAL" ? bill.total : bill.subtotal) * guestTipPct / 100)}
                        </p>
                      )}
                    </div>
                  )}

                  {razorpayUrl ? (
                    <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200 text-center space-y-3">
                      {razorpayPollStatus === "paid" ? (
                        <div data-testid="status-razorpay-guest-paid" className="flex items-center gap-2 justify-center text-green-700 font-semibold">
                          <CheckCircle2 className="h-5 w-5" /> Payment confirmed!
                        </div>
                      ) : razorpayPollStatus === "cancelled" ? (
                        <div data-testid="status-razorpay-guest-cancelled" className="text-red-600 font-semibold">Payment link expired or cancelled. Please try again.</div>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-blue-800">Complete your Razorpay / UPI payment:</p>
                          <a
                            href={razorpayUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="link-razorpay-guest-payment"
                            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700"
                          >
                            <CreditCard className="h-4 w-4" /> Open Payment Page
                          </a>
                          <p className="text-xs text-blue-600 break-all">{razorpayUrl}</p>
                          <p data-testid="status-razorpay-guest-pending" className="text-xs text-gray-400 animate-pulse">Waiting for payment confirmation...</p>
                        </>
                      )}
                    </div>
                  ) : (
                  <div className="space-y-2 mb-6">
                    {(activeGateway === "stripe" || activeGateway === "both") && (
                    <button
                      onClick={payWithStripe}
                      disabled={stripeRedirecting}
                      className="w-full bg-teal-600 text-white py-3 rounded-xl font-medium hover:bg-teal-700 flex items-center justify-center gap-2 disabled:opacity-50"
                      data-testid="button-pay-card"
                    >
                      {stripeRedirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      {stripeRedirecting ? "Redirecting to payment..." : "Pay with Card (Stripe)"}
                    </button>
                    )}
                    {(activeGateway === "razorpay" || activeGateway === "both") && (
                    <button
                      onClick={payWithRazorpay}
                      disabled={razorpayRedirecting}
                      className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50"
                      data-testid="button-pay-razorpay"
                    >
                      {razorpayRedirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                      {razorpayRedirecting ? "Generating payment link..." : "Pay via Razorpay / UPI"}
                    </button>
                    )}
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
                  )}

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
            onClick={() => { setStep("cart"); refreshGuestSharedItems(); }}
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
