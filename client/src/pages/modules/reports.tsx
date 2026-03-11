import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/widgets/stat-card";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { DollarSign, ShoppingCart, TrendingUp, Percent, Download } from "lucide-react";
import { format, subDays } from "date-fns";

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));

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
    })),
    [salesByDay]
  );

  const avgOrderValue = totals.orderCount && Number(totals.orderCount) > 0
    ? (Number(totals.revenue || 0) / Number(totals.orderCount)).toFixed(2)
    : "0.00";

  const handleExport = () => {
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
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading" data-testid="text-reports-title">Reports</h1>
          <p className="text-muted-foreground">Sales analytics and performance insights</p>
        </div>
        <Button variant="outline" onClick={handleExport} data-testid="button-export-report">
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
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
        <StatCard
          title="Total Revenue"
          value={`$${Number(totals.revenue || 0).toFixed(2)}`}
          icon={DollarSign}
          iconColor="text-green-600"
          iconBg="bg-green-100"
          testId="stat-total-revenue"
        />
        <StatCard
          title="Total Orders"
          value={Number(totals.orderCount || 0)}
          icon={ShoppingCart}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          testId="stat-total-orders"
        />
        <StatCard
          title="Avg Order Value"
          value={`$${avgOrderValue}`}
          icon={TrendingUp}
          iconColor="text-purple-600"
          iconBg="bg-purple-100"
          testId="stat-avg-order"
        />
        <StatCard
          title="Tax Collected"
          value={`$${Number(totals.tax || 0).toFixed(2)}`}
          icon={Percent}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
          testId="stat-tax-collected"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground" data-testid="text-no-chart-data">
                {isLoading ? "Loading..." : "No data for selected period"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="orders" stroke="hsl(173, 58%, 39%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {isLoading ? "Loading..." : "No data for selected period"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Items</CardTitle>
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
                    <TableRow key={idx} data-testid={`row-top-item-${idx}`}>
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

        <Card>
          <CardHeader>
            <CardTitle>Daily Sales Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                      {isLoading ? "Loading..." : "No data for selected period"}
                    </TableCell>
                  </TableRow>
                ) : (
                  chartData.map((day: any, idx: number) => (
                    <TableRow key={idx} data-testid={`row-daily-sales-${idx}`}>
                      <TableCell>{day.date}</TableCell>
                      <TableCell className="text-right">${day.revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{day.orders}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Discounts Given</p>
              <p className="text-xl font-bold" data-testid="text-discounts-total">${Number(totals.discount || 0).toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}