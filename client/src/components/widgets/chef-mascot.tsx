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
  greeting: ["Welcome, Chef! 👋", "Let's cook something great!"],
  hover: ["Hi there! 🍳", "Need help?"],
  click: ["Ready to cook! 🔥", "At your service!"],
  scroll: ["Looking good! 👍", "Keep going!"],
  success: ["Perfetto! 🎉", "Magnifique!", "Bravo! 👏"],
  error: ["Oops! 😅", "Don't worry, try again!", "We'll fix that!"],
  sleeping: ["*zzz* 😴"],
  "order-complete": ["Mmm, perfect! 🍽️", "Chef's kiss! 😘", "Bellissimo!"],
  "reservation-new": ["Table ready! 🪑", "Setting the table!", "Guests incoming!"],
  "busy-hour": ["Rush hour! 🔥", "Let's keep up!", "Full speed ahead!"],
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
  const eyeOffsetX = useTransform(eyeX, [-1, 1], [-3, 3]);

  const noAnim = reducedMotion;

  const getBodyAnim = () => {
    if (noAnim) return {};
    switch (state) {
      case "greeting": return { rotate: [-3, 3, -3], y: [0, -8, 0] };
      case "click": return { rotate: [0, 360], scale: [1, 1.1, 1] };
      case "success": return { y: [0, -15, 0, -10, 0], scale: [1, 1.1, 1, 1.05, 1] };
      case "error": return { x: [-3, 3, -3, 3, 0], rotate: [-2, 2, -2, 2, 0] };
      case "sleeping": return { rotate: [-2, 2, -2], y: [0, 2, 0] };
      case "scroll": return { rotate: [-5, 0], y: [0, -3, 0] };
      case "busy": return { rotate: [-5, 5, -5, 5, 0], y: [0, -5, 0, -5, 0], scale: [1, 1.05, 1, 1.05, 1] };
      case "tasting": return { y: [0, -3, 0], rotate: [-2, 2, -2] };
      case "setting-table": return { y: [0, -5, 0], rotate: [0, 3, 0, -3, 0] };
      default: return { y: [0, -2, 0], rotate: [0, 1, 0, -1, 0] };
    }
  };

  const getRightArmAnim = () => {
    if (noAnim) return {};
    switch (state) {
      case "greeting": return { rotate: [-20, -60, -20, -60, -20] };
      case "success": return { rotate: [-30, -70, -30, -70, -30] };
      case "scroll": return { rotate: [-45, -70, -45] };
      case "click": return { rotate: [0, -30, 0] };
      case "busy": return { rotate: [-20, -60, -20, -60, -20] };
      case "tasting": return { rotate: [-40, -70, -40] };
      case "setting-table": return { rotate: [-10, -40, -10, -40, -10] };
      default: return { rotate: [0, -5, 0] };
    }
  };

  const getLeftArmAnim = () => {
    if (noAnim) return {};
    switch (state) {
      case "greeting": return { rotate: [0, 5, 0] };
      case "success": return { rotate: [20, 60, 20, 60, 20] };
      case "error": return { rotate: [10, 30, 10] };
      case "busy": return { rotate: [20, 60, 20, 60, 20] };
      case "tasting": return { rotate: [10, 40, 10] };
      case "setting-table": return { rotate: [10, 50, 10, 50, 10] };
      default: return { rotate: [0, 5, 0] };
    }
  };

  const mouthPath =
    state === "success" || state === "greeting" || state === "tasting"
      ? "M 42 62 Q 50 72 58 62"
      : state === "error"
        ? "M 44 65 Q 50 60 56 65"
        : state === "sleeping"
          ? "M 44 63 L 56 63"
          : state === "busy"
            ? "M 42 62 Q 50 70 58 62"
            : "M 43 62 Q 50 68 57 62";

  const eyeScale = state === "sleeping" ? 0.2 : state === "error" ? 1.3 : state === "tasting" ? 0.4 : 1;
  const eyebrowY = state === "error" ? -3 : state === "success" || state === "tasting" ? -2 : state === "busy" ? -1 : 0;

  const showSpatula = state === "greeting" || state === "busy" || state === "tasting";

  return (
    <svg viewBox="0 0 100 130" width="100%" height="100%">
      <defs>
        <linearGradient id="chef-hat-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0F0F0" />
        </linearGradient>
        <linearGradient id="chef-skin-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FDBF91" />
          <stop offset="100%" stopColor="#F5A66E" />
        </linearGradient>
        <linearGradient id="chef-jacket-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8E8E8" />
        </linearGradient>
        <linearGradient id="chef-apron-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E53E3E" />
          <stop offset="100%" stopColor="#C53030" />
        </linearGradient>
      </defs>

      <motion.g
        animate={getBodyAnim()}
        transition={{ duration: state === "idle" ? 3 : state === "busy" ? 0.4 : 0.6, repeat: noAnim ? 0 : Infinity, repeatType: "reverse", ease: "easeInOut" }}
        style={{ originX: "50px", originY: "65px" }}
      >
        <g>
          <ellipse cx="50" cy="3" rx="14" ry="3" fill="url(#chef-hat-grad)" stroke="#DDD" strokeWidth="0.5" />
          <rect x="36" y="3" width="28" height="28" rx="4" fill="url(#chef-hat-grad)" stroke="#DDD" strokeWidth="0.5" />
          {!noAnim ? (
            <motion.g animate={{ y: [0, -2, 0] }} transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}>
              <ellipse cx="42" cy="6" rx="4" ry="6" fill="#F8F8F8" />
              <ellipse cx="50" cy="4" rx="5" ry="7" fill="#FAFAFA" />
              <ellipse cx="58" cy="6" rx="4" ry="6" fill="#F8F8F8" />
            </motion.g>
          ) : (
            <g>
              <ellipse cx="42" cy="6" rx="4" ry="6" fill="#F8F8F8" />
              <ellipse cx="50" cy="4" rx="5" ry="7" fill="#FAFAFA" />
              <ellipse cx="58" cy="6" rx="4" ry="6" fill="#F8F8F8" />
            </g>
          )}
          <rect x="34" y="28" width="32" height="5" rx="2" fill="#E8E8E8" stroke="#DDD" strokeWidth="0.5" />
        </g>

        <ellipse cx="50" cy="47" rx="18" ry="18" fill="url(#chef-skin-grad)" />
        <circle cx="22" cy="50" r="3" fill="#FDBF91" />
        <circle cx="78" cy="50" r="3" fill="#FDBF91" />

        <g>
          <g style={{ transform: `translateY(${eyebrowY}px)` }}>
            <line x1="38" y1="42" x2="44" y2="41" stroke="#5D3A1A" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="56" y1="41" x2="62" y2="42" stroke="#5D3A1A" strokeWidth="1.5" strokeLinecap="round" />
          </g>

          <g style={{ transform: `scaleY(${eyeScale})`, transformOrigin: "42px 48px" }}>
            <ellipse cx="42" cy="48" rx="3.5" ry="4" fill="white" stroke="#333" strokeWidth="0.5" />
            <motion.circle style={{ cx: useTransform(eyeOffsetX, v => 42 + v) }} cy="48" r="2" fill="#2D1B0E" />
            <circle cx="42.5" cy="47" r="0.7" fill="white" />
          </g>
          <g style={{ transform: `scaleY(${eyeScale})`, transformOrigin: "58px 48px" }}>
            <ellipse cx="58" cy="48" rx="3.5" ry="4" fill="white" stroke="#333" strokeWidth="0.5" />
            <motion.circle style={{ cx: useTransform(eyeOffsetX, v => 58 + v) }} cy="48" r="2" fill="#2D1B0E" />
            <circle cx="58.5" cy="47" r="0.7" fill="white" />
          </g>
        </g>

        <ellipse cx="38" cy="55" rx="4" ry="2.5" fill="#FFB5A0" opacity="0.5" />
        <ellipse cx="62" cy="55" rx="4" ry="2.5" fill="#FFB5A0" opacity="0.5" />
        <circle cx="50" cy="53" r="1.5" fill="#E8976E" />

        <path d={mouthPath} fill="none" stroke="#5D3A1A" strokeWidth="1.5" strokeLinecap="round" />

        <rect x="35" y="67" width="30" height="40" rx="5" fill="url(#chef-jacket-grad)" stroke="#DDD" strokeWidth="0.5" />
        <line x1="50" y1="70" x2="50" y2="100" stroke="#DDD" strokeWidth="0.5" />
        <circle cx="50" cy="75" r="1.5" fill="#DDD" />
        <circle cx="50" cy="82" r="1.5" fill="#DDD" />
        <circle cx="50" cy="89" r="1.5" fill="#DDD" />

        <path d="M 38 75 L 38 105 Q 50 112 62 105 L 62 75 Z" fill="url(#chef-apron-grad)" opacity="0.85" />
        <rect x="34" y="66" width="32" height="5" rx="1" fill="#E74C3C" />
        <rect x="34" y="66" width="4" height="5" fill="#FFF" opacity="0.3" />
        <rect x="42" y="66" width="4" height="5" fill="#FFF" opacity="0.3" />
        <rect x="50" y="66" width="4" height="5" fill="#FFF" opacity="0.3" />
        <rect x="58" y="66" width="4" height="5" fill="#FFF" opacity="0.3" />

        <motion.g
          animate={getRightArmAnim()}
          transition={{ duration: state === "idle" ? 2.5 : state === "busy" ? 0.3 : 0.4, repeat: noAnim ? 0 : Infinity, repeatType: "reverse" }}
          style={{ originX: "65px", originY: "72px" }}
        >
          <path d="M 65 72 Q 78 68 82 80" stroke="url(#chef-skin-grad)" strokeWidth="6" fill="none" strokeLinecap="round" />
          <circle cx="82" cy="80" r="4" fill="#FDBF91" />
          {showSpatula && (
            <g>
              <rect x="80" y="60" width="3" height="20" rx="1" fill="#8B7355" />
              <ellipse cx="81.5" cy="58" rx="6" ry="3" fill="#666" />
            </g>
          )}
        </motion.g>

        <motion.g
          animate={getLeftArmAnim()}
          transition={{ duration: state === "idle" ? 3 : state === "busy" ? 0.3 : 0.5, repeat: noAnim ? 0 : Infinity, repeatType: "reverse" }}
          style={{ originX: "35px", originY: "72px" }}
        >
          <path d="M 35 72 Q 22 68 18 80" stroke="url(#chef-skin-grad)" strokeWidth="6" fill="none" strokeLinecap="round" />
          <circle cx="18" cy="80" r="4" fill="#FDBF91" />
          {state === "setting-table" && (
            <g>
              <ellipse cx="16" cy="76" rx="5" ry="1.5" fill="#DDD" stroke="#BBB" strokeWidth="0.5" />
            </g>
          )}
        </motion.g>

        <rect x="38" y="105" width="8" height="15" rx="3" fill="#333" />
        <rect x="54" y="105" width="8" height="15" rx="3" fill="#333" />
        <ellipse cx="42" cy="121" rx="5" ry="2" fill="#222" />
        <ellipse cx="58" cy="121" rx="5" ry="2" fill="#222" />
      </motion.g>
    </svg>
  );
}

