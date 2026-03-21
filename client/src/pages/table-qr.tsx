import { useState, useEffect, useRef, useCallback } from "react";
import { useSearch, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Receipt, Droplets, Sparkles, Utensils, ShoppingCart, Star,
  MessageSquare, ChevronLeft, Check, Loader2, AlertCircle, X,
  Plus, Minus, Baby, ThermometerSun, Music, HelpCircle, Scissors,
  Package, Accessibility, UtensilsCrossed, Leaf, ChefHat,
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
      .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.message || "QR error")))
      .then(setCtx)
      .catch(e => setError(typeof e === "string" ? e : "Invalid QR code"))
      .finally(() => setLoading(false));
  }, [token]);

  return { ctx, error, loading };
}

function useGuestWebSocket(qrToken: string | null, onMessage: (event: string, payload: any) => void) {
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

      {!submitted.isPositiveFeedback && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400">{t.trackingStatus}</p>
          <StatusBubble status={submitted.status} t={t} />
        </div>
      )}

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
  const [selCat, setSelCat] = useState<string | null>(null);
  const [cart, setCart] = useState<LocalCartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!ctx.outletId) return;
    Promise.all([
      fetch(`/api/guest/menu/${ctx.outletId}`).then(r => r.json()),
      fetch(`/api/guest/${ctx.outletId}/${token}`).then(r => r.json()),
    ]).then(([menu, guestData]) => {
      setMenuData(menu);
      if (menu.categories?.length) setSelCat(menu.categories[0]?.id ?? null);
      if (guestData.session?.id) setSessionId(guestData.session.id);
    }).finally(() => setMenuLoading(false));
  }, [ctx.outletId, token]);

  const filteredItems = menuData?.items.filter(i => !selCat || i.categoryId === selCat) ?? [];

  function addToCart(item: MenuItem, note = "") {
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id);
      if (existing) return prev.map(c => c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1, note }];
    });
  }

  function updateItemNote(menuItemId: string, note: string) {
    setCart(prev => prev.map(c => c.menuItemId === menuItemId ? { ...c, note } : c));
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
      for (const cartItem of cart) {
        await fetch(`/api/guest/session/${sessionId}/cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: cartItem.menuItemId, quantity: cartItem.quantity }),
        });
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

  if (showCart) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-2">
          <button data-testid="button-back-cart" onClick={() => setShowCart(false)} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold">{t.cart}</h2>
        </div>
        {cart.length === 0 ? (
          <p className="text-center text-gray-400 py-12">{t.emptyCart}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {cart.map(c => (
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
                <input
                  data-testid={`input-item-note-${c.menuItemId}`}
                  type="text"
                  value={c.note}
                  onChange={e => updateItemNote(c.menuItemId, e.target.value)}
                  placeholder={t.yourNote}
                  className="mt-2 w-full border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-teal-300 bg-gray-50"
                />
              </div>
            ))}
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
          <button data-testid="button-view-cart" onClick={() => setShowCart(true)} className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-semibold" style={{ backgroundColor: PRIMARY }}>
            <ShoppingCart className="w-4 h-4" />
            {cartCount}
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" data-testid="category-tabs">
        {menuData?.categories.map(cat => (
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

      {filteredItems.length === 0 && <p className="text-center text-gray-400 py-8">{t.noItems}</p>}

      <div className="flex flex-col gap-3">
        {filteredItems.map(item => {
          const cartEntry = cart.find(c => c.menuItemId === item.id);
          return (
            <div key={item.id} data-testid={`card-item-${item.id}`} className="bg-white rounded-xl p-3 border border-gray-100 flex gap-3">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
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
                  </div>
                  <p className="text-sm font-bold text-teal-700 whitespace-nowrap">{formatPrice(Number(item.price), menuData?.currency ?? "USD")}</p>
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

  useGuestWebSocket(token, useCallback((event, payload) => {
    if (event === "table-request:updated" && payload?.request) {
      const r = payload.request;
      setSubmittedRequest(prev => prev && r.id === prev.id ? { ...prev, status: r.status } : prev);
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

  if (error || !ctx) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center gap-4" data-testid="error-screen">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-800" data-testid="text-qr-error">{t.invalidQr}</h2>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir={dir}>
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
                </div>

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
