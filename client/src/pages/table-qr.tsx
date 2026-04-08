import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { PageTitle } from "@/lib/accessibility";
const ModificationDrawer = lazy(() => import("@/components/modifications/ModificationDrawer"));
import { useSearch, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Receipt, Droplets, Sparkles, Utensils, ShoppingCart, Star,
  MessageSquare, ChevronLeft, Check, Loader2, AlertCircle, X,
  Plus, Minus, Baby, ThermometerSun, Music, HelpCircle, Scissors,
  Package, Accessibility, UtensilsCrossed, Leaf, ChefHat, Users,
} from "lucide-react";

const TRANSLATIONS = {
  en: {
    dir: "ltr" as const,
    loading: "Loading...",
    invalidQr: "Invalid or expired QR code",
    table: "Table",
    zone: "Zone",
    howCanWeHelp: "How can we help?",
    callWaiter: "Call Waiter",
    requestBill: "Request Bill",
    requestWater: "Request Water",
    requestCleaning: "Request Cleaning",
    requestCutlery: "Request Cutlery",
    requestNapkins: "Request Napkins",
    requestTakeawayBox: "Takeaway Box",
    requestHighChair: "High Chair",
    requestWheelchair: "Wheelchair",
    orderFood: "Order Food",
    feedback: "Give Feedback",
    specialRequest: "Special Request",
    waiting: "Waiting...",
    staffOnTheWay: "Staff on the way!",
    completed: "Completed",
    cancelled: "Cancelled",
    submitted: "Request submitted!",
    submitAnother: "Submit Another Request",
    backToMenu: "Back to Menu",
    back: "Back",
    send: "Send",
    cancel: "Cancel",
    sending: "Sending...",
    yourNote: "Add a note (optional)",
    categories: "Categories",
    addToCart: "Add to Cart",
    cart: "Cart",
    placeOrder: "Place Order",
    orderPlaced: "Order Placed!",
    orderPlacedMsg: "Your order has been sent to the kitchen.",
    emptyCart: "Your cart is empty",
    rateExperience: "Rate Your Experience",
    yourComment: "Share your thoughts...",
    submitFeedback: "Submit Feedback",
    thanksForFeedback: "Thank you!",
    positiveMsg: "We're thrilled you enjoyed your visit!",
    shareGoogle: "Share on Google",
    shareTripAdvisor: "Share on TripAdvisor",
    managerAlert: "A manager will address this shortly.",
    complaintCategory: "What went wrong?",
    foodQuality: "Food Quality",
    service: "Service",
    cleanliness: "Cleanliness",
    noise: "Noise/Ambiance",
    waitTime: "Wait Time",
    otherIssue: "Other",
    describeIssue: "Please describe the issue...",
    birthdaySetup: "Birthday/Anniversary",
    dietaryNeed: "Dietary Need",
    temperature: "Temperature",
    music: "Music",
    otherRequest: "Other Request",
    birthdayMsg: "Name & occasion:",
    dietaryMsg: "Describe your dietary requirement:",
    temperatureLabel: "Preferred temperature:",
    musicLabel: "Music preference:",
    otherLabel: "Describe your request:",
    cooler: "Cooler",
    warmer: "Warmer",
    current: "As is",
    foodOrderingUnavailable: "Food ordering is not available for this table.",
    noItems: "No items available in this category",
    trackingStatus: "Your request status",
  },
  ar: {
    dir: "rtl" as const,
    loading: "جار التحميل...",
    invalidQr: "رمز QR غير صالح أو منتهي",
    table: "طاولة",
    zone: "المنطقة",
    howCanWeHelp: "كيف يمكننا مساعدتك؟",
    callWaiter: "استدعاء النادل",
    requestBill: "طلب الفاتورة",
    requestWater: "طلب ماء",
    requestCleaning: "طلب تنظيف",
    requestCutlery: "طلب أدوات المائدة",
    requestNapkins: "طلب مناديل",
    requestTakeawayBox: "علبة للمنزل",
    requestHighChair: "كرسي أطفال",
    requestWheelchair: "كرسي متحرك",
    orderFood: "طلب الطعام",
    feedback: "تقديم تعليق",
    specialRequest: "طلب خاص",
    waiting: "في الانتظار...",
    staffOnTheWay: "الموظف في الطريق!",
    completed: "تم الإنجاز",
    cancelled: "ملغى",
    submitted: "تم إرسال الطلب!",
    submitAnother: "تقديم طلب آخر",
    backToMenu: "العودة للقائمة",
    back: "رجوع",
    send: "إرسال",
    cancel: "إلغاء",
    sending: "جار الإرسال...",
    yourNote: "أضف ملاحظة (اختياري)",
    categories: "الأصناف",
    addToCart: "أضف للسلة",
    cart: "السلة",
    placeOrder: "تقديم الطلب",
    orderPlaced: "تم تقديم الطلب!",
    orderPlacedMsg: "تم إرسال طلبك إلى المطبخ.",
    emptyCart: "سلتك فارغة",
    rateExperience: "قيّم تجربتك",
    yourComment: "شارك أفكارك...",
    submitFeedback: "إرسال التعليق",
    thanksForFeedback: "شكراً لك!",
    positiveMsg: "يسعدنا أنك استمتعت بزيارتك!",
    shareGoogle: "شارك على Google",
    shareTripAdvisor: "شارك على TripAdvisor",
    managerAlert: "سيتولى المدير معالجة هذا قريباً.",
    complaintCategory: "ما الذي حدث خطأ؟",
    foodQuality: "جودة الطعام",
    service: "الخدمة",
    cleanliness: "النظافة",
    noise: "الضوضاء/الأجواء",
    waitTime: "وقت الانتظار",
    otherIssue: "أخرى",
    describeIssue: "يرجى وصف المشكلة...",
    birthdaySetup: "عيد ميلاد/ذكرى سنوية",
    dietaryNeed: "الاحتياجات الغذائية",
    temperature: "درجة الحرارة",
    music: "الموسيقى",
    otherRequest: "طلب آخر",
    birthdayMsg: "الاسم والمناسبة:",
    dietaryMsg: "يرجى وصف متطلباتك الغذائية:",
    temperatureLabel: "درجة الحرارة المفضلة:",
    musicLabel: "تفضيل الموسيقى:",
    otherLabel: "صف طلبك:",
    cooler: "أبرد",
    warmer: "أدفأ",
    current: "كما هو",
    foodOrderingUnavailable: "طلب الطعام غير متاح لهذه الطاولة.",
    noItems: "لا توجد عناصر في هذه الفئة",
    trackingStatus: "حالة طلبك",
  },
  hi: {
    dir: "ltr" as const,
    loading: "लोड हो रहा है...",
    invalidQr: "अमान्य या समाप्त QR कोड",
    table: "टेबल",
    zone: "ज़ोन",
    howCanWeHelp: "हम कैसे मदद कर सकते हैं?",
    callWaiter: "वेटर बुलाएं",
    requestBill: "बिल मांगें",
    requestWater: "पानी मांगें",
    requestCleaning: "सफ़ाई मांगें",
    requestCutlery: "कटलरी मांगें",
    requestNapkins: "नैपकिन मांगें",
    requestTakeawayBox: "टेकअवे बॉक्स",
    requestHighChair: "हाई चेयर",
    requestWheelchair: "व्हीलचेयर",
    orderFood: "खाना ऑर्डर करें",
    feedback: "प्रतिक्रिया दें",
    specialRequest: "विशेष अनुरोध",
    waiting: "प्रतीक्षा में...",
    staffOnTheWay: "स्टाफ आ रहा है!",
    completed: "पूर्ण",
    cancelled: "रद्द",
    submitted: "अनुरोध भेजा गया!",
    submitAnother: "एक और अनुरोध करें",
    backToMenu: "मेनू पर वापस जाएं",
    back: "वापस",
    send: "भेजें",
    cancel: "रद्द करें",
    sending: "भेज रहा है...",
    yourNote: "नोट जोड़ें (वैकल्पिक)",
    categories: "श्रेणियां",
    addToCart: "कार्ट में जोड़ें",
    cart: "कार्ट",
    placeOrder: "ऑर्डर दें",
    orderPlaced: "ऑर्डर हो गया!",
    orderPlacedMsg: "आपका ऑर्डर रसोई में भेज दिया गया है।",
    emptyCart: "आपका कार्ट खाली है",
    rateExperience: "अपना अनुभव रेट करें",
    yourComment: "अपने विचार साझा करें...",
    submitFeedback: "प्रतिक्रिया भेजें",
    thanksForFeedback: "धन्यवाद!",
    positiveMsg: "हमें खुशी है कि आपने अपनी यात्रा का आनंद लिया!",
    shareGoogle: "Google पर साझा करें",
    shareTripAdvisor: "TripAdvisor पर साझा करें",
    managerAlert: "एक मैनेजर जल्द ही इसका समाधान करेगा।",
    complaintCategory: "क्या गलत हुआ?",
    foodQuality: "खाने की गुणवत्ता",
    service: "सेवा",
    cleanliness: "सफ़ाई",
    noise: "शोर/माहौल",
    waitTime: "प्रतीक्षा समय",
    otherIssue: "अन्य",
    describeIssue: "कृपया समस्या बताएं...",
    birthdaySetup: "जन्मदिन/सालगिरह",
    dietaryNeed: "आहार संबंधी जरूरत",
    temperature: "तापमान",
    music: "संगीत",
    otherRequest: "अन्य अनुरोध",
    birthdayMsg: "नाम और अवसर:",
    dietaryMsg: "कृपया अपनी आहार आवश्यकता बताएं:",
    temperatureLabel: "पसंदीदा तापमान:",
    musicLabel: "संगीत पसंद:",
    otherLabel: "अपना अनुरोध बताएं:",
    cooler: "ठंडा",
    warmer: "गर्म",
    current: "जैसा है",
    foodOrderingUnavailable: "इस टेबल के लिए खाना ऑर्डर करना उपलब्ध नहीं है।",
    noItems: "इस श्रेणी में कोई आइटम नहीं",
    trackingStatus: "आपके अनुरोध की स्थिति",
  },
} as const;

