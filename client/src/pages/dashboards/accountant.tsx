import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/widgets/stat-card";
import { ChartWidget } from "@/components/widgets/chart-widget";
import { DollarSign, Receipt, Percent, Download, TrendingUp, Wallet, PiggyBank, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function AccountantDashboard() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [isExporting, setIsExporting] = useState(false);

  const { data: salesReport, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/sales", `?from=${fromDate}&to=${toDate}`],
    queryFn: async () => {
      const res = await fetch(`/api/reports/sales?from=${fromDate}&to=${toDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const totals = salesReport?.totals || {};
  const revenue = Number(totals.revenue || 0);
  const tax = Number(totals.tax || 0);
  const discount = Number(totals.discount || 0);
  const orderCount = Number(totals.orderCount || 0);

  const chartData = (salesReport?.salesByDay || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    revenue: Number(d.revenue || 0),
  }));

  const handleExport = () => {
    setIsExporting(true);
    const rows = [
      ["Date", "Revenue", "Orders"],
      ...(salesReport?.salesByDay || []).map((d: any) => [d.date, d.revenue, d.orderCount]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-report-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setIsExporting(false), 1500);
  };

  return (
    <motion.div
      className="space-y-6"
      data-testid="dashboard-accountant"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeUp} className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <motion.div
            className="p-2.5 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-600/5 ring-1 ring-green-500/10"
            whileHover={{ rotate: 10, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            <Wallet className="h-5 w-5 text-green-600" />
          </motion.div>
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="text-dashboard-title">Accountant Dashboard</h1>
            <p className="text-muted-foreground">Financial overview and reporting</p>
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button variant="secondary" onClick={handleExport} data-testid="btn-export" className="gap-2">
            <motion.div
              animate={isExporting ? { y: [0, 4, 0] } : {}}
              transition={{ duration: 0.6, repeat: isExporting ? 2 : 0 }}
            >
              <Download className="h-4 w-4" />
            </motion.div>
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </motion.div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card data-testid="card-date-range" className="overflow-hidden">
          <CardContent className="p-4 flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2 mr-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Date Range</span>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
                data-testid="input-from-date"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
                data-testid="input-to-date"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">Financial Summary</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Revenue"
            value={`$${revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            subtitle={`${orderCount} orders`}
            icon={DollarSign}
            iconColor="text-green-600"
            iconBg="bg-green-100"
            testId="stat-total-revenue"
            index={0}
          />
          <StatCard
            title="Orders"
            value={orderCount}
            icon={Receipt}
            iconColor="text-orange-500"
            iconBg="bg-orange-100"
            testId="stat-total-orders"
            index={1}
          />
          <StatCard
            title="Taxes Collected"
            value={`$${tax.toFixed(2)}`}
            icon={PiggyBank}
            iconColor="text-purple-600"
            iconBg="bg-purple-100"
            testId="stat-taxes"
            index={2}
          />
          <StatCard
            title="Discounts Given"
            value={`$${discount.toFixed(2)}`}
            icon={Percent}
            iconColor="text-orange-600"
            iconBg="bg-orange-100"
            testId="stat-discounts"
            index={3}
          />
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-muted-foreground">Revenue Trend</h2>
        </div>
        <ChartWidget
          title="Revenue Over Time"
          data={chartData}
          dataKey="revenue"
          xKey="date"
          type="line"
          testId="chart-revenue"
        />
      </motion.div>
    </motion.div>
  );
}
