import { PageTitle } from "@/lib/accessibility";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Clock, DollarSign, TrendingUp, AlertTriangle, Download, Settings, BarChart3, Target, Timer } from "lucide-react";

interface DashboardData {
  kpis: { totalScheduledHours: number; totalActualHours: number; totalScheduledCost: number; totalActualCost: number; totalOvertimeHours: number; totalOvertimeCost: number; totalSales: number; labourPct: number; salesPerLabourHour: number; labourTargetPct: number; headcount: number };
  byRole: Array<{ role: string; scheduledHours: number; actualHours: number; scheduledCost: number; actualCost: number; headcount: number }>;
  byOutlet: Array<{ outletId: string; name: string; scheduledHours: number; actualHours: number; scheduledCost: number; actualCost: number; sales: number; labourPct: number; headcount: number }>;
  byDay: Array<{ date: string; scheduledCost: number; actualCost: number; sales: number; labourPct: number }>;
  byHour: Array<{ hour: number; label: string; scheduledCost: number; actualCost: number; sales: number; labourPct: number }>;
  period: string;
}
interface TimesheetData { rows: Array<{ userId: string; name: string; role: string; hourlyRate: number; scheduledHours: number; actualHours: number; overtimeHours: number; scheduledCost: number; actualCost: number; variance: number; shiftsScheduled: number; shiftsWorked: number }>; from: string; to: string; }
interface AlertsData { labourTargetPct: number; costAlerts: Array<{ date: string; labourCost: number; sales: number; labourPct: number; target: number; severity: string }>; overtimeAlerts: Array<{ date: string; userId: string; name: string; hours: number; overtimeHours: number }> }