type Lang = keyof typeof TRANSLATIONS;
type T = (typeof TRANSLATIONS)[Lang];

interface QrContext {
  tokenId: string;
  tenantId: string;
  outletId: string | null;
  tableId: string;
  tableNumber: number;
  tableZone: string | null;
  restaurantName: string;
  currency: string;
  outletName: string | null;
  requestTypes: string[];
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  categoryId: string | null;
  image: string | null;
  isVeg: boolean | null;
  spicyLevel: number | null;
}

interface Category {
  id: string;
  name: string;
  sortOrder: number | null;
}

interface LocalCartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  note: string;
  foodModification?: import("@/components/modifications/ModificationDrawer").FoodModification;
}

interface SubmittedRequest {
  id: string;
  status: string;
  label: string;
  isPositiveFeedback?: boolean;
  isNegativeFeedback?: boolean;
  restaurantName?: string;
}

type Flow = "home" | "food-order" | "feedback" | "special-request" | "status-track";

const PRIMARY = "hsl(174, 65%, 32%)";

// WebP image URL transformation for reduced payload
function toWebPUrl(src: string | null | undefined, width = 400): string | undefined {
  if (!src) return undefined;
  try {
    const url = new URL(src, window.location.href);
    if (!url.protocol.startsWith("http")) return src;
    if (url.searchParams.has("format") || url.searchParams.has("w")) return src;
    url.searchParams.set("format", "webp");
    url.searchParams.set("w", String(width));
    return url.toString();
  } catch { return src; }
}

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function useQrToken(token: string | null) {
  const [ctx, setCtx] = useState<QrContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError("No QR token provided"); setLoading(false); return; }
    fetch(`/api/qr/${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : r.json().then((e: { message?: string }) => Promise.reject(e.message || "QR error")))
      .then(setCtx)
      .catch(e => setError(typeof e === "string" ? e : "Invalid QR code"))
      .finally(() => setLoading(false));
  }, [token]);

  return { ctx, error, loading };
}

function useGuestWebSocket(qrToken: string | null, onMessage: (event: string, payload: unknown) => void) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!qrToken) return;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let delay = 1000;
    let active = true;

    function connect() {
      if (!active) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${window.location.host}/ws?qrToken=${encodeURIComponent(qrToken!)}`);
      ws.onopen = () => { delay = 1000; };
      ws.onmessage = (evt) => {
        try {
          const { event, payload } = JSON.parse(evt.data as string);
          cbRef.current(event, payload);
        } catch {}
      };
      ws.onclose = () => {
        ws = null;
        if (!active) return;
        retryTimer = setTimeout(() => { delay = Math.min(delay * 2, 30000); connect(); }, delay);
      };
      ws.onerror = () => ws?.close();
    }

    connect();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [qrToken]);
}

function StatusBubble({ status, t }: { status: string; t: T }) {
  const statusMap: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: t.waiting, color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    pending_confirmation: { label: t.waiting, color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Loader2 className="w-4 h-4 animate-spin" /> },
    acknowledged: { label: t.staffOnTheWay, color: "bg-blue-100 text-blue-700 border-blue-200", icon: <Bell className="w-4 h-4" /> },
    completed: { label: t.completed, color: "bg-green-100 text-green-700 border-green-200", icon: <Check className="w-4 h-4" /> },
    cancelled: { label: t.cancelled, color: "bg-gray-100 text-gray-600 border-gray-200", icon: <X className="w-4 h-4" /> },
  };
  const s = statusMap[status] ?? statusMap.pending;
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${s.color}`} data-testid="status-bubble">
      {s.icon}
      {s.label}
    </div>
  );
}

function StatusTracker({
  submitted, ctx, t, onDone,
}: {
  submitted: SubmittedRequest;
  ctx: QrContext;
  t: T;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-5 text-center px-4" data-testid="status-tracker-screen">
      {submitted.status === "completed" ? (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="w-10 h-10 text-green-600" />
        </motion.div>
      ) : submitted.isNegativeFeedback ? (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-orange-500" />
        </motion.div>
      ) : (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="w-10 h-10 text-green-600" />
        </motion.div>
      )}

      <div>
        <h2 className="text-xl font-bold text-gray-900" data-testid="text-submitted">
          {submitted.isNegativeFeedback ? t.thanksForFeedback : submitted.label}
        </h2>
        {submitted.isNegativeFeedback ? (
          <p className="text-gray-500 text-sm mt-1">{t.managerAlert}</p>
        ) : submitted.isPositiveFeedback ? (
          <p className="text-gray-500 text-sm mt-1">{t.positiveMsg}</p>
        ) : (
          <p className="text-gray-500 text-sm mt-1">{t.submitted}</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-gray-400">{t.trackingStatus}</p>
        <StatusBubble status={submitted.status} t={t} />
      </div>

      {submitted.isPositiveFeedback && (
        <div className="flex flex-col gap-2 w-full">
          <a
            href={`https://www.google.com/maps/search/${encodeURIComponent(ctx.restaurantName)}`}
            target="_blank" rel="noreferrer"
            data-testid="link-share-google"
            className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-teal-600 text-teal-700 text-center block"
          >
            {t.shareGoogle}
          </a>
          <a
            href={`https://www.tripadvisor.com/Search?q=${encodeURIComponent(ctx.restaurantName)}`}
            target="_blank" rel="noreferrer"
            data-testid="link-share-tripadvisor"
            className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-green-500 text-green-700 text-center block"
          >
            {t.shareTripAdvisor}
          </a>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full mt-2">
        <button
          data-testid="button-submit-another"
          onClick={onDone}
          className="w-full py-3 rounded-xl font-bold text-white text-sm"
          style={{ backgroundColor: PRIMARY }}
        >
          {t.submitAnother}
        </button>
        <button data-testid="button-back-to-home" onClick={onDone} className="text-sm text-gray-500 underline">
          {t.backToMenu}
        </button>
      </div>
    </div>
  );
}

function RequestButton({
  icon, label, onClick, testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-white border-2 border-gray-100 shadow-sm active:scale-95 transition-transform text-center min-h-[90px] hover:border-teal-300 hover:bg-teal-50"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <span className="text-teal-700">{icon}</span>
      <span className="text-xs font-semibold text-gray-700 leading-tight">{label}</span>
    </button>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2 justify-center" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          data-testid={`star-${n}`}
          onClick={() => onChange(n)}
          className={`transition-transform active:scale-90 ${n <= value ? "text-yellow-400" : "text-gray-300"}`}
        >
          <Star className="w-9 h-9 fill-current" />
        </button>
      ))}
    </div>
  );
}

