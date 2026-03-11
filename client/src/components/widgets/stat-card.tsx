import { Card, CardContent } from "@/components/ui/card";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { useEffect, useRef } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: number; label: string };
  testId?: string;
  index?: number;
}

function AnimatedCounter({ value }: { value: string | number }) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const numericValue = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value;
  const prefix = typeof value === "string" ? value.match(/^[^0-9.-]*/)?.[0] || "" : "";
  const suffix = typeof value === "string" ? value.match(/[^0-9.-]*$/)?.[0] || "" : "";
  const isNumeric = !isNaN(numericValue) && isFinite(numericValue);

  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (latest) => {
    if (numericValue % 1 !== 0) {
      return latest.toFixed(1);
    }
    return Math.round(latest).toLocaleString();
  });

  useEffect(() => {
    if (!isNumeric) return;
    const controls = animate(motionVal, numericValue, {
      duration: 1.2,
      ease: [0.25, 0.46, 0.45, 0.94],
    });
    return controls.stop;
  }, [numericValue, isNumeric]);

  if (!isNumeric) {
    return <span>{value}</span>;
  }

  return (
    <span>
      {prefix}
      <motion.span ref={nodeRef}>{rounded}</motion.span>
      {suffix}
    </span>
  );
}

const gradientIconStyles: Record<string, string> = {
  "text-primary": "from-red-600/20 to-red-700/10",
  "text-red-700": "from-red-600/20 to-red-700/10",
  "text-green-600": "from-green-500/20 to-emerald-600/10",
  "text-emerald-600": "from-emerald-500/20 to-green-600/10",
  "text-orange-600": "from-orange-500/20 to-orange-600/10",
  "text-red-600": "from-red-500/20 to-rose-600/10",
  "text-purple-600": "from-purple-500/20 to-violet-600/10",
  "text-yellow-600": "from-yellow-500/20 to-orange-600/10",
  "text-slate-600": "from-slate-500/20 to-slate-600/10",
  "text-stone-600": "from-stone-500/20 to-stone-600/10",
};

export function StatCard({ title, value, subtitle, icon: Icon, iconColor = "text-primary", iconBg = "bg-primary/10", trend, testId, index = 0 }: StatCardProps) {
  const gradientBg = gradientIconStyles[iconColor] || "from-primary/20 to-primary/10";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group"
    >
      <Card data-testid={testId} className="transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-primary/5">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold font-heading" data-testid={testId ? `${testId}-value` : undefined}>
                <AnimatedCounter value={value} />
              </p>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
              {trend && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 + index * 0.08 }}
                  className={`flex items-center gap-1 text-xs font-medium ${trend.value >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  <motion.span
                    animate={{ y: trend.value >= 0 ? [0, -2, 0] : [0, 2, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                  >
                    {trend.value >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  </motion.span>
                  <span>{Math.abs(trend.value)}% {trend.label}</span>
                </motion.div>
              )}
            </div>
            <motion.div
              className={`p-3 rounded-xl bg-gradient-to-br ${gradientBg} ring-1 ring-inset ring-black/5 dark:ring-white/5`}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