export default function WorkforcePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("week");
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [targetPct, setTargetPct] = useState("30");

  const fmt = (amount: string | number) => {
    if (!user) return String(amount);
    const u = user as unknown as Record<string, unknown>;
    const tenant = (u.tenant || {}) as Record<string, unknown>;
    const pos = String(tenant.currencyPosition || "before");
    return sharedFormatCurrency(amount, String(tenant.currency || "USD"), { position: pos as "before" | "after", decimals: parseInt(String(tenant.currencyDecimals ?? "2")) });
  };

  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ["/api/workforce/dashboard", period],
    queryFn: () => apiRequest("GET", `/api/workforce/dashboard?period=${period}`).then(r => r.json()),
  });
  const { data: timesheet } = useQuery<TimesheetData>({ queryKey: ["/api/workforce/timesheet"] });
  const { data: alerts } = useQuery<AlertsData>({ queryKey: ["/api/workforce/alerts"] });

  const settingsMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("PATCH", "/api/workforce/settings", data).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workforce/dashboard"] }); queryClient.invalidateQueries({ queryKey: ["/api/workforce/alerts"] }); setSettingsDialog(false); toast({ title: "Settings updated" }); },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const downloadCSV = () => {
    window.open("/api/workforce/timesheet/csv", "_blank");
  };

  const kpis = dashboard?.kpis;
  const isOverTarget = kpis && kpis.labourPct > kpis.labourTargetPct;
  const maxDayCost = dashboard ? Math.max(...dashboard.byDay.map(d => Math.max(d.actualCost, d.scheduledCost, d.sales * 0.01)), 1) : 1;

  return (
    <div className="p-6 space-y-6" data-testid="workforce-page">
      <PageTitle title="Workforce" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Workforce & Labour Cost</h1>
            <p className="text-sm text-muted-foreground">Labour analytics, cost control, and timesheets</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32" data-testid="select-period"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          {user?.role === "owner" && <Button variant="outline" size="sm" onClick={() => { setTargetPct(String(kpis?.labourTargetPct || 30)); setSettingsDialog(true); }} data-testid="button-settings"><Settings className="h-4 w-4 mr-1" />Settings</Button>}
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Scheduled Hours</span></div><p className="text-xl font-bold" data-testid="text-scheduled-hours">{kpis.totalScheduledHours}h</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Timer className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Actual Hours</span></div><p className="text-xl font-bold" data-testid="text-actual-hours">{kpis.totalActualHours}h</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Labour Cost</span></div><p className="text-xl font-bold" data-testid="text-labour-cost">{fmt(kpis.totalActualCost)}</p></CardContent></Card>
          <Card className={isOverTarget ? "border-red-300 bg-red-50/50" : ""}><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><Target className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Labour %</span></div><p className={`text-xl font-bold ${isOverTarget ? "text-red-600" : "text-green-600"}`} data-testid="text-labour-pct">{kpis.labourPct}%</p><p className="text-xs text-muted-foreground">Target: {kpis.labourTargetPct}%</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Sales / Labour Hr</span></div><p className="text-xl font-bold" data-testid="text-sales-per-hour">{fmt(kpis.salesPerLabourHour)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Overtime</span></div><p className="text-xl font-bold" data-testid="text-overtime">{kpis.totalOvertimeHours}h</p><p className="text-xs text-muted-foreground">{fmt(kpis.totalOvertimeCost)}</p></CardContent></Card>
        </div>
      )}

      {alerts && alerts.costAlerts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="font-semibold text-amber-800">Labour Cost Alerts</span>
            </div>
            <div className="space-y-1">
              {alerts.costAlerts.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-sm" data-testid={`alert-${i}`}>
                  <Badge className={a.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>{a.severity}</Badge>
                  <span>{a.date}: Labour {a.labourPct}% (target {a.target}%)</span>
                  <span className="text-muted-foreground">Cost: {fmt(a.labourCost)} / Sales: {fmt(a.sales)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="by-hour" data-testid="tab-by-hour">By Hour</TabsTrigger>
          <TabsTrigger value="by-role" data-testid="tab-by-role">By Role</TabsTrigger>
          <TabsTrigger value="by-outlet" data-testid="tab-by-outlet">By Outlet</TabsTrigger>
          <TabsTrigger value="timesheet" data-testid="tab-timesheet">Timesheet</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {dashboard && dashboard.byDay.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" />Daily Labour Cost vs Sales</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboard.byDay.map((d, i) => {
                    const maxVal = Math.max(...dashboard.byDay.map(dd => Math.max(dd.actualCost, dd.sales)), 1);
                    return (
                      <div key={i} data-testid={`day-row-${i}`}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium">{new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                          <span className={d.labourPct > (kpis?.labourTargetPct || 30) ? "text-red-600 font-semibold" : "text-green-600"}>{d.labourPct}%</span>
                        </div>
                        <div className="flex gap-1 h-4">
                          <div className="bg-blue-400 rounded-sm h-full" style={{ width: `${(d.actualCost / maxVal) * 100}%` }} title={`Labour: ${fmt(d.actualCost)}`} />
                          <div className="bg-green-300 rounded-sm h-full" style={{ width: `${(d.sales / maxVal) * 100}%` }} title={`Sales: ${fmt(d.sales)}`} />
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-sm inline-block" />Labour: {fmt(d.actualCost)}</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-300 rounded-sm inline-block" />Sales: {fmt(d.sales)}</span>
                          {d.scheduledCost > 0 && <span>Scheduled: {fmt(d.scheduledCost)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {alerts && alerts.overtimeAlerts.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Timer className="h-5 w-5" />Overtime Log</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Staff</TableHead><TableHead className="text-right">Total Hours</TableHead><TableHead className="text-right">Overtime</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {alerts.overtimeAlerts.map((a, i) => (
                      <TableRow key={i} data-testid={`overtime-row-${i}`}>
                        <TableCell>{a.date}</TableCell>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-right">{a.hours.toFixed(1)}h</TableCell>
                        <TableCell className="text-right text-amber-600 font-semibold">{a.overtimeHours.toFixed(1)}h</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="by-hour" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5" />Hourly Labour Cost Breakdown</CardTitle></CardHeader>
            <CardContent>
              {dashboard && dashboard.byHour.length > 0 ? (
                <div className="space-y-2">
                  {dashboard.byHour.map((h, i) => {
                    const maxVal = Math.max(...dashboard.byHour.map(hh => Math.max(hh.actualCost, hh.scheduledCost, hh.sales)), 1);
                    return (
                      <div key={i} data-testid={`hour-row-${i}`}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="font-medium w-12">{h.label}</span>
                          <div className="flex gap-4">
                            <span>Labour: {fmt(h.actualCost)}</span>
                            <span>Sales: {fmt(h.sales)}</span>
                            <span className={h.labourPct > (kpis?.labourTargetPct || 30) ? "text-red-600 font-semibold" : "text-green-600"}>
                              {h.labourPct}%
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 h-3">
                          <div className="bg-blue-400 rounded-sm h-full" style={{ width: `${(h.actualCost / maxVal) * 100}%` }} title={`Labour: ${fmt(h.actualCost)}`} />
                          <div className="bg-green-300 rounded-sm h-full" style={{ width: `${(h.sales / maxVal) * 100}%` }} title={`Sales: ${fmt(h.sales)}`} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-6 text-xs text-muted-foreground mt-3 pt-2 border-t">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-sm inline-block" />Actual Labour Cost</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-300 rounded-sm inline-block" />Sales Revenue</span>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">No hourly data for selected period</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-role" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Labour Cost by Role</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Headcount</TableHead>
                    <TableHead className="text-right">Scheduled Hours</TableHead>
                    <TableHead className="text-right">Actual Hours</TableHead>
                    <TableHead className="text-right">Scheduled Cost</TableHead>
                    <TableHead className="text-right">Actual Cost</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard?.byRole.map((r, i) => (
                    <TableRow key={i} data-testid={`role-row-${i}`}>
                      <TableCell className="font-medium capitalize">{r.role}</TableCell>
                      <TableCell className="text-right">{r.headcount}</TableCell>
                      <TableCell className="text-right">{r.scheduledHours}h</TableCell>
                      <TableCell className="text-right">{r.actualHours}h</TableCell>
                      <TableCell className="text-right">{fmt(r.scheduledCost)}</TableCell>
                      <TableCell className="text-right">{fmt(r.actualCost)}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.actualCost > r.scheduledCost ? "text-red-500" : "text-green-500"}`}>{r.actualCost > r.scheduledCost ? "+" : ""}{fmt((r.actualCost - r.scheduledCost).toFixed(2))}</TableCell>
                    </TableRow>
                  ))}
                  {(!dashboard?.byRole || dashboard.byRole.length === 0) && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4">No data for selected period</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-outlet" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Labour Cost by Outlet</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead className="text-right">Headcount</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Labour Cost</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Labour %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard?.byOutlet.map((o, i) => (
                    <TableRow key={i} data-testid={`outlet-row-${i}`}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell className="text-right">{o.headcount}</TableCell>
                      <TableCell className="text-right">{o.actualHours}h</TableCell>
                      <TableCell className="text-right">{fmt(o.actualCost)}</TableCell>
                      <TableCell className="text-right">{fmt(o.sales)}</TableCell>
                      <TableCell className={`text-right font-semibold ${o.labourPct > (kpis?.labourTargetPct || 30) ? "text-red-600" : "text-green-600"}`}>{o.labourPct}%</TableCell>
                    </TableRow>
                  ))}
                  {(!dashboard?.byOutlet || dashboard.byOutlet.length === 0) && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No data for selected period</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timesheet" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Timesheet Summary</CardTitle>
                <Button variant="outline" size="sm" onClick={downloadCSV} data-testid="button-download-csv"><Download className="h-4 w-4 mr-1" />Export CSV</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Rate/hr</TableHead>
                    <TableHead className="text-right">Scheduled</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Overtime</TableHead>
                    <TableHead className="text-right">Sched. Cost</TableHead>
                    <TableHead className="text-right">Actual Cost</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheet?.rows.map((r, i) => (
                    <TableRow key={i} data-testid={`timesheet-row-${i}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="capitalize">{r.role}</TableCell>
                      <TableCell className="text-right">{fmt(r.hourlyRate)}</TableCell>
                      <TableCell className="text-right">{r.scheduledHours}h</TableCell>
                      <TableCell className="text-right">{r.actualHours}h</TableCell>
                      <TableCell className="text-right">{r.overtimeHours > 0 ? <span className="text-amber-600">{r.overtimeHours}h</span> : "—"}</TableCell>
                      <TableCell className="text-right">{fmt(r.scheduledCost)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.actualCost)}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.variance > 0 ? "text-red-500" : r.variance < 0 ? "text-green-500" : ""}`}>{r.variance > 0 ? "+" : ""}{fmt(r.variance)}</TableCell>
                    </TableRow>
                  ))}
                  {(!timesheet?.rows || timesheet.rows.length === 0) && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-4">No timesheet data</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Workforce Settings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Labour Cost Target (%)</Label>
              <p className="text-xs text-muted-foreground mb-2">Alert when labour cost exceeds this percentage of sales</p>
              <Input type="number" step="0.5" min="0" max="100" value={targetPct} onChange={e => setTargetPct(e.target.value)} data-testid="input-target-pct" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialog(false)}>Cancel</Button>
            <Button onClick={() => settingsMut.mutate({ labourTargetPct: targetPct })} data-testid="button-save-settings">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
