import { useId } from "react";
import { motion } from "framer-motion";

interface TableSaltLogoProps {
  variant?: "full" | "compact" | "icon";
  className?: string;
  animate?: boolean;
  iconSize?: number;
  textClassName?: string;
  colorScheme?: "light" | "dark";
}

function SaltShakerIcon({ size = 32, className = "", colorScheme = "light" }: { size?: number; className?: string; colorScheme?: "light" | "dark" }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `tg-${uid}`;
  const darkId = `td-${uid}`;

  const bodyFill = `url(#${gradId})`;
  const capFill = `url(#${darkId})`;
  const topFill = colorScheme === "dark" ? "hsl(174,50%,85%)" : "hsl(174,65%,32%)";

  const gradStops = colorScheme === "dark"
    ? { from: "hsl(174,40%,80%)", to: "hsl(174,50%,70%)" }
    : { from: "hsl(174,65%,38%)", to: "hsl(174,65%,28%)" };
  const darkStops = colorScheme === "dark"
    ? { from: "hsl(174,35%,75%)", to: "hsl(174,45%,65%)" }
    : { from: "hsl(174,55%,35%)", to: "hsl(174,65%,25%)" };

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="18" y="18" width="28" height="32" rx="6" fill={bodyFill} />
      <rect x="22" y="10" width="20" height="10" rx="3" fill={capFill} />
      <rect x="24" y="6" width="16" height="6" rx="2" fill={topFill} opacity="0.7" />
      <circle cx="28" cy="14" r="1.2" fill="white" opacity="0.6" />
      <circle cx="32" cy="13" r="1.2" fill="white" opacity="0.6" />
      <circle cx="36" cy="14" r="1.2" fill="white" opacity="0.6" />
      <circle cx="26" cy="54" r="2" fill="#FFD700" opacity="0.9" />
      <circle cx="32" cy="58" r="1.8" fill="#FFD700" opacity="0.7" />
      <circle cx="38" cy="55" r="1.5" fill="#FFD700" opacity="0.8" />
      <circle cx="30" cy="61" r="1.2" fill="#FFD700" opacity="0.5" />
      <circle cx="35" cy="62" r="1" fill="#FFD700" opacity="0.4" />
      <defs>
        <linearGradient id={gradId} x1="18" y1="18" x2="46" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor={gradStops.from} />
          <stop offset="1" stopColor={gradStops.to} />
        </linearGradient>
        <linearGradient id={darkId} x1="22" y1="10" x2="42" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor={darkStops.from} />
          <stop offset="1" stopColor={darkStops.to} />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TableSaltLogo({
  variant = "full",
  className = "",
  animate = false,
  iconSize,
  textClassName = "",
  colorScheme = "light",
}: TableSaltLogoProps) {
  const defaultIconSize = variant === "full" ? 36 : variant === "compact" ? 28 : 32;
  const size = iconSize || defaultIconSize;

  const icon = animate ? (
    <motion.div
      animate={{ rotate: [0, -3, 3, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <SaltShakerIcon size={size} colorScheme={colorScheme} />
    </motion.div>
  ) : (
    <SaltShakerIcon size={size} colorScheme={colorScheme} />
  );

  if (variant === "icon") {
    return <div className={`inline-flex items-center justify-center ${className}`}>{icon}</div>;
  }

  const isDark = colorScheme === "dark";

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} data-testid="logo-table-salt">
      {icon}
      <div className={`flex flex-col leading-none ${textClassName}`}>
        {variant === "full" ? (
          <>
            <span className={`text-[0.7rem] font-heading font-light tracking-[0.12em] uppercase ${isDark ? "text-white/70" : "text-muted-foreground/80"}`}>
              Table
            </span>
            <span className={`text-xl font-heading font-extrabold tracking-tight ${isDark ? "text-white" : "bg-gradient-to-r from-[hsl(174,65%,32%)] to-[hsl(174,65%,42%)] bg-clip-text text-transparent"}`}>
              Salt
            </span>
          </>
        ) : (
          <span className="font-heading text-white text-[28px] font-black text-right">
            Table Salt
          </span>
        )}
      </div>
    </div>
  );
}

export { SaltShakerIcon };
