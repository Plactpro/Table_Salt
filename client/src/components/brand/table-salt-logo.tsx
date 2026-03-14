import { motion } from "framer-motion";

interface TableSaltLogoProps {
  variant?: "full" | "compact" | "icon";
  className?: string;
  animate?: boolean;
  iconSize?: number;
  textClassName?: string;
}

function SaltShakerIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="18" y="18" width="28" height="32" rx="6" fill="url(#teal-grad)" />
      <rect x="22" y="10" width="20" height="10" rx="3" fill="url(#teal-dark)" />
      <rect x="24" y="6" width="16" height="6" rx="2" fill="hsl(174,65%,32%)" opacity="0.7" />
      <circle cx="28" cy="14" r="1.2" fill="white" opacity="0.6" />
      <circle cx="32" cy="13" r="1.2" fill="white" opacity="0.6" />
      <circle cx="36" cy="14" r="1.2" fill="white" opacity="0.6" />
      <circle cx="26" cy="54" r="2" fill="#FFD700" opacity="0.9" />
      <circle cx="32" cy="58" r="1.8" fill="#FFD700" opacity="0.7" />
      <circle cx="38" cy="55" r="1.5" fill="#FFD700" opacity="0.8" />
      <circle cx="30" cy="61" r="1.2" fill="#FFD700" opacity="0.5" />
      <circle cx="35" cy="62" r="1" fill="#FFD700" opacity="0.4" />
      <defs>
        <linearGradient id="teal-grad" x1="18" y1="18" x2="46" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(174,65%,38%)" />
          <stop offset="1" stopColor="hsl(174,65%,28%)" />
        </linearGradient>
        <linearGradient id="teal-dark" x1="22" y1="10" x2="42" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(174,55%,35%)" />
          <stop offset="1" stopColor="hsl(174,65%,25%)" />
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
}: TableSaltLogoProps) {
  const defaultIconSize = variant === "full" ? 36 : variant === "compact" ? 28 : 32;
  const size = iconSize || defaultIconSize;

  const icon = animate ? (
    <motion.div
      animate={{ rotate: [0, -3, 3, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <SaltShakerIcon size={size} />
    </motion.div>
  ) : (
    <SaltShakerIcon size={size} />
  );

  if (variant === "icon") {
    return <div className={`inline-flex items-center justify-center ${className}`}>{icon}</div>;
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} data-testid="logo-table-salt">
      {icon}
      <div className={`flex flex-col leading-none ${textClassName}`}>
        {variant === "full" ? (
          <>
            <span className="text-[0.7rem] font-heading font-light tracking-[0.12em] uppercase text-muted-foreground/80">
              Table
            </span>
            <span className="text-xl font-heading font-extrabold tracking-tight bg-gradient-to-r from-[hsl(174,65%,32%)] to-[hsl(174,65%,42%)] bg-clip-text text-transparent">
              Salt
            </span>
          </>
        ) : (
          <span className="text-sm font-heading font-bold bg-gradient-to-r from-[hsl(174,65%,32%)] to-[hsl(174,65%,42%)] bg-clip-text text-transparent">
            Table Salt
          </span>
        )}
      </div>
    </div>
  );
}

export { SaltShakerIcon };
