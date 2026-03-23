import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/widgets/stat-card";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { DollarSign, ShoppingCart, TrendingUp, Percent, Download, BarChart3, FileText, FileDown, RotateCcw } from "lucide-react";
import { exportToPdf } from "@/lib/pdf-export";
import { format, subDays } from "date-fns";

export default function ReportsPage() {
  const { user } = useAuth();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isExporting, setIsExporting] = useState(false);

  const { data: report, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/sales", fromDate, toDate],
    queryFn: async () => {
      const res = await fetch(`/api/reports/sales?from=${fromDate}&to=${toDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
  });

  const { data: dashboardStats } = useQuery<any>({
    queryKey: ["/api/dashboard"],
  });

  const totals = report?.totals || {};
  const salesByDay = report?.salesByDay || [];
  const topItems = dashboardStats?.topItems || [];

  const chartData = useMemo(() =>
    salesByDay.map((d: any) => ({
      date: d.date ? format(new Date(d.date), "MMM dd") : "",
      revenue: Number(d.revenue || 0),
      orders: Number(d.orderCount || 0),
      refund: Number(d.refund || 0),
      netRevenue: Number(d.netRevenue ?? d.revenue ?? 0),
    })),
    [salesByDay]
  );

  const avgOrderValue = totals.orderCount && Number(totals.orderCount) > 0
    ? (Number(totals.revenue || 0) / Number(totals.orderCount)).toFixed(2)
    : "0.00";

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      const headers = ["Date", "Revenue", "Orders"];
      const rows = chartData.map((d: any) => [d.date, d.revenue.toFixed(2), d.orders]);
      const csv = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales-report-${fromDate}-to-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
    }, 500);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading" data-testid="text-reports-title">Reports</h1>
            <p className="text-muted-foreground">Sales analytics and performance insights</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              onClick={handleExport}
              data-testid="button-export-report"
              disabled={isExporting}
            >
              <motion.div
                animate={isExporting ? { y: [0, 4, 0] } : {}}
                transition={{ repeat: isExporting ? Infinity : 0, duration: 0.6 }}
              >
                <Download className="h-4 w-4 mr-2" />
              </motion.div>
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          </motion.div>
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              data-testid="button-download-pdf-sales"
              onClick={() => {
                const tenantName = user?.tenant?.name || "Restaurant";
                void exportToPdf({
                  title: "Sales Summary Report",
                  restaurantName: tenantName,
                  logoUrl: user?.tenant?.logo ?? null,
                  dateRange: `${fromDate} to ${toDate}`,
                  subtitle: `Total Revenue: ${fmt(Number(totals.revenue || 0))} | Orders: ${Number(totals.orderCount || 0)} | Avg Order: ${fmt(Number(avgOrderValue))}`,
                  columns: ["Date", "Revenue", "Orders"],
                  rows: chartData.map((d: { date: string; revenue: number; orders: number }) => [
                    d.date,
                    fmt(d.revenue),
                    d.orders,
                  ]),
                  filename: `sales-report-${fromDate}-to-${toDate}.pdf`,
                  footerNote: `Tax collected: ${fmt(Number(totals.tax || 0))} | Discounts: ${fmt(Number(totals.discount || 0))}`,
                });
              }}
            >
              <FileDown className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          </motion.div>
        </div>
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label>From</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            data-testid="input-report-from"
          />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            data-testid="input-report-to"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Gross Revenue", value: fmt(Number(totals.revenue || 0)), icon: DollarSign, color: "text-green-600", bg: "bg-green-100", testId: "stat-total-revenue", delay: 0 },
          { title: "Total Orders", value: Number(totals.orderCount || 0), icon: ShoppingCart, color: "text-orange-500", bg: "bg-orange-100", testId: "stat-total-orders", delay: 0.1 },
          { title: "Avg Order Value", value: fmt(Number(avgOrderValue)), icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-100", testId: "stat-avg-order", delay: 0.2 },
          { title: "Tax Collected", value: fmt(Number(totals.tax || 0)), icon: Percent, color: "text-orange-600", bg: "bg-orange-100", testId: "stat-tax-collected", delay: 0.3 },
        ].map((stat) => (
          <motion.div
            key={stat.testId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: stat.delay }}
          >
            <StatCard
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              iconColor={stat.color}
              iconBg={stat.bg}
              testId={stat.testId}
            />
          </motion.div>
        ))}
      </div>

      {(report?.totalRefunded > 0 || report?.netRevenue !== undefined) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <StatCard
              title="Total Refunded"
              value={fmt(Number(report?.totalRefunded || 0))}
              icon={RotateCcw}
              iconColor="text-red-600"
              iconBg="bg-red-100"
              testId="stat-total-refunded"
            />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <StatCard
              title="Refund Count"
              value={Number(report?.refundCount || 0)}
              icon={RotateCcw}
              iconColor="text-amber-600"
              iconBg="bg-amber-100"
              testId="stat-refund-count"
            />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <StatCard
              title="Net Revenue"
              value={fmt(Number(report?.netRevenue || 0))}
              icon={DollarSign}
              iconColor="text-teal-600"
              iconBg="bg-teal-100"
              testId="stat-net-revenue"
            />
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Revenue Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(174, 65%, 32%)" stopOpacity={1} />
                        <stop offset="100%" stopColor="hsl(174, 65%, 32%)" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="url(#revenueGradient)"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1200}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground" data-testid="text-no-chart-data">
                  {isLoading ? "Loading..." : "No data for selected period"}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Orders Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="hsl(12, 75%, 58%)"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "hsl(12, 75%, 58%)" }}
                      activeDot={{ r: 6 }}
                      animationDuration={1500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  {isLoading ? "Loading..." : "No data for selected period"}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                Top Selling Items
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No data available</TableCell>
                    </TableRow>
                  ) : (
                    topItems.map((item: any, idx: number) => (
                      <TableRow key={idx} data-testid={`row-top-item-${idx}`} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-medium">{idx + 1}</TableCell>
                        <TableCell data-testid={`text-top-item-name-${idx}`}>{item.name}</TableCell>
                        <TableCell className="text-right" data-testid={`text-top-item-qty-${idx}`}>{Number(item.totalQty || 0)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Daily Sales Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Gross Revenue</TableHead>
                    <TableHead className="text-right text-red-600">Refunds</TableHead>
                    <TableHead className="text-right text-teal-700">Net Revenue</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chartData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                        {isLoading ? "Loading..." : "No data for selected period"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    chartData.map((day: any, idx: number) => (
                      <TableRow key={idx} data-testid={`row-daily-sales-${idx}`} className="hover:bg-muted/50 transition-colors">
                        <TableCell>{day.date}</TableCell>
                        <TableCell className="text-right">{fmt(day.revenue)}</TableCell>
                        <TableCell className="text-right text-red-600" data-testid={`text-day-refund-${idx}`}>
                          {day.refund > 0 ? `-${fmt(day.refund)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right text-teal-700 font-medium" data-testid={`text-day-net-${idx}`}>
                          {fmt(day.netRevenue ?? day.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{day.orders}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                  <Percent className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Discounts Given</p>
                  <p className="text-xl font-bold" data-testid="text-discounts-total">{fmt(Number(totals.discount || 0))}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
