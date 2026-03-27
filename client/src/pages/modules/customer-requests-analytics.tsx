import { PageTitle } from "@/lib/accessibility";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Bell, TrendingUp, Star, Clock, AlertTriangle, Users, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface AnalyticsData {
  totalRequests: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  avgResponseMinutes: number | null;
  avgFeedbackRating: number | null;
  byTable: { tableNumber: number | null; count: number }[];
  byHour: Record<string, number>;
  byDay: Record<string, number>;
  byStaff: { name: string; count: number; avgResponseMinutes: number | null }[];
  feedbackByRating: Record<string, number>;
  completionRate: number;
  feedbackByDay?: Record<string, { count: number; total: number }>;
}

const TYPE_LABELS: Record<string, string> = {
  call_server: "Call Waiter",
  request_bill: "Request Bill",
  water_refill: "Water Refill",
  cleaning: "Cleaning",
  order_food: "Order Food",
  feedback: "Feedback",
  other: "Other",
};

const COLORS = ["#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#84cc16", "#6b7280"];

function StatCard({ title, value, icon: Icon, color = "text-primary" }: {
  title: string; value: string | number; icon: React.ElementType; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
          <Icon className={`h-5 w-5 ${color} opacity-70`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function CustomerRequestsAnalytics() {
  const { t } = useTranslation("modules");
  const [range, setRange] = useState("7d");
  const [ratingAggregation, setRatingAggregation] = useState<"day" | "week" | "month">("day");

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/table-requests/analytics", range],
    queryFn: async () => {
      const params = new URLSearchParams();
      const now = new Date();
      if (range === "1d") {
        params.set("from", new Date(now.getTime() - 86400000).toISOString());
      } else if (range === "7d") {
        params.set("from", new Date(now.getTime() - 7 * 86400000).toISOString());
      } else if (range === "30d") {
        params.set("from", new Date(now.getTime() - 30 * 86400000).toISOString());
      }
      const res = await fetch(`/api/table-requests/analytics?${params}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <AlertTriangle className="h-5 w-5 mr-2" />Failed to load analytics
      </div>
    );
  }

  const typeChartData = Object.entries(data.byType ?? {})
    .map(([type, count]) => ({ name: TYPE_LABELS[type] ?? type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const hourChartData = Object.entries(data.byHour ?? {})
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  const ratingData = Object.entries(data.feedbackByRating ?? {})
    .map(([rating, count]) => ({ name: `${rating}★`, count }));

  const tableHeatmap = (data.byTable ?? [])
    .filter(t => t.tableNumber !== null)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const pieData = Object.entries(data.byType ?? {})
    .map(([type, count]) => ({ name: TYPE_LABELS[type] ?? type, value: count }))
    .filter(d => d.value > 0);

  const dayTrendData = Object.entries(data.byDay ?? {})
    .map(([date, count]) => ({ date: date.slice(5), count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const ratingTrendData = (() => {
    const rawEntries = Object.entries(data.feedbackByDay ?? {});
    if (ratingAggregation === "day") {
      return rawEntries
        .map(([date, v]) => ({
          date: date.slice(5),
          avg: v.count > 0 ? Math.round((v.total / v.count) * 10) / 10 : null,
        }))
        .filter(d => d.avg !== null)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    const buckets: Record<string, { count: number; total: number }> = {};
    for (const [date, v] of rawEntries) {
      const d = new Date(date);
      let key: string;
      if (ratingAggregation === "week") {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = startOfWeek.toISOString().slice(0, 10);
      } else {
        key = date.slice(0, 7);
      }
      if (!buckets[key]) buckets[key] = { count: 0, total: 0 };
      buckets[key].count += v.count;
      buckets[key].total += v.total;
    }
    return Object.entries(buckets)
      .map(([key, v]) => ({
        date: key.slice(5),
        avg: v.count > 0 ? Math.round((v.total / v.count) * 10) / 10 : null,
      }))
      .filter(d => d.avg !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  })();

  const COMPLAINT_TYPES = ["cleaning", "other", "feedback"];
  const complaintDonutData = Object.entries(data.byType ?? {})
    .filter(([type]) => COMPLAINT_TYPES.includes(type))
    .map(([type, count]) => ({ name: TYPE_LABELS[type] ?? type, value: count }))
    .filter(d => d.value > 0);

  return (
    <div className="space-y-6" data-testid="customer-requests-analytics">
      <PageTitle title="Customer Analytics" />
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />Customer Requests Analytics
          </h2>
          <p className="text-sm text-muted-foreground">Service request patterns and response metrics</p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-32 h-8 text-xs" data-testid="analytics-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total Requests" value={data.totalRequests ?? 0} icon={Bell} color="text-primary" />
        <StatCard
          title="Avg Response Time"
          value={data.avgResponseMinutes != null ? `${data.avgResponseMinutes}m` : "—"}
          icon={Clock}
          color="text-blue-600"
        />
        <StatCard
          title="Avg Feedback Rating"
          value={data.avgFeedbackRating != null ? `${data.avgFeedbackRating.toFixed(1)} ★` : "—"}
          icon={Star}
          color="text-yellow-600"
        />
        <StatCard
          title="Completion Rate"
          value={data.completionRate != null ? `${Math.round(data.completionRate)}%` : "—"}
          icon={TrendingUp}
          color="text-green-600"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-by-type">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Request Types</CardTitle>
          </CardHeader>
          <CardContent>
            {typeChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={typeChartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(174, 65%, 32%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="chart-by-hour">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Requests by Hour</CardTitle>
          </CardHeader>
          <CardContent>
            {hourChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourChartData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card data-testid="chart-pie-type">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Request Mix</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            {pieData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false} fontSize={10}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="chart-feedback-rating">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Feedback Ratings</CardTitle>
          </CardHeader>
          <CardContent>
            {ratingData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No feedback yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ratingData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#eab308" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card data-testid="chart-table-heatmap">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Table Request Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            {tableHeatmap.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No data</p>
            ) : (
              <div className="space-y-2">
                {tableHeatmap.map((t, i) => {
                  const max = tableHeatmap[0]?.count ?? 1;
                  const pct = Math.round((t.count / max) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2" data-testid={`heatmap-row-${t.tableNumber}`}>
                      <span className="text-xs w-14 text-muted-foreground shrink-0">Table {t.tableNumber}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded h-4 overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${pct}%`, background: "hsl(174, 65%, 32%)" }} />
                      </div>
                      <span className="text-xs w-6 text-right shrink-0">{t.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {dayTrendData.length > 1 && (
          <Card data-testid="chart-daily-trend">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Daily Request Volume</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dayTrendData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(174, 65%, 32%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card data-testid="chart-rating-trend">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Avg Feedback Rating Trend</CardTitle>
              <Select value={ratingAggregation} onValueChange={v => setRatingAggregation(v as "day" | "week" | "month")}>
                <SelectTrigger className="h-7 w-24 text-xs" data-testid="select-rating-aggregation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {ratingTrendData.length < 2 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Not enough feedback data to show trend</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={ratingTrendData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {complaintDonutData.length > 0 && (
          <Card data-testid="chart-complaint-categories">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Complaint & Feedback Categories</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={complaintDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                    labelLine={false}
                    fontSize={10}
                  >
                    {complaintDonutData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={10} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {data.byStaff && data.byStaff.length > 0 && (
        <Card data-testid="staff-response-table">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />Staff Response Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 font-medium">Staff Member</th>
                    <th className="text-right py-2 font-medium">Requests Handled</th>
                    <th className="text-right py-2 font-medium">Avg Response</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byStaff.map((s, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2">{s.name}</td>
                      <td className="py-2 text-right font-medium">{s.count}</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {s.avgResponseMinutes != null ? `${s.avgResponseMinutes}m` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
