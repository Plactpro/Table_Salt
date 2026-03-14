import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { onChefEvent, type ChefEvent } from "@/hooks/use-chef-events";
import { ChefHat, X } from "lucide-react";

type AnimState =
  | "idle"
  | "greeting"
  | "hover"
  | "click"
  | "scroll"
  | "success"
  | "error"
  | "sleeping"
  | "busy"
  | "tasting"
  | "setting-table";

const SPEECH: Record<string, string[]> = {
  idle: ["..."],
  greeting: ["Welcome, Chef! 👋", "Ready to cook!", "Let's cook something great!"],
  hover: ["Hi Chef! 🍳", "Hi there!", "Need help?", "What's cookin'?"],
  click: ["Ready to cook! 🔥", "At your service!", "Let's go! 💪"],
  scroll: ["Looking good! 👍", "Keep going!", "Nice browsing!"],
  success: ["Perfetto! 🎉", "Magnifique!", "Bravo! 👏", "Excellent work!"],
  error: ["Oops! 😅", "Don't worry, try again!", "We'll fix that!", "No worries!"],
  sleeping: ["*zzz* 😴"],
  "order-complete": ["Mmm, perfect! 🍽️", "Chef's kiss! 😘", "Bellissimo!", "Tastes amazing!"],
  "reservation-new": ["Table ready! 🪑", "Setting the table!", "Guests incoming!", "Welcome!"],
  "busy-hour": ["Rush hour! 🔥", "Let's keep up!", "Full speed ahead!", "Chop chop!"],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function ChefSVG({ state, eyeX, reducedMotion }: { state: AnimState; eyeX: ReturnType<typeof useMotionValue<number>>; reducedMotion: boolean }) {
  const eyeOffsetX = useTransform(eyeX, [-1, 1], [-4, 4]);

  const noAnim = reducedMotion;

  const getBodyAnim = () => {
    if (noAnim) return {};
    switch (state) {
      case "greeting": return { rotate: [-3, 3, -3], y: [0, -6, 0] };
      case "click": return { rotate: [0, 5, -5, 0], scale: [1, 1.08, 1] };
      case "success": return { y: [0, -12, 0, -8, 0], scale: [1, 1.08, 1, 1.04, 1] };
      case "error": return { x: [-3, 3, -3, 3, 0], rotate: [-2, 2, -2, 2, 0] };
      case "sleeping": return { rotate: [-1.5, 1.5, -1.5], y: [0, 2, 0] };
      case "scroll": return { rotate: [-4, 0], y: [0, -3, 0] };
      case "busy": return { rotate: [-4, 4, -4, 4, 0], y: [0, -4, 0, -4, 0], scale: [1, 1.03, 1, 1.03, 1] };
      case "tasting": return { y: [0, -4, 0], rotate: [-2, 2, -2] };
      case "setting-table": return { y: [0, -4, 0], rotate: [0, 3, 0, -3, 0] };
      default: return { y: [0, -2, 0], rotate: [0, 0.8, 0, -0.8, 0] };
    }
  };

  const getRightArmAnim = () => {
    if (noAnim) return {};
    switch (state) {
      case "idle": return { rotate: [0, -15, 0, -15, 0] };
      case "greeting": return { rotate: [-20, -70, -20, -70, -20] };
      case "success": return { rotate: [-30, -70, -30, -70, -30] };
      case "scroll": return { rotate: [-45, -70, -45] };
      case "click": return { rotate: [0, -40, 0] };
      case "busy": return { rotate: [-20, -60, -20, -60, -20] };
      case "tasting": return { rotate: [-50, -80, -50] };
      case "setting-table": return { rotate: [-10, -40, -10, -40, -10] };
      default: return { rotate: [0, -5, 0] };
    }
  };

  const getLeftArmAnim = () => {
    if (noAnim) return {};
    switch (state) {
      case "idle": return { rotate: [0, 8, 0] };
      case "greeting": return { rotate: [0, 5, 0] };
      case "success": return { rotate: [20, 60, 20, 60, 20] };
      case "error": return { rotate: [10, 30, 10] };
      case "busy": return { rotate: [20, 50, 20, 50, 20] };
      case "tasting": return { rotate: [10, 45, 10] };
      case "setting-table": return { rotate: [10, 55, 10, 55, 10] };
      default: return { rotate: [0, 5, 0] };
    }
  };

  const mouthPath =
    state === "success" || state === "greeting" || state === "tasting"
      ? "M 62 98 Q 75 112 88 98"
      : state === "error"
        ? "M 66 102 Q 75 96 84 102"
        : state === "sleeping"
          ? "M 66 100 L 84 100"
          : state === "busy"
            ? "M 62 98 Q 75 110 88 98"
            : "M 64 98 Q 75 107 86 98";

  const showTeeth = state === "success" || state === "greeting" || state === "tasting" || state === "busy";
  const eyeScale = state === "sleeping" ? 0.15 : state === "error" ? 1.3 : state === "tasting" ? 0.3 : 1;
  const eyebrowY = state === "error" ? -4 : state === "success" || state === "tasting" ? -3 : state === "busy" ? -2 : 0;

  const showKnife = state === "idle" || state === "greeting" || state === "busy" || state === "hover";
  const showSpoon = state === "tasting";
  const showPlate = state === "setting-table";

  return (
    <svg viewBox="0 0 150 200" width="100%" height="100%" style={{
      "--chef-skin": "#ffdbac",
      "--chef-hat": "#ffffff",
      "--chef-jacket": "#b8dff0",
      "--chef-apron": "#ffffff",
      "--chef-eyes": "#ffffff",
    } as React.CSSProperties}>
      <defs>
        <linearGradient id="hat-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0EDE8" />
        </linearGradient>
        <linearGradient id="skin-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFDBAC" />
          <stop offset="100%" stopColor="#F5C18C" />
        </linearGradient>
        <linearGradient id="jacket-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C8E6F5" />
          <stop offset="100%" stopColor="#9DCFE8" />
        </linearGradient>
        <linearGradient id="apron-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0F0F0" />
        </linearGradient>
        <radialGradient id="cheek-grad">
          <stop offset="0%" stopColor="#FF9999" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FF9999" stopOpacity="0" />
        </radialGradient>
        <filter id="chef-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
        </filter>
      </defs>

      <motion.g
        animate={getBodyAnim()}
        transition={{ duration: state === "idle" ? 3 : state === "busy" ? 0.35 : 0.6, repeat: noAnim ? 0 : Infinity, repeatType: "reverse", ease: "easeInOut" }}
        style={{ originX: "75px", originY: "100px" }}
        filter="url(#chef-shadow)"
      >
        {!noAnim ? (
          <motion.g animate={{ y: [0, -2, 0] }} transition={{ duration: 2.5, repeat: Infinity, repeatType: "reverse" }}>
            <ellipse cx="60" cy="28" rx="8" ry="12" fill="#FAFAFA" stroke="#E8E8E8" strokeWidth="0.5" />
            <ellipse cx="75" cy="24" rx="10" ry="14" fill="#FFFFFF" stroke="#E8E8E8" strokeWidth="0.5" />
            <ellipse cx="90" cy="28" rx="8" ry="12" fill="#FAFAFA" stroke="#E8E8E8" strokeWidth="0.5" />
            <ellipse cx="67" cy="22" rx="6" ry="10" fill="#FDFDFD" />
            <ellipse cx="83" cy="22" rx="6" ry="10" fill="#FDFDFD" />
          </motion.g>
        ) : (
          <g>
            <ellipse cx="60" cy="28" rx="8" ry="12" fill="#FAFAFA" stroke="#E8E8E8" strokeWidth="0.5" />
            <ellipse cx="75" cy="24" rx="10" ry="14" fill="#FFFFFF" stroke="#E8E8E8" strokeWidth="0.5" />
            <ellipse cx="90" cy="28" rx="8" ry="12" fill="#FAFAFA" stroke="#E8E8E8" strokeWidth="0.5" />
            <ellipse cx="67" cy="22" rx="6" ry="10" fill="#FDFDFD" />
            <ellipse cx="83" cy="22" rx="6" ry="10" fill="#FDFDFD" />
          </g>
        )}

        <rect x="55" y="36" width="40" height="12" rx="3" fill="url(#hat-grad)" stroke="#E0E0E0" strokeWidth="0.8" />
        <rect x="57" y="38" width="36" height="2" rx="1" fill="#E8E4DF" opacity="0.5" />

        <path d="M 55 36 Q 55 16 60 28" fill="url(#hat-grad)" stroke="#E0E0E0" strokeWidth="0.5" />
        <path d="M 95 36 Q 95 16 90 28" fill="url(#hat-grad)" stroke="#E0E0E0" strokeWidth="0.5" />

        <ellipse cx="75" cy="76" rx="27" ry="28" fill="url(#skin-grad)" />

        <ellipse cx="48" cy="80" rx="5" ry="5" fill="#FFDBAC" />
        <ellipse cx="102" cy="80" rx="5" ry="5" fill="#FFDBAC" />

        <path d="M 65 52 Q 75 48 85 52" fill="#3A2512" />

        <g>
          <g style={{ transform: `translateY(${eyebrowY}px)` }}>
            <path d="M 58 65 Q 63 61 68 63" fill="none" stroke="#3A2512" strokeWidth="2" strokeLinecap="round" />
            <path d="M 82 63 Q 87 61 92 65" fill="none" stroke="#3A2512" strokeWidth="2" strokeLinecap="round" />
          </g>

          <g style={{ transform: `scaleY(${eyeScale})`, transformOrigin: "63px 74px" }}>
            <ellipse cx="63" cy="74" rx="7" ry="8" fill="white" stroke="#2D2D2D" strokeWidth="1.2" />
            <motion.circle style={{ cx: useTransform(eyeOffsetX, v => 63 + v) }} cy="75" r="4" fill="#2D1B0E" />
            <motion.circle style={{ cx: useTransform(eyeOffsetX, v => 63 + v - 1) }} cy="73" r="1.5" fill="white" />
            <motion.circle style={{ cx: useTransform(eyeOffsetX, v => 63 + v + 1.5) }} cy="76" r="0.8" fill="white" opacity="0.6" />
          </g>
          <g style={{ transform: `scaleY(${eyeScale})`, transformOrigin: "87px 74px" }}>
            <ellipse cx="87" cy="74" rx="7" ry="8" fill="white" stroke="#2D2D2D" strokeWidth="1.2" />
            <motion.circle style={{ cx: useTransform(eyeOffsetX, v => 87 + v) }} cy="75" r="4" fill="#2D1B0E" />
            <motion.circle style={{ cx: useTransform(eyeOffsetX, v => 87 + v - 1) }} cy="73" r="1.5" fill="white" />
            <motion.circle style={{ cx: useTransform(eyeOffsetX, v => 87 + v + 1.5) }} cy="76" r="0.8" fill="white" opacity="0.6" />
          </g>
        </g>

        <ellipse cx="55" cy="86" rx="7" ry="5" fill="url(#cheek-grad)" />
        <ellipse cx="95" cy="86" rx="7" ry="5" fill="url(#cheek-grad)" />

        <ellipse cx="75" cy="84" rx="3" ry="2" fill="#E8A67C" />

        <path d={mouthPath} fill={showTeeth ? "#FFFFFF" : "none"} stroke="#5D3A1A" strokeWidth="1.8" strokeLinecap="round" />
        {showTeeth && (
          <path d={mouthPath} fill="none" stroke="#5D3A1A" strokeWidth="1.8" strokeLinecap="round" />
        )}

        <path d="M 48 107 L 48 160 Q 48 172 58 172 L 92 172 Q 102 172 102 160 L 102 107 Q 102 100 90 98 L 60 98 Q 48 100 48 107 Z"
          fill="url(#jacket-grad)" stroke="#8BBCD4" strokeWidth="0.8" />

        <rect x="55" y="100" width="4" height="3" rx="1.5" fill="#8BBCD4" />
        <line x1="75" y1="104" x2="75" y2="165" stroke="#A8D4E8" strokeWidth="0.6" opacity="0.5" />

        <path d="M 58 100 Q 68 96 75 100" fill="none" stroke="#8BBCD4" strokeWidth="1" />
        <path d="M 75 100 Q 82 96 92 100" fill="none" stroke="#8BBCD4" strokeWidth="1" />

        <circle cx="72" cy="115" r="2.5" fill="#A8D4E8" stroke="#8BBCD4" strokeWidth="0.5" />
        <circle cx="72" cy="125" r="2.5" fill="#A8D4E8" stroke="#8BBCD4" strokeWidth="0.5" />
        <circle cx="72" cy="135" r="2.5" fill="#A8D4E8" stroke="#8BBCD4" strokeWidth="0.5" />

        <path d="M 52 118 L 52 168 Q 75 178 98 168 L 98 118 Z" fill="url(#apron-grad)" stroke="#E0E0E0" strokeWidth="0.8" />
        <line x1="52" y1="118" x2="98" y2="118" stroke="#E0E0E0" strokeWidth="1.5" />

        <line x1="52" y1="118" x2="45" y2="112" stroke="#E8E8E8" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="98" y1="118" x2="105" y2="112" stroke="#E8E8E8" strokeWidth="1.5" strokeLinecap="round" />

        <rect x="65" y="140" width="20" height="16" rx="3" fill="#F8F8F8" stroke="#E0E0E0" strokeWidth="0.6" />

        <motion.g
          animate={getRightArmAnim()}
          transition={{ duration: state === "idle" ? 1.2 : state === "busy" ? 0.25 : 0.4, repeat: noAnim ? 0 : Infinity, repeatType: "reverse" }}
          style={{ originX: "102px", originY: "110px" }}
        >
          <path d="M 102 110 Q 118 106 125 120" stroke="url(#skin-grad)" strokeWidth="10" fill="none" strokeLinecap="round" />
          <circle cx="126" cy="122" r="6" fill="#FFDBAC" stroke="#F0C090" strokeWidth="0.5" />
          <circle cx="123" cy="120" r="2" fill="#FFDBAC" />
          {showKnife && (
            <g>
              <rect x="123" y="98" width="4" height="22" rx="1.5" fill="#8B6914" />
              <circle cx="125" cy="102" r="0.8" fill="#B8860B" />
              <circle cx="125" cy="106" r="0.8" fill="#B8860B" />
              <path d="M 122 98 L 128 98 L 128 82 Q 125 78 122 82 Z" fill="#C0C0C0" stroke="#A0A0A0" strokeWidth="0.5" />
              <line x1="125" y1="84" x2="125" y2="97" stroke="#E0E0E0" strokeWidth="0.5" opacity="0.5" />
            </g>
          )}
          {showSpoon && (
            <g>
              <rect x="124" y="100" width="3" height="22" rx="1" fill="#C0C0C0" />
              <ellipse cx="125.5" cy="96" rx="5" ry="4" fill="#C0C0C0" stroke="#A0A0A0" strokeWidth="0.5" />
              <ellipse cx="125.5" cy="96" rx="3.5" ry="2.5" fill="#D0D0D0" />
            </g>
          )}
        </motion.g>

        <motion.g
          animate={getLeftArmAnim()}
          transition={{ duration: state === "idle" ? 3 : state === "busy" ? 0.3 : 0.5, repeat: noAnim ? 0 : Infinity, repeatType: "reverse" }}
          style={{ originX: "48px", originY: "110px" }}
        >
          <path d="M 48 110 Q 32 106 25 120" stroke="url(#skin-grad)" strokeWidth="10" fill="none" strokeLinecap="round" />
          <circle cx="24" cy="122" r="6" fill="#FFDBAC" stroke="#F0C090" strokeWidth="0.5" />
          <circle cx="27" cy="120" r="2" fill="#FFDBAC" />

          {(state === "idle" || state === "hover" || state === "busy") && (
            <g>
              <rect x="12" y="118" width="24" height="4" rx="1" fill="#A0784C" stroke="#8B6914" strokeWidth="0.5" />
              <rect x="14" y="114" width="6" height="4" rx="1" fill="#FF8C42" />
              <rect x="14" y="114" width="3" height="4" rx="0.5" fill="#FFA05C" />
              <rect x="22" y="112" width="3" height="6" rx="0.5" fill="#4CAF50" />
              <rect x="27" y="113" width="2" height="5" rx="0.5" fill="#66BB6A" />
              <circle cx="31" cy="116" r="1.5" fill="#43A047" />
            </g>
          )}

          {showPlate && (
            <g>
              <ellipse cx="22" cy="118" rx="10" ry="3" fill="#F0F0F0" stroke="#D0D0D0" strokeWidth="0.8" />
              <ellipse cx="22" cy="117" rx="7" ry="2" fill="#FAFAFA" />
              <ellipse cx="22" cy="117" rx="3" ry="1" fill="#E8E8E8" opacity="0.5" />
            </g>
          )}
        </motion.g>

        <rect x="56" y="170" width="14" height="20" rx="5" fill="#333" />
        <rect x="80" y="170" width="14" height="20" rx="5" fill="#333" />
        <ellipse cx="63" cy="191" rx="8" ry="3" fill="#222" />
        <ellipse cx="87" cy="191" rx="8" ry="3" fill="#222" />

        {state === "busy" && !noAnim && (
          <>
            <motion.circle
              cx="95" cy="60" r="2" fill="#87CEEB" opacity="0.6"
              animate={{ y: [0, -8, 0], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <motion.circle
              cx="100" cy="65" r="1.5" fill="#87CEEB" opacity="0.4"
              animate={{ y: [0, -10, 0], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.3 }}
            />
            <motion.circle
              cx="55" cy="62" r="1.8" fill="#87CEEB" opacity="0.5"
              animate={{ y: [0, -9, 0], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: 0.15 }}
            />
          </>
        )}

        {state === "sleeping" && !noAnim && (
          <>
            <motion.text
              x="95" y="55" fontSize="10" fill="#888" fontWeight="bold"
              animate={{ opacity: [0, 1, 0], y: [55, 45, 35] }}
              transition={{ duration: 2, repeat: Infinity }}
            >z</motion.text>
            <motion.text
              x="102" y="48" fontSize="8" fill="#AAA" fontWeight="bold"
              animate={{ opacity: [0, 1, 0], y: [48, 38, 28] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
            >z</motion.text>
            <motion.text
              x="108" y="42" fontSize="6" fill="#CCC" fontWeight="bold"
              animate={{ opacity: [0, 1, 0], y: [42, 32, 22] }}
              transition={{ duration: 2, repeat: Infinity, delay: 1.2 }}
            >z</motion.text>
          </>
        )}
      </motion.g>
    </svg>
  );
}

function Particles({ type, reducedMotion }: { type: "confetti" | "steam" | "hearts"; reducedMotion: boolean }) {
  if (reducedMotion) return null;

  const particles = useMemo(
    () =>
      Array.from({ length: type === "confetti" ? 14 : type === "hearts" ? 6 : 8 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100 - 50,
        y: -(Math.random() * 80 + 20),
        color:
          type === "confetti"
            ? ["#E53E3E", "#DD6B20", "#38A169", "#3182CE", "#805AD5", "#D69E2E", "#E53E3E"][i % 7]
            : type === "hearts"
              ? ["#E53E3E", "#FF6B6B", "#C53030"][i % 3]
              : "#FFFFFF",
        size: type === "confetti" ? Math.random() * 5 + 3 : type === "hearts" ? Math.random() * 8 + 6 : Math.random() * 8 + 4,
        delay: Math.random() * 0.4,
        rotation: Math.random() * 360,
      })),
    [type]
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 50, y: 50, opacity: 1, scale: 0, rotate: 0 }}
          animate={{
            x: 50 + p.x,
            y: p.y,
            opacity: [1, 1, 0],
            scale: [0, 1, 0.5],
            rotate: p.rotation,
          }}
          transition={{ duration: 1.4, delay: p.delay, ease: "easeOut" }}
          className="absolute"
          style={{
            width: p.size,
            height: p.size,
            borderRadius: type === "confetti" ? "1px" : "50%",
            backgroundColor: type === "hearts" ? "transparent" : p.color,
            opacity: type === "steam" ? 0.35 : 1,
          }}
        >
          {type === "hearts" && (
            <svg viewBox="0 0 24 24" width={p.size} height={p.size}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill={p.color} />
            </svg>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function SpeechBubble({ text, reducedMotion }: { text: string; reducedMotion: boolean }) {
  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.7, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 10 }}
      transition={reducedMotion ? { duration: 0 } : undefined}
      className="absolute -top-14 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700"
      style={{ zIndex: 1001 }}
      data-testid="chef-speech-bubble"
    >
      {text}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 rotate-45" />
    </motion.div>
  );
}

export default function ChefMascot() {
  const [animState, setAnimState] = useState<AnimState>("greeting");
  const [speech, setSpeech] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [showParticles, setShowParticles] = useState<"confetti" | "steam" | "hearts" | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const eyeX = useMotionValue(0);

  const showSpeech = useCallback((category: string) => {
    const msgs = SPEECH[category];
    if (!msgs || msgs.length === 0) return;
    setSpeech(pickRandom(msgs));
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    speechTimerRef.current = setTimeout(() => setSpeech(null), 3000);
  }, []);

  const transitionTo = useCallback(
    (state: AnimState, duration = 2000, speechKey?: string) => {
      if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
      setAnimState(state);
      if (speechKey) showSpeech(speechKey);
      stateTimerRef.current = setTimeout(() => setAnimState("idle"), duration);
    },
    [showSpeech]
  );

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (animState === "sleeping") {
      transitionTo("greeting", 1500, "greeting");
    }
    idleTimerRef.current = setTimeout(() => {
      setAnimState("sleeping");
      showSpeech("sleeping");
    }, 5 * 60 * 1000);
  }, [animState, transitionTo, showSpeech]);

  useEffect(() => {
    resetIdleTimer();
    const handler = () => resetIdleTimer();
    window.addEventListener("mousemove", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("mousemove", handler);
      window.removeEventListener("keydown", handler);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  useEffect(() => {
    const greetingTimer = setTimeout(() => {
      transitionTo("greeting", 2500, "greeting");
    }, 500);
    return () => clearTimeout(greetingTimer);
  }, []);

  useEffect(() => {
    const cleanup = onChefEvent((event) => {
      resetIdleTimer();
      switch (event) {
        case "success":
          transitionTo("success", 2500, "success");
          setShowParticles("confetti");
          setTimeout(() => setShowParticles(null), 1800);
          break;
        case "order-complete":
          transitionTo("tasting", 2500, "order-complete");
          setShowParticles("hearts");
          setTimeout(() => setShowParticles(null), 1800);
          break;
        case "error":
          transitionTo("error", 2000, "error");
          break;
        case "reservation-new":
          transitionTo("setting-table", 2000, "reservation-new");
          setShowParticles("confetti");
          setTimeout(() => setShowParticles(null), 1500);
          break;
        case "busy-hour":
          transitionTo("busy", 3000, "busy-hour");
          setShowParticles("steam");
          setTimeout(() => setShowParticles(null), 1800);
          break;
        default:
          break;
      }
    });
    return cleanup;
  }, [transitionTo, resetIdleTimer]);

  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      if (animState !== "idle") return;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        transitionTo("scroll", 1200, "scroll");
      }, 300);
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      clearTimeout(scrollTimeout);
    };
  }, [animState, transitionTo]);

  useEffect(() => {
    let rafId: number | null = null;
    let lastUpdate = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastUpdate < 50) return;
      lastUpdate = now;
      if (!containerRef.current) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const dx = (e.clientX - cx) / window.innerWidth;
        eyeX.set(Math.max(-1, Math.min(1, dx * 2)));
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [eyeX]);

  const handleHover = useCallback(() => {
    if (animState === "sleeping") {
      transitionTo("greeting", 1500, "greeting");
      resetIdleTimer();
    } else if (animState === "idle") {
      transitionTo("hover", 1500, "hover");
    }
  }, [animState, transitionTo, resetIdleTimer]);

  const handleClick = useCallback(() => {
    resetIdleTimer();
    transitionTo("click", 1500, "click");
  }, [transitionTo, resetIdleTimer]);

  useEffect(() => {
    const stored = localStorage.getItem("chef-visible");
    if (stored === "false") {
      setMinimized(true);
    }
  }, []);

  const toggleVisibility = useCallback(() => {
    setMinimized((prev) => {
      const next = !prev;
      localStorage.setItem("chef-visible", next ? "false" : "true");
      return next;
    });
  }, []);

  return (
    <div
      className="fixed bottom-[30px] left-[30px] z-[999] pointer-events-none"
      data-testid="chef-mascot-container"
    >
      <AnimatePresence mode="wait">
        {minimized ? (
          <motion.button
            key="minimized"
            initial={reducedMotion ? undefined : { scale: 0 }}
            animate={{ scale: 1 }}
            exit={reducedMotion ? undefined : { scale: 0 }}
            whileHover={reducedMotion ? undefined : { scale: 1.1 }}
            whileTap={reducedMotion ? undefined : { scale: 0.9 }}
            onClick={toggleVisibility}
            className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow pointer-events-auto"
            data-testid="button-show-chef"
          >
            <ChefHat className="w-6 h-6" />
          </motion.button>
        ) : (
          <motion.div
            key="full"
            initial={reducedMotion ? undefined : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reducedMotion ? undefined : { scale: 0, opacity: 0 }}
            className="relative"
            ref={containerRef}
          >
            <button
              onClick={toggleVisibility}
              className="absolute -top-2 -right-2 z-[1002] w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-md pointer-events-auto"
              data-testid="button-hide-chef"
            >
              <X className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
            </button>

            <AnimatePresence>
              {speech && <SpeechBubble text={speech} reducedMotion={reducedMotion} />}
            </AnimatePresence>

            {showParticles && <Particles type={showParticles} reducedMotion={reducedMotion} />}

            <div
              className="w-[150px] h-[200px] md:w-[210px] md:h-[280px] cursor-pointer select-none pointer-events-auto rounded-2xl"
              onMouseEnter={handleHover}
              onClick={handleClick}
              style={{
                filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.2))",
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(8px)",
              }}
              data-testid="chef-character"
            >
              <ChefSVG state={animState} eyeX={eyeX} reducedMotion={reducedMotion} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
