import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import { useState } from "react";

interface ChartWidgetProps {
  title: string;
  data: any[];
  dataKey: string;
  xKey: string;
  type?: "bar" | "line";
  color?: string;
  height?: number;
  testId?: string;
  index?: number;
}

export function ChartWidget({ title, data, dataKey, xKey, type = "bar", color = "hsl(var(--primary))", height = 300, testId, index = 0 }: ChartWidgetProps) {
  const [isVisible, setIsVisible] = useState(false);
  const gradientId = `gradient-${testId || Math.random().toString(36).slice(2)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      onAnimationComplete={() => setIsVisible(true)}
    >
      <Card data-testid={testId} className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isVisible ? 1 : 0 }}
            transition={{ duration: 0.6 }}
          >
            <ResponsiveContainer width="100%" height={height}>
              {type === "bar" ? (
                <BarChart data={data} barCategoryGap="20%">
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.7} />
                  <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "10px",
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      padding: "8px 12px",
                    }}
                    animationDuration={200}
                  />
                  <Bar
                    dataKey={dataKey}
                    fill={`url(#${gradientId})`}
                    radius={[6, 6, 0, 0]}
                    animationBegin={200}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </BarChart>
              ) : (
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.7} />
                  <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "10px",
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      padding: "8px 12px",
                    }}
                    animationDuration={200}
                  />
                  <Area
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color}
                    strokeWidth={2.5}
                    fill={`url(#${gradientId})`}
                    dot={{ r: 3, fill: color, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                    activeDot={{ r: 5, fill: color, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                    animationBegin={200}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