function WaiterCallButton({ token }: { token: string }) {
  const [sent, setSent] = useState(false);
  const [alerting, setAlerting] = useState(false);
  return (
    <button
      disabled={alerting || sent}
      onClick={async () => {
        setAlerting(true);
        try {
          await fetch("/api/table-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, requestType: "call_server" }),
          });
          setSent(true);
        } catch {
          setSent(false);
        } finally { setAlerting(false); }
      }}
      className="bg-white border border-teal-600 text-teal-700 rounded-lg py-2.5 text-sm font-semibold"
      data-testid="button-alert-waiter-menu-error"
    >
      {sent ? "Waiter Alerted" : alerting ? "Alerting…" : "Alert a Waiter"}
    </button>
  );
}

function FoodOrderFlow({
  ctx, t, token, onBack, onOrderPlaced,
}: {
  ctx: QrContext;
  t: T;
  token: string;
  onBack: () => void;
  onOrderPlaced: (requestId: string) => void;
}) {
  const [menuData, setMenuData] = useState<{ categories: Category[]; items: MenuItem[]; currency: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuLoadError, setMenuLoadError] = useState<string | null>(null);
  const [kitchenClosedInfo, setKitchenClosedInfo] = useState<{ nextOpenTime: string } | null>(null);
  const [tableUnavailableError, setTableUnavailableError] = useState<string | null>(null);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [cart, setCart] = useState<LocalCartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<{ menuItemId: string; name: string } | null>(null);

  const [resolvedPriceMap, setResolvedPriceMap] = useState<Map<string, { resolvedPrice: number; basePrice: number; ruleReason: string | null; hasRule: boolean; validTo?: string | null }>>(new Map());

  // join/separate dialog for multi-customer ordering
  const [showJoinDialogQr, setShowJoinDialogQr] = useState(false);
  const [tableSessionInfoQr, setTableSessionInfoQr] = useState<{
    sessionExists: boolean; sessionToken: string | null; orderCount: number; canJoin: boolean;
  } | null>(null);
  const [qrSessionJoining, setQrSessionJoining] = useState(false);

  // shared table session items (items placed by other customers at the same table)
  interface SharedSessionItem { id: number; order_id: number; menu_item_id: string; name: string; quantity: number; price: string; notes: string | null; guest_name: string | null; }
  const [sharedSessionItems, setSharedSessionItems] = useState<SharedSessionItem[]>([]);
  const sessionChoice = sessionStorage.getItem(`qr_session_choice_${token}`);

  // Fetch shared items when user is in join mode
  const refreshSharedItems = useCallback(() => {
    const choice = sessionStorage.getItem(`qr_session_choice_${token}`);
    if (choice !== "join") return;
    fetch(`/api/qr/table/${encodeURIComponent(token)}/session/items`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setSharedSessionItems(data.items ?? []))
      .catch(() => {});
  }, [token]);

  // Wire join/separate choice to session API
  const handleJoinTableOrder = useCallback(async () => {
    setQrSessionJoining(true);
    try {
      const res = await fetch(`/api/qr/table/${encodeURIComponent(token)}/session/start`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem(`qr_session_choice_${token}`, "join");
        sessionStorage.setItem(`qr_session_token_${token}`, data.session?.session_token ?? "");
      }
    } catch {}
    setQrSessionJoining(false);
    setShowJoinDialogQr(false);
    // Immediately load other items from the shared session
    setTimeout(refreshSharedItems, 200);
  }, [token, refreshSharedItems]);

  const handleSeparateOrder = useCallback(() => {
    sessionStorage.setItem(`qr_session_choice_${token}`, "separate");
    setShowJoinDialogQr(false);
  }, [token]);

  // progressive menu loading — categories first, then items for selected category
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryItemsMap, setCategoryItemsMap] = useState<Record<string, MenuItem[]>>({});
  const [catItemsLoading, setCatItemsLoading] = useState(false);

  useEffect(() => {
    if (!ctx.outletId) return;

    const savedChoice = sessionStorage.getItem(`qr_session_choice_${token}`);

    // progressive loading — fetch categories first (fast, small payload)
    // then load guest session in parallel; items fetched per-category on demand
    Promise.all([
      fetch(`/api/guest/menu/${ctx.outletId}/categories`).then(r => r.json()),
      fetch(`/api/guest/${ctx.outletId}/${token}`).then(r => r.json()),
    ]).then(([catData, guestData]) => {
      setMenuData({ categories: catData.categories, items: [], currency: catData.currency });
      if (catData.categories?.length) {
        setCategories(catData.categories.filter((c: Category) => c.active !== false));
        setSelCat(catData.categories[0]?.id ?? null);
      }
      if (guestData.session?.id) setSessionId(guestData.session.id);

      // session lifecycle — check for active QR session and handle join/first-diner flows
      if (!savedChoice) {
        fetch(`/api/qr/table/${encodeURIComponent(token)}/session`)
          .then(r => r.ok ? r.json() : null)
          .then(info => {
            if (!info) return;
            // Kitchen-closed check: outlet is not open for service
            if (info.outletHours && !info.outletHours.isOpen) {
              setKitchenClosedInfo({ nextOpenTime: info.outletHours.nextOpenTime || "soon" });
              return;
            }
            if (info.sessionExists && info.canJoin) {
              // Subsequent diner — show join/separate dialog
              setTableSessionInfoQr(info);
              setShowJoinDialogQr(true);
            } else if (info.sessionExists && !info.canJoin) {
              // table is occupied by another party with all orders paid
              setTableUnavailableError("This table is currently occupied by another party and is not accepting new orders.");
            } else if (!info.sessionExists) {
              // First diner — auto-create a session so subsequent diners can join
              fetch(`/api/qr/table/${encodeURIComponent(token)}/session/start`, { method: "POST" })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data?.session) {
                    sessionStorage.setItem(`qr_session_choice_${token}`, "separate");
                    sessionStorage.setItem(`qr_session_token_${token}`, data.session.session_token ?? "");
                  }
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
      }
    }).catch(() => {
      setMenuLoadError("Could not load menu. Check your connection.");
    }).finally(() => setMenuLoading(false));
  }, [ctx.outletId, token]);

  // load items for selected category on demand
  useEffect(() => {
    if (!selCat || !ctx.outletId) return;
    if (categoryItemsMap[selCat]) return; // already loaded
    setCatItemsLoading(true);
    fetch(`/api/guest/menu/${ctx.outletId}/categories/${selCat}/items`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => {
        const items: MenuItem[] = data.items ?? [];
        setCategoryItemsMap(prev => ({ ...prev, [selCat]: items }));
        // Resolve pricing for newly loaded items
        if (items.length && ctx.outletId) {
          fetch("/api/guest/pricing/resolve/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: items.map(m => ({ menuItemId: m.id })),
              outletId: ctx.outletId,
              orderType: "dine_in",
              orderTime: new Date().toISOString(),
            }),
          })
            .then(r => r.ok ? r.json() : [])
            .then((resolved: { menuItemId: string; resolvedPrice: number; basePrice: number; ruleReason: string | null; hasRule: boolean }[]) => {
              setResolvedPriceMap(prev => {
                const next = new Map(prev);
                for (const r of resolved) next.set(r.menuItemId, r);
                return next;
              });
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setCatItemsLoading(false));
  }, [selCat, ctx.outletId, categoryItemsMap]);

  // items come from per-category map (progressive loading)
  const filteredItems = selCat ? (categoryItemsMap[selCat] ?? []) : [];

  function addToCart(item: MenuItem, note = "") {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id);
      if (existing) return prev.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      const resolved = resolvedPriceMap.get(item.id);
      const resolvedPrice = resolved?.resolvedPrice ?? Number(item.price);
      return [...prev, { menuItemId: item.id, name: item.name, price: resolvedPrice, quantity: 1, note }];
    });
  }

  function updateItemNote(menuItemId: string, note: string) {
    setCart(prev => prev.map(c => c.menuItemId === menuItemId ? { ...c, note } : c));
  }

  function saveCartItemModification(menuItemId: string, mod: import("@/components/modifications/ModificationDrawer").FoodModification) {
    setCart(prev => prev.map(c => c.menuItemId === menuItemId ? { ...c, foodModification: mod } : c));
    setCustomizeItem(null);
  }

  function setQty(menuItemId: string, qty: number) {
    if (qty <= 0) { setCart(prev => prev.filter(c => c.menuItemId !== menuItemId)); return; }
    setCart(prev => prev.map(c => c.menuItemId === menuItemId ? { ...c, quantity: qty } : c));
  }

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  async function placeOrder() {
    if (cart.length === 0 || !sessionId) return;
    setPlacing(true);
    try {
      const sessionChoice = sessionStorage.getItem(`qr_session_choice_${token}`);

      // true join semantics — if customer chose "Join Table's Order",
      // add items directly to the existing shared order (same KOT/orderId) instead of creating a new order
      if (sessionChoice === "join") {
        // Get the shared order ID from the active session
        const sharedOrderRes = await fetch(`/api/qr/table/${encodeURIComponent(token)}/session/shared-order`);
        const sharedOrderData = sharedOrderRes.ok ? await sharedOrderRes.json() : {};
        const sharedOrderId = sharedOrderData.sharedOrderId;

        if (sharedOrderId) {
          // Push cart items to server-side guest cart first, then add to shared order
          for (const cartItem of cart) {
            const fm = cartItem.foodModification;
            const hasActiveMod = fm && (fm.spiceLevel || fm.saltLevel || fm.removedIngredients.length > 0 || fm.allergyFlags.length > 0 || fm.allergyDetails?.trim() || fm.specialNotes?.trim());
            await fetch(`/api/guest/session/${sessionId}/cart`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                menuItemId: cartItem.menuItemId,
                quantity: cartItem.quantity,
                notes: cartItem.note || undefined,
                metadata: hasActiveMod ? { foodModification: fm } : undefined,
              }),
            });
          }
          // Add all guest cart items to the shared order directly
          const addRes = await fetch(`/api/qr/table/${encodeURIComponent(token)}/session/add-to-shared-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guestSessionId: sessionId, sharedOrderId }),
          });
          if (!addRes.ok) throw new Error("Failed to add items to table order. Please try again.");
          // Notify staff about the new items added to the shared order
          const guestNote = cart.map(c => c.note ? `${c.quantity}x ${c.name} (${c.note})` : `${c.quantity}x ${c.name}`).join(", ");
          const notifyRes = await fetch("/api/table-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              requestType: "order_food",
              priority: "medium",
              guestNote,
              details: {
                items: cart.map(c => ({ menuItemId: c.menuItemId, name: c.name, quantity: c.quantity, unitPrice: c.price, note: c.note || null })),
                totalAmount: cartTotal,
                currency: menuData?.currency ?? ctx.currency,
                sessionId,
                orderId: sharedOrderId,
                joinedSharedOrder: true,
              },
            }),
          });
          const notifyData = await notifyRes.json();
          setCart([]);
          onOrderPlaced(notifyData.id ?? sharedOrderId);
          return;
        }
        // If no shared order found (e.g., first customer's order hasn't been submitted yet), fall through to create own
      }

      // Default path (separate order or join with no existing shared order)
      for (const cartItem of cart) {
        const fm = cartItem.foodModification;
        const hasActiveMod = fm && (fm.spiceLevel || fm.saltLevel || fm.removedIngredients.length > 0 || fm.allergyFlags.length > 0 || fm.allergyDetails?.trim() || fm.specialNotes?.trim());
        await fetch(`/api/guest/session/${sessionId}/cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            menuItemId: cartItem.menuItemId,
            quantity: cartItem.quantity,
            notes: cartItem.note || undefined,
            metadata: hasActiveMod ? { foodModification: fm } : undefined,
          }),
        });
      }
      const orderRes = await fetch(`/api/guest/session/${sessionId}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!orderRes.ok) throw new Error("Failed to submit order. Please try again.");
      const orderData: { orderId?: string; id?: string; order?: { id?: string } } = await orderRes.json();
      const orderId = orderData.orderId ?? orderData.id ?? orderData.order?.id ?? null;

      // Link this new order to the shared session (for subsequent joiners)
      if (orderId) {
        fetch(`/api/qr/table/${encodeURIComponent(token)}/session/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        }).catch(() => {});
      }

      const orderItems = cart.map(c => ({
        menuItemId: c.menuItemId,
        name: c.name,
        quantity: c.quantity,
        unitPrice: c.price,
        note: c.note || null,
      }));
      const guestNote = cart.map(c => c.note ? `${c.quantity}x ${c.name} (${c.note})` : `${c.quantity}x ${c.name}`).join(", ");
      const res = await fetch("/api/table-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          requestType: "order_food",
          priority: "medium",
          guestNote,
          details: {
            items: orderItems,
            totalAmount: cartTotal,
            currency: menuData?.currency ?? ctx.currency,
            sessionId,
            orderId,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) onOrderPlaced(data.id);
    } finally {
      setPlacing(false);
    }
  }

  if (menuLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>;
  }

  if (kitchenClosedInfo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4" data-testid="kitchen-closed-screen">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Kitchen is Closed</h2>
        <p className="text-sm text-gray-500">
          We are not taking orders right now. We will reopen{" "}
          <span className="font-semibold text-gray-700">{kitchenClosedInfo.nextOpenTime}</span>.
        </p>
        <button
          onClick={onBack}
          className="mt-2 text-sm text-teal-600 underline"
          data-testid="button-kitchen-closed-back"
        >
          Go back
        </button>
      </div>
    );
  }

  if (tableUnavailableError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4" data-testid="table-unavailable-screen-food">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-amber-800" data-testid="text-table-unavailable-food">Table Unavailable</h2>
          <p className="text-sm text-amber-700">{tableUnavailableError}</p>
          <p className="text-xs text-gray-400">Please speak with our staff for assistance.</p>
        </div>
        <WaiterCallButton token={token} />
      </div>
    );
  }

  if (menuLoadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4" data-testid="menu-load-error-screen">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Menu Unavailable</h2>
        <p className="text-sm text-gray-500">{menuLoadError}</p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <button
            onClick={() => { setMenuLoadError(null); setMenuLoading(true); window.location.reload(); }}
            className="bg-teal-600 text-white rounded-lg py-2.5 text-sm font-semibold"
            data-testid="button-retry-menu"
          >
            Retry
          </button>
          {token && (
            <WaiterCallButton token={token} />
          )}
        </div>
      </div>
    );
  }

  if (showJoinDialogQr && tableSessionInfoQr?.sessionExists) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 gap-5 text-center" data-testid="dialog-join-or-separate-qr">
        <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center">
          <Users className="h-7 w-7 text-teal-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">Table Already Has an Open Order</h2>
          <p className="text-sm text-gray-500">
            Your table already has{" "}
            {tableSessionInfoQr.orderCount > 0
              ? `${tableSessionInfoQr.orderCount} active order${tableSessionInfoQr.orderCount > 1 ? "s" : ""}`
              : "an active order"}
            . Would you like to add to it or start a separate order?
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <button
            className="w-full flex items-center gap-3 bg-teal-600 text-white px-4 py-3 rounded-xl font-medium hover:bg-teal-700 transition-colors disabled:opacity-60"
            onClick={handleJoinTableOrder}
            disabled={qrSessionJoining}
            data-testid="button-join-table-order-qr"
          >
            <span className="text-xl">👥</span>
            <div className="text-left">
              <div className="font-semibold text-sm">Add to Table's Order</div>
              <div className="text-xs text-teal-100">Your items join the shared order</div>
            </div>
          </button>
          <button
            className="w-full flex items-center gap-3 border border-gray-200 text-gray-700 px-4 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            onClick={handleSeparateOrder}
            data-testid="button-start-separate-order-qr"
          >
            <span className="text-xl">📋</span>
            <div className="text-left">
              <div className="font-semibold text-sm">Start My Own Order</div>
              <div className="text-xs text-gray-400">A separate order (waiter can merge at billing)</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (showCart) {
    // Refresh shared items when cart is opened
    const isJoinMode = sessionStorage.getItem(`qr_session_choice_${token}`) === "join";
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-2">
          <button data-testid="button-back-cart" onClick={() => setShowCart(false)} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold">{t.cart}</h2>
          {isJoinMode && (
            <span className="ml-auto text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5" data-testid="badge-join-mode">
              Shared Table
            </span>
          )}
        </div>

        {/* Shared session items — "Others at your table" */}
        {isJoinMode && sharedSessionItems.length > 0 && (
          <div className="bg-teal-50 rounded-xl p-3 border border-teal-100" data-testid="section-shared-items">
            <p className="text-xs font-semibold text-teal-700 mb-2 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Others at your table
            </p>
            <div className="flex flex-col gap-1.5">
              {sharedSessionItems.map(si => (
                <div key={si.id} data-testid={`shared-item-${si.id}`} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 flex-1 min-w-0 truncate">{si.name} <span className="text-gray-400">×{si.quantity}</span></span>
                  <span className="text-gray-500 text-xs ml-2 shrink-0">{formatPrice(Number(si.price) * si.quantity, menuData?.currency ?? "USD")}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-teal-600 mt-2 italic">These items were added by others — you can only remove your own items below.</p>
          </div>
        )}

        {isJoinMode && sharedSessionItems.length > 0 && cart.length > 0 && (
          <p className="text-xs font-semibold text-gray-500 px-1" data-testid="label-my-items">Your items</p>
        )}

        {cart.length === 0 ? (
          <p className="text-center text-gray-400 py-12">{t.emptyCart}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {cart.map(c => {
              const hasMod = c.foodModification && (
                c.foodModification.spiceLevel ||
                c.foodModification.saltLevel ||
                c.foodModification.removedIngredients.length > 0 ||
                c.foodModification.allergyFlags.length > 0 ||
                c.foodModification.specialNotes?.trim()
              );
              return (
                <div key={c.menuItemId} data-testid={`cart-item-${c.menuItemId}`} className="bg-white rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-xs text-gray-500">{formatPrice(c.price, menuData?.currency ?? "USD")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button data-testid={`button-dec-${c.menuItemId}`} onClick={() => setQty(c.menuItemId, c.quantity - 1)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-semibold text-sm">{c.quantity}</span>
                      <button data-testid={`button-inc-${c.menuItemId}`} onClick={() => setQty(c.menuItemId, c.quantity + 1)} className="w-7 h-7 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      data-testid={`input-item-note-${c.menuItemId}`}
                      type="text"
                      value={c.note}
                      onChange={e => updateItemNote(c.menuItemId, e.target.value)}
                      placeholder={t.yourNote}
                      className="flex-1 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-teal-300 bg-gray-50"
                    />
                    <button
                      data-testid={`button-customize-${c.menuItemId}`}
                      onClick={() => setCustomizeItem({ menuItemId: c.menuItemId, name: c.name })}
                      className={`shrink-0 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${hasMod ? "bg-teal-50 text-teal-700 border-teal-300" : "bg-gray-50 text-gray-500 border-gray-200 hover:border-teal-300"}`}
                    >
                      {hasMod ? "✏️ customized" : "✏️ customize"}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="border-t pt-3 flex justify-between text-sm font-bold text-gray-700">
              <span>Total</span>
              <span>{formatPrice(cartTotal, menuData?.currency ?? "USD")}</span>
            </div>
            <button
              data-testid="button-place-order"
              onClick={placeOrder}
              disabled={placing || !sessionId}
              className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: PRIMARY }}
            >
              {placing ? <><Loader2 className="w-4 h-4 animate-spin" />{t.sending}</> : t.placeOrder}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 mb-2">
        <button data-testid="button-back-food" onClick={onBack} className="p-2 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold">{t.orderFood}</h2>
        {cartCount > 0 && (
          <button data-testid="button-view-cart" onClick={() => { setShowCart(true); refreshSharedItems(); }} className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-semibold" style={{ backgroundColor: PRIMARY }}>
            <ShoppingCart className="w-4 h-4" />
            {cartCount}
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" data-testid="category-tabs">
        {categories.map(cat => (
          <button
            key={cat.id}
            data-testid={`tab-cat-${cat.id}`}
            onClick={() => setSelCat(cat.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selCat === cat.id ? "text-white" : "bg-gray-100 text-gray-600"}`}
            style={selCat === cat.id ? { backgroundColor: PRIMARY } : {}}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {catItemsLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      )}
      {!catItemsLoading && filteredItems.length === 0 && <p className="text-center text-gray-400 py-8">{t.noItems}</p>}

      <div className="flex flex-col gap-3">
        {filteredItems.map(item => {
          const cartEntry = cart.find(c => c.menuItemId === item.id);
          const resolved = resolvedPriceMap.get(item.id);
          const hasSpecialPrice = resolved?.hasRule && resolved.resolvedPrice !== resolved.basePrice;
          const displayPrice = resolved?.resolvedPrice ?? Number(item.price);
          return (
            <div key={item.id} data-testid={`card-item-${item.id}`} className="bg-white rounded-xl p-3 border border-gray-100 flex gap-3">
              {item.image ? (
                <img
                  src={toWebPUrl(item.image, 128)}
                  alt={item.name}
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  loading="lazy"
                  onError={e => {
                    const el = e.target as HTMLImageElement;
                    if (el.src !== item.image) el.src = item.image;
                  }}
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <ChefHat className="w-7 h-7 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {item.isVeg && <span className="text-green-600"><Leaf className="w-3 h-3" /></span>}
                    </div>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>}
                    {hasSpecialPrice && resolved?.ruleReason && (
                      <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200" data-testid={`badge-special-price-${item.id}`}>
                        🏷️ {resolved.ruleReason}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-teal-700 whitespace-nowrap" data-testid={`text-price-qr-${item.id}`}>
                      {formatPrice(displayPrice, menuData?.currency ?? "USD")}
                    </p>
                    {hasSpecialPrice && (
                      <p className="text-xs text-gray-400 line-through" data-testid={`text-base-price-qr-${item.id}`}>
                        {formatPrice(Number(item.price), menuData?.currency ?? "USD")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  {cartEntry ? (
                    <div className="flex items-center gap-2">
                      <button data-testid={`button-dec-menu-${item.id}`} onClick={() => setQty(item.id, cartEntry.quantity - 1)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-semibold text-sm">{cartEntry.quantity}</span>
                      <button data-testid={`button-inc-menu-${item.id}`} onClick={() => setQty(item.id, cartEntry.quantity + 1)} className="w-7 h-7 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      data-testid={`button-add-${item.id}`}
                      onClick={() => addToCart(item)}
                      className="px-3 py-1 rounded-lg text-white text-xs font-semibold"
                      style={{ backgroundColor: PRIMARY }}
                    >
                      {t.addToCart}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Suspense fallback={null}>
        {customizeItem && (
          <ModificationDrawer
            open={!!customizeItem}
            onClose={() => setCustomizeItem(null)}
            itemName={customizeItem.name}
            initialModification={cart.find(c => c.menuItemId === customizeItem.menuItemId)?.foodModification}
            onSave={(mod) => saveCartItemModification(customizeItem.menuItemId, mod)}
          />
        )}
      </Suspense>
    </div>
  );
}

function FeedbackFlow({
  ctx, t, token, onBack, onDone,
}: {
  ctx: QrContext;
  t: T;
  token: string;
  onBack: () => void;
  onDone: (submitted: SubmittedRequest) => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [complaintCat, setComplaintCat] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isPositive = rating >= 4;
  const isNegative = rating > 0 && rating <= 3;

  const complaintCats = [
    { key: "food_quality", label: t.foodQuality },
    { key: "service", label: t.service },
    { key: "cleanliness", label: t.cleanliness },
    { key: "noise", label: t.noise },
    { key: "wait_time", label: t.waitTime },
    { key: "other", label: t.otherIssue },
  ];

  async function submit() {
    if (!rating) return;
    setSubmitting(true);
    try {
      const note = isNegative
        ? `Rating: ${rating}/5 | Issue: ${complaintCat || "general"} | Comment: ${comment}`
        : `Rating: ${rating}/5 | Comment: ${comment}`;
      const res = await fetch("/api/table-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          requestType: "feedback",
          priority: isNegative ? "high" : "low",
          guestNote: note,
          details: { rating, comment, complaintCategory: complaintCat || null },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onDone({
          id: data.id,
          status: data.status,
          label: t.thanksForFeedback,
          isPositiveFeedback: isPositive,
          isNegativeFeedback: isNegative,
          restaurantName: ctx.restaurantName,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button data-testid="button-back-feedback" onClick={onBack} className="p-2 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold">{t.rateExperience}</h2>
      </div>

      <StarRating value={rating} onChange={setRating} />

      {isNegative && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-gray-700">{t.complaintCategory}</p>
          <div className="grid grid-cols-2 gap-2">
            {complaintCats.map(c => (
              <button
                key={c.key}
                data-testid={`complaint-cat-${c.key}`}
                onClick={() => setComplaintCat(c.key)}
                className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${complaintCat === c.key ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-600"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {rating > 0 && (
        <textarea
          data-testid="input-feedback-comment"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder={isNegative ? t.describeIssue : t.yourComment}
          className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-teal-400"
          rows={3}
        />
      )}

      <button
        data-testid="button-submit-feedback"
        onClick={submit}
        disabled={!rating || submitting}
        className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ backgroundColor: PRIMARY }}
      >
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />{t.sending}</> : t.submitFeedback}
      </button>
    </div>
  );
}

type SpecialType = "birthday" | "dietary" | "temperature" | "music" | "other";

function SpecialRequestFlow({
  t, token, onBack, onDone,
}: {
  t: T;
  token: string;
  onBack: () => void;
  onDone: (submitted: SubmittedRequest) => void;
}) {
  const [selectedType, setSelectedType] = useState<SpecialType | null>(null);
  const [text, setText] = useState("");
  const [tempPref, setTempPref] = useState("current");
  const [submitting, setSubmitting] = useState(false);

  const types: { type: SpecialType; icon: React.ReactNode; label: string }[] = [
    { type: "birthday", icon: <Sparkles className="w-5 h-5" />, label: t.birthdaySetup },
    { type: "dietary", icon: <Leaf className="w-5 h-5" />, label: t.dietaryNeed },
    { type: "temperature", icon: <ThermometerSun className="w-5 h-5" />, label: t.temperature },
    { type: "music", icon: <Music className="w-5 h-5" />, label: t.music },
    { type: "other", icon: <HelpCircle className="w-5 h-5" />, label: t.otherRequest },
  ];

  async function submit() {
    if (!selectedType) return;
    setSubmitting(true);
    try {
      const note = selectedType === "temperature" ? `Temperature preference: ${tempPref}. ${text}`.trim() : text;
      const res = await fetch("/api/table-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          requestType: "other",
          priority: "medium",
          guestNote: `[${selectedType.toUpperCase()}] ${note}`,
          details: { specialType: selectedType, note, tempPref: selectedType === "temperature" ? tempPref : undefined },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onDone({ id: data.id, status: data.status, label: t.submitted });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          data-testid="button-back-special"
          onClick={selectedType ? () => setSelectedType(null) : onBack}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold">{t.specialRequest}</h2>
      </div>

      {!selectedType ? (
        <div className="flex flex-col gap-2">
          {types.map(({ type, icon, label }) => (
            <button
              key={type}
              data-testid={`special-type-${type}`}
              onClick={() => setSelectedType(type)}
              className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-100 text-left hover:border-teal-300"
            >
              <span className="text-teal-600">{icon}</span>
              <span className="font-medium text-sm text-gray-800">{label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {selectedType === "temperature" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-gray-700">{t.temperatureLabel}</p>
              <div className="flex gap-2">
                {(["cooler", "current", "warmer"] as const).map(p => (
                  <button
                    key={p}
                    data-testid={`temp-${p}`}
                    onClick={() => setTempPref(p)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${tempPref === p ? "border-teal-500 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-600"}`}
                  >
                    {t[p]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-gray-700">
              {selectedType === "birthday" ? t.birthdayMsg
                : selectedType === "dietary" ? t.dietaryMsg
                : selectedType === "music" ? t.musicLabel
                : t.otherLabel}
            </p>
            <textarea
              data-testid="input-special-text"
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-teal-400"
              rows={3}
              placeholder={t.yourNote}
            />
          </div>
          <button
            data-testid="button-submit-special"
            onClick={submit}
            disabled={submitting || (!text && selectedType !== "temperature")}
            className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: PRIMARY }}
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />{t.sending}</> : t.send}
          </button>
        </div>
      )}
    </div>
  );
}

const VALID_BACKEND_TYPES = ["call_server", "order_food", "request_bill", "feedback", "water_refill", "cleaning", "other"] as const;
type BackendRequestType = (typeof VALID_BACKEND_TYPES)[number];

interface ImmediateRequest {
  type: string;
  label: string;
  icon: React.ReactNode;
  priority: "high" | "medium" | "low";
  backendType: BackendRequestType;
}

export default function TableQrPage() {
  const search = useSearch();
  const routeParams = useParams<{ tenantSlug?: string; outletId?: string; tableId?: string }>();
  const params = new URLSearchParams(search);
  const token = params.get("token");

  const [lang, setLang] = useState<Lang>("en");
  const t = TRANSLATIONS[lang];

  const { ctx, error, loading } = useQrToken(token);

  const [flow, setFlow] = useState<Flow>("home");
  const [submittedRequest, setSubmittedRequest] = useState<SubmittedRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // table-unavailable state when canJoin=false
  const [tableUnavailableError, setTableUnavailableError] = useState<string | null>(null);

  // restaurant info for error state fallback
  const [qrRestaurantInfo, setQrRestaurantInfo] = useState<{ restaurantName: string | null; phone: string | null; logoUrl: string | null } | null>(null);
  useEffect(() => {
    if (!token) return;
    // Pass outletId from ctx (resolved from token) or URL params as a fallback for invalid/unknown tokens
    const outletIdParam = ctx?.outletId || routeParams?.outletId || null;
    const url = outletIdParam
      ? `/api/qr/restaurant-info?token=${encodeURIComponent(token)}&outletId=${encodeURIComponent(outletIdParam)}`
      : `/api/qr/restaurant-info?token=${encodeURIComponent(token)}`;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(info => { if (info) setQrRestaurantInfo(info); })
      .catch(() => {});
  }, [token, ctx?.outletId, routeParams?.outletId]);

  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [vehicleRetrievalRequested, setVehicleRetrievalRequested] = useState(false);
  const [vehicleRetrievalPending, setVehicleRetrievalPending] = useState(false);
  const [showRetrievalConfirm, setShowRetrievalConfirm] = useState(false);
  const [scheduledDelayMinutes, setScheduledDelayMinutes] = useState<number>(0);
  const [ticketInfo, setTicketInfo] = useState<{ maskedPlate?: string; vehicleType?: string; status?: string; ticketNumber?: string } | null>(null);
  const [retrievalConfirmedAt, setRetrievalConfirmedAt] = useState<Date | null>(null);
  const [avgRetrievalMinutes, setAvgRetrievalMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!token || !ctx?.outletId) return;
    // First check if parking is enabled for this outlet
    fetch(`/api/parking/availability/${ctx.outletId}`)
      .then(r => r.ok ? r.json() : null)
      .then(async (data) => {
        if (data && data.parkingEnabled === true) {
          // Then check if this specific table has an active linked valet ticket
          const checkRes = await fetch(
            `/api/parking/guest-ticket-check?token=${encodeURIComponent(token!)}&outletId=${encodeURIComponent(ctx!.outletId!)}`
          );
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.hasActiveTicket) {
              setParkingAvailable(true);
              setTicketInfo({
                maskedPlate: checkData.maskedPlate,
                vehicleType: checkData.vehicleType,
                status: checkData.status,
                ticketNumber: checkData.ticketNumber,
              });
              // Fetch avg retrieval time from performance endpoint for estimated ready time
              try {
                const perfRes = await fetch(`/api/parking/valet-staff-performance/${ctx.outletId}`, { credentials: "include" });
                if (perfRes.ok) {
                  const perfData = await perfRes.json();
                  const avgMins = (perfData.performance as any[] ?? [])
                    .filter((p: any) => p.avgRetrievalMinutes > 0)
                    .map((p: any) => p.avgRetrievalMinutes);
                  if (avgMins.length > 0) {
                    setAvgRetrievalMinutes(avgMins.reduce((a: number, b: number) => a + b, 0) / avgMins.length);
                  } else {
                    setAvgRetrievalMinutes(8); // fallback: 8 min default
                  }
                }
              } catch {
                setAvgRetrievalMinutes(8);
              }
            }
          }
        }
      })
      .catch(() => {});
  }, [token, ctx?.outletId]);

  const handleRequestVehicleRetrieval = async () => {
    if (!token || !ctx?.outletId) return;
    setVehicleRetrievalPending(true);
    try {
      const res = await fetch("/api/parking/guest-retrieval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          outletId: ctx.outletId,
          scheduledDelayMinutes: scheduledDelayMinutes > 0 ? scheduledDelayMinutes : undefined,
        }),
      });
      if (res.ok) {
        setVehicleRetrievalRequested(true);
        setRetrievalConfirmedAt(new Date());
      }
    } catch {}
    setVehicleRetrievalPending(false);
    setShowRetrievalConfirm(false);
  };

  useGuestWebSocket(token, useCallback((event, payload) => {
    if (event === "table-request:updated") {
      const p = payload as { request?: { id: string; status: string } };
      const r = p?.request;
      if (r?.id) {
        setSubmittedRequest(prev => prev && r.id === prev.id ? { ...prev, status: r.status } : prev);
      }
    }
  }, []));

  const immediateRequests: ImmediateRequest[] = [
    { type: "call_server", label: t.callWaiter, icon: <Bell className="w-6 h-6" />, priority: "high", backendType: "call_server" },
    { type: "request_bill", label: t.requestBill, icon: <Receipt className="w-6 h-6" />, priority: "high", backendType: "request_bill" },
    { type: "water_refill", label: t.requestWater, icon: <Droplets className="w-6 h-6" />, priority: "medium", backendType: "water_refill" },
    { type: "cleaning", label: t.requestCleaning, icon: <Sparkles className="w-6 h-6" />, priority: "medium", backendType: "cleaning" },
    { type: "cutlery", label: t.requestCutlery, icon: <Utensils className="w-6 h-6" />, priority: "low", backendType: "other" },
    { type: "napkins", label: t.requestNapkins, icon: <Scissors className="w-6 h-6" />, priority: "low", backendType: "other" },
    { type: "takeaway_box", label: t.requestTakeawayBox, icon: <Package className="w-6 h-6" />, priority: "low", backendType: "other" },
    { type: "high_chair", label: t.requestHighChair, icon: <Baby className="w-6 h-6" />, priority: "medium", backendType: "other" },
    { type: "wheelchair", label: t.requestWheelchair, icon: <Accessibility className="w-6 h-6" />, priority: "high", backendType: "other" },
  ];

  const submitQuickRequest = useCallback(async (req: ImmediateRequest) => {
    if (!token) return;
    setSubmitting(true);
    setSubmittedRequest(null);
    try {
      const res = await fetch("/api/table-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          requestType: req.backendType,
          priority: req.priority,
          guestNote: req.backendType === "other" ? req.label : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmittedRequest({ id: data.id, status: data.status, label: req.label });
        setFlow("status-track");
      }
    } finally {
      setSubmitting(false);
    }
  }, [token]);

  const handleFlowDone = useCallback((submitted: SubmittedRequest) => {
    setSubmittedRequest(submitted);
    setFlow("status-track");
  }, []);

  const handleBackToHome = useCallback(() => {
    setFlow("home");
    setSubmittedRequest(null);
  }, []);

  const dir = t.dir;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  // table-unavailable screen when canJoin=false
  if (tableUnavailableError) {
    const isVerified = !!qrRestaurantInfo?.restaurantName;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 px-6 text-center gap-5" data-testid="table-unavailable-screen">
        {qrRestaurantInfo?.logoUrl && (
          <img
            src={qrRestaurantInfo.logoUrl}
            alt={qrRestaurantInfo.restaurantName || "Restaurant"}
            width={80}
            height={80}
            loading="lazy"
            className="h-16 w-auto object-contain"
          />
        )}
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-amber-800" data-testid="text-table-unavailable">Table Unavailable</h2>
          <p className="text-sm text-amber-700">{tableUnavailableError}</p>
          <p className="text-xs text-gray-400">Please speak with our staff for assistance.</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {isVerified && token && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/table-requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      token,
                      requestType: "call_server",
                      priority: "high",
                      guestNote: "Guest needs help — table may be turning over.",
                    }),
                  });
                  if (res.ok) alert("A staff member has been notified.");
                } catch (e) {
                  console.error("Failed to alert waiter:", e);
                }
              }}
              className="inline-flex items-center justify-center gap-2 bg-teal-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-teal-700"
              data-testid="button-call-waiter-unavailable"
            >
              <Bell className="w-4 h-4" />
              {t.callWaiter}
            </button>
          )}
          {qrRestaurantInfo?.phone && (
            <a
              href={`tel:${qrRestaurantInfo.phone}`}
              className="inline-flex items-center justify-center gap-2 border border-teal-300 text-teal-700 px-5 py-2.5 rounded-xl font-medium hover:bg-teal-50"
              data-testid="link-call-restaurant-unavailable"
            >
              <span>📞</span>
              Call {qrRestaurantInfo.restaurantName || "Restaurant"}
            </a>
          )}
        </div>
      </div>
    );
  }

  if (error || !ctx) {
    // Show waiter-alert ONLY when the token is verified to map to a real restaurant/table
    // (qrRestaurantInfo resolved means the token exists in DB, so staff can be notified)
    // For truly invalid/unknown tokens, show phone fallback or generic help message instead
    const isTokenVerified = !!qrRestaurantInfo?.restaurantName;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center gap-5" data-testid="error-screen">
        {qrRestaurantInfo?.logoUrl && (
          <img
            src={qrRestaurantInfo.logoUrl}
            alt={qrRestaurantInfo.restaurantName || "Restaurant"}
            width={80}
            height={80}
            loading="lazy"
            className="h-16 w-auto object-contain"
          />
        )}
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-800" data-testid="text-qr-error">{t.invalidQr}</h2>
          <p className="text-sm text-gray-500">
            This QR code is no longer valid. Please ask your server for a new one.
          </p>
          {error && <p className="text-xs text-gray-400">{error}</p>}
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {isTokenVerified && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/table-requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      token,
                      requestType: "call_server",
                      priority: "high",
                      guestNote: "Guest needs help — QR code is no longer working.",
                    }),
                  });
                  if (res.ok) {
                    alert("A staff member has been notified. They will come to your table shortly.");
                  }
                } catch (alertErr) {
                  console.error("Failed to alert waiter:", alertErr);
                }
              }}
              className="inline-flex items-center justify-center gap-2 bg-teal-600 text-white px-5 py-3 rounded-xl font-medium hover:bg-teal-700"
              data-testid="button-call-waiter-error"
            >
              <Bell className="w-4 h-4" />
              {t.callWaiter}
            </button>
          )}
          {qrRestaurantInfo?.phone && (
            <a
              href={`tel:${qrRestaurantInfo.phone}`}
              className="inline-flex items-center justify-center gap-2 border border-teal-300 text-teal-700 px-5 py-2.5 rounded-xl font-medium hover:bg-teal-50"
              data-testid="link-call-restaurant-qr"
            >
              <span>📞</span>
              Call {qrRestaurantInfo.restaurantName || "Restaurant"}
            </a>
          )}
          {!isTokenVerified && !qrRestaurantInfo?.phone && (
            <p className="text-sm text-gray-400">Please ask your server for help.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir={dir}>
      <PageTitle title="Order at Table" />
      <div className="max-w-md mx-auto flex flex-col min-h-screen">
        <div className="text-white px-5 pt-10 pb-6" style={{ backgroundColor: PRIMARY }}>
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-3">
              <div
                data-testid="img-restaurant-logo"
                className="w-12 h-12 rounded-xl bg-white bg-opacity-20 flex items-center justify-center flex-shrink-0 text-xl font-bold"
                aria-label="Restaurant logo"
              >
                {ctx.restaurantName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold" data-testid="text-restaurant-name">{ctx.restaurantName}</h1>
                {ctx.outletName && <p className="text-teal-100 text-sm">{ctx.outletName}</p>}
                <div className="flex items-center gap-3 mt-2">
                  <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full text-sm font-semibold" data-testid="text-table-number">
                    {t.table} {ctx.tableNumber}
                  </span>
                  {ctx.tableZone && (
                    <span className="text-teal-100 text-sm" data-testid="text-table-zone">{ctx.tableZone}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-1.5" data-testid="lang-toggle">
              {(["en", "ar", "hi"] as Lang[]).map(l => (
                <button
                  key={l}
                  data-testid={`lang-${l}`}
                  onClick={() => setLang(l)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${lang === l ? "bg-white text-teal-700" : "bg-white bg-opacity-20 text-white"}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 py-5 pb-8">
          <AnimatePresence mode="wait">
            {flow === "home" && (
              <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-5">
                <h2 className="text-base font-bold text-gray-800">{t.howCanWeHelp}</h2>

                <div className="grid grid-cols-3 gap-3" data-testid="request-grid">
                  {immediateRequests.map(req => (
                    <RequestButton
                      key={req.type}
                      testId={`button-request-${req.type}`}
                      icon={req.icon}
                      label={req.label}
                      onClick={() => submitQuickRequest(req)}
                    />
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <RequestButton
                    testId="button-order-food"
                    icon={<UtensilsCrossed className="w-6 h-6" />}
                    label={t.orderFood}
                    onClick={() => setFlow("food-order")}
                  />
                  <RequestButton
                    testId="button-give-feedback"
                    icon={<Star className="w-6 h-6" />}
                    label={t.feedback}
                    onClick={() => setFlow("feedback")}
                  />
                  <RequestButton
                    testId="button-special-request"
                    icon={<MessageSquare className="w-6 h-6" />}
                    label={t.specialRequest}
                    onClick={() => setFlow("special-request")}
                  />

                  {parkingAvailable && (
                    <>
                      {/* Parking status card */}
                      {ticketInfo && (() => {
                        const isReady = ticketInfo.status === "ready";
                        const isRetrieving = ticketInfo.status === "retrieving";
                        // Estimated ready time:
                        // - If scheduled: retrievalConfirmedAt + scheduledDelayMinutes
                        // - If "now": retrievalConfirmedAt + avgRetrievalMinutes (from perf endpoint)
                        const estimatedReadyAt = vehicleRetrievalRequested && retrievalConfirmedAt
                          ? new Date(retrievalConfirmedAt.getTime() + (
                              scheduledDelayMinutes > 0
                                ? scheduledDelayMinutes * 60000
                                : (avgRetrievalMinutes ?? 8) * 60000
                            ))
                          : null;
                        return (
                          <div
                            data-testid="parking-status-card"
                            className={`rounded-2xl border p-3 flex items-center gap-3 text-left transition-all ${
                              isReady ? "border-green-200 bg-green-50/80 animate-pulse" :
                              isRetrieving ? "border-amber-200 bg-amber-50/60" :
                              "border-blue-100 bg-blue-50/60"
                            }`}
                          >
                            <span className="text-2xl">{ticketInfo.vehicleType === "TWO_WHEELER" ? "🏍" : ticketInfo.vehicleType === "SUV" ? "🚙" : "🚗"}</span>
                            <div className="flex-1 min-w-0">
                              {ticketInfo.maskedPlate && (
                                <p className={`text-xs font-mono font-bold ${isReady ? "text-green-800" : "text-blue-800"}`} data-testid="parking-masked-plate">{ticketInfo.maskedPlate}</p>
                              )}
                              <p className={`text-xs capitalize ${isReady ? "text-green-700 font-semibold" : isRetrieving ? "text-amber-700" : "text-blue-600"}`} data-testid="parking-status-text">
                                {isReady ? "Your vehicle is ready! 🎉" : isRetrieving ? "Being retrieved..." : (ticketInfo.status?.replace(/_/g, " ") ?? "Parked")}
                              </p>
                              {ticketInfo.ticketNumber && (
                                <p className={`text-xs ${isReady ? "text-green-400" : "text-blue-400"}`}>#{ticketInfo.ticketNumber}</p>
                              )}
                              {estimatedReadyAt && !isReady && (
                                <p className="text-xs text-amber-600 mt-0.5" data-testid="parking-estimated-ready">
                                  Ready ~{estimatedReadyAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              )}
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                              isReady ? "bg-green-100 text-green-700" :
                              isRetrieving ? "bg-amber-100 text-amber-700" :
                              "bg-blue-100 text-blue-700"
                            }`}>
                              {isReady ? "✅ Ready" : isRetrieving ? "🔄 Retrieving" : "🅿️ Parked"}
                            </span>
                          </div>
                        );
                      })()}

                      {vehicleRetrievalRequested ? (
                        <div
                          data-testid="chip-vehicle-retrieval-requested"
                          className="flex flex-col items-center justify-center gap-1 py-4 rounded-2xl bg-green-50 border-2 border-green-200 text-green-700 text-sm font-semibold"
                        >
                          <div className="flex items-center gap-2">
                            <Check className="w-5 h-5" /> Vehicle retrieval requested ✓
                          </div>
                          {scheduledDelayMinutes > 0 && retrievalConfirmedAt && (
                            <p className="text-xs font-normal text-green-600" data-testid="scheduled-retrieval-note">
                              Your car will be ready in ~{scheduledDelayMinutes} minutes
                            </p>
                          )}
                          {scheduledDelayMinutes === 0 && (
                            <p className="text-xs font-normal text-green-600">Vehicle will be brought out shortly</p>
                          )}
                        </div>
                      ) : (
                        <button
                          data-testid="button-retrieve-vehicle"
                          onClick={() => setShowRetrievalConfirm(true)}
                          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-50 border-2 border-blue-200 text-blue-700 text-sm font-semibold active:scale-95 transition-transform hover:bg-blue-100"
                          style={{ WebkitTapHighlightColor: "transparent" }}
                        >
                          🚗 Retrieve My Vehicle
                        </button>
                      )}
                    </>
                  )}
                </div>

                {showRetrievalConfirm && (
                  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-end justify-center z-50 pb-8 px-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4" data-testid="modal-retrieval-confirm">
                      <div className="text-center">
                        <div className="text-4xl mb-2">🚗</div>
                        <h3 className="text-lg font-bold">Retrieve My Vehicle</h3>
                        <p className="text-sm text-gray-500 mt-1">When do you need your vehicle?</p>
                      </div>

                      {/* Schedule options */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ready time</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: "Now", value: 0, desc: "~5 min" },
                            { label: "In 5 min", value: 5, desc: "Scheduled" },
                            { label: "In 10 min", value: 10, desc: "Scheduled" },
                            { label: "In 15 min", value: 15, desc: "Scheduled" },
                            { label: "In 20 min", value: 20, desc: "Scheduled" },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              data-testid={`schedule-option-${opt.value}`}
                              onClick={() => setScheduledDelayMinutes(opt.value)}
                              className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors flex flex-col items-center ${scheduledDelayMinutes === opt.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
                            >
                              <span>{opt.label}</span>
                              <span className="text-xs text-gray-400">{opt.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          data-testid="button-confirm-retrieval"
                          onClick={handleRequestVehicleRetrieval}
                          disabled={vehicleRetrievalPending}
                          className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          {vehicleRetrievalPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Requesting...</> :
                            scheduledDelayMinutes > 0 ? `Schedule for ${scheduledDelayMinutes} min` : "Bring it now"}
                        </button>
                        <button
                          data-testid="button-cancel-retrieval"
                          onClick={() => setShowRetrievalConfirm(false)}
                          className="w-full py-2 rounded-xl text-sm text-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {submitting && (
                  <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl">
                      <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                      <p className="text-sm font-medium text-gray-700">{t.sending}</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {flow === "status-track" && submittedRequest && (
              <motion.div key="status-track" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <StatusTracker submitted={submittedRequest} ctx={ctx} t={t} onDone={handleBackToHome} />
              </motion.div>
            )}

            {flow === "food-order" && ctx.outletId && (
              <motion.div key="food-order" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <FoodOrderFlow
                  ctx={ctx}
                  t={t}
                  token={token!}
                  onBack={() => setFlow("home")}
                  onOrderPlaced={(reqId) => handleFlowDone({ id: reqId, status: "pending", label: t.orderPlaced })}
                />
              </motion.div>
            )}

            {flow === "food-order" && !ctx.outletId && (
              <motion.div key="food-order-nooutlet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <button data-testid="button-back-food-nooutlet" onClick={() => setFlow("home")} className="p-2 rounded-full hover:bg-gray-100">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-bold">{t.orderFood}</h2>
                </div>
                <p className="text-gray-500 text-sm" data-testid="text-food-unavailable">{t.foodOrderingUnavailable}</p>
              </motion.div>
            )}

            {flow === "feedback" && (
              <motion.div key="feedback" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <FeedbackFlow
                  ctx={ctx}
                  t={t}
                  token={token!}
                  onBack={() => setFlow("home")}
                  onDone={handleFlowDone}
                />
              </motion.div>
            )}

            {flow === "special-request" && (
              <motion.div key="special" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <SpecialRequestFlow
                  t={t}
                  token={token!}
                  onBack={() => setFlow("home")}
                  onDone={handleFlowDone}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
