import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: number; label: string };
  testId?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, iconColor = "text-primary", iconBg = "bg-primary/10", trend, testId }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card data-testid={testId}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold font-heading" data-testid={testId ? `${testId}-value` : undefined}>{value}</p>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
              {trend && (
                <p className={`text-xs ${trend.value >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
                </p>
              )}
            </div>
            <div className={`p-3 rounded-lg ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