function Particles({ type, reducedMotion }: { type: "confetti" | "steam"; reducedMotion: boolean }) {
  if (reducedMotion) return null;

  const particles = useMemo(
    () =>
      Array.from({ length: type === "confetti" ? 12 : 6 }).map((_, i) => ({
        id: i,
        x: Math.random() * 80 - 40,
        y: -(Math.random() * 60 + 20),
        color:
          type === "confetti"
            ? ["#E53E3E", "#DD6B20", "#38A169", "#3182CE", "#805AD5", "#D69E2E"][i % 6]
            : "#FFFFFF",
        size: type === "confetti" ? Math.random() * 4 + 2 : Math.random() * 6 + 3,
        delay: Math.random() * 0.3,
        rotation: Math.random() * 360,
      })),
    [type]
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 40, y: 40, opacity: 1, scale: 0, rotate: 0 }}
          animate={{
            x: 40 + p.x,
            y: p.y,
            opacity: [1, 1, 0],
            scale: [0, 1, 0.5],
            rotate: p.rotation,
          }}
          transition={{ duration: 1.2, delay: p.delay, ease: "easeOut" }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: type === "confetti" ? "1px" : "50%",
            backgroundColor: p.color,
            opacity: type === "steam" ? 0.4 : 1,
          }}
        />
      ))}
    </div>
  );
}

function SpeechBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 10 }}
      className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs font-medium px-3 py-1.5 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"
      style={{ zIndex: 1001 }}
      data-testid="chef-speech-bubble"
    >
      {text}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 rotate-45" />
    </motion.div>
  );
}

export default function ChefMascot() {
  const [animState, setAnimState] = useState<AnimState>("greeting");
  const [speech, setSpeech] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [showParticles, setShowParticles] = useState<"confetti" | "steam" | null>(null);
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
    speechTimerRef.current = setTimeout(() => setSpeech(null), 2500);
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
          setTimeout(() => setShowParticles(null), 1500);
          break;
        case "order-complete":
          transitionTo("tasting", 2500, "order-complete");
          setShowParticles("confetti");
          setTimeout(() => setShowParticles(null), 1500);
          break;
        case "error":
          transitionTo("error", 2000, "error");
          break;
        case "reservation-new":
          transitionTo("setting-table", 2000, "reservation-new");
          break;
        case "busy-hour":
          transitionTo("busy", 3000, "busy-hour");
          setShowParticles("steam");
          setTimeout(() => setShowParticles(null), 1500);
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
      className="fixed bottom-5 left-5 z-[999] pointer-events-none"
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
              className="absolute -top-1 -right-1 z-[1002] w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-sm pointer-events-auto"
              data-testid="button-hide-chef"
            >
              <X className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            </button>

            <AnimatePresence>
              {speech && <SpeechBubble text={speech} />}
            </AnimatePresence>

            {showParticles && <Particles type={showParticles} reducedMotion={reducedMotion} />}

            <div
              className="w-[150px] h-[195px] md:w-[200px] md:h-[260px] cursor-pointer select-none pointer-events-auto"
              onMouseEnter={handleHover}
              onClick={handleClick}
              style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))" }}
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
