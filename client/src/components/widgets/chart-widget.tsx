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
} from "recharts";

interface ChartWidgetProps {
  title: string;
  data: any[];
  dataKey: string;
  xKey: string;
  type?: "bar" | "line";
  color?: string;
  height?: number;
  testId?: string;
}

export function ChartWidget({ title, data, dataKey, xKey, type = "bar", color = "hsl(var(--primary))", height = 300, testId }: ChartWidgetProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card data-testid={testId}>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={height}>
            {type === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
